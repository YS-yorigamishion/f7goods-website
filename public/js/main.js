// f7goods Main JS — Navbar, Footer, Utilities

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
      sorted.forEach(c => CATEGORIES[c.id] = c.name);
    }
    if (cats.workStatus) {
      const sorted = [...cats.workStatus].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      STATUS_ORDERED = sorted;
      STATUS_LABELS = {};
      sorted.forEach(c => STATUS_LABELS[c.id] = c.name);
    }
    if (cats.projects) {
      const sorted = [...cats.projects].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      PROJECT_CATEGORIES_ORDERED = sorted;
      PROJECT_CATEGORIES = {};
      sorted.forEach(c => PROJECT_CATEGORIES[c.id] = c.name);
    }
    if (cats.projectStatus) {
      const sorted = [...cats.projectStatus].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      PROJECT_STATUS_ORDERED = sorted;
      PROJECT_STATUS_LABELS = {};
      sorted.forEach(c => PROJECT_STATUS_LABELS[c.id] = c.name);
    }
    if (cats.eventStatus) {
      const sorted = [...cats.eventStatus].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      EVENT_STATUS_ORDERED = sorted;
      EVENT_STATUS_LABELS = {};
      sorted.forEach(c => EVENT_STATUS_LABELS[c.id] = c.name);
    }
    if (cats.circleCategories) {
      const sorted = [...cats.circleCategories].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      CIRCLE_CATEGORIES_ORDERED = sorted;
      CIRCLE_CATEGORIES = {};
      sorted.forEach(c => CIRCLE_CATEGORIES[c.id] = c.name);
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
  }
}

function getPageSettings(pageKey) {
  return siteSettings?.pages?.[pageKey] || {};
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
  return '<a href="/announcements.html" class="announcement-btn" title="查看公告">📢 公告</a>';
}

// Build navbar HTML
function buildNavbar(activePage) {
  const site = getSiteSettings();
  const logoText = site.logoText || 'F7';
  const brandName = site.brandName || 'f7goods';
  return `
    <div class="brand-bar"></div>
    <div class="nav-inner">
      <a href="/" class="logo">
        <div class="logo-icon">${logoText}</div>
        <span>${brandName}</span>
      </a>
      <button class="nav-toggle" onclick="document.querySelector('.nav-links').classList.toggle('open')" aria-label="菜单">
        <span></span><span></span><span></span>
      </button>
      <ul class="nav-links">
        <li><a href="/" class="${activePage === 'works' ? 'active' : ''}">周边概览</a></li>
        <li><a href="/events.html" class="${activePage === 'events' ? 'active' : ''}">近期活动</a></li>
        <li><a href="/circles.html" class="${activePage === 'circles' ? 'active' : ''}">同人作者</a></li>
        <li><a href="/projects.html" class="${activePage === 'projects' ? 'active' : ''}">同人企划</a></li>
        <li><a href="/contact.html" class="${activePage === 'contact' ? 'active' : ''}">关于我们</a></li>
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
        <p class="footer-desc">${description}</p>
      </div>
      <div class="footer-col">
        <h4>浏览</h4>
        <ul class="footer-links">
          <li><a href="/">周边概览</a></li>
          <li><a href="/events.html">近期活动</a></li>
          <li><a href="/circles.html">同人作者</a></li>
          <li><a href="/projects.html">同人企划</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>关于</h4>
        <ul class="footer-links">
          <li><a href="/contact.html">关于我们</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>关注</h4>
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
      <p>&copy; ${new Date().getFullYear()} ${brandName}. All rights reserved.</p>
    </div>
  `;
}

// Init page structure
async function initPage(activePage) {
  // Load settings first
  await loadSettingsFromAPI();
  applyFavicon();

  const navbar = document.getElementById('navbar');
  if (navbar) navbar.innerHTML = buildNavbar(activePage);

  const footer = document.getElementById('footer');
  if (footer) footer.innerHTML = buildFooter();

  // Navbar scroll effect
  window.addEventListener('scroll', () => {
    const nb = document.getElementById('navbar');
    if (nb) nb.classList.toggle('scrolled', window.scrollY > 10);
  });

  // Load categories from API (non-blocking)
  loadCategoriesFromAPI();
}

// Toast notification
function showToast(message, type = 'info') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast ${type}`;
  requestAnimationFrame(() => {
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  });
}

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Escape HTML entities
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Convert newlines to <br> for HTML display (escapes HTML first)
function nl2br(str) {
  if (!str) return '';
  return escapeHtml(str).replace(/\n/g, '<br>');
}

// Like functionality
function getLikedWorks() {
  try { return JSON.parse(localStorage.getItem('f7liked') || '[]'); } catch { return []; }
}

function isLiked(workId) {
  return getLikedWorks().includes(workId);
}

function renderLikeButton(workId, likes) {
  const liked = isLiked(workId);
  const count = likes || 0;
  return '<button class="like-btn ' + (liked ? 'liked' : '') + '" data-work-id="' + workId + '" onclick="event.preventDefault();event.stopPropagation();toggleLike(\'' + workId + '\',this)" title="' + (liked ? '取消点赞' : '点赞') + '"><span class="like-icon">' + (liked ? '❤️' : '🤍') + '</span><span class="like-count">' + (count > 0 ? count : '') + '</span></button>';
}

function updateLikeButtons(workId, liked, count) {
  document.querySelectorAll('.like-btn[data-work-id="' + workId + '"]').forEach(function(b) {
    b.disabled = false;
    if (liked) b.classList.add('liked'); else b.classList.remove('liked');
    b.querySelector('.like-icon').textContent = liked ? '❤️' : '🤍';
    b.querySelector('.like-count').textContent = count > 0 ? count : '';
    b.title = liked ? '取消点赞' : '点赞';
  });
}

async function toggleLike(workId, btn) {
  if (btn.disabled) return;
  btn.disabled = true;
  var liked = isLiked(workId);
  var endpoint = liked ? '/api/works/' + workId + '/unlike' : '/api/works/' + workId + '/like';
  try {
    var res = await fetch(endpoint, { method: 'POST' });
    var data = await res.json();

    var likedList = getLikedWorks();
    if (liked) {
      likedList = likedList.filter(function(id) { return id !== workId; });
    } else {
      if (likedList.indexOf(workId) === -1) likedList.push(workId);
    }
    localStorage.setItem('f7liked', JSON.stringify(likedList));

    if (typeof allWorks !== 'undefined') {
      var w = allWorks.find(function(w) { return w.id === workId; });
      if (w) w.likes = data.likes;
    }

    updateLikeButtons(workId, !liked, data.likes);
  } catch (e) {
    console.error('Like failed:', e);
    btn.disabled = false;
  }
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

    document.addEventListener('keydown', lightboxKeyHandler);
  }

  updateLightbox();
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function closeLightbox() {
  const overlay = document.getElementById('lightboxOverlay');
  if (overlay) overlay.classList.remove('open');
}

function navLightbox(dir) {
  lightboxIndex = (lightboxIndex + dir + lightboxImages.length) % lightboxImages.length;
  updateLightbox();
}

function updateLightbox() {
  const overlay = document.getElementById('lightboxOverlay');
  if (!overlay) return;
  overlay.querySelector('img').src = lightboxImages[lightboxIndex];
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
