import fs from 'fs'
import path from 'path'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import fetch from 'node-fetch'
import dotenv from 'dotenv'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load env from server dir and root
dotenv.config()
const rootEnv = path.resolve(__dirname, '../../../.env')
if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv })

const app = express()
const port = process.env.PORT || 4000

app.use(cors({ origin: ['http://localhost:5173'], credentials: true }))
app.use(express.json({ limit: '20mb' }))

const TMP_ROOT = path.join(__dirname, '../.tmp')
fs.mkdirSync(TMP_ROOT, { recursive: true })
const upload = multer({ dest: TMP_ROOT })

// ===== Auth (AAD access token validation) =====
// NOTE: In multi-tenant mode, do NOT tie validation to a single tenant.
// We use the 'organizations' JWKS and validate issuer pattern + allowed tenant list.
const applicationIdUri = process.env.APPLICATION_ID_URI
const scopeName = process.env.SCOPE_NAME || 'access_as_user'

// Optional allow-list of tenants (comma-separated TIDs). If empty, accept any org tenant.
const allowedTenants = (process.env.ALLOWED_TENANTS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

// Multi-tenant JWKS across organizational tenants
const jwks = createRemoteJWKSet(
  new URL('https://login.microsoftonline.com/organizations/discovery/v2.0/keys')
)

async function validateAADToken(token) {
  // First verify signature & basic token structure
  const { payload } = await jwtVerify(token, jwks, {
    // Do not set a fixed 'issuer' here; we'll validate it manually to support multi-tenant.
  })

  // 1) Issuer must be a v2.0 AAD issuer for some tenant (tid)
  const iss = payload.iss || ''
  const tid = payload.tid || ''
  if (!/^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]+\/v2\.0$/.test(iss)) {
    throw new Error('Invalid issuer')
  }
  if (!tid) {
    throw new Error('Missing tid (tenant id)')
  }
  if (allowedTenants.length && !allowedTenants.includes(tid)) {
    throw new Error('Tenant not allowed')
  }

  // 2) Audience must be *your* API (Application ID URI)
  if (payload.aud !== applicationIdUri) {
    throw new Error(`Invalid audience: expected ${applicationIdUri}`)
  }

  // 3) Must include required delegated scope
  const scp = (payload.scp || '').split(' ').filter(Boolean)
  if (!scp.includes(scopeName)) {
    throw new Error(`Missing required scope: ${scopeName}`)
  }

  return payload
}

function requireAuth(req, res, next) {
  if (process.env.SKIP_AUTH === 'true') return next()
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) return res.status(401).json({ message: 'Missing bearer token' })
  validateAADToken(token)
    .then(() => next())
    .catch(err => {
      console.error('Auth error:', err.message)
      res.status(401).json({ message: 'Unauthorized' })
    })
}

// ===== OCR with Azure Document Intelligence =====
const AZ_EP = process.env.AZURE_DOC_INTELLIGENCE_ENDPOINT
const AZ_KEY = process.env.AZURE_DOC_INTELLIGENCE_KEY

async function analyzeReceipt(filePath) {
  if (!AZ_EP || !AZ_KEY) {
    // Fallback mock
    return {
      vendor: 'Demo Store',
      total: '12.34',
      transactionDate: new Date().toISOString().slice(0, 10)
    }
  }
  const url = `${AZ_EP}/formrecognizer/documentModels/prebuilt-receipt:analyze?api-version=2023-07-31`
  const body = fs.readFileSync(filePath)
  const start = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZ_KEY,
      'Content-Type': 'application/octet-stream'
    },
    body
  })
  if (start.status !== 202) {
    const text = await start.text()
    throw new Error(`Analyze start failed: ${start.status} ${text}`)
  }
  const op = start.headers.get('operation-location')
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 1500))
    const res = await fetch(op, { headers: { 'Ocp-Apim-Subscription-Key': AZ_KEY } })
    const j = await res.json()
    if (j.status === 'succeeded') {
      try {
        const doc = j?.analyzeResult?.documents?.[0]
        const f = doc.fields || {}
        return {
          vendor: f?.MerchantName?.content || f?.VendorName?.content || '',
          total: f?.Total?.content || '',
          transactionDate: f?.TransactionDate?.content || ''
        }
      } catch {
        return { vendor: '', total: '', transactionDate: '' }
      }
    }
  }
  throw new Error('Analyze timed out')
}

// ===== Graph helpers (app-only, client credentials) =====
// IMPORTANT: For Graph CC flow, we still use your HOME tenant ID.
async function getGraphToken() {
  const TENANT_ID = process.env.TENANT_ID
  const CLIENT_ID = process.env.CLIENT_ID
  const CLIENT_SECRET = process.env.CLIENT_SECRET
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) return null
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  })
  const r = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  )
  const j = await r.json()
  return j.access_token
}

async function createListItem(graphToken, fields) {
  const SITE_ID = process.env.SITE_ID
  const LIST_ID = process.env.LIST_ID
  if (!graphToken || !SITE_ID || !LIST_ID) return { id: `mock-${Date.now()}` }
  const r = await fetch(`https://graph.microsoft.com/v1.0/sites/${SITE_ID}/lists/${LIST_ID}/items`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${graphToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`Create item failed: ${r.status} ${t}`)
  }
  return r.json()
}

async function uploadAttachment(graphToken, itemId, name, filePath) {
  const SITE_ID = process.env.SITE_ID
  const LIST_ID = process.env.LIST_ID
  if (!graphToken || !SITE_ID || !LIST_ID) return { name }
  const b = fs.readFileSync(filePath)
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/lists/${LIST_ID}/items/${itemId}/driveItem/children/${encodeURIComponent(
      name
    )}:/content`,
    { method: 'PUT', headers: { Authorization: `Bearer ${graphToken}` }, body: b }
  )
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`Attach failed: ${r.status} ${t}`)
  }
  return r.json()
}

// ===== Routes =====
app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.post('/api/upload', requireAuth, upload.array('files'), async (req, res) => {
  try {
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const batchDir = path.join(TMP_ROOT, batchId)
    fs.mkdirSync(batchDir, { recursive: true })
    const results = []
    for (const f of req.files || []) {
      const data = await analyzeReceipt(f.path)
      const dest = path.join(batchDir, f.originalname)
      fs.renameSync(f.path, dest)
      results.push({ file: f.originalname, data })
    }
    const fields = results[0]?.data || {}
    res.json({ results, fields, batchId })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

app.post('/api/submit', requireAuth, async (req, res) => {
  try {
    const { fields, signatureDataUrl, batchId } = req.body || {}
    const token = await getGraphToken()
    const item = await createListItem(token, fields || {})
    const itemId = item?.id || item?.value?.id || item?.name || `mock-${Date.now()}`

    if (batchId) {
      const batchDir = path.join(TMP_ROOT, batchId)
      if (fs.existsSync(batchDir)) {
        const files = fs.readdirSync(batchDir)
        for (const name of files) {
          await uploadAttachment(token, itemId, name, path.join(batchDir, name))
        }
        for (const name of files) fs.unlinkSync(path.join(batchDir, name))
        fs.rmdirSync(batchDir)
      }
    }

    if (signatureDataUrl?.startsWith('data:image/png;base64,')) {
      const m = signatureDataUrl.match(/^data:image\/png;base64,(.+)$/)
      if (m) {
        const tmp = path.join(TMP_ROOT, `sig-${Date.now()}.png`)
        fs.writeFileSync(tmp, Buffer.from(m[1], 'base64'))
        await uploadAttachment(token, itemId, 'signature.png', tmp)
        fs.unlinkSync(tmp)
      }
    }

    res.json({ ok: true, itemId })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

app.listen(port, () => console.log(`API listening on :${port}`))
