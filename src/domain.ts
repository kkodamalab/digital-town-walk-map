import exifr from "exifr";
export const recordCategories = [
  "風景・歴史",
  "専門家解説",
  "住民インタビュー",
  "観察記録",
  "その他",
];
export const helpCategories = [
  "買い物・荷物運び",
  "スマートフォン・デジタル支援",
  "簡単な家事・暮らしの手伝い",
  "地域活動",
  "学び・交流",
  "その他",
];
export const statuses = [
  "承認待ち",
  "募集中",
  "調整中",
  "マッチング成立",
  "完了",
  "取消",
];
export type Media = {
  id?: string;
  url: string;
  kind: "photo" | "video" | "audio";
  name: string;
};
export type Entry = {
  id: string;
  owner_id?: string;
  place_id?: string;
  title: string;
  description: string;
  category: string;
  display_name: string;
  lat: number;
  lng: number;
  visibility: string;
  status?: string;
  place_name?: string;
  area?: string;
  desired_at?: string;
  frequency?: string;
  reward?: string;
  recorded_at?: string;
  credit?: string;
  consent?: boolean;
  media: Media[];
};
export type Application = {
  id: string;
  request_id: string;
  display_name: string;
  capability: string;
  availability: string;
  message: string;
};
export function assertCoordinates(lat: number, lng: number) {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    throw new Error("正しい緯度・経度を指定してください");
}
export function approximate(lat: number, lng: number) {
  assertCoordinates(lat, lng);
  return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
}
export function mediaKind(file: Pick<File, "type" | "size">): Media["kind"] {
  if (file.size > 25 * 1024 * 1024)
    throw new Error("ファイルは25MB以下にしてください");
  const kinds: Record<string, Media["kind"]> = {
    "image/jpeg": "photo",
    "image/png": "photo",
    "image/webp": "photo",
    "video/mp4": "video",
    "video/webm": "video",
    "audio/mpeg": "audio",
    "audio/mp4": "audio",
    "audio/x-m4a": "audio",
    "audio/wav": "audio",
    "audio/x-wav": "audio",
    "audio/webm": "audio",
  };
  if (!kinds[file.type]) throw new Error("対応していないファイル形式です");
  return kinds[file.type];
}
export async function extractGPS(file: File) {
  if (!file.type.startsWith("image/")) return null;
  const gps = await exifr.gps(await file.arrayBuffer()).catch(() => null);
  if (!gps) return null;
  assertCoordinates(gps.latitude, gps.longitude);
  return { lat: gps.latitude, lng: gps.longitude };
}
export function filterEntries(
  entries: Entry[],
  query: string,
  category: string,
  kind: string,
) {
  return entries.filter(
    (e) =>
      (!category || e.category === category) &&
      (!query ||
        `${e.title} ${e.description} ${e.place_name ?? ""} ${e.area ?? ""}`.includes(
          query,
        )) &&
      (!kind || e.media.some((m) => m.kind === kind)),
  );
}
export async function geocode(
  query: string,
  invoke: (query: string) => Promise<unknown>,
) {
  if (query.trim().length < 2)
    throw new Error("住所・施設名を2文字以上で入力してください");
  const data = await invoke(query.trim());
  if (!Array.isArray(data) || !data.length)
    throw new Error("該当する場所がありません");
  return data.map(
    (r: { lat: unknown; lon: unknown; display_name?: string }) => {
      const lat = Number(r.lat),
        lng = Number(r.lon);
      assertCoordinates(lat, lng);
      return { lat, lng, label: r.display_name ?? query };
    },
  );
}
export function publicKeyAllowed(key: string) {
  if (key.startsWith("sb_publishable_")) return true;
  try {
    const payload = JSON.parse(
      atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return payload.role === "anon";
  } catch {
    return false;
  }
}
// MIME metadata is not sufficient: reject common spoofed active-content uploads.
export async function validateMedia(file: File) {
  const kind = mediaKind(file),
    b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (start: number, len: number) =>
    String.fromCharCode(...b.slice(start, start + len));
  const valid =
    file.type === "image/jpeg"
      ? b[0] === 255 && b[1] === 216 && b[2] === 255
      : file.type === "image/png"
        ? b[0] === 137 && ascii(1, 3) === "PNG"
        : file.type === "image/webp"
          ? ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP"
          : file.type.includes("webm")
            ? b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3
            : file.type.includes("wav")
              ? ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE"
              : file.type === "audio/mpeg"
                ? ascii(0, 3) === "ID3" ||
                  (b[0] === 255 && (b[1] & 0xe0) === 0xe0)
                : ascii(4, 4) === "ftyp";
  if (!valid) throw new Error("ファイルの内容と形式が一致しません");
  return kind;
}
