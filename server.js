const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
let sharp;
try { sharp = require('sharp'); } catch (e) { console.warn('sharp not installed, watermark disabled'); }
let NodeCache;
try { NodeCache = require('node-cache'); } catch (e) { console.warn('node-cache not installed, caching disabled'); }

// Cache setup
const apiCache = NodeCache ? new NodeCache({ stdTTL: 60, checkperiod: 120 }) : null;

function cacheMiddleware(duration = 60) {
  return (req, res, next) => {
    if (!apiCache) return next();
    const key = req.originalUrl;
    const cached = apiCache.get(key);
    if (cached) {
      return res.json(cached);
    }
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      apiCache.set(key, body, duration);
      originalJson(body);
    };
    next();
  };
}

function clearApiCache(type) {
  if (!apiCache) return;
  if (type) {
    // Clear only related cache entries
    const keys = apiCache.keys();
    keys.forEach(key => {
      if (key.includes(type)) {
        apiCache.del(key);
      }
    });
  } else {
    apiCache.flushAll();
  }
}

const crypto = require('crypto');

const app = express();
app.set('trust proxy', 1);

// Wrap async route handlers so rejected promises reach the error middleware.
// (Express 4 does not catch async rejections by itself.)
const ASYNC_ROUTE_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
for (const method of ASYNC_ROUTE_METHODS) {
  const original = app[method].bind(app);
  app[method] = (routePath, ...handlers) => original(routePath, ...handlers.map((fn) => {
    if (typeof fn !== 'function') return fn;
    return function wrappedAsyncRoute(req, res, next) {
      try {
        const ret = fn(req, res, next);
        if (ret && typeof ret.catch === 'function') ret.catch(next);
        return ret;
      } catch (e) {
        return next(e);
      }
    };
  }));
}

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});
// Redirect www to non-www
app.use((req, res, next) => {
  if (req.hostname === 'www.f7goods.com') {
    return res.redirect(301, 'https://f7goods.com' + req.originalUrl);
  }
  next();
});
// CSP: allow self + Google Fonts + Chart.js CDN + inline scripts (legacy pages use inline <script>/onclick)
// Nginx also sets a CSP; Helmet must not be stricter or browsers block inline handlers / CDN chart.js.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com', 'fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const JWT_SECRET = process.env.JWT_SECRET || (IS_PROD ? null : crypto.randomBytes(32).toString('hex'));
if (IS_PROD && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required in production.');
  process.exit(1);
}
if (!IS_PROD && !process.env.JWT_SECRET) {
  console.warn('Dev mode: using ephemeral JWT_SECRET (tokens reset on restart). Set JWT_SECRET for stable tokens.');
}
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Rate limiting for login endpoints
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX = 10; // max attempts per window

function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const key = `${ip}_${req.path}`;
  const now = Date.now();
  const attempts = loginAttempts.get(key) || [];
  const recentAttempts = attempts.filter(t => now - t < RATE_LIMIT_WINDOW);

  if (recentAttempts.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: '登录尝试过于频繁，请5分钟后再试' });
  }

  recentAttempts.push(now);
  loginAttempts.set(key, recentAttempts);
  next();
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, attempts] of loginAttempts) {
    const recent = attempts.filter(t => now - t < RATE_LIMIT_WINDOW);
    if (recent.length === 0) loginAttempts.delete(key);
    else loginAttempts.set(key, recent);
  }
}, 60000);

// Clean up like/want rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [key, attempts] of likeWantAttempts) {
    const recent = attempts.filter(t => now - t < LIKE_WANT_RATE_LIMIT_WINDOW);
    if (recent.length === 0) likeWantAttempts.delete(key);
    else likeWantAttempts.set(key, recent);
  }
}, 60000);

// Clean up contact rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [key, attempts] of contactAttempts) {
    const recent = attempts.filter(t => now - t < CONTACT_RATE_LIMIT_WINDOW);
    if (recent.length === 0) contactAttempts.delete(key);
    else contactAttempts.set(key, recent);
  }
}, 300000); // 5 minutes for contact (1 hour window)

// Clean up pageview rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [key, attempts] of pageviewAttempts) {
    const recent = attempts.filter(t => now - t < PAGEVIEW_RATE_LIMIT_WINDOW);
    if (recent.length === 0) pageviewAttempts.delete(key);
    else pageviewAttempts.set(key, recent);
  }
}, 60000);

// Middleware
app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || (IS_PROD ? false : true),
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
if (IS_PROD && !process.env.ALLOWED_ORIGIN) {
  console.warn('WARNING: ALLOWED_ORIGIN not set in production — CORS is locked down. Set ALLOWED_ORIGIN for browser clients on another origin.');
}
app.use(express.json({ limit: '10mb' }));

// Serialize mutating HTTP requests. Most legacy handlers still do
// readJSON -> mutate -> writeJSON; this prevents two requests from racing
// between the read and the write. File-level atomic writes remain in writeJSON.
let mutationQueueTail = Promise.resolve();
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (!req.path.startsWith('/api/')) return next();
  const previous = mutationQueueTail;
  let release;
  mutationQueueTail = new Promise((resolve) => { release = resolve; });
  previous.then(() => {
    let released = false;
    const done = () => {
      if (released) return;
      released = true;
      release();
    };
    res.once('finish', done);
    res.once('close', done);
    setTimeout(done, 120000).unref?.();
    next();
  });
});

// ===== SEO: server-side meta + readable snapshot for detail pages =====
const SITE_ORIGIN = (process.env.SITE_ORIGIN || 'https://f7goods.com').replace(/\/$/, '');
const DETAIL_PAGES = {
  '/work-detail.html': { file: 'work-detail.html', type: 'work', container: 'workDetail' },
  '/event-detail.html': { file: 'event-detail.html', type: 'event', container: 'eventDetail' },
  '/circle-detail.html': { file: 'circle-detail.html', type: 'circle', container: 'circleDetail' },
  '/project-detail.html': { file: 'project-detail.html', type: 'project', container: 'projectDetail' },
  '/update-detail.html': { file: 'update-detail.html', type: 'update', container: 'updateDetail' },
  '/only.html': { file: 'only.html', type: 'event', container: null, snapshot: false, path: '/only.html' }
};

function escapeHtmlServer(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function absUrl(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return SITE_ORIGIN + (s.startsWith('/') ? s : '/' + s);
}
function detailPath(type, item, pathOverride) {
  const id = encodeURIComponent(item.id || '');
  if (pathOverride) return `${pathOverride}?id=${id}`;
  if (type === 'work') return `/work-detail.html?id=${id}`;
  if (type === 'event') return `/event-detail.html?id=${id}`;
  if (type === 'circle') return `/circle-detail.html?id=${id}`;
  if (type === 'project') return `/project-detail.html?id=${id}`;
  return `/update-detail.html?id=${id}`;
}
function detailMeta(type, item, pathOverride) {
  const title = item.title || item.name || '详情';
  const desc = String(item.description || item.content || `${title} — f7goods 同人周边展示平台`).replace(/\s+/g, ' ').slice(0, 180);
  const image = type === 'circle'
    ? (item.cardCover || item.logo || '')
    : (item.coverImage || (item.images && item.images[0]) || '');
  return { title, desc, image, url: SITE_ORIGIN + detailPath(type, item, pathOverride) };
}
function seoSnapshot(type, item) {
  const title = escapeHtmlServer(item.title || item.name || '详情');
  const desc = item.description || item.content || '';
  const image = type === 'circle'
    ? (item.cardCover || item.logo || '')
    : (item.coverImage || (item.images && item.images[0]) || '');
  const circles = type === 'work' ? (item.circles || []).map(cid => {
    const c = readJSON('circles.json').find(x => x.id === cid);
    return c ? c.name : cid;
  }).filter(Boolean).join(' · ') : '';
  const metaLine = type === 'event'
    ? [item.date, item.endDate && item.endDate !== item.date ? item.endDate : '', item.location].filter(Boolean).join(' · ')
    : type === 'project'
      ? [item.status, item.startDate, item.endDate].filter(Boolean).join(' · ')
      : type === 'update'
        ? (item.publishDate || '')
        : type === 'circle'
          ? '同人作者'
          : [circles, item.price, item.releaseDate].filter(Boolean).join(' · ');
  return `<article id="seoSnapshot" style="max-width:820px;margin:1.5rem auto;padding:0 1.5rem;color:var(--ink);font-family:'Noto Serif SC',Georgia,serif;">
    <h1 style="font-size:1.6rem;margin:0 0 .6rem;">${title}</h1>
    ${metaLine ? `<p style="color:var(--muted);font-size:.85rem;margin:0 0 1rem;">${escapeHtmlServer(metaLine)}</p>` : ''}
    ${image ? `<p style="margin:0 0 1rem;"><img src="${escapeHtmlServer(absUrl(image))}" alt="${title}" style="max-width:100%;height:auto;border-radius:8px;"></p>` : ''}
    ${desc ? `<p style="line-height:1.9;white-space:pre-wrap;">${escapeHtmlServer(desc)}</p>` : ''}
  </article>
  <style>#seoSnapshot + #detailSkeleton{display:none}</style>`;
}
function seoJsonLd(type, item, meta) {
  const base = { '@context': 'https://schema.org', name: meta.title, description: meta.desc, url: meta.url };
  if (meta.image) base.image = [absUrl(meta.image)];
  if (type === 'work') {
    const price = parseFloat(String(item.price || '').replace(/[^\d.]/g, ''));
    return { ...base, '@type': 'Product', brand: { '@type': 'Organization', name: 'f7goods' }, ...(Number.isFinite(price) && price > 0 ? { offers: { '@type': 'Offer', price, priceCurrency: 'CNY' } } : {}) };
  }
  if (type === 'event') {
    return { ...base, '@type': 'Event', startDate: item.date, ...(item.endDate ? { endDate: item.endDate } : {}), ...(item.location ? { location: { '@type': 'Place', name: item.location } } : {}), eventStatus: 'https://schema.org/EventScheduled' };
  }
  if (type === 'circle') return { ...base, '@type': 'Organization', ...(item.logo ? { logo: absUrl(item.logo) } : {}) };
  if (type === 'project') return { ...base, '@type': 'CreativeWork' };
  return { ...base, '@type': 'Article', headline: meta.title, ...(item.publishDate ? { datePublished: item.publishDate } : {}) };
}
function renderDetailSeo(type, item, cfg) {
  const meta = detailMeta(type, item, cfg && cfg.path);
  const jsonLd = JSON.stringify(seoJsonLd(type, item, meta)).replace(/</g, '\\u003c');
  const ogType = type === 'work' ? 'product' : type === 'event' ? 'article' : 'website';
  const ogImage = meta.image ? absUrl(meta.image) : `${SITE_ORIGIN}/uploads/og-image.png`;
  return {
    head: `<title>${escapeHtmlServer(meta.title)} — f7goods</title>
<meta name="description" content="${escapeHtmlServer(meta.desc)}">
<link rel="canonical" href="${escapeHtmlServer(meta.url)}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="f7goods">
<meta property="og:title" content="${escapeHtmlServer(meta.title)}">
<meta property="og:description" content="${escapeHtmlServer(meta.desc)}">
<meta property="og:image" content="${escapeHtmlServer(ogImage)}">
<meta property="og:url" content="${escapeHtmlServer(meta.url)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="alternate" hreflang="zh-CN" href="${escapeHtmlServer(meta.url)}">
<link rel="alternate" hreflang="x-default" href="${escapeHtmlServer(meta.url)}">
<script type="application/ld+json">${jsonLd}</script>`,
    snapshot: seoSnapshot(type, item)
  };
}

app.get(Object.keys(DETAIL_PAGES), (req, res, next) => {
  const cfg = DETAIL_PAGES[req.path];
  if (!cfg) return next();
  const id = String(req.query.id || '');
  let item = null;
  try {
    if (cfg.type === 'work') {
      const w = readJSON('works.json').find(x => x.id === id);
      if (w && isWorkPublic(w)) item = publicWorkView(w);
    } else if (cfg.type === 'event') {
      const e = readJSON('events.json').find(x => x.id === id);
      if (e && (!e.approvalStatus || e.approvalStatus === 'approved') && (cfg.path !== '/only.html' || e.type === 'only')) item = e;
    } else if (cfg.type === 'circle') {
      const c = readJSON('circles.json').find(x => x.id === id);
      if (c && c.visible !== false) item = c;
    } else if (cfg.type === 'project') {
      const p = readJSON('projects.json').find(x => x.id === id);
      if (p && (!p.approvalStatus || p.approvalStatus === 'approved')) item = p;
    } else if (cfg.type === 'update') {
      const u = readJSON('updates.json').find(x => x.id === id);
      if (u && (!u.approvalStatus || u.approvalStatus === 'approved')) item = u;
    }
  } catch (e) {
    console.error('[seo detail]', cfg.type, e.message);
    return next();
  }
  if (!item) {
    res.status(404);
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.sendFile(path.join(__dirname, 'public', '404.html'));
  }
  const htmlPath = path.join(__dirname, 'public', cfg.file);
  if (!fs.existsSync(htmlPath)) return next();
  const seo = renderDetailSeo(cfg.type, item, cfg);
  let html = fs.readFileSync(htmlPath, 'utf-8');
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '');
  html = html.replace(/<meta\s+name="description"[^>]*>\s*/gi, '');
  html = html.replace(/<meta\s+property="og:[^"]+"[^>]*>\s*/gi, '');
  html = html.replace(/<meta\s+name="twitter:[^"]+"[^>]*>\s*/gi, '');
  html = html.replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '');
  html = html.replace(/<link\s+rel="alternate"\s+hreflang="[^"]+"[^>]*>\s*/gi, '');
  html = html.replace('</head>', seo.head + '\n</head>');
  const marker = cfg.container ? `<div id="${cfg.container}">` : '';
  if (cfg.snapshot !== false && marker && html.includes(marker)) {
    html = html.replace(marker, marker + seo.snapshot);
  }
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.type('html').send(html);
});

// 维护模式：只拦截公开页面，不影响后台与静态资源
app.use((req, res, next) => {
  try {
    const settings = readJSON('settings.json');
    if (!settings.features?.maintenanceMode) return next();
    if (req.path.startsWith('/admin') || req.path.startsWith('/api') ||
        req.path.startsWith('/uploads') || req.path.startsWith('/js') || req.path.startsWith('/css') ||
        req.path === '/maintenance.html') return next();
    if (!/\.html?$/.test(req.path) && req.path !== '/') return next();
    return res.status(503).sendFile(path.join(__dirname, 'public', 'maintenance.html'));
  } catch { next(); }
});

// 静态资源：HTML 禁止缓存；带 ?v= 的资源可长缓存；未带版本的 css/js 短缓存
app.use(express.static('public', {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    const base = filePath.replace(/\\/g, '/');
    if (base.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      return;
    }
    if (/\.(css|js)(\?|$)/.test(base) || base.endsWith('.css') || base.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
      return;
    }
    if (/\.(png|jpe?g|gif|webp|svg|ico|woff2?)$/i.test(base)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}));
app.use('/admin', express.static('admin', {
  etag: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));
app.use('/uploads', express.static('uploads', { maxAge: '7d', etag: true }));

// On-demand resized WebP variants for uploads. Keeps originals untouched.
const IMG_CACHE_DIR = path.join(__dirname, 'uploads', '.cache');
fs.mkdirSync(IMG_CACHE_DIR, { recursive: true });
const imgJobs = new Map();
app.get('/img/:filename', async (req, res) => {
  const name = safeUploadName(req.params.filename);
  if (!name) return res.status(404).end();
  const src = path.join(UPLOADS_DIR, name);
  if (!fs.existsSync(src)) return res.status(404).end();
  const ext = path.extname(name).toLowerCase();
  const width = Math.min(Math.max(parseInt(req.query.w, 10) || 640, 32), 2400);
  if (!sharp || ['.gif', '.svg'].includes(ext)) {
    return res.sendFile(src);
  }
  const base = path.basename(name, ext);
  const dest = path.join(IMG_CACHE_DIR, `${base}-w${width}.webp`);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  if (fs.existsSync(dest)) return res.sendFile(dest);
  try {
    let job = imgJobs.get(dest);
    if (!job) {
      job = sharp(src)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(dest)
        .finally(() => imgJobs.delete(dest));
      imgJobs.set(dest, job);
    }
    await job;
    return res.sendFile(dest);
  } catch (e) {
    console.error('[img]', name, e.message);
    return res.sendFile(src);
  }
});

// Request logging
if (process.env.NODE_ENV === 'production') {
  const logDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const accessLogStream = fs.createWriteStream(path.join(logDir, 'access.log'), { flags: 'a' });
  app.use(morgan('combined', { stream: accessLogStream }));
} else {
  app.use(morgan('dev'));
}

// Multer config for file uploads (private tmp — not statically served)
const TMP_UPLOAD_DIR = path.join(__dirname, 'tmp-uploads');
fs.mkdirSync(TMP_UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TMP_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9一-鿿\-_]/g, '_').substring(0, 60);
    cb(null, `${Date.now()}-${baseName}${ext}`);
  }
});
const fileFilter = (req, file, cb) => {
  const allowedImages = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const allowedExcel = ['.xlsx', '.xls'];
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
  if ((allowedImages.includes(ext) || allowedExcel.includes(ext)) && allowedMimes.includes(file.mimetype)) cb(null, true);
  else cb(new Error('只允许上传图片或Excel文件'), false);
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

async function publishUploadedImage(tmpPath) {
  const name = path.basename(tmpPath);
  const dest = path.join(__dirname, 'uploads', name);
  await fs.promises.copyFile(tmpPath, dest);
  await fs.promises.unlink(tmpPath).catch(() => {});
  return `/uploads/${name}`;
}

function sanitizeSheetRows(rows) {
  if (!Array.isArray(rows)) return [];
  const banned = new Set(['__proto__', 'constructor', 'prototype']);
  return rows.map(row => {
    if (!row || typeof row !== 'object') return {};
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      if (banned.has(k)) continue;
      out[k] = v;
    }
    return out;
  });
}

function readExcelRows(filePath) {
  const wb = XLSX.readFile(filePath, { dense: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
  return sanitizeSheetRows(rows);
}

// Per-file write mutex to prevent concurrent read-modify-write races
const fileLocks = new Map();
function withFileLock(file, fn) {
  const prev = fileLocks.get(file) || Promise.resolve();
  const next = prev.then(() => fn()).catch((e) => {
    // keep chain alive after errors
    throw e;
  });
  // swallow for chain continuation
  next.catch(() => {});
  fileLocks.set(file, next.catch(() => {}));
  return next;
}

// Known list-type data files (must be JSON arrays)
// 注意：author-announcement-reads.json 是「对象」结构（{ 公告id: [作者id...] }），不要放进来
const LIST_JSON_FILES = new Set([
  'works.json', 'circles.json', 'events.json', 'projects.json', 'updates.json',
  'announcements.json', 'contact.json', 'edit-log.json', 'author-notifications.json',
  'author-announcements.json', 'uploads-trash.json', 'trash.json', 'series.json'
]);

// Helper: read/write JSON files
// Missing file → empty structure. Parse/IO error → throw (never silently wipe data).
function readJSON(file) {
  const filePath = path.join(__dirname, 'data', file);
  if (!fs.existsSync(filePath)) {
    return LIST_JSON_FILES.has(file) ? [] : {};
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (!raw.trim()) {
    return LIST_JSON_FILES.has(file) ? [] : {};
  }
  try {
    const data = JSON.parse(raw);
    // Safety: list files must be arrays (corruption guard)
    if (LIST_JSON_FILES.has(file) && !Array.isArray(data)) {
      console.error(`DATA CORRUPT: ${file} expected array, got ${typeof data}. Returning [].`);
      return [];
    }
    return data;
  } catch (e) {
    const err = new Error(`Corrupt JSON data file: ${file}`);
    err.cause = e;
    err.code = 'DATA_CORRUPT';
    throw err;
  }
}

async function writeJSON(file, data) {
  return withFileLock(file, async () => {
    const filePath = path.join(__dirname, 'data', file);
    const tmpPath = filePath + '.tmp';
    const payload = JSON.stringify(data, null, 2);
    await fs.promises.writeFile(tmpPath, payload, 'utf-8');
    await fs.promises.rename(tmpPath, filePath);
    // Clear related API cache when data changes
    const type = file.replace('.json', '');
    clearApiCache(type);
    // Invalidate auth cache when circles change
    if (file === 'circles.json') {
      circlesAuthCache = { data: null, ts: 0 };
    }
  });
}

// Mutate a JSON file under the per-file lock (read-modify-write safe).
// mutator receives the parsed value and should mutate it in place.
// The mutator's return value is for the caller only — it is NEVER written to disk.
async function mutateJSON(file, mutator) {
  return withFileLock(file, async () => {
    const filePath = path.join(__dirname, 'data', file);
    let current;
    if (!fs.existsSync(filePath)) {
      current = file.endsWith('s.json') ? [] : {};
    } else {
      const raw = fs.readFileSync(filePath, 'utf-8');
      if (!raw.trim()) current = file.endsWith('s.json') ? [] : {};
      else {
        try { current = JSON.parse(raw); }
        catch (e) {
          const err = new Error(`Corrupt JSON data file: ${file}`);
          err.cause = e;
          err.code = 'DATA_CORRUPT';
          throw err;
        }
      }
    }
    const ret = await mutator(current);
    // Always persist `current` (mutated in place). Never persist `ret`.
    const tmpPath = filePath + '.tmp';
    await fs.promises.writeFile(tmpPath, JSON.stringify(current, null, 2), 'utf-8');
    await fs.promises.rename(tmpPath, filePath);
    const type = file.replace('.json', '');
    clearApiCache(type);
    if (file === 'circles.json') circlesAuthCache = { data: null, ts: 0 };
    return ret === undefined ? current : ret;
  });
}

// ===== Upload reference scanning / trash =====
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const UPLOADS_TRASH_DIR = path.join(__dirname, 'uploads-trash');
const UPLOADS_TRASH_INDEX = 'uploads-trash.json';
const UPLOAD_IMAGE_RE = /\/uploads\/([^/?#\s"'<>]+)/g;

function ensureTrashDir() {
  fs.mkdirSync(UPLOADS_TRASH_DIR, { recursive: true });
}

// Walk any JSON value and collect every /uploads/<file> reference, including
// nested objects (booths, page settings, announcements, card covers, ...).
function collectUploadRefs(value, out) {
  if (value == null) return out;
  if (typeof value === 'string') {
    UPLOAD_IMAGE_RE.lastIndex = 0;
    let m;
    while ((m = UPLOAD_IMAGE_RE.exec(value))) {
      try { out.add(decodeURIComponent(m[1])); } catch { out.add(m[1]); }
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectUploadRefs(v, out);
    return out;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value)) collectUploadRefs(v, out);
  }
  return out;
}

function collectAllUploadRefs() {
  const refs = new Set();
  const files = [
    'works.json', 'events.json', 'circles.json', 'projects.json', 'updates.json',
    'announcements.json', 'author-announcements.json', 'series.json', 'settings.json'
  ];
  for (const file of files) {
    try { collectUploadRefs(readJSON(file), refs); } catch (e) { console.error('[upload-refs]', file, e.message); }
  }
  return refs;
}

// Human-readable usage map for the admin image library.
function collectUploadUsageMap() {
  const map = new Map();
  const add = (label, value) => {
    const refs = collectUploadRefs(value, new Set());
    for (const file of refs) {
      if (!map.has(file)) map.set(file, []);
      map.get(file).push(label);
    }
  };
  const sources = [
    ['works.json', '作品', 'title'],
    ['events.json', '活动', 'title'],
    ['circles.json', '作者', 'name'],
    ['projects.json', '企划', 'title'],
    ['updates.json', '动态', 'title'],
    ['announcements.json', '公告', 'title'],
    ['author-announcements.json', '作者公告', 'title']
  ];
  for (const [file, type, titleField] of sources) {
    try {
      for (const item of readJSON(file)) add(`${type}：${item[titleField] || item.id || '未命名'}`, item);
    } catch {}
  }
  try { add('页面设置', readJSON('settings.json')); } catch {}
  return map;
}

// A generated variant such as foo-800.webp is considered used when foo.<ext> is used.
function isUploadVariantUsed(filename, refs) {
  const m = String(filename).match(/^(.+)-(\d+)\.(webp|jpe?g|png)$/i);
  if (!m) return false;
  for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif']) {
    if (refs.has(`${m[1]}.${ext}`)) return true;
  }
  return false;
}

function listUploadFiles() {
  try {
    return fs.readdirSync(UPLOADS_DIR).filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f));
  } catch { return []; }
}

function safeUploadName(name) {
  const base = path.basename(String(name || ''));
  if (!base || base === '.' || base === '..' || base !== String(name)) return null;
  if (!/^[^/\\<>:"|?*\x00-\x1f]+\.(jpg|jpeg|png|gif|webp|svg)$/i.test(base)) return null;
  return base;
}

function readTrashIndex() {
  try {
    const idx = readJSON(UPLOADS_TRASH_INDEX);
    return Array.isArray(idx) ? idx : [];
  } catch { return []; }
}

async function writeTrashIndex(list) {
  await writeJSON(UPLOADS_TRASH_INDEX, list);
}

function trashUpload(filename, uploader) {
  const safe = safeUploadName(filename);
  if (!safe) throw new Error('非法文件名');
  const src = path.join(UPLOADS_DIR, safe);
  if (!fs.existsSync(src)) throw new Error('文件不存在');
  ensureTrashDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stored = `${stamp}__${safe}`;
  fs.renameSync(src, path.join(UPLOADS_TRASH_DIR, stored));
  return { stored, original: safe, size: fs.statSync(path.join(UPLOADS_TRASH_DIR, stored)).size, uploader: uploader || '' };
}

// Return the image references that make a file "used", for the admin dry-run UI.
function uploadRefOwners(filename, refs) {
  // We only know the set here; detailed owners are resolved by the API below.
  return refs.has(filename);
}

// Edit log system
async function logEdit(user, action, target, details, imageUrl, changes) {
  let log = [];
  try { log = readJSON('edit-log.json'); } catch {}
  if (!Array.isArray(log)) log = [];
  log.push({
    id: 'log' + Date.now(),
    time: new Date().toISOString(),
    user: user || '未知',
    action: action || '',
    target: target || '',
    details: details || '',
    imageUrl: imageUrl || '',
    ...(changes ? { changes } : {})
  });
  // Keep max 500 entries
  if (log.length > 500) log = log.slice(-500);
  await writeJSON('edit-log.json', log);
}

// Recycle bin: soft-delete content instead of unlinking it immediately.
const TRASH_TYPES = {
  work: { file: 'works.json', label: '作品' },
  event: { file: 'events.json', label: '活动' },
  project: { file: 'projects.json', label: '企划' },
  update: { file: 'updates.json', label: '动态' },
  circle: { file: 'circles.json', label: '作者' }
};

function readTrash() {
  try {
    const value = readJSON('trash.json');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

async function moveToTrash(type, item) {
  const meta = TRASH_TYPES[type];
  if (!meta) throw new Error('不支持的回收站类型');
  const trash = readTrash();
  const entry = {
    id: 'trash' + Date.now() + Math.random().toString(36).slice(2, 7),
    type,
    typeLabel: meta.label,
    item,
    title: item.title || item.name || item.id || '未命名',
    deletedAt: new Date().toISOString(),
    deletedBy: '管理员'
  };
  trash.push(entry);
  await writeJSON('trash.json', trash);
  return entry;
}

async function clearEditLogImageUrl(imageUrl) {
  const log = readJSON('edit-log.json');
  let changed = false;
  log.forEach(entry => {
    if (entry.imageUrl === imageUrl) {
      entry.imageUrl = '';
      changed = true;
    }
  });
  if (changed) await writeJSON('edit-log.json', log);
}

// Author notifications system
async function addAuthorNotification(circleId, type, title, message, rejectReason) {
  let notifications = [];
  try { notifications = readJSON('author-notifications.json'); } catch {}
  if (!Array.isArray(notifications)) notifications = [];
  notifications.push({
    id: 'notif' + Date.now(),
    circleId,
    type, // 'work', 'event', 'project', 'update'
    title,
    message,
    rejectReason: rejectReason || '',
    read: false,
    createdAt: new Date().toISOString()
  });
  // Keep max 200 notifications per author
  const authorNotifs = notifications.filter(n => n.circleId === circleId);
  if (authorNotifs.length > 200) {
    const toRemove = authorNotifs.slice(0, authorNotifs.length - 200);
    const removeIds = new Set(toRemove.map(n => n.id));
    notifications = notifications.filter(n => !removeIds.has(n.id) || n.circleId !== circleId);
  }
  await writeJSON('author-notifications.json', notifications);
}

// Initialize admin password hash if placeholder
async function initAdmin() {
  const admin = readJSON('admin.json');
  if (admin.passwordHash === '$2a$10$placeholder') {
    if (!ADMIN_PASSWORD) {
      if (IS_PROD) {
        console.error('FATAL: admin.json has placeholder hash and ADMIN_PASSWORD is not set.');
        process.exit(1);
      }
      console.warn('Dev: admin password placeholder remains. Set ADMIN_PASSWORD and run init-admin.js.');
      return;
    }
    admin.passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await writeJSON('admin.json', admin);
  }
}
initAdmin().catch(e => { console.error('initAdmin failed:', e.message); process.exit(1); });

function isPasswordAcceptable(password) {
  if (typeof password !== 'string' || password.length < 8) return false;
  if (password.length > 128) return false;
  return true;
}

// JWT Auth middleware (admin only)
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '未授权' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: '权限不足' });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token无效或已过期' });
  }
}

// ===== Admin Auth =====
app.post('/api/admin/login', rateLimitMiddleware, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '请填写完整信息' });
  const admin = readJSON('admin.json');
  const okUser = username === admin.username;
  const okPass = admin.passwordHash && await bcrypt.compare(password, admin.passwordHash);
  if (!okUser || !okPass) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token });
});

// ===== Author Auth =====
// Cache for circles.json used in auth (avoids disk read on every request)
let circlesAuthCache = { data: null, ts: 0 };
const CIRCLES_AUTH_TTL = 30000; // 30 seconds

function getCirclesForAuth() {
  const now = Date.now();
  if (!circlesAuthCache.data || now - circlesAuthCache.ts > CIRCLES_AUTH_TTL) {
    circlesAuthCache.data = readJSON('circles.json');
    circlesAuthCache.ts = now;
  }
  return circlesAuthCache.data;
}

function authorAuthMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '未授权' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'author') return res.status(403).json({ error: '权限不足' });

    // Check if author account is still active
    const circles = getCirclesForAuth();
    const circle = circles.find(c => c.id === decoded.circleId);
    if (!circle || (circle.authorStatus !== 'approved' && circle.authorStatus !== 'active')) {
      return res.status(403).json({ error: '账号已被禁用，请联系管理员', needReapply: true });
    }

    // Support X-Act-As header for switching author identity
    const actAs = req.headers['x-act-as'];
    if (actAs && actAs !== decoded.circleId) {
      const targetCircle = circles.find(c => c.id === actAs);
      if (!targetCircle) return res.status(404).json({ error: '目标作者不存在' });
      if (targetCircle.authorStatus !== 'approved' && targetCircle.authorStatus !== 'active') return res.status(403).json({ error: '目标作者账号未激活' });

      const isEditable = (targetCircle.editableBy || []).includes(decoded.circleId);
      if (!isEditable) return res.status(403).json({ error: '无权操作该作者后台' });

      req.author = { circleId: actAs, realCircleId: decoded.circleId };
    } else {
      req.author = { circleId: decoded.circleId };
    }

    next();
  } catch {
    res.status(401).json({ error: 'Token无效或已过期' });
  }
}

app.post('/api/author/register', rateLimitMiddleware, async (req, res) => {
  const { authorName, username, password } = req.body;
  if (!authorName || !username || !password) return res.status(400).json({ error: '请填写完整信息' });
  if (!isPasswordAcceptable(password)) return res.status(400).json({ error: '密码至少8位' });
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    return res.status(400).json({ error: '用户名需为 3-32 位字母、数字或下划线' });
  }

  const circles = readJSON('circles.json');

  if (circles.some(c => c.name === authorName.trim())) {
    return res.status(400).json({ error: '该作者名称已存在' });
  }

  if (circles.some(c => c.username === username)) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const newCircle = {
    id: 'c' + Date.now() + Math.random().toString(36).substr(2, 5),
    name: authorName.trim(),
    description: '',
    logo: '',
    images: [],
    socialLinks: {},
    order: circles.reduce((max, c) => Math.max(max, c.order ?? 0), 0) + 1,
    category: 'geren',
    follows: 0,
    username: username,
    passwordHash,
    // Register open to login immediately; uploaded works still need review
    authorStatus: 'active',
    requireApproval: true,
    createdAt: new Date().toISOString()
  };
  circles.push(newCircle);
  await writeJSON('circles.json', circles);
  res.json({ success: true, message: '注册成功，现在即可登录。上传的作品需管理员审核后才会展示。' });
});

app.post('/api/author/login', rateLimitMiddleware, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '请填写完整信息' });

  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.username === username);
  if (!circle || !circle.passwordHash) return res.status(401).json({ error: '用户名或密码错误' });
  if (!(await bcrypt.compare(password, circle.passwordHash))) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  if (circle.authorStatus === 'pending') {
    return res.status(403).json({ error: '账号审核中，请等待管理员通过' });
  }
  if (circle.authorStatus !== 'approved' && circle.authorStatus !== 'active') {
    return res.status(403).json({ error: '账号已被禁用，请联系管理员' });
  }

  const token = jwt.sign({ circleId: circle.id, role: 'author' }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, circleId: circle.id, circleName: circle.name });
});

// Author: get own profile
app.get('/api/author/profile', authorAuthMiddleware, (req, res) => {
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  if (!circle) return res.status(404).json({ error: '作者未找到' });
  // Return safe fields only
  const { passwordHash, ...safe } = circle;
  res.json(safe);
});

// Get accessible author accounts
app.get('/api/author/accessible-accounts', authorAuthMiddleware, (req, res) => {
  const circles = readJSON('circles.json');
  const realCircleId = req.author.realCircleId || req.author.circleId;
  const currentCircle = circles.find(c => c.id === realCircleId);
  if (!currentCircle) return res.json([]);

  const accounts = [];

  // Own account
  accounts.push({
    id: currentCircle.id,
    name: currentCircle.name,
    logo: currentCircle.logo || '',
    isOwner: true,
    isActive: req.author.circleId === currentCircle.id
  });

  // Authorized accounts
  circles.forEach(c => {
    if (c.id !== realCircleId && (c.editableBy || []).includes(realCircleId) && (c.authorStatus === 'approved' || c.authorStatus === 'active')) {
      accounts.push({
        id: c.id,
        name: c.name,
        logo: c.logo || '',
        isOwner: false,
        isActive: req.author.circleId === c.id
      });
    }
  });

  res.json(accounts);
});

// Author: update own profile
app.put('/api/author/profile', authorAuthMiddleware, async (req, res) => {
  let circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === req.author.circleId);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });

  const old = { ...circles[index] };

  // Only allow updating specific fields
  const allowed = ['name', 'description', 'category', 'logo', 'cardCover', 'images', 'socialLinks', 'featuredWorkIds', 'showFeaturedWorks', 'seriesDisplayLimit', 'featuredSeriesIds'];
  const updates = {};
  allowed.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });
  if (updates.showFeaturedWorks !== undefined) updates.showFeaturedWorks = updates.showFeaturedWorks === true;
  if (updates.seriesDisplayLimit !== undefined) {
    const n = Number(updates.seriesDisplayLimit);
    updates.seriesDisplayLimit = Number.isFinite(n) && n > 0 ? Math.min(n, 12) : null;
  }
  if (updates.featuredSeriesIds !== undefined) {
    const ownSeries = readJSON('series.json').filter(s => s.circleId === circles[index].id);
    const validSeries = new Set(ownSeries.map(s => String(s.id)));
    updates.featuredSeriesIds = [...new Set((Array.isArray(updates.featuredSeriesIds) ? updates.featuredSeriesIds : []).map(String).filter(id => validSeries.has(id)))].slice(0, 6);
  }
  if (updates.featuredWorkIds !== undefined) {
    const ownWorks = readJSON('works.json').filter(w => (w.circles || []).includes(circles[index].id) && isWorkPublic(w));
    const validIds = new Set(ownWorks.map(w => w.id));
    const ids = Array.isArray(updates.featuredWorkIds) ? updates.featuredWorkIds : [];
    updates.featuredWorkIds = [...new Set(ids.map(String).filter(id => validIds.has(id)))].slice(0, 3);
  }

  circles[index] = { ...circles[index], ...updates };
  await writeJSON('circles.json', circles);

  // Log specific changes
  const changes = [];
  if (updates.name && updates.name !== old.name) changes.push('修改了名称');
  if (updates.description !== undefined && updates.description !== old.description) changes.push('修改了简介');
  if (updates.logo && updates.logo !== old.logo) changes.push('更新了头像');
  if (updates.cardCover !== undefined && updates.cardCover !== old.cardCover) changes.push('更新了卡片封面');
  if (updates.images) {
    const oldCount = (old.images || []).length;
    const newCount = (updates.images || []).length;
    if (newCount > oldCount) changes.push('新增了' + (newCount - oldCount) + '张图片');
    else if (newCount < oldCount) changes.push('删除了' + (oldCount - newCount) + '张图片');
  }
  if (updates.category && updates.category !== old.category) changes.push('修改了分类');
  if (updates.featuredWorkIds !== undefined) changes.push('更新了首页展示作品');
  if (updates.showFeaturedWorks !== undefined) changes.push(updates.showFeaturedWorks ? '开启首页展示作品' : '关闭首页展示作品');
  if (updates.featuredSeriesIds !== undefined) changes.push('更新了作品系列展示');
  logEdit(circles[index].name || '作者', '修改资料', '', changes.join('、') || '更新了资料');

  const { passwordHash, ...safe } = circles[index];
  res.json(safe);
});

// ===== Author: work series / collections =====
function projectStatusValues() {
  try {
    const categories = readJSON('categories.json');
    const list = Array.isArray(categories.projectStatus) ? categories.projectStatus : [];
    if (list.length) return new Set(list.map(x => x.id));
  } catch {}
  return new Set(['weikaiqi', 'zhaomuzhong', 'tingzhizhaomu', 'yiwancheng']);
}

function normalizeSeriesStatus(value) {
  const valid = projectStatusValues();
  const legacy = { in_progress: 'zhaomuzhong', recruiting: 'zhaomuzhong', completed: 'yiwancheng', cancelled: 'tingzhizhaomu' };
  if (valid.has(value)) return value;
  if (legacy[value] && valid.has(legacy[value])) return legacy[value];
  return valid.has('zhaomuzhong') ? 'zhaomuzhong' : [...valid][0] || 'zhaomuzhong';
}

function authorSeriesWorks(circleId, workIds) {
  const works = readJSON('works.json').filter(w => (w.circles || []).includes(circleId));
  if (!Array.isArray(workIds) || !workIds.length) return [];
  const wanted = new Set(workIds.map(String));
  return works.filter(w => wanted.has(String(w.id)));
}

app.get('/api/author/series', authorAuthMiddleware, (req, res) => {
  const circleId = req.author.circleId;
  const series = readJSON('series.json').filter(s => s.circleId === circleId);
  series.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  res.json(series.map(s => ({ ...s, status: normalizeSeriesStatus(s.status), works: authorSeriesWorks(circleId, s.workIds) })));
});

app.post('/api/author/series', authorAuthMiddleware, async (req, res) => {
  const circleId = req.author.circleId;
  const name = String(req.body.name || '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: '请填写系列名称' });
  const ownWorks = readJSON('works.json').filter(w => (w.circles || []).includes(circleId));
  const ownIds = new Set(ownWorks.map(w => String(w.id)));
  const workIds = [...new Set((Array.isArray(req.body.workIds) ? req.body.workIds : []).map(String).filter(id => ownIds.has(id)))];
  const series = readJSON('series.json');
  const item = {
    id: 'ser' + Date.now() + Math.random().toString(36).slice(2, 6),
    circleId,
    name,
    cover: String(req.body.cover || '').slice(0, 1000),
    category: String(req.body.category || '').slice(0, 80),
    startDate: String(req.body.startDate || '').slice(0, 20),
    endDate: String(req.body.endDate || '').slice(0, 20),
    tags: Array.isArray(req.body.tags) ? req.body.tags.map(t => String(t).slice(0, 30)).filter(Boolean).slice(0, 12) : [],
    description: String(req.body.description || '').slice(0, 5000),
    contactInfo: String(req.body.contactInfo || '').slice(0, 2000),
    workIds,
    visible: req.body.visible !== false,
    status: normalizeSeriesStatus(req.body.status),
    order: series.filter(s => s.circleId === circleId).length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  series.push(item);
  await writeJSON('series.json', series);
  await logEdit('作者', '创建作品系列', name, `${workIds.length} 件作品`);
  res.json({ ...item, works: authorSeriesWorks(circleId, item.workIds) });
});

app.put('/api/author/series/:id', authorAuthMiddleware, async (req, res) => {
  const circleId = req.author.circleId;
  const series = readJSON('series.json');
  const index = series.findIndex(s => s.id === req.params.id && s.circleId === circleId);
  if (index === -1) return res.status(404).json({ error: '系列未找到' });
  const name = String(req.body.name ?? series[index].name).trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: '请填写系列名称' });
  const ownIds = new Set(readJSON('works.json').filter(w => (w.circles || []).includes(circleId)).map(w => String(w.id)));
  const workIds = [...new Set((Array.isArray(req.body.workIds) ? req.body.workIds : series[index].workIds || []).map(String).filter(id => ownIds.has(id)))];
  series[index] = {
    ...series[index],
    name,
    cover: req.body.cover !== undefined ? String(req.body.cover || '').slice(0, 1000) : series[index].cover,
    category: req.body.category !== undefined ? String(req.body.category || '').slice(0, 80) : series[index].category,
    startDate: req.body.startDate !== undefined ? String(req.body.startDate || '').slice(0, 20) : series[index].startDate,
    endDate: req.body.endDate !== undefined ? String(req.body.endDate || '').slice(0, 20) : series[index].endDate,
    tags: req.body.tags !== undefined && Array.isArray(req.body.tags) ? req.body.tags.map(t => String(t).slice(0, 30)).filter(Boolean).slice(0, 12) : series[index].tags,
    description: req.body.description !== undefined ? String(req.body.description || '').slice(0, 5000) : series[index].description,
    contactInfo: req.body.contactInfo !== undefined ? String(req.body.contactInfo || '').slice(0, 2000) : series[index].contactInfo,
    workIds,
    visible: req.body.visible !== undefined ? req.body.visible !== false : series[index].visible !== false,
    status: req.body.status !== undefined
      ? normalizeSeriesStatus(req.body.status)
      : normalizeSeriesStatus(series[index].status),
    updatedAt: new Date().toISOString()
  };
  await writeJSON('series.json', series);
  await logEdit('作者', '编辑作品系列', name, `${workIds.length} 件作品`);
  res.json({ ...series[index], works: authorSeriesWorks(circleId, workIds) });
});

app.delete('/api/author/series/:id', authorAuthMiddleware, async (req, res) => {
  const circleId = req.author.circleId;
  const series = readJSON('series.json');
  const index = series.findIndex(s => s.id === req.params.id && s.circleId === circleId);
  if (index === -1) return res.status(404).json({ error: '系列未找到' });
  const [removed] = series.splice(index, 1);
  await writeJSON('series.json', series);
  const circles = readJSON('circles.json');
  let changed = false;
  circles.forEach(c => {
    if (Array.isArray(c.featuredSeriesIds) && c.featuredSeriesIds.includes(req.params.id)) {
      c.featuredSeriesIds = c.featuredSeriesIds.filter(id => id !== req.params.id);
      changed = true;
    }
  });
  if (changed) await writeJSON('circles.json', circles);
  await logEdit('作者', '删除作品系列', removed.name || removed.id, '');
  res.json({ success: true });
});

// Public series for author pages and project pages.
app.get('/api/series', (req, res) => {
  try {
    let series = readJSON('series.json');
    const works = readJSON('works.json');
    const publicWorks = works.filter(isWorkPublic);
    const { circleId, projectId } = req.query;
    if (circleId) series = series.filter(s => s.visible !== false);
    if (circleId) series = series.filter(s => s.circleId === circleId);
    if (projectId) {
      const project = readJSON('projects.json').find(p => p.id === projectId);
      if (!project) return res.json([]);
      const participants = new Set(project.circles || []);
      (project.works || []).forEach(id => {
        const work = works.find(w => w.id === id);
        (work?.circles || []).forEach(cid => participants.add(cid));
      });
      series = series.filter(s => participants.has(s.circleId));
    }
    const result = series.map(s => {
      const own = works.filter(w => (w.circles || []).includes(s.circleId));
      const selected = new Set((Array.isArray(s.workIds) ? s.workIds : []).map(String));
      const items = publicWorks.filter(w => selected.has(String(w.id)) && (w.circles || []).includes(s.circleId));
      return { ...s, status: normalizeSeriesStatus(s.status), works: items, workCount: items.length };
    }).filter(s => s.works.length > 0).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    res.json(result);
  } catch (e) {
    console.error('[series]', e.message);
    res.json([]);
  }
});

app.get('/api/series/:id', (req, res) => {
  const series = readJSON('series.json').find(s => s.id === req.params.id);
  if (!series) return res.status(404).json({ error: '系列未找到' });
  const works = readJSON('works.json').filter(isWorkPublic);
  const selected = new Set((Array.isArray(series.workIds) ? series.workIds : []).map(String));
  const items = works.filter(w => selected.has(String(w.id)) && (w.circles || []).includes(series.circleId));
  const owner = readJSON('circles.json').find(c => c.id === series.circleId);
  res.json({ ...series, status: normalizeSeriesStatus(series.status), works: items, workCount: items.length, owner: owner ? { id: owner.id, name: owner.name, logo: owner.logo || '' } : null });
});

// Admin: manage all series
app.get('/api/admin/series', authMiddleware, (req, res) => {
  const series = readJSON('series.json');
  const circles = readJSON('circles.json');
  const works = readJSON('works.json');
  res.json(series.map(s => {
    const owner = circles.find(c => c.id === s.circleId);
    const selected = new Set((Array.isArray(s.workIds) ? s.workIds : []).map(String));
    return {
      ...s,
      status: normalizeSeriesStatus(s.status),
      ownerName: owner?.name || '未知作者',
      workCount: works.filter(w => selected.has(String(w.id))).length
    };
  }));
});

app.put('/api/admin/series/:id', authMiddleware, async (req, res) => {
  const series = readJSON('series.json');
  const index = series.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '系列未找到' });
  const works = readJSON('works.json');
  const validIds = new Set(works.map(w => String(w.id)));
  const workIds = [...new Set((Array.isArray(req.body.workIds) ? req.body.workIds : series[index].workIds || []).map(String).filter(id => validIds.has(id)))];
  series[index] = {
    ...series[index],
    name: String(req.body.name ?? series[index].name).trim().slice(0, 80) || series[index].name,
    cover: req.body.cover !== undefined ? String(req.body.cover || '').slice(0, 1000) : series[index].cover,
    category: req.body.category !== undefined ? String(req.body.category || '').slice(0, 80) : series[index].category,
    startDate: req.body.startDate !== undefined ? String(req.body.startDate || '').slice(0, 20) : series[index].startDate,
    endDate: req.body.endDate !== undefined ? String(req.body.endDate || '').slice(0, 20) : series[index].endDate,
    tags: req.body.tags !== undefined && Array.isArray(req.body.tags) ? req.body.tags.map(t => String(t).slice(0, 30)).filter(Boolean).slice(0, 12) : series[index].tags,
    description: req.body.description !== undefined ? String(req.body.description || '').slice(0, 5000) : series[index].description,
    contactInfo: req.body.contactInfo !== undefined ? String(req.body.contactInfo || '').slice(0, 2000) : series[index].contactInfo,
    status: req.body.status !== undefined
      ? normalizeSeriesStatus(req.body.status)
      : normalizeSeriesStatus(series[index].status),
    visible: req.body.visible !== undefined ? req.body.visible !== false : series[index].visible !== false,
    workIds,
    updatedAt: new Date().toISOString()
  };
  await writeJSON('series.json', series);
  await logEdit('管理员', '编辑作品系列', series[index].name, `${workIds.length} 件作品`);
  res.json(series[index]);
});

app.delete('/api/admin/series/:id', authMiddleware, async (req, res) => {
  let series = readJSON('series.json');
  const index = series.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '系列未找到' });
  const [removed] = series.splice(index, 1);
  await writeJSON('series.json', series);
  const circles = readJSON('circles.json');
  let changed = false;
  circles.forEach(c => {
    if (Array.isArray(c.featuredSeriesIds) && c.featuredSeriesIds.includes(req.params.id)) {
      c.featuredSeriesIds = c.featuredSeriesIds.filter(id => id !== req.params.id);
      changed = true;
    }
  });
  if (changed) await writeJSON('circles.json', circles);
  await logEdit('管理员', '删除作品系列', removed.name || removed.id, '');
  res.json({ success: true });
});

// Author: change password
app.post('/api/author/change-password', authorAuthMiddleware, rateLimitMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '请填写完整信息' });
  if (!isPasswordAcceptable(newPassword)) return res.status(400).json({ error: '新密码至少8位' });

  let circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === req.author.circleId);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });

  if (!(await bcrypt.compare(oldPassword, circles[index].passwordHash || ''))) {
    return res.status(401).json({ error: '旧密码错误' });
  }

  circles[index].passwordHash = await bcrypt.hash(newPassword, 10);
  await writeJSON('circles.json', circles);
  res.json({ success: true });
});

// Author: refresh token
app.post('/api/author/refresh-token', authorAuthMiddleware, (req, res) => {
  const newToken = jwt.sign(
    { circleId: req.author.circleId, role: 'author' },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
  res.json({ token: newToken });
});

// Author: get own works
app.get('/api/author/works', authorAuthMiddleware, (req, res) => {
  const works = readJSON('works.json');
  const circleWorks = works
    .filter(w => (w.circles || []).includes(req.author.circleId))
    .map(authorWorkView);
  circleWorks.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  // 支持分页
  const page = parseInt(req.query.page) || 0;
  const limit = parseInt(req.query.limit) || 0;
  if (page > 0 && limit > 0) {
    const total = circleWorks.length;
    const items = circleWorks.slice((page - 1) * limit, page * limit);
    return res.json({ items, total, page, limit, totalPages: Math.ceil(total / limit) });
  }

  // 不分页时返回全部（兼容旧版本）
  res.json(circleWorks);
});

// Author: reorder works
app.post('/api/author/works/reorder', authorAuthMiddleware, async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: '无效的排序数据' });

  let works = readJSON('works.json');
  orderedIds.forEach((id, index) => {
    const work = works.find(w => w.id === id);
    if (work && (work.circles || []).includes(req.author.circleId)) {
      work.order = index;
    }
  });
  await writeJSON('works.json', works);
  res.json({ success: true });
});

// Author: export own works to XLSX
app.get('/api/author/works/export', authorAuthMiddleware, (req, res) => {
  const works = readJSON('works.json');
  const circleWorks = works.filter(w => (w.circles || []).includes(req.author.circleId));

  let categories = { works: [], workStatus: [] };
  try { categories = readJSON('categories.json'); } catch {}
  const catMap = {};
  categories.works.forEach(c => catMap[c.id] = c.name);
  const statusMap = {};
  categories.workStatus.forEach(c => statusMap[c.id] = c.name);

  const data = circleWorks.map(w => ({
    '作品名称': w.title,
    '分类': catMap[w.category] || w.category || '',
    '状态': statusMap[w.status] || w.status || '',
    '价格': w.price || '',
    '发售日期': w.releaseDate || '',
    '截止日期': w.endDate || '',
    '标签': (w.tags || []).join(', '),
    '作品描述': w.description || '',
    '约稿作品': w.isCommissioned ? '是' : '否',
    '约稿作者': w.commissionedBy || '',
    '联系方式类型': w.socialLinks?.qq ? 'QQ' : w.socialLinks?.qqGroup ? 'QQ群' : '',
    '联系方式': w.socialLinks?.qq || w.socialLinks?.qqGroup || '',
    '网站链接': w.socialLinks?.website || '',
    '网站显示名': w.socialLinks?.websiteLabel || ''
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
    { wch: 14 }, { wch: 20 }, { wch: 40 }, { wch: 8 },
    { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 25 }, { wch: 15 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, '作品列表');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const circle = readJSON('circles.json').find(c => c.id === req.author.circleId);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''works_${encodeURIComponent(circle?.name || 'export')}.xlsx`);
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// Author: import works from Excel
app.post('/api/author/works/import', authorAuthMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });

  try {
    const rows = readExcelRows(req.file.path);

    let works = readJSON('works.json');
    let categories = { works: [], workStatus: [] };
    try { categories = readJSON('categories.json'); } catch {}

    const CATEGORY_MAP = {};
    categories.works.forEach(c => { CATEGORY_MAP[c.name] = c.id; CATEGORY_MAP[c.id] = c.id; });
    const STATUS_MAP = {};
    categories.workStatus.forEach(c => { STATUS_MAP[c.name] = c.id; STATUS_MAP[c.id] = c.id; });

    let added = 0, updated = 0;

    rows.forEach(row => {
      const title = row['作品名称'] || row['标题'] || '';
      if (!title) return;

      const existing = works.find(w => w.title === title && (w.circles || []).includes(req.author.circleId));
      const isCommissioned = (row['约稿作品'] || '').toString().trim() === '是';
      const contactType = (row['联系方式类型'] || '').toString().trim();
      const contactValue = (row['联系方式'] || '').toString().trim();
      const websiteUrl = (row['网站链接'] || '').toString().trim();
      const websiteLabel = (row['网站显示名'] || '').toString().trim();

      // Build socialLinks from import data
      const socialLinks = {};
      if (contactType === 'QQ' && contactValue) socialLinks.qq = contactValue;
      else if (contactType === 'QQ群' && contactValue) socialLinks.qqGroup = contactValue;
      if (websiteUrl) socialLinks.website = websiteUrl;
      if (websiteLabel) socialLinks.websiteLabel = websiteLabel;

      const workData = {
        title,
        category: CATEGORY_MAP[row['分类']] || 'other',
        status: STATUS_MAP[row['状态']] || 'on_sale',
        price: row['价格'] || '',
        releaseDate: row['发售日期'] || '',
        endDate: row['截止日期'] || '',
        tags: (row['标签'] || '').split(',').map(t => t.trim()).filter(Boolean),
        description: row['作品描述'] || row['描述'] || '',
        isCommissioned,
        commissionedBy: isCommissioned ? (row['约稿作者'] || '') : ''
      };

      if (existing) {
        Object.assign(existing, workData);
        // Merge socialLinks instead of replacing
        if (Object.keys(socialLinks).length > 0) {
          existing.socialLinks = { ...(existing.socialLinks || {}), ...socialLinks };
        }
        updated++;
      } else {
        works.push({
          id: 'w' + Date.now() + Math.random().toString(36).substr(2, 5),
          ...workData,
          circles: [req.author.circleId],
          images: [],
          moreImages: [],
          likes: 0,
          wants: 0,
          order: works.length,
          createdAt: new Date().toISOString(),
          approvalStatus: 'pending',
          submittedBy: req.author.circleId,
          socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : undefined
        });
        added++;
      }
    });

    await writeJSON('works.json', works);
    fs.unlinkSync(req.file.path);

    const circles = readJSON('circles.json');
    const circle = circles.find(c => c.id === req.author.circleId);
    logEdit(circle?.name || '作者', '导入作品', '', `新增${added}个，更新${updated}个`);

    res.json({ success: true, added, updated });
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: '导入失败: ' + e.message });
  }
});

// Author: get own edit history
app.get('/api/author/history', authorAuthMiddleware, (req, res) => {
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  if (!circle) return res.json([]);

  let log = [];
  try { log = readJSON('edit-log.json'); } catch {}
  if (!Array.isArray(log)) log = [];

  const authorLog = log.filter(entry => entry.user === circle.name);
  res.json(authorLog.reverse().slice(0, 100));
});

// Author: get notifications
app.get('/api/author/notifications', authorAuthMiddleware, (req, res) => {
  let notifications = [];
  try { notifications = readJSON('author-notifications.json'); } catch {}
  if (!Array.isArray(notifications)) notifications = [];

  const authorNotifs = notifications
    .filter(n => n.circleId === req.author.circleId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);
  res.json(authorNotifs);
});

// Author: mark all notifications as read
app.put('/api/author/notifications/read-all', authorAuthMiddleware, async (req, res) => {
  let notifications = [];
  try { notifications = readJSON('author-notifications.json'); } catch {}
  if (!Array.isArray(notifications)) notifications = [];

  let updated = 0;
  notifications = notifications.map(n => {
    if (n.circleId === req.author.circleId && !n.read) {
      updated += 1;
      return { ...n, read: true };
    }
    return n;
  });
  if (updated > 0) await writeJSON('author-notifications.json', notifications);
  res.json({ success: true, updated });
});

// Author: mark notification as read
app.put('/api/author/notifications/:id/read', authorAuthMiddleware, async (req, res) => {
  let notifications = [];
  try { notifications = readJSON('author-notifications.json'); } catch {}
  if (!Array.isArray(notifications)) notifications = [];

  const index = notifications.findIndex(n => n.id === req.params.id && n.circleId === req.author.circleId);
  if (index === -1) return res.status(404).json({ error: '通知未找到' });

  notifications[index].read = true;
  await writeJSON('author-notifications.json', notifications);
  res.json({ success: true });
});

// Author: batch update works
app.put('/api/author/works/batch', authorAuthMiddleware, async (req, res) => {
  const { ids, data } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '请提供要更新的作品ID列表' });
  if (!data || typeof data !== 'object') return res.status(400).json({ error: '请提供更新数据' });

  const circleId = req.author.circleId;
  const idSet = new Set(ids);
  const allowed = ['title', 'description', 'category', 'status', 'price', 'releaseDate', 'endDate', 'tags', 'images', 'moreImages', 'socialLinks', 'isCommissioned', 'commissionedBy', 'relatedEvents'];
  const updates = {};
  allowed.forEach(field => {
    if (data[field] !== undefined) updates[field] = data[field];
  });

  let works = readJSON('works.json');
  let updated = 0;

  for (const w of works) {
    if (idSet.has(w.id) && (w.circles || []).includes(circleId)) {
      Object.assign(w, updates);
      updated++;
    }
  }

  if (updated === 0) return res.status(404).json({ error: '未找到可更新的作品' });

  await writeJSON('works.json', works);

  // Handle event associations if provided — 写作品 relatedEvents，并同步活动 relatedWorks
  if (data.relatedEvents !== undefined) {
    let events = readJSON('events.json');
    const newEventIds = Array.isArray(data.relatedEvents) ? data.relatedEvents.filter(Boolean) : [];
    const matchingWorkIds = works.filter(w => idSet.has(w.id) && (w.circles || []).includes(circleId)).map(w => w.id);
    const matchSet = new Set(matchingWorkIds);
    for (const evt of events) {
      if (!Array.isArray(evt.relatedWorks)) evt.relatedWorks = [];
      matchingWorkIds.forEach(wid => {
        const hasWork = evt.relatedWorks.includes(wid);
        const shouldHave = newEventIds.includes(evt.id);
        if (hasWork && !shouldHave) {
          evt.relatedWorks = evt.relatedWorks.filter(id => id !== wid);
        } else if (!hasWork && shouldHave) {
          evt.relatedWorks.push(wid);
        }
      });
      // 同时清理本次批量外其它作品不在 relatedEvents 的残留不做处理
    }
    await writeJSON('events.json', events);
  }

  // Handle project associations if provided
  if (data.relatedProjects !== undefined) {
    let projects = readJSON('projects.json');
    const newProjectIds = data.relatedProjects || [];
    for (const proj of projects) {
      const matchingWorkIds = works.filter(w => idSet.has(w.id) && (w.circles || []).includes(circleId)).map(w => w.id);
      for (const wid of matchingWorkIds) {
        const hasWork = (proj.works || []).includes(wid);
        const shouldHave = newProjectIds.includes(proj.id);
        if (hasWork && !shouldHave) {
          proj.works = proj.works.filter(id => id !== wid);
        } else if (!hasWork && shouldHave) {
          if (!proj.works) proj.works = [];
          proj.works.push(wid);
        }
      }
    }
    await writeJSON('projects.json', projects);
  }

  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === circleId);
  logEdit(circle?.name || '作者', '批量编辑作品', `${updated} 个作品`, '');

  res.json({ success: true, updated });
});

// Author: update own work
app.put('/api/author/works/:id', authorAuthMiddleware, async (req, res) => {
  let works = readJSON('works.json');
  const index = works.findIndex(w => w.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作品未找到' });

  // Verify the work belongs to this author
  if (!(works[index].circles || []).includes(req.author.circleId)) {
    return res.status(403).json({ error: '无权编辑此作品' });
  }

  const work = works[index];
  const oldTitle = work.title;
  const beforeEdit = JSON.parse(JSON.stringify(work));
  const oldImages = work.images || [];
  const oldMoreImages = work.moreImages || [];

  // Only allow updating specific fields
  const allowed = ['title', 'description', 'category', 'status', 'price', 'releaseDate', 'endDate', 'tags', 'images', 'moreImages', 'socialLinks', 'isCommissioned', 'commissionedBy', 'relatedEvents'];
  const updates = {};
  allowed.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  // Keep non-content fields (e.g. event associations) outside the approval snapshot.
  const nonContentUpdates = { ...updates };
  WORK_CONTENT_FIELDS.forEach(f => { delete nonContentUpdates[f]; });
  Object.assign(work, nonContentUpdates);

  const contentChanged = WORK_CONTENT_FIELDS.some(f =>
    updates[f] !== undefined && JSON.stringify(updates[f]) !== JSON.stringify(work[f])
  );

  if (contentChanged) {
    const circle = readJSON('circles.json').find(c => c.id === req.author.circleId);
    const requireApproval = workRequireApproval(circle);
    const isApproved = !work.approvalStatus || work.approvalStatus === 'approved';
    if (!requireApproval) {
      Object.assign(work, updates);
      work.approvalStatus = 'approved';
      work.published = pickWorkContent(work);
      delete work.pendingRevision;
      delete work.rejectReason;
    } else if (!work.published && !isApproved) {
      // First submission (pending/rejected with no published version): keep editing the same draft.
      Object.assign(work, updates);
      work.approvalStatus = 'pending';
      delete work.pendingRevision;
      work.submittedAt = new Date().toISOString();
      work.submittedBy = req.author.circleId;
    } else {
      // Approved version stays public; new content waits in pendingRevision.
      if (!work.published) work.published = pickWorkContent(work);
      work.pendingRevision = {
        ...pickWorkContent({ ...work, ...updates }),
        submittedAt: new Date().toISOString(),
        submittedBy: req.author.circleId
      };
      work.approvalStatus = 'pending';
      work.rejectReason = '';
    }
  } else {
    Object.assign(work, updates);
  }

  await writeJSON('works.json', works);

  // Handle project associations if provided
  if (req.body.relatedProjects !== undefined) {
    let projects = readJSON('projects.json');
    const newProjectIds = req.body.relatedProjects || [];
    projects.forEach(proj => {
      const hasWork = (proj.works || []).includes(req.params.id);
      const shouldHave = newProjectIds.includes(proj.id);
      if (hasWork && !shouldHave) {
        proj.works = proj.works.filter(id => id !== req.params.id);
      } else if (!hasWork && shouldHave) {
        if (!proj.works) proj.works = [];
        proj.works.push(req.params.id);
      }
    });
    await writeJSON('projects.json', projects);
  }

  // Handle event associations if provided
  if (req.body.relatedEvents !== undefined) {
    const newEventIds = [...new Set((Array.isArray(req.body.relatedEvents) ? req.body.relatedEvents : []).filter(Boolean))];
    work.relatedEvents = newEventIds;
    let events = readJSON('events.json');
    let changed = false;
    events.forEach(evt => {
      const hasWork = (evt.relatedWorks || []).includes(work.id);
      const shouldHave = newEventIds.includes(evt.id);
      if (hasWork && !shouldHave) {
        evt.relatedWorks = (evt.relatedWorks || []).filter(id => id !== work.id);
        changed = true;
      } else if (!hasWork && shouldHave) {
        if (!evt.relatedWorks) evt.relatedWorks = [];
        evt.relatedWorks.push(work.id);
        changed = true;
      }
      // Add the author to the event when a new work is associated, but never
      // remove relatedCircles automatically: it may be manually curated.
      if (shouldHave && !(evt.relatedCircles || []).includes(req.author.circleId)) {
        if (!evt.relatedCircles) evt.relatedCircles = [];
        evt.relatedCircles.push(req.author.circleId);
        changed = true;
      }
    });
    if (changed) await writeJSON('events.json', events);
    await writeJSON('works.json', works);
  }

  // Log changes
  const newImages = works[index].images || [];
  const newMoreImages = works[index].moreImages || [];
  const details = [];
  if (newImages.length > oldImages.length) details.push('上传了' + (newImages.length - oldImages.length) + '张展示图片');
  if (newImages.length < oldImages.length) details.push('删除了' + (oldImages.length - newImages.length) + '张展示图片');
  if (newMoreImages.length > oldMoreImages.length) details.push('上传了' + (newMoreImages.length - oldMoreImages.length) + '张更多图片');
  if (newMoreImages.length < oldMoreImages.length) details.push('删除了' + (oldMoreImages.length - newMoreImages.length) + '张更多图片');
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '编辑作品', oldTitle || req.params.id, details.join('、'), '', { before: beforeEdit, after: works[index] });

  res.json(works[index]);
});

// Author: batch create works
app.post('/api/author/works/batch-create', authorAuthMiddleware, async (req, res) => {
  const { works: worksInput } = req.body;
  if (!Array.isArray(worksInput) || worksInput.length === 0) return res.status(400).json({ error: '请提供要创建的作品列表' });

  const circleId = req.author.circleId;
  let works = readJSON('works.json');
  let maxOrder = works.reduce((max, w) => Math.max(max, w.order ?? 0), 0);

  let settings = {};
  try { settings = readJSON('settings.json'); } catch {}
  const circles = readJSON('circles.json');
  const authorCircle = circles.find(c => c.id === circleId);
  const authorRequireApproval = authorCircle?.requireApproval !== false;
  const globalRequireApproval = settings.site?.requireWorkApproval !== false;
  const requireApproval = authorRequireApproval && globalRequireApproval;

  const allowedFields = ['title', 'titleEn', 'category', 'price', 'status', 'releaseDate', 'endDate', 'tags', 'description', 'images', 'moreImages', 'isCommissioned', 'commissionedBy', 'socialLinks'];
  const created = [];
  const now = new Date().toISOString();

  for (const input of worksInput) {
    const workData = {};
    allowedFields.forEach(field => {
      if (input[field] !== undefined) workData[field] = input[field];
    });
    maxOrder++;
    const work = {
      id: 'w' + Date.now() + Math.random().toString(36).substr(2, 5),
      circles: [circleId],
      images: [],
      moreImages: [],
      tags: [],
      likes: 0,
      wants: 0,
      order: maxOrder,
      createdAt: now,
      approvalStatus: requireApproval ? 'pending' : 'approved',
      submittedBy: circleId,
      ...workData
    };
    works.push(work);
    created.push(work);
    // Small delay to ensure unique IDs
    await new Promise(r => setTimeout(r, 1));
  }

  await writeJSON('works.json', works);

  const logCircles = readJSON('circles.json');
  const circle = logCircles.find(c => c.id === circleId);
  logEdit(circle?.name || '作者', '批量创建作品', `${created.length} 个作品`, '');

  res.json({ success: true, created: created.length, works: created });
});

// Author: create new work
app.post('/api/author/works', authorAuthMiddleware, async (req, res) => {
  let works = readJSON('works.json');
  const maxOrder = works.reduce((max, w) => Math.max(max, w.order ?? 0), 0);
  // Check if work approval is required
  let settings = {};
  try { settings = readJSON('settings.json'); } catch {}
  const circles = readJSON('circles.json');
  const authorCircle = circles.find(c => c.id === req.author.circleId);
  const authorRequireApproval = authorCircle?.requireApproval !== false;
  const globalRequireApproval = settings.site?.requireWorkApproval !== false;
  const requireApproval = authorRequireApproval && globalRequireApproval;
  // Whitelist allowed fields to prevent mass assignment
  const allowedFields = ['title', 'titleEn', 'category', 'price', 'status', 'releaseDate', 'endDate', 'tags', 'description', 'images', 'moreImages', 'isCommissioned', 'commissionedBy', 'socialLinks', 'relatedEvents'];
  const workData = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) workData[field] = req.body[field];
  });
  const work = {
    id: 'w' + Date.now() + Math.random().toString(36).substr(2, 5),
    circles: [req.author.circleId],
    images: [],
    moreImages: [],
    tags: [],
    likes: 0,
    wants: 0,
    order: maxOrder + 1,
    createdAt: new Date().toISOString(),
    approvalStatus: requireApproval ? 'pending' : 'approved',
    submittedBy: req.author.circleId,
    ...workData
  };
  works.push(work);
  await writeJSON('works.json', works);

  // Handle project associations
  if (req.body.relatedProjects && req.body.relatedProjects.length > 0) {
    let projects = readJSON('projects.json');
    req.body.relatedProjects.forEach(pid => {
      const proj = projects.find(p => p.id === pid);
      if (proj) {
        if (!proj.works) proj.works = [];
        proj.works.push(work.id);
      }
    });
    await writeJSON('projects.json', projects);
  }

  // Handle event associations
  if (Array.isArray(req.body.relatedEvents) && req.body.relatedEvents.length > 0) {
    let events = readJSON('events.json');
    const ids = [...new Set(req.body.relatedEvents.filter(Boolean))];
    ids.forEach(eid => {
      const evt = events.find(e => e.id === eid);
      if (evt) {
        if (!Array.isArray(evt.relatedWorks)) evt.relatedWorks = [];
        if (!evt.relatedWorks.includes(work.id)) evt.relatedWorks.push(work.id);
        if (!Array.isArray(evt.relatedCircles)) evt.relatedCircles = [];
        if (!evt.relatedCircles.includes(req.author.circleId)) evt.relatedCircles.push(req.author.circleId);
      }
    });
    await writeJSON('events.json', events);
  }

  const logCircles = readJSON('circles.json');
  const circle = logCircles.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '创建作品', work.title || work.id, '');

  res.json(work);
});

// Author: delete own work
// Author: batch delete works
app.delete('/api/author/works', authorAuthMiddleware, async (req, res) => {
  const ids = req.body.ids;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '请提供要删除的作品ID列表' });

  let works = readJSON('works.json');
  const circleId = req.author.circleId;
  const idSet = new Set(ids);
  const deleted = [];
  const kept = [];

  for (const w of works) {
    if (idSet.has(w.id) && (w.circles || []).includes(circleId)) {
      deleted.push(w);
    } else {
      kept.push(w);
    }
  }

  if (deleted.length === 0) return res.status(404).json({ error: '未找到可删除的作品' });

  await writeJSON('works.json', kept);

  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === circleId);
  const authorName = circle?.name || '作者';
  if (deleted.length <= 5) {
    deleted.forEach(w => logEdit(authorName, '删除作品', w.title || w.id, ''));
  } else {
    logEdit(authorName, '批量删除作品', `${deleted.length} 个作品`, deleted.map(w => w.title || w.id).join('、'));
  }

  res.json({ success: true, deleted: deleted.length });
});

app.delete('/api/author/works/:id', authorAuthMiddleware, async (req, res) => {
  let works = readJSON('works.json');
  const index = works.findIndex(w => w.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作品未找到' });

  // Verify the work belongs to this author
  if (!(works[index].circles || []).includes(req.author.circleId)) {
    return res.status(403).json({ error: '无权删除此作品' });
  }

  const workTitle = works[index].title;
  works.splice(index, 1);
  await writeJSON('works.json', works);

  // Log the deletion
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '删除作品', workTitle || req.params.id, '');

  res.json({ success: true });
});

// Author: get images list
app.get('/api/author/images', authorAuthMiddleware, (req, res) => {
  const uploadsDir = path.join(__dirname, 'uploads');
  let meta = {};
  try { meta = readJSON('uploads-meta.json'); } catch {}
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  const authorName = circle?.name || '未知作者';
  try {
    const files = fs.readdirSync(uploadsDir)
      .filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f))
      .filter(f => (meta[f]?.uploader || '') === authorName)
      .map(f => ({
        name: f,
        url: '/uploads/' + f,
        size: fs.statSync(path.join(uploadsDir, f)).size,
        time: fs.statSync(path.join(uploadsDir, f)).mtime,
        uploader: meta[f]?.uploader || '未知',
        uploadedAt: meta[f]?.uploadedAt || null
      }))
      .sort((a, b) => b.time - a.time);
    res.json(files);
  } catch (e) {
    res.json([]);
  }
});

// Author: delete own image
app.delete('/api/author/images/:filename', authorAuthMiddleware, async (req, res) => {
  const filename = req.params.filename;
  let meta = {};
  try { meta = readJSON('uploads-meta.json'); } catch {}
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  const authorName = circle?.name || '未知作者';
  const safeFilename = path.basename(filename); // Prevent path traversal
  if ((meta[safeFilename]?.uploader || '') !== authorName) {
    return res.status(403).json({ error: '只能删除自己上传的图片' });
  }
  // Refuse to delete an image still referenced by any work/event/announcement/setting.
  try {
    const refs = collectAllUploadRefs();
    if (refs.has(safeFilename) || isUploadVariantUsed(safeFilename, refs)) {
      return res.status(409).json({ error: '图片仍在使用中，请先从内容中移除' });
    }
  } catch (e) {
    return res.status(500).json({ error: '检查图片引用失败' });
  }
  try {
    const item = trashUpload(safeFilename, authorName);
    const index = readTrashIndex();
    index.push({ ...item, trashedAt: new Date().toISOString() });
    await writeTrashIndex(index);
    delete meta[safeFilename];
    await writeJSON('uploads-meta.json', meta);
    logEdit(authorName, '删除图片（回收站）', safeFilename, '');
    clearEditLogImageUrl('/uploads/' + safeFilename);
    res.json({ success: true, trashed: true });
  } catch (e) {
    res.status(500).json({ error: '删除失败: ' + e.message });
  }
});

// Author: get unused images
app.get('/api/author/images/unused', authorAuthMiddleware, (req, res) => {
  const uploadsDir = path.join(__dirname, 'uploads');
  let meta = {};
  try { meta = readJSON('uploads-meta.json'); } catch {}
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  const authorName = circle?.name || '未知作者';

  // 获取该作者的所有图片
  try {
    const referenced = collectAllUploadRefs();
    const allFiles = listUploadFiles()
      .filter(f => (meta[f]?.uploader || '') === authorName);

    const unused = allFiles.filter(f => !referenced.has(f) && !isUploadVariantUsed(f, referenced)).map(f => ({
      name: f,
      url: '/uploads/' + f,
      size: fs.statSync(path.join(UPLOADS_DIR, f)).size,
      uploadedAt: meta[f]?.uploadedAt || null
    }));

    res.json({ total: allFiles.length, unused: unused.length, images: unused });
  } catch (e) {
    res.json({ total: 0, unused: 0, images: [] });
  }
});

// Author: get projects list
app.get('/api/author/projects', authorAuthMiddleware, (req, res) => {
  const projects = readJSON('projects.json');
  res.json(projects);
});

// Author: get events list
app.get('/api/author/events', authorAuthMiddleware, (req, res) => {
  const events = readJSON('events.json');
  res.json(events);
});

// Author: batch toggle event associations
app.put('/api/author/events/batch-toggle', authorAuthMiddleware, async (req, res) => {
  const { eventIds } = req.body;
  if (!Array.isArray(eventIds)) return res.status(400).json({ error: '请提供活动ID列表' });

  const circleId = req.author.circleId;
  const idSet = new Set(eventIds);
  let events = readJSON('events.json');
  let works = readJSON('works.json');
  let toggled = 0;

  const authorWorkIds = works.filter(w => (w.circles || []).includes(circleId)).map(w => w.id);

  for (const evt of events) {
    if (idSet.has(evt.id)) {
      if (!evt.relatedCircles) evt.relatedCircles = [];
      if (!evt.relatedWorks) evt.relatedWorks = [];

      const idx = evt.relatedCircles.indexOf(circleId);
      if (idx === -1) {
        evt.relatedCircles.push(circleId);
        for (const wid of authorWorkIds) {
          if (!evt.relatedWorks.includes(wid)) {
            evt.relatedWorks.push(wid);
          }
        }
      } else {
        evt.relatedCircles.splice(idx, 1);
        evt.relatedWorks = evt.relatedWorks.filter(wid => !authorWorkIds.includes(wid));
      }
      toggled++;
    }
  }

  if (toggled > 0) {
    await writeJSON('events.json', events);
    if (apiCache) apiCache.flushAll();
  }
  res.json({ success: true, toggled });
});

// Author: toggle event association
app.put('/api/author/events/:id/toggle', authorAuthMiddleware, async (req, res) => {
  let events = readJSON('events.json');
  let works = readJSON('works.json');
  const index = events.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '活动未找到' });

  const circleId = req.author.circleId;
  if (!events[index].relatedCircles) events[index].relatedCircles = [];
  if (!events[index].relatedWorks) events[index].relatedWorks = [];

  const idx = events[index].relatedCircles.indexOf(circleId);
  const authorWorkIds = works.filter(w => (w.circles || []).includes(circleId)).map(w => w.id);

  if (idx === -1) {
    events[index].relatedCircles.push(circleId);
    for (const wid of authorWorkIds) {
      if (!events[index].relatedWorks.includes(wid)) {
        events[index].relatedWorks.push(wid);
      }
    }
  } else {
    events[index].relatedCircles.splice(idx, 1);
    events[index].relatedWorks = events[index].relatedWorks.filter(wid => !authorWorkIds.includes(wid));
  }

  await writeJSON('events.json', events);
  if (apiCache) apiCache.flushAll();
  res.json(events[index]);
});

// Author: toggle project association
app.put('/api/author/projects/:id/toggle', authorAuthMiddleware, async (req, res) => {
  let projects = readJSON('projects.json');
  const index = projects.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '企划未找到' });

  const circleId = req.author.circleId;
  if (!projects[index].circles) projects[index].circles = [];

  const idx = projects[index].circles.indexOf(circleId);
  if (idx === -1) {
    projects[index].circles.push(circleId);
  } else {
    projects[index].circles.splice(idx, 1);
  }

  await writeJSON('projects.json', projects);
  res.json(projects[index]);
});

// ===== Author: Create Events/Projects/Updates (with approval) =====

// Author: get own events
app.get('/api/author/my-events', authorAuthMiddleware, (req, res) => {
  const events = readJSON('events.json');
  const circleId = req.author.circleId;
  const myEvents = events.filter(e =>
    e.submittedBy === circleId ||
    (e.editableBy || []).includes(circleId)
  );
  res.json(myEvents);
});

// Keep both directions of the event <-> work relation in sync.
// `event.relatedWorks` is the source of truth; every save path must call this.
async function syncEventWorkRelations(event) {
  if (!event || !event.id) return;
  const linked = new Set((Array.isArray(event.relatedWorks) ? event.relatedWorks : []).filter(Boolean));
  let works = readJSON('works.json');
  let changed = false;
  works.forEach(w => {
    if (!Array.isArray(w.relatedEvents)) w.relatedEvents = [];
    const i = w.relatedEvents.indexOf(event.id);
    const shouldHave = linked.has(w.id);
    if (shouldHave && i === -1) {
      w.relatedEvents.push(event.id);
      changed = true;
    } else if (!shouldHave && i !== -1) {
      w.relatedEvents.splice(i, 1);
      changed = true;
    }
  });
  if (changed) await writeJSON('works.json', works);
}

// Author: create event
app.post('/api/author/my-events', authorAuthMiddleware, async (req, res) => {
  let events = readJSON('events.json');
  const maxOrder = events.reduce((max, e) => Math.max(max, e.order ?? 0), 0);
  // Whitelist allowed fields to prevent mass assignment
  const allowedFields = ['title', 'date', 'endDate', 'location', 'description', 'coverImage', 'images', 'booth', 'status', 'socialLinks', 'relatedWorks'];
  const eventData = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) eventData[field] = req.body[field];
  });
  // 关联作者：默认包含自己，可再加其他人
  const extraCircles = Array.isArray(req.body.relatedCircles) ? req.body.relatedCircles.filter(Boolean) : [];
  const relatedCircles = [...new Set([req.author.circleId, ...extraCircles])];
  const relatedWorks = Array.isArray(eventData.relatedWorks) ? eventData.relatedWorks.filter(Boolean) : [];
  const eventApproval = resolveApprovalStatus('requireEventApproval');
  const event = {
    id: 'e' + Date.now() + Math.random().toString(36).substr(2, 5),
    ...eventData,
    relatedWorks,
    relatedCircles,
    approvalStatus: eventApproval,
    submittedBy: req.author.circleId,
    order: maxOrder + 1
  };
  events.push(event);
  await writeJSON('events.json', events);
  // 同步作品关联活动（双向）
  await syncEventWorkRelations(event);

  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '提交活动', event.title || event.id, approvalStatusLabel(eventApproval));

  res.json(event);
});

// Author: update own event (re-approval required)
app.put('/api/author/my-events/:id', authorAuthMiddleware, async (req, res) => {
  let events = readJSON('events.json');
  const index = events.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '活动未找到' });
  const circleId = req.author.circleId;
  const isOwner = events[index].submittedBy === circleId;
  const isEditable = (events[index].editableBy || []).includes(circleId);
  if (!isOwner && !isEditable) return res.status(403).json({ error: '无权编辑此活动' });
  const beforeEdit = JSON.parse(JSON.stringify(events[index]));

  const allowed = ['title', 'date', 'endDate', 'location', 'description', 'coverImage', 'images', 'booth', 'status', 'socialLinks', 'relatedWorks'];
  const updates = {};
  allowed.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });
  // 关联作者：始终保留自己
  if (req.body.relatedCircles !== undefined) {
    const extra = Array.isArray(req.body.relatedCircles) ? req.body.relatedCircles.filter(Boolean) : [];
    updates.relatedCircles = [...new Set([circleId, ...extra])];
  }
  if (Array.isArray(updates.relatedWorks)) {
    updates.relatedWorks = updates.relatedWorks.filter(Boolean);
  }

  events[index] = {
    ...events[index],
    ...updates,
    approvalStatus: resolveApprovalStatus('requireEventApproval')
  };
  // 同步作品 relatedEvents（双向）
  await writeJSON('events.json', events);
  await syncEventWorkRelations(events[index]);
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === circleId);
  await logEdit(circle?.name || '作者', '编辑活动', events[index].title || req.params.id, '', '', { before: beforeEdit, after: events[index] });
  res.json(events[index]);
});

// Author: delete own event (any status)
app.delete('/api/author/my-events/:id', authorAuthMiddleware, async (req, res) => {
  let events = readJSON('events.json');
  const index = events.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '活动未找到' });
  if (events[index].submittedBy !== req.author.circleId) return res.status(403).json({ error: '无权删除此活动' });

  const eventTitle = events[index].title;
  events.splice(index, 1);
  await writeJSON('events.json', events);

  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '删除活动', eventTitle || req.params.id, '');

  res.json({ success: true });
});

// ===== Author: ONLY booth management =====
function isEventBoothAdmin(event, circleId) {
  if (!event || !circleId) return false;
  return event.submittedBy === circleId || (event.editableBy || []).includes(circleId);
}
function isBoothOwnerOf(booth, circleId) {
  return !!(booth && (booth.circleIds || []).includes(circleId));
}
function tierGiftIdsOf(t) {
  if (!t) return [];
  if (Array.isArray(t.giftWorkIds) && t.giftWorkIds.some(Boolean)) return t.giftWorkIds.filter(Boolean);
  return t.giftWorkId ? [t.giftWorkId] : [];
}
function sanitizePromoTiers(tiers) {
  if (!Array.isArray(tiers)) return [];
  return tiers
    .filter(t => t && (t.minAmount != null || tierGiftIdsOf(t).length || t.text))
    .map(t => {
      const ids = tierGiftIdsOf(t);
      return { minAmount: Number(t.minAmount) || 0, giftWorkId: ids[0] || '', giftWorkIds: ids, text: String(t.text || '') };
    });
}
function sanitizeBoothImages(images) {
  if (!Array.isArray(images)) return undefined;
  return images.filter(u => u != null && String(u).trim() !== '').map(u => String(u));
}
// 摊位展示作品：空/缺省 = 展示摊主全部关联作品；有值 = 只展示勾选作品
function sanitizeBoothWorkIds(input) {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter(Boolean).map(String))];
}
// 摊位自定义分类：空/缺省 = 不分类；有值 = 前台按分类分组展示
function sanitizeBoothGoodsGroups(input) {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  return input
    .filter(g => g && typeof g === 'object')
    .map((g, i) => {
      const name = String(g.name == null ? '' : g.name).trim().slice(0, 40);
      const workIds = [...new Set((Array.isArray(g.workIds) ? g.workIds : []).filter(Boolean).map(String))];
      let id = String(g.id || ('c' + Date.now() + i)).trim().slice(0, 40);
      if (!id || seen.has(id)) id = 'c' + Date.now() + i;
      seen.add(id);
      return { id, name, workIds };
    })
    .filter(g => g.name || g.workIds.length);
}
// 条件领取：按「摊位 × 作品」存，只接受该摊位关联作品的 key
function sanitizeClaimConditions(input, booth, event) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const works = readJSON('works.json');
  const ownerIds = new Set(booth.circleIds || []);
  const relatedIds = new Set(event?.relatedWorks || []);
  const valid = new Set(
    works
      .filter(w => (w.circles || []).some(cid => ownerIds.has(cid)) && (relatedIds.size === 0 || relatedIds.has(w.id)))
      .map(w => w.id)
  );
  const out = {};
  for (const [workId, raw] of Object.entries(input)) {
    if (!valid.has(workId)) continue;
    const text = String(raw == null ? '' : raw).trim().slice(0, 200);
    if (text) out[workId] = text;
  }
  return out;
}

// 后台整体保存摊位数组时，清理条件领取里的空值与超长文本，并规范 workIds
function sanitizeBoothsClaimFields(booths) {
  if (!Array.isArray(booths)) return booths;
  return booths.map(b => {
    if (!b || typeof b !== 'object') return b;
    let next = b;
    if (b.workIds !== undefined) {
      let ids = sanitizeBoothWorkIds(b.workIds) || [];
      const ownerSet = new Set(b.circleIds || []);
      if (ownerSet.size) {
        const allowed = new Set(
          readJSON('works.json')
            .filter(w => (w.circles || []).some(cid => ownerSet.has(cid)))
            .map(w => w.id)
        );
        ids = ids.filter(id => allowed.has(id));
      }
      next = { ...next, workIds: ids };
    }
    if (b.goodsGroups !== undefined) {
      next = { ...next, goodsGroups: sanitizeBoothGoodsGroups(b.goodsGroups) || [] };
    }
    const raw = next.claimConditions;
    if (raw === undefined) return next;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      const { claimConditions, ...rest } = next;
      return rest;
    }
    const clean = {};
    for (const [workId, value] of Object.entries(raw)) {
      const text = String(value == null ? '' : value).trim().slice(0, 200);
      if (text) clean[workId] = text;
    }
    return { ...next, claimConditions: clean };
  });
}

// List ONLY events + booths the author can manage
app.get('/api/author/only-booths', authorAuthMiddleware, (req, res) => {
  const circleId = req.author.circleId;
  const events = readJSON('events.json').filter(e => e.type === 'only');
  const circles = readJSON('circles.json');
  const works = readJSON('works.json');
  const circleMap = Object.fromEntries(circles.map(c => [c.id, c]));

  const result = [];
  for (const event of events) {
    const canManageAll = isEventBoothAdmin(event, circleId);
    const relatedIds = new Set(event.relatedWorks || []);
    const relatedWorks = works
      .filter(w => relatedIds.has(w.id))
      .map(w => ({ id: w.id, title: w.title, images: w.images || [], price: w.price, circles: w.circles || [] }));

    const booths = (event.booths || []).map(b => {
      const owned = isBoothOwnerOf(b, circleId);
      return {
        ...b,
        isOwner: owned,
        canEdit: canManageAll || owned,
        canFullEdit: canManageAll
      };
    });
    const visibleBooths = canManageAll ? booths : booths.filter(b => b.canEdit);
    if (!canManageAll && !visibleBooths.length) continue;

    result.push({
      event: {
        id: event.id,
        title: event.title,
        date: event.date,
        location: event.location,
        type: event.type,
        relatedWorks: event.relatedWorks || [],
        editableBy: event.editableBy || [],
        submittedBy: event.submittedBy || ''
      },
      canManageAll,
      works: relatedWorks,
      circles: Object.values(circleMap)
        .filter(c => !c.authorStatus || c.authorStatus === 'approved' || c.authorStatus === 'active')
        .map(c => ({ id: c.id, name: c.name, logo: c.logo || '' })),
      booths: visibleBooths
    });
  }
  res.json(result);
});

function findOnlyEventForAuthor(eventId, circleId) {
  const events = readJSON('events.json');
  const index = events.findIndex(e => e.id === eventId && e.type === 'only');
  if (index === -1) return null;
  return { events, index, event: events[index], canManageAll: isEventBoothAdmin(events[index], circleId) };
}

// Event admin: create booth
app.post('/api/author/only-booths/:eventId', authorAuthMiddleware, async (req, res) => {
  const pack = findOnlyEventForAuthor(req.params.eventId, req.author.circleId);
  if (!pack) return res.status(404).json({ error: 'ONLY 活动未找到' });
  if (!pack.canManageAll) return res.status(403).json({ error: '仅活动管理员可新增摊位' });

  const booths = Array.isArray(pack.event.booths) ? pack.event.booths : [];
  const booth = {
    id: 'b' + Date.now() + Math.random().toString(36).slice(2, 6),
    code: String(req.body.code || '').trim(),
    title: String(req.body.title || '').trim(),
    logo: String(req.body.logo || ''),
    description: String(req.body.description || ''),
    images: sanitizeBoothImages(req.body.images) || [],
    order: booths.length,
    circleIds: Array.isArray(req.body.circleIds) ? req.body.circleIds.filter(Boolean) : [],
    goodsOrder: [],
    workIds: sanitizeBoothWorkIds(req.body.workIds) || [],
    goodsGroups: sanitizeBoothGoodsGroups(req.body.goodsGroups) || [],
    claimConditions: {},
    promoTiers: sanitizePromoTiers(req.body.promoTiers)
  };
  if (!booth.code) return res.status(400).json({ error: '请填写摊位号' });
  booths.push(booth);
  pack.events[pack.index].booths = booths;
  await writeJSON('events.json', pack.events);
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '新增摊位', pack.event.title, booth.code);
  res.json(booth);
});

// Update booth — event admin: full; booth owner: own booth limited fields
app.put('/api/author/only-booths/:eventId/:boothId', authorAuthMiddleware, async (req, res) => {
  const circleId = req.author.circleId;
  const pack = findOnlyEventForAuthor(req.params.eventId, circleId);
  if (!pack) return res.status(404).json({ error: 'ONLY 活动未找到' });
  const booths = Array.isArray(pack.event.booths) ? pack.event.booths : [];
  const bi = booths.findIndex(b => b.id === req.params.boothId);
  if (bi === -1) return res.status(404).json({ error: '摊位未找到' });
  const booth = booths[bi];
  const owned = isBoothOwnerOf(booth, circleId);
  if (!pack.canManageAll && !owned) return res.status(403).json({ error: '无权编辑该摊位' });

  if (pack.canManageAll) {
    if (req.body.code !== undefined) booth.code = String(req.body.code || '').trim();
    if (req.body.title !== undefined) booth.title = String(req.body.title || '').trim();
    if (req.body.logo !== undefined) booth.logo = String(req.body.logo || '');
    if (req.body.description !== undefined) booth.description = String(req.body.description || '');
    if (req.body.images !== undefined) {
      const imgs = sanitizeBoothImages(req.body.images);
      if (imgs) booth.images = imgs;
    }
    if (req.body.circleIds !== undefined) booth.circleIds = Array.isArray(req.body.circleIds) ? req.body.circleIds.filter(Boolean) : [];
    if (req.body.promoTiers !== undefined) booth.promoTiers = sanitizePromoTiers(req.body.promoTiers);
    if (req.body.goodsOrder !== undefined) booth.goodsOrder = Array.isArray(req.body.goodsOrder) ? req.body.goodsOrder.filter(Boolean) : [];
    if (req.body.workIds !== undefined) booth.workIds = sanitizeBoothWorkIds(req.body.workIds) || [];
    if (req.body.goodsGroups !== undefined) booth.goodsGroups = sanitizeBoothGoodsGroups(req.body.goodsGroups) || [];
  } else {
    // Booth owner / event editor: limited fields including description + promo images
    if (req.body.title !== undefined) booth.title = String(req.body.title || '').trim();
    if (req.body.logo !== undefined) booth.logo = String(req.body.logo || '');
    if (req.body.description !== undefined) booth.description = String(req.body.description || '');
    if (req.body.images !== undefined) {
      const imgs = sanitizeBoothImages(req.body.images);
      if (imgs) booth.images = imgs;
    }
    if (req.body.promoTiers !== undefined) booth.promoTiers = sanitizePromoTiers(req.body.promoTiers);
    if (req.body.goodsOrder !== undefined) booth.goodsOrder = Array.isArray(req.body.goodsOrder) ? req.body.goodsOrder.filter(Boolean) : [];
    // 仅可管理本摊已挂接摊主的作品
    if (req.body.workIds !== undefined) {
      const ownerSet = new Set(booth.circleIds || []);
      const allowed = new Set(
        readJSON('works.json')
          .filter(w => (w.circles || []).some(cid => ownerSet.has(cid)))
          .map(w => w.id)
      );
      booth.workIds = (sanitizeBoothWorkIds(req.body.workIds) || []).filter(id => allowed.has(id));
    }
    if (req.body.goodsGroups !== undefined) {
      const ownerSet = new Set(booth.circleIds || []);
      const allowed = new Set(
        readJSON('works.json')
          .filter(w => (w.circles || []).some(cid => ownerSet.has(cid)))
          .map(w => w.id)
      );
      const groups = sanitizeBoothGoodsGroups(req.body.goodsGroups) || [];
      booth.goodsGroups = groups.map(g => ({
        ...g,
        workIds: g.workIds.filter(id => !ownerSet.size || allowed.has(id))
      }));
    }
  }
  // 条件领取：按摊位作品设置；非摊位管理员只影响自己提交的 key，避免覆盖其他摊主
  if (req.body.claimConditions !== undefined) {
    const incoming = req.body.claimConditions;
    if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
      const cleaned = sanitizeClaimConditions(incoming, booth, pack.event) || {};
      if (pack.canManageAll) {
        booth.claimConditions = cleaned;
      } else {
        const current = (booth.claimConditions && typeof booth.claimConditions === 'object') ? { ...booth.claimConditions } : {};
        for (const key of Object.keys(incoming)) {
          if (cleaned[key]) current[key] = cleaned[key];
          else delete current[key];
        }
        booth.claimConditions = current;
      }
    }
  }
  if (!booth.code) booth.code = booth.code || '摊位';
  pack.events[pack.index].booths = booths;
  await writeJSON('events.json', pack.events);
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === circleId);
  logEdit(circle?.name || '作者', pack.canManageAll ? '编辑摊位' : '编辑自有摊位', pack.event.title, booth.code);
  res.json(booth);
});

// Event admin: delete booth
app.delete('/api/author/only-booths/:eventId/:boothId', authorAuthMiddleware, async (req, res) => {
  const pack = findOnlyEventForAuthor(req.params.eventId, req.author.circleId);
  if (!pack) return res.status(404).json({ error: 'ONLY 活动未找到' });
  if (!pack.canManageAll) return res.status(403).json({ error: '仅活动管理员可删除摊位' });
  const booths = Array.isArray(pack.event.booths) ? pack.event.booths : [];
  const next = booths.filter(b => b.id !== req.params.boothId);
  if (next.length === booths.length) return res.status(404).json({ error: '摊位未找到' });
  next.forEach((b, i) => { b.order = i; });
  pack.events[pack.index].booths = next;
  await writeJSON('events.json', pack.events);
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '删除摊位', pack.event.title, req.params.boothId);
  res.json({ success: true });
});

// Event admin: reorder booths
app.post('/api/author/only-booths/:eventId/reorder', authorAuthMiddleware, async (req, res) => {
  const pack = findOnlyEventForAuthor(req.params.eventId, req.author.circleId);
  if (!pack) return res.status(404).json({ error: 'ONLY 活动未找到' });
  if (!pack.canManageAll) return res.status(403).json({ error: '仅活动管理员可调整摊位顺序' });
  const order = Array.isArray(req.body.order) ? req.body.order : [];
  const booths = Array.isArray(pack.event.booths) ? pack.event.booths : [];
  const map = new Map(booths.map(b => [b.id, b]));
  const next = order.map(id => map.get(id)).filter(Boolean);
  booths.forEach(b => { if (!next.includes(b)) next.push(b); });
  next.forEach((b, i) => { b.order = i; });
  pack.events[pack.index].booths = next;
  await writeJSON('events.json', pack.events);
  res.json({ success: true, booths: next });
});

// Event admin or booth owner: reorder goods inside a booth
app.post('/api/author/only-booths/:eventId/:boothId/goods-order', authorAuthMiddleware, async (req, res) => {
  const circleId = req.author.circleId;
  const pack = findOnlyEventForAuthor(req.params.eventId, circleId);
  if (!pack) return res.status(404).json({ error: 'ONLY 活动未找到' });
  const booths = Array.isArray(pack.event.booths) ? pack.event.booths : [];
  const bi = booths.findIndex(b => b.id === req.params.boothId);
  if (bi === -1) return res.status(404).json({ error: '摊位未找到' });
  const owned = isBoothOwnerOf(booths[bi], circleId);
  if (!pack.canManageAll && !owned) return res.status(403).json({ error: '无权调整该摊位作品顺序' });
  booths[bi].goodsOrder = Array.isArray(req.body.goodsOrder) ? req.body.goodsOrder.filter(Boolean) : [];
  pack.events[pack.index].booths = booths;
  await writeJSON('events.json', pack.events);
  res.json({ success: true, goodsOrder: booths[bi].goodsOrder });
});

// Author: get own projects
app.get('/api/author/my-projects', authorAuthMiddleware, (req, res) => {
  const projects = readJSON('projects.json');
  const circleId = req.author.circleId;
  const myProjects = projects.filter(p =>
    p.submittedBy === circleId ||
    (p.editableBy || []).includes(circleId)
  );
  res.json(myProjects);
});

// Author: create project
app.post('/api/author/my-projects', authorAuthMiddleware, async (req, res) => {
  let projects = readJSON('projects.json');
  const maxOrder = projects.reduce((max, p) => Math.max(max, p.order ?? 0), 0);
  // Whitelist allowed fields to prevent mass assignment
  const allowedFields = ['title', 'description', 'status', 'category', 'images', 'tags', 'contactInfo', 'startDate', 'endDate', 'socialLinks', 'coverImage', 'works', 'recruiting', 'recruitNote', 'recruitJobs'];
  const projectData = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) projectData[field] = req.body[field];
  });
  const extraCircles = Array.isArray(req.body.circles) ? req.body.circles.filter(Boolean) : [];
  const circles = [...new Set([req.author.circleId, ...extraCircles])];
  const works = Array.isArray(projectData.works) ? projectData.works.filter(Boolean) : [];
  const projectApproval = resolveApprovalStatus('requireProjectApproval');
  const project = {
    id: 'p' + Date.now() + Math.random().toString(36).substr(2, 5),
    ...projectData,
    works,
    circles,
    approvalStatus: projectApproval,
    submittedBy: req.author.circleId,
    order: maxOrder + 1,
    createdAt: new Date().toISOString()
  };
  projects.push(project);
  await writeJSON('projects.json', projects);

  const circleList = readJSON('circles.json');
  const circle = circleList.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '提交企划', project.title || project.id, approvalStatusLabel(projectApproval));

  res.json(project);
});

// Author: update own project (re-approval required)
app.put('/api/author/my-projects/:id', authorAuthMiddleware, async (req, res) => {
  let projects = readJSON('projects.json');
  const index = projects.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '企划未找到' });
  const circleId = req.author.circleId;
  const isOwner = projects[index].submittedBy === circleId;
  const isEditable = (projects[index].editableBy || []).includes(circleId);
  if (!isOwner && !isEditable) return res.status(403).json({ error: '无权编辑此企划' });
  const beforeEdit = JSON.parse(JSON.stringify(projects[index]));

  const allowed = ['title', 'description', 'status', 'category', 'images', 'tags', 'contactInfo', 'startDate', 'endDate', 'socialLinks', 'coverImage', 'works', 'recruiting', 'recruitNote', 'recruitJobs'];
  const updates = {};
  allowed.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });
  if (req.body.circles !== undefined) {
    const extra = Array.isArray(req.body.circles) ? req.body.circles.filter(Boolean) : [];
    updates.circles = [...new Set([circleId, ...extra])];
  }
  if (Array.isArray(updates.works)) updates.works = updates.works.filter(Boolean);

  projects[index] = {
    ...projects[index],
    ...updates,
    approvalStatus: resolveApprovalStatus('requireProjectApproval')
  };
  await writeJSON('projects.json', projects);
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === circleId);
  await logEdit(circle?.name || '作者', '编辑企划', projects[index].title || req.params.id, '', '', { before: beforeEdit, after: projects[index] });
  res.json(projects[index]);
});

// Author: delete own project (any status)
app.delete('/api/author/my-projects/:id', authorAuthMiddleware, async (req, res) => {
  let projects = readJSON('projects.json');
  const index = projects.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '企划未找到' });
  if (projects[index].submittedBy !== req.author.circleId) return res.status(403).json({ error: '无权删除此企划' });

  const projectTitle = projects[index].title;
  projects.splice(index, 1);
  await writeJSON('projects.json', projects);

  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '删除企划', projectTitle || req.params.id, '');

  res.json({ success: true });
});

// Author: get own updates
app.get('/api/author/my-updates', authorAuthMiddleware, (req, res) => {
  const updates = readJSON('updates.json');
  const circleId = req.author.circleId;
  const myUpdates = updates.filter(u =>
    u.submittedBy === circleId ||
    (u.editableBy || []).includes(circleId)
  );
  res.json(myUpdates);
});

// Author: create update
app.post('/api/author/my-updates', authorAuthMiddleware, async (req, res) => {
  let updates = readJSON('updates.json');
  const update = {
    id: 'upd' + Date.now(),
    title: req.body.title || '',
    content: req.body.content || '',
    publishDate: req.body.publishDate || new Date().toISOString().split('T')[0],
    pinned: false,
    coverImage: req.body.coverImage || '',
    images: req.body.images || [],
    relatedCircles: [req.author.circleId],
    relatedEvents: req.body.relatedEvents || [],
    relatedProjects: req.body.relatedProjects || [],
    category: req.body.category || '',
    status: req.body.status || '',
    approvalStatus: resolveApprovalStatus('requireUpdateApproval'),
    submittedBy: req.author.circleId,
    createdAt: new Date().toISOString()
  };
  updates.push(update);
  await writeJSON('updates.json', updates);

  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '提交动态', update.title || update.id, approvalStatusLabel(update.approvalStatus));

  res.json(update);
});

// Author: update own update (re-approval required)
app.put('/api/author/my-updates/:id', authorAuthMiddleware, async (req, res) => {
  let updates = readJSON('updates.json');
  const index = updates.findIndex(u => u.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '动态未找到' });
  const circleId = req.author.circleId;
  const isOwner = updates[index].submittedBy === circleId;
  const isEditable = (updates[index].editableBy || []).includes(circleId);
  if (!isOwner && !isEditable) return res.status(403).json({ error: '无权编辑此动态' });
  const beforeEdit = JSON.parse(JSON.stringify(updates[index]));

  const allowed = ['title', 'content', 'publishDate', 'coverImage', 'images', 'relatedEvents', 'relatedProjects', 'category', 'status'];
  const updates2 = {};
  allowed.forEach(field => {
    if (req.body[field] !== undefined) updates2[field] = req.body[field];
  });

  updates[index] = {
    ...updates[index],
    ...updates2,
    approvalStatus: resolveApprovalStatus('requireUpdateApproval')
  };
  await writeJSON('updates.json', updates);
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === circleId);
  await logEdit(circle?.name || '作者', '编辑动态', updates[index].title || req.params.id, '', '', { before: beforeEdit, after: updates[index] });
  res.json(updates[index]);
});

// Author: delete own update (any status)
app.delete('/api/author/my-updates/:id', authorAuthMiddleware, async (req, res) => {
  let updates = readJSON('updates.json');
  const index = updates.findIndex(u => u.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '动态未找到' });
  if (updates[index].submittedBy !== req.author.circleId) return res.status(403).json({ error: '无权删除此动态' });

  const updateTitle = updates[index].title;
  updates.splice(index, 1);
  await writeJSON('updates.json', updates);

  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '删除动态', updateTitle || req.params.id, '');

  res.json({ success: true });
});

// Admin: approve author (enable account)
app.post('/api/admin/circles/:id/approve-author', authMiddleware, async (req, res) => {
  let circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });
  if (!circles[index].username) return res.status(400).json({ error: '该作者未注册' });

  circles[index].authorStatus = 'active';
  await writeJSON('circles.json', circles);
  logEdit('管理员', '启用作者账号', circles[index].name, `账号: ${circles[index].username}`);
  res.json({ success: true });
});

// Admin: reject author
app.post('/api/admin/circles/:id/reject-author', authMiddleware, async (req, res) => {
  let circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });

  const authorName = circles[index].username;
  delete circles[index].username;
  delete circles[index].passwordHash;
  delete circles[index].authorStatus;
  await writeJSON('circles.json', circles);

  logEdit('管理员', '拒绝作者账号', circles[index].name, `原账号: ${authorName || '无'}`);
  res.json({ success: true });
});

// Admin: remove author account
app.post('/api/admin/circles/:id/remove-author', authMiddleware, async (req, res) => {
  let circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });

  const authorName = circles[index].username;
  delete circles[index].username;
  delete circles[index].passwordHash;
  delete circles[index].authorStatus;
  await writeJSON('circles.json', circles);

  logEdit('管理员', '删除作者账号', circles[index].name, `原账号: ${authorName || '无'}`);
  res.json({ success: true });
});

// Admin: set editors for author
app.post('/api/admin/circles/:id/set-editors', authMiddleware, async (req, res) => {
  let circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });

  const { editorIds } = req.body;
  circles[index].editableBy = Array.isArray(editorIds) ? editorIds : [];
  await writeJSON('circles.json', circles);

  logEdit('管理员', '修改作者编辑者', circles[index].name, `编辑者数量: ${circles[index].editableBy.length}`);
  res.json({ success: true });
});

// Admin: reset author password
app.post('/api/admin/circles/:id/reset-password', authMiddleware, rateLimitMiddleware, async (req, res) => {
  const { newPassword } = req.body;
  if (!isPasswordAcceptable(newPassword)) return res.status(400).json({ error: '密码至少8位' });

  let circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });

  circles[index].passwordHash = await bcrypt.hash(newPassword, 10);
  await writeJSON('circles.json', circles);
  res.json({ success: true });
});

// Admin: disable author account
app.post('/api/admin/circles/:id/disable-author', authMiddleware, async (req, res) => {
  let circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });
  if (!circles[index].username) return res.status(400).json({ error: '该作者未注册' });

  circles[index].authorStatus = 'disabled';
  await writeJSON('circles.json', circles);
  logEdit('管理员', '禁用作者账号', circles[index].name, `账号: ${circles[index].username}`);
  res.json({ success: true });
});

// Admin: toggle work approval requirement for author
// 语义：requireApproval === false → 免审核；true / 缺省 → 需审核
app.post('/api/admin/circles/:id/toggle-approval', authMiddleware, async (req, res) => {
  let circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });

  const currentlyExempt = circles[index].requireApproval === false;
  // 点击后取反：原来是免审核 → 改为需审核；否则改为免审核
  circles[index].requireApproval = currentlyExempt;
  await writeJSON('circles.json', circles);
  const label = circles[index].requireApproval === false ? '免审核' : '需要审核';
  logEdit('管理员', '切换作品审核', circles[index].name, label);
  res.json({
    success: true,
    requireApproval: circles[index].requireApproval,
    exempt: circles[index].requireApproval === false,
    label
  });
});

// Admin: cycle author visibility — auto → show → hide → auto
// auto (无 visible 字段)：仅当作者名下有已通过审核作品时才出现在作者列表
app.post('/api/admin/circles/:id/toggle-visible', authMiddleware, async (req, res) => {
  let circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });

  let mode;
  if (circles[index].visible === true) {
    circles[index].visible = false;
    mode = 'hide';
  } else if (circles[index].visible === false) {
    delete circles[index].visible;
    mode = 'auto';
  } else {
    circles[index].visible = true;
    mode = 'show';
  }
  await writeJSON('circles.json', circles);
  const modeLabel = mode === 'show' ? '显示' : mode === 'hide' ? '隐藏' : '自动（有作品才显示）';
  logEdit('管理员', '切换作者显示', circles[index].name, modeLabel);
  res.json({
    success: true,
    mode,
    visible: circles[index].visible === true ? true : circles[index].visible === false ? false : null
  });
});

function ensureArray(v, fallback = []) {
  return Array.isArray(v) ? v : fallback;
}

/**
 * 全局审核开关：勾选/缺省 = 需审核(pending)；取消勾选 = 免审核(approved)
 * key: requireWorkApproval | requireEventApproval | requireProjectApproval | requireUpdateApproval
 */
function resolveApprovalStatus(key) {
  try {
    const settings = readJSON('settings.json');
    return (settings.site && settings.site[key] !== false) ? 'pending' : 'approved';
  } catch (e) {
    return 'pending';
  }
}

function approvalStatusLabel(status) {
  return status === 'approved' ? '免审核直接上架' : '待审核';
}

// ===== Work approval snapshot (方案 B) =====
// Public keeps the last approved content while a new revision waits for review.
const WORK_CONTENT_FIELDS = [
  'title', 'titleEn', 'description', 'category', 'status', 'price',
  'releaseDate', 'endDate', 'tags', 'images', 'moreImages', 'socialLinks',
  'isCommissioned', 'commissionedBy'
];

function pickWorkContent(work) {
  const out = {};
  for (const f of WORK_CONTENT_FIELDS) {
    if (work[f] !== undefined) out[f] = work[f];
  }
  // Deep copy arrays/objects so later mutation cannot change the snapshot.
  return JSON.parse(JSON.stringify(out));
}

function isWorkPublic(work) {
  if (!work) return false;
  if (!work.approvalStatus || work.approvalStatus === 'approved') return true;
  // A pending/rejected revision is not public, but the last approved snapshot stays visible.
  return !!(work.published && (work.approvalStatus === 'pending' || work.approvalStatus === 'rejected'));
}

function publicWorkView(work) {
  const view = work.published ? { ...work, ...work.published } : { ...work };
  delete view.pendingRevision;
  delete view.published;
  if (view.approvalStatus && view.approvalStatus !== 'approved') view.approvalStatus = 'approved';
  return view;
}

function authorWorkView(work) {
  if (!work || !work.pendingRevision) return work;
  return {
    ...work,
    ...work.pendingRevision,
    approvalStatus: work.approvalStatus === 'rejected' ? 'rejected' : 'pending',
    _hasPendingRevision: true
  };
}

function workRequireApproval(circle) {
  try {
    const settings = readJSON('settings.json');
    const globalRequire = settings.site?.requireWorkApproval !== false;
    const authorRequire = circle?.requireApproval !== false;
    return globalRequire && authorRequire;
  } catch { return true; }
}

// ===== Admin batch approval =====
const BATCH_APPROVAL_MAX = 200;
const BATCH_APPROVAL_TYPES = {
  works: { file: 'works.json', label: '作品', notifType: 'work' },
  events: { file: 'events.json', label: '活动', notifType: 'event' },
  projects: { file: 'projects.json', label: '企划', notifType: 'project' },
  updates: { file: 'updates.json', label: '动态', notifType: 'update' }
};

async function runBatchApproval(typeKey, action, ids, reason) {
  const conf = BATCH_APPROVAL_TYPES[typeKey];
  if (!conf) throw new Error('未知类型');
  return mutateJSON(conf.file, async (data) => {
  const byId = new Map(data.map(item => [item.id, item]));
  let processed = 0;
  const failed = [];
  const reasonText = typeof reason === 'string' ? reason.trim() : '';

  for (const id of ids) {
    const item = byId.get(id);
    if (!item) {
      failed.push({ id, error: '未找到' });
      continue;
    }
    if (action === 'approve') {
      if (typeKey === 'works') {
        if (item.pendingRevision) {
          for (const f of WORK_CONTENT_FIELDS) {
            if (item.pendingRevision[f] !== undefined) item[f] = item.pendingRevision[f];
          }
          delete item.pendingRevision;
        }
        item.published = pickWorkContent(item);
      }
      item.approvalStatus = 'approved';
      delete item.rejectReason;
      logEdit('管理员', `批准${conf.label}`, item.title || id, '');
      if (item.submittedBy) {
        await addAuthorNotification(item.submittedBy, conf.notifType, item.title, '已通过审核');
      }
    } else {
      item.approvalStatus = 'rejected';
      if (reasonText) item.rejectReason = reasonText;
      logEdit('管理员', `拒绝${conf.label}`, item.title || id, reasonText);
      if (item.submittedBy) {
        await addAuthorNotification(item.submittedBy, conf.notifType, item.title, '未通过审核', reasonText);
      }
    }
    processed += 1;
  }

  return { success: true, processed, failed, total: ids.length };
  });
}

function registerBatchApprovalRoutes(typeKey) {
  const conf = BATCH_APPROVAL_TYPES[typeKey];
  const base = `/api/admin/${typeKey}/batch`;
  ['approve', 'reject'].forEach((action) => {
    app.post(`${base}-${action}`, authMiddleware, async (req, res) => {
      try {
        const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : null;
        if (!rawIds || rawIds.length === 0) {
          return res.status(400).json({ error: `请选择要${action === 'approve' ? '批准' : '拒绝'}的${conf.label}` });
        }
        if (rawIds.length > BATCH_APPROVAL_MAX) {
          return res.status(400).json({ error: `一次最多处理 ${BATCH_APPROVAL_MAX} 条` });
        }
        const ids = [...new Set(rawIds.map((x) => String(x || '').trim()).filter(Boolean))];
        if (!ids.length) return res.status(400).json({ error: '无效的 id 列表' });
        const result = await runBatchApproval(typeKey, action, ids, req.body?.reason);
        res.json(result);
      } catch (e) {
        console.error(`batch ${typeKey} ${action} failed:`, e.message);
        res.status(500).json({ error: '批量操作失败' });
      }
    });
  });
}

['works', 'events', 'projects', 'updates'].forEach(registerBatchApprovalRoutes);

// ===== Public API =====
// Works
app.get('/api/works', cacheMiddleware(60), (req, res) => {
  let works = ensureArray(readJSON('works.json'));
  // Approved content + last-approved snapshot of works with pending/rejected revisions.
  works = works.filter(isWorkPublic).map(publicWorkView);
  // 未上传封面图的周边暂不对外展示
  works = works.filter(w => Array.isArray(w.images) && w.images[0]);
  const { category, search, status, circleId, eventId } = req.query;
  if (category) works = works.filter(w => w.category === category);
  if (status) works = works.filter(w => w.status === status);
  if (circleId) works = works.filter(w => (w.circles || []).includes(circleId));
  if (eventId) {
    const events = readJSON('events.json');
    const event = events.find(e => e.id === eventId);
    if (event && event.relatedWorks) {
      works = works.filter(w => event.relatedWorks.includes(w.id));
    } else {
      works = [];
    }
  }
  if (search) {
    const s = search.toLowerCase();
    works = works.filter(w =>
      (w.title || '').toLowerCase().includes(s) ||
      (w.titleEn && w.titleEn.toLowerCase().includes(s)) ||
      (w.tags || []).some(t => (t || '').toLowerCase().includes(s))
    );
  }
  works.sort((a, b) => a.order - b.order);
  // Optional pagination: ?page=1&limit=20
  const page = parseInt(req.query.page);
  const limit = Math.min(parseInt(req.query.limit) || 0, 100);
  if (page > 0 && limit > 0) {
    const total = works.length;
    const items = works.slice((page - 1) * limit, page * limit);
    return res.json({ items, total, page, limit, totalPages: Math.ceil(total / limit) });
  }
  res.json(works);
});

app.get('/api/works/:id', (req, res) => {
  const works = readJSON('works.json');
  const work = works.find(w => w.id === req.params.id);
  if (!work) return res.status(404).json({ error: '作品未找到' });
  // Only return public content (last approved snapshot while a revision is pending).
  if (!isWorkPublic(work)) {
    return res.status(404).json({ error: '作品未找到' });
  }
  const pub = publicWorkView(work);
  // 未上传封面图的周边暂不对外展示
  if (!Array.isArray(pub.images) || !pub.images[0]) {
    return res.status(404).json({ error: '作品未找到' });
  }
  res.json(pub);
});

// ===== Like System (in-memory + file sync) =====
let likesCache = {};
try { likesCache = readJSON('likes.json'); } catch {}

async function saveLikes() {
  await writeJSON('likes.json', likesCache);
}

// ===== Want System (我想要) =====
let wantsCache = {};
try { wantsCache = readJSON('wants.json'); } catch {}

async function saveWants() {
  await writeJSON('wants.json', wantsCache);
}

// ===== Follow System (关注) =====
let followsCache = {};
try { followsCache = readJSON('follows.json'); } catch {}
if (Array.isArray(followsCache)) followsCache = {};

async function saveFollows() {
  await writeJSON('follows.json', followsCache);
}

// Rate limiting for like/want endpoints
const likeWantAttempts = new Map();
const LIKE_WANT_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const LIKE_WANT_RATE_LIMIT_MAX = 30; // max 30 operations per minute per IP

function likeWantRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const attempts = likeWantAttempts.get(ip) || [];
  const recentAttempts = attempts.filter(t => now - t < LIKE_WANT_RATE_LIMIT_WINDOW);

  if (recentAttempts.length >= LIKE_WANT_RATE_LIMIT_MAX) {
    return res.status(429).json({ error: '操作过于频繁，请稍后再试' });
  }

  recentAttempts.push(now);
  likeWantAttempts.set(ip, recentAttempts);
  next();
}

app.post('/api/works/:id/like', likeWantRateLimit, async (req, res) => {
  const workId = req.params.id;
  const ip = req.ip;

  if (!likesCache[workId]) likesCache[workId] = [];
  if (likesCache[workId].includes(ip)) {
    const works = readJSON('works.json');
    const work = works.find(w => w.id === workId);
    return res.json({ likes: work?.likes || 0, alreadyLiked: true });
  }

  try {
    const result = await mutateJSON('works.json', (works) => {
      const index = works.findIndex(w => w.id === workId);
      if (index === -1) return null;
      if (!likesCache[workId].includes(ip)) {
        likesCache[workId].push(ip);
        saveLikes();
      }
      works[index].likes = (works[index].likes || 0) + 1;
      return { likes: works[index].likes };
    });
    if (!result) return res.status(404).json({ error: '作品未找到' });
    res.json(result);
  } catch (e) {
    console.error('like failed:', e.message);
    res.status(500).json({ error: '操作失败' });
  }
});

app.post('/api/works/:id/unlike', likeWantRateLimit, async (req, res) => {
  const workId = req.params.id;
  const ip = req.ip;

  if (!likesCache[workId]) likesCache[workId] = [];
  if (!likesCache[workId].includes(ip)) {
    const works = readJSON('works.json');
    const work = works.find(w => w.id === workId);
    return res.json({ likes: work?.likes || 0 });
  }

  try {
    const result = await mutateJSON('works.json', (works) => {
      const index = works.findIndex(w => w.id === workId);
      if (index === -1) return null;
      const idx = likesCache[workId].indexOf(ip);
      if (idx !== -1) likesCache[workId].splice(idx, 1);
      saveLikes();
      works[index].likes = Math.max(0, (works[index].likes || 0) - 1);
      return { likes: works[index].likes };
    });
    if (!result) return res.status(404).json({ error: '作品未找到' });
    res.json(result);
  } catch (e) {
    console.error('unlike failed:', e.message);
    res.status(500).json({ error: '操作失败' });
  }
});

app.post('/api/works/:id/want', likeWantRateLimit, async (req, res) => {
  const workId = req.params.id;
  const ip = req.ip;

  if (!wantsCache[workId]) wantsCache[workId] = [];
  if (wantsCache[workId].includes(ip)) {
    const works = readJSON('works.json');
    const work = works.find(w => w.id === workId);
    return res.json({ wants: work?.wants || 0, alreadyWanted: true });
  }

  try {
    const result = await mutateJSON('works.json', (works) => {
      const index = works.findIndex(w => w.id === workId);
      if (index === -1) return null;
      if (!wantsCache[workId].includes(ip)) {
        wantsCache[workId].push(ip);
        saveWants();
      }
      works[index].wants = (works[index].wants || 0) + 1;
      return { wants: works[index].wants };
    });
    if (!result) return res.status(404).json({ error: '作品未找到' });
    res.json(result);
  } catch (e) {
    console.error('want failed:', e.message);
    res.status(500).json({ error: '操作失败' });
  }
});

app.get('/api/works/:id/want-status', (req, res) => {
  const workId = req.params.id;
  const ip = req.ip;
  const wanted = wantsCache[workId] ? wantsCache[workId].includes(ip) : false;
  res.json({ wanted });
});

app.post('/api/works/:id/unwant', likeWantRateLimit, async (req, res) => {
  const workId = req.params.id;
  const ip = req.ip;

  if (!wantsCache[workId]) wantsCache[workId] = [];
  if (!wantsCache[workId].includes(ip)) {
    const works = readJSON('works.json');
    const work = works.find(w => w.id === workId);
    return res.json({ wants: work?.wants || 0 });
  }

  try {
    const result = await mutateJSON('works.json', (works) => {
      const index = works.findIndex(w => w.id === workId);
      if (index === -1) return null;
      const idx = wantsCache[workId].indexOf(ip);
      if (idx !== -1) wantsCache[workId].splice(idx, 1);
      saveWants();
      works[index].wants = Math.max(0, (works[index].wants || 0) - 1);
      return { wants: works[index].wants };
    });
    if (!result) return res.status(404).json({ error: '作品未找到' });
    res.json(result);
  } catch (e) {
    console.error('unwant failed:', e.message);
    res.status(500).json({ error: '操作失败' });
  }
});

// ===== Follow/Unfollow Circle =====
const UID_RE = /^[a-zA-Z0-9_\-]{8,64}$/;
app.post('/api/circles/:id/follow', likeWantRateLimit, async (req, res) => {
  const circleId = req.params.id;
  const uid = req.body.uid;
  if (!uid || !UID_RE.test(String(uid))) {
    return res.status(400).json({ error: 'missing uid' });
  }

  if (!followsCache[circleId]) followsCache[circleId] = [];

  const circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === circleId);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });

  if (followsCache[circleId].includes(uid)) {
    return res.json({ follows: circles[index].follows || 0, alreadyFollowing: true });
  }

  followsCache[circleId].push(uid);
  saveFollows();

  circles[index].follows = (circles[index].follows || 0) + 1;
  await writeJSON('circles.json', circles);
  res.json({ follows: circles[index].follows });
});

app.post('/api/circles/:id/unfollow', likeWantRateLimit, async (req, res) => {
  const circleId = req.params.id;
  const uid = req.body.uid;
  if (!uid) return res.status(400).json({ error: 'missing uid' });

  if (!followsCache[circleId]) followsCache[circleId] = [];

  const circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === circleId);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });

  const idx = followsCache[circleId].indexOf(uid);
  if (idx === -1) {
    // Not in cache — this uid never followed, ignore the request
    return res.json({ follows: circles[index].follows || 0 });
  }

  followsCache[circleId].splice(idx, 1);
  saveFollows();

  circles[index].follows = Math.max(0, (circles[index].follows || 0) - 1);
  await writeJSON('circles.json', circles);
  res.json({ follows: circles[index].follows });
});

app.get('/api/circles/:id/follow-status', (req, res) => {
  const circleId = req.params.id;
  const uid = req.query.uid;
  if (!uid) return res.json({ following: false });
  const following = followsCache[circleId] ? followsCache[circleId].includes(uid) : false;
  res.json({ following });
});

// Events
app.get('/api/events', cacheMiddleware(60), (req, res) => {
  let events = readJSON('events.json');
  // Only return approved events (or legacy events without approvalStatus)
  events = events.filter(e => !e.approvalStatus || e.approvalStatus === 'approved');
  const { circleId } = req.query;
  if (circleId) events = events.filter(e => (e.relatedCircles || []).includes(circleId));
  events.sort((a, b) => a.order - b.order);
  // Optional pagination: ?page=1&limit=20
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);
  if (page > 0 && limit > 0) {
    const total = events.length;
    const items = events.slice((page - 1) * limit, page * limit);
    return res.json({ items, total, page, limit, totalPages: Math.ceil(total / limit) });
  }
  res.json(events);
});

app.get('/api/events/:id', (req, res) => {
  const events = readJSON('events.json');
  const event = events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: '活动未找到' });
  // Only return approved events (or legacy events without approvalStatus)
  if (event.approvalStatus && event.approvalStatus !== 'approved') {
    return res.status(404).json({ error: '活动未找到' });
  }
  res.json(event);
});

// Circles
// Ensure all items have order values
function ensureOrder(items) {
  let changed = false;
  items.forEach((item, i) => {
    if (item.order === undefined || item.order === null) {
      item.order = i;
      changed = true;
    }
  });
  return changed;
}

// Reindex order values to be sequential 0, 1, 2...
function reindexOrder(items) {
  items.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  items.forEach((item, i) => item.order = i);
}

// Ensure order on startup (not during public GET requests)
async function ensureAllOrders() {
  for (const file of ['works.json', 'events.json', 'circles.json', 'projects.json']) {
    try {
      const items = readJSON(file);
      if (ensureOrder(items)) await writeJSON(file, items);
    } catch {}
  }
}
ensureAllOrders();

app.get('/api/circles', cacheMiddleware(60), (req, res) => {
  let circles = readJSON('circles.json');
  let works = readJSON('works.json');
  // 与公开作品列表一致：已过审且有封面才算「有作品」
  const approvedWorks = works.filter(w =>
    (!w.approvalStatus || w.approvalStatus === 'approved') &&
    Array.isArray(w.images) && w.images[0]
  );
  const circlesWithApprovedWorks = new Set();
  approvedWorks.forEach(w => {
    (w.circles || []).forEach(cid => circlesWithApprovedWorks.add(cid));
  });
  circles = circles.filter(c => {
    if (c.visible === true) return true;
    if (c.visible === false) return false;
    if (!c.username) return true;
    return circlesWithApprovedWorks.has(c.id);
  });
  const { search } = req.query;
  if (search) {
    const s = search.toLowerCase();
    circles = circles.filter(c =>
      (c.name || '').toLowerCase().includes(s)
    );
  }
  circles.sort((a, b) => a.order - b.order);
  // Remove sensitive fields
  const safeCircles = circles.map(c => {
    const { passwordHash, username, authorStatus, editableBy, visible, requireApproval, ...safe } = c;
    return safe;
  });
  // Optional pagination: ?page=1&limit=20
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);
  if (page > 0 && limit > 0) {
    const total = safeCircles.length;
    const items = safeCircles.slice((page - 1) * limit, page * limit);
    return res.json({ items, total, page, limit, totalPages: Math.ceil(total / limit) });
  }
  res.json(safeCircles);
});

// Circles available for registration (no username or disabled) - must be before :id route
app.get('/api/circles/registrable', (req, res) => {
  const circles = readJSON('circles.json');
  const registrable = circles
    .filter(c => !c.username || c.authorStatus === 'disabled')
    .sort((a, b) => a.order - b.order)
    .map(c => ({ id: c.id, name: c.name, logo: c.logo }));
  res.json(registrable);
});

app.get('/api/circles/:id', (req, res) => {
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.params.id);
  if (!circle) return res.status(404).json({ error: '作者未找到' });
  // Remove sensitive fields
  const { passwordHash, username, authorStatus, editableBy, visible, requireApproval, ...safe } = circle;
  res.json(safe);
});

// Projects
app.get('/api/projects', cacheMiddleware(60), (req, res) => {
  let projects = readJSON('projects.json');
  // Only return approved projects (or legacy projects without approvalStatus)
  projects = projects.filter(p => !p.approvalStatus || p.approvalStatus === 'approved');
  const { category, status, search } = req.query;
  if (category) projects = projects.filter(p => p.category === category);
  if (status) projects = projects.filter(p => p.status === status);
  if (search) {
    const s = search.toLowerCase();
    projects = projects.filter(p =>
      (p.title || '').toLowerCase().includes(s) ||
      (p.description || '').toLowerCase().includes(s) ||
      (p.tags || []).some(t => (t || '').toLowerCase().includes(s))
    );
  }
  projects.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (a.order ?? 0) - (b.order ?? 0);
  });
  // Optional pagination: ?page=1&limit=20
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);
  if (page > 0 && limit > 0) {
    const total = projects.length;
    const items = projects.slice((page - 1) * limit, page * limit);
    return res.json({ items, total, page, limit, totalPages: Math.ceil(total / limit) });
  }
  res.json(projects);
});

app.get('/api/projects/:id', (req, res) => {
  const projects = readJSON('projects.json');
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: '企划未找到' });
  // Only return approved projects (or legacy projects without approvalStatus)
  if (project.approvalStatus && project.approvalStatus !== 'approved') {
    return res.status(404).json({ error: '企划未找到' });
  }
  res.json(project);
});

// Categories
app.get('/api/categories', (req, res) => {
  res.json(readJSON('categories.json'));
});

// Contact form with rate limiting
const contactAttempts = new Map();
const CONTACT_RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const CONTACT_RATE_LIMIT_MAX = 5; // max 5 submissions per hour

function contactRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const attempts = contactAttempts.get(ip) || [];
  const recentAttempts = attempts.filter(t => now - t < CONTACT_RATE_LIMIT_WINDOW);

  if (recentAttempts.length >= CONTACT_RATE_LIMIT_MAX) {
    return res.status(429).json({ error: '提交过于频繁，请1小时后再试' });
  }

  recentAttempts.push(now);
  contactAttempts.set(ip, recentAttempts);
  next();
}

app.post('/api/contact', contactRateLimit, async (req, res) => {
  const siteSettings = readJSON('settings.json');
  if (siteSettings.features?.contactForm === false) {
    return res.status(403).json({ error: '联系表单暂时关闭' });
  }
  const { name, email, subject, message } = req.body;
  if (!message || String(message).trim().length < 2 || String(message).length > 5000) {
    return res.status(400).json({ error: '请填写消息内容（2-5000 字）' });
  }
  if (name && String(name).length > 100) return res.status(400).json({ error: '名称过长' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: '邮箱格式不正确' });
  if (subject && String(subject).length > 200) return res.status(400).json({ error: '主题过长' });
  // Save to contact.json
  let contacts = [];
  try { contacts = readJSON('contact.json'); } catch {}
  if (!Array.isArray(contacts)) contacts = [];
  contacts.push({
    id: 'ct' + Date.now(),
    name: name ? String(name).slice(0, 100) : '',
    email: email ? String(email).slice(0, 200) : '',
    subject: subject ? String(subject).slice(0, 200) : '',
    message: String(message).slice(0, 5000),
    read: false,
    status: 'new',
    createdAt: new Date().toISOString()
  });
  await writeJSON('contact.json', contacts);
  res.json({ success: true, message: '消息已发送，我们会尽快回复！' });
});

// ===== Page View Tracking =====
let pageviews = {};
try { pageviews = readJSON('pageviews.json'); } catch {}
if (!pageviews.daily) pageviews = { daily: {} };
if (!pageviews.visitors) pageviews.visitors = {};
if (!pageviews.pages) pageviews.pages = {};
if (!pageviews.items) pageviews.items = {};

async function savePageviews() {
  await writeJSON('pageviews.json', pageviews);
}

// Helper: get current date in China time (Asia/Shanghai)
function getChinaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

// Helper: get date string N days ago in China time
function getChinaDateDaysAgo(days) {
  const target = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(target);
}

// Auto-cleanup: remove data older than 365 days (Chinese time)
function cleanupOldPageviews() {
  const cutoffStr = getChinaDateDaysAgo(365);
  let cleaned = false;

  // Clean daily views
  for (const date of Object.keys(pageviews.daily)) {
    if (date < cutoffStr) {
      delete pageviews.daily[date];
      cleaned = true;
    }
  }

  // Clean visitor data
  for (const date of Object.keys(pageviews.visitors)) {
    if (date < cutoffStr) {
      delete pageviews.visitors[date];
      cleaned = true;
    }
  }

  // Clean per-page data
  for (const date of Object.keys(pageviews.pages || {})) {
    if (date < cutoffStr) {
      delete pageviews.pages[date];
      cleaned = true;
    }
  }

  // Clean per-item data
  for (const page of Object.keys(pageviews.items || {})) {
    for (const itemId of Object.keys(pageviews.items[page] || {})) {
      for (const date of Object.keys(pageviews.items[page][itemId] || {})) {
        if (date < cutoffStr) {
          delete pageviews.items[page][itemId][date];
          cleaned = true;
        }
      }
      if (Object.keys(pageviews.items[page][itemId]).length === 0) {
        delete pageviews.items[page][itemId];
      }
    }
  }

  if (cleaned) {
    savePageviews();
    console.log('[Pageviews] Cleaned up data older than', cutoffStr);
  }
}

// Run cleanup on server start
cleanupOldPageviews();

// Auto-change work status to 'yishoukong' when endDate passes
async function checkExpiredWorks() {
  try {
    const works = readJSON('works.json');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let modified = false;

    for (const work of works) {
      if (work.endDate && work.status !== 'yishoukong') {
        const endDate = new Date(work.endDate + 'T23:59:59');
        if (today > endDate) {
          work.status = 'yishoukong';
          modified = true;
          console.log(`[Expiry] Work "${work.title}" (${work.id}) status changed to yishoukong (endDate: ${work.endDate})`);
        }
      }
    }

    if (modified) {
      await writeJSON('works.json', works);
      console.log('[Expiry] Expired works updated');
    }
  } catch (e) {
    console.error('[Expiry] Error checking expired works:', e.message);
  }
}

// Run expiry check on server start
checkExpiredWorks();

// Schedule cleanup to run daily at Chinese midnight (00:05 AM UTC+8)
function scheduleDailyCleanup() {
  const now = new Date();
  // Calculate next Chinese midnight (00:05 AM UTC+8 = 16:05 UTC previous day)
  const utcNow = now.getTime();
  // Current UTC hour
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();

  // Chinese midnight is 16:00 UTC
  let msUntilChineseMidnight;
  if (utcHour < 16 || (utcHour === 16 && utcMinute < 5)) {
    // Before 16:05 UTC today, schedule for today 16:05 UTC
    const target = new Date(now);
    target.setUTCHours(16, 5, 0, 0);
    msUntilChineseMidnight = target - now;
  } else {
    // After 16:05 UTC, schedule for tomorrow 16:05 UTC
    const target = new Date(now);
    target.setUTCDate(target.getUTCDate() + 1);
    target.setUTCHours(16, 5, 0, 0);
    msUntilChineseMidnight = target - now;
  }

  setTimeout(() => {
    cleanupOldPageviews();
    checkExpiredWorks();
    // Then run every 24 hours
    setInterval(() => {
      cleanupOldPageviews();
      checkExpiredWorks();
    }, 24 * 60 * 60 * 1000);
  }, msUntilChineseMidnight);
}
scheduleDailyCleanup();

// Rate limiting for pageview tracking
const pageviewAttempts = new Map();
const PAGEVIEW_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const PAGEVIEW_RATE_LIMIT_MAX = 30; // max 30 pageviews per minute per IP

function pageviewRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const attempts = pageviewAttempts.get(ip) || [];
  const recentAttempts = attempts.filter(t => now - t < PAGEVIEW_RATE_LIMIT_WINDOW);

  if (recentAttempts.length >= PAGEVIEW_RATE_LIMIT_MAX) {
    return res.status(429).json({ error: '请求过于频繁' });
  }

  recentAttempts.push(now);
  pageviewAttempts.set(ip, recentAttempts);
  next();
}

app.post('/api/pageview', pageviewRateLimit, (req, res) => {
  const today = getChinaDate(); // Use Chinese time
  pageviews.daily[today] = (pageviews.daily[today] || 0) + 1;

  // Per-page category tracking
  const page = req.body && req.body.page;
  if (page && typeof page === 'string') {
    if (!pageviews.pages[today]) pageviews.pages[today] = {};
    pageviews.pages[today][page] = (pageviews.pages[today][page] || 0) + 1;
  }

  // Per-item tracking
  const itemId = req.body && req.body.itemId;
  if (page && itemId && typeof page === 'string' && typeof itemId === 'string') {
    if (!pageviews.items[page]) pageviews.items[page] = {};
    if (!pageviews.items[page][itemId]) pageviews.items[page][itemId] = {};
    pageviews.items[page][itemId][today] = (pageviews.items[page][itemId][today] || 0) + 1;
  }

  // Track unique visitors by hashed IP (privacy-safe, not reversible)
  const rawIp = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
  const ip = crypto.createHash('sha256').update(String(rawIp) + today).digest('hex').slice(0, 16);
  if (!pageviews.visitors[today]) pageviews.visitors[today] = [];
  if (!pageviews.visitors[today].includes(ip)) {
    pageviews.visitors[today].push(ip);
  }
  savePageviews();
  res.json({ ok: true });
});

app.get('/api/admin/pageviews', authMiddleware, (req, res) => {
  // 返回精简摘要数据（默认），减少传输量
  if (req.query.summary === 'true') {
    const today = getChinaDate();
    const summary = { daily: {}, visitors: {}, pages: {}, items: {} };

    // 只返回最近30天的daily、visitors、pages
    for (let i = 0; i < 30; i++) {
      const date = getChinaDateDaysAgo(i);
      if (pageviews.daily[date] !== undefined) summary.daily[date] = pageviews.daily[date];
      if (pageviews.visitors[date]) summary.visitors[date] = pageviews.visitors[date];
      if (pageviews.pages[date]) summary.pages[date] = pageviews.pages[date];
    }

    // items只返回每个项目的汇总+最近30天明细
    for (const [page, items] of Object.entries(pageviews.items || {})) {
      summary.items[page] = {};
      for (const [itemId, dates] of Object.entries(items)) {
        let total = 0;
        const recentDates = {};
        for (const [date, count] of Object.entries(dates)) {
          total += count;
          // 只保留最近30天
          for (let i = 0; i < 30; i++) {
            if (date === getChinaDateDaysAgo(i)) {
              recentDates[date] = count;
              break;
            }
          }
        }
        if (total > 0) summary.items[page][itemId] = { total, dates: recentDates };
      }
    }

    return res.json(summary);
  }

  // 完整数据（导出用）
  res.json(pageviews);
});

// Manual trigger cleanup for admin
app.post('/api/admin/pageviews/cleanup', authMiddleware, (req, res) => {
  const before = {
    dailyCount: Object.keys(pageviews.daily).length,
    visitorCount: Object.keys(pageviews.visitors).length
  };
  cleanupOldPageviews();
  const after = {
    dailyCount: Object.keys(pageviews.daily).length,
    visitorCount: Object.keys(pageviews.visitors).length
  };
  res.json({
    success: true,
    message: '清理完成',
    before,
    after
  });
});

// Admin: dashboard stats (lightweight)
app.get('/api/admin/stats', authMiddleware, (req, res) => {
  try {
    const works = readJSON('works.json');
    const events = readJSON('events.json');
    const circles = readJSON('circles.json');
    const projects = readJSON('projects.json');
    const updates = readJSON('updates.json');
    const contacts = readJSON('contact.json');
    const pendingWorks = works.filter(w => w.approvalStatus === 'pending').length;
    const activeCircles = circles.filter(c => c.authorStatus === 'active' || c.authorStatus === 'approved').length;
    const pendingEvents = events.filter(e => e.approvalStatus === 'pending').length;
    const pendingProjects = projects.filter(p => p.approvalStatus === 'pending').length;
    const pendingUpdates = updates.filter(u => u.approvalStatus === 'pending').length;
    res.json({
      works: works.length,
      events: events.length,
      circles: circles.length,
      projects: projects.length,
      updates: updates.length,
      contacts: contacts.length,
      pendingWorks,
      pendingCircles: 0,
      activeCircles,
      pendingEvents,
      pendingProjects,
      pendingUpdates,
      totalPending: pendingWorks + pendingEvents + pendingProjects + pendingUpdates
    });
  } catch (e) {
    res.json({ works: 0, events: 0, circles: 0, projects: 0, updates: 0, contacts: 0, pendingWorks: 0, pendingCircles: 0, pendingUpdates: 0, totalPending: 0 });
  }
});

// ===== Recycle bin =====
app.get('/api/admin/trash', authMiddleware, (req, res) => {
  const trash = readTrash()
    .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)))
    .map(entry => ({
      id: entry.id,
      type: entry.type,
      typeLabel: entry.typeLabel,
      title: entry.title,
      deletedAt: entry.deletedAt,
      deletedBy: entry.deletedBy || '管理员',
      idValue: entry.item?.id || ''
    }));
  res.json(trash);
});

app.post('/api/admin/trash/:id/restore', authMiddleware, async (req, res) => {
  const trash = readTrash();
  const index = trash.findIndex(entry => entry.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '回收站记录未找到' });
  const entry = trash[index];
  const meta = TRASH_TYPES[entry.type];
  if (!meta) return res.status(400).json({ error: '不支持的回收站类型' });
  const items = readJSON(meta.file);
  if (!Array.isArray(items)) return res.status(500).json({ error: '数据文件异常' });
  if (entry.item?.id && items.some(item => item.id === entry.item.id)) {
    return res.status(409).json({ error: '同 ID 的内容已存在，无法恢复' });
  }
  items.push(entry.item);
  await writeJSON(meta.file, items);
  trash.splice(index, 1);
  await writeJSON('trash.json', trash);
  await logEdit('管理员', '恢复回收站内容', entry.title || entry.id, meta.label);
  res.json({ success: true, restored: entry.item });
});

app.delete('/api/admin/trash/:id', authMiddleware, async (req, res) => {
  const trash = readTrash();
  const index = trash.findIndex(entry => entry.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '回收站记录未找到' });
  const [entry] = trash.splice(index, 1);
  await writeJSON('trash.json', trash);
  await logEdit('管理员', '彻底删除', entry.title || entry.id, entry.typeLabel || '');
  res.json({ success: true });
});

// ===== Edit history rollback =====
app.post('/api/admin/edit-log/:id/restore', authMiddleware, async (req, res) => {
  let log = [];
  try { log = readJSON('edit-log.json'); } catch {}
  const entry = (Array.isArray(log) ? log : []).find(item => item.id === req.params.id);
  if (!entry || !entry.changes?.before) return res.status(400).json({ error: '该记录没有可恢复的版本' });
  const action = String(entry.action || '');
  const map = [
    { key: '作品', file: 'works.json', label: '作品' },
    { key: '活动', file: 'events.json', label: '活动' },
    { key: '企划', file: 'projects.json', label: '企划' },
    { key: '动态', file: 'updates.json', label: '动态' },
    { key: '作者', file: 'circles.json', label: '作者' },
    { key: '公告', file: 'announcements.json', label: '公告' }
  ];
  const type = map.find(item => action.includes(item.key));
  if (!type) return res.status(400).json({ error: '该记录暂不支持回滚' });
  const before = entry.changes.before;
  if (!before || !before.id) return res.status(400).json({ error: '旧版本缺少 ID，无法回滚' });
  const items = readJSON(type.file);
  if (!Array.isArray(items)) return res.status(500).json({ error: '数据文件异常' });
  const index = items.findIndex(item => item.id === before.id);
  if (index === -1) return res.status(404).json({ error: '当前内容已不存在，无法回滚' });
  const current = items[index];
  items[index] = { ...before };
  await writeJSON(type.file, items);
  await logEdit('管理员', '回滚' + type.label, before.title || before.name || before.id, '来自编辑历史 ' + entry.id, '', { before: current, after: before });
  res.json({ success: true, item: before, type: type.label });
});

// ===== Admin health / todo center =====
app.get('/api/admin/health', authMiddleware, (req, res) => {
  try {
    const works = readJSON('works.json');
    const events = readJSON('events.json');
    const projects = readJSON('projects.json');
    const updates = readJSON('updates.json');
    const circles = readJSON('circles.json');
    const contacts = readJSON('contact.json');
    const today = getChinaDate();
    const pending = [
      ['作品', works.filter(w => w.approvalStatus === 'pending').length],
      ['活动', events.filter(e => e.approvalStatus === 'pending').length],
      ['企划', projects.filter(p => p.approvalStatus === 'pending').length],
      ['动态', updates.filter(u => u.approvalStatus === 'pending').length]
    ].reduce((sum, [, n]) => sum + n, 0);
    const unreadContacts = contacts.filter(c => !c.read).length;
    const soonEvents = events.filter(e => {
      const date = e.date || e.startDate;
      if (!date || String(e.status) === 'yijiesu') return false;
      const days = Math.ceil((new Date(date + 'T00:00:00+08:00') - new Date(today + 'T00:00:00+08:00')) / 86400000);
      return days >= 0 && days <= 14;
    });
    const onlyMissingBooths = events.filter(e => e.type === 'only' && !(Array.isArray(e.booths) && e.booths.length));
    const missingCovers = works.filter(w => !(Array.isArray(w.images) && w.images.length)).length;

    let imageHealth = { total: 0, unused: 0, unusedBytes: 0, missing: [] };
    try {
      const refs = collectAllUploadRefs();
      const files = listUploadFiles();
      const fileSet = new Set(files);
      const unusedFiles = files.filter(f => !refs.has(f) && !isUploadVariantUsed(f, refs));
      const uploadsMeta = readJSON('uploads-meta.json');
      imageHealth = {
        total: files.length,
        unused: unusedFiles.length,
        unusedBytes: unusedFiles.reduce((sum, f) => {
          try { return sum + fs.statSync(path.join(UPLOADS_DIR, f)).size; } catch { return sum; }
        }, 0),
        missing: [...refs].filter(f => f && !fileSet.has(f)).slice(0, 50)
      };
    } catch (e) {
      console.error('[health] image scan failed:', e.message);
    }

    const relationIssues = [];
    const workIds = new Set(works.map(w => w.id));
    const eventIds = new Set(events.map(e => e.id));
    const projectIds = new Set(projects.map(p => p.id));
    const circleIds = new Set(circles.map(c => c.id));
    const pushIssue = (type, title, detail) => {
      if (relationIssues.length < 100) relationIssues.push({ type, title, detail });
    };
    works.forEach(w => (w.circles || []).forEach(id => {
      if (!circleIds.has(id)) pushIssue('作品', w.title, '关联作者不存在: ' + id);
    }));
    events.forEach(e => {
      (e.relatedWorks || []).forEach(id => { if (!workIds.has(id)) pushIssue('活动', e.title, '关联作品不存在: ' + id); });
      (e.relatedCircles || []).forEach(id => { if (!circleIds.has(id)) pushIssue('活动', e.title, '关联作者不存在: ' + id); });
      (e.relatedProjects || []).forEach(id => { if (!projectIds.has(id)) pushIssue('活动', e.title, '关联企划不存在: ' + id); });
      (e.booths || []).forEach(b => {
        (b.circleIds || []).forEach(id => { if (!circleIds.has(id)) pushIssue('摊位', (b.code || '') + ' ' + (b.title || ''), '摊主不存在: ' + id); });
        (b.workIds || []).forEach(id => { if (!workIds.has(id)) pushIssue('摊位', (b.code || '') + ' ' + (b.title || ''), '作品不存在: ' + id); });
      });
    });
    projects.forEach(p => {
      (p.circles || []).forEach(id => { if (!circleIds.has(id)) pushIssue('企划', p.title, '关联作者不存在: ' + id); });
      (p.events || []).forEach(id => { if (!eventIds.has(id)) pushIssue('企划', p.title, '关联活动不存在: ' + id); });
      (p.works || []).forEach(id => { if (!workIds.has(id)) pushIssue('企划', p.title, '关联作品不存在: ' + id); });
    });
    updates.forEach(u => {
      (u.relatedCircles || []).forEach(id => { if (!circleIds.has(id)) pushIssue('动态', u.title, '关联作者不存在: ' + id); });
      (u.relatedEvents || []).forEach(id => { if (!eventIds.has(id)) pushIssue('动态', u.title, '关联活动不存在: ' + id); });
      (u.relatedProjects || []).forEach(id => { if (!projectIds.has(id)) pushIssue('动态', u.title, '关联企划不存在: ' + id); });
    });

    let lastBackup = null;
    try {
      const backups = listBackupDirs();
      lastBackup = backups[0] || null;
    } catch {}

    const todo = [
      pending ? { key: 'approval', label: '待审核内容', count: pending, page: 'approval', hint: '作品 / 活动 / 企划 / 动态' } : null,
      unreadContacts ? { key: 'contacts', label: '未读联系消息', count: unreadContacts, page: 'contacts', hint: '需要回复或归档' } : null,
      soonEvents.length ? { key: 'events', label: '14 天内活动', count: soonEvents.length, page: 'events', hint: '检查活动与摊位信息' } : null,
      onlyMissingBooths.length ? { key: 'booths', label: 'ONLY 未配置摊位', count: onlyMissingBooths.length, page: 'booths', hint: '活动尚未挂接摊位' } : null,
      missingCovers ? { key: 'works', label: '缺少封面的作品', count: missingCovers, page: 'works', hint: '补图后展示更完整' } : null,
      relationIssues.length ? { key: 'health', label: '关联数据异常', count: relationIssues.length, page: 'health', hint: '存在失效的活动/企划/作者关联' } : null,
      imageHealth.missing.length ? { key: 'health', label: '缺失图片引用', count: imageHealth.missing.length, page: 'health', hint: '数据引用了不存在的上传文件' } : null
    ].filter(Boolean);

    res.json({
      generatedAt: new Date().toISOString(),
      counts: { works: works.length, events: events.length, projects: projects.length, updates: updates.length, circles: circles.length },
      todo,
      pending,
      unreadContacts,
      soonEvents: soonEvents.map(e => ({ id: e.id, title: e.title, date: e.date || e.startDate })),
      onlyMissingBooths: onlyMissingBooths.map(e => ({ id: e.id, title: e.title })),
      missingCovers,
      images: imageHealth,
      relations: relationIssues,
      backup: lastBackup,
      trashCount: readTrash().length
    });
  } catch (e) {
    console.error('[health]', e.message);
    res.status(500).json({ error: '健康检查失败' });
  }
});

// Edit log
app.get('/api/admin/edit-log', authMiddleware, (req, res) => {
  let log = [];
  try { log = readJSON('edit-log.json'); } catch {}
  if (!Array.isArray(log)) log = [];

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const { dateFrom, dateTo } = req.query;

  let filtered = log;
  if (dateFrom || dateTo) {
    filtered = log.filter(entry => {
      if (!entry.time) return false;
      const d = entry.time.slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }

  const total = filtered.length;
  const reversed = filtered.reverse();
  const items = reversed.slice((page - 1) * limit, page * limit);

  res.json({ items, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// Settings
app.get('/api/settings', (req, res) => {
  try {
    const settings = readJSON('settings.json');
    res.json(settings);
  } catch (e) {
    res.json({ pages: {} });
  }
});

// Dynamic sitemap
app.get('/sitemap.xml', cacheMiddleware(3600), (req, res) => {
  try {
    const baseUrl = SITE_ORIGIN;
    const works = readJSON('works.json').filter(isWorkPublic).map(publicWorkView);
    const circles = readJSON('circles.json').filter(c => c.visible !== false);
    const events = readJSON('events.json').filter(e => !e.approvalStatus || e.approvalStatus === 'approved');
    const projects = readJSON('projects.json').filter(p => !p.approvalStatus || p.approvalStatus === 'approved');
    const updates = readJSON('updates.json').filter(u => (!u.approvalStatus || u.approvalStatus === 'approved') && u.publishDate <= getChinaDate());
    const lastmod = (value) => {
      const d = value ? new Date(value) : null;
      return d && !Number.isNaN(d.getTime()) ? `\n    <lastmod>${d.toISOString().slice(0, 10)}</lastmod>` : '';
    };
    const url = (path, value) => `  <url><loc>${baseUrl}${path}</loc>${lastmod(value)}<changefreq>weekly</changefreq></url>\n`;

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    ['/', '/events.html', '/projects.html', '/updates.html', '/circles.html', '/announcements.html', '/contact.html', '/photowall.html'].forEach(p => {
      xml += `  <url><loc>${baseUrl}${p}</loc><changefreq>daily</changefreq></url>\n`;
    });
    works.forEach(w => { xml += url(`/work-detail.html?id=${encodeURIComponent(w.id)}`, w.updatedAt || w.createdAt); });
    circles.forEach(c => { xml += url(`/circle-detail.html?id=${encodeURIComponent(c.id)}`, c.updatedAt || c.createdAt); });
    events.forEach(e => {
      xml += url(`/event-detail.html?id=${encodeURIComponent(e.id)}`, e.updatedAt || e.date);
      if (e.type === 'only') xml += url(`/only.html?id=${encodeURIComponent(e.id)}`, e.updatedAt || e.date);
    });
    projects.forEach(p => { xml += url(`/project-detail.html?id=${encodeURIComponent(p.id)}`, p.updatedAt || p.createdAt); });
    updates.forEach(u => { xml += url(`/update-detail.html?id=${encodeURIComponent(u.id)}`, u.updatedAt || u.publishDate); });
    xml += '</urlset>';
    res.type('application/xml').send(xml);
  } catch (e) {
    console.error('[sitemap]', e.message);
    res.status(500).send('Error generating sitemap');
  }
});

// RSS feed
app.get('/rss.xml', cacheMiddleware(3600), (req, res) => {
  try {
    const baseUrl = req.protocol + '://' + req.get('host');
    const siteName = 'f7goods';
    const updates = readJSON('updates.json')
      .filter(u => (!u.approvalStatus || u.approvalStatus === 'approved') && u.publishDate <= getChinaDate())
      .sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate))
      .slice(0, 20);
    const works = readJSON('works.json')
      .filter(w => !w.approvalStatus || w.approvalStatus === 'approved')
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 10);
    const events = readJSON('events.json')
      .filter(e => !e.approvalStatus || e.approvalStatus === 'approved')
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 10);
    const projects = readJSON('projects.json')
      .filter(p => !p.approvalStatus || p.approvalStatus === 'approved')
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 10);

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<rss version="2.0"><channel>\n';
    xml += `  <title>${siteName}</title>\n`;
    xml += `  <link>${baseUrl}</link>\n`;
    xml += '  <description>同人周边展示平台 — 动态、作品、活动、企划</description>\n';
    xml += `  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n`;

    updates.forEach(u => {
      xml += '  <item>\n';
      xml += `    <title>[动态] ${escapeXml(u.title)}</title>\n`;
      xml += `    <link>${baseUrl}/update-detail.html?id=${u.id}</link>\n`;
      xml += `    <pubDate>${new Date(u.publishDate).toUTCString()}</pubDate>\n`;
      xml += `    <description>${escapeXml((u.content || '').substring(0, 200))}</description>\n`;
      xml += '  </item>\n';
    });
    works.forEach(w => {
      xml += '  <item>\n';
      xml += `    <title>[作品] ${escapeXml(w.title)}</title>\n`;
      xml += `    <link>${baseUrl}/work-detail.html?id=${w.id}</link>\n`;
      xml += `    <pubDate>${new Date(w.createdAt || 0).toUTCString()}</pubDate>\n`;
      xml += `    <description>${escapeXml(w.description || w.title)}</description>\n`;
      xml += '  </item>\n';
    });
    events.forEach(e => {
      xml += '  <item>\n';
      xml += `    <title>[活动] ${escapeXml(e.title)}</title>\n`;
      xml += `    <link>${baseUrl}/event-detail.html?id=${e.id}</link>\n`;
      xml += `    <pubDate>${new Date(e.date || 0).toUTCString()}</pubDate>\n`;
      xml += `    <description>${escapeXml(e.location || e.title)}</description>\n`;
      xml += '  </item>\n';
    });
    projects.forEach(p => {
      xml += '  <item>\n';
      xml += `    <title>[企划] ${escapeXml(p.title)}</title>\n`;
      xml += `    <link>${baseUrl}/project-detail.html?id=${p.id}</link>\n`;
      xml += `    <pubDate>${new Date(p.createdAt || 0).toUTCString()}</pubDate>\n`;
      xml += `    <description>${escapeXml(p.description || p.title)}</description>\n`;
      xml += '  </item>\n';
    });
    xml += '</channel></rss>';
    res.type('application/xml').send(xml);
  } catch (e) {
    res.status(500).send('Error generating RSS');
  }
});

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

app.put('/api/admin/settings', authMiddleware, async (req, res) => {
  const existing = readJSON('settings.json');
  const incoming = req.body;
  // Deep merge: incoming fields override existing, but preserve nested keys not present in incoming
  function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
          target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
        result[key] = deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }
  const merged = deepMerge(existing, incoming);
  // Remove legacy UI-only field accidentally persisted by the old page settings form.
  if (merged.pages && typeof merged.pages === 'object') {
    for (const page of Object.values(merged.pages)) {
      if (page && typeof page === 'object') delete page.heroBgInput;
    }
  }
  await writeJSON('settings.json', merged);
  const changedKeys = ['site', 'footer', 'pages', 'authorRegistrationNotice', 'features'].filter(k => JSON.stringify(existing[k]) !== JSON.stringify(merged[k]));
  if (changedKeys.length) {
    const before = {}; const after = {};
    for (const k of changedKeys) { before[k] = existing[k]; after[k] = merged[k]; }
    await logEdit('管理员', '更新页面设置', 'settings.json', changedKeys.join(', '), '', { before, after });
  }
  res.json({ success: true });
});

// ===== Announcements =====
// Public: get published announcements (publishDate <= today)
app.get('/api/announcements', (req, res) => {
  try {
    let announcements = readJSON('announcements.json');
    const today = getChinaDate();
    announcements = announcements.filter(a => a.publishDate <= today);
    announcements.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.publishDate) - new Date(a.publishDate);
    });
    res.json(announcements);
  } catch (e) {
    res.json([]);
  }
});

// Public: get popup announcements
app.get('/api/announcements/popup', (req, res) => {
  try {
    const settings = readJSON('settings.json');
    if (settings.features?.announcementPopup === false) return res.json([]);
    let announcements = readJSON('announcements.json');
    const today = getChinaDate();
    announcements = announcements.filter(a => a.popup && a.publishDate <= today);
    announcements.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
    res.json(announcements);
  } catch (e) {
    res.json([]);
  }
});

// Admin: get all announcements
app.get('/api/admin/announcements', authMiddleware, (req, res) => {
  try {
    const announcements = readJSON('announcements.json');
    res.json(announcements);
  } catch (e) {
    res.json([]);
  }
});

// Admin: create announcement
app.post('/api/admin/announcements', authMiddleware, async (req, res) => {
  let announcements = [];
  try { announcements = readJSON('announcements.json'); } catch {}
  const announcement = {
    id: 'ann' + Date.now(),
    title: req.body.title || '',
    content: req.body.content || '',
    images: req.body.images || [],
    publishDate: req.body.publishDate || new Date().toISOString().split('T')[0],
    popup: req.body.popup || false,
    pinned: req.body.pinned || false,
    createdAt: new Date().toISOString()
  };
  announcements.push(announcement);
  await writeJSON('announcements.json', announcements);
  res.json(announcement);
});

// Admin: update announcement
app.put('/api/admin/announcements/:id', authMiddleware, async (req, res) => {
  let announcements = readJSON('announcements.json');
  const index = announcements.findIndex(a => a.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '公告未找到' });
  // Whitelist allowed fields
  const allowedFields = ['title', 'content', 'images', 'publishDate', 'pinned', 'popup'];
  const updates = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });
  announcements[index] = { ...announcements[index], ...updates };
  await writeJSON('announcements.json', announcements);
  res.json(announcements[index]);
});

// Admin: delete announcement
app.delete('/api/admin/announcements/:id', authMiddleware, async (req, res) => {
  let announcements = readJSON('announcements.json');
  announcements = announcements.filter(a => a.id !== req.params.id);
  await writeJSON('announcements.json', announcements);
  res.json({ success: true });
});

// ===== Author Announcements (Admin to Author) =====

// Helper: get author announcement reads
function getAuthorAnnouncementReads() {
  try {
    const v = readJSON('author-announcement-reads.json');
    // 兼容历史遗留：早期该文件被初始化成数组，这里统一按对象处理
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    return {};
  } catch { return {}; }
}
async function saveAuthorAnnouncementReads(reads) {
  const safe = (reads && typeof reads === 'object' && !Array.isArray(reads)) ? reads : {};
  await writeJSON('author-announcement-reads.json', safe);
}

// Admin: send announcement to authors
app.post('/api/admin/author-announcements', authMiddleware, async (req, res) => {
  const { title, content, circleIds, pinned, popup } = req.body;
  if (!title || !content) return res.status(400).json({ error: '请填写标题和内容' });

  const circles = readJSON('circles.json');
  let targetCircles;

  if (circleIds && circleIds.length > 0) {
    // Send to specific authors
    targetCircles = circles.filter(c => circleIds.includes(c.id) && c.authorStatus === 'approved');
  } else {
    // Send to all approved authors
    targetCircles = circles.filter(c => c.authorStatus === 'approved');
  }

  if (targetCircles.length === 0) return res.status(400).json({ error: '没有目标作者' });

  let announcements = [];
  try { announcements = readJSON('author-announcements.json'); } catch {}

  const announcement = {
    id: 'aa' + Date.now(),
    title,
    content,
    sentTo: targetCircles.map(c => c.id),
    pinned: pinned || false,
    popup: popup || false,
    sentAt: new Date().toISOString()
  };

  announcements.push(announcement);
  await writeJSON('author-announcements.json', announcements);

  res.json({ success: true, sentTo: targetCircles.length, announcement });
});

// Admin: get all author announcements
app.get('/api/admin/author-announcements', authMiddleware, (req, res) => {
  let announcements = [];
  try { announcements = readJSON('author-announcements.json'); } catch {}
  announcements.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  res.json(announcements);
});

// Admin: get read status for an announcement
app.get('/api/admin/author-announcements/:id/read-status', authMiddleware, (req, res) => {
  let announcements = [];
  try { announcements = readJSON('author-announcements.json'); } catch {}
  const announcement = announcements.find(a => a.id === req.params.id);
  if (!announcement) return res.status(404).json({ error: '公告不存在' });

  const reads = getAuthorAnnouncementReads();
  const readCircleIds = reads[announcement.id] || [];

  const circles = readJSON('circles.json');
  const sentCircles = circles.filter(c => announcement.sentTo.includes(c.id));
  const readAuthors = sentCircles.filter(c => readCircleIds.includes(c.id));
  const unreadAuthors = sentCircles.filter(c => !readCircleIds.includes(c.id));

  res.json({
    total: sentCircles.length,
    read: readAuthors.map(c => ({ id: c.id, name: c.name })),
    unread: unreadAuthors.map(c => ({ id: c.id, name: c.name }))
  });
});

// Admin: delete author announcement
// Admin: update author announcement
app.put('/api/admin/author-announcements/:id', authMiddleware, async (req, res) => {
  const { title, content, pinned, popup } = req.body;
  let announcements = [];
  try { announcements = readJSON('author-announcements.json'); } catch {}
  const idx = announcements.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '公告不存在' });
  if (title !== undefined) announcements[idx].title = title;
  if (content !== undefined) announcements[idx].content = content;
  if (pinned !== undefined) announcements[idx].pinned = pinned;
  if (popup !== undefined) announcements[idx].popup = popup;
  await writeJSON('author-announcements.json', announcements);
  res.json({ success: true, announcement: announcements[idx] });
});

app.delete('/api/admin/author-announcements/:id', authMiddleware, async (req, res) => {
  let announcements = [];
  try { announcements = readJSON('author-announcements.json'); } catch {}
  const idx = announcements.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '公告不存在' });
  announcements.splice(idx, 1);
  await writeJSON('author-announcements.json', announcements);
  // Also clean up read records
  const reads = getAuthorAnnouncementReads();
  delete reads[req.params.id];
  saveAuthorAnnouncementReads(reads);
  res.json({ success: true });
});

// Author: get own announcements
app.get('/api/author/announcements', authorAuthMiddleware, (req, res) => {
  let announcements = [];
  try { announcements = readJSON('author-announcements.json'); } catch {}

  const circleId = req.author.circleId;
  const reads = getAuthorAnnouncementReads();

  // All announcements visible to all approved authors
  const myAnnouncements = announcements.map(a => ({
    ...a,
    read: (reads[a.id] || []).includes(circleId)
  }));

  myAnnouncements.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.sentAt) - new Date(a.sentAt);
  });

  res.json(myAnnouncements);
});

// Author: get popup announcements
app.get('/api/author/announcements/popup', authorAuthMiddleware, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let announcements = [];
  try { announcements = readJSON('author-announcements.json'); } catch {}

  const circleId = req.author.circleId;
  const reads = getAuthorAnnouncementReads();

  const popupAnnouncements = announcements
    .filter(a => a.popup && (a.sentTo || []).includes(circleId) && !(reads[a.id] || []).includes(circleId));

  popupAnnouncements.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  res.json(popupAnnouncements);
});

// Author: mark announcement as read
app.put('/api/author/announcements/:id/read', authorAuthMiddleware, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const circleId = req.author.circleId;
  const reads = getAuthorAnnouncementReads();

  if (!reads[req.params.id]) reads[req.params.id] = [];
  if (!reads[req.params.id].includes(circleId)) {
    reads[req.params.id].push(circleId);
    await saveAuthorAnnouncementReads(reads);
  }

  res.json({ success: true });
});

// --- Admin Contacts ---
app.get('/api/admin/contacts', authMiddleware, (req, res) => {
  let contacts = [];
  try { contacts = readJSON('contact.json'); } catch {}
  if (!Array.isArray(contacts)) contacts = [];

  // Search filter
  const { search } = req.query;
  if (search) {
    const s = search.toLowerCase();
    contacts = contacts.filter(c =>
      (c.name && c.name.toLowerCase().includes(s)) ||
      (c.email && c.email.toLowerCase().includes(s)) ||
      (c.subject && c.subject.toLowerCase().includes(s)) ||
      (c.message && c.message.toLowerCase().includes(s))
    );
  }

  // Sort by date descending
  contacts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json(contacts);
});

app.put('/api/admin/contacts/:id', authMiddleware, async (req, res) => {
  let contacts = [];
  try { contacts = readJSON('contact.json'); } catch {}
  if (!Array.isArray(contacts)) contacts = [];
  const index = contacts.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '消息未找到' });
  const allowed = ['read', 'status', 'adminNote'];
  for (const field of allowed) {
    if (req.body[field] !== undefined) contacts[index][field] = req.body[field];
  }
  if (contacts[index].read === undefined) contacts[index].read = false;
  if (!contacts[index].status) contacts[index].status = contacts[index].read ? 'read' : 'new';
  await writeJSON('contact.json', contacts);
  res.json({ success: true, contact: contacts[index] });
});

app.put('/api/admin/contacts/:id/read', authMiddleware, async (req, res) => {
  let contacts = [];
  try { contacts = readJSON('contact.json'); } catch {}
  if (!Array.isArray(contacts)) contacts = [];
  const index = contacts.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '消息未找到' });
  contacts[index].read = true;
  if (!contacts[index].status || contacts[index].status === 'new') contacts[index].status = 'read';
  await writeJSON('contact.json', contacts);
  res.json({ success: true });
});

app.delete('/api/admin/contacts/:id', authMiddleware, async (req, res) => {
  let contacts = [];
  try { contacts = readJSON('contact.json'); } catch {}
  if (!Array.isArray(contacts)) contacts = [];
  contacts = contacts.filter(c => c.id !== req.params.id);
  await writeJSON('contact.json', contacts);
  res.json({ success: true });
});

// ===== Admin CRUD =====
// --- Works ---
app.get('/api/admin/works', authMiddleware, async (req, res) => {
  let works = readJSON('works.json');
  if (ensureOrder(works)) await writeJSON('works.json', works);
  works.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  // Pagination (only if page/limit params provided)
  if (req.query.page || req.query.limit) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const total = works.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const items = works.slice(start, start + limit);
    return res.json({ items, total, page, limit, totalPages });
  }

  res.json(works);
});

app.post('/api/admin/works', authMiddleware, async (req, res) => {
  const works = readJSON('works.json');
  const maxOrder = works.reduce((max, w) => Math.max(max, w.order ?? 0), 0);
  // Whitelist allowed fields
  const allowedFields = ['title', 'titleEn', 'category', 'price', 'status', 'releaseDate', 'endDate', 'tags', 'description', 'images', 'moreImages', 'circles', 'isCommissioned', 'commissionedBy', 'socialLinks'];
  const workData = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) workData[field] = req.body[field];
  });
  const work = {
    id: 'w' + Date.now() + Math.random().toString(36).substr(2, 5),
    ...workData,
    likes: 0,
    wants: 0,
    order: maxOrder + 1,
    createdAt: new Date().toISOString()
  };
  works.push(work);
  await writeJSON('works.json', works);
  logEdit('管理员', '创建作品', work.title || work.id, '');
  res.json(work);
});

// Admin: import works from Excel
app.post('/api/admin/works/import', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });

  try {
    const rows = readExcelRows(req.file.path);

    let works = readJSON('works.json');
    let categories = { works: [], workStatus: [] };
    try { categories = readJSON('categories.json'); } catch {}

    const CATEGORY_MAP = {};
    categories.works.forEach(c => { CATEGORY_MAP[c.name] = c.id; CATEGORY_MAP[c.id] = c.id; });
    const STATUS_MAP = {};
    categories.workStatus.forEach(c => { STATUS_MAP[c.name] = c.id; STATUS_MAP[c.id] = c.id; });

    // Build circles name->id map
    const circles = readJSON('circles.json');
    const circlesNameMap = {};
    circles.forEach(c => { circlesNameMap[c.name] = c.id; });

    let added = 0, updated = 0;

    rows.forEach(row => {
      const title = row['作品名称'] || row['标题'] || '';
      if (!title) return;

      const authorName = row['作者'] || '';
      const circleIds = authorName.split(',').map(name => {
        const trimmed = name.trim();
        return circlesNameMap[trimmed] || null;
      }).filter(Boolean);

      const existing = works.find(w => w.title === title);
      const workData = {
        title,
        category: CATEGORY_MAP[row['分类']] || 'other',
        status: STATUS_MAP[row['状态']] || 'on_sale',
        price: row['价格'] || '',
        releaseDate: row['发售日期'] || '',
        endDate: row['截止日期'] || '',
        tags: (row['标签'] || '').split(',').map(t => t.trim()).filter(Boolean),
        description: row['描述'] || ''
      };

      if (existing) {
        Object.assign(existing, workData);
        if (circleIds.length > 0) existing.circles = circleIds;
        updated++;
      } else {
        works.push({
          id: 'w' + Date.now() + Math.random().toString(36).substr(2, 5),
          ...workData,
          circles: circleIds.length > 0 ? circleIds : [],
          images: [],
          moreImages: [],
          likes: 0,
          wants: 0,
          order: works.length,
          createdAt: new Date().toISOString()
        });
        added++;
      }
    });

    await writeJSON('works.json', works);
    fs.unlinkSync(req.file.path);

    logEdit('管理员', '导入作品', '', `新增${added}个，更新${updated}个`);
    res.json({ success: true, added, updated });
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: '导入失败: ' + e.message });
  }
});

// Admin: approve work
app.post('/api/admin/works/:id/approve', authMiddleware, async (req, res) => {
  let works = readJSON('works.json');
  const index = works.findIndex(w => w.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作品未找到' });
  const work = works[index];
  // Apply the pending revision (if any), then snapshot it as the public version.
  if (work.pendingRevision) {
    const rev = work.pendingRevision;
    for (const f of WORK_CONTENT_FIELDS) {
      if (rev[f] !== undefined) work[f] = rev[f];
    }
    delete work.pendingRevision;
  }
  work.approvalStatus = 'approved';
  work.published = pickWorkContent(work);
  delete work.rejectReason;
  await writeJSON('works.json', works);
  logEdit('管理员', '批准作品', work.title || req.params.id, '');
  // Notify author
  if (work.submittedBy) {
    await addAuthorNotification(work.submittedBy, 'work', work.title, '已通过审核');
  }
  res.json({ success: true });
});

// Admin: reject work
app.post('/api/admin/works/:id/reject', authMiddleware, async (req, res) => {
  let works = readJSON('works.json');
  const index = works.findIndex(w => w.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作品未找到' });
  const work = works[index];
  // Keep the last approved snapshot public; the rejected revision stays for the author to edit.
  work.approvalStatus = 'rejected';
  if (req.body.reason) work.rejectReason = req.body.reason;
  await writeJSON('works.json', works);
  logEdit('管理员', '拒绝作品', work.title || req.params.id, req.body.reason || '');
  if (work.submittedBy) {
    await addAuthorNotification(work.submittedBy, 'work', work.title, '未通过审核', req.body.reason);
  }
  res.json({ success: true });
});

app.put('/api/admin/works/:id', authMiddleware, async (req, res) => {
  let works = readJSON('works.json');
  const index = works.findIndex(w => w.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作品未找到' });
  const work = works[index];
  const oldTitle = work.title;
  const beforeEdit = JSON.parse(JSON.stringify(work));
  // Whitelist allowed fields to prevent mass assignment
  const allowedFields = ['title', 'titleEn', 'category', 'price', 'status', 'releaseDate', 'endDate', 'tags', 'description', 'images', 'moreImages', 'circles', 'likes', 'wants', 'order', 'isCommissioned', 'commissionedBy', 'socialLinks', 'approvalStatus', 'rejectReason', 'submittedBy'];
  const updates = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });
  Object.assign(work, updates);
  // Admin edits publish immediately and clear any stale pending revision.
  work.approvalStatus = 'approved';
  work.published = pickWorkContent(work);
  delete work.pendingRevision;
  delete work.rejectReason;
  await writeJSON('works.json', works);
  await logEdit('管理员', '编辑作品', oldTitle || req.params.id, '', '', { before: beforeEdit, after: work });
  res.json(work);
});

app.delete('/api/admin/works/:id', authMiddleware, async (req, res) => {
  const workId = req.params.id;
  const works = readJSON('works.json');
  const work = works.find(w => w.id === workId);
  if (!work) return res.status(404).json({ error: '作品未找到' });
  await moveToTrash('work', work);
  await writeJSON('works.json', works.filter(w => w.id !== workId));
  await logEdit('管理员', '移入回收站', work.title || workId, '作品');
  res.json({ success: true, trash: true });
});

// --- Events ---
app.get('/api/admin/events', authMiddleware, async (req, res) => {
  let events = readJSON('events.json');
  if (ensureOrder(events)) await writeJSON('events.json', events);
  events.sort((a, b) => a.order - b.order);

  // Pagination (only if page/limit params provided)
  if (req.query.page || req.query.limit) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const total = events.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const items = events.slice(start, start + limit);
    return res.json({ items, total, page, limit, totalPages });
  }

  res.json(events);
});

app.post('/api/admin/events', authMiddleware, async (req, res) => {
  const events = readJSON('events.json');
  const maxOrder = events.reduce((max, e) => Math.max(max, e.order ?? 0), 0);
  // Whitelist allowed fields
  const allowedFields = ['title', 'date', 'endDate', 'location', 'description', 'coverImage', 'images', 'booth', 'status', 'type', 'booths', 'relatedWorks', 'relatedCircles', 'relatedProjects', 'socialLinks', 'editableBy', 'carouselMode', 'carouselOrder'];
  const eventData = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) eventData[field] = req.body[field];
  });
  if (eventData.booths !== undefined) eventData.booths = sanitizeBoothsClaimFields(eventData.booths);
  const event = {
    id: 'e' + Date.now() + Math.random().toString(36).substr(2, 5),
    ...eventData,
    order: maxOrder + 1,
    createdAt: new Date().toISOString()
  };
  events.push(event);
  await writeJSON('events.json', events);
  await syncEventWorkRelations(event);
  res.json(event);
});

// Admin: import events from Excel
app.post('/api/admin/events/import', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });
  try {
    const rows = readExcelRows(req.file.path);
    let events = readJSON('events.json');
    let added = 0, updated = 0;
    rows.forEach(row => {
      const title = row['活动名称'] || row['标题'] || '';
      if (!title) return;
      const existing = events.find(e => e.title === title);
      const eventData = {
        title,
        date: row['开始日期'] || row['日期'] || '',
        endDate: row['结束日期'] || '',
        location: row['地点'] || '',
        description: row['描述'] || '',
        status: row['状态'] || ''
      };
      if (existing) {
        Object.assign(existing, eventData);
        updated++;
      } else {
        events.push({ id: 'e' + Date.now() + Math.random().toString(36).substr(2, 5), ...eventData, order: events.length });
        added++;
      }
    });
    await writeJSON('events.json', events);
    fs.unlinkSync(req.file.path);
    logEdit('管理员', '导入活动', '', `新增${added}个，更新${updated}个`);
    res.json({ success: true, added, updated });
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: '导入失败: ' + e.message });
  }
});

app.put('/api/admin/events/:id', authMiddleware, async (req, res) => {
  let events = readJSON('events.json');
  const index = events.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '活动未找到' });
  const before = JSON.parse(JSON.stringify(events[index]));
  // Whitelist allowed fields to prevent mass assignment
  const allowedFields = ['title', 'date', 'endDate', 'location', 'description', 'coverImage', 'images', 'booth', 'status', 'type', 'booths', 'relatedWorks', 'relatedCircles', 'relatedProjects', 'socialLinks', 'order', 'approvalStatus', 'rejectReason', 'submittedBy', 'editableBy', 'carouselMode', 'carouselOrder'];
  const updates = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });
  if (updates.booths !== undefined) updates.booths = sanitizeBoothsClaimFields(updates.booths);
  const nextApproval = updates.approvalStatus !== undefined ? updates.approvalStatus : 'approved';
  events[index] = { ...events[index], ...updates, approvalStatus: nextApproval };
  if (nextApproval === 'approved') delete events[index].rejectReason;
  await writeJSON('events.json', events);
  await syncEventWorkRelations(events[index]);
  await logEdit('管理员', '编辑活动', events[index].title || req.params.id, '', '', { before, after: events[index] });
  res.json(events[index]);
});

app.delete('/api/admin/events/:id', authMiddleware, async (req, res) => {
  const eventId = req.params.id;
  const events = readJSON('events.json');
  const event = events.find(e => e.id === eventId);
  if (!event) return res.status(404).json({ error: '活动未找到' });
  await moveToTrash('event', event);
  await writeJSON('events.json', events.filter(e => e.id !== eventId));
  await logEdit('管理员', '移入回收站', event.title || eventId, '活动');
  res.json({ success: true, trash: true });
});

// Admin: approve event
app.post('/api/admin/events/:id/approve', authMiddleware, async (req, res) => {
  let events = readJSON('events.json');
  const index = events.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '活动未找到' });
  events[index].approvalStatus = 'approved';
  await writeJSON('events.json', events);
  logEdit('管理员', '批准活动', events[index].title || req.params.id, '');
  // Notify author
  if (events[index].submittedBy) {
    addAuthorNotification(events[index].submittedBy, 'event', events[index].title, '已通过审核');
  }
  res.json({ success: true });
});

// Admin: reject event
app.post('/api/admin/events/:id/reject', authMiddleware, async (req, res) => {
  let events = readJSON('events.json');
  const index = events.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '活动未找到' });
  events[index].approvalStatus = 'rejected';
  if (req.body.reason) events[index].rejectReason = req.body.reason;
  await writeJSON('events.json', events);
  logEdit('管理员', '拒绝活动', events[index].title || req.params.id, req.body.reason || '');
  // Notify author
  if (events[index].submittedBy) {
    addAuthorNotification(events[index].submittedBy, 'event', events[index].title, '未通过审核', req.body.reason);
  }
  res.json({ success: true });
});

// Admin: approve project
app.post('/api/admin/projects/:id/approve', authMiddleware, async (req, res) => {
  let projects = readJSON('projects.json');
  const index = projects.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '企划未找到' });
  projects[index].approvalStatus = 'approved';
  await writeJSON('projects.json', projects);
  logEdit('管理员', '批准企划', projects[index].title || req.params.id, '');
  // Notify author
  if (projects[index].submittedBy) {
    addAuthorNotification(projects[index].submittedBy, 'project', projects[index].title, '已通过审核');
  }
  res.json({ success: true });
});

// Admin: reject project
app.post('/api/admin/projects/:id/reject', authMiddleware, async (req, res) => {
  let projects = readJSON('projects.json');
  const index = projects.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '企划未找到' });
  projects[index].approvalStatus = 'rejected';
  if (req.body.reason) projects[index].rejectReason = req.body.reason;
  await writeJSON('projects.json', projects);
  logEdit('管理员', '拒绝企划', projects[index].title || req.params.id, req.body.reason || '');
  // Notify author
  if (projects[index].submittedBy) {
    addAuthorNotification(projects[index].submittedBy, 'project', projects[index].title, '未通过审核', req.body.reason);
  }
  res.json({ success: true });
});

// Admin: approve update
app.post('/api/admin/updates/:id/approve', authMiddleware, async (req, res) => {
  let updates = readJSON('updates.json');
  const index = updates.findIndex(u => u.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '动态未找到' });
  updates[index].approvalStatus = 'approved';
  await writeJSON('updates.json', updates);
  logEdit('管理员', '批准动态', updates[index].title || req.params.id, '');
  // Notify author
  if (updates[index].submittedBy) {
    addAuthorNotification(updates[index].submittedBy, 'update', updates[index].title, '已通过审核');
  }
  res.json({ success: true });
});

// Admin: reject update
app.post('/api/admin/updates/:id/reject', authMiddleware, async (req, res) => {
  let updates = readJSON('updates.json');
  const index = updates.findIndex(u => u.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '动态未找到' });
  updates[index].approvalStatus = 'rejected';
  if (req.body.reason) updates[index].rejectReason = req.body.reason;
  await writeJSON('updates.json', updates);
  logEdit('管理员', '拒绝动态', updates[index].title || req.params.id, req.body.reason || '');
  // Notify author
  if (updates[index].submittedBy) {
    addAuthorNotification(updates[index].submittedBy, 'update', updates[index].title, '未通过审核', req.body.reason);
  }
  res.json({ success: true });
});

// --- Circles ---
function sanitizeCircleForAdmin(c) {
  const { passwordHash, ...safe } = c;
  return { ...safe, hasPassword: Boolean(c.username && c.passwordHash) };
}

app.get('/api/admin/circles', authMiddleware, async (req, res) => {
  let circles = readJSON('circles.json');
  if (ensureOrder(circles)) await writeJSON('circles.json', circles);
  circles.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  circles = circles.map(sanitizeCircleForAdmin);

  // Pagination (only if page/limit params provided)
  if (req.query.page || req.query.limit) {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const total = circles.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const items = circles.slice(start, start + limit);
    return res.json({ items, total, page, limit, totalPages });
  }

  res.json(circles);
});

app.post('/api/admin/circles', authMiddleware, async (req, res) => {
  const circles = readJSON('circles.json');
  const maxOrder = circles.reduce((max, c) => Math.max(max, c.order ?? 0), 0);
  // Whitelist allowed fields - NEVER allow passwordHash, username, authorStatus
  const allowedFields = ['name', 'description', 'category', 'logo', 'cardCover', 'images', 'socialLinks', 'editableBy'];
  const circleData = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) circleData[field] = req.body[field];
  });
  const circle = {
    id: 'c' + Date.now() + Math.random().toString(36).substr(2, 5),
    ...circleData,
    order: maxOrder + 1,
    createdAt: new Date().toISOString()
  };
  circles.push(circle);
  await writeJSON('circles.json', circles);
  res.json(circle);
});

app.put('/api/admin/circles/:id', authMiddleware, async (req, res) => {
  let circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });
  const before = JSON.parse(JSON.stringify(circles[index]));
  delete before.passwordHash;
  // Whitelist allowed fields - NEVER allow passwordHash, username, authorStatus to be set directly
  const allowedFields = ['name', 'description', 'category', 'logo', 'cardCover', 'images', 'socialLinks', 'order', 'editableBy'];
  const updates = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });
  circles[index] = { ...circles[index], ...updates };
  await writeJSON('circles.json', circles);
  const afterCircle = { ...circles[index] };
  delete afterCircle.passwordHash;
  await logEdit('管理员', '编辑作者', circles[index].name || req.params.id, '', '', { before, after: afterCircle });
  res.json(circles[index]);
});

app.delete('/api/admin/circles/:id', authMiddleware, async (req, res) => {
  const circleId = req.params.id;
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === circleId);
  if (!circle) return res.status(404).json({ error: '作者未找到' });
  await moveToTrash('circle', circle);
  await writeJSON('circles.json', circles.filter(c => c.id !== circleId));
  await logEdit('管理员', '移入回收站', circle.name || circleId, '作者');
  res.json({ success: true, trash: true });
});

// --- Circle Excel Export/Import ---
app.get('/api/admin/circles/:id/export', authMiddleware, (req, res) => {
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.params.id);
  if (!circle) return res.status(404).json({ error: '作者未找到' });

  const works = readJSON('works.json');
  const events = readJSON('events.json');
  const projects = readJSON('projects.json');
  const circleWorks = works.filter(w => (w.circles || []).includes(circle.id));

  // Use categories.json for labels
  let categories = { works: [], workStatus: [] };
  try { categories = readJSON('categories.json'); } catch {}
  const catMap = {};
  categories.works.forEach(c => catMap[c.id] = c.name);
  const statusMap = {};
  categories.workStatus.forEach(c => statusMap[c.id] = c.name);

  // Build events map
  const eventMap = {};
  events.forEach(e => eventMap[e.id] = e.title);

  // Build projects map
  const projectMap = {};
  projects.forEach(p => projectMap[p.id] = p.title);

  const data = circleWorks.map(w => {
    // Find events that reference this work
    const relatedEventTitles = events
      .filter(e => (e.relatedWorks || []).includes(w.id))
      .map(e => e.title);
    // Find projects that reference this work
    const relatedProjectTitles = projects
      .filter(p => (p.works || []).includes(w.id))
      .map(p => p.title);
    return {
      '作品名称': w.title,
      '分类': catMap[w.category] || w.category,
      '价格': w.price || '',
      '状态': statusMap[w.status] || w.status,
      '发售日期': w.releaseDate || '',
      '标签': (w.tags || []).join(', '),
      '图片': (w.images || []).map(img => img.replace('/uploads/', '')).join(', '),
      '更多图片': (w.moreImages || []).map(img => img.replace('/uploads/', '')).join(', '),
      '联系方式类型': w.socialLinks?.qq ? 'QQ' : w.socialLinks?.qqGroup ? 'QQ群' : '',
      '联系方式': w.socialLinks?.qq || w.socialLinks?.qqGroup || '',
      '联系显示名': w.socialLinks?.contactLabel || '',
      '网站链接': w.socialLinks?.website || '',
      '网站显示名': w.socialLinks?.websiteLabel || '',
      '关联活动': relatedEventTitles.join(', '),
      '关联企划': relatedProjectTitles.join(', '),
      '作品描述': w.description || ''
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);

  ws['!cols'] = [
    { wch: 30 }, { wch: 10 }, { wch: 12 },
    { wch: 10 }, { wch: 12 }, { wch: 25 },
    { wch: 25 }, { wch: 25 }, { wch: 10 }, { wch: 15 },
    { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 30 }, { wch: 30 }, { wch: 50 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, `${circle.name} - 作品列表`);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(circle.name)}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

app.post('/api/admin/circles/:id/import', authMiddleware, upload.single('file'), async (req, res) => {
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.params.id);
  if (!circle) return res.status(404).json({ error: '作者未找到' });
  if (!req.file) return res.status(400).json({ error: '请上传Excel文件' });

  // Use categories.json for mapping
  let categories = { works: [], workStatus: [] };
  try { categories = readJSON('categories.json'); } catch {}
  const CATEGORY_MAP = {};
  categories.works.forEach(c => { CATEGORY_MAP[c.name] = c.id; CATEGORY_MAP[c.id] = c.id; });
  const STATUS_MAP = {};
  categories.workStatus.forEach(c => { STATUS_MAP[c.name] = c.id; STATUS_MAP[c.id] = c.id; });

  try {
    const rows = readExcelRows(req.file.path);

    let works = readJSON('works.json');
    let events = readJSON('events.json');
    let projects = readJSON('projects.json');
    const circleWorks = works.filter(w => (w.circles || []).includes(circle.id));
    const otherWorks = works.filter(w => !(w.circles || []).includes(circle.id));

    // Build event title -> id map
    const eventTitleMap = {};
    events.forEach(e => eventTitleMap[e.title] = e.id);

    // Build project title -> id map
    const projectTitleMap = {};
    projects.forEach(p => projectTitleMap[p.title] = p.id);

    const importTitles = new Set();
    const result = { added: 0, updated: 0, deleted: 0, eventLinks: 0, details: [] };

    const newCircleWorks = rows.map(row => {
      const title = row['作品名称'] || row['标题'] || '';
      if (!title) return null;
      importTitles.add(title);

      const existing = circleWorks.find(w => w.title === title);
      const workData = {
        title,
        category: CATEGORY_MAP[row['分类']] || 'other',
        price: row['价格'] || '',
        status: STATUS_MAP[row['状态']] || 'on_sale',
        releaseDate: row['发售日期'] || row['发售日'] || '',
        endDate: row['截止日期'] || row['截止日'] || '',
        tags: (row['标签'] || '').split(',').map(t => t.trim()).filter(Boolean),
        description: row['作品描述'] || row['描述'] || '',
        images: (row['图片'] || '').split(',').map(f => f.trim()).filter(Boolean).map(f => f.startsWith('/uploads/') ? f : '/uploads/' + f),
        moreImages: (row['更多图片'] || '').split(',').map(f => f.trim()).filter(Boolean).map(f => f.startsWith('/uploads/') ? f : '/uploads/' + f),
        socialLinks: (() => {
          const sl = {
            contactLabel: row['联系显示名'] || '',
            website: row['网站链接'] || '',
            websiteLabel: row['网站显示名'] || ''
          };
          const contactType = (row['联系方式类型'] || '').includes('群') ? 'qqGroup' : 'qq';
          const contactValue = row['联系方式'] || '';
          if (contactValue) sl[contactType] = contactValue;
          return sl;
        })()
      };

      // Handle event association from Excel
      const eventTitles = (row['关联活动'] || '').split(',').map(t => t.trim()).filter(Boolean);
      const workId = existing ? existing.id : ('w' + Date.now() + Math.random().toString(36).substr(2, 5));
      if (eventTitles.length > 0) {
        eventTitles.forEach(eventTitle => {
          const eventId = eventTitleMap[eventTitle];
          if (eventId) {
            const ev = events.find(e => e.id === eventId);
            if (ev && !(ev.relatedWorks || []).includes(workId)) {
              if (!ev.relatedWorks) ev.relatedWorks = [];
              ev.relatedWorks.push(workId);
              result.eventLinks++;
            }
          }
        });
      }

      // Handle project association from Excel
      const projectTitles = (row['关联企划'] || '').split(',').map(t => t.trim()).filter(Boolean);
      if (projectTitles.length > 0) {
        projectTitles.forEach(projectTitle => {
          const projectId = projectTitleMap[projectTitle];
          if (projectId) {
            const proj = projects.find(p => p.id === projectId);
            if (proj && !(proj.works || []).includes(workId)) {
              if (!proj.works) proj.works = [];
              proj.works.push(workId);
            }
          }
        });
      }

      if (existing) {
        result.updated++;
        result.details.push(`更新: ${title}`);
        // If image column is empty, keep existing images
        if (!workData.images || workData.images.length === 0) {
          workData.images = existing.images || [];
        }
        if (!workData.moreImages || workData.moreImages.length === 0) {
          workData.moreImages = existing.moreImages || [];
        }
        // Keep existing socialLinks if Excel has empty values
        const hasContact = workData.socialLinks && (workData.socialLinks.qq || workData.socialLinks.qqGroup || workData.socialLinks.website);
        if (!hasContact && existing.socialLinks) {
          workData.socialLinks = existing.socialLinks;
        }
        return { ...existing, ...workData };
      } else {
        result.added++;
        result.details.push(`新增: ${title}`);
        return { id: workId, ...workData, circles: [circle.id], images: workData.images || [], moreImages: workData.moreImages || [], createdAt: new Date().toISOString() };
      }
    }).filter(Boolean);

    // Find deleted works
    circleWorks.forEach(w => {
      if (!importTitles.has(w.title)) {
        result.deleted++;
        result.details.push(`删除: ${w.title}`);
      }
    });

    works = [...otherWorks, ...newCircleWorks];
    await writeJSON('works.json', works);
    await writeJSON('events.json', events);
    await writeJSON('projects.json', projects);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json(result);
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: '导入失败: ' + e.message });
  }
});

// --- Projects ---
app.get('/api/admin/projects', authMiddleware, async (req, res) => {
  let projects = readJSON('projects.json');
  if (ensureOrder(projects)) await writeJSON('projects.json', projects);
  projects.sort((a, b) => a.order - b.order);

  // Pagination (only if page/limit params provided)
  if (req.query.page || req.query.limit) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const total = projects.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const items = projects.slice(start, start + limit);
    return res.json({ items, total, page, limit, totalPages });
  }

  res.json(projects);
});

app.post('/api/admin/projects', authMiddleware, async (req, res) => {
  const projects = readJSON('projects.json');
  const maxOrder = projects.reduce((max, p) => Math.max(max, p.order ?? 0), 0);
  // Whitelist allowed fields
  const allowedFields = ['title', 'description', 'status', 'category', 'images', 'circles', 'events', 'works', 'tags', 'contactInfo', 'startDate', 'endDate', 'socialLinks', 'coverImage', 'editableBy', 'pinned', 'recruiting', 'recruitNote', 'recruitJobs', 'carouselMode', 'carouselOrder'];
  const projectData = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) projectData[field] = req.body[field];
  });
  const project = {
    id: 'p' + Date.now() + Math.random().toString(36).substr(2, 5),
    ...projectData,
    order: maxOrder + 1,
    createdAt: new Date().toISOString()
  };
  projects.push(project);
  await writeJSON('projects.json', projects);
  res.json(project);
});

// Admin: import projects from Excel
app.post('/api/admin/projects/import', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });
  try {
    const rows = readExcelRows(req.file.path);
    let projects = readJSON('projects.json');
    let added = 0, updated = 0;
    rows.forEach(row => {
      const title = row['企划名称'] || row['标题'] || '';
      if (!title) return;
      const existing = projects.find(p => p.title === title);
      const projectData = {
        title,
        category: row['分类'] || '',
        status: row['状态'] || '',
        description: row['描述'] || ''
      };
      if (existing) {
        Object.assign(existing, projectData);
        updated++;
      } else {
        projects.push({ id: 'p' + Date.now() + Math.random().toString(36).substr(2, 5), ...projectData, order: projects.length, createdAt: new Date().toISOString() });
        added++;
      }
    });
    await writeJSON('projects.json', projects);
    fs.unlinkSync(req.file.path);
    logEdit('管理员', '导入企划', '', `新增${added}个，更新${updated}个`);
    res.json({ success: true, added, updated });
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: '导入失败: ' + e.message });
  }
});

app.put('/api/admin/projects/:id', authMiddleware, async (req, res) => {
  let projects = readJSON('projects.json');
  const index = projects.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '企划未找到' });
  const before = JSON.parse(JSON.stringify(projects[index]));
  // Whitelist allowed fields
  const allowedFields = ['title', 'description', 'status', 'category', 'images', 'circles', 'events', 'works', 'tags', 'contactInfo', 'startDate', 'endDate', 'order', 'socialLinks', 'coverImage', 'approvalStatus', 'rejectReason', 'submittedBy', 'editableBy', 'pinned', 'recruiting', 'recruitNote', 'recruitJobs', 'carouselMode', 'carouselOrder'];
  const updates = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });
  const nextApproval = updates.approvalStatus !== undefined ? updates.approvalStatus : 'approved';
  projects[index] = { ...projects[index], ...updates, approvalStatus: nextApproval };
  if (nextApproval === 'approved') delete projects[index].rejectReason;
  await writeJSON('projects.json', projects);
  await logEdit('管理员', '编辑企划', projects[index].title || req.params.id, '', '', { before, after: projects[index] });
  res.json(projects[index]);
});

// Admin: unified project + series ordering
app.post('/api/admin/reorder-projects-series', authMiddleware, async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: '排序数据为空' });
  const projects = readJSON('projects.json');
  const series = readJSON('series.json');
  const projectMap = new Map(projects.map(p => [String(p.id), p]));
  const seriesMap = new Map(series.map(s => [String(s.id), s]));
  items.forEach(item => {
    const order = Number(item.order);
    if (!Number.isFinite(order)) return;
    if (item.type === 'project') {
      const p = projectMap.get(String(item.id));
      if (p) p.order = order;
    } else if (item.type === 'series') {
      const s = seriesMap.get(String(item.id));
      if (s) s.order = order;
    }
  });
  await writeJSON('projects.json', projects);
  await writeJSON('series.json', series);
  await logEdit('管理员', '统一排序企划与系列', '', `${items.length} 项`);
  res.json({ success: true });
});

app.delete('/api/admin/projects/:id', authMiddleware, async (req, res) => {
  const projectId = req.params.id;
  const projects = readJSON('projects.json');
  const project = projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: '企划未找到' });
  await moveToTrash('project', project);
  await writeJSON('projects.json', projects.filter(p => p.id !== projectId));
  await logEdit('管理员', '移入回收站', project.title || projectId, '企划');
  res.json({ success: true, trash: true });
});

// ===== Updates (同人动态) =====
// Public: get published updates
app.get('/api/updates', cacheMiddleware(60), (req, res) => {
  try {
    let updates = readJSON('updates.json');
    const today = getChinaDate();
    // Only return approved updates (or legacy updates without approvalStatus)
    updates = updates.filter(u => (!u.approvalStatus || u.approvalStatus === 'approved') && u.publishDate <= today);
    // Filter by category/status if provided
    if (req.query.category) updates = updates.filter(u => u.category === req.query.category);
    if (req.query.status) updates = updates.filter(u => u.status === req.query.status);
    updates.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.publishDate) - new Date(a.publishDate);
    });

    // Pagination (only if page/limit params provided)
    if (req.query.page || req.query.limit) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const total = updates.length;
      const totalPages = Math.ceil(total / limit);
      const start = (page - 1) * limit;
      const items = updates.slice(start, start + limit);
      return res.json({ items, total, page, limit, totalPages });
    }

    res.json(updates);
  } catch (e) { res.json([]); }
});

app.get('/api/updates/:id', (req, res) => {
  try {
    const updates = readJSON('updates.json');
    const update = updates.find(u => u.id === req.params.id);
    if (!update) return res.status(404).json({ error: '动态未找到' });
    // Only return approved updates (or legacy updates without approvalStatus)
    if (update.approvalStatus && update.approvalStatus !== 'approved') {
      return res.status(404).json({ error: '动态未找到' });
    }
    res.json(update);
  } catch (e) { res.status(404).json({ error: '动态未找到' }); }
});

// Admin: CRUD for updates
app.get('/api/admin/updates', authMiddleware, (req, res) => {
  try {
    let updates = readJSON('updates.json');

    // Pagination (only if page/limit params provided)
    if (req.query.page || req.query.limit) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const total = updates.length;
      const totalPages = Math.ceil(total / limit);
      const start = (page - 1) * limit;
      const items = updates.slice(start, start + limit);
      return res.json({ items, total, page, limit, totalPages });
    }

    res.json(updates);
  } catch (e) { res.json([]); }
});

app.post('/api/admin/updates', authMiddleware, async (req, res) => {
  let updates = [];
  try { updates = readJSON('updates.json'); } catch {}
  const update = {
    id: 'upd' + Date.now(),
    title: req.body.title || '',
    content: req.body.content || '',
    publishDate: req.body.publishDate || new Date().toISOString().split('T')[0],
    pinned: req.body.pinned || false,
    coverImage: req.body.coverImage || '',
    images: req.body.images || [],
    relatedCircles: req.body.relatedCircles || [],
    relatedEvents: req.body.relatedEvents || [],
    relatedProjects: req.body.relatedProjects || [],
    category: req.body.category || '',
    status: req.body.status || '',
    createdAt: new Date().toISOString()
  };
  updates.push(update);
  await writeJSON('updates.json', updates);
  res.json(update);
});

// Admin: import updates from Excel
app.post('/api/admin/updates/import', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });
  try {
    const rows = readExcelRows(req.file.path);
    let updates = [];
    try { updates = readJSON('updates.json'); } catch {}
    let added = 0, updated = 0;
    rows.forEach(row => {
      const title = row['标题'] || '';
      if (!title) return;
      const existing = updates.find(u => u.title === title);
      const updateData = {
        title,
        content: row['内容'] || '',
        publishDate: row['发布日期'] || new Date().toISOString().split('T')[0]
      };
      if (existing) {
        Object.assign(existing, updateData);
        updated++;
      } else {
        updates.push({ id: 'upd' + Date.now() + Math.random().toString(36).substr(2, 5), ...updateData, createdAt: new Date().toISOString() });
        added++;
      }
    });
    await writeJSON('updates.json', updates);
    fs.unlinkSync(req.file.path);
    logEdit('管理员', '导入动态', '', `新增${added}个，更新${updated}个`);
    res.json({ success: true, added, updated });
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: '导入失败: ' + e.message });
  }
});

app.put('/api/admin/updates/:id', authMiddleware, async (req, res) => {
  let updates = readJSON('updates.json');
  const index = updates.findIndex(u => u.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '动态未找到' });
  const before = JSON.parse(JSON.stringify(updates[index]));
  // Whitelist allowed fields
  const allowedFields = ['title', 'content', 'publishDate', 'pinned', 'coverImage', 'images', 'relatedCircles', 'relatedEvents', 'relatedProjects', 'category', 'status', 'approvalStatus', 'rejectReason', 'submittedBy', 'editableBy'];
  const updates2 = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) updates2[field] = req.body[field];
  });
  const nextApproval = updates2.approvalStatus !== undefined ? updates2.approvalStatus : 'approved';
  updates[index] = { ...updates[index], ...updates2, approvalStatus: nextApproval };
  if (nextApproval === 'approved') delete updates[index].rejectReason;
  await writeJSON('updates.json', updates);
  await logEdit('管理员', '编辑动态', updates[index].title || req.params.id, '', '', { before, after: updates[index] });
  res.json(updates[index]);
});

app.delete('/api/admin/updates/:id', authMiddleware, async (req, res) => {
  const updateId = req.params.id;
  const updates = readJSON('updates.json');
  const update = updates.find(u => u.id === updateId);
  if (!update) return res.status(404).json({ error: '动态未找到' });
  await moveToTrash('update', update);
  await writeJSON('updates.json', updates.filter(u => u.id !== updateId));
  await logEdit('管理员', '移入回收站', update.title || updateId, '动态');
  res.json({ success: true, trash: true });
});

// --- Categories ---
app.get('/api/admin/categories', authMiddleware, (req, res) => {
  res.json(readJSON('categories.json'));
});

app.put('/api/admin/categories', authMiddleware, async (req, res) => {
  const categories = req.body;
  if (!categories.works || !categories.projects) {
    return res.status(400).json({ error: '无效的分类数据' });
  }
  await writeJSON('categories.json', categories);
  res.json({ success: true, categories });
});

// --- Reorder ---
app.post('/api/admin/reorder/:type', authMiddleware, async (req, res) => {
  const { type } = req.params;
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: '无效的排序数据' });

  const fileMap = { works: 'works.json', events: 'events.json', circles: 'circles.json', projects: 'projects.json' };
  const file = fileMap[type];
  if (!file) return res.status(400).json({ error: '不支持的类型' });

  let items = readJSON(file);
  orderedIds.forEach((id, index) => {
    const item = items.find(i => i.id === id);
    if (item) item.order = index;
  });
  await writeJSON(file, items);
  res.json({ success: true });
});

// --- Upload ---
async function saveUploadMeta(filename, uploader) {
  let meta = {};
  try { meta = readJSON('uploads-meta.json'); } catch {}
  meta[filename] = { uploader, uploadedAt: new Date().toISOString() };
  await writeJSON('uploads-meta.json', meta);
}

app.post('/api/admin/upload', authMiddleware, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择文件' });
  try {
    // 管理员上传不压缩，保留原图
    const url = await publishUploadedImage(req.file.path);
    const filename = path.basename(url);
    await saveUploadMeta(filename, '管理员');
    logEdit('管理员', '上传图片', filename, '', url);
    res.json({ url });
  } catch (e) {
    console.error('admin upload publish failed:', e.message);
    fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: '上传失败' });
  }
});


// ===== Admin data backup / restore =====
const { spawn } = require('child_process');
const BACKUP_NAME_RE = /^data\.bak\.[A-Za-z0-9._-]+$/;

function dataDirPath() { return path.join(__dirname, 'data'); }

function resolveBackupPath(name) {
  const n = String(name || '');
  if (!BACKUP_NAME_RE.test(n)) return null;
  const full = path.resolve(__dirname, n);
  const root = path.resolve(__dirname);
  if (full !== path.join(root, n)) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) return null;
  return full;
}

function listBackupDirs() {
  try {
    return fs.readdirSync(__dirname, { withFileTypes: true })
      .filter((d) => d.isDirectory() && BACKUP_NAME_RE.test(d.name))
      .map((d) => {
        const full = path.join(__dirname, d.name);
        const size = backupDirSize(full);
        let mtime = null;
        try { mtime = fs.statSync(full).mtime.toISOString(); } catch {}
        return { name: d.name, mtime, size, includesUploads: !!backupUploadsRoot(full) };
      })
      .sort((a, b) => new Date(b.mtime || 0) - new Date(a.mtime || 0));
  } catch (e) {
    return [];
  }
}

function makeBackupStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
}

function copyDataDir(src, dest) {
  if (fs.existsSync(dest)) throw new Error('目标目录已存在: ' + path.basename(dest));
  fs.cpSync(src, dest, { recursive: true });
}

function uploadsDirPath() { return path.join(__dirname, 'uploads'); }

function backupDirSize(dir) {
  let total = 0;
  try {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) total += backupDirSize(full);
      else if (ent.isFile()) total += fs.statSync(full).size;
    }
  } catch {}
  return total;
}

function backupDataRoot(backupDir) {
  const nested = path.join(backupDir, 'data');
  return fs.existsSync(nested) ? nested : backupDir;
}
function backupUploadsRoot(backupDir) {
  const nested = path.join(backupDir, 'uploads');
  return fs.existsSync(nested) ? nested : null;
}

async function copyBackupDir(dest) {
  await fs.promises.mkdir(dest, { recursive: false });
  await fs.promises.cp(dataDirPath(), path.join(dest, 'data'), { recursive: true });
  const uploadsRoot = uploadsDirPath();
  if (fs.existsSync(uploadsRoot)) {
    await fs.promises.cp(uploadsRoot, path.join(dest, 'uploads'), {
      recursive: true,
      filter: (src) => !src.includes(`${path.sep}.cache`) && !src.includes('uploads-trash')
    });
  }
  await fs.promises.writeFile(path.join(dest, 'manifest.json'), JSON.stringify({
    version: 2,
    createdAt: new Date().toISOString(),
    includesUploads: fs.existsSync(path.join(dest, 'uploads'))
  }, null, 2), 'utf8');
}

function scheduleServiceRestart() {
  setTimeout(() => {
    try {
      const child = spawn('pm2', ['restart', 'f7goods'], {
        detached: true,
        stdio: 'ignore',
        shell: process.platform === 'win32'
      });
      child.unref();
    } catch (e) {
      console.error('pm2 restart spawn failed:', e.message);
    }
    // 兜底：若 pm2 未拉起，进程退出后由 pm2 自动重启
    setTimeout(() => {
      try { process.exit(0); } catch {}
    }, 4000);
  }, 700);
}

app.get('/api/admin/backups', authMiddleware, (req, res) => {
  res.json({ backups: listBackupDirs() });
});

app.post('/api/admin/backups', authMiddleware, async (req, res) => {
  try {
    const name = `data.bak.${makeBackupStamp()}`;
    const dest = path.join(__dirname, name);
    await copyBackupDir(dest);
    logEdit('管理员', '创建数据备份', name, '包含 data 与 uploads');
    res.json({ success: true, backup: { name, mtime: new Date().toISOString(), includesUploads: true } });
  } catch (e) {
    console.error('backup create failed:', e.message);
    res.status(500).json({ error: '创建备份失败: ' + e.message });
  }
});

function sendBackupDownload(req, res) {
  const src = resolveBackupPath(req.params.name);
  if (!src) return res.status(400).json({ error: '无效的备份名称' });
  const archiveName = `${req.params.name}.tar.gz`;
  const tmpFile = path.join(__dirname, 'tmp-uploads', archiveName);
  try {
    fs.mkdirSync(path.join(__dirname, 'tmp-uploads'), { recursive: true });
    const { spawnSync } = require('child_process');
    const r = spawnSync('tar', ['-czf', tmpFile, '-C', __dirname, req.params.name], { encoding: 'utf8' });
    if (r.status !== 0) {
      return res.status(500).json({ error: '备份打包失败' });
    }
    res.download(tmpFile, archiveName, () => {
      try { fs.unlinkSync(tmpFile); } catch {}
    });
  } catch (e) {
    console.error('backup download failed:', e.message);
    res.status(500).json({ error: '下载备份失败' });
  }
}

// Short-lived download token: a normal <a> click can download directly,
// avoiding a 100MB blob held in browser memory.
app.get('/api/admin/backups/:name/download-token', authMiddleware, (req, res) => {
  if (!resolveBackupPath(req.params.name)) return res.status(400).json({ error: '无效的备份名称' });
  const downloadToken = jwt.sign(
    { purpose: 'backup-download', backup: req.params.name },
    JWT_SECRET,
    { expiresIn: '2m' }
  );
  res.json({ token: downloadToken, name: req.params.name });
});

app.get('/api/admin/backups/:name/download', (req, res, next) => {
  if (!req.query.token) return authMiddleware(req, res, () => sendBackupDownload(req, res));
  try {
    const decoded = jwt.verify(String(req.query.token), JWT_SECRET);
    if (decoded.purpose !== 'backup-download' || decoded.backup !== req.params.name) {
      return res.status(403).json({ error: '下载令牌无效' });
    }
    sendBackupDownload(req, res);
  } catch {
    res.status(401).json({ error: '下载令牌已过期' });
  }
});

app.post('/api/admin/backups/:name/restore', authMiddleware, async (req, res) => {
  const src = resolveBackupPath(req.params.name);
  if (!src) return res.status(400).json({ error: '无效的备份名称' });
  const restart = req.body?.restart === true || req.body?.restart === 'true';
  const dataSrc = backupDataRoot(src);
  const uploadsSrc = backupUploadsRoot(src);
  if (!fs.existsSync(dataSrc) || !fs.readdirSync(dataSrc).some(f => f.endsWith('.json'))) {
    return res.status(400).json({ error: '备份缺少有效的 data 文件' });
  }
  try {
    const preName = `data.bak.pre-restore-${makeBackupStamp()}`;
    const prePath = path.join(__dirname, preName);
    copyDataDir(dataDirPath(), prePath);
    let preUploadsName = '';
    if (uploadsSrc) {
      preUploadsName = `uploads.bak.pre-restore-${makeBackupStamp()}`;
      copyDataDir(uploadsDirPath(), path.join(__dirname, preUploadsName));
    }
    // Restore into new directories first, then swap.
    fs.rmSync(dataDirPath(), { recursive: true, force: true });
    copyDataDir(dataSrc, dataDirPath());
    if (uploadsSrc) {
      fs.rmSync(uploadsDirPath(), { recursive: true, force: true });
      copyDataDir(uploadsSrc, uploadsDirPath());
    }
    clearApiCache();
    circlesAuthCache = { data: null, ts: 0 };
    try { likesCache = readJSON('likes.json'); wantsCache = readJSON('wants.json'); followsCache = readJSON('follows.json'); } catch {}
    logEdit('管理员', '恢复数据备份', req.params.name, `自动备份: ${preName}${preUploadsName ? ' / ' + preUploadsName : ''}${restart ? ' · 恢复并重启' : ''}`);
    res.json({
      success: true,
      preBackup: preName,
      preUploadsBackup: preUploadsName,
      includesUploads: !!uploadsSrc,
      restart,
      message: restart ? '已恢复（含图片），服务即将重启' : '已恢复数据与图片；建议手动重启服务（pm2 restart f7goods）'
    });
    if (restart) scheduleServiceRestart();
  } catch (e) {
    console.error('backup restore failed:', e.message);
    res.status(500).json({ error: '恢复失败: ' + e.message });
  }
});

app.delete('/api/admin/backups/:name', authMiddleware, async (req, res) => {
  const src = resolveBackupPath(req.params.name);
  if (!src) return res.status(400).json({ error: '无效的备份名称' });
  try {
    fs.rmSync(src, { recursive: true, force: true });
    logEdit('管理员', '删除数据备份', req.params.name, '');
    res.json({ success: true });
  } catch (e) {
    console.error('backup delete failed:', e.message);
    res.status(500).json({ error: '删除备份失败' });
  }
});


// Author upload watermark builders
function buildUploadWatermarkSvg(width, height, authorName, style) {
  const fontSize = Math.max(12, Math.round(width / 20));
  const smallFontSize = Math.max(9, Math.round(width / 40));
  const padding = Math.max(6, Math.round(width / 50));
  const strokeW = Math.max(2, Math.round(fontSize / 8));
  const strokeWSmall = Math.max(1.5, Math.round(smallFontSize / 7));
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const name = esc('@' + authorName);
  const site = 'f7goods.com';
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);
  const brX = width - padding;
  const brY = height - padding;
  const tlX = padding;
  const tlY = padding + smallFontSize;
  const solidCenter = '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="middle" font-size="' + fontSize + '" font-family="sans-serif" fill="rgba(255,255,255,1)">' + name + '</text>';
  const solidCornerName = '<text x="' + brX + '" y="' + brY + '" text-anchor="end" dominant-baseline="auto" font-size="' + smallFontSize + '" font-family="sans-serif" fill="rgba(255,255,255,1)">' + name + '</text>';
  const solidSite = '<text x="' + tlX + '" y="' + tlY + '" text-anchor="start" dominant-baseline="auto" font-size="' + smallFontSize + '" font-family="sans-serif" fill="rgba(255,255,255,1)">' + site + '</text>';
  function strokeLayer(text, attrs, sw) {
    return '<text ' + attrs + ' style="fill:none;stroke:rgba(0,0,0,0.45);stroke-width:' + sw + '">' + text + '</text>'
      + '<text ' + attrs + ' style="fill:rgba(255,255,255,0.72)">' + text + '</text>';
  }
  const outlineCenterAttrs = 'x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="middle" font-size="' + fontSize + '" font-family="sans-serif"';
  const outlineCornerNameAttrs = 'x="' + brX + '" y="' + brY + '" text-anchor="end" dominant-baseline="auto" font-size="' + smallFontSize + '" font-family="sans-serif"';
  const outlineSiteAttrs = 'x="' + tlX + '" y="' + tlY + '" text-anchor="start" dominant-baseline="auto" font-size="' + smallFontSize + '" font-family="sans-serif"';
  let layers = '';
  if (style === 'half') {
    layers = strokeLayer(name, outlineCornerNameAttrs, strokeWSmall) +
      strokeLayer(site, outlineSiteAttrs, Math.max(1.2, strokeWSmall * 0.8));
  } else if (style === 'full') {
    layers = strokeLayer(name, outlineCenterAttrs, strokeW) +
      strokeLayer(name, outlineCornerNameAttrs, strokeWSmall) +
      strokeLayer(site, outlineSiteAttrs, Math.max(1.2, strokeWSmall * 0.8));
  } else {
    layers = solidCenter + solidCornerName + solidSite;
  }
  return '<svg width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg">' + layers + '</svg>';
}

// Author upload
app.post('/api/author/upload', authorAuthMiddleware, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择文件' });
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  const authorName = circle?.name || '未知作者';

  const filePath = req.file.path;
  const filename = req.file.filename;
  const ext = path.extname(filename).toLowerCase();
  const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);

  try {
    if (sharp && isImage) {
      // Watermark
      if (req.body.addWatermark === 'true' && ext !== '.gif') {
        try {
          const image = sharp(filePath);
          const metadata = await image.metadata();
          const { width, height } = metadata;
          if (width && height) {
            let wmStyle = req.body.watermarkStyle;
            if (Array.isArray(wmStyle)) wmStyle = wmStyle[wmStyle.length - 1];
            const style = ['light', 'half', 'full'].includes(String(wmStyle))
              ? String(wmStyle)
              : 'light';
            const svgWatermark = buildUploadWatermarkSvg(width, height, authorName, style);
            await image.composite([{ input: Buffer.from(svgWatermark) }]).toFile(filePath + '.tmp');
            fs.renameSync(filePath + '.tmp', filePath);
          }
        } catch (e) {
          console.error('Watermark failed:', e.message);
        }
      }

      // Compress if large — keep original format (author uploads; admin uploads stay uncompressed)
      const stats = fs.statSync(filePath);
      const COMPRESS_MIN = 400 * 1024;
      if (stats.size > COMPRESS_MIN && ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
        try {
          const tmp = filePath + '.tmp';
          const targetMax = 400 * 1024;
          let wrote = false;
          if (ext === '.png') {
            await sharp(filePath).png({ compressionLevel: 9, palette: stats.size > 900 * 1024 }).toFile(tmp);
            wrote = true;
          } else if (ext === '.webp') {
            await sharp(filePath).webp({ quality: 82 }).toFile(tmp);
            wrote = true;
          } else {
            let quality = 85;
            while (quality >= 55) {
              await sharp(filePath).jpeg({ quality, mozjpeg: true }).toFile(tmp);
              const resultSize = fs.existsSync(tmp) ? fs.statSync(tmp).size : Infinity;
              if (resultSize <= targetMax || resultSize < stats.size * 0.9) {
                wrote = resultSize < stats.size;
                break;
              }
              try { fs.unlinkSync(tmp); } catch {}
              quality -= 5;
            }
          }
          if (wrote && fs.existsSync(tmp)) {
            const newSize = fs.statSync(tmp).size;
            if (newSize < stats.size) fs.renameSync(tmp, filePath);
            else try { fs.unlinkSync(tmp); } catch {}
          } else {
            try { fs.unlinkSync(tmp); } catch {}
          }
        } catch (e) {
          console.error('Compression failed:', e.message);
        }
      }
    }

    const url = await publishUploadedImage(filePath);
    const publishedName = path.basename(url);
    await saveUploadMeta(publishedName, authorName);
    logEdit(authorName, '上传图片', publishedName, '', url);
    res.json({ url });
  } catch (e) {
    console.error('author upload failed:', e.message);
    fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: '上传失败' });
  }
});
// List all uploaded images
app.get('/api/admin/images', authMiddleware, (req, res) => {
  const uploadsDir = path.join(__dirname, 'uploads');
  let meta = {};
  try { meta = readJSON('uploads-meta.json'); } catch {}
  try {
    const usage = collectUploadUsageMap();
    const files = fs.readdirSync(uploadsDir)
      .filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f))
      .map(f => ({
        name: f,
        url: '/uploads/' + f,
        size: fs.statSync(path.join(uploadsDir, f)).size,
        time: fs.statSync(path.join(uploadsDir, f)).mtime,
        uploader: meta[f]?.uploader || '未知',
        uploadedAt: meta[f]?.uploadedAt || null,
        usedBy: usage.get(f) || []
      }))
      .sort((a, b) => b.time - a.time);
    res.json(files);
  } catch (e) {
    res.json([]);
  }
});

// Delete an uploaded image
app.delete('/api/admin/images/:filename', authMiddleware, async (req, res) => {
  const filename = path.basename(req.params.filename); // Prevent path traversal
  try {
    const refs = collectAllUploadRefs();
    if (refs.has(filename) || isUploadVariantUsed(filename, refs)) {
      return res.status(409).json({ error: '图片仍在使用中，请先从内容中移除' });
    }
    const item = trashUpload(filename, '管理员');
    const index = readTrashIndex();
    index.push({ ...item, trashedAt: new Date().toISOString() });
    await writeTrashIndex(index);
    try {
      const meta = readJSON('uploads-meta.json');
      delete meta[filename];
      await writeJSON('uploads-meta.json', meta);
    } catch {}
    logEdit('管理员', '删除图片（回收站）', filename, '');
    clearEditLogImageUrl('/uploads/' + filename);
    res.json({ success: true, trashed: true });
  } catch (e) {
    res.status(500).json({ error: '删除失败: ' + e.message });
  }
});

// Preview unused images (GET - no deletion)
app.get('/api/admin/images/unused', authMiddleware, (req, res) => {
  try {
    const refs = collectAllUploadRefs();
    const files = listUploadFiles();
    const unused = files.filter(f => !refs.has(f) && !isUploadVariantUsed(f, refs)).map(f => ({
      name: f,
      url: '/uploads/' + f,
      size: (() => { try { return fs.statSync(path.join(UPLOADS_DIR, f)).size; } catch { return 0; } })()
    }));
    res.json({ total: files.length, unused, count: unused.length, referenced: refs.size, trashCount: readTrashIndex().length });
  } catch (e) {
    res.status(500).json({ error: '查询失败: ' + e.message });
  }
});

// Move unused images to trash. Never unlink directly.
app.post('/api/admin/images/cleanup', authMiddleware, async (req, res) => {
  try {
    const refs = collectAllUploadRefs();
    const files = listUploadFiles();
    const unused = files.filter(f => !refs.has(f) && !isUploadVariantUsed(f, refs));
    const trashed = [];
    for (const f of unused) {
      try {
        const item = trashUpload(f, '管理员');
        trashed.push(item);
      } catch (e) {
        console.error('[image-cleanup]', f, e.message);
      }
    }
    if (trashed.length) {
      const index = readTrashIndex();
      const now = new Date().toISOString();
      trashed.forEach(t => index.push({ ...t, trashedAt: now }));
      await writeTrashIndex(index);
      logEdit('管理员', '清理未使用图片', `移动到回收站 ${trashed.length} 张`, '');
    }
    res.json({ success: true, total: files.length, trashed: trashed.length, kept: files.length - trashed.length });
  } catch (e) {
    res.status(500).json({ error: '清理失败: ' + e.message });
  }
});

// Trash listing / restore / permanent delete
app.get('/api/admin/images/trash', authMiddleware, (req, res) => {
  res.json({ items: readTrashIndex() });
});

app.post('/api/admin/images/trash/:name/restore', authMiddleware, async (req, res) => {
  const name = path.basename(String(req.params.name || ''));
  const index = readTrashIndex();
  const item = index.find(x => x.stored === name);
  if (!item) return res.status(404).json({ error: '回收站记录不存在' });
  const src = path.join(UPLOADS_TRASH_DIR, item.stored);
  if (!fs.existsSync(src)) return res.status(404).json({ error: '回收站文件不存在' });
  const dest = path.join(UPLOADS_DIR, item.original);
  if (fs.existsSync(dest)) return res.status(409).json({ error: '同名文件已存在，无法恢复' });
  fs.renameSync(src, dest);
  await writeTrashIndex(index.filter(x => x.stored !== name));
  logEdit('管理员', '恢复图片', item.original, '');
  res.json({ success: true, name: item.original });
});

app.delete('/api/admin/images/trash/:name', authMiddleware, async (req, res) => {
  const name = path.basename(String(req.params.name || ''));
  const index = readTrashIndex();
  const item = index.find(x => x.stored === name);
  if (!item) return res.status(404).json({ error: '回收站记录不存在' });
  const file = path.join(UPLOADS_TRASH_DIR, item.stored);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  await writeTrashIndex(index.filter(x => x.stored !== name));
  logEdit('管理员', '彻底删除图片', item.original, '');
  res.json({ success: true });
});

// --- Change password ---
app.post('/api/admin/change-password', authMiddleware, rateLimitMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !isPasswordAcceptable(newPassword)) {
    return res.status(400).json({ error: '新密码至少8个字符' });
  }
  const admin = readJSON('admin.json');
  if (!(await bcrypt.compare(oldPassword, admin.passwordHash || ''))) {
    return res.status(400).json({ error: '原密码错误' });
  }
  admin.passwordHash = await bcrypt.hash(newPassword, 10);
  await writeJSON('admin.json', admin);
  res.json({ success: true, message: '密码修改成功' });
});

// SPA fallback for admin
app.get('/admin/*', (req, res, next) => {
  if (!req.path.includes('.')) {
    return res.sendFile(path.join(__dirname, 'admin', 'index.html'));
  }
  next();
});

// Error handling
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: '上传失败: ' + err.message });
  }
  if (err) {
    console.error('Unhandled error:', err);
    return res.status(500).json({ error: '服务器内部错误' });
  }
  next();
});

// Central error handler: async route rejections land here.
app.use((err, req, res, next) => {
  console.error('[request error]', req.method, req.originalUrl, err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: '服务器内部错误' });
  }
  res.status(500).type('html').send('<!doctype html><meta charset="utf-8"><title>500</title><p>服务器内部错误，请稍后再试。</p>');
});

// 404 handler for HTML pages
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: '未找到' });
  }
  if (req.accepts('html')) {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  } else {
    res.status(404).json({ error: '未找到' });
  }
});

app.listen(PORT, () => {
  console.log(`\n  f7goods server running at http://localhost:${PORT}`);
  console.log(`  Admin panel: http://localhost:${PORT}/admin`);
  if (IS_PROD && !ADMIN_PASSWORD) {
    console.warn('WARNING: ADMIN_PASSWORD not set. Initial password setup requires env or init-admin.js.');
  }
  console.log('');
});
