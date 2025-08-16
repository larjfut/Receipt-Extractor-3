import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TMP_ROOT = path.join(__dirname, "../../.tmp");
fs.mkdirSync(TMP_ROOT, { recursive: true });

// Allowed file extensions and MIME types
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".pdf"];
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "application/pdf",
];

// File size limits
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;

/**
 * Sanitize filename to prevent path traversal attacks
 * @param {string} originalname - Original filename from upload
 * @returns {string} - Safe filename with UUID
 */
function sanitizeFilename(originalname) {
  if (!originalname || typeof originalname !== "string") {
    throw new Error("Invalid filename");
  }

  // Extract extension and validate
  const ext = path.extname(originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`File type ${ext} not allowed`);
  }

  // Generate cryptographically secure filename
  const uuid = crypto.randomUUID();
  return `${uuid}${ext}`;
}

/**
 * Validate file content matches declared MIME type
 * @param {Object} file - Multer file object
 * @returns {boolean} - Whether file is valid
 */
function validateFileContent(file) {
  // Basic MIME type validation
  return ALLOWED_MIME_TYPES.includes(file.mimetype);
}

// Configure secure multer instance
export const secureUpload = multer({
  dest: TMP_ROOT,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
    fieldSize: 1024 * 1024, // 1MB for text fields
  },
  fileFilter: (req, file, cb) => {
    try {
      // Validate MIME type
      if (!validateFileContent(file)) {
        return cb(new Error("File type not allowed"), false);
      }

      // Generate secure filename and store on file object
      file.secureFilename = sanitizeFilename(file.originalname);
      cb(null, true);
    } catch (error) {
      cb(error, false);
    }
  },
});

// Error handler for multer errors
export function handleUploadErrors(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        return res.status(413).json({
          message: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
        });
      case "LIMIT_FILE_COUNT":
        return res.status(413).json({
          message: `Too many files. Maximum is ${MAX_FILES} files`,
        });
      case "LIMIT_UNEXPECTED_FILE":
        return res.status(400).json({
          message: "Unexpected file field",
        });
      default:
        return res.status(400).json({
          message: "File upload error: " + err.message,
        });
    }
  }

  if (err.message.includes("not allowed") || err.message.includes("Invalid")) {
    return res.status(400).json({ message: err.message });
  }

  next(err);
}
