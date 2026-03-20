# CLAUDE.md

このファイルは、このリポジトリでコードを扱う際に Claude Code への指針を提供します。

## プロジェクト概要

findmestore.thinkr.jp（Shopifyストア）の **新商品追加** および **在庫復活** を検知してRSSフィードを配信する Cloudflare Worker です。

## 技術スタック

- **Runtime**: Cloudflare Workers (TypeScript)
- **State**: Cloudflare KV
- **Polling**: Cloudflare Cron Triggers（5分ごと）

## ファイル構成

```
src/
├── index.ts    # Worker エントリーポイント（ルーティング・ポーリングロジック）
├── shopify.ts  # Shopify JSON API クライアント
└── rss.ts      # RSS 2.0 XML ビルダー
wrangler.toml   # Cloudflare Workers 設定
```

## KV データ構造

| キー | 内容 |
|------|------|
| `state:availability` | `{handle: boolean}` 全商品の在庫状態 |
| `state:known_handles` | `string[]` 既知の商品ハンドル一覧 |
| `state:vendors` | `string[]` アーティスト名一覧 |
| `feed:all` | `RssItem[]` 全商品フィード（最大50件） |
| `feed:vendor:{encoded}` | `RssItem[]` アーティスト別フィード |

## エンドポイント

| パス | 説明 |
|------|------|
| `GET /` | 全商品RSSフィード |
| `GET /vendors` | アーティスト一覧HTML |
| `GET /vendors/:name` | アーティスト別RSSフィード |
| `POST /refresh` | 手動更新（デバッグ用）。JSON結果を返す |
| `GET /debug` | KV状態確認（デバッグ用） |

## 開発コマンド

```bash
npm run dev          # ローカル開発サーバー起動
npm run deploy       # Cloudflare Workers にデプロイ
npm run type-check   # TypeScript 型チェック
```

## デプロイ済み URL

- **本番**: https://findme-rss.0g0.xyz/
- **Workers.dev**: https://findme-rss.0g0.workers.dev/

## 注意事項

- `COLLECTION_HANDLES` 環境変数でカンマ区切りに監視コレクションを指定
- 初回デプロイ後は `POST /refresh` で初期状態を構築すること
- 在庫復活の検知は `available: false → true` の変化を監視する
- 新商品は `state:known_handles` に未登録のハンドルで検知する
