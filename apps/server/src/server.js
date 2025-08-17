import fs, { promises as fsp } from "fs";
import os from "os";
import path from "path";
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";
import crypto from "crypto";

// Import our secure upload middleware
import { secureUpload, handleUploadErrors } from "./middleware/secureUpload.js";
import { OCRService } from "./services/ocrService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from server dir and root
dotenv.config();
const rootEnv = path.resolve(__dirname, "../../../.env");
if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv });

// Environment variable validation
const requiredEnvVars = [
  "TENANT_ID",
  "CLIENT_ID",
  "CLIENT_SECRET",
  "APPLICATION_ID_URI",
]

if (process.env.NODE_ENV !== "test") {
  const missingVars = requiredEnvVars.filter((varName) => !process.env[varName])
  if (missingVars.length > 0) {
    console.error("Missing required environment variables:", missingVars)
    console.error("Please check your .env file configuration")
    if (process.env.NODE_ENV === "production") {
      process.exit(1)
    }
  }
}

const app = express();
const port = process.env.PORT || 4000;

// SECURITY: Rate limiting middleware
// Global rate limiter with configurable limits
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.GLOBAL_RATE_LIMIT) || 100,
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  // Add IP forwarding for Vercel/proxy environments
  trustProxy: process.env.NODE_ENV === "production",
})

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.UPLOAD_RATE_LIMIT) || 10,
  message: { error: "Too many upload attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: process.env.NODE_ENV === "production",
})

// Apply rate limiting (disabled during tests)
if (process.env.NODE_ENV !== "test") {
  app.use("/api", globalLimiter);
  app.use("/api/upload", uploadLimiter);
}

const allowedOrigins =
  process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:5173"]
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
)

// Security headers for production
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    )
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("X-Frame-Options", "DENY")
    res.setHeader("X-XSS-Protection", "1; mode=block")
    res.setHeader(
      "Referrer-Policy",
      "strict-origin-when-cross-origin",
    )
    next()
  })
}
app.use(express.json({ limit: "20mb" }));

const TMP_ROOT = path.join(__dirname, "../.tmp")
fs.mkdirSync(TMP_ROOT, { recursive: true })

const BATCH_ID_REGEX = /^batch-[0-9]+-[a-z0-9]+$/

// Initialize OCR service
const ocrService = new OCRService(
  process.env.AZURE_DOC_INTELLIGENCE_ENDPOINT,
  process.env.AZURE_DOC_INTELLIGENCE_KEY
);

// ===== Auth (AAD access token validation) =====
// NOTE: In multi-tenant mode, do NOT tie validation to a single tenant.
// We use the 'organizations' JWKS and validate issuer pattern + allowed tenant list.
const applicationIdUri = process.env.APPLICATION_ID_URI;
const scopeName = process.env.SCOPE_NAME || "access_as_user";

// Optional allow-list of tenants (comma-separated TIDs). If empty, accept any org tenant.
const allowedTenants = (process.env.ALLOWED_TENANTS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Multi-tenant JWKS across organizational tenants
const jwks = createRemoteJWKSet(
  new URL(
    "https://login.microsoftonline.com/organizations/discovery/v2.0/keys",
  ),
);

async function validateAADToken(token) {
  // First verify signature & basic token structure
  const { payload } = await jwtVerify(token, jwks, {
    // Do not set a fixed 'issuer' here; we'll validate it manually to support multi-tenant.
  });

  // 1) Issuer must be a v2.0 AAD issuer for some tenant (tid)
  const iss = payload.iss || "";
  const tid = payload.tid || "";
  if (!/^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]+\/v2\.0$/.test(iss)) {
    throw new Error("Invalid issuer");
  }
  if (!tid) {
    throw new Error("Missing tid (tenant id)");
  }
  if (allowedTenants.length && !allowedTenants.includes(tid)) {
    throw new Error("Tenant not allowed");
  }

  // 2) Audience must be *your* API (Application ID URI)
  if (payload.aud !== applicationIdUri) {
    throw new Error(`Invalid audience: expected ${applicationIdUri}`);
  }

  // 3) Must include required delegated scope
  const scp = (payload.scp || "").split(" ").filter(Boolean);
  if (!scp.includes(scopeName)) {
    throw new Error(`Missing required scope: ${scopeName}`);
  }

  return payload;
}

function requireAuth(req, res, next) {
  if (process.env.AUTH_BYPASS === "true") return next()
  const h = req.headers.authorization || ""
  const token = h.startsWith("Bearer ") ? h.slice(7) : null
  if (!token) return res.status(401).json({ message: "Missing bearer token" })
  validateAADToken(token)
    .then(() => next())
    .catch(err => {
      console.error("Auth error:", err.message)
      res.status(401).json({ message: "Unauthorized" })
    })
}

// ===== Graph helpers (app-only, client credentials) =====
// IMPORTANT: For Graph CC flow, we still use your HOME tenant ID.
async function getGraphToken() {
  const TENANT_ID = process.env.TENANT_ID;
  const CLIENT_ID = process.env.CLIENT_ID;
  const CLIENT_SECRET = process.env.CLIENT_SECRET;
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) return null;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const r = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  )

  if (!r.ok) {
    const errorText = await r.text()
    throw new Error(`Token request failed: ${r.status} ${errorText}`)
  }

  const j = await r.json()
  return j.access_token
}

const FIELD_SCHEMA = {
  vendor: 'string',
  total: 'string',
  transactionDate: 'string',
  merchantAddress: 'string',
  merchantPhone: 'string',
  subtotal: 'string',
  tax: 'string'
}

function validateFields(fields) {
  const sanitized = {}
  for (const [k, v] of Object.entries(fields || {})) {
    const expected = FIELD_SCHEMA[k]
    if (!expected) throw new Error(`Invalid field: ${k}`)
    if (typeof v !== expected) throw new Error(`Invalid type for ${k}: expected ${expected}`)
    sanitized[k] = v
  }
  return sanitized
}

async function createListItem(graphToken, fields) {
  const sanitizedFields = validateFields(fields)
  const SITE_ID = process.env.SITE_ID
  const LIST_ID = process.env.LIST_ID
  if (!graphToken || !SITE_ID || !LIST_ID) return { id: `mock-${Date.now()}` }
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/lists/${LIST_ID}/items`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${graphToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: sanitizedFields }),
    },
  )
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`Create item failed: ${r.status} ${t}`)
  }
  return r.json()
}

function validateInputForSignature(input, { maxBytes = 5 * 1024 * 1024 } = {}) {
  if (input == null) throw new Error('INVALID_SIGNATURE_INPUT');
  let buf;
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    buf = Buffer.from(input);
  } else if (typeof input === 'string') {
    buf = Buffer.from(input, 'utf8');
  } else {
    throw new Error('INVALID_SIGNATURE_TYPE');
  }
  if (buf.byteLength === 0 || buf.byteLength > maxBytes) {
    throw new Error('INVALID_SIGNATURE_SIZE');
  }
  return buf;
}

async function uploadAttachment(graphToken, itemId, name, filePath) {
  const SITE_ID = process.env.SITE_ID;
  const LIST_ID = process.env.LIST_ID;
  if (!graphToken || !SITE_ID || !LIST_ID) return { name };
  const b = await fsp.readFile(filePath);
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/lists/${LIST_ID}/items/${itemId}/driveItem/children/${encodeURIComponent(
      name,
    )}:/content`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${graphToken}` },
      body: b,
    },
  );
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Attach failed: ${r.status} ${t}`);
  }
  return r.json();
}

// ===== Routes =====
app.get("/api/health", (_req, res) => res.json({ ok: true }))

// Add OCR health check endpoint
app.get("/api/health/ocr", async (req, res) => {
  try {
    const health = await ocrService.healthCheck()
    res.json(health)
  } catch (error) {
    res.status(500).json({
      healthy: false,
      reason: error.message
    })
  }
})

// SECURITY: Updated upload route with async processing
app.post(
  "/api/upload",
  requireAuth,
  secureUpload.array("files"),
  async (req, res) => {
    try {
      const files = req.files || []
      if (files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" })
      }

      const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const batchDir = path.join(TMP_ROOT, batchId)

      await fs.promises.mkdir(batchDir, { recursive: true, mode: 0o700 })

      const processingPromises = []

      for (const f of files) {
        const secureFilename = f.secureFilename || `${crypto.randomUUID()}.tmp`
        const dest = path.join(batchDir, secureFilename)

        await fs.promises.rename(f.path, dest)

        const ocrPromise = ocrService
          .analyzeReceipt(dest)
          .then(data => ({
            file: f.originalname,
            secureFile: secureFilename,
            data
          }))
          .catch(error => {
            console.error(`OCR failed for ${f.originalname}:`, error.message)
            return {
              file: f.originalname,
              secureFile: secureFilename,
              data: {
                vendor: "",
                total: "",
                transactionDate: "",
                error: "OCR processing failed"
              }
            }
          })

        processingPromises.push(ocrPromise)
      }

      const ocrResults = await Promise.all(processingPromises)
      const primaryResult = ocrResults.find(r => !r.data.error) || ocrResults[0]
      const fields = primaryResult?.data || {}

      res.json({
        results: ocrResults,
        fields,
        batchId,
        processingTime: Date.now() - parseInt(batchId.split("-")[1])
      })
    } catch (error) {
      console.error("Upload error:", error)
      try {
        if (req.files) {
          for (const f of req.files) {
            if (fs.existsSync(f.path)) {
              await fs.promises.unlink(f.path)
            }
          }
        }
      } catch (cleanupError) {
        console.error("Cleanup error:", cleanupError)
      }

      res.status(500).json({
        message: "Upload processing failed",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      })
    }
  }
)

// Add upload error handling middleware
app.use("/api/upload", handleUploadErrors);

app.post("/api/submit", requireAuth, async (req, res) => {
  const requestId = crypto.randomUUID();
  const tempBase = path.join(os.tmpdir(), 'receipt-extractor', requestId);
  await fsp.mkdir(tempBase, { recursive: true, mode: 0o700 });
  try {
    const { fields, signatureDataUrl, batchId } = req.body || {};
    const token = await getGraphToken();
    const item = await createListItem(token, fields || {});
    const itemId =
      item?.id || item?.value?.id || item?.name || `mock-${Date.now()}`;

    if (batchId) {
      if (!BATCH_ID_REGEX.test(batchId)) {
        return res.status(400).json({ message: "Invalid batchId" });
      }
      const src = path.resolve(TMP_ROOT, batchId);
      if (!src.startsWith(TMP_ROOT + path.sep)) {
        return res.status(400).json({ message: "Invalid batchId" });
      }
      if (fs.existsSync(src)) {
        const batchDir = path.join(tempBase, 'batch');
        await fsp.mkdir(batchDir, { recursive: true });
        await fsp.rename(src, batchDir);
        const files = await fsp.readdir(batchDir);
        for (const name of files) {
          const filePath = path.join(batchDir, name);
          await uploadAttachment(token, itemId, name, filePath);
        }
      }
    }

    if (signatureDataUrl) {
      const m = signatureDataUrl.match(/^data:image\/png;base64,(.+)$/);
      if (!m) {
        return res.status(400).json({ message: 'Invalid signature' });
      }
      const maxSize = 100 * 1024; // 100KB
      let safeContent;
      try {
        safeContent = validateInputForSignature(
          Buffer.from(m[1], 'base64'),
          { maxBytes: maxSize }
        );
      } catch {
        return res.status(400).json({ message: 'Invalid signature' });
      }
      const tmp = path.join(tempBase, `signature.png`);
      await fsp.writeFile(tmp, safeContent);
      await uploadAttachment(token, itemId, "signature.png", tmp);
    }

    res.json({ ok: true, itemId });
  } catch (e) {
    console.error('Submit error', {
      message: e?.message,
      stack: e?.stack,
      timestamp: new Date().toISOString(),
      userId: req.user && req.user.id,
      requestId
    });
    return res.status(500).json({
      message: 'Internal server error',
      requestId
    });
  } finally {
    try {
      await fsp.rm(tempBase, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch (e) {
      if (e && e.code !== 'ENOENT') console.warn('cleanup failed', { requestId, code: e.code });
    }
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => console.log(`API listening on :${port}`));
}

export default app;
