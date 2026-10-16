const express = require("express");
const multer = require("multer");
const { requireAuth, requireRole } = require("../middleware/auth");
const storage = require("../lib/storage");

const router = express.Router();
router.use(requireAuth, requireRole("creator", "admin"));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Identify the image by its actual bytes, not its file name
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: "png", type: "image/png" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (buf.subarray(0, 4).toString("ascii") === "GIF8") return { ext: "gif", type: "image/gif" };
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP")
    return { ext: "webp", type: "image/webp" };
  return null;
}

// POST /api/uploads  (form field "file") → { url }
router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose an image to upload" });
  const kind = sniff(req.file.buffer);
  if (!kind) return res.status(400).json({ error: "Upload a PNG, JPG, GIF or WebP image" });
  const url = await storage.save(req.file.buffer, kind.ext, kind.type);
  res.status(201).json({ url });
});

module.exports = router;
