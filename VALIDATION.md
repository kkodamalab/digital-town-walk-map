# 実行結果（2026-10-09）

|検証|結果|
|---|---|
|Node 24 / npm ci（凍結lockfile、キャッシュ `/tmp/town-npm-cache`）|成功|
|TypeScript + Vite production build|成功|
|Vitest単体試験|9件成功。EXIF GPS実バイナリ、GPSなし、座標丸め、住所検索正常/空/無効/通信異常、ファイル形式/サイズ/シグネチャ、秘密キー拒否、検索フィルタ|
|Playwright PC + モバイル390px|8件成功。地図ピン・詳細・写真/文章/音声、デモ投稿/応募、承認待ち、取消、未認証制限、管理UI非表示、地図タップ/ドラッグ、GPS写真、住所検索、XSSテキスト表示、動画/音声実再生、横幅|
|PostgreSQL17 + 非特権anon/authenticatedロール|34項目成功。全テーブルRLS、秘密情報隔離、管理者自己付与拒否、自己承認拒否、ファイル権限、応募本人/管理者限定、管理者マッチング、完了日時、取下げ、日次投稿上限、住所検索全体レート制限|
|production previewのサブパスHTTP / JS|PC・スマホHTTP200、各3カード/3ピン、JavaScript例外0、横スクロールなし|
|OSMタイルHTTPS取得（curl、TLS検証有効）|HTTP200|
|ブラウザからの外部OSMタイル取得|未確認。直接通信が通らず、プロキシ指定時はChromiumがプロキシCAを信頼せず `ERR_CERT_AUTHORITY_INVALID`。永続的CA登録は自動承認レビューが拒否。TLS検証を無効にせずHTTP取得を代替検証|
|本番Supabase Auth/DB/Storage/Edge Function結合試験|未実施。プロジェクトURL・公開キー・Geoapifyサーバーキー未設定。ローカルDBハーネスはSupabase本番サービスそのものではない|
|本番Geoapify住所検索・現在地許可ダイアログ|未実施。Geoapify未設定、実GPS位置と利用者許可が必要。デモ検索・異常系と手動位置指定は検証済み|
|npm audit（本番依存）|脆弱性0件|

GitHub操作・公開状態は作業終了時に報告します。Pages未有効化時に `https://kkodamalab.github.io/digital-town-walk-map/` はHTTP404を返しました。APIによるPages作成は `Resource not accessible by integration`（403）で拒否されています。ブラウザ証明書の制限とGitHub連携権限の制限は別の問題です。

ローカルで確認した動作を、公開済みまたは本番サービスで検証済みとは扱いません。
