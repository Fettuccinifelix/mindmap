import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
const app = createApp();
app.use(express.static(fileURLToPath(new URL("../dist", import.meta.url))));
app.get("/{*path}", (req, res) => {
  if (req.path.startsWith("/api/"))
    return res.status(404).json({ error: "Not found" });
  res.sendFile(fileURLToPath(new URL("../dist/index.html", import.meta.url)));
});
app.listen(
  Number(process.env.PORT || 3001),
  process.env.HOST || "127.0.0.1",
  () => console.log("Threadboard server ready"),
);
