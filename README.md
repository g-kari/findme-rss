# findme-rss

[findmestore.thinkr.jp](https://findmestore.thinkr.jp) の **新商品追加** と **在庫復活** を検知してRSSフィードを配信する Cloudflare Worker です。

## フィード URL（本番）

| フィード | URL |
|---------|-----|
| 全商品 | https://findme-rss.0g0.xyz/ |
| アーティスト一覧 | https://findme-rss.0g0.xyz/vendors |
| 花譜 | https://findme-rss.0g0.xyz/vendors/%E8%8A%B1%E8%AD%9C |
| 理芽 | https://findme-rss.0g0.xyz/vendors/%E7%90%86%E8%8A%BD |
| ヰ世界情緒 | https://findme-rss.0g0.xyz/vendors/%E3%83%B0%E4%B8%96%E7%95%8C%E6%83%85%E7%B7%92 |
| 春猿火 | https://findme-rss.0g0.xyz/vendors/%E6%98%A5%E7%8C%BF%E7%81%AB |
| 幸祜 | https://findme-rss.0g0.xyz/vendors/%E5%B9%B8%E7%A5%9C |
| V.W.P | https://findme-rss.0g0.xyz/vendors/V.W.P |
| Albemuth | https://findme-rss.0g0.xyz/vendors/Albemuth |
| 神椿市建設中。 | https://findme-rss.0g0.xyz/vendors/%E7%A5%9E%E6%A4%BF%E5%B8%82%E5%BB%BA%E8%A8%AD%E4%B8%AD%E3%80%82 |

## 仕組み

```
Cloudflare Cron（5分ごと）
  ↓
Shopify JSON API をポーリング
  ↓
新商品 / 在庫復活 を検出
  ↓
Cloudflare KV に状態 + RSSアイテムを保存
  ↓
GET / でRSSフィードを配信
```

## 通知されるイベント

| イベント | 例 |
|---------|---|
| 🆕 新商品追加 | `【新商品】【花譜】「怪歌」デジタルライブパンフレット` |
| 📦 在庫復活 | `【在庫復活】【理芽】「ニューロマンス」デジタルライブパンフレット` |

## セットアップ（再デプロイ手順）

### 1. 依存関係インストール

```bash
npm install
```

### 2. Cloudflare にログイン

```bash
npx wrangler login
```

### 3. KV Namespace 作成（初回のみ）

```bash
npx wrangler kv namespace create findme-rss-kv
npx wrangler kv namespace create findme-rss-kv --preview
```

取得した `id` と `preview_id` を `wrangler.toml` に設定する。

### 4. デプロイ

```bash
npm run deploy
```

### 5. 初期状態の構築

```bash
curl -X POST https://findme-rss.0g0.xyz/refresh
```

## 開発

```bash
npm run dev          # ローカル開発（http://localhost:8787）
npm run type-check   # 型チェック
```

### デバッグエンドポイント

```bash
# KV状態確認
curl https://findme-rss.0g0.workers.dev/debug

# 手動更新（結果をJSON返却）
curl -X POST https://findme-rss.0g0.workers.dev/refresh
```

## 監視対象の変更

`wrangler.toml` の `COLLECTION_HANDLES` を編集：

```toml
[vars]
COLLECTION_HANDLES = "digital-contents,merch"  # カンマ区切りで追加可能
```
