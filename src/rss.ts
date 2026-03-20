export interface RssItem {
  guid: string;
  title: string;
  link: string;
  description: string;
  pubDate: string;
  imageUrl?: string;
  vendor?: string;
}

export function buildRssFeed(
  items: RssItem[],
  feedUrl: string,
  shopUrl: string,
  title = 'FIND ME STORE 在庫・新商品通知'
): string {
  const lastBuildDate = new Date().toUTCString();

  const itemsXml = items
    .map((item) => {
      const imageTag = item.imageUrl
        ? `<enclosure url="${escapeXml(item.imageUrl)}" type="image/jpeg" length="0"/>\n        <media:thumbnail xmlns:media="http://search.yahoo.com/mrss/" url="${escapeXml(item.imageUrl)}"/>`
        : '';
      return `
    <item>
      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <description><![CDATA[${item.description}]]></description>
      <pubDate>${item.pubDate}</pubDate>
      ${imageTag}
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(shopUrl)}</link>
    <description>findmestore.thinkr.jp の在庫復活・新商品追加をお知らせします</description>
    <language>ja</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>
    ${itemsXml}
  </channel>
</rss>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
