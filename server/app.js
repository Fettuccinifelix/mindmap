import express from "express";
import multer from "multer";
import sharp from "sharp";
import { createAnalyzer } from "./analyzer.js";
import { detectionsSchema } from "./schema.js";
export function createApp({
  analyze,
  apiKey = process.env.OPENAI_API_KEY,
  provider = process.env.PHOTO_PROVIDER || (apiKey ? "openai" : "ollama"),
  model = provider === "ollama"
    ? process.env.OLLAMA_MODEL || "qwen2.5vl:3b"
    : process.env.OPENAI_MODEL || "gpt-4.1-mini",
  ollamaUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
  fetchImpl,
  timeoutMs = provider === "ollama" ? 180000 : 45000,
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.get("/api/photo-config", (req, res) =>
    res.json({
      provider,
      model,
      timeoutMs,
      local:
        provider === "ollama" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(
          new URL(ollamaUrl).hostname,
        ),
    }),
  );
  // Reject cross-origin browser submissions to the local service.
  app.use("/api", (req, res, next) => {
    const origin = req.get("origin");
    if (origin && origin !== `${req.protocol}://${req.get("host")}`)
      return res
        .status(403)
        .json({ error: "Cross-origin requests are not allowed." });
    next();
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });
  app.post("/api/analyze-photo", upload.single("image"), async (req, res) => {
    if (!req.file)
      return res
        .status(400)
        .json({ error: "Choose one JPEG, PNG, or WebP image." });
    if (!["image/jpeg", "image/png", "image/webp"].includes(req.file.mimetype))
      return res.status(415).json({ error: "Use a JPEG, PNG, or WebP image." });
    let image;
    try {
      const input = sharp(req.file.buffer, { limitInputPixels: 40000000 });
      const meta = await input.metadata();
      if (!["jpeg", "png", "webp"].includes(meta.format)) throw Error();
      image = await input
        .rotate()
        .resize({
          width: 1800,
          height: 1800,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      return res
        .status(400)
        .json({ error: "This image could not be read. Try another photo." });
    }
    if (!["openai", "ollama"].includes(provider))
      return res
        .status(503)
        .json({
          error:
            "Set PHOTO_PROVIDER to ollama or openai in the server .env file.",
        });
    if (!analyze && provider === "openai" && !apiKey)
      return res.status(503).json({
        error:
          "Photo analysis needs OPENAI_API_KEY in the server .env file. Your board still works without it.",
      });
    const controller = new AbortController();
    let timer;
    try {
      const run =
        analyze ??
        createAnalyzer({ provider, apiKey, model, ollamaUrl, fetchImpl });
      const raw = await Promise.race([
        run(image, controller.signal),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("timeout"));
          }, timeoutMs);
        }),
      ]);
      const parsed = detectionsSchema.safeParse(raw);
      if (!parsed.success)
        return res.status(502).json({
          error:
            "The model returned invalid note data. Please retry with a clearer photo.",
        });
      res.json(parsed.data);
    } catch (e) {
      res.status(e.message === "timeout" ? 504 : 502).json({
        error:
          e.message === "timeout"
            ? "Analysis timed out. Try a photo with fewer notes; local model startup can take longer on the first request."
            : e.safeMessage
              ? e.message
              : provider === "ollama"
                ? "Local analysis failed. Make sure Ollama is running, run ollama pull for your OLLAMA_MODEL, and check OLLAMA_BASE_URL. Try a clearer photo if the model returned invalid JSON."
                : "Photo analysis failed. Check the server API key, connection, and provider billing, then retry.",
      });
    } finally {
      clearTimeout(timer);
    }
  });
  app.use((err, req, res, next) => {
    res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      error:
        err.code === "LIMIT_FILE_SIZE"
          ? "Photo must be 10 MB or smaller."
          : "Upload failed. Choose one image and retry.",
    });
  });
  return app;
}
