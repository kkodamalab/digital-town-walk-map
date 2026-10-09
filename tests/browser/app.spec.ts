import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test.beforeEach(async ({ page }) => {
  await page.goto("");
});
test("subpath, map pins, details, filters and mobile layout", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "デジタル街歩きマップ", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("デモモード ·", { exact: false })).toBeVisible();
  await expect(page.locator(".leaflet-marker-icon")).toHaveCount(3);
  await page.locator(".leaflet-marker-icon").first().click();
  await expect(page.getByRole("dialog", { name: "投稿の詳細" })).toBeVisible();
  await expect(
    page.getByRole("dialog").locator(".media-grid img"),
  ).toBeVisible();
  await page.getByRole("button", { name: "詳細を閉じる" }).click();
  await page
    .getByLabel("カテゴリ", { exact: true })
    .selectOption("住民インタビュー");
  await expect(page.locator(".card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "広場で聞いた思い出", exact: false })
    .click();
  await expect(page.getByRole("dialog")).toContainText("昔はこの広場");
  await page.getByRole("button", { name: "詳細を閉じる" }).click();
  await page.getByLabel("カテゴリ", { exact: true }).selectOption("");
  await page.getByLabel("メディア種別").selectOption("audio");
  await page.locator(".card").click();
  await expect(page.locator("audio")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("unauthenticated restrictions, demo help application and withdrawal", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "地域の御用聞き", exact: false })
    .click();
  await page
    .getByRole("button", {
      name: "買い物の荷物運びを手伝ってください",
      exact: false,
    })
    .click();
  await page.getByRole("button", { name: "お手伝いを申し出る" }).click();
  await expect(page.getByRole("dialog", { name: "ログイン" })).toBeVisible();
  await page.getByRole("button", { name: "デモ利用を開始" }).click();
  await page.getByRole("button", { name: "お手伝いを申し出る" }).click();
  for (const [name, value] of [
    ["応募者表示名", "デモ支援者"],
    ["対応できる内容", "荷物運び"],
    ["対応可能日時", "土曜日"],
    ["メッセージ（連絡先・住所を含めない）", "対応できます"],
  ])
    await page.getByLabel(name, { exact: true }).fill(value);
  await page.getByRole("button", { name: "応募する", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "実際の応募・マッチングは行われません",
  );
  await expect(page.getByRole("heading", { name: "管理者操作" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "詳細を閉じる" }).click();
  await page
    .getByRole("button", { name: "困り事を相談", exact: false })
    .click();
  for (const [name, value] of [
    ["タイトル", "デモの困り事"],
    ["説明・依頼内容", "集会所の手伝い"],
    ["投稿者表示名", "相談者"],
    ["おおまかな地域（町丁目・代表地点）", "中央地域"],
    ["希望日時", "来週"],
  ])
    await page.getByLabel(name, { exact: true }).fill(value);
  await page.getByRole("button", { name: "デモ投稿を保存" }).click();
  await page
    .getByRole("button", { name: "デモの困り事", exact: false })
    .click();
  await expect(page.getByRole("dialog")).toContainText("承認待ち");
  await page.getByRole("button", { name: "取下げ・公開停止" }).click();
  await page
    .getByRole("button", { name: "デモの困り事", exact: false })
    .click();
  await expect(page.getByRole("dialog")).toContainText("取消");
});
test("manual map position, address success and no result, photo/video/audio preview", async ({
  page,
}) => {
  await page.getByRole("button", { name: "記録を投稿", exact: false }).click();
  await page.getByRole("button", { name: "デモ利用を開始" }).click();
  await page.getByRole("button", { name: "記録を投稿", exact: false }).click();
  const map = page.getByRole("dialog").locator(".map");
  await map.click({ position: { x: 80, y: 80 } });
  const lat = page.getByLabel("緯度", { exact: true });
  expect(Number(await lat.inputValue())).not.toBe(35.681);
  await page.getByLabel("住所・施設名", { exact: true }).fill("東京駅");
  await page.getByRole("button", { name: "住所検索", exact: true }).click();
  await page.getByRole("button", { name: "東京駅付近（デモ検索）" }).click();
  await expect(lat).toHaveValue("35.681");
  await page.waitForTimeout(1600);
  await page.getByLabel("住所・施設名", { exact: true }).fill("該当なし");
  await page.getByRole("button", { name: "住所検索", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "該当する場所がありません",
  );
  await page.locator("input[type=file]").setInputFiles([
    {
      name: "photo.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4R0AAAAASUVORK5CYII=",
        "base64",
      ),
    },
    {
      name: "video.webm",
      mimeType: "video/webm",
      buffer: readFileSync("tests/fixtures/demo.webm"),
    },
    {
      name: "audio.wav",
      mimeType: "audio/wav",
      buffer: readFileSync("public/demo-tone.wav"),
    },
  ]);
  await expect(
    page.getByRole("dialog").locator(".media-grid img"),
  ).toBeVisible();
  await expect(page.locator("video")).toBeVisible();
  await expect(page.locator("audio")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("GPS情報がありません");
  await page.locator("video").evaluate(async (el: HTMLVideoElement) => {
    await el.play();
  });
  await expect
    .poll(() =>
      page.locator("video").evaluate((el: HTMLVideoElement) => el.currentTime),
    )
    .toBeGreaterThan(0);
  await page.locator("audio").evaluate(async (el: HTMLAudioElement) => {
    await el.play();
  });
  await expect
    .poll(() =>
      page.locator("audio").evaluate((el: HTMLAudioElement) => el.currentTime),
    )
    .toBeGreaterThan(0);
  for (const [name, value] of [
    ["タイトル", "テスト記録"],
    ["説明・依頼内容", "<script>alert(1)</script>"],
    ["投稿者表示名", "デモ投稿者"],
    ["地点名", "地域の公園"],
  ])
    await page.getByLabel(name, { exact: true }).fill(value);
  await page.getByRole("button", { name: "デモ投稿を保存" }).click();
  await page.getByRole("button", { name: "テスト記録", exact: false }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "<script>alert(1)</script>",
  );
  await expect(page.getByRole("dialog").locator("script")).toHaveCount(0);
});
test("GPS photo and draggable location pin", async ({ page }) => {
  await page.getByRole("button", { name: "記録を投稿", exact: false }).click();
  await page.getByRole("button", { name: "デモ利用を開始" }).click();
  await page.getByRole("button", { name: "記録を投稿", exact: false }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles("tests/fixtures/gps.jpg");
  await expect(page.getByLabel("緯度", { exact: true })).toHaveValue("35.5");
  await expect(page.getByLabel("経度", { exact: true })).toHaveValue("139.75");
  await expect(page.getByRole("status")).toContainText("GPS位置を設定しました");
  const marker = page.getByRole("dialog").locator(".leaflet-marker-icon");
  await marker.scrollIntoViewIfNeeded();
  const box = await marker.boundingBox();
  if (!box) throw new Error("marker not visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 40,
    box.y + box.height / 2 + 30,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect(page.getByLabel("緯度", { exact: true })).not.toHaveValue(
    "35.5",
  );
});
