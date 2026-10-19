import { useEffect, useRef, useState } from "react";
import { searchPlaces, type MapLocation } from "./placeSearch";

export default function PlaceSearch({ onLocate }: { onLocate: (location: MapLocation, current?: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MapLocation[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  function finish(message: string) {
    inFlight.current = false;
    if (active.current) { setBusy(false); setStatus(message); }
  }
  return <section className="place-search" aria-label="場所を探す">
    <form onSubmit={async (event) => {
      event.preventDefault();
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true); setStatus("検索中…"); setResults([]);
      try {
        const found = await searchPlaces(query);
        if (!active.current) return;
        setResults(found);
        if (found.length) onLocate(found[0]);
        finish(found.length ? `${found.length}件見つかりました。候補を選ぶと地図が移動します` : "場所が見つかりませんでした");
      } catch (error) {
        finish(error instanceof Error && error.name !== "TimeoutError" && error.name !== "TypeError" ? error.message : "場所検索に接続できませんでした。通信を確認して再試行してください");
      }
    }}>
      <label htmlFor="place-query">場所を探す</label>
      <div className="place-search-row">
        <input id="place-query" value={query} onChange={e => setQuery(e.target.value)} placeholder="地名・住所・駅名・施設名を検索" maxLength={200} required />
        <button type="submit" disabled={busy}>検索</button>
        <button type="button" disabled={busy} onClick={() => {
          if (!navigator.geolocation) { setStatus("このブラウザでは現在地を取得できません"); return; }
          inFlight.current = true;
          setBusy(true); setStatus("現在地を取得中…");
          navigator.geolocation.getCurrentPosition(position => {
            if (!active.current) return;
            onLocate({ lat: position.coords.latitude, lng: position.coords.longitude, label: "現在地" }, true);
            setResults([]);
            finish("現在地へ移動しました。位置情報は投稿として保存されません");
          }, error => finish(error.code === 1 ? "位置情報の利用が拒否されました。ブラウザの設定で許可してください" : "現在地を取得できませんでした。時間をおいて再試行してください"), { timeout: 10000, maximumAge: 60000 });
        }}>現在地</button>
      </div>
    </form>
    {status && <p role="status">{status}</p>}
    {results.length > 0 && <ul className="place-candidates" aria-label="場所検索の候補">{results.map((result, i) => <li key={`${result.lat}:${result.lng}:${i}`}><button type="button" onClick={() => { onLocate(result); setStatus(`${result.label}へ移動しました`); }}>{result.label}</button></li>)}</ul>}
    <small>場所検索: <a href="https://nominatim.org/">Nominatim</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors（日本国内・検索時に検索語を送信）</small>
  </section>;
}
