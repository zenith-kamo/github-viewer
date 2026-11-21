<img src="src/assets/icon.png" width="64" height="64" alt="">

# github-mirror

GitHub リポジトリを軽量に閲覧する静的クライアント。

## 機能

- リポジトリ検索
- リポジトリ概要
- README の Markdown レンダリング
- ファイルツリー閲覧
- ソース表示
- 画像プレビュー / バイナリのダウンロード
- アクセストークン設定とレート制限表示
- 接続先の切り替えと自動フォールバック
- 最近見たリポジトリ

### モード

- 検索・概要・ツリーを GitHub互換 API から取得します。
- ungh — unghから概要・ツリー・README を取得します。検索は GitHub 互換 API が必要です。

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

## 開発とビルド

```sh
npm install
npm run dev      # http://localhost:5173 （src を監視して自動ビルド）
npm run build    # public/ に minify 済みの成果物を出力
npm run preview  # public/ をそのまま配信
```
marked / DOMPurify / highlight.js は npm パッケージとしてバンドルされるため、実行時に CDN へ取りに行きません。