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
  } finally {
    // Ensure settings-pending elements are always revealed
    setTimeout(() => {
      document.querySelectorAll('.settings-pending').forEach(el => el.classList.remove('settings-pending'));
    }, 5000);
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
    '<button class="btn btn-primary ann-popup-btn" onclick="closeAnnouncementPopup(\'' + ann.id + '\')">知道了</button>' +
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
        <li><a href="/updates.html" class="${activePage === 'updates' ? 'active' : ''}">同人动态</a></li>
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
          <li><a href="/updates.html">同人动态</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>关于</h4>
        <ul class="footer-links">
          <li><a href="/author.html">作者登录</a></li>
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

// Theme toggle (dark mode)
// Init page structure
async function initPage(activePage, itemId) {

  // Load settings first
  await loadSettingsFromAPI();
  applyFavicon();

  const navbar = document.getElementById('navbar');
  if (navbar) {
    navbar.dataset.activePage = activePage;
    navbar.innerHTML = buildNavbar(activePage);
  }

  const footer = document.getElementById('footer');
  if (footer) footer.innerHTML = buildFooter();

  // Navbar scroll effect
  window.addEventListener('scroll', () => {
    const nb = document.getElementById('navbar');
    if (nb) nb.classList.toggle('scrolled', window.scrollY > 10);
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

// Toast notification
function showToast(message, type = 'info', duration = 3000) {
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
    setTimeout(() => toast.classList.remove('show'), duration);
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
    showToast('链接已复制到剪贴板', 'success');
  } catch (e) {
    prompt('复制此链接:', url);
  }
}

function renderShareButton(title, url) {
  const safeTitle = encodeURIComponent(title);
  const safeUrl = encodeURIComponent(url);
  return `<button class="want-btn" style="font-size:0.85rem;padding:0.45rem 1.2rem;" data-share-title="${safeTitle}" data-share-url="${safeUrl}" onclick="sharePage(decodeURIComponent(this.dataset.shareTitle), decodeURIComponent(this.dataset.shareUrl))">分享</button>`;
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
      body: JSON.stringify({ uid: getUid() })
    });

    // Check HTTP status code
    if (!res.ok) {
      var errData = await res.json().catch(function() { return {}; });
      if (res.status === 429) {
        showToast('操作过于频繁，请稍后再试', 'warning');
      } else {
        showToast(errData.error || '操作失败，请重试', 'error');
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
    showToast('操作失败，请重试', 'error');
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
    return '<button class="want-btn want-btn--done" data-work-id="' + workId + '" onclick="event.preventDefault();event.stopPropagation();confirmUnwant(\'' + workId + '\',' + count + ')">取消' + (count > 0 ? ' (' + count + ')' : '') + '</button>';
  }
  return '<button class="want-btn" data-work-id="' + workId + '" onclick="event.preventDefault();event.stopPropagation();openWantModal(\'' + workId + '\',' + count + ')">我想要' + (count > 0 ? ' (' + count + ')' : '') + '</button>';
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
        '<h3 style="margin-bottom:1rem;font-size:1.1rem;">我想要</h3>' +
        '<p style="color:var(--haze);font-size:0.85rem;line-height:1.8;margin-bottom:1rem;">本功能目前仅供作者确认周边购买意向人数，请勿将其视为购买订单。<br>如您确认购买意向，请在下方输入框输入"我想要"加入周边购买人数意向统计。</p>' +
        '<input type="text" class="form-input want-modal-input" id="wantModalInput" placeholder="请输入" autocomplete="off">' +
        '<div id="wantModalError" style="color:var(--accent);font-size:0.8rem;margin-top:0.4rem;display:none;"></div>' +
        '<button class="btn btn-primary want-modal-submit" id="wantModalSubmit" onclick="submitWant()">确认</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeWantModal(); });
  }
  document.getElementById('wantModalInput').value = '';
  document.getElementById('wantModalError').style.display = 'none';
  document.getElementById('wantModalSubmit').disabled = false;
  document.getElementById('wantModalSubmit').textContent = '确认';
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
    errorEl.textContent = '请输入"我想要"以确认意向';
    errorEl.style.display = 'block';
    input.focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = '提交中...';
  errorEl.style.display = 'none';

  try {
    var res = await fetch('/api/works/' + workId + '/want', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: getUid() })
    });

    // Check HTTP status code
    if (!res.ok) {
      var errData = await res.json().catch(function() { return {}; });
      if (res.status === 429) {
        errorEl.textContent = '操作过于频繁，请稍后再试';
      } else {
        errorEl.textContent = errData.error || '提交失败，请重试';
      }
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = '确认';
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
    showToast('已记录购买意向', 'success');
  } catch (e) {
    console.error('Want failed:', e);
    btn.disabled = false;
    btn.textContent = '确认';
    errorEl.textContent = '提交失败，请重试';
    errorEl.style.display = 'block';
  }
}

function confirmUnwant(workId, currentCount) {
  if (!confirm('确定要取消"我想要"吗？')) return;
  doUnwant(workId, currentCount);
}

async function doUnwant(workId, currentCount) {
  try {
    var res = await fetch('/api/works/' + workId + '/unwant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: getUid() })
    });

    // Check HTTP status code
    if (!res.ok) {
      var errData = await res.json().catch(function() { return {}; });
      if (res.status === 429) {
        showToast('操作过于频繁，请稍后再试', 'warning');
      } else {
        showToast(errData.error || '取消失败，请重试', 'error');
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
    showToast('取消失败，请重试', 'error');
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
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      lbZoom.scale = Math.max(0.5, Math.min(5, lbZoom.scale * factor));
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

    document.addEventListener('keydown', lightboxKeyHandler);
  }

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
