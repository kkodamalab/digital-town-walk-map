import { useEffect, useState, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import TownMap from "./Map";
import { db, configurationError } from "./backend";
import { demoRecords, demoRequests } from "./demo";
import {
  recordCategories,
  helpCategories,
  statuses,
  approximate,
  extractGPS,
  mediaKind,
  validateMedia,
  filterEntries,
  geocode,
  assertCoordinates,
} from "./domain";
import type { Entry, Media, Application } from "./domain";

export default function App() {
  const [mode, setMode] = useState<"records" | "help">("records"),
    [view, setView] = useState("map");
  const [records, setRecords] = useState<Entry[]>(db ? [] : demoRecords),
    [requests, setRequests] = useState<Entry[]>(db ? [] : demoRequests);
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [kind, setKind] = useState("");
  const [selected, setSelected] = useState<Entry | null>(null),
    [form, setForm] = useState(false),
    [apply, setApply] = useState(false),
    [auth, setAuth] = useState(false),
    [adminView, setAdminView] = useState(false),
    [admin, setAdmin] = useState(false);
  const [user, setUser] = useState<User | null>(null),
    [demoUser, setDemoUser] = useState(false),
    [applications, setApplications] = useState<Application[]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [position, setPosition] = useState<[number, number]>([35.681, 139.767]),
    [files, setFiles] = useState<File[]>([]),
    [preview, setPreview] = useState<Media[]>([]),
    [searchAddress, setSearchAddress] = useState(""),
    [results, setResults] = useState<
      { lat: number; lng: number; label: string }[]
    >([]),
    [appHistory, setAppHistory] = useState(false),
    [reports, setReports] = useState<
      {
        id: string;
        reason: string;
        content_id?: string;
        request_id?: string;
        resolved: boolean;
      }[]
    >([]),
    [reportView, setReportView] = useState(false);
  const lastSearch = useRef(0),
    demoUrls = useRef<string[]>([]);
  const logged = Boolean(user || demoUser),
    categories = mode === "records" ? recordCategories : helpCategories;
  const error = (e: unknown) =>
    setNotice(e instanceof Error ? e.message : "操作に失敗しました");
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  async function refresh(u?: User | null) {
    if (!db) return;
    const who = u === undefined ? user : u;
    if (who) {
      const { error: profileError } = await db
        .from("profiles")
        .upsert({ id: who.id }, { onConflict: "id", ignoreDuplicates: true });
      if (profileError) throw profileError;
    }
    const { data: role, error: roleErr } = await db.rpc("is_admin");
    if (roleErr) throw roleErr;
    setAdmin(Boolean(role));
    const { data: r, error: re } = await db
      .from("contents")
      .select("*, places(name,lat,lng), media_assets(*)")
      .order("created_at", { ascending: false });
    if (re) throw re;
    const transformed = await Promise.all(
      (r ?? []).map(async (row) => {
        const media: Media[] = await Promise.all(
          (row.media_assets ?? []).map(
            async (m: {
              id: string;
              path: string;
              kind: Media["kind"];
              name: string;
            }) => {
              const { data, error } = await db!.storage
                .from("town-media")
                .createSignedUrl(m.path, 300);
              if (error) throw error;
              return { ...m, url: data.signedUrl };
            },
          ),
        );
        return {
          ...row,
          lat: row.places.lat,
          lng: row.places.lng,
          place_name: row.places.name,
          media,
        };
      }),
    );
    setRecords(transformed);
    const { data: h, error: he } = await db
      .from("help_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (he) throw he;
    setRequests((h ?? []).map((e) => ({ ...e, media: [] })));
    if (role) {
      const { data: reports, error: reportError } = await db
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (reportError) throw reportError;
      setReports(reports ?? []);
    } else setReports([]);
    if (who) {
      const { data: a, error: ae } = await db
        .from("help_applications")
        .select("*");
      if (ae) throw ae;
      setApplications(a ?? []);
    } else setApplications([]);
  }
  useEffect(() => {
    if (!db) return;
    let alive = true;
    db.auth.getSession().then(({ data, error: e }) => {
      if (e) {
        error(e);
        return;
      }
      if (alive) {
        setUser(data.session?.user ?? null);
        void run(() => refresh(data.session?.user ?? null));
      }
    });
    const { data } = db.auth.onAuthStateChange((_event, session) => {
      if (alive) {
        setUser(session?.user ?? null);
        setAdmin(false);
        if (!session) {
          setApplications([]);
          setReports([]);
          setRecords((old) =>
            old.filter((entry) => entry.visibility === "public"),
          );
          setRequests((old) =>
            old.filter((entry) => entry.visibility === "public"),
          );
          setSelected(null);
          setForm(false);
          setApply(false);
        }
        setTimeout(() => {
          if (alive) void run(() => refresh(session?.user ?? null));
        }, 0);
      }
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(
    () => () => {
      demoUrls.current.forEach(URL.revokeObjectURL);
    },
    [],
  );
  const entries = filterEntries(
    mode === "records" ? records : requests,
    query,
    category,
    kind,
  ).filter((e) =>
    adminView && admin
      ? true
      : e.visibility === "public" ||
        (logged && (e.owner_id === user?.id || e.owner_id === "demo-user")),
  );
  function closeForm() {
    setForm(false);
    setFiles([]);
    setPreview([]);
    setResults([]);
  }
  async function chooseFiles(list: FileList | null) {
    if (!list) return;
    await run(async () => {
      const all = Array.from(list);
      if (all.length > 5) throw new Error("添付は5件までです");
      await Promise.all(all.map(validateMedia));
      const gps = await extractGPS(all[0]);
      if (gps) {
        setPosition([gps.lat, gps.lng]);
        setNotice("写真のGPS位置を設定しました。位置を確認してください。");
      } else
        setNotice(
          "GPS情報がありません。地図・住所検索・現在地で位置を指定してください。",
        );
      setFiles(all);
      setPreview(
        all.map((f) => {
          const url = URL.createObjectURL(f);
          demoUrls.current.push(url);
          return { url, kind: mediaKind(f), name: f.name };
        }),
      );
    });
  }
  async function submitEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    await run(async () => {
      if (!logged) throw new Error("投稿にはログインが必要です");
      assertCoordinates(...position);
      const val = (k: string) => String(data.get(k) ?? "").trim();
      const cat = val("category");
      if (cat === "住民インタビュー" && !data.get("consent"))
        throw new Error("住民インタビューには公開同意確認が必要です");
      const coords =
        mode === "help"
          ? approximate(...position)
          : { lat: position[0], lng: position[1] };
      const entry: Entry = {
        id: crypto.randomUUID(),
        owner_id: user?.id ?? "demo-user",
        title: val("title"),
        description: val("description"),
        category: cat,
        display_name: val("display_name"),
        ...coords,
        visibility: val("visibility"),
        media: preview,
      };
      if (mode === "records")
        Object.assign(entry, {
          place_name: val("place_name"),
          recorded_at: val("recorded_at") || null,
          credit: val("credit"),
          consent: Boolean(data.get("consent")),
        });
      else
        Object.assign(entry, {
          area: val("area"),
          desired_at: val("desired_at"),
          frequency: val("frequency"),
          reward: val("reward"),
          status: "承認待ち",
        });
      if (db) {
        if (mode === "records") {
          let placeId = val("place_id");
          if (!placeId) {
            const { data: p, error: pe } = await db
              .from("places")
              .insert({
                name: entry.place_name,
                lat: entry.lat,
                lng: entry.lng,
                owner_id: user!.id,
              })
              .select("id")
              .single();
            if (pe) throw pe;
            placeId = p.id;
          }
          const { error: ce } = await db.from("contents").insert({
            id: entry.id,
            place_id: placeId,
            owner_id: user!.id,
            title: entry.title,
            description: entry.description,
            category: entry.category,
            display_name: entry.display_name,
            recorded_at: entry.recorded_at,
            credit: entry.credit,
            consent: entry.consent,
            visibility: entry.visibility,
          });
          if (ce) throw ce;
          for (const f of files) {
            const path = `${user!.id}/${entry.id}/${crypto.randomUUID()}`;
            const { error: ue } = await db.storage
              .from("town-media")
              .upload(path, f, { contentType: f.type });
            if (ue)
              throw new Error(
                `投稿は保存されましたが添付に失敗しました: ${ue.message}`,
              );
            const { error: me } = await db.from("media_assets").insert({
              content_id: entry.id,
              owner_id: user!.id,
              path,
              kind: mediaKind(f),
              name: f.name,
            });
            if (me) throw me;
          }
        } else {
          const { media, id, ...payload } = entry;
          const { error: he } = await db
            .from("help_requests")
            .insert({ id, ...payload });
          if (he) throw he;
        }
        await refresh();
      } else
        (mode === "records" ? setRecords : setRequests)((old) => [
          entry,
          ...old,
        ]);
      closeForm();
      setNotice(
        db
          ? "保存しました。管理者承認後に公開されます。"
          : "デモ投稿をこの画面の一時状態に保存しました。公開・永続保存はされません。",
      );
    });
  }
  async function submitApplication(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(async () => {
      if (!logged || !selected) throw new Error("応募にはログインが必要です");
      if (selected.status !== "募集中")
        throw new Error("現在は募集していません");
      const a = {
        id: crypto.randomUUID(),
        request_id: selected.id,
        display_name: String(f.get("display_name")),
        capability: String(f.get("capability")),
        availability: String(f.get("availability")),
        message: String(f.get("message")),
      };
      if (db) {
        const { error: e } = await db
          .from("help_applications")
          .insert({ ...a, applicant_id: user!.id });
        if (e) throw e;
        await refresh();
      } else setApplications((old) => [a, ...old]);
      setApply(false);
      setNotice(
        db
          ? "応募しました。管理者からの調整をお待ちください。"
          : "デモ応募です。実際の応募・マッチングは行われません。",
      );
    });
  }
  async function changeVisibility(
    entry: Entry,
    visibility: string,
    status?: string,
  ) {
    await run(async () => {
      if (!logged) throw new Error("ログインが必要です");
      if (visibility === "public" && !admin)
        throw new Error("管理者のみ公開できます");
      if (db) {
        const { error: e } = await db
          .from(mode === "records" ? "contents" : "help_requests")
          .update({ visibility, ...(status ? { status } : {}) })
          .eq("id", entry.id);
        if (e) throw e;
        await refresh();
      } else
        (mode === "records" ? setRecords : setRequests)((old) =>
          old.map((x) =>
            x.id === entry.id
              ? { ...x, visibility, ...(status ? { status } : {}) }
              : x,
          ),
        );
      setSelected(null);
      setNotice("更新しました");
    });
  }
  async function removeEntry(entry: Entry) {
    if (!window.confirm("投稿を削除しますか？この操作は取り消せません。"))
      return;
    await run(async () => {
      if (db) {
        const { error: e } = await db
          .from(mode === "records" ? "contents" : "help_requests")
          .delete()
          .eq("id", entry.id);
        if (e) throw e;
        await refresh();
      } else
        (mode === "records" ? setRecords : setRequests)((old) =>
          old.filter((x) => x.id !== entry.id),
        );
      setSelected(null);
      setNotice("削除しました");
    });
  }
  function mediaView(media: Media[]) {
    return (
      <div className="media-grid">
        {media.map((m) => (
          <figure key={m.url}>
            {m.kind === "photo" ? (
              <a href={m.url} target="_blank" rel="noreferrer">
                <img src={m.url} alt={m.name} />
              </a>
            ) : m.kind === "video" ? (
              <video controls preload="metadata" src={m.url} />
            ) : (
              <audio controls preload="metadata" src={m.url} />
            )}
            <figcaption>{m.name}</figcaption>
          </figure>
        ))}
      </div>
    );
  }
  const isOwn = (entry: Entry) =>
    logged && (entry.owner_id === user?.id || entry.owner_id === "demo-user");
  return (
    <>
      <header>
        <div className="brand">
          ⌖ <span>まちのつながり</span>
        </div>
        <button onClick={() => setAuth(true)}>
          {logged ? "アカウント" : "ログイン"}
        </button>
      </header>
      <main>
        <section className="hero">
          <p className="eyebrow">WALK • DISCOVER • CONNECT</p>
          <h1>デジタル街歩きマップ</h1>
          <p className="subtitle">地域を知る、地域でつながる</p>
          <p>
            いつもの道の、新しい発見。
            <br />
            まちの記憶と、小さな「お手伝い」をつなぎます。
          </p>
        </section>
        {!db && (
          <div className="banner">
            {configurationError
              ? "設定エラー：公開キー・URLを確認してください。実データ接続は停止しています。"
              : "デモモード · 架空の街と依頼です。投稿・応募は画面を閉じると消えます。実際の公開やマッチングは行いません。"}
          </div>
        )}
        {db && (
          <div className="banner">
            実データモード · 投稿は管理者承認後に公開します。
          </div>
        )}
        <nav className="mode-switch" aria-label="メインモード">
          {(["records", "help"] as const).map((m, i) => (
            <button
              key={m}
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setCategory("");
                setKind("");
                setSelected(null);
                setAdminView(false);
              }}
            >
              {i === 0 ? "▧ 街の記録" : "♡ 地域の御用聞き"}
              <small>
                {i === 0 ? "まちの魅力を見つける" : "できることから支え合う"}
              </small>
            </button>
          ))}
        </nav>
        <section className="workspace">
          <div className="section-title">
            <div>
              <p className="eyebrow">
                {mode === "records" ? "TOWN ARCHIVE" : "COMMUNITY SUPPORT"}
              </p>
              <h2>
                {mode === "records"
                  ? "街に残る、小さな物語"
                  : "地域の「困った」をつなぐ"}
              </h2>
            </div>
            <button
              className="primary"
              onClick={() => (logged ? setForm(true) : setAuth(true))}
            >
              ＋ {mode === "records" ? "記録を投稿" : "困り事を相談"}
            </button>
          </div>
          <div className="toolbar">
            <label className="search">
              ⌕{" "}
              <input
                aria-label="キーワード検索"
                placeholder="キーワードで探す"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="カテゴリ"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">すべてのカテゴリ</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            {mode === "records" && (
              <select
                aria-label="メディア種別"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="">すべての記録</option>
                <option value="photo">写真</option>
                <option value="video">動画</option>
                <option value="audio">音声</option>
              </select>
            )}
            <div className="view-switch">
              <button
                aria-pressed={view === "map"}
                onClick={() => setView("map")}
              >
                地図
              </button>
              <button
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                一覧
              </button>
            </div>
          </div>
          {mode === "help" && (
            <p className="safety">
              依頼の位置は約1km単位の地域表示です。正確な住所・連絡先は入力しないでください。医療行為・身体介助・危険作業は募集対象外です。
            </p>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button aria-label="通知を閉じる" onClick={() => setNotice("")}>
                ×
              </button>
            </div>
          )}
          {busy && <p role="status">処理中です…</p>}
          {admin && (
            <button onClick={() => setAdminView(!adminView)}>
              {adminView ? "通常表示へ" : "管理画面：承認待ち・非公開も表示"}
            </button>
          )}
          {view === "map" && (
            <TownMap entries={entries} onSelect={setSelected} />
          )}
          <div className="list-heading">
            <h3>{adminView ? "管理対象の投稿" : "まちの投稿"}</h3>
            <span>{entries.length}件</span>
            {db && (
              <button disabled={busy} onClick={() => void run(() => refresh())}>
                再読込
              </button>
            )}
            {admin && (
              <button onClick={() => setReportView(true)}>通報管理</button>
            )}
            <button onClick={() => setAppHistory(true)}>
              自分の応募{admin ? "・管理" : ""}
            </button>
          </div>
          <div className="cards">
            {entries.map((e) => (
              <button
                className="card"
                key={e.id}
                onClick={() => setSelected(e)}
              >
                {e.media[0]?.kind === "photo" ? (
                  <img src={e.media[0].url} alt={e.media[0].name} />
                ) : (
                  <div
                    className={
                      "card-art " + (mode === "help" ? "help-art" : "")
                    }
                  >
                    {mode === "help"
                      ? "♡"
                      : e.category === "住民インタビュー"
                        ? "❝"
                        : "♫"}
                  </div>
                )}
                <div className="card-body">
                  <span className="tag">{e.category}</span>
                  {e.status && <span className="status">{e.status}</span>}
                  <h3>{e.title}</h3>
                  <p>{e.description}</p>
                  <small>
                    ⌖ {e.place_name ?? e.area} ·{" "}
                    {e.visibility === "public"
                      ? "公開済み"
                      : "承認待ち / 非公開"}
                  </small>
                </div>
              </button>
            ))}
          </div>
          {!entries.length && <p>該当する投稿がありません。</p>}
        </section>
        <section className="about">
          <h2>まちを歩こう。つながりを育もう。</h2>
          <p>
            写真一枚、ひとつの思い出、小さなお手伝い。
            <br />
            あなたの参加が、地域の次の物語になります。
          </p>
        </section>
      </main>
      <footer>
        デジタル街歩きマップ · 地域を知る、地域でつながる
        <br />
        地図 © OpenStreetMap contributors ·
        自動巡回・タイルの一括取得・オフライン保存は行いません。
      </footer>
      {selected && (
        <div className="overlay">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="投稿の詳細"
          >
            <button
              className="close"
              aria-label="詳細を閉じる"
              onClick={() => {
                setSelected(null);
                setApply(false);
              }}
            >
              ×
            </button>
            <span className="tag">{selected.category}</span>
            <h2>{selected.title}</h2>
            <p className="preserve">{selected.description}</p>
            {mediaView(selected.media)}
            <dl>
              <dt>場所</dt>
              <dd>{selected.place_name ?? selected.area}</dd>
              <dt>投稿者表示名</dt>
              <dd>{selected.display_name}</dd>
              {selected.recorded_at && (
                <>
                  <dt>撮影・収録日時</dt>
                  <dd>{selected.recorded_at}</dd>
                </>
              )}
              {selected.credit && (
                <>
                  <dt>クレジット・出典</dt>
                  <dd>{selected.credit}</dd>
                </>
              )}
              {mode === "help" && (
                <>
                  <dt>募集状態</dt>
                  <dd>{selected.status}</dd>
                  <dt>希望日時・頻度・謝礼</dt>
                  <dd>
                    {selected.desired_at} / {selected.frequency} /{" "}
                    {selected.reward}
                  </dd>
                </>
              )}
            </dl>
            {mode === "help" && selected.status === "募集中" && (
              <button
                className="primary"
                onClick={() => (logged ? setApply(true) : setAuth(true))}
              >
                お手伝いを申し出る
              </button>
            )}
            {apply && (
              <form onSubmit={submitApplication}>
                <h3>
                  {db ? "支援に応募" : "デモ応募（実際には送信しません）"}
                </h3>
                <Field label="応募者表示名" name="display_name" />
                <Field label="対応できる内容" name="capability" />
                <Field label="対応可能日時" name="availability" />
                <Field
                  label="メッセージ（連絡先・住所を含めない）"
                  name="message"
                  textarea
                />
                <button disabled={busy} className="primary">
                  応募する
                </button>
              </form>
            )}
            {(isOwn(selected) || admin) && (
              <div className="actions">
                <button
                  onClick={() =>
                    changeVisibility(
                      selected,
                      "private",
                      mode === "help" ? "取消" : undefined,
                    )
                  }
                >
                  取下げ・公開停止
                </button>
                <button onClick={() => removeEntry(selected)}>削除</button>
              </div>
            )}
            {admin && (
              <div className="admin">
                <h3>管理者操作</h3>
                <button
                  onClick={() =>
                    changeVisibility(
                      selected,
                      "public",
                      mode === "help" ? "募集中" : undefined,
                    )
                  }
                >
                  承認して公開
                </button>
                {mode === "help" && (
                  <label>
                    状態更新
                    <select
                      value={selected.status}
                      onChange={(e) => {
                        if (e.target.value === "マッチング成立") {
                          setNotice(
                            "応募一覧で対象の応募を選び、マッチングを確定してください",
                          );
                          setAppHistory(true);
                        } else
                          void changeVisibility(
                            selected,
                            selected.visibility,
                            e.target.value,
                          );
                      }}
                    >
                      {statuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
            <button
              onClick={() =>
                void run(async () => {
                  if (!logged) {
                    setAuth(true);
                    return;
                  }
                  const reason =
                    window.prompt("通報理由（個人情報を含めない）");
                  if (!reason) return;
                  if (db) {
                    const { error: e } = await db.from("reports").insert({
                      reporter_id: user!.id,
                      reason,
                      content_id: mode === "records" ? selected.id : null,
                      request_id: mode === "help" ? selected.id : null,
                    });
                    if (e) throw e;
                  }
                  setNotice(
                    db
                      ? "通報を受け付けました"
                      : "デモ通報です。運営者には送信されません。",
                  );
                })
              }
            >
              投稿を通報する
            </button>
          </section>
        </div>
      )}
      {form && (
        <div className="overlay">
          <section
            className="dialog wide"
            role="dialog"
            aria-modal="true"
            aria-label="投稿フォーム"
          >
            <button
              className="close"
              aria-label="投稿を閉じる"
              onClick={closeForm}
            >
              ×
            </button>
            <h2>{mode === "records" ? "街の記録を投稿" : "困り事を相談"}</h2>
            <p>
              本名・連絡先・詳細住所を含めないでください。投稿は承認後に公開されます。
            </p>
            <form onSubmit={submitEntry}>
              <Field label="タイトル" name="title" />
              <Field label="説明・依頼内容" name="description" textarea />
              <label>
                カテゴリ
                <select name="category">
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <Field label="投稿者表示名" name="display_name" />
              {mode === "records" ? (
                <>
                  <Field label="地点名" name="place_name" />
                  <label>
                    既存の地点に追加（任意）
                    <select
                      name="place_id"
                      onChange={(e) => {
                        const r = records.find(
                          (r) => r.place_id === e.target.value,
                        );
                        if (r) setPosition([r.lat, r.lng]);
                      }}
                    >
                      <option value="">新しい地点</option>
                      {Array.from(
                        new Map(
                          records
                            .filter((r) => r.place_id)
                            .map((r) => [r.place_id, r]),
                        ).values(),
                      ).map((r) => (
                        <option key={r.place_id} value={r.place_id}>
                          {r.place_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label="撮影・収録日時（任意）"
                    name="recorded_at"
                    type="datetime-local"
                    required={false}
                  />
                  <Field
                    label="クレジット・資料出典（任意）"
                    name="credit"
                    required={false}
                  />
                  <label className="check">
                    <input type="checkbox" name="consent" />
                    住民インタビューの公開同意を確認しました
                  </label>
                  <label>
                    添付ファイル（最大5件・各25MB）
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/wav,audio/webm"
                      onChange={(e) => void chooseFiles(e.target.files)}
                    />
                  </label>
                  {mediaView(preview)}
                </>
              ) : (
                <>
                  <Field
                    label="おおまかな地域（町丁目・代表地点）"
                    name="area"
                  />
                  <Field label="希望日時" name="desired_at" />
                  <label>
                    頻度
                    <select name="frequency">
                      <option>単発</option>
                      <option>継続</option>
                    </select>
                  </label>
                  <label>
                    謝礼
                    <select name="reward">
                      <option>無償</option>
                      <option>有償</option>
                      <option>応相談</option>
                    </select>
                  </label>
                </>
              )}
              <h3>位置を指定</h3>
              <p>
                {mode === "help"
                  ? "地域の代表地点を指定してください。座標は約1km単位に丸めて保存します。"
                  : "地図をタップし、ピンをドラッグして調整できます。"}
              </p>
              <TownMap
                entries={[]}
                onSelect={() => {}}
                position={position}
                onPick={(lat, lng) => setPosition([lat, lng])}
              />
              <div className="coordinates">
                <label>
                  緯度
                  <input
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    value={position[0]}
                    onChange={(e) =>
                      setPosition([Number(e.target.value), position[1]])
                    }
                  />
                </label>
                <label>
                  経度
                  <input
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    value={position[1]}
                    onChange={(e) =>
                      setPosition([position[0], Number(e.target.value)])
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!navigator.geolocation) {
                    setNotice("現在地を取得できません");
                    return;
                  }
                  navigator.geolocation.getCurrentPosition(
                    (p) => setPosition([p.coords.latitude, p.coords.longitude]),
                    () =>
                      setNotice(
                        "現在地の取得が許可されていないか、取得できませんでした",
                      ),
                    { timeout: 10000 },
                  );
                }}
              >
                現在地を利用（許可が必要）
              </button>
              <label>
                住所・施設名
                <input
                  value={searchAddress}
                  onChange={(e) => setSearchAddress(e.target.value)}
                  placeholder="住所検索は送信ボタンで実行"
                />
              </label>
              <button
                disabled={busy}
                type="button"
                onClick={() =>
                  void run(async () => {
                    if (Date.now() - lastSearch.current < 1500)
                      throw new Error("少し待ってから検索してください");
                    lastSearch.current = Date.now();
                    const found = await geocode(searchAddress, async (q) => {
                      if (!db) {
                        if (q.includes("東京") || q.includes("駅"))
                          return [
                            {
                              lat: 35.681,
                              lon: 139.767,
                              display_name: "東京駅付近（デモ検索）",
                            },
                          ];
                        return [];
                      }
                      if (!user)
                        throw new Error("住所検索にはログインが必要です");
                      const { data, error: e } = await db.functions.invoke(
                        "geocode",
                        { body: { query: q } },
                      );
                      if (e)
                        throw new Error(
                          "住所検索に失敗しました。通信・ログイン・検索サービス設定を確認してください",
                        );
                      return data;
                    });
                    setResults(found);
                  })
                }
              >
                住所検索
              </button>
              {results.map((r, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => setPosition([r.lat, r.lng])}
                >
                  {r.label}
                </button>
              ))}
              <label>
                公開状態
                <select name="visibility">
                  <option value="pending">
                    承認申請（管理者確認後に公開）
                  </option>
                  <option value="private">非公開（本人・管理者のみ）</option>
                </select>
              </label>
              <button className="primary" disabled={busy}>
                {db ? "承認申請を送信" : "デモ投稿を保存"}
              </button>
            </form>
          </section>
        </div>
      )}
      {auth && (
        <div className="overlay">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="ログイン"
          >
            <button
              className="close"
              aria-label="ログインを閉じる"
              onClick={() => setAuth(false)}
            >
              ×
            </button>
            <h2>{logged ? "アカウント" : "ログイン"}</h2>
            {logged ? (
              <button
                onClick={() =>
                  void run(async () => {
                    if (db) {
                      const { error: signOutError } = await db.auth.signOut();
                      if (signOutError) throw signOutError;
                    }
                    setUser(null);
                    setDemoUser(false);
                    setAdmin(false);
                    setApplications([]);
                    setReports([]);
                    setSelected(null);
                    setForm(false);
                    setRecords((old) =>
                      old.filter((entry) => entry.visibility === "public"),
                    );
                    setRequests((old) =>
                      old.filter((entry) => entry.visibility === "public"),
                    );
                    setAuth(false);
                  })
                }
              >
                ログアウト
              </button>
            ) : db ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    const { error: e } = await db!.auth.signInWithOtp({
                      email: String(f.get("email")),
                      options: {
                        emailRedirectTo:
                          location.origin + import.meta.env.BASE_URL,
                      },
                    });
                    if (e) throw e;
                    setNotice("ログイン用メールを送信しました");
                    setAuth(false);
                  });
                }}
              >
                <Field
                  label="メールアドレス（公開しません）"
                  name="email"
                  type="email"
                />
                <button className="primary" disabled={busy}>
                  ログインメールを送信
                </button>
              </form>
            ) : (
              <>
                <p>
                  デモアカウントは認証済みアカウントではありません。実データへの投稿・応募はできません。
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    setDemoUser(true);
                    setAuth(false);
                    setNotice(
                      "デモアカウントで体験中です。管理者権限はありません。",
                    );
                  }}
                >
                  デモ利用を開始
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {reportView && admin && (
        <div className="overlay">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="通報管理"
          >
            <button
              className="close"
              aria-label="通報管理を閉じる"
              onClick={() => setReportView(false)}
            >
              ×
            </button>
            <h2>通報管理</h2>
            {reports.map((r) => (
              <article key={r.id}>
                <p>{r.reason}</p>
                <p>{r.resolved ? "対応済み" : "未対応"}</p>
                <button
                  onClick={() => {
                    const entry = r.content_id
                      ? records.find((e) => e.id === r.content_id)
                      : requests.find((e) => e.id === r.request_id);
                    if (entry) {
                      setMode(r.content_id ? "records" : "help");
                      setReportView(false);
                      setSelected(entry);
                    } else setNotice("対象の投稿は削除されています");
                  }}
                >
                  対象投稿を確認・公開停止
                </button>
                <button
                  onClick={() =>
                    void run(async () => {
                      const { error: e } = await db!
                        .from("reports")
                        .update({ resolved: true })
                        .eq("id", r.id);
                      if (e) throw e;
                      await refresh();
                    })
                  }
                >
                  対応済みにする
                </button>
              </article>
            ))}
            {!reports.length && <p>通報はありません。</p>}
          </section>
        </div>
      )}
      {appHistory && (
        <div className="overlay">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="応募一覧"
          >
            <button
              className="close"
              aria-label="応募一覧を閉じる"
              onClick={() => setAppHistory(false)}
            >
              ×
            </button>
            <h2>{admin ? "応募管理" : "自分の応募"}</h2>
            <p>応募情報は応募者本人と管理者だけが閲覧できます。</p>
            {(logged ? applications : []).map((a) => (
              <article key={a.id}>
                <h3>
                  {a.display_name} ·{" "}
                  {requests.find((r) => r.id === a.request_id)?.title ?? "依頼"}
                </h3>
                <p>
                  {a.capability} / {a.availability}
                </p>
                <p>{a.message}</p>
                {admin && (
                  <button
                    onClick={() =>
                      void run(async () => {
                        if (!db) return;
                        const { error: e } = await db.rpc("confirm_match", {
                          application_id: a.id,
                        });
                        if (e) throw e;
                        await refresh();
                        setNotice(
                          "マッチングを確定しました。運営者がアプリ外で連絡調整してください。",
                        );
                      })
                    }
                  >
                    マッチング確定
                  </button>
                )}
              </article>
            ))}
            {!applications.length && (
              <p>
                {logged
                  ? "応募はありません"
                  : "ログインして自分の応募を確認してください"}
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
function Field({
  label,
  name,
  type = "text",
  required = true,
  textarea = false,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  textarea?: boolean;
}) {
  return (
    <label>
      {label}
      {textarea ? (
        <textarea name={name} required={required} maxLength={3000} rows={4} />
      ) : (
        <input name={name} type={type} required={required} maxLength={200} />
      )}
    </label>
  );
}
