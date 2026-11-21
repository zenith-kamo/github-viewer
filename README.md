<img src="src/assets/icon.png" width="64" height="64" alt="">

# github-mirror

GitHub リポジトリを軽量に閲覧する静的クライアント。esbuild でバンドル・minify して `public/` に出力します。

## 機能

- リポジトリ検索（GitHub REST Search API）
- リポジトリ概要（説明・トピック・スター・フォーク・ライセンス・言語構成）
- README の Markdown レンダリング（相対リンク・画像を自動で書き換え）
- ファイルツリー閲覧（パンくず・ブランチ / タグ / コミット切り替え）
- ソース表示（シンタックスハイライト・行番号・Markdown プレビュー切替）
- 画像プレビュー / バイナリのダウンロード
- アクセストークン設定（localStorage 保存）とレート制限表示
- 接続先の切り替え（ミラー API / 別 CDN / ungh）と自動フォールバック
- 最近見たリポジトリ

## データ取得の方針

| 用途 | 既定の使用 API | 備考 |
| --- | --- | --- |
| リポジトリ検索 | `https://api.github.com/search/repositories` | 未認証 10 回/分 |
| リポジトリ概要 | `https://api.github.com/repos/{owner}/{repo}` | 未認証 60 回/時 |
| 言語構成 | `https://api.github.com/repos/{owner}/{repo}/languages` | 失敗時は非表示 |
| ファイル一覧 | `https://data.jsdelivr.com/v1/packages/gh/{owner}/{repo}@{ref}?structure=flat` | **レート制限なし** |
| ファイル本文 | `https://cdn.jsdelivr.net/gh/{owner}/{repo}@{ref}/{path}` | 失敗時は raw にフォールバック |
| フォールバック | `https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}` | CORS 対応 |

ファイル一覧を jsDelivr の data API から取ることで、GitHub API の消費を「概要 1 回 + 言語 1 回」程度に抑えています。ファイル本文も CDN から取得するため、閲覧を重ねてもレート制限に達しにくい構成です。

## github.com に接続できない場合

右上の歯車ボタン（接続設定）から、すべての接続先を変更できます。設定は localStorage に保存されます。

### モード

- **GitHub API（公式 / ミラー）** — 検索・概要・ツリーを GitHub 互換 API から取得します。
- **ungh（非公式 API）** — `https://ungh.cc` から概要・ツリー・README を取得します。検索は GitHub 互換 API が必要です。

### プリセット

| 種類 | プリセット |
| --- | --- |
| API | GitHub 公式 / KKGitHub / gh-proxy 経由 / ghproxy.net 経由 |
| CDN | jsDelivr / Fastly / Gcore / jsdmirror / jsd.onmicrosoft.cn / Statically / raw.githack |
| ファイル一覧 | jsDelivr data API |
| Raw | GitHub raw / gh-proxy 経由 / ghproxy.net 経由 |

テンプレートでは次のプレースホルダが使えます。

```
{owner} {repo} {ref} {refEncoded} {path} {pathEncoded}
```

`{refEncoded}` はスラッシュを含むブランチ名を 1 セグメントにエンコードします（jsDelivr 用）。`{ref}` はスラッシュをパス区切りとして残します（raw 用）。

### 自動フォールバック

「失敗時に自動でミラーへフォールバック」を有効にすると、次の順で試します。

- API: 設定値 → KKGitHub → gh-proxy → ghproxy.net
- CDN: 設定値 → Fastly → Gcore → jsdmirror → jsd.onmicrosoft.cn
- Raw: 設定値 → gh-proxy → ghproxy.net

一度成功した接続先はセッション中優先されます。設定を保存するとリセットされます。

### 接続テスト

接続設定の「接続テスト」で、API / CDN / ファイル一覧 / Raw / ungh の到達性とレイテンシを確認できます。

### セキュリティ

アクセストークンは既定で **公式 `api.github.com` にのみ** 送信します。ミラーにも送る場合は「ミラーにもアクセストークンを送信」を明示的に有効にしてください（非推奨）。

### 注意

- ミラーは可用性・CORS 対応・応答形式が保証されません。接続テストで確認してください。
- `github.com` 自体が使えない場合、「GitHub で開く」などの外部リンクは開けません。閲覧機能は上記の設定で動作します。
- 検索は GitHub 互換の Search API が必要です。ミラーが検索に対応していない場合は、公式 API か検索対応のミラーを指定してください。

### 補足

- jsDelivr はブランチの内容を最大 12 時間程度キャッシュします。最新のコミットを即座に見たい場合は Raw リンクを使ってください。
- コード検索が必要な場合は GitHub の code search API（認証必須）か、grep.app / Sourcegraph などの外部 API を併用するのが現実的です。GraphQL API はブラウザから直接叩けない（CORS 非対応）ため、プロキシが必要です。
- トークンを設定すると GitHub API の上限が 5,000 回/時になります。トークンは既定で公式 API にのみ使用し、ミラーへは送信しません。

## 開発とビルド

```sh
npm install
npm run dev      # http://localhost:5173 （src を監視して自動ビルド）
npm run build    # public/ に minify 済みの成果物を出力
npm run preview  # public/ をそのまま配信
```

`public/` がデプロイ用の成果物です。`npm run build` で毎回作り直されます。

- `src/js/app.js` を esbuild でバンドル・minify → `public/assets/app.min.js`
- `src/styles.css` + highlight.js テーマを minify → `public/styles.css`
- `src/index.html` と `src/assets/icon.png` / `src/assets/favicon.ico` をコピー

marked / DOMPurify / highlight.js は npm パッケージとしてバンドルされるため、実行時に CDN へ取りに行きません。

### ソースを直接配信しない

`src/` はビルド前のソースです。`src/index.html` は `./assets/app.min.js` を参照するため、`src/` をそのまま配信しても動きません。`npm run dev` か `npm run build` を使ってください。

## URL

```
#/                                  ホーム
#/search?q=react                    検索結果
#/{owner}/{repo}                    概要 + README
#/{owner}/{repo}/tree/{ref}/{path}  ディレクトリ
#/{owner}/{repo}/blob/{ref}/{path}  ファイル
```

`ref` はブランチ名・タグ・コミット SHA のいずれかです。スラッシュを含むブランチ名は URL エンコードされます。

## 構成

```
src/
  index.html      シェル
  styles.css      ダークテーマ
  assets/icon.png
  assets/favicon.ico
  js/config.js    接続先の設定・プリセット・フォールバック順
  js/api.js       GitHub REST / jsDelivr / ungh の取得・キャッシュ
  js/markdown.js  Markdown レンダリングとリンク書き換え
  js/app.js       ルーティングと各ビュー
scripts/
  build.mjs       esbuild によるバンドル・minify
  dev.mjs         監視ビルド + 静的サーバー
public/           ビルド成果物（デプロイ対象）
  index.html
  styles.css
  assets/app.min.js
  assets/icon.png
  assets/favicon.ico
```

Markdown は marked、サニタイズは DOMPurify、ハイライトは highlight.js をバンドルして使用します。
