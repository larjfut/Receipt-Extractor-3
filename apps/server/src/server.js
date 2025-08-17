import fs from "fs";
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

const app = express();
const port = process.env.PORT || 4000;

// SECURITY: Rate limiting middleware
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 uploads per windowMs
  message: { error: "Too many upload attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting (disabled during tests)
if (process.env.NODE_ENV !== "test") {
  app.use("/api", globalLimiter);
  app.use("/api/upload", uploadLimiter);
}

app.use(cors({ origin: ["http://localhost:5173"], credentials: true }));
app.use(express.json({ limit: "20mb" }));

const TMP_ROOT = path.join(__dirname, "../.tmp");
fs.mkdirSync(TMP_ROOT, { recursive: true });

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
  if (process.env.SKIP_AUTH === "true") return next()
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
  );
  const j = await r.json();
  return j.access_token;
}

async function createListItem(graphToken, fields) {
  const SITE_ID = process.env.SITE_ID;
  const LIST_ID = process.env.LIST_ID;
  if (!graphToken || !SITE_ID || !LIST_ID) return { id: `mock-${Date.now()}` };
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/lists/${LIST_ID}/items`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${graphToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    },
  );
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Create item failed: ${r.status} ${t}`);
  }
  return r.json();
}

async function uploadAttachment(graphToken, itemId, name, filePath) {
  const SITE_ID = process.env.SITE_ID;
  const LIST_ID = process.env.LIST_ID;
  if (!graphToken || !SITE_ID || !LIST_ID) return { name };
  const b = fs.readFileSync(filePath);
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
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error"
      })
    }
  }
)

// Add upload error handling middleware
app.use("/api/upload", handleUploadErrors);

app.post("/api/submit", requireAuth, async (req, res) => {
  try {
    const { fields, signatureDataUrl, batchId } = req.body || {};
    const token = await getGraphToken();
    const item = await createListItem(token, fields || {});
    const itemId =
      item?.id || item?.value?.id || item?.name || `mock-${Date.now()}`;

    if (batchId) {
      const batchDir = path.join(TMP_ROOT, batchId);
      if (fs.existsSync(batchDir)) {
        const files = await fs.promises.readdir(batchDir);
        for (const name of files) {
          const filePath = path.join(batchDir, name);
          await uploadAttachment(token, itemId, name, filePath);
        }

        // Clean up files asynchronously
        for (const name of files) {
          await fs.promises.unlink(path.join(batchDir, name));
        }
        await fs.promises.rmdir(batchDir);
      }
    }

    if (signatureDataUrl?.startsWith("data:image/png;base64,")) {
      const m = signatureDataUrl.match(/^data:image\/png;base64,(.+)$/);
      if (m) {
        const tmp = path.join(TMP_ROOT, `sig-${Date.now()}.png`);
        await fs.promises.writeFile(tmp, Buffer.from(m[1], "base64"));
        await uploadAttachment(token, itemId, "signature.png", tmp);
        await fs.promises.unlink(tmp);
      }
    }

    res.json({ ok: true, itemId });
  } catch (e) {
    console.error("Submit error:", e);
    res.status(500).json({ message: e.message });
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
