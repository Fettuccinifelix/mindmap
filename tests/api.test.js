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
  assert.equal((await post(createApp({ apiKey: "" }))).status, 503);
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
