import { test, expect } from "@playwright/test";

const places = [
  { query: "東京都八王子市南大沢1-1", label: "大学構内", lat: 35.6179134, lng: 139.3788912 },
  { query: "南大沢", label: "南大沢駅", lat: 35.614, lng: 139.3807 },
  { query: "東京駅", label: "東京駅", lat: 35.6812, lng: 139.7671 },
  { query: "東京都立大学", label: "東京都立大学 南大沢キャンパス", lat: 35.6168, lng: 139.3775 },
];
// Deterministic provider fixtures exercise the UI without consuming the public
// geocoder's quota. Live provider reachability must be verified separately.
test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.route('https://nominatim.openstreetmap.org/search?**', async route => {
    const q = new URL(route.request().url()).searchParams.get('q');
    const found = places.find(p => q === p.query.replace(/([^\d\s])(\d+(?:-\d+)+)$/, '$1 $2'));
    await route.fulfill({ json: found ? [
      { lat: String(found.lat), lon: String(found.lng), display_name: found.label },
      { lat: String(found.lat + .01), lon: String(found.lng + .01), display_name: `${found.label} 周辺` },
    ] : [] });
  });
  await page.goto('');
});

for (const place of places) test(`${place.query}: search, candidates, map movement and preserved pins`, async ({ page }) => {
  const input = page.getByPlaceholder('地名・住所・駅名・施設名を検索');
  await input.fill(place.query);
  if (place.query === '東京駅') await input.press('Enter');
  else await page.getByRole('button', { name: '検索', exact: true }).click();
  const candidates = page.getByRole('list', { name: '場所検索の候補' });
  await expect(candidates.getByRole('button')).toHaveCount(2);
  await expect(page.locator('.search-pin')).toHaveCount(1);
  await expect(page.locator('.town-pin')).toHaveCount(3);
  // Verify actual geographic state, not projected pixel alignment.
  const center = async () => page.locator('.map').evaluate(el => ({
    lat: Number((el as HTMLElement).dataset.centerLat),
    lng: Number((el as HTMLElement).dataset.centerLng),
    zoom: Number((el as HTMLElement).dataset.zoom),
  }));
  await expect.poll(async () => Math.abs((await center()).lat - place.lat)).toBeLessThan(.001);
  await expect.poll(async () => Math.abs((await center()).lng - place.lng)).toBeLessThan(.001);
  expect((await center()).zoom).toBe(16);
  await expect(page.locator('.search-pin')).toBeVisible();
  await candidates.getByRole('button', { name: `${place.label} 周辺`, exact: true }).click();
  await expect.poll(async () => Math.abs((await center()).lat - (place.lat + .01))).toBeLessThan(.001);
  await expect.poll(async () => Math.abs((await center()).lng - (place.lng + .01))).toBeLessThan(.001);
  await page.locator('.search-pin').click();
  await expect(page.locator('.leaflet-popup')).toContainText(`${place.label} 周辺`);
  await expect(page.locator('.town-pin svg')).toHaveCount(3);
  expect(await page.locator('.town-pin').first().evaluate(el => ({ width: el.clientWidth, height: el.clientHeight }))).toEqual({ width: 28, height: 38 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByPlaceholder('投稿タイトル・説明を検索')).toBeVisible();
});

test('no results and network failure are explained', async ({ page }) => {
  await page.getByPlaceholder('地名・住所・駅名・施設名を検索').fill('存在しない場所');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('場所が見つかりませんでした');
  await page.waitForTimeout(1150);
  await page.route('https://nominatim.openstreetmap.org/search?**', route => route.abort());
  await page.getByPlaceholder('地名・住所・駅名・施設名を検索').fill('通信失敗');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('通信を確認');
});

test('current location is temporary and preserves posts', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 35.614, longitude: 139.3807 });
  await page.getByRole('button', { name: '現在地', exact: true }).click();
  await expect(page.locator('.current-pin')).toHaveCount(1);
  await expect(page.locator('.town-pin')).toHaveCount(3);
  await expect(page.getByRole('status')).toContainText('投稿として保存されません');
  await page.reload();
  await expect(page.locator('.current-pin')).toHaveCount(0);
  await expect(page.locator('.card')).toHaveCount(3);
});

test('geolocation permission denial is explained', async ({ page }) => {
  await page.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (_success, fail) => fail?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
  });
  await page.getByRole('button', { name: '現在地', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('位置情報の利用が拒否されました');
  await expect(page.locator('.current-pin')).toHaveCount(0);
});


test('existing pins and content filters remain usable after a place search', async ({ page }) => {
  await page.getByPlaceholder('地名・住所・駅名・施設名を検索').fill('南大沢');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(page.locator('.search-pin')).toHaveCount(1);
  await expect(page.locator('.town-pin')).toHaveCount(3);
  // Return to the original records using the viewing-only location control.
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({latitude:35.6818, longitude:139.7678});
  await page.getByRole('button', {name:'現在地', exact:true}).click();
  await expect(page.locator('.current-pin')).toHaveCount(1);
  await page.locator('.town-pin').first().click();
  await expect(page.getByRole('dialog', {name:'投稿の詳細'})).toBeVisible();
  await page.getByRole('button', {name:'詳細を閉じる'}).click();
  await page.getByPlaceholder('投稿タイトル・説明を検索').fill('駅舎');
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.town-pin')).toHaveCount(1);
});
