import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  approximate,
  assertCoordinates,
  extractGPS,
  mediaKind,
  validateMedia,
  filterEntries,
  geocode,
  publicKeyAllowed,
} from "../src/domain";
// Vitest executes all domain tests in Node; File/Blob provided by Node 24.
describe("location and privacy", () => {
  it("GPS JPEG extracts latitude and longitude", async () => {
    const f = new File([readFileSync("tests/fixtures/gps.jpg")], "gps.jpg", {
      type: "image/jpeg",
    });
    expect(await extractGPS(f)).toEqual({ lat: 35.5, lng: 139.75 });
  });
  it("no GPS permits manual coordinates", async () => {
    expect(
      await extractGPS(new File(["plain"], "no.jpg", { type: "image/jpeg" })),
    ).toBeNull();
    expect(() => assertCoordinates(35.1, 139.1)).not.toThrow();
  });
  it("help coordinates are approximate", () => {
    expect(approximate(35.681236, 139.767125)).toEqual({
      lat: 35.68,
      lng: 139.77,
    });
    expect(() => approximate(91, 0)).toThrow();
  });
});
describe("geocoding", () => {
  it("normal result", async () => {
    expect(
      await geocode("東京", async () => [
        { lat: "35", lon: "139", display_name: "東京" },
      ]),
    ).toEqual([{ lat: 35, lng: 139, label: "東京" }]);
  });
  it("empty, invalid and network errors", async () => {
    await expect(geocode("東", async () => [])).rejects.toThrow();
    await expect(geocode("未知", async () => [])).rejects.toThrow("該当");
    await expect(
      geocode("東京", async () => [{ lat: 999, lon: 0 }]),
    ).rejects.toThrow();
    await expect(
      geocode("東京", async () => {
        throw new Error("network");
      }),
    ).rejects.toThrow("network");
  });
});
describe("media and keys", () => {
  it("rejects spoofed MIME and accepts real video/audio headers", async () => {
    await expect(
      validateMedia(
        new File(["<script>bad</script>"], "bad.png", { type: "image/png" }),
      ),
    ).rejects.toThrow("一致");
    expect(
      await validateMedia(
        new File([readFileSync("tests/fixtures/demo.webm")], "video.webm", {
          type: "video/webm",
        }),
      ),
    ).toBe("video");
    expect(
      await validateMedia(
        new File([readFileSync("public/demo-tone.wav")], "tone.wav", {
          type: "audio/wav",
        }),
      ),
    ).toBe("audio");
  });
  it("photo/video/audio accepted, active formats and excess size rejected", () => {
    expect(mediaKind({ type: "image/jpeg", size: 100 })).toBe("photo");
    expect(mediaKind({ type: "video/webm", size: 100 })).toBe("video");
    expect(mediaKind({ type: "audio/mp4", size: 100 })).toBe("audio");
    expect(() => mediaKind({ type: "image/svg+xml", size: 100 })).toThrow();
    expect(() =>
      mediaKind({ type: "video/mp4", size: 30 * 1024 * 1024 }),
    ).toThrow();
  });
  it("service role and secret keys rejected", () => {
    const token = (role: string) =>
      "x." + btoa(JSON.stringify({ role })) + ".x";
    expect(publicKeyAllowed(token("anon"))).toBe(true);
    expect(publicKeyAllowed(token("service_role"))).toBe(false);
    expect(publicKeyAllowed("sb_secret_abc")).toBe(false);
  });
  it("keyword/category/media filtering", () => {
    const e = {
      id: "1",
      title: "歴史",
      description: "記録",
      category: "専門家解説",
      display_name: "人",
      lat: 35,
      lng: 139,
      visibility: "public",
      media: [{ url: "photo", kind: "photo" as const, name: "写真" }],
    };
    expect(filterEntries([e], "歴史", "専門家解説", "photo")).toHaveLength(1);
    expect(filterEntries([e], "なし", "", "")).toHaveLength(0);
  });
});
