const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzn235XktBTj_JXq8m9Xro4413BxeKq3L_n3RcslatdZ2Rvfr_jDuxvs9Bq6BSu5S_H/exec';
const SITE_ORIGIN = 'https://nsnc.vercel.app';
const SITE_NAME = 'NSW Student News Community';
const DEFAULT_IMAGE = `${SITE_ORIGIN}/NSNC%20Logo.png`;

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeJsonLd(obj) {
    return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function toIsoDate(raw) {
    if (!raw) return new Date().toISOString();
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function cleanPlainText(text) {
    return String(text || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\[IMAGE:\s*[^\]]+\]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeImageUrl(raw) {
    const val = String(raw || '').trim();
    if (!val || val.startsWith('data:') || val.startsWith('blob:') || val.includes('placehold.co')) {
        return DEFAULT_IMAGE;
    }
    if (/^https?:\/\//i.test(val)) return val;
    return DEFAULT_IMAGE;
}

function normalizeArticle(item, index) {
    if (!item || typeof item !== 'object') return null;
    const rawId = item.id !== undefined && item.id !== null && String(item.id).trim() !== ''
        ? String(item.id).trim()
        : (item.rowId !== undefined && item.rowId !== null && String(item.rowId).trim() !== ''
            ? String(item.rowId).trim()
            : String(index));
    const sheetId = rawId.startsWith('sheet_') ? rawId : `sheet_${rawId}`;
    const headline = String(item.headline || item.title || '').trim() || 'Untitled Story';
    const body = String(item.body || item.summary || '').trim();
    const imageUrl = normalizeImageUrl(item.image_url || item.imageUrl || item.image);
    const author = String(item.author || '').trim() || 'Y.C';
    const publishedAt = toIsoDate(item.published_at || item.timestamp || item.date);

    return {
        rawId,
        sheetId,
        headline,
        body,
        imageUrl,
        author,
        publishedAt
    };
}

function buildFallbackHtml(reason) {
    const fallbackTitle = `${SITE_NAME} (NSNC)`;
    const fallbackDesc = 'Independent, non-profit student journalism informing today\'s students for tomorrow across New South Wales and beyond.';
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(fallbackTitle)}</title>
    <meta name="description" content="${escapeHtml(fallbackDesc)}" />
    <link rel="canonical" href="${SITE_ORIGIN}/" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(fallbackTitle)}" />
    <meta property="og:description" content="${escapeHtml(fallbackDesc)}" />
    <meta property="og:image" content="${DEFAULT_IMAGE}" />
    <meta property="og:url" content="${SITE_ORIGIN}/" />
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(fallbackTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(fallbackDesc)}" />
    <meta name="twitter:image" content="${DEFAULT_IMAGE}" />
    <script>
        (function () {
            var ua = navigator.userAgent || '';
            var isBot = /bot|crawler|spider|googlebot|bingbot|slurp|duckduckbot|baiduspider|yandex|whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|applebot|pinterest|preview/i.test(ua);
            if (!isBot) {
                window.location.replace(${JSON.stringify(`${SITE_ORIGIN}/`)});
            }
        })();
    </script>
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; background: #0b0c0e; color: #f4f4f5; padding: 2rem; max-width: 720px; margin: 0 auto;">
    <main>
        <h1>${escapeHtml(fallbackTitle)}</h1>
        <p>${escapeHtml(reason || 'The requested article could not be found.')}</p>
        <p><a href="${SITE_ORIGIN}/" style="color: #60a5fa;">Return to ${escapeHtml(SITE_NAME)}</a></p>
    </main>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

    const requestedId = req && req.query && req.query.id ? String(req.query.id).trim() : '';
    if (!requestedId) {
        return res.status(404).send(buildFallbackHtml('Missing article ID.'));
    }

    try {
        const sep = APPS_SCRIPT_URL.includes('?') ? '&' : '?';
        const response = await fetch(`${APPS_SCRIPT_URL}${sep}t=${Date.now()}`, {
            method: 'GET',
            redirect: 'follow'
        });

        if (!response.ok) {
            return res.status(502).send(buildFallbackHtml('Unable to load live articles at the moment.'));
        }

        const data = await response.json().catch(() => null);
        const rawList = Array.isArray(data) ? data : (Array.isArray(data && data.articles) ? data.articles : []);
        const normalizedList = rawList.map((item, idx) => normalizeArticle(item, idx)).filter(Boolean);

        const reqLower = requestedId.toLowerCase();
        const strippedReq = reqLower.startsWith('sheet_') ? reqLower.slice(6) : reqLower;

        const article = normalizedList.find(a =>
            a.sheetId.toLowerCase() === reqLower ||
            a.rawId.toLowerCase() === reqLower ||
            a.rawId.toLowerCase() === strippedReq
        );

        if (!article) {
            return res.status(404).send(buildFallbackHtml('The requested article could not be found.'));
        }

        const canonicalUrl = `${SITE_ORIGIN}/api/article?id=${encodeURIComponent(article.sheetId)}`;
        const appRedirectUrl = `${SITE_ORIGIN}/?article=${encodeURIComponent(article.sheetId)}`;
        const plainBody = cleanPlainText(article.body);
        const description = plainBody.length > 160 ? `${plainBody.slice(0, 157).trim()}...` : (plainBody || article.headline);

        const paragraphs = article.body
            .split(/\r?\n\s*\r?\n|\r?\n/)
            .map(p => cleanPlainText(p))
            .filter(Boolean);

        const jsonLd = {
            '@context': 'https://schema.org',
            '@type': 'NewsArticle',
            headline: article.headline,
            description,
            image: [article.imageUrl],
            datePublished: article.publishedAt,
            dateModified: article.publishedAt,
            author: {
                '@type': 'Person',
                name: article.author
            },
            publisher: {
                '@type': 'NewsMediaOrganization',
                name: SITE_NAME,
                logo: {
                    '@type': 'ImageObject',
                    url: DEFAULT_IMAGE
                }
            },
            mainEntityOfPage: {
                '@type': 'WebPage',
                '@id': canonicalUrl
            }
        };

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(article.headline)} | ${escapeHtml(SITE_NAME)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />

    <!-- OpenGraph -->
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeHtml(article.headline)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(article.imageUrl)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    <meta property="article:published_time" content="${escapeHtml(article.publishedAt)}" />
    <meta property="article:author" content="${escapeHtml(article.author)}" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(article.headline)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(article.imageUrl)}" />

    <!-- Google News / Search Structured Data -->
    <script type="application/ld+json">${safeJsonLd(jsonLd)}</script>

    <!-- Smooth client-side redirect for human readers (crawlers stay on semantic HTML) -->
    <script>
        (function () {
            var ua = navigator.userAgent || '';
            var isBot = /bot|crawler|spider|googlebot|google-inspectiontool|adsbot|bingbot|slurp|duckduckbot|baiduspider|yandex|whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|applebot|pinterest|preview/i.test(ua);
            if (!isBot) {
                window.location.replace(${JSON.stringify(appRedirectUrl)});
            }
        })();
    </script>
</head>
<body style="font-family: Georgia, 'Times New Roman', serif; background: #0b0c0e; color: #f4f4f5; line-height: 1.7; padding: 2rem 1.25rem; max-width: 760px; margin: 0 auto;">
    <article>
        <header style="margin-bottom: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 1rem;">
            <p style="font-family: system-ui, sans-serif; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.14em; color: #a1a1aa; margin: 0 0 0.5rem;">${escapeHtml(SITE_NAME)}</p>
            <h1 style="font-size: 2rem; line-height: 1.2; margin: 0 0 0.75rem; color: #ffffff;">${escapeHtml(article.headline)}</h1>
            <p style="font-family: system-ui, sans-serif; font-size: 0.875rem; color: #a1a1aa; margin: 0;">
                By <span>${escapeHtml(article.author)}</span> &middot;
                <time datetime="${escapeHtml(article.publishedAt)}">${escapeHtml(article.publishedAt)}</time>
            </p>
        </header>
        ${article.imageUrl ? `<figure style="margin: 0 0 1.5rem;"><img src="${escapeHtml(article.imageUrl)}" alt="${escapeHtml(article.headline)}" style="max-width: 100%; height: auto; border-radius: 12px;" /></figure>` : ''}
        <section>
            ${paragraphs.length > 0
                ? paragraphs.map(p => `<p style="margin: 0 0 1.1rem; color: #e4e4e7;">${escapeHtml(p)}</p>`).join('\n            ')
                : `<p style="margin: 0 0 1.1rem; color: #e4e4e7;">${escapeHtml(description)}</p>`}
        </section>
        <footer style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.12); font-family: system-ui, sans-serif; font-size: 0.875rem;">
            <a href="${escapeHtml(appRedirectUrl)}" style="color: #60a5fa;">Read interactive edition on ${escapeHtml(SITE_NAME)}</a>
        </footer>
    </article>
</body>
</html>`;

        return res.status(200).send(html);
    } catch (err) {
        return res.status(500).send(buildFallbackHtml('Temporary error loading article.'));
    }
};
