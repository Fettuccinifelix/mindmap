import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../server/app.js";
const png = await sharp({
  create: { width: 100, height: 100, channels: 3, background: "yellow" },
})
  .png()
  .toBuffer();
const result = {
  notes: [
    {
      text: "A thought",
      color: "yellow",
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.2,
    },
  ],
};
const post = (app) =>
  request(app)
    .post("/api/analyze-photo")
    .attach("image", png, { filename: "wall.png", contentType: "image/png" });
test("valid photo returns validated detections", async () => {
  const r = await post(createApp({ analyze: async () => result }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, result);
});
test("missing file and unsupported types rejected", async () => {
  assert.equal(
    (await request(createApp()).post("/api/analyze-photo")).status,
    400,
  );
  assert.equal(
    (
      await request(createApp())
        .post("/api/analyze-photo")
        .attach("image", Buffer.from("x"), {
          filename: "x.gif",
          contentType: "image/gif",
        })
    ).status,
    415,
  );
});
test("spoofed image rejected before provider call", async () => {
  const r = await request(
    createApp({
      analyze: () => {
        throw Error("should not run");
      },
    }),
  )
    .post("/api/analyze-photo")
    .attach("image", Buffer.from("bad"), {
      filename: "x.png",
      contentType: "image/png",
    });
  assert.equal(r.status, 400);
});
test("missing credentials returns actionable failure", async () => {
  assert.equal(
    (await post(createApp({ provider: "openai", apiKey: "" }))).status,
    503,
  );
});
test("malformed model output and outside boxes rejected", async () => {
  for (const value of [
    { notes: [{ ...result.notes[0], x: 0.99 }] },
    { notes: "wrong" },
  ])
    assert.equal(
      (await post(createApp({ analyze: async () => value }))).status,
      502,
    );
});
test("provider error and timeout are handled", async () => {
  assert.equal(
    (
      await post(
        createApp({
          analyze: async () => {
            throw Error("secret provider detail");
          },
        }),
      )
    ).status,
    502,
  );
  assert.equal(
    (
      await post(
        createApp({ analyze: () => new Promise(() => {}), timeoutMs: 10 }),
      )
    ).status,
    504,
  );
});
test("oversized uploads rejected", async () => {
  const r = await request(createApp())
    .post("/api/analyze-photo")
    .attach("image", Buffer.alloc(10 * 1024 * 1024 + 1), {
      filename: "large.png",
      contentType: "image/png",
    });
  assert.equal(r.status, 413);
});
test("cross origin requests rejected", async () => {
  assert.equal(
    (
      await request(createApp())
        .post("/api/analyze-photo")
        .set("Origin", "https://example.com")
    ).status,
    403,
  );
});

test("Ollama accepts a photo without an API key and sends native vision request", async () => {
  let payload;
  const app = createApp({
    provider: "ollama",
    apiKey: "",
    model: "qwen2.5vl:3b",
    fetchImpl: async (url, options) => {
      assert.equal(String(url), "http://127.0.0.1:11434/api/chat");
      assert.equal(options.method, "POST");
      assert.ok(options.signal instanceof AbortSignal);
      payload = JSON.parse(options.body);
      return new Response(
        JSON.stringify({ message: { content: JSON.stringify(result) } }),
        { status: 200 },
      );
    },
  });
  const r = await post(app);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, result);
  assert.equal(payload.model, "qwen2.5vl:3b");
  assert.equal(payload.stream, false);
  assert.equal(payload.format, "json");
  assert.ok(Buffer.from(payload.messages[0].images[0], "base64").length > 0);
  assert.equal(JSON.stringify(payload).includes("api_key"), false);
  const config = await request(app).get("/api/photo-config");
  assert.equal(config.body.local, true);
  assert.equal(config.body.timeoutMs, 180000);
  assert.equal(config.body.provider, "ollama");
});
test("Ollama unavailable, missing model, invalid JSON and invalid boxes are actionable", async () => {
  for (const [fetchImpl, expected] of [
    [
      async () => {
        throw Error("private network details");
      },
      "Make sure Ollama is running",
    ],
    [async () => new Response("{}", { status: 404 }), "model is missing"],
    [async () => new Response("{}", { status: 500 }), "supports images"],
    [
      async () => Response.json({ message: { content: "bad json" } }),
      "invalid JSON",
    ],
    [
      async () =>
        Response.json({
          message: {
            content: JSON.stringify({ notes: [{ ...result.notes[0], x: 2 }] }),
          },
        }),
      "invalid note data",
    ],
  ]) {
    const r = await post(createApp({ provider: "ollama", fetchImpl }));
    assert.equal(r.status, 502);
    assert.ok(r.body.error.includes(expected));
    assert.ok(!r.body.error.includes("private network details"));
  }
});
test("Ollama timeout aborts provider request and remote Ollama privacy is labeled accurately", async () => {
  let signal;
  const app = createApp({
    provider: "ollama",
    ollamaUrl: "http://192.168.1.10:11434",
    timeoutMs: 10,
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    },
  });
  assert.equal((await post(app)).status, 504);
  assert.equal(signal.aborted, true);
  assert.equal((await request(app).get("/api/photo-config")).body.local, false);
});
test("unknown provider is rejected without a model request", async () => {
  assert.equal((await post(createApp({ provider: "invalid" }))).status, 503);
});
