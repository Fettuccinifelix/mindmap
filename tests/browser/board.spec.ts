import { test, expect } from "@playwright/test";
import sharp from "sharp";
const pixel = await sharp({
  create: { width: 400, height: 300, channels: 3, background: "#eee9b5" },
})
  .png()
  .toBuffer();
test("edit, add, undo, redo, persist and switch boards", async ({ page }) => {
  await page.goto("/");
  const texts = page.getByRole("textbox", { name: "Note text", exact: true });
  await expect(texts).toHaveCount(3);
  await texts.first().fill("A saved thought");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(texts).toHaveCount(4);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(texts).toHaveCount(3);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(texts).toHaveCount(4);
  await expect(page.getByText("All changes saved")).toBeVisible();
  await page.reload();
  await expect(texts).toHaveCount(4);
  await expect(texts.first()).toHaveValue("A saved thought");
  await page
    .getByRole("button", { name: "New board", exact: true })
    .first()
    .click();
  await expect(texts).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Board name", exact: true })
    .fill("Second board");
  await page.getByRole("button", { name: /A little room for ideas/ }).click();
  await expect(texts).toHaveCount(4);
});
test("backup roundtrip and invalid backup", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("textbox", { name: "Note text", exact: true }),
  ).toHaveCount(3);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  await page
    .locator('input[type=file][accept="application/json,.json"]')
    .setInputFiles(path!);
  await expect(page.locator("nav .board-link")).toHaveCount(2);
  await page
    .locator('input[type=file][accept="application/json,.json"]')
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":9}'),
    });
  await expect(page.getByRole("alert")).toContainText("Invalid backup");
});
test("review import, manual addition, remove, existing group and undo", async ({
  page,
}) => {
  await page.route("**/api/analyze-photo", (route) =>
    route.fulfill({
      json: {
        notes: [
          {
            text: "Detected text",
            color: "yellow",
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.2,
          },
          {
            text: "False detection",
            color: "pink",
            x: 0.5,
            y: 0.3,
            width: 0.2,
            height: 0.2,
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Import photo", exact: true }).click();
  await page
    .getByLabel("Wall photo")
    .setInputFiles({ name: "wall.png", mimeType: "image/png", buffer: pixel });
  await page
    .getByRole("button", { name: "Analyze photo", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Detected note 1 text", exact: true })
    .fill("Corrected text");
  await page
    .getByRole("button", { name: "Remove detected note 2", exact: true })
    .click();
  await page
    .getByRole("button", { name: "+ Add missed note", exact: true })
    .click();
  await page.locator(".photo-preview").click({ position: { x: 40, y: 40 } });
  await page
    .getByRole("textbox", { name: "Detected note 2 text", exact: true })
    .fill("Missed note");
  await page
    .getByRole("button", { name: "Import 2 notes", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Note text", exact: true }),
  ).toHaveCount(5);
  await expect(
    page.locator("textarea").filter({ hasText: "Corrected text" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Note text", exact: true }),
  ).toHaveCount(3);
});
test("analysis failure and cancellation leave board unchanged", async ({
  page,
}) => {
  await page.route("**/api/analyze-photo", (route) =>
    route.fulfill({ status: 502, json: { error: "Try another photo." } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Import photo", exact: true }).click();
  await page
    .getByLabel("Wall photo")
    .setInputFiles({ name: "wall.png", mimeType: "image/png", buffer: pixel });
  await page
    .getByRole("button", { name: "Analyze photo", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText("Try another photo.");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Note text", exact: true }),
  ).toHaveCount(3);
});
test("photo creates separate board", async ({ page }) => {
  await page.route("**/api/analyze-photo", (route) =>
    route.fulfill({
      json: {
        notes: [
          {
            text: "New wall",
            color: "blue",
            x: 0.1,
            y: 0.2,
            width: 0.2,
            height: 0.2,
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Create board from photo" }).click();
  await page
    .getByLabel("Wall photo")
    .setInputFiles({ name: "wall.png", mimeType: "image/png", buffer: pixel });
  await page
    .getByRole("button", { name: "Analyze photo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Import 1 notes", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Board name", exact: true }),
  ).toHaveValue("From my wall");
  await expect(
    page.getByRole("textbox", { name: "Note text", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Note text", exact: true }),
  ).toHaveCount(0);
});
test("move, resize, recolor, connect, delete and undo", async ({ page }) => {
  page.setDefaultTimeout(5000);
  await page.goto("/");
  const nodes = page.locator(".react-flow__node");
  await expect(nodes).toHaveCount(3);
  const top = nodes.first().locator(".note-top");
  const before = await nodes.first().boundingBox();
  const grip = await top.boundingBox();
  await page.mouse.move(grip!.x + 20, grip!.y + 5);
  await page.mouse.down();
  await page.mouse.move(grip!.x + 120, grip!.y + 65, { steps: 12 });
  await page.mouse.up();
  const moved = await nodes.first().boundingBox();
  expect(
    Math.abs(moved!.x - before!.x) + Math.abs(moved!.y - before!.y),
  ).toBeGreaterThan(20);
  await top.click();
  await nodes
    .first()
    .getByRole("button", { name: "Make note green", exact: true })
    .click();
  await expect(nodes.first().locator(".note")).toHaveClass(/green/);
  const corner = nodes
    .first()
    .locator(".react-flow__resize-control.bottom.right");
  const box = await corner.boundingBox();
  const width = (await nodes.first().boundingBox())!.width;
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 70, box!.y + 45, { steps: 10 });
  await page.mouse.up();
  expect((await nodes.first().boundingBox())!.width).toBeGreaterThan(
    width + 20,
  );
  const source = nodes.nth(1).locator(".react-flow__handle-bottom"),
    target = nodes.nth(2).locator(".react-flow__handle-top");
  await source.dragTo(target);
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  const point = await page
    .locator(".react-flow__edge")
    .first()
    .locator(".react-flow__edge-path")
    .evaluate((element) => {
      const path = element as SVGPathElement;
      for (let fraction = 0.1; fraction < 0.95; fraction += 0.05) {
        const p = path.getPointAtLength(path.getTotalLength() * fraction);
        const screen = new DOMPoint(p.x, p.y).matrixTransform(
          path.getScreenCTM()!,
        );
        if (
          document
            .elementFromPoint(screen.x, screen.y)
            ?.closest(".react-flow__edge")
        )
          return { x: screen.x, y: screen.y };
      }
      throw new Error("No exposed string segment");
    });
  await page.mouse.click(point.x, point.y);
  await page
    .getByRole("button", { name: "Delete selected", exact: true })
    .click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await nodes.first().locator(".note-top").click();
  await page
    .getByRole("button", { name: "Delete selected", exact: true })
    .click();
  await expect(nodes).toHaveCount(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(nodes).toHaveCount(3);
});
test("mobile board layout stays within viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Add note", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import photo", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
