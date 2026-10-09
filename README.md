# デジタル街歩きマップ

地域を知る、地域でつながる。React + TypeScript + Vite / Leaflet + OpenStreetMap / Supabase のスマートフォン向けWebアプリです。

- リポジトリ: https://github.com/kkodamalab/digital-town-walk-map
- 公開予定: https://kkodamalab.github.io/digital-town-walk-map/
- 実装済み: 街の記録と御用聞きの共通地図、カテゴリ・キーワード・メディア検索、地図と一覧、写真拡大・動画/音声再生、EXIF GPS、地図タップ/ドラッグ/座標入力/現在地、住所検索、投稿・非公開保存・承認申請、支援応募、自分の応募一覧、管理者承認・公開停止・通報管理・状態更新・仲介マッチング・完了記録、取下げ・削除。
- **Supabase未設定ではデモです。投稿・応募はReactの一時状態のみ。再読込で消え、サーバーへ永続保存・公開されません。デモアカウントは認証ではなく、管理者権限もありません。**
- 無効なURL/秘密キーを設定するとエラー表示し、実データ接続を停止します。デモの架空の依頼は実在しません。

## ローカル起動

Node.js **24** とnpmを使用します（クラウドで24.19.0を検証）。

```sh
npm ci
cp .env.example .env.local
npm run dev
```

ブラウザで開発サーバーの `/digital-town-walk-map/` を開きます。`.env.local` はGit管理対象外です。Supabase未設定のままでも動作します。

```sh
npm test
npx playwright install --with-deps chromium
npm run test:e2e
npm run build
npm run preview
```

Linuxで既存Chromiumを使う場合は `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`。ビルドの配信パスは `vite.config.ts` の `/digital-town-walk-map/` 固定です。ハッシュ/履歴によるルーティングを使わず、Pagesの深いパス404を避けます。

## Supabaseプロジェクト作成・SQL

1. https://supabase.com/dashboard で **New project**。Organizationを選び、Nameを `digital-town-walk-map`、Database Passwordは強い値を安全に保存、Regionは利用者に近い **Northeast Asia (Tokyo)** を選択して **Create new project**。
2. **SQL Editor → New query** に `supabase/migrations/202610090001_initial.sql` 全文を貼り付け、**Run**。新規DB向けの一度だけのマイグレーションです。既存同名テーブルがあるプロジェクトには無検討で適用しないでください。
3. **Database → Tables**（またはTable Editor）で全テーブルのRLSがEnabledであることを確認。`user_roles`、`daily_usage`、`geocode_gate` もRLSを有効化しています。
4. **Project Settings → Data API** のProject URLと **Project Settings → API Keys** のPublishable key（`sb_publishable_...`）またはlegacy `anon` keyを取得。
5. `.env.local` に以下を設定し、開発サーバーを再起動。

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
```

**service_role、`sb_secret_`、DBパスワードをVITE変数・ソース・GitHub Variablesに入れないでください。** 公開キーはビルド成果物に含まれます。公開キーの秘匿に依存せずDBのRLSで保護します。URLのみ/キーのみの設定は接続エラー扱いです。

## Storage

SQLが **Storage → Buckets** に `town-media` を自動作成します。

- **Public bucket = OFF**（変更しない）。File size limit **25MB / 26214400 bytes**。
- Allowed MIME types: `image/jpeg, image/png, image/webp, video/mp4, video/webm, audio/mpeg, audio/mp4, audio/x-m4a, audio/wav, audio/x-wav, audio/webm`。
- オブジェクトパス: `AUTH_USER_UUID/CONTENT_UUID/RANDOM_UUID`。一記録につき最大5件。一般利用者は自分の未公開記録にだけ添付可能。
- 公開済みと非公開のファイルを**同じprivateバケット内のDB連動ポリシーで分離**。公開バケットを追加すると承認・取下げを迂回するので使いません。
- 公開承認された記録に限り未ログインでも5分有効の署名URLを発行できます。取下げ後は新規URLを発行できませんが、既に発行したURLは最長5分有効です。閲覧者が保存したコピーは撤回できません。
- 署名URLが切れた場合は一覧の **再読込** で更新します。
- MIME/サイズをStorage側でも制限。ブラウザでは先頭シグネチャも確認しますが、悪意のあるAPI直呼び出しに対する完全なウイルス検査・メディア変換は未導入です。管理者は公開前に安全な環境で添付を確認してください。
- 投稿削除はDBレコードを削除します。Storageに残った孤立オブジェクトは一般閲覧者から読めなくなりますが、物理ファイルの定期削除は管理者の作業です。保持期間に従いStorage管理画面で削除してください。

## Auth

1. **Authentication → Sign In / Providers → Email** を有効にします。必要に応じて新規登録を許可、メール確認を有効にしてください。
2. **Authentication → URL Configuration** の **Site URL** = `https://kkodamalab.github.io/digital-town-walk-map/`。
3. **Redirect URLs** に `https://kkodamalab.github.io/digital-town-walk-map/` と開発用 `http://localhost:5173/digital-town-walk-map/` を追加。開発ポート変更時は対応するURLも追加。
4. **Authentication → Rate Limits** で送信制限を確認。本運用は **Project Settings → Authentication / SMTP Settings** のCustom SMTPを設定し、メール到達・メールテンプレートのリンクを検証してください（Dashboardの表示名は更新で多少変わります）。
5. ログインボタンからメールを送信、同じブラウザでリンクを開くことでSupabase Authセッションが作成されます。メールアドレスは投稿/応募テーブルに保存しません。

Supabaseのメール送信・Storage API・Edge Functionは接続先プロジェクト未設定の環境では未検証です。SQLのローカルRLS試験と本番Auth/Storageサービスの結合試験は異なります。

## 管理者初期設定

対象者が一度ログインした後、**Authentication → Users** から対象者の **User UID** をコピーします。プロジェクト管理者が **SQL Editor → New query → Run** で実行します。

```sql
insert into public.user_roles(user_id, role)
values ('ここを管理者の実際のUser UIDに置換', 'admin');
```

取り消し:

```sql
delete from public.user_roles where user_id = '対象のUser UID';
```

メール文字列やブラウザのフラグで管理者判定しません。`is_admin()` がDBの `user_roles` を検証します。一般ユーザーはこのテーブルに書き込めません。ロール変更後は **再読込** またはログインし直してください。管理者は地図/一覧の **管理画面** から未承認投稿を開き **承認して公開**。御用聞きでは **自分の応募・管理** にある応募を選択し **マッチング確定**。DB関数で応募と依頼をロックしてマッチング記録と状態を同一トランザクションで更新します。最後に依頼の状態を **完了** にすると完了日時を保存します。

連絡調整は運営者がアプリ外で行います。初期版は非公開連絡先を収集していないため、地域窓口など別途合意した連絡経路が必要です。管理者メールや運営窓口を運用開始時に案内してください。チャット・電話番号公開・アプリ内決済は実装しません。

## 住所検索（Geoapify）

公開Nominatimには接続しません。実データでは認証済みユーザーがSupabase Edge Function経由でGeoapifyへ検索します。

1. https://myprojects.geoapify.com/ でプロジェクトを作成しGeocoding APIのキーを発行。契約プランの利用量と規約を確認。
2. Supabase CLIを公式手順で導入し、プロジェクトルートから以下を実行。

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set GEOAPIFY_API_KEY=YOUR_SERVER_ONLY_KEY APP_ORIGIN=https://kkodamalab.github.io
supabase functions deploy geocode --no-verify-jwt
```

キーはサーバー用シークレットでありVITE変数に置きません。CLI履歴への値の残留を避けたい場合はDashboardの **Edge Functions → Secrets** から `GEOAPIFY_API_KEY` と `APP_ORIGIN` を安全に登録してください。ローカル開発時は `APP_ORIGIN=http://localhost:5173` に変更（本番へ戻し忘れないこと）。

ゲートウェイのlegacy JWT検証は使わず、関数内の `auth.getUser()` で実際のユーザーJWTを必須検証します（未認証リクエストは401）。

3. **Edge Functions → geocode → Logs** でエラーと利用量を監視。検索は明示的な送信だけ、1ユーザー1日30回、全ユーザー合計1秒1回（DBロック）、プロバイダ呼び出し10秒タイムアウト。失敗した検索も日次枠を消費します。プロバイダプランがこれより厳しい場合は制限を調整してください。
4. 未設定では検索がエラーになるため地図タップ/座標入力/現在地を利用可能です。デモ検索は「東京」または「駅」を含む文字列だけに架空の結果を返し、実住所検索であると表示しません。
5. 検索結果の出典はGeoapify（OpenStreetMap等）。規約 https://www.geoapify.com/terms-and-conditions/ を確認してください。

## GitHub Actions / GitHub Pages

同名リポジトリは既に存在していました。既存の初期コミットと `.gitattributes` を保持しています。

1. リポジトリ **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定。
2. **Settings → Actions → General → Actions permissions** でこのリポジトリのActionsと公式Actionsを許可。
3. **Settings → Secrets and variables → Actions → Variables → New repository variable** で実データ時だけ以下を登録。
   - Name `VITE_SUPABASE_URL`, Value `https://YOUR_PROJECT_REF.supabase.co`
   - Name `VITE_SUPABASE_PUBLISHABLE_KEY`, Value 公開publishable/anon key
   - デモ配信なら両方とも未設定。
4. `service_role` やGeoapifyキーをGitHubへ登録しません。GeoapifyキーはSupabase Edge Functions Secretsのみ。PagesデプロイはGitHub提供 `GITHUB_TOKEN` を使用し、個人トークン不要です。
5. `main` へのpushで `.github/workflows/pages.yml` が単体試験・ブラウザ試験・DB/RLS試験・ビルド・Pagesデプロイを実行します。手動再実行は **Actions → Test and deploy Pages → Run workflow → Branch: main → Run workflow**。
6. **Settings → Environments → github-pages** に承認ルールがある場合、運営者がActionsの承認待ちジョブを承認。
7. 成功後、 https://kkodamalab.github.io/digital-town-walk-map/ を開き、タイトル・デモ表示/実データ表示・地図帰属・カード・モバイル・ログイン帰還を確認。
8. GitHub APIやPagesドメインへのネットワーク制限があるクラウドでは、環境設定の許可ドメインに `api.github.com`, `kkodamalab.github.io`, `tile.openstreetmap.org` を追加。Supabase接続には実プロジェクトの `YOUR_PROJECT_REF.supabase.co` を追加。UI利用者のブラウザからも通信できることを確認。

アプリ公開（GitHub Pages）とCodexクラウド環境のPublishは別操作です。クラウドの設定ドラフトはレビュー・保存・環境Publishを行ってはじめて後続タスクの環境に反映されます。

## DB/RLSテスト

ローカルのPostgreSQL 17でSupabaseのAuth/Storageスキーマを模したハーネスを使い、**実際の非特権DBロール**で試験します。実プロジェクトへテスト用スキーマを適用しないでください。

```sh
docker run --name town-map-test -e POSTGRES_PASSWORD=local-test-only -d postgres:17
# pg_isready が成功してから実行
docker exec town-map-test pg_isready -U postgres
docker exec -i town-map-test psql -U postgres -v ON_ERROR_STOP=1 < tests/rls-bootstrap.sql
docker exec -i town-map-test psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/202610090001_initial.sql
docker exec -i town-map-test psql -U postgres -v ON_ERROR_STOP=1 < tests/rls.test.sql
docker rm -f town-map-test
```

試験データはトランザクションでrollbackされます。未公開記録・地点・添付・依頼・応募・マッチの読み取り拒否、自己承認拒否、ロール自己付与拒否、未認証応募拒否、承認公開、本人の応募閲覧、管理者仲介、完了日時、公開停止、座標の丸めを検証します。GPS写真フィクスチャは架空の座標を持つ最小EXIF JPEGです。

## 安全・運用上の注意

- **公開前に個人情報の運用、掲載同意、添付内容、運営窓口、保持期間、削除手順を管理者が確認**してください。投稿本文や地域名に本名・詳細住所・連絡先を書かないよう明示していますが自動除去は未導入です。
- 住民インタビューは公開同意チェックをUIとDB双方で必須にしています。
- 御用聞きは町丁目/代表地点を指定、保存座標はDBでも小数2桁に丸めます。丸めだけで匿名性を保証しません。地域名や本文から自宅を特定できないか管理者が審査。正確な住所の入力欄・連絡先欄はありません。
- 一般募集に医療行為・身体介助・危険作業を含めない。専門機関への案内は運営者が行います。
- 投稿は原則承認待ち。非公開・取下げは本人と管理者だけが閲覧。応募は応募者本人と管理者だけ（依頼投稿者にも非公開）。管理者情報とマッチ記録は一般公開しません。
- テキストはReactの通常のテキスト表示を使用し、HTMLを注入しません。ユーザーが指定した外部URLをメディアとして直接登録できません。
- 投稿/地点/依頼/応募/通報はユーザーごと各20件/日、添付は5件/記録。並行操作もDBで計数。管理者もこの投稿制限の対象。応募は同一依頼へ1回。Authの送信制限も設定してください。
- Leafletは必要な表示範囲のOSMタイルだけを取得し、帰属を常時表示。タイル先読み・一括取得・キャッシュ無効化・オフライン配布は実装しません。通常のブラウザキャッシュを尊重します。公開OSMタイルにSLAはありません。利用増加時は提供者の規約に沿う専用サービスへ切替。https://operations.osmfoundation.org/policies/tiles/ を遵守してください。
- 未実装: 自動ウイルス検査/トランスコード/EXIF除去、添付の自動物理削除、応募の取下げUI、通知、監査イベント履歴、ページング、プロフィール編集、通報時の自動停止。直接チャット・電話公開・決済は初期版の対象外。
- 次の追加候補: 実SupabaseのAuth/Storage/Edge Functions結合試験、ファイル安全化、監査ログ・通知、保持期間に基づく削除ジョブ、地域別運営設定、負荷とアクセシビリティ改善。
