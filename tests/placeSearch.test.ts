import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_PLACE_SEARCH_URL', 'https://nominatim.openstreetmap.org/search'); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-19')); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const result = { lat: "35.614", lon: "139.3807", display_name: "南大沢駅" };
function provider(data: unknown = [result], status = 200) {
  const fetcher = vi.fn().mockResolvedValue({ ok: status === 200, status, json: async () => data });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
describe('place search provider', () => {
  it('uses Japanese explicit search, limits results, and caches repeated input', async () => {
    const fetcher = provider(Array(7).fill(result));
    const { searchPlaces } = await import('../src/placeSearch');
    const found = await searchPlaces(' 南大沢 ');
    expect(found).toHaveLength(5);
    expect(found[0]).toEqual({lat: 35.614, lng: 139.3807, label: '南大沢駅'});
    expect(await searchPlaces('南大沢')).toEqual(found);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const url = fetcher.mock.calls[0][0] as URL;
    expect(url.searchParams.get('q')).toBe('南大沢');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('countrycodes')).toBe('jp');
  });
  it('biases the university search toward Minami-Osawa without replacing the query', async () => {
    const fetcher = provider();
    const { searchPlaces } = await import('../src/placeSearch');
    await searchPlaces('東京都立大学');
    const url = fetcher.mock.calls[0][0] as URL;
    expect(url.searchParams.get('q')).toBe('東京都立大学');
    expect(url.searchParams.get('viewbox')).toBe('139.34,35.65,139.42,35.58');
  });
  it('rejects rapid requests and permits a later retry', async () => {
    const fetcher = provider();
    const { searchPlaces } = await import('../src/placeSearch');
    await searchPlaces('南大沢');
    await expect(searchPlaces('東京駅')).rejects.toThrow('少し待って');
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1100);
    await searchPlaces('東京駅');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not issue concurrent requests', async () => {
    let resolve!: (response: unknown) => void;
    const fetcher = vi.fn(() => new Promise(r => { resolve = r; }));
    vi.stubGlobal('fetch', fetcher);
    const { searchPlaces } = await import('../src/placeSearch');
    const first = searchPlaces('南大沢');
    vi.advanceTimersByTime(1200);
    await expect(searchPlaces('東京駅')).rejects.toThrow('少し待って');
    resolve({ ok: true, json: async () => [result] });
    await first;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('preserves no-result responses', async () => {
    provider([]);
    const { searchPlaces } = await import('../src/placeSearch');
    expect(await searchPlaces('見つからない地名')).toEqual([]);
  });
  it.each([[{...result, lat:'NaN'}], [{...result, lon:'181'}], [{...result, lat:''}], [null], [{error:'bad'}]])('rejects malformed coordinates or labels: %j', async item => {
    provider([item]);
    const { searchPlaces } = await import('../src/placeSearch');
    await expect(searchPlaces('場所')).rejects.toThrow();
  });
  it('reports rate limiting and allows retry after failure', async () => {
    const fetcher = provider([], 429);
    const { searchPlaces } = await import('../src/placeSearch');
    await expect(searchPlaces('場所')).rejects.toThrow('混み合って');
    vi.advanceTimersByTime(1100);
    fetcher.mockResolvedValue({ ok: true, status: 200, json: async () => [result] });
    expect(await searchPlaces('場所')).toHaveLength(1);
  });
  it('loads a switchable public provider configuration under the app base path', async () => {
    vi.stubEnv('VITE_PLACE_SEARCH_URL', '');
    vi.stubEnv('BASE_URL', '/digital-town-walk-map/');
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({url: 'https://search.example.org/search'}) })
      .mockResolvedValueOnce({ ok: true, json: async () => [result] });
    vi.stubGlobal('fetch', fetcher);
    const { searchPlaces } = await import('../src/placeSearch');
    await searchPlaces('東京駅');
    expect(fetcher.mock.calls[0][0]).toBe('/digital-town-walk-map/place-search.json');
    expect((fetcher.mock.calls[1][0] as URL).host).toBe('search.example.org');
  });
  it('rejects blank queries without networking', async () => {
    const fetcher = provider();
    const { searchPlaces } = await import('../src/placeSearch');
    await expect(searchPlaces(' ')).rejects.toThrow('入力');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
