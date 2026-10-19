import { assertCoordinates } from "./domain";

export type MapLocation = { lat: number; lng: number; label: string };
// Explicit submissions only. One in-flight request and at least 1.1s between
// requests in this client; repeated queries use the session cache.
const cache = new Map<string, MapLocation[]>();
let lastRequest = 0;
let pending = false;
let configuredEndpoint: string | undefined;
async function endpoint() {
  if (configuredEndpoint) return configuredEndpoint;
  let configured: unknown = import.meta.env.VITE_PLACE_SEARCH_URL;
  if (!configured) {
    const response = await fetch(`${import.meta.env.BASE_URL}place-search.json`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("場所検索の設定を読み込めませんでした");
    configured = (await response.json()).url;
  }
  if (typeof configured !== "string" || new URL(configured).protocol !== "https:")
    throw new Error("場所検索の接続先設定が正しくありません");
  configuredEndpoint = configured;
  return configured;
}
export async function searchPlaces(input: string): Promise<MapLocation[]> {
  const query = input.trim();
  if (!query) throw new Error("地名・駅名・施設名を入力してください");
  const cached = cache.get(query);
  if (cached) return cached;
  if (pending || Date.now() - lastRequest < 1100)
    throw new Error("少し待ってから検索してください");
  pending = true;
  lastRequest = Date.now();
  try {
    // Prefer the main campus for the unqualified university name.
    const q = query;
    const url = new URL(await endpoint());
    url.search = new URLSearchParams({ q, format: "jsonv2", limit: "5", countrycodes: "jp", "accept-language": "ja" }).toString();
    if (query === "東京都立大学") url.searchParams.set("viewbox", "139.34,35.65,139.42,35.58");
    lastRequest = Date.now();
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), referrerPolicy: "strict-origin-when-cross-origin" });
    if (!response.ok) throw new Error(response.status === 429 ? "検索が混み合っています。しばらく待って再試行してください" : "場所検索に接続できませんでした。時間をおいて再試行してください");
    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new Error("場所検索の応答を読み取れませんでした");
    const results = data.slice(0, 5).map((item) => {
      if (!item || typeof item.display_name !== "string" || !item.display_name.trim() || ![item.lat, item.lon].every(value => (typeof value === "string" && value.trim() !== "") || typeof value === "number"))
        throw new Error("場所検索の応答を読み取れませんでした");
      const lat = Number(item.lat), lng = Number(item.lon);
      assertCoordinates(lat, lng);
      return { lat, lng, label: item.display_name };
    });
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(query, results);
    return results;
  } finally {
    pending = false;
  }
}
