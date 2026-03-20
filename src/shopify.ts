export interface ShopifyVariant {
  id: number;
  title: string;
  available: boolean;
  price: string;
  sku: string;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  published_at: string;
  updated_at: string;
  vendor: string;
  product_type: string;
  variants: ShopifyVariant[];
  images: Array<{ src: string }>;
}

const FETCH_DELAY_MS = 1000; // ページ間の待機時間（サーバー負荷軽減）

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchAllProducts(baseUrl: string): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];
  let page = 1;

  while (true) {
    if (page > 1) {
      await sleep(FETCH_DELAY_MS);
    }
    const url = `${baseUrl}/products.json?limit=250&page=${page}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'findme-rss/1.0' },
    });
    if (!res.ok) {
      throw new Error(`Shopify API error: ${res.status} for ${url}`);
    }
    const data = (await res.json()) as { products: ShopifyProduct[] };
    if (data.products.length === 0) break;
    products.push(...data.products);
    if (data.products.length < 250) break;
    page++;
  }

  return products;
}

export async function fetchCollectionProducts(
  baseUrl: string,
  collectionHandle: string
): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];
  let page = 1;

  while (true) {
    const url = `${baseUrl}/collections/${collectionHandle}/products.json?limit=250&page=${page}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'findme-rss/1.0' },
    });
    if (!res.ok) {
      throw new Error(`Shopify API error: ${res.status} for ${url}`);
    }
    const data = (await res.json()) as { products: ShopifyProduct[] };
    if (data.products.length === 0) break;
    products.push(...data.products);
    if (data.products.length < 250) break;
    page++;
  }

  return products;
}

export function isAvailable(product: ShopifyProduct): boolean {
  return product.variants.some((v) => v.available);
}

export function formatPrice(product: ShopifyProduct): string {
  const price = product.variants[0]?.price;
  if (!price) return '';
  const yen = parseInt(price, 10);
  return `¥${yen.toLocaleString('ja-JP')}`;
}
