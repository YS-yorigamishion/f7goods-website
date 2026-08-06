// f7goods Main JS — Navbar, Footer, Utilities

// ===== i18n System =====
let _lang = localStorage.getItem('f7lang') || 'zh';
let _i18n = {};

async function loadLang(lang) {
  try {
    const res = await fetch('/lang/' + lang + '.json');
    _i18n = await res.json();
    _lang = lang;
    localStorage.setItem('f7lang', lang);
    // Reload categories with new language
    await loadCategoriesFromAPI();
    // Re-apply page settings with new language
    const pageKey = document.getElementById('navbar')?.dataset?.activePage;
    if (pageKey) {
      const ps = getPageSettings(pageKey);
      if (ps.heroTitle) { const el = document.getElementById('heroTitle'); if (el) el.textContent = ps.heroTitle; }
      if (ps.heroSubtitle) { const el = document.getElementById('heroSubtitle'); if (el) el.textContent = ps.heroSubtitle; }
      if (ps.pageTitle) { const el = document.getElementById('pageTitle'); if (el) el.textContent = ps.pageTitle; }
      if (ps.pageSubtitle) { const el = document.getElementById('pageSubtitle'); if (el) el.textContent = ps.pageSubtitle; }
    }
    // Re-render navbar and footer
    const navbar = document.getElementById('navbar');
    if (navbar) navbar.innerHTML = buildNavbar(navbar.dataset.activePage);
    const footer = document.getElementById('footer');
    if (footer) footer.innerHTML = buildFooter();
    // Rebuild page-specific filter buttons if they exist
    if (typeof buildFilterButtons === 'function') buildFilterButtons();
    if (typeof buildProjectFilterButtons === 'function') buildProjectFilterButtons();
    if (typeof buildUpdateFilterButtons === 'function') buildUpdateFilterButtons();
    applyTranslations();
    updateLangButtons();
  } catch (e) {
    console.error('Failed to load language:', lang, e);
  }
}

function t(key) {
  const keys = key.split('.');
  let val = _i18n;
  for (const k of keys) {
    if (val && typeof val === 'object') val = val[k];
    else return key;
  }
  return val || key;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = t(key);
    if (text !== key) {
      if (el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'radio') {
        el.placeholder = text;
      } else {
        el.textContent = text;
      }
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const text = t(key);
    if (text !== key) el.placeholder = text;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const text = t(key);
    if (text !== key) el.title = text;
  });
}

function updateLangButtons() {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === _lang);
  });
}

function getLangName(code) {
  const names = { zh: '中文', en: 'EN', ja: '日本語', ko: '한국어' };
  return names[code] || code;
}

// Category labels (defaults, will be overridden by API)
let CATEGORIES = {
  figure: '手办/模型',
  goods: '周边杂货',
  doujin: '同人志',
  cd: '音乐CD',
  apparel: '服饰',
  other: '其他'
};
let CATEGORIES_ORDERED = [
  { id: 'figure', name: '手办/模型' },
  { id: 'goods', name: '周边杂货' },
  { id: 'doujin', name: '同人志' },
  { id: 'cd', name: '音乐CD' },
  { id: 'apparel', name: '服饰' },
  { id: 'other', name: '其他' }
];

let STATUS_LABELS = {
  on_sale: '发售中',
  pre_order: '预约中',
  sold_out: '已售罄',
  coming_soon: '即将发售'
};
let STATUS_ORDERED = [
  { id: 'on_sale', name: '发售中' },
  { id: 'pre_order', name: '预约中' },
  { id: 'sold_out', name: '已售罄' },
  { id: 'coming_soon', name: '即将发售' }
];

let PROJECT_STATUS_LABELS = {
  recruiting: '招募中',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消'
};
let PROJECT_STATUS_ORDERED = [
  { id: 'recruiting', name: '招募中' },
  { id: 'in_progress', name: '进行中' },
  { id: 'completed', name: '已完成' },
  { id: 'cancelled', name: '已取消' }
];

let PROJECT_CATEGORIES = {
  game: '游戏',
  music: '音乐',
  art: '画集',
  event: '活动',
  other: '其他'
};
let PROJECT_CATEGORIES_ORDERED = [
  { id: 'game', name: '游戏' },
  { id: 'music', name: '音乐' },
  { id: 'art', name: '画集' },
  { id: 'event', name: '活动' },
  { id: 'other', name: '其他' }
];

let EVENT_STATUS_LABELS = {};
let EVENT_STATUS_ORDERED = [];

let CIRCLE_CATEGORIES = {};
let CIRCLE_CATEGORIES_ORDERED = [];

let UPDATE_CATEGORIES = {};
let UPDATE_CATEGORIES_ORDERED = [];
let UPDATE_STATUS_LABELS = {};
let UPDATE_STATUS_ORDERED = [];

function tCat(cat) {
  if (_lang === 'zh') return cat.name;
  const suffix = _lang.charAt(0).toUpperCase() + _lang.slice(1);
  return cat['name' + suffix] || cat.name;
}

// Load categories from API
async function loadCategoriesFromAPI() {
  try {
    const res = await fetch('/api/categories');
    if (!res.ok) return;
    const cats = await res.json();
    if (cats.works) {
      const sorted = [...cats.works].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      CATEGORIES_ORDERED = sorted;
      CATEGORIES = {};
      sorted.forEach(c => CATEGORIES[c.id] = tCat(c));
    }
    if (cats.workStatus) {
      const sorted = [...cats.workStatus].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      STATUS_ORDERED = sorted;
      STATUS_LABELS = {};
      sorted.forEach(c => STATUS_LABELS[c.id] = tCat(c));
    }
    if (cats.projects) {
      const sorted = [...cats.projects].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      PROJECT_CATEGORIES_ORDERED = sorted;
      PROJECT_CATEGORIES = {};
      sorted.forEach(c => PROJECT_CATEGORIES[c.id] = tCat(c));
    }
    if (cats.projectStatus) {
      const sorted = [...cats.projectStatus].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      PROJECT_STATUS_ORDERED = sorted;
      PROJECT_STATUS_LABELS = {};
      sorted.forEach(c => PROJECT_STATUS_LABELS[c.id] = tCat(c));
    }
    if (cats.eventStatus) {
      const sorted = [...cats.eventStatus].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      EVENT_STATUS_ORDERED = sorted;
      EVENT_STATUS_LABELS = {};
      sorted.forEach(c => EVENT_STATUS_LABELS[c.id] = tCat(c));
    }
    if (cats.circleCategories) {
      const sorted = [...cats.circleCategories].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      CIRCLE_CATEGORIES_ORDERED = sorted;
      CIRCLE_CATEGORIES = {};
      sorted.forEach(c => CIRCLE_CATEGORIES[c.id] = tCat(c));
    }
    if (cats.updateCategories) {
      const sorted = [...cats.updateCategories].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      UPDATE_CATEGORIES_ORDERED = sorted;
      UPDATE_CATEGORIES = {};
      sorted.forEach(c => UPDATE_CATEGORIES[c.id] = tCat(c));
    }
    if (cats.updateStatus) {
      const sorted = [...cats.updateStatus].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      UPDATE_STATUS_ORDERED = sorted;
      UPDATE_STATUS_LABELS = {};
      sorted.forEach(c => UPDATE_STATUS_LABELS[c.id] = tCat(c));
    }
  } catch (e) {
    // Use defaults if API fails
  }
}

// Load settings from API
let siteSettings = null;
async function loadSettingsFromAPI() {
  try {
    const res = await fetch('/api/settings?t=' + Date.now());
    if (!res.ok) return;
    siteSettings = await res.json();
    if (!siteSettings.pages) siteSettings.pages = {};
  } catch (e) {
    // Use defaults
  } finally {
    // Ensure settings-pending elements are always revealed
    setTimeout(() => {
      document.querySelectorAll('.settings-pending').forEach(el => el.classList.remove('settings-pending'));
    }, 5000);
  }
}

function getPageSettings(pageKey) {
  const ps = siteSettings?.pages?.[pageKey] || {};
  if (_lang === 'zh') return ps;
  const suffix = _lang.charAt(0).toUpperCase() + _lang.slice(1); // En, Ja, Ko
  const result = {};
  for (const [key, val] of Object.entries(ps)) {
    if (key.endsWith('Input') || key === 'heroBg' || key === 'contactLinks') {
      result[key] = val; // Non-text fields pass through
    } else {
      const langKey = key + suffix;
      result[key] = (ps[langKey] !== undefined && ps[langKey] !== '') ? ps[langKey] : val;
    }
  }
  return result;
}

function getSiteSettings() {
  return siteSettings?.site || {};
}

// Apply hero background from page settings
function applyHeroBg(pageKey) {
  const ps = getPageSettings(pageKey);
  const hero = document.querySelector('.hero');
  if (hero && ps.heroBg) {
    hero.style.background = `linear-gradient(rgba(26,26,46,0.55), rgba(26,26,46,0.7)), url('${ps.heroBg}') center/cover no-repeat`;
  }
}

// Apply favicon from settings
function applyFavicon() {
  const site = getSiteSettings();
  if (site.favicon) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = site.favicon;
  }
}

// Render announcement button for page headers
function renderAnnouncementButton() {
  return '<a href="/announcements.html" class="announcement-btn" title="' + t('common.viewAnnouncement') + '">📢 ' + t('common.announcement') + '</a>';
}

// Popup announcement system
function getSeenPopups() {
  try { return JSON.parse(localStorage.getItem('f7seenPopups') || '[]'); } catch { return []; }
}

async function checkPopupAnnouncements() {
  try {
    const res = await fetch('/api/announcements/popup');
    const announcements = await res.json();
    if (!announcements || announcements.length === 0) return;
    const seen = getSeenPopups();
    const unseen = announcements.filter(a => !seen.includes(a.id));
    if (unseen.length === 0) return;
    showAnnouncementPopup(unseen[0]);
  } catch (e) {}
}

function showAnnouncementPopup(ann) {
  var overlay = document.createElement('div');
  overlay.id = 'annPopupOverlay';
  overlay.className = 'ann-popup-overlay';
  overlay.innerHTML = '<div class="ann-popup">' +
    '<button class="ann-popup-close" onclick="closeAnnouncementPopup(\'' + ann.id + '\')">&times;</button>' +
    '<h3 class="ann-popup-title">' + escapeHtml(ann.title) + '</h3>' +
    '<div class="ann-popup-date">' + formatDate(ann.publishDate) + '</div>' +
    '<div class="ann-popup-content">' + nl2br(ann.content) + '</div>' +
    '<button class="btn btn-primary ann-popup-btn" onclick="closeAnnouncementPopup(\'' + ann.id + '\')">' + t('common.gotIt') + '</button>' +
  '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeAnnouncementPopup(ann.id); });
  requestAnimationFrame(function() { overlay.classList.add('open'); });
}

function closeAnnouncementPopup(id) {
  var overlay = document.getElementById('annPopupOverlay');
  if (overlay) {
    overlay.classList.remove('open');
    setTimeout(function() { overlay.remove(); }, 200);
  }
  var seen = getSeenPopups();
  if (!seen.includes(id)) {
    seen.push(id);
    localStorage.setItem('f7seenPopups', JSON.stringify(seen));
  }
}

// Build navbar HTML
function buildNavbar(activePage) {
  const site = getSiteSettings();
  const logoText = site.logoText || '';
  const brandName = site.brandName || 'f7goods';
  const favicon = site.favicon;
  const logoContent = favicon
    ? `<img src="${favicon}" alt="${brandName}" style="width:32px;height:32px;border-radius:8px;object-fit:cover;">`
    : logoText
      ? `<div class="logo-icon">${logoText}</div>`
      : `<div class="logo-icon">F7</div>`;
  const langOptions = ['zh', 'ko', 'en', 'ja'].map(code =>
    `<button class="lang-btn ${_lang === code ? 'active' : ''}" data-lang="${code}" onclick="loadLang('${code}');document.querySelector('.lang-dropdown').classList.remove('open')">${getLangName(code)}</button>`
  ).join('');
  const currentLangName = getLangName(_lang);
  return `
    <div class="brand-bar"></div>
    <div class="nav-inner">
      <a href="/" class="logo" aria-label="${t('nav.home')}">
        ${logoContent}
        <span>${brandName}</span>
      </a>
      <div class="lang-switcher-nav">
        <button class="lang-current" onclick="this.nextElementSibling.classList.toggle('open')" aria-label="Language">
          🌐 ${currentLangName}
        </button>
        <div class="lang-dropdown">
          ${langOptions}
        </div>
      </div>
      <button class="nav-toggle" onclick="document.querySelector('.nav-links').classList.toggle('open')" aria-label="菜单" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <ul class="nav-links" role="menubar">
        <li><a href="/" class="${activePage === 'works' ? 'active' : ''}" onclick="document.querySelector('.nav-links').classList.remove('open')">${t('nav.works')}</a></li>
        <li><a href="/events.html" class="${activePage === 'events' ? 'active' : ''}" onclick="document.querySelector('.nav-links').classList.remove('open')">${t('nav.events')}</a></li>
        <li><a href="/circles.html" class="${activePage === 'circles' ? 'active' : ''}" onclick="document.querySelector('.nav-links').classList.remove('open')">${t('nav.circles')}</a></li>
        <li><a href="/projects.html" class="${activePage === 'projects' ? 'active' : ''}" onclick="document.querySelector('.nav-links').classList.remove('open')">${t('nav.projects')}</a></li>
        <li><a href="/updates.html" class="${activePage === 'updates' ? 'active' : ''}" onclick="document.querySelector('.nav-links').classList.remove('open')">${t('nav.updates')}</a></li>
        <li><a href="/contact.html" class="${activePage === 'contact' ? 'active' : ''}" onclick="document.querySelector('.nav-links').classList.remove('open')">${t('nav.contact')}</a></li>
      </ul>
    </div>
  `;
}

// Build footer HTML
function buildFooter() {
  const site = getSiteSettings();
  const footer = siteSettings?.footer || {};
  const brandName = site.brandName || 'f7goods';
  const description = footer.description || '专注同人周边的展示与推荐平台，为创作者和爱好者搭建桥梁。';
  const socialLinks = footer.socialLinks || [
    { name: 'Twitter / X', url: '#', icon: '🐦' },
    { name: 'Weibo', url: '#', icon: '📱' }
  ];

  return `
    <div class="footer-inner">
      <div>
        <div class="footer-brand">${brandName}</div>
        <p class="footer-desc">${t('footer.aboutText')}</p>
      </div>
      <div class="footer-col">
        <h4>${t('common.browse')}</h4>
        <ul class="footer-links">
          <li><a href="/">${t('nav.works')}</a></li>
          <li><a href="/events.html">${t('nav.events')}</a></li>
          <li><a href="/circles.html">${t('nav.circles')}</a></li>
          <li><a href="/projects.html">${t('nav.projects')}</a></li>
          <li><a href="/updates.html">${t('nav.updates')}</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>${t('common.about')}</h4>
        <ul class="footer-links">
          <li><a href="/author.html">${t('common.authorLogin')}</a></li>
          <li><a href="/contact.html">${t('common.aboutUs')}</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>${t('common.follow')}</h4>
        <ul class="footer-links">
          ${socialLinks.map(link => {
            let url = link.url || '#';
            if (url && url !== '#' && !url.startsWith('http://') && !url.startsWith('https://')) {
              url = 'https://' + url;
            }
            return `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${link.icon || ''} ${link.name}</a></li>`;
          }).join('')}
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; ${new Date().getFullYear()} ${brandName}. ${t('common.copyright')}</p>
    </div>
  `;
}

// Theme toggle (dark mode)
// Init page structure
async function initPage(activePage, itemId) {

  // Load language first
  await loadLang(_lang);

  // Load settings
  await loadSettingsFromAPI();
  applyFavicon();

  const navbar = document.getElementById('navbar');
  if (navbar) {
    navbar.dataset.activePage = activePage;
    navbar.innerHTML = buildNavbar(activePage);
    // Close lang dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const dropdown = document.querySelector('.lang-dropdown');
      const switcher = document.querySelector('.lang-switcher-nav');
      if (dropdown && switcher && !switcher.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });
  }

  const footer = document.getElementById('footer');
  if (footer) footer.innerHTML = buildFooter();

  initCardAccessibility();

  // Navbar scroll effect + back to top button
  window.addEventListener('scroll', () => {
    const nb = document.getElementById('navbar');
    if (nb) nb.classList.toggle('scrolled', window.scrollY > 10);
    const btn = document.getElementById('backToTop');
    if (btn) btn.classList.toggle('show', window.scrollY > 300);
  });

  // Load categories from API (non-blocking)
  loadCategoriesFromAPI();

  // Page view tracking (fire and forget)
  const pvBody = { page: activePage };
  if (itemId) pvBody.itemId = itemId;
  fetch('/api/pageview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pvBody)
  }).catch(() => {});

  // Check for popup announcements
  checkPopupAnnouncements();
}

// Back to top
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Custom confirm dialog
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const { title = t('common.confirm'), confirmText = t('common.ok'), cancelText = t('common.cancel'), danger = false } = options;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.innerHTML = `<div style="background:var(--card-bg);border-radius:var(--radius);padding:1.5rem;max-width:400px;width:100%;box-shadow:var(--shadow-lg);">
      <h3 style="margin:0 0 1rem;font-size:1.1rem;">${title}</h3>
      <p style="color:var(--ink);margin:0 0 1.5rem;line-height:1.6;white-space:pre-wrap;">${message}</p>
      <div style="display:flex;gap:0.8rem;justify-content:flex-end;">
        <button class="btn" id="confirmCancel" style="background:var(--border);color:var(--ink);">${cancelText}</button>
        <button class="btn" id="confirmOk" style="background:${danger ? 'var(--accent)' : 'var(--accent-alt)'};color:white;">${confirmText}</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirmCancel').onclick = () => { overlay.remove(); resolve(false); };
    overlay.querySelector('#confirmOk').onclick = () => { overlay.remove(); resolve(true); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
  });
}

// Toast notification
function showToast(message, type = 'info', duration = 3000) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast ${type}`;
  requestAnimationFrame(() => {
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
  });
}

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(({zh:'zh-CN',en:'en-US',ja:'ja-JP',ko:'ko-KR'}[_lang]||'zh-CN'), { year: 'numeric', month: 'long', day: 'numeric' });
}

// Escape HTML entities
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Make cards keyboard-accessible
function initCardAccessibility() {
  document.querySelectorAll('.card[onclick]').forEach(card => {
    if (!card.hasAttribute('tabindex')) {
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'link');
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    }
  });
}

// Convert newlines to <br> for HTML display (escapes HTML first)
function nl2br(str) {
  if (!str) return '';
  return escapeHtml(str).replace(/\n/g, '<br>');
}

// Share functionality
async function sharePage(title, url) {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (e) {}
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast(t('common.copied'), 'success');
  } catch (e) {
    prompt('复制此链接:', url);
  }
}

function renderShareButton(title, url) {
  const safeTitle = encodeURIComponent(title);
  const safeUrl = encodeURIComponent(url);
  return `<button class="want-btn" style="font-size:0.85rem;padding:0.45rem 1.2rem;" data-share-title="${safeTitle}" data-share-url="${safeUrl}" onclick="sharePage(decodeURIComponent(this.dataset.shareTitle), decodeURIComponent(this.dataset.shareUrl))">${t('common.share')}</button>`;
}

// Like functionality
function getUid() {
  var uid = localStorage.getItem('f7uid');
  if (!uid) {
    uid = Date.now().toString(36) + Math.random().toString(36).substr(2, 12);
    localStorage.setItem('f7uid', uid);
  }
  return uid;
}

function getLikedWorks() {
  try { return JSON.parse(localStorage.getItem('f7liked') || '[]'); } catch { return []; }
}

function isLiked(workId) {
  return getLikedWorks().includes(workId);
}

function renderLikeButton(workId, likes) {
  const liked = isLiked(workId);
  const count = likes || 0;
  return '<button class="like-btn ' + (liked ? 'liked' : '') + '" data-work-id="' + workId + '" onclick="event.preventDefault();event.stopPropagation();toggleLike(\'' + workId + '\',this)" title="' + (liked ? t('common.unlike') : t('common.like')) + '"><span class="like-icon">' + (liked ? '❤️' : '🤍') + '</span><span class="like-count">' + (count > 0 ? count : '') + '</span></button>';
}

function updateLikeButtons(workId, liked, count) {
  document.querySelectorAll('.like-btn[data-work-id="' + workId + '"]').forEach(function(b) {
    b.disabled = false;
    if (liked) b.classList.add('liked'); else b.classList.remove('liked');
    b.querySelector('.like-icon').textContent = liked ? '❤️' : '🤍';
    b.querySelector('.like-count').textContent = count > 0 ? count : '';
    b.title = liked ? t('common.unlike') : t('common.like');
  });
  // Also update want buttons if like count changed
  document.querySelectorAll('.want-btn[data-work-id="' + workId + '"]').forEach(function(b) {
    b.disabled = false;
  });
}

async function toggleLike(workId, btn) {
  if (btn.disabled) return;
  btn.disabled = true;
  var liked = isLiked(workId);
  var endpoint = liked ? '/api/works/' + workId + '/unlike' : '/api/works/' + workId + '/like';
  try {
    var res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    // Check HTTP status code
    if (!res.ok) {
      var errData = await res.json().catch(function() { return {}; });
      if (res.status === 429) {
        showToast(t('common.rateLimit'), 'warning');
      } else {
        showToast(errData.error || t('common.error'), 'error');
      }
      btn.disabled = false;
      return;
    }

    var data = await res.json();

    // Handle alreadyLiked response - sync localStorage
    if (data.alreadyLiked) {
      var likedList = getLikedWorks();
      if (likedList.indexOf(workId) === -1) {
        likedList.push(workId);
        localStorage.setItem('f7liked', JSON.stringify(likedList));
      }
      updateLikeButtons(workId, true, data.likes);
      // Update allWorks data
      if (typeof allWorks !== 'undefined') {
        var w = allWorks.find(function(w) { return w.id === workId; });
        if (w) w.likes = data.likes;
      }
      return;
    }

    var likedList = getLikedWorks();
    if (liked) {
      likedList = likedList.filter(function(id) { return id !== workId; });
    } else {
      if (likedList.indexOf(workId) === -1) likedList.push(workId);
    }
    localStorage.setItem('f7liked', JSON.stringify(likedList));

    // Update ALL buttons for this work (not just clicked one)
    var newLiked = !liked;
    updateLikeButtons(workId, newLiked, data.likes);

    // Update allWorks data
    if (typeof allWorks !== 'undefined') {
      var w = allWorks.find(function(w) { return w.id === workId; });
      if (w) w.likes = data.likes;
    }
  } catch (e) {
    console.error('Like failed:', e);
    btn.disabled = false;
    showToast(t('common.error'), 'error');
  }
}

// Want (我想要) functionality
function getWantedWorks() {
  try { return JSON.parse(localStorage.getItem('f7wanted') || '[]'); } catch { return []; }
}

function isWanted(workId) {
  return getWantedWorks().includes(workId);
}

function renderWantButton(workId, wants) {
  const wanted = isWanted(workId);
  const count = wants || 0;
  if (wanted) {
    return '<button class="want-btn want-btn--done" data-work-id="' + workId + '" onclick="event.preventDefault();event.stopPropagation();confirmUnwant(\'' + workId + '\',' + count + ')">' + t('common.cancel') + (count > 0 ? ' (' + count + ')' : '') + '</button>';
  }
  return '<button class="want-btn" data-work-id="' + workId + '" onclick="event.preventDefault();event.stopPropagation();openWantModal(\'' + workId + '\',' + count + ')">' + t('common.want') + (count > 0 ? ' (' + count + ')' : '') + '</button>';
}

function updateWantButtons(workId, wanted, count) {
  document.querySelectorAll('.want-btn[data-work-id="' + workId + '"]').forEach(function(b) {
    b.outerHTML = renderWantButton(workId, count);
  });
}

function openWantModal(workId, currentCount) {
  var overlay = document.getElementById('wantModalOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'wantModalOverlay';
    overlay.className = 'want-modal-overlay';
    overlay.innerHTML = '<div class="want-modal">' +
      '<button class="want-modal-close" onclick="closeWantModal()">&times;</button>' +
      '<div class="want-modal-body">' +
        '<h3 style="margin-bottom:1rem;font-size:1.1rem;">' + t('common.wantTitle') + '</h3>' +
        '<p style="color:var(--haze);font-size:0.85rem;line-height:1.8;margin-bottom:1rem;">' + t('common.wantDesc') + '</p>' +
        '<input type="text" class="form-input want-modal-input" id="wantModalInput" placeholder="' + t('common.wantConfirm') + '" autocomplete="off">' +
        '<div id="wantModalError" style="color:var(--accent);font-size:0.8rem;margin-top:0.4rem;display:none;"></div>' +
        '<button class="btn btn-primary want-modal-submit" id="wantModalSubmit" onclick="submitWant()">' + t('common.ok') + '</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeWantModal(); });
  }
  document.getElementById('wantModalInput').value = '';
  document.getElementById('wantModalError').style.display = 'none';
  document.getElementById('wantModalSubmit').disabled = false;
  document.getElementById('wantModalSubmit').textContent = t('common.ok');
  overlay.classList.add('open');
  overlay.dataset.workId = workId;
  overlay.dataset.currentCount = currentCount;
  setTimeout(function() { document.getElementById('wantModalInput').focus(); }, 100);
}

function closeWantModal() {
  var overlay = document.getElementById('wantModalOverlay');
  if (overlay) overlay.classList.remove('open');
}

async function submitWant() {
  var overlay = document.getElementById('wantModalOverlay');
  var workId = overlay.dataset.workId;
  var currentCount = parseInt(overlay.dataset.currentCount) || 0;
  var input = document.getElementById('wantModalInput');
  var errorEl = document.getElementById('wantModalError');
  var btn = document.getElementById('wantModalSubmit');

  if (input.value.trim() !== '我想要') {
    errorEl.textContent = t('common.wantConfirm');
    errorEl.style.display = 'block';
    input.focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = t('common.wanting');
  errorEl.style.display = 'none';

  try {
    var res = await fetch('/api/works/' + workId + '/want', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    // Check HTTP status code
    if (!res.ok) {
      var errData = await res.json().catch(function() { return {}; });
      if (res.status === 429) {
        errorEl.textContent = t('common.rateLimit');
      } else {
        errorEl.textContent = errData.error || t('common.failSubmit');
      }
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = t('common.ok');
      return;
    }

    var data = await res.json();

    var wantedList = getWantedWorks();
    if (wantedList.indexOf(workId) === -1) wantedList.push(workId);
    localStorage.setItem('f7wanted', JSON.stringify(wantedList));

    if (typeof allWorks !== 'undefined') {
      var w = allWorks.find(function(w) { return w.id === workId; });
      if (w) w.wants = data.wants;
    }

    updateWantButtons(workId, true, data.wants);
    closeWantModal();
    showToast(t('common.wantSuccess'), 'success');
  } catch (e) {
    console.error('Want failed:', e);
    btn.disabled = false;
    btn.textContent = t('common.ok');
    errorEl.textContent = t('common.failSubmit');
    errorEl.style.display = 'block';
  }
}

function confirmUnwant(workId, currentCount) {
  if (!confirm(t('common.unwantConfirm'))) return;
  doUnwant(workId, currentCount);
}

async function doUnwant(workId, currentCount) {
  try {
    var res = await fetch('/api/works/' + workId + '/unwant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    // Check HTTP status code
    if (!res.ok) {
      var errData = await res.json().catch(function() { return {}; });
      if (res.status === 429) {
        showToast(t('common.rateLimit'), 'warning');
      } else {
        showToast(errData.error || t('common.cancelFail'), 'error');
      }
      return;
    }

    var data = await res.json();

    var wantedList = getWantedWorks();
    wantedList = wantedList.filter(function(id) { return id !== workId; });
    localStorage.setItem('f7wanted', JSON.stringify(wantedList));

    if (typeof allWorks !== 'undefined') {
      var w = allWorks.find(function(w) { return w.id === workId; });
      if (w) w.wants = data.wants;
    }

    updateWantButtons(workId, false, data.wants);
  } catch (e) {
    console.error('Unwant failed:', e);
    showToast(t('common.cancelFail'), 'error');
  }
}

// ===== Follow System (关注) =====
function getFollowedCircles() {
  try { return JSON.parse(localStorage.getItem('f7followed') || '[]'); } catch { return []; }
}

function isFollowing(circleId) {
  return getFollowedCircles().includes(circleId);
}

function renderFollowButton(circleId, follows) {
  var following = isFollowing(circleId);
  if (following) {
    return '<button class="follow-btn follow-btn--done" data-circle-id="' + circleId + '" onclick="event.preventDefault();event.stopPropagation();toggleFollow(\'' + circleId + '\',this)">' + t('common.followed') + '</button>';
  }
  return '<button class="follow-btn" data-circle-id="' + circleId + '" onclick="event.preventDefault();event.stopPropagation();toggleFollow(\'' + circleId + '\',this)">' + t('common.follow') + '</button>';
}

async function toggleFollow(circleId, btn) {
  if (btn.disabled) return;
  btn.disabled = true;
  var following = isFollowing(circleId);
  var endpoint = following ? '/api/circles/' + circleId + '/unfollow' : '/api/circles/' + circleId + '/follow';
  try {
    var res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (!res.ok) {
      var errData = await res.json().catch(function() { return {}; });
      if (res.status === 429) {
        showToast(t('common.rateLimit'), 'warning');
      } else {
        showToast(errData.error || t('common.error'), 'error');
      }
      btn.disabled = false;
      return;
    }

    var data = await res.json();

    if (data.alreadyFollowing) {
      var followedList = getFollowedCircles();
      if (followedList.indexOf(circleId) === -1) {
        followedList.push(circleId);
        localStorage.setItem('f7followed', JSON.stringify(followedList));
      }
      updateFollowButtons(circleId, true, data.follows);
      return;
    }

    var followedList = getFollowedCircles();
    if (following) {
      followedList = followedList.filter(function(id) { return id !== circleId; });
    } else {
      if (followedList.indexOf(circleId) === -1) followedList.push(circleId);
    }
    localStorage.setItem('f7followed', JSON.stringify(followedList));

    var newFollowing = !following;
    updateFollowButtons(circleId, newFollowing, data.follows);
  } catch (e) {
    console.error('Follow failed:', e);
    btn.disabled = false;
    showToast(t('common.error'), 'error');
  }
}

function updateFollowButtons(circleId, following, count) {
  document.querySelectorAll('.follow-btn[data-circle-id="' + circleId + '"]').forEach(function(b) {
    b.disabled = false;
    if (following) {
      b.classList.add('follow-btn--done');
      b.textContent = t('common.followed');
    } else {
      b.classList.remove('follow-btn--done');
      b.textContent = t('common.follow');
    }
  });
}

// Debounce utility
function debounce(fn, delay = 300) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Lightbox
let lightboxImages = [];
let lightboxIndex = 0;
let lbZoom = { scale: 1, tx: 0, ty: 0, dragging: false, startX: 0, startY: 0, startTx: 0, startTy: 0 };

function openLightbox(images, startIndex = 0) {
  lightboxImages = images;
  lightboxIndex = startIndex;

  let overlay = document.getElementById('lightboxOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'lightboxOverlay';
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = `
      <button class="lightbox-close" onclick="closeLightbox()">&times;</button>
      <button class="lightbox-nav lightbox-prev" onclick="event.stopPropagation();navLightbox(-1)">&#8249;</button>
      <img src="" alt="">
      <button class="lightbox-nav lightbox-next" onclick="event.stopPropagation();navLightbox(1)">&#8250;</button>
      <div class="lightbox-counter"></div>
    `;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.tagName !== 'IMG') closeLightbox();
    });
    document.body.appendChild(overlay);

    const img = overlay.querySelector('img');

    img.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (lbZoom.scale > 1) {
        resetZoom(img);
      } else {
        lbZoom.scale = 2.5;
        lbZoom.tx = 0;
        lbZoom.ty = 0;
        applyZoom(img);
      }
    });

    // 滚轮缩放（百分比缩放，更平滑）
    img.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.95 : 1.05;
      lbZoom.scale = Math.max(0.5, Math.min(2.5, lbZoom.scale * factor));
      applyZoom(img);
    }, { passive: false });

    img.addEventListener('mousedown', (e) => {
      if (lbZoom.scale <= 1) return;
      e.preventDefault();
      lbZoom.dragging = true;
      lbZoom.startX = e.clientX;
      lbZoom.startY = e.clientY;
      lbZoom.startTx = lbZoom.tx;
      lbZoom.startTy = lbZoom.ty;
      img.classList.add('lightbox-dragging');
    });

    document.addEventListener('mousemove', (e) => {
      if (!lbZoom.dragging) return;
      lbZoom.tx = lbZoom.startTx + (e.clientX - lbZoom.startX);
      lbZoom.ty = lbZoom.startTy + (e.clientY - lbZoom.startY);
      applyZoom(img);
    });

    document.addEventListener('mouseup', () => {
      if (!lbZoom.dragging) return;
      lbZoom.dragging = false;
      img.classList.remove('lightbox-dragging');
    });

  }

  document.addEventListener('keydown', lightboxKeyHandler);
  updateLightbox();
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function applyZoom(img) {
  img.style.transform = `translate(${lbZoom.tx}px, ${lbZoom.ty}px) scale(${lbZoom.scale})`;
  img.classList.toggle('lightbox-zoomed', lbZoom.scale > 1);
}

function resetZoom(img) {
  lbZoom.scale = 1;
  lbZoom.tx = 0;
  lbZoom.ty = 0;
  img.classList.remove('lightbox-zoomed', 'lightbox-dragging');
  img.style.transform = '';
}

function closeLightbox() {
  const overlay = document.getElementById('lightboxOverlay');
  if (overlay) {
    resetZoom(overlay.querySelector('img'));
    overlay.classList.remove('open');
  }
  document.removeEventListener('keydown', lightboxKeyHandler);
}

function navLightbox(dir) {
  lightboxIndex = (lightboxIndex + dir + lightboxImages.length) % lightboxImages.length;
  updateLightbox();
}

function updateLightbox() {
  const overlay = document.getElementById('lightboxOverlay');
  if (!overlay) return;
  const img = overlay.querySelector('img');
  resetZoom(img);
  img.src = lightboxImages[lightboxIndex];
  const counter = overlay.querySelector('.lightbox-counter');
  const prev = overlay.querySelector('.lightbox-prev');
  const next = overlay.querySelector('.lightbox-next');
  if (lightboxImages.length > 1) {
    counter.textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
    prev.style.display = 'flex';
    next.style.display = 'flex';
  } else {
    counter.textContent = '';
    prev.style.display = 'none';
    next.style.display = 'none';
  }
}

function lightboxKeyHandler(e) {
  const overlay = document.getElementById('lightboxOverlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') navLightbox(-1);
  if (e.key === 'ArrowRight') navLightbox(1);
}
