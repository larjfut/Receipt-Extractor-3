import request from "supertest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock environment for testing
process.env.SKIP_AUTH = "true";
process.env.NODE_ENV = "test";

// Import app after setting env
const { default: app } = await import("../src/server.js");

describe("File Upload Security Tests", () => {
  let testImageBuffer;
  let testPdfBuffer;

  beforeAll(() => {
    // Create test files
    testImageBuffer = Buffer.from("fake-image-data");
    testPdfBuffer = Buffer.from("%PDF-1.4 fake pdf content");
  });

  afterAll(() => {
    // Cleanup any test files
    // Note: In a real app, you'd clean up test directories
  });

  describe("Path Traversal Protection", () => {
    test("should reject path traversal attempts in filename", async () => {
      const response = await request(app)
        .post("/api/upload")
        .attach("files", testImageBuffer, "../../../etc/passwd")
        .expect(400);

      expect(response.body.message).toContain("not allowed");
    });

    test("should reject absolute path attempts", async () => {
      const response = await request(app)
        .post("/api/upload")
        .attach("files", testImageBuffer, "/etc/hosts")
        .expect(400);

      expect(response.body.message).toContain("not allowed");
    });

    test("should reject Windows path traversal", async () => {
      const response = await request(app)
        .post("/api/upload")
        .attach(
          "files",
          testImageBuffer,
          "..\\..\\..\\windows\\system32\\hosts",
        )
        .expect(400);

      expect(response.body.message).toContain("not allowed");
    });

    test("should accept safe filenames", async () => {
      const response = await request(app)
        .post("/api/upload")
        .attach("files", testImageBuffer, "receipt.jpg")
        .expect(200);

      expect(response.body.batchId).toBeDefined();
      expect(response.body.results).toBeDefined();
    });
  });

  describe("File Type Validation", () => {
    test("should reject executable files", async () => {
      const response = await request(app)
        .post("/api/upload")
        .attach("files", Buffer.from("fake exe"), "malware.exe")
        .expect(400);

      expect(response.body.message).toContain("not allowed");
    });

    test("should reject script files", async () => {
      const response = await request(app)
        .post("/api/upload")
        .attach("files", Buffer.from('alert("xss")'), "script.js")
        .expect(400);

      expect(response.body.message).toContain("not allowed");
    });

    test("should accept valid image files", async () => {
      const response = await request(app)
        .post("/api/upload")
        .attach("files", testImageBuffer, "receipt.jpg")
        .expect(200);

      expect(response.body.results[0].file).toBe("receipt.jpg");
    });

    test("should accept valid PDF files", async () => {
      const response = await request(app)
        .post("/api/upload")
        .attach("files", testPdfBuffer, "receipt.pdf")
        .expect(200);

      expect(response.body.results[0].file).toBe("receipt.pdf");
    });
  });

  describe("File Size Limits", () => {
    test("should reject files that are too large", async () => {
      const largeBuffer = Buffer.alloc(15 * 1024 * 1024); // 15MB

      const response = await request(app)
        .post("/api/upload")
        .attach("files", largeBuffer, "large.jpg")
        .expect(413);

      expect(response.body.message).toContain("too large");
    });

    test("should accept files within size limit", async () => {
      const smallBuffer = Buffer.alloc(1024); // 1KB

      const response = await request(app)
        .post("/api/upload")
        .attach("files", smallBuffer, "small.jpg")
        .expect(200);

      expect(response.body.results).toBeDefined();
    });

    test("should reject too many files", async () => {
      const req = request(app).post("/api/upload");

      // Attach 6 files (limit is 5)
      for (let i = 0; i < 6; i++) {
        req.attach("files", testImageBuffer, `file${i}.jpg`);
      }

      const response = await req.expect(413);
      expect(response.body.message).toContain("Too many files");
    });
  });

  describe("Rate Limiting", () => {
    test("should allow normal upload rate", async () => {
      const response = await request(app)
        .post("/api/upload")
        .attach("files", testImageBuffer, "test.jpg")
        .expect(200);

      expect(response.body.results).toBeDefined();
    });

    // Note: Rate limiting tests are complex due to timing
    // In a real scenario, you'd use a test helper to simulate rapid requests
  });
});

describe("API Health and Basic Functionality", () => {
  test("health endpoint should return ok", async () => {
    const response = await request(app).get("/api/health").expect(200);

    expect(response.body.ok).toBe(true);
  });

  test("should handle empty upload gracefully", async () => {
    const response = await request(app).post("/api/upload").expect(400);

    expect(response.body.message).toBeDefined();
  });

  test("should handle invalid routes", async () => {
    const response = await request(app).get("/api/nonexistent").expect(404);
  });
});

describe("Submit Endpoint", () => {
  test("should handle submit with valid data", async () => {
    const submitData = {
      fields: {
        vendor: "Test Store",
        total: "12.34",
        transactionDate: "2024-01-01",
      },
      batchId: "test-batch-123",
    };

    const response = await request(app)
      .post("/api/submit")
      .send(submitData)
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.itemId).toBeDefined();
  });

  test("should handle submit with empty data", async () => {
    const response = await request(app)
      .post("/api/submit")
      .send({})
      .expect(200);

    expect(response.body.ok).toBe(true);
  });
});
