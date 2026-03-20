import { fetchAllProducts, isAvailable, formatPrice, ShopifyProduct } from './shopify';
import { buildRssFeed, RssItem } from './rss';

export interface Env {
  KV: KVNamespace;
  SHOP_BASE_URL: string;
  FEED_SELF_URL: string;
}

// KVキー定義
const KV_AVAILABILITY = 'state:availability';
const KV_KNOWN_HANDLES = 'state:known_handles';
const KV_FEED_ALL = 'feed:all';
// feed:vendor:{encodedVendor} で各アーティストのフィードを保存

const MAX_RSS_ITEMS = 50;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // GET / → 全体フィード
      if (path === '/' || path === '/feed.xml') {
        return serveFeed(env, KV_FEED_ALL, env.FEED_SELF_URL, 'FIND ME STORE 全商品通知');
      }

      // GET /vendors → アーティスト一覧
      if (path === '/vendors') {
        return serveVendorList(env);
      }

      // GET /vendors/:name → アーティスト別フィード
      const vendorMatch = path.match(/^\/vendors\/(.+)$/);
      if (vendorMatch) {
        const vendorEncoded = vendorMatch[1];
        const vendor = decodeURIComponent(vendorEncoded);
        const feedKey = `feed:vendor:${vendorEncoded}`;
        const feedUrl = `${env.FEED_SELF_URL}vendors/${vendorEncoded}`;
        return serveFeed(env, feedKey, feedUrl, `FIND ME STORE - ${vendor}`);
      }

      // POST /refresh → 手動更新（デバッグ用）
      if (path === '/refresh' && request.method === 'POST') {
        const result = await runCheck(env);
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // GET /debug → KV状態確認
      if (path === '/debug') {
        return serveDebug(env);
      }

      return new Response('Not Found', { status: 404 });
    } catch (e) {
      console.error('Unhandled error:', e);
      return new Response(`Error: ${e}`, { status: 500 });
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    try {
      await runCheck(env);
    } catch (e) {
      console.error('Scheduled check failed:', e);
    }
  },
};

async function serveFeed(
  env: Env,
  feedKey: string,
  feedUrl: string,
  title: string
): Promise<Response> {
  const items = await loadItems(env, feedKey);
  const xml = buildRssFeed(items, feedUrl, env.SHOP_BASE_URL, title);
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=UTF-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

async function serveVendorList(env: Env): Promise<Response> {
  const raw = await env.KV.get('state:vendors');
  const vendors: string[] = raw ? (JSON.parse(raw) as string[]) : [];

  const baseUrl = env.FEED_SELF_URL.replace(/\/$/, '');
  const items = vendors.map((v) => {
    const encoded = encodeURIComponent(v);
    return `<li><a href="${baseUrl}/vendors/${encoded}">${v}</a></li>`;
  });

  const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><title>FIND ME STORE RSS - アーティスト一覧</title></head>
<body>
<h1>FIND ME STORE RSS フィード</h1>
<ul>
  <li><a href="${baseUrl}/">全商品フィード</a></li>
</ul>
<h2>アーティスト別フィード</h2>
<ul>${items.join('\n')}</ul>
</body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

async function serveDebug(env: Env): Promise<Response> {
  const [availability, knownHandles, vendors, allItems] = await Promise.all([
    env.KV.get(KV_AVAILABILITY),
    env.KV.get(KV_KNOWN_HANDLES),
    env.KV.get('state:vendors'),
    env.KV.get(KV_FEED_ALL),
  ]);

  const known = knownHandles ? (JSON.parse(knownHandles) as string[]) : [];
  const all = allItems ? (JSON.parse(allItems) as RssItem[]) : [];

  return new Response(
    JSON.stringify({
      knownHandlesCount: known.length,
      rssItemsCount: all.length,
      vendors: vendors ? JSON.parse(vendors) : [],
      availabilityCount: availability ? Object.keys(JSON.parse(availability)).length : 0,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

interface CheckResult {
  newProducts: number;
  restocks: number;
  totalKnown: number;
  errors: string[];
}

async function runCheck(env: Env): Promise<CheckResult> {
  const result: CheckResult = { newProducts: 0, restocks: 0, totalKnown: 0, errors: [] };

  console.log('Starting check for all products');

  // 現在の状態をロード
  const [prevAvailability, knownHandlesArr] = await Promise.all([
    loadAvailability(env),
    loadKnownHandles(env),
  ]);

  // Set で高速ルックアップ（3000件超でも O(1)）
  const knownHandles = new Set(knownHandlesArr);

  console.log(`Loaded state: ${knownHandles.size} known handles`);

  // ストア全商品を取得
  let products: ShopifyProduct[];
  try {
    products = await fetchAllProducts(env.SHOP_BASE_URL);
  } catch (e) {
    const msg = `Failed to fetch products: ${e}`;
    console.error(msg);
    result.errors.push(msg);
    return result;
  }
  console.log(`Fetched ${products.length} products`);

  const newAvailability: Record<string, boolean> = { ...prevAvailability };
  const allNewEvents: RssItem[] = [];
  const vendorEvents: Record<string, RssItem[]> = {};
  const vendorSet = new Set<string>(await loadVendors(env));

  for (const product of products) {
    const available = isAvailable(product);
    newAvailability[product.handle] = available;
    vendorSet.add(product.vendor);

    const productUrl = `${env.SHOP_BASE_URL}/products/${product.handle}`;
    const imageUrl = normalizeImageUrl(product.images[0]?.src, env.SHOP_BASE_URL);
    const price = formatPrice(product);
    const pubDate = new Date().toUTCString();

    let event: RssItem | null = null;

    if (!knownHandles.has(product.handle)) {
      event = {
        guid: `new-${product.handle}`,
        title: `【新商品】${product.title}`,
        link: productUrl,
        description: buildDescription(product, price, available, '新商品が追加されました'),
        pubDate,
        imageUrl,
        vendor: product.vendor,
      };
      result.newProducts++;
    } else if (product.handle in prevAvailability && !prevAvailability[product.handle] && available) {
      event = {
        guid: `restock-${product.handle}-${Date.now()}`,
        title: `【在庫復活】${product.title}`,
        link: productUrl,
        description: buildDescription(product, price, available, '在庫が復活しました'),
        pubDate,
        imageUrl,
        vendor: product.vendor,
      };
      result.restocks++;
    }

    if (event) {
      allNewEvents.push(event);
      if (!vendorEvents[product.vendor]) vendorEvents[product.vendor] = [];
      vendorEvents[product.vendor].push(event);
    }
  }

  result.totalKnown = Object.keys(newAvailability).length;
  console.log(`Check complete: ${result.newProducts} new, ${result.restocks} restocks`);

  // 状態を保存
  const currentHandles = Object.keys(newAvailability);
  const writes: Promise<void>[] = [
    env.KV.put(KV_AVAILABILITY, JSON.stringify(newAvailability)),
    env.KV.put(KV_KNOWN_HANDLES, JSON.stringify(currentHandles)),
    env.KV.put('state:vendors', JSON.stringify([...vendorSet].sort())),
  ];

  if (allNewEvents.length > 0) {
    // 全体フィード更新
    const existing = await loadItems(env, KV_FEED_ALL);
    const merged = [...allNewEvents, ...existing].slice(0, MAX_RSS_ITEMS);
    writes.push(env.KV.put(KV_FEED_ALL, JSON.stringify(merged)));

    // アーティスト別フィード更新
    for (const [vendor, events] of Object.entries(vendorEvents)) {
      const key = `feed:vendor:${encodeURIComponent(vendor)}`;
      const existingVendor = await loadItems(env, key);
      const mergedVendor = [...events, ...existingVendor].slice(0, MAX_RSS_ITEMS);
      writes.push(env.KV.put(key, JSON.stringify(mergedVendor)));
    }
  }

  await Promise.all(writes);
  return result;
}

function buildDescription(
  product: ShopifyProduct,
  price: string,
  available: boolean,
  eventText: string
): string {
  const status = available ? '✅ 購入可能' : '❌ 在庫なし';
  return `<p><strong>${eventText}</strong></p><p>${product.vendor} / ${product.product_type}</p><p>価格: ${price}</p><p>状態: ${status}</p>`;
}

function normalizeImageUrl(src: string | undefined, baseUrl: string): string | undefined {
  if (!src) return undefined;
  if (src.startsWith('//')) return `https:${src}`;
  if (src.startsWith('http')) return src;
  return `${baseUrl}${src}`;
}

async function loadAvailability(env: Env): Promise<Record<string, boolean>> {
  const raw = await env.KV.get(KV_AVAILABILITY);
  return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
}

async function loadKnownHandles(env: Env): Promise<string[]> {
  const raw = await env.KV.get(KV_KNOWN_HANDLES);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

async function loadItems(env: Env, key: string): Promise<RssItem[]> {
  const raw = await env.KV.get(key);
  return raw ? (JSON.parse(raw) as RssItem[]) : [];
}

async function loadVendors(env: Env): Promise<string[]> {
  const raw = await env.KV.get('state:vendors');
  return raw ? (JSON.parse(raw) as string[]) : [];
}
