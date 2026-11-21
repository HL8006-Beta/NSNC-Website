const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzn235XktBTj_JXq8m9Xro4413BxeKq3L_n3RcslatdZ2Rvfr_jDuxvs9Bq6BSu5S_H/exec';
const SITE_ORIGIN = 'https://nsnc.vercel.app';
const PUBLICATION_NAME = 'NSW Student News Community';

function escapeXml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function toIsoDate(raw) {
    if (!raw) return new Date().toISOString();
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function normalizeForSitemap(item, index) {
    if (!item || typeof item !== 'object') return null;
    const title = String(item.headline || item.title || '').trim();
    if (!title) return null;

    const rawId = item.id !== undefined && item.id !== null && String(item.id).trim() !== ''
        ? String(item.id).trim()
        : (item.rowId !== undefined && item.rowId !== null && String(item.rowId).trim() !== ''
            ? String(item.rowId).trim()
            : String(index));
    const sheetId = rawId.startsWith('sheet_') ? rawId : `sheet_${rawId}`;
    const publishedAt = toIsoDate(item.published_at || item.timestamp || item.date);

    return {
        id: sheetId,
        title,
        publishedAt
    };
}

module.exports = async function handler(req, res) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

    try {
        const sep = APPS_SCRIPT_URL.includes('?') ? '&' : '?';
        const response = await fetch(`${APPS_SCRIPT_URL}${sep}t=${Date.now()}`, {
            method: 'GET',
            redirect: 'follow'
        });

        let articles = [];
        if (response.ok) {
            const data = await response.json().catch(() => null);
            const rawList = Array.isArray(data) ? data : (Array.isArray(data && data.articles) ? data.articles : []);
            articles = rawList
                .map((item, idx) => normalizeForSitemap(item, idx))
                .filter(Boolean)
                .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        }

        const urlEntries = articles.map(art => {
            const loc = `${SITE_ORIGIN}/api/article?id=${encodeURIComponent(art.id)}`;
            return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${escapeXml(art.publishedAt)}</lastmod>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(PUBLICATION_NAME)}</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${escapeXml(art.publishedAt)}</news:publication_date>
      <news:title>${escapeXml(art.title)}</news:title>
    </news:news>
  </url>`;
        }).join('\n');

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urlEntries}
</urlset>`;

        return res.status(200).send(xml);
    } catch (err) {
        const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
</urlset>`;
        return res.status(200).send(emptyXml);
    }
};
