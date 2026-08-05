// f7goods Admin Panel JS
let CATEGORIES = {
  figure: '手办/模型', goods: '周边杂货', doujin: '同人志',
  cd: '音乐CD', apparel: '服饰', other: '其他'
};
let STATUS_LABELS = {
  on_sale: '发售中', pre_order: '预约中', sold_out: '已售罄', coming_soon: '即将发售'
};
let PROJECT_STATUS_LABELS = {
  recruiting: '招募中', in_progress: '进行中', completed: '已完成', cancelled: '已取消'
};
let PROJECT_CATEGORIES = {
  game: '游戏', music: '音乐', art: '画集', event: '活动', other: '其他'
};
let EVENT_STATUS_LABELS = {};
let EVENT_STATUS_ORDERED = [];
let CIRCLE_CATEGORIES = {};

async function loadCategoriesFromAPI() {
  try {
    const res = await fetch('/api/categories');
    if (!res.ok) return;
    const cats = await res.json();
    if (cats.works) {
      CATEGORIES = {};
      cats.works.forEach(c => CATEGORIES[c.id] = c.name);
    }
    if (cats.workStatus) {
      STATUS_LABELS = {};
      cats.workStatus.forEach(c => STATUS_LABELS[c.id] = c.name);
    }
    if (cats.projects) {
      PROJECT_CATEGORIES = {};
      cats.projects.forEach(c => PROJECT_CATEGORIES[c.id] = c.name);
    }
    if (cats.projectStatus) {
      PROJECT_STATUS_LABELS = {};
      cats.projectStatus.forEach(c => PROJECT_STATUS_LABELS[c.id] = c.name);
    }
    if (cats.eventStatus) {
      EVENT_STATUS_ORDERED = [...cats.eventStatus].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      EVENT_STATUS_LABELS = {};
      EVENT_STATUS_ORDERED.forEach(c => EVENT_STATUS_LABELS[c.id] = c.name);
    }
    if (cats.circleCategories) {
      CIRCLE_CATEGORIES = {};
      cats.circleCategories.forEach(c => CIRCLE_CATEGORIES[c.id] = c.name);
    }
  } catch (e) {
    // Use defaults
  }
}

let token = localStorage.getItem('f7admin_token');
let currentPage = 'dashboard';
let adminWorksData = [];
let adminEventsData = [];
let adminCirclesData = [];
let adminProjectsData = [];
let adminUpdatesData = [];
let adminCirclesMap = {};

// Pagination state
const PAGE_LIMIT = 20;
let pagination = {
  works: { page: 1, total: 0, totalPages: 0 },
  events: { page: 1, total: 0, totalPages: 0 },
  circles: { page: 1, total: 0, totalPages: 0 },
  projects: { page: 1, total: 0, totalPages: 0 },
  updates: { page: 1, total: 0, totalPages: 0 }
};

// Pagination control renderer
function renderPagination(type, loadFunc) {
  const p = pagination[type];
  if (p.totalPages <= 1) return '';

  let html = '<div style="display:flex;align-items:center;justify-content:center;gap:0.5rem;margin-top:1rem;padding:0.5rem;">';

  // Previous button
  if (p.page > 1) {
    html += `<button class="btn-sm" onclick="${loadFunc}(${p.page - 1})" style="padding:0.3rem 0.6rem;">上一页</button>`;
  }

  // Page numbers
  const maxVisible = 5;
  let startPage = Math.max(1, p.page - Math.floor(maxVisible / 2));
  let endPage = Math.min(p.totalPages, startPage + maxVisible - 1);
  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  if (startPage > 1) {
    html += `<button class="btn-sm" onclick="${loadFunc}(1)" style="padding:0.3rem 0.6rem;">1</button>`;
    if (startPage > 2) html += '<span style="color:var(--haze);">...</span>';
  }

  for (let i = startPage; i <= endPage; i++) {
    const isActive = i === p.page;
    html += `<button class="btn-sm" onclick="${loadFunc}(${i})" style="padding:0.3rem 0.6rem;${isActive ? 'background:var(--accent);color:white;' : ''}">${i}</button>`;
  }

  if (endPage < p.totalPages) {
    if (endPage < p.totalPages - 1) html += '<span style="color:var(--haze);">...</span>';
    html += `<button class="btn-sm" onclick="${loadFunc}(${p.totalPages})" style="padding:0.3rem 0.6rem;">${p.totalPages}</button>`;
  }

  // Next button
  if (p.page < p.totalPages) {
    html += `<button class="btn-sm" onclick="${loadFunc}(${p.page + 1})" style="padding:0.3rem 0.6rem;">下一页</button>`;
  }

  // Info
  html += `<span style="color:var(--haze);font-size:0.85rem;margin-left:1rem;">共 ${p.total} 条</span>`;

  html += '</div>';
  return html;
}

// ===== Auth =====
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: form.username.value, password: form.password.value })
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || '登录失败';
      errEl.style.display = 'block';
      return;
    }
    token = data.token;
    localStorage.setItem('f7admin_token', token);
    showAdmin();
  } catch {
    errEl.textContent = '网络错误，请重试';
    errEl.style.display = 'block';
  }
});

document.getElementById('logoutBtn').addEventListener('click', (e) => {
  e.preventDefault();
  token = null;
  localStorage.removeItem('f7admin_token');
  document.getElementById('adminApp').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
});

async function showAdmin() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminApp').style.display = 'flex';
  await loadCategoriesFromAPI();
  loadDashboard();
}

// Check existing token on load
if (token) {
  // Verify token by making a lightweight API call
  fetch('/api/admin/pageviews', {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(res => {
    if (res.ok) showAdmin();
    else {
      token = null;
      localStorage.removeItem('f7admin_token');
    }
  }).catch(() => {});
}

// ===== Navigation =====
document.querySelectorAll('.sidebar-link[data-page]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(link.dataset.page);
  });
});

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.sidebar-link[data-page]').forEach(l => l.classList.remove('active'));
  document.querySelector(`.sidebar-link[data-page="${page}"]`)?.classList.add('active');
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');

  const titles = { dashboard: '仪表盘', works: '作品管理', events: '活动管理', circles: '作者管理', projects: '企划管理', updates: '动态管理', categories: '分类管理', images: '图片管理', settings: '页面设置', announcements: '公告管理', editlog: '编辑历史', contacts: '联系消息', 'page-stats': '浏览统计' };
  document.getElementById('pageTitle').textContent = titles[page] || page;

  // Load data for the page
  if (page === 'dashboard') loadDashboard();
  else if (page === 'works') { loadWorks(); syncWorkApprovalToggle(); }
  else if (page === 'events') loadEvents();
  else if (page === 'circles') loadCircles();
  else if (page === 'projects') loadProjects();
  else if (page === 'categories') loadCategories();
  else if (page === 'images') loadImages();
  else if (page === 'settings') loadSettings();
  else if (page === 'announcements') loadAnnouncements();
  else if (page === 'updates') loadUpdates();
  else if (page === 'editlog') loadEditLog();
  else if (page === 'approval') loadApprovalPage();
  else if (page === 'author-stats') loadAuthorStats();
  else if (page === 'page-stats') loadPageStats();
  else if (page === 'contacts') loadContacts();

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
}

// ===== API Helper =====
async function adminAPI(method, path, body) {
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 401) {
    token = null;
    localStorage.removeItem('f7admin_token');
    location.reload();
    return;
  }
  return res.json();
}

async function uploadImage(file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/admin/upload', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  return res.json();
}

// Helper: get current date in Chinese time (UTC+8)
function getChinaDate() {
  const now = new Date();
  const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return chinaTime.toISOString().slice(0, 10);
}

// Helper: get date N days ago in Chinese time
function getChinaDateDaysAgo(days) {
  const now = new Date();
  const target = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const chinaTime = new Date(target.getTime() + 8 * 60 * 60 * 1000);
  return chinaTime.toISOString().slice(0, 10);
}

// ===== Pageview Cleanup =====
async function cleanupPageviews() {
  if (!confirm('确定要清理365天前的历史浏览数据吗？')) return;
  try {
    const result = await adminAPI('POST', '/api/admin/pageviews/cleanup');
    if (result.success) {
      const removedDaily = result.before.dailyCount - result.after.dailyCount;
      const removedVisitors = result.before.visitorCount - result.after.visitorCount;
      alert(`清理完成！\n删除了 ${removedDaily} 天的浏览记录\n删除了 ${removedVisitors} 天的访客记录`);
      loadDashboard(); // Refresh dashboard
    } else {
      alert('清理失败: ' + (result.error || '未知错误'));
    }
  } catch (e) {
    alert('清理失败: ' + e.message);
  }
}

// ===== Admin Notifications =====
let adminNotifications = [];

async function loadAdminNotifications() {
  try {
    const [circles, events, projects, updates, works] = await Promise.all([
      adminAPI('GET', '/api/admin/circles'),
      adminAPI('GET', '/api/admin/events'),
      adminAPI('GET', '/api/admin/projects'),
      adminAPI('GET', '/api/admin/updates'),
      adminAPI('GET', '/api/admin/works')
    ]);

    adminNotifications = [];

    // Pending authors
    const pendingAuthors = (circles || []).filter(c => c.authorStatus === 'pending');
    pendingAuthors.forEach(c => {
      adminNotifications.push({ type: 'author', id: c.id, title: c.name, message: '新作者注册待审核' });
    });

    // Pending events
    const pendingEvents = (events || []).filter(e => e.approvalStatus === 'pending');
    pendingEvents.forEach(e => {
      adminNotifications.push({ type: 'event', id: e.id, title: e.title, message: '新活动待审核' });
    });

    // Pending projects
    const pendingProjects = (projects || []).filter(p => p.approvalStatus === 'pending');
    pendingProjects.forEach(p => {
      adminNotifications.push({ type: 'project', id: p.id, title: p.title, message: '新企划待审核' });
    });

    // Pending updates
    const pendingUpdates = (updates || []).filter(u => u.approvalStatus === 'pending');
    pendingUpdates.forEach(u => {
      adminNotifications.push({ type: 'update', id: u.id, title: u.title, message: '新动态待审核' });
    });

    // Pending works
    const pendingWorks = (works || []).filter(w => w.approvalStatus === 'pending');
    pendingWorks.forEach(w => {
      adminNotifications.push({ type: 'work', id: w.id, title: w.title, message: '新作品待审核' });
    });

    // Update badge
    const badge = document.getElementById('adminNotifBadge');
    if (badge) {
      badge.textContent = adminNotifications.length;
      badge.style.display = adminNotifications.length > 0 ? 'block' : 'none';
    }
  } catch (e) {
    console.error('Failed to load notifications:', e);
  }
}

function showAdminNotifications() {
  const overlay = document.createElement('div');
  overlay.id = 'adminNotifOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem;';
  overlay.innerHTML = `<div style="background:var(--card-bg);border-radius:var(--radius);padding:1.5rem;max-width:400px;width:100%;max-height:80vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
      <h3 style="margin:0;">🔔 通知</h3>
      <button onclick="document.getElementById('adminNotifOverlay').remove()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--haze);">&times;</button>
    </div>
    ${adminNotifications.length === 0 ? '<p style="color:var(--haze);text-align:center;padding:2rem;">暂无待处理通知</p>' :
      adminNotifications.map(n => `<div style="display:flex;align-items:center;gap:1rem;padding:0.6rem 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="document.getElementById('adminNotifOverlay').remove();navigateTo('${n.type === 'author' ? 'approval' : n.type === 'work' ? 'works' : n.type + 's'}');">
        <span style="font-size:1.5rem;">${n.type === 'author' ? '🏠' : n.type === 'event' ? '📅' : n.type === 'project' ? '📋' : n.type === 'update' ? '📰' : '🎨'}</span>
        <div style="flex:1;">
          <div style="font-weight:600;">${escapeHtml(n.title)}</div>
          <div style="font-size:0.75rem;color:var(--haze);">${n.message}</div>
        </div>
      </div>`).join('')}
  </div>`;
  document.body.appendChild(overlay);

  // Mark as read
  const badge = document.getElementById('adminNotifBadge');
  if (badge) badge.style.display = 'none';
}

// ===== Dashboard =====
async function loadDashboard() {
  const [works, events, circles, projects, updates, pvData] = await Promise.all([
    adminAPI('GET', '/api/admin/works'),
    adminAPI('GET', '/api/admin/events'),
    adminAPI('GET', '/api/admin/circles'),
    adminAPI('GET', '/api/admin/projects'),
    adminAPI('GET', '/api/admin/updates'),
    adminAPI('GET', '/api/admin/pageviews')
  ]);
  document.getElementById('statWorks').textContent = works?.length || 0;
  document.getElementById('statEvents').textContent = events?.length || 0;
  document.getElementById('statCircles').textContent = circles?.length || 0;
  document.getElementById('statProjects').textContent = projects?.length || 0;
  document.getElementById('statUpdates').textContent = updates?.length || 0;

  // Pending approval counts
  const pendingAuthors = (circles || []).filter(c => c.authorStatus === 'pending').length;
  const pendingEvents = (events || []).filter(e => e.approvalStatus === 'pending').length;
  const pendingProjects = (projects || []).filter(p => p.approvalStatus === 'pending').length;
  const pendingUpdates = (updates || []).filter(u => u.approvalStatus === 'pending').length;
  document.getElementById('statPendingAuthors').textContent = pendingAuthors;
  document.getElementById('statPendingEvents').textContent = pendingEvents;
  document.getElementById('statPendingProjects').textContent = pendingProjects;
  document.getElementById('statPendingUpdates').textContent = pendingUpdates;

  // Load notifications
  loadAdminNotifications();

  // Page view stats
  const daily = pvData?.daily || {};
  window._pvDaily = daily;
  const today = getChinaDate(); // Use Chinese time
  const thisMonth = today.slice(0, 7);
  const thisYear = today.slice(0, 4);
  let totalPV = 0, monthPV = 0, yearPV = 0;
  for (const [date, count] of Object.entries(daily)) {
    totalPV += count;
    if (date.startsWith(thisMonth)) monthPV += count;
    if (date.startsWith(thisYear)) yearPV += count;
  }
  document.getElementById('pvToday').textContent = daily[today] || 0;
  document.getElementById('pvMonth').textContent = monthPV;
  document.getElementById('pvYear').textContent = yearPV;
  document.getElementById('pvTotal').textContent = totalPV;

  // Visitor stats
  const visitors = pvData?.visitors || {};
  window._pvVisitors = visitors;
  const todayVisitors = (visitors[today] || []).length;
  // Merge all IPs for month/year/total and deduplicate
  const monthIPs = new Set();
  const yearIPs = new Set();
  const totalIPs = new Set();
  for (const [date, ips] of Object.entries(visitors)) {
    ips.forEach(ip => {
      totalIPs.add(ip);
      if (date.startsWith(thisYear)) yearIPs.add(ip);
      if (date.startsWith(thisMonth)) monthIPs.add(ip);
    });
  }
  document.getElementById('visToday').textContent = todayVisitors;
  document.getElementById('visMonth').textContent = monthIPs.size;
  document.getElementById('visYear').textContent = yearIPs.size;
  document.getElementById('visTotal').textContent = totalIPs.size;

  // Helper: get last N days data (Chinese time)
  function getLastNDays(n) {
    const labels = [], data = [];
    for (let i = n - 1; i >= 0; i--) {
      const key = getChinaDateDaysAgo(i);
      labels.push(key.slice(5)); // MM-DD
      data.push(daily[key] || 0);
    }
    return { labels, data };
  }

  // Chart defaults
  const chartOpts = (title) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, title: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    elements: { line: { tension: 0.3 }, point: { radius: 3 } }
  });

  const lineColor = 'rgb(233, 69, 96)';
  const fillColor = 'rgba(233, 69, 96, 0.1)';

  // 7-day chart
  const d7 = getLastNDays(7);
  if (window._chart7d) window._chart7d.destroy();
  window._chart7d = new Chart(document.getElementById('chart7d'), {
    type: 'line',
    data: { labels: d7.labels, datasets: [{ data: d7.data, borderColor: lineColor, backgroundColor: fillColor, fill: true }] },
    options: chartOpts()
  });

  // 30-day chart
  const d30 = getLastNDays(30);
  if (window._chart30d) window._chart30d.destroy();
  window._chart30d = new Chart(document.getElementById('chart30d'), {
    type: 'line',
    data: { labels: d30.labels, datasets: [{ data: d30.data, borderColor: lineColor, backgroundColor: fillColor, fill: true }] },
    options: chartOpts()
  });

  // Visitor charts
  const visLine = 'rgb(26, 188, 156)';
  const visFill = 'rgba(26, 188, 156, 0.1)';

  function getVisitorLastNDays(n) {
    const labels = [], data = [];
    const visitors = window._pvVisitors || {};
    for (let i = n - 1; i >= 0; i--) {
      const key = getChinaDateDaysAgo(i);
      labels.push(key.slice(5));
      data.push((visitors[key] || []).length);
    }
    return { labels, data };
  }

  // 7-day visitor chart
  const vd7 = getVisitorLastNDays(7);
  if (window._chartVis7d) window._chartVis7d.destroy();
  window._chartVis7d = new Chart(document.getElementById('chartVis7d'), {
    type: 'line',
    data: { labels: vd7.labels, datasets: [{ data: vd7.data, borderColor: visLine, backgroundColor: visFill, fill: true }] },
    options: chartOpts()
  });

  // 30-day visitor chart
  const vd30 = getVisitorLastNDays(30);
  if (window._chartVis30d) window._chartVis30d.destroy();
  window._chartVis30d = new Chart(document.getElementById('chartVis30d'), {
    type: 'line',
    data: { labels: vd30.labels, datasets: [{ data: vd30.data, borderColor: visLine, backgroundColor: visFill, fill: true }] },
    options: chartOpts()
  });
}

// ===== Page Stats =====
let _pageStatsData = null;
let _pageStatsEntities = null;

async function loadPageStats() {
  const [pvData, works, events, circles, projects, updates] = await Promise.all([
    adminAPI('GET', '/api/admin/pageviews'),
    adminAPI('GET', '/api/admin/works'),
    adminAPI('GET', '/api/admin/events'),
    adminAPI('GET', '/api/admin/circles'),
    adminAPI('GET', '/api/admin/projects'),
    adminAPI('GET', '/api/admin/updates')
  ]);
  _pageStatsData = pvData;
  _pageStatsEntities = { works, events, circles, projects, updates };

  // 渲染浏览量概览
  renderPVOverview(pvData);
  renderPVOverviewCharts(pvData);

  // 渲染各页面统计
  renderPageCategoryStats(pvData);
  renderPageCharts(pvData);
  renderItemRanking(pvData, _pageStatsEntities);
}

function getPageUrl(key) {
  const urls = {
    works: '/', events: '/events.html', circles: '/circles.html',
    projects: '/projects.html', updates: '/updates.html',
    contact: '/contact.html', announcements: '/announcements.html'
  };
  return urls[key] || '/';
}

function getItemUrl(pageType, itemId) {
  const detailPages = {
    works: '/work-detail.html', events: '/event-detail.html',
    circles: '/circle-detail.html', projects: '/project-detail.html',
    updates: '/update-detail.html'
  };
  return (detailPages[pageType] || '/') + '?id=' + encodeURIComponent(itemId);
}

function renderPVOverview(pvData) {
  const daily = pvData.daily || {};
  const visitors = pvData.visitors || {};
  const todayStr = getChinaDate();
  const thisMonth = todayStr.slice(0, 7);
  const thisYear = todayStr.slice(0, 4);

  let totalPV = 0, yearPV = 0, monthPV = 0, todayPV = 0;
  for (const [date, count] of Object.entries(daily)) {
    totalPV += count;
    if (date.startsWith(thisYear)) yearPV += count;
    if (date.startsWith(thisMonth)) monthPV += count;
    if (date === todayStr) todayPV = count;
  }

  const todayVisitors = (visitors[todayStr] || []).length;
  const monthVisitorSet = new Set();
  const yearVisitorSet = new Set();
  const totalVisitorSet = new Set();
  for (const [date, ips] of Object.entries(visitors)) {
    ips.forEach(ip => {
      totalVisitorSet.add(ip);
      if (date.startsWith(thisYear)) yearVisitorSet.add(ip);
      if (date.startsWith(thisMonth)) monthVisitorSet.add(ip);
    });
  }

  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  el('pvToday2', todayPV);
  el('pvMonth2', monthPV);
  el('pvYear2', yearPV);
  el('pvTotal2', totalPV);
  el('visToday2', todayVisitors);
  el('visMonth2', monthVisitorSet.size);
  el('visYear2', yearVisitorSet.size);
  el('visTotal2', totalVisitorSet.size);
}

function renderPVOverviewCharts(pvData) {
  const daily = pvData.daily || {};
  const visitors = pvData.visitors || {};
  const pvLine = 'rgb(233, 69, 96)';
  const pvFill = 'rgba(233, 69, 96, 0.1)';
  const visLine = 'rgb(26, 188, 156)';
  const visFill = 'rgba(26, 188, 156, 0.1)';

  function getLastNDays(n) {
    const labels = [], data = [];
    for (let i = n - 1; i >= 0; i--) {
      const key = getChinaDateDaysAgo(i);
      labels.push(key.slice(5));
      data.push(daily[key] || 0);
    }
    return { labels, data };
  }

  function getVisitorLastNDays(n) {
    const labels = [], data = [];
    for (let i = n - 1; i >= 0; i--) {
      const key = getChinaDateDaysAgo(i);
      labels.push(key.slice(5));
      data.push((visitors[key] || []).length);
    }
    return { labels, data };
  }

  const chartOpts = () => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } },
    elements: { point: { radius: 3 }, line: { tension: 0.3 } }
  });

  const pv7 = getLastNDays(7);
  const makeChart = (id, labels, data, color, fill) => {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (ctx.__chart) ctx.__chart.destroy();
    ctx.__chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ data, borderColor: color, backgroundColor: fill, fill: true }] },
      options: chartOpts()
    });
  };

  makeChart('chart7d_pv', pv7.labels, pv7.data, pvLine, pvFill);
  const pv30 = getLastNDays(30);
  makeChart('chart30d_pv', pv30.labels, pv30.data, pvLine, pvFill);
  const v7 = getVisitorLastNDays(7);
  makeChart('chartVis7d_pv', v7.labels, v7.data, visLine, visFill);
  const v30 = getVisitorLastNDays(30);
  makeChart('chartVis30d_pv', v30.labels, v30.data, visLine, visFill);
}

function showPageCategoryDetail(pageKey) {
  const pvData = _pageStatsData;
  if (!pvData) return;
  const daily = pvData.daily || {};
  const pageNames = { works: '作品', events: '活动', circles: '圈子', projects: '企划', updates: '动态', contact: '联系', announcements: '公告' };
  const label = pageNames[pageKey] || pageKey;

  // 计算今日/本周/本月
  const todayStr = getChinaDate();
  const todayCount = (pvData.pages && pvData.pages[todayStr] && pvData.pages[todayStr][pageKey]) || 0;

  // 本周（周一到今天）
  const now = new Date();
  const chinaNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const dayOfWeek = chinaNow.getUTCDay() || 7;
  let weekCount = 0;
  for (let i = 0; i < dayOfWeek; i++) {
    const d = getChinaDateDaysAgo(i);
    weekCount += (pvData.pages && pvData.pages[d] && pvData.pages[d][pageKey]) || 0;
  }

  const thisMonth = todayStr.slice(0, 7);
  let monthCount = 0;
  for (const [date, pageData] of Object.entries(pvData.pages || {})) {
    if (date.startsWith(thisMonth)) {
      monthCount += (pageData[pageKey] || 0);
    }
  }

  // 近30天数据
  const chartLabels = [], chartData = [];
  let total30 = 0, maxDay = 0;
  for (let i = 29; i >= 0; i--) {
    const d = getChinaDateDaysAgo(i);
    const count = (pvData.pages && pvData.pages[d] && pvData.pages[d][pageKey]) || 0;
    chartLabels.push(d.slice(5));
    chartData.push(count);
    total30 += count;
    if (count > maxDay) maxDay = count;
  }

  const pageUrl = getPageUrl(pageKey);

  document.getElementById('modalTitle').textContent = `📊 ${label} — 浏览详情`;
  document.getElementById('modalBody').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.5rem;">
      <div style="text-align:center;padding:0.8rem;background:var(--bg);border-radius:var(--radius);">
        <div style="font-size:1.5rem;font-weight:700;color:var(--accent);">${todayCount}</div>
        <div style="font-size:0.8rem;color:var(--muted);">今日</div>
      </div>
      <div style="text-align:center;padding:0.8rem;background:var(--bg);border-radius:var(--radius);">
        <div style="font-size:1.5rem;font-weight:700;color:#3498db;">${weekCount}</div>
        <div style="font-size:0.8rem;color:var(--muted);">本周</div>
      </div>
      <div style="text-align:center;padding:0.8rem;background:var(--bg);border-radius:var(--radius);">
        <div style="font-size:1.5rem;font-weight:700;color:#f39c12;">${monthCount}</div>
        <div style="font-size:0.8rem;color:var(--muted);">本月</div>
      </div>
      <div style="text-align:center;padding:0.8rem;background:var(--bg);border-radius:var(--radius);">
        <div style="font-size:1.5rem;font-weight:700;color:#2ecc71;">${total30}</div>
        <div style="font-size:0.8rem;color:var(--muted);">近30天</div>
      </div>
    </div>
    <div style="margin-bottom:1rem;text-align:center;">
      <a href="${pageUrl}" target="_blank" class="btn btn-primary" style="text-decoration:none;">🔗 访问${label}页面</a>
    </div>
    <div style="height:220px;margin-bottom:1rem;"><canvas id="chartPageDetail30d"></canvas></div>
    <div style="font-size:0.85rem;color:var(--muted);text-align:center;">日均 ${(total30 / 30).toFixed(1)} 次 · 最高 ${maxDay} 次</div>
  `;
  document.getElementById('modalSave').style.display = 'none';
  openModal();

  // 渲染弹窗内的图表
  setTimeout(() => {
    const ctx = document.getElementById('chartPageDetail30d');
    if (!ctx) return;
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartLabels,
        datasets: [{ data: chartData, backgroundColor: 'rgba(233, 69, 96, 0.6)', borderColor: 'rgb(233, 69, 96)', borderWidth: 1 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } }
      }
    });
  }, 100);
}

function renderPageCategoryStats(pvData) {
  const today = getChinaDate();
  const pages = (pvData.pages && pvData.pages[today]) || {};
  const pageNames = {
    works: '作品', events: '活动', circles: '圈子',
    projects: '企划', updates: '动态', contact: '联系', announcements: '公告'
  };
  const icons = { works: '🎨', events: '📅', circles: '🏠', projects: '📋', updates: '📰', contact: '💬', announcements: '📢' };

  const grid = document.getElementById('pageStatsGrid');
  grid.innerHTML = Object.entries(pageNames).map(([key, label]) => {
    const count = pages[key] || 0;
    const url = getPageUrl(key);
    return `<div class="pv-overview-item" onclick="showPageCategoryDetail('${key}')" style="cursor:pointer;">
      <div class="pv-overview-icon">${icons[key] || '📄'}</div>
      <div class="pv-overview-body">
        <div class="pv-overview-number">${count}</div>
        <div class="pv-overview-label"><a href="${url}" target="_blank" onclick="event.stopPropagation()" style="color:inherit;text-decoration:none;">${label}</a></div>
      </div>
      <div class="pv-overview-arrow">›</div>
    </div>`;
  }).join('');
}

function renderPageCharts(pvData) {
  const today = getChinaDate();
  const pages = (pvData.pages && pvData.pages[today]) || {};
  const pageNames = {
    works: '作品', events: '活动', circles: '圈子',
    projects: '企划', updates: '动态', contact: '联系', announcements: '公告'
  };
  const colors = ['#e94560', '#1abc9c', '#3498db', '#f39c12', '#9b59b6', '#e74c3c', '#2ecc71'];

  // Doughnut chart - today's breakdown
  const ctx1 = document.getElementById('chartPageBreakdown');
  if (ctx1.__chart) ctx1.__chart.destroy();
  ctx1.__chart = new Chart(ctx1, {
    type: 'doughnut',
    data: {
      labels: Object.values(pageNames),
      datasets: [{
        data: Object.keys(pageNames).map(k => pages[k] || 0),
        backgroundColor: colors
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 12 } } }
      }
    }
  });

  // 7-day trend line chart
  const labels = [];
  const datasets = Object.entries(pageNames).map(([key, label], i) => {
    return { label, data: [], borderColor: colors[i], tension: 0.3, fill: false, pointRadius: 2 };
  });

  for (let i = 6; i >= 0; i--) {
    const date = getChinaDateDaysAgo(i);
    labels.push(date.slice(5));
    const dayPages = (pvData.pages && pvData.pages[date]) || {};
    Object.keys(pageNames).forEach((key, idx) => {
      datasets[idx].data.push(dayPages[key] || 0);
    });
  }

  const ctx2 = document.getElementById('chartPageTrend7d');
  if (ctx2.__chart) ctx2.__chart.destroy();
  ctx2.__chart = new Chart(ctx2, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function renderItemRanking(pvData, entities) {
  const pageFilter = document.getElementById('itemPageFilter').value;
  const dateRange = document.getElementById('itemDateRange').value;
  const days = dateRange === 'all' ? 365 : parseInt(dateRange);

  const items = (pvData.items && pvData.items[pageFilter]) || {};
  const today = getChinaDate();

  // Calculate total views per item within date range
  const ranking = Object.entries(items).map(([id, dates]) => {
    let total = 0;
    const trendData = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = getChinaDateDaysAgo(i);
      const count = dates[date] || 0;
      total += count;
      if (i < 7) trendData.push(count);
    }
    return { id, total, trendData };
  }).filter(r => r.total > 0).sort((a, b) => b.total - a.total);

  // Get entity name map
  const entityList = entities[pageFilter] || [];
  const nameMap = {};
  entityList.forEach(e => { nameMap[e.id] = e.title || e.name || e.id; });

  const tbody = document.getElementById('itemRankingBody');
  if (ranking.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:2rem;">暂无数据</td></tr>';
    return;
  }

  tbody.innerHTML = ranking.slice(0, 20).map((item, i) => {
    const sparkId = `spark-${item.id}`;
    const itemUrl = getItemUrl(pageFilter, item.id);
    return `<tr>
      <td style="text-align:center;font-weight:600;">${i + 1}</td>
      <td><a href="${itemUrl}" target="_blank" style="color:var(--ink);text-decoration:none;">${nameMap[item.id] || item.id}</a></td>
      <td style="font-weight:600;">${item.total}</td>
      <td><canvas id="${sparkId}" width="120" height="24"></canvas></td>
    </tr>`;
  }).join('');

  // Render sparklines
  ranking.slice(0, 20).forEach(item => {
    const canvas = document.getElementById(`spark-${item.id}`);
    if (!canvas) return;
    if (canvas.__chart) canvas.__chart.destroy();
    canvas.__chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: item.trendData.map((_, i) => ''),
        datasets: [{ data: item.trendData, borderColor: '#e94560', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3 }]
      },
      options: {
        responsive: false,
        plugins: { legend: { display: false } },
        scales: { x: { display: false }, y: { display: false, beginAtZero: true } },
        elements: { line: { borderWidth: 1.5 } }
      }
    });
  });

  // Render trend comparison chart for top 5
  renderItemTrendChart(ranking.slice(0, 5), items, days);
}

function refreshItemRanking() {
  if (_pageStatsData && _pageStatsEntities) {
    renderItemRanking(_pageStatsData, _pageStatsEntities);
  }
}

function renderItemTrendChart(topItems, items, days) {
  if (topItems.length === 0) return;

  const labels = [];
  const datasets = topItems.map((item, i) => {
    const colors = ['#e94560', '#1abc9c', '#3498db', '#f39c12', '#9b59b6'];
    const nameMap = {};
    if (_pageStatsEntities) {
      const pageFilter = document.getElementById('itemPageFilter').value;
      (_pageStatsEntities[pageFilter] || []).forEach(e => { nameMap[e.id] = e.title || e.name || e.id; });
    }
    return {
      label: nameMap[item.id] || item.id,
      data: [],
      borderColor: colors[i % colors.length],
      tension: 0.3,
      fill: false,
      pointRadius: 2
    };
  });

  const displayDays = Math.min(days, 30);
  for (let i = displayDays - 1; i >= 0; i--) {
    const date = getChinaDateDaysAgo(i);
    labels.push(date.slice(5));
    topItems.forEach((item, idx) => {
      datasets[idx].data.push((items[item.id] && items[item.id][date]) || 0);
    });
  }

  const ctx = document.getElementById('chartItemTrend');
  if (ctx.__chart) ctx.__chart.destroy();
  ctx.__chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

// ===== Works =====
function showPVDetail(type) {
  const daily = window._pvDaily || {};
  const todayStr = getChinaDate(); // Use Chinese time
  const thisMonth = todayStr.slice(0, 7);
  const thisYear = todayStr.slice(0, 4);
  // Parse Chinese date components
  const todayYear = parseInt(thisYear);
  const todayMonth = parseInt(thisMonth.split('-')[1]);

  let title = '', entries = [], chartLabels = [], chartData = [], colLabel = '';
  let currentMonthDays = [];

  if (type === 'today') {
    title = '近 30 日每日浏览量';
    colLabel = '日期';
    for (let i = 29; i >= 0; i--) {
      const key = getChinaDateDaysAgo(i);
      const count = daily[key] || 0;
      entries.push([key, count]);
      chartLabels.push(key.slice(5));
      chartData.push(count);
    }
    entries.sort((a, b) => b[0].localeCompare(a[0]));
  } else if (type === 'month') {
    title = '本月浏览 · 往月对比';
    colLabel = '月份';
    // Aggregate daily data by month
    const months = {};
    for (const [d, c] of Object.entries(daily)) {
      const m = d.slice(0, 7);
      months[m] = (months[m] || 0) + c;
    }
    // Generate last 12 months
    for (let i = 11; i >= 0; i--) {
      let m = todayMonth - i;
      let y = todayYear;
      while (m <= 0) { m += 12; y--; }
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const count = months[key] || 0;
      entries.push([key, count]);
      chartLabels.push(key);
      chartData.push(count);
    }
    entries.sort((a, b) => b[0].localeCompare(a[0]));
    // Current month daily breakdown
    const daysInMonth = new Date(todayYear, todayMonth, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const key = thisMonth + '-' + String(day).padStart(2, '0');
      if (key > todayStr) break;
      currentMonthDays.push([key, daily[key] || 0]);
    }
  } else if (type === 'year') {
    title = '历年浏览量';
    colLabel = '年份';
    const years = {};
    for (const [d, c] of Object.entries(daily)) {
      const y = d.slice(0, 4);
      years[y] = (years[y] || 0) + c;
    }
    const sortedYears = Object.keys(years).sort();
    for (const y of sortedYears) {
      entries.push([y, years[y]]);
      chartLabels.push(y + '年');
      chartData.push(years[y]);
    }
    entries.sort((a, b) => b[0].localeCompare(a[0]));
  } else if (type === 'today-visitors') {
    const visitors = window._pvVisitors || {};
    title = '近 30 日每日访客数';
    colLabel = '日期';
    for (let i = 29; i >= 0; i--) {
      const key = getChinaDateDaysAgo(i);
      const count = (visitors[key] || []).length;
      entries.push([key, count]);
      chartLabels.push(key.slice(5));
      chartData.push(count);
    }
    entries.sort((a, b) => b[0].localeCompare(a[0]));
  } else if (type === 'month-visitors') {
    const visitors = window._pvVisitors || {};
    title = '本月访客 · 往月对比';
    colLabel = '月份';
    const months = {};
    for (const [d, ips] of Object.entries(visitors)) {
      const m = d.slice(0, 7);
      if (!months[m]) months[m] = new Set();
      ips.forEach(ip => months[m].add(ip));
    }
    for (let i = 11; i >= 0; i--) {
      let m = todayMonth - i;
      let y = todayYear;
      while (m <= 0) { m += 12; y--; }
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const count = months[key] ? months[key].size : 0;
      entries.push([key, count]);
      chartLabels.push(key);
      chartData.push(count);
    }
    entries.sort((a, b) => b[0].localeCompare(a[0]));
  } else if (type === 'year-visitors') {
    const visitors = window._pvVisitors || {};
    title = '历年访客数';
    colLabel = '年份';
    const years = {};
    for (const [d, ips] of Object.entries(visitors)) {
      const y = d.slice(0, 4);
      if (!years[y]) years[y] = new Set();
      ips.forEach(ip => years[y].add(ip));
    }
    const sortedYears = Object.keys(years).sort();
    for (const y of sortedYears) {
      entries.push([y, years[y].size]);
      chartLabels.push(y + '年');
      chartData.push(years[y].size);
    }
    entries.sort((a, b) => b[0].localeCompare(a[0]));
  }

  const total = chartData.reduce((s, v) => s + v, 0);
  const avg = chartData.length > 0 ? Math.round(total / chartData.length) : 0;
  const max = Math.max(...chartData, 1);

  document.getElementById('modalTitle').textContent = title;

  const rows = entries.length > 0
    ? entries.map(([d, c]) => `<tr><td style="padding:0.5rem 1rem;border-bottom:1px solid var(--border);">${d}</td><td style="padding:0.5rem 1rem;border-bottom:1px solid var(--border);text-align:right;font-weight:600;">${c.toLocaleString()}</td></tr>`).join('')
    : '<tr><td colspan="2" style="padding:1rem;text-align:center;color:var(--haze);">暂无数据</td></tr>';

  const barRows = entries.length > 0
    ? entries.map(([d, c]) => {
        const pct = max > 0 ? (c / max * 100) : 0;
        return `<div style="display:flex;align-items:center;gap:0.6rem;padding:0.3rem 0;">
          <span style="width:70px;font-size:0.8rem;color:var(--haze);text-align:right;flex-shrink:0;">${d}</span>
          <div style="flex:1;height:20px;background:var(--paper);border-radius:4px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-alt));border-radius:4px;min-width:${c > 0 ? '2px' : '0'};"></div>
          </div>
          <span style="width:50px;font-size:0.8rem;font-weight:600;text-align:right;">${c.toLocaleString()}</span>
        </div>`;
      }).join('')
    : '<p style="text-align:center;color:var(--haze);padding:1rem;">暂无数据</p>';

  // Current month daily breakdown section
  let currentMonthSection = '';
  if (type === 'month' && currentMonthDays.length > 0) {
    const cmTotal = currentMonthDays.reduce((s, [, c]) => s + c, 0);
    const cmMax = Math.max(...currentMonthDays.map(([, c]) => c), 1);
    const cmBars = currentMonthDays.map(([d, c]) => {
      const pct = cmMax > 0 ? (c / cmMax * 100) : 0;
      return `<div style="display:flex;align-items:center;gap:0.6rem;padding:0.2rem 0;">
        <span style="width:50px;font-size:0.78rem;color:var(--haze);text-align:right;flex-shrink:0;">${d.slice(8)}日</span>
        <div style="flex:1;height:16px;background:var(--paper);border-radius:4px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#9b59b6,#8e44ad);border-radius:4px;min-width:${c > 0 ? '2px' : '0'};"></div>
        </div>
        <span style="width:40px;font-size:0.78rem;font-weight:600;text-align:right;">${c.toLocaleString()}</span>
      </div>`;
    }).join('');
    currentMonthSection = `
      <details style="margin-bottom:1.2rem;" open>
        <summary style="font-size:0.85rem;font-weight:600;cursor:pointer;color:#9b59b6;padding:0.3rem 0;">${thisMonth} 每日明细（本月累计 ${cmTotal.toLocaleString()}）</summary>
        <div style="margin-top:0.6rem;max-height:280px;overflow-y:auto;">
          ${cmBars}
        </div>
      </details>
    `;
  }

  document.getElementById('modalBody').innerHTML = `
    <div style="display:flex;gap:1rem;margin-bottom:1.2rem;">
      <div style="flex:1;text-align:center;padding:0.8rem;background:rgba(233,69,96,0.06);border-radius:var(--radius-sm);">
        <div style="font-size:1.3rem;font-weight:700;color:var(--accent);">${total.toLocaleString()}</div>
        <div style="font-size:0.75rem;color:var(--haze);">总计</div>
      </div>
      <div style="flex:1;text-align:center;padding:0.8rem;background:rgba(52,152,219,0.06);border-radius:var(--radius-sm);">
        <div style="font-size:1.3rem;font-weight:700;color:#3498db;">${avg.toLocaleString()}</div>
        <div style="font-size:0.75rem;color:var(--haze);">平均</div>
      </div>
      <div style="flex:1;text-align:center;padding:0.8rem;background:rgba(46,204,113,0.06);border-radius:var(--radius-sm);">
        <div style="font-size:1.3rem;font-weight:700;color:#2ecc71;">${max.toLocaleString()}</div>
        <div style="font-size:0.75rem;color:var(--haze);">最高</div>
      </div>
    </div>
    ${currentMonthSection}
    <div style="margin-bottom:1.2rem;">
      <div style="font-size:0.85rem;font-weight:600;margin-bottom:0.6rem;color:var(--ink);">月度趋势</div>
      ${barRows}
    </div>
    <details>
      <summary style="font-size:0.85rem;font-weight:600;cursor:pointer;color:var(--haze);padding:0.3rem 0;">展开详细数据表</summary>
      <div style="margin-top:0.6rem;max-height:240px;overflow-y:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
          <thead><tr style="text-align:left;"><th style="padding:0.4rem 1rem;border-bottom:2px solid var(--border);">${colLabel}</th><th style="padding:0.4rem 1rem;border-bottom:2px solid var(--border);text-align:right;">浏览量</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </details>
  `;
  document.getElementById('modalSave').style.display = 'none';
  openModal();
  document.getElementById('modalSave').style.display = '';
}

// Toggle work approval requirement
async function toggleWorkApproval() {
  const checked = document.getElementById('requireWorkApproval').checked;
  const settings = await adminAPI('GET', '/api/settings') || {};
  if (!settings.site) settings.site = {};
  settings.site.requireWorkApproval = checked;
  await adminAPI('PUT', '/api/admin/settings', settings);
  showToast(checked ? '已开启作品审核' : '已关闭作品审核', 'success');
}

// Sync work approval toggle state
async function syncWorkApprovalToggle() {
  try {
    const settings = await adminAPI('GET', '/api/settings');
    const checkbox = document.getElementById('requireWorkApproval');
    if (checkbox && settings?.site) {
      checkbox.checked = settings.site.requireWorkApproval !== false;
    }
  } catch (e) {}
}

async function loadWorks(page = 1) {
  const [worksResp, circles] = await Promise.all([
    adminAPI('GET', `/api/admin/works?page=${page}&limit=${PAGE_LIMIT}`),
    adminAPI('GET', '/api/admin/circles')
  ]);
  adminCirclesMap = {};
  adminCirclesData = circles || [];
  adminCirclesData.forEach(c => adminCirclesMap[c.id] = c.name);

  // Handle paginated response
  if (worksResp && worksResp.items) {
    adminWorksData = worksResp.items;
    pagination.works = { page: worksResp.page, total: worksResp.total, totalPages: worksResp.totalPages };
  } else {
    adminWorksData = worksResp || [];
    pagination.works = { page: 1, total: adminWorksData.length, totalPages: 1 };
  }

  renderWorksTable(adminWorksData);
  // Render pagination
  const paginationEl = document.getElementById('worksPagination');
  if (paginationEl) paginationEl.innerHTML = renderPagination('works', 'loadWorks');
}

// Reorder function
async function reorderItem(type, id, direction) {
  const dataMap = { works: adminWorksData, events: adminEventsData, circles: adminCirclesData, projects: adminProjectsData };
  const items = dataMap[type];
  if (!items) return;

  const index = items.findIndex(i => i.id === id);
  if (index === -1) return;

  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= items.length) return;

  // Swap order values
  const temp = items[index].order;
  items[index].order = items[newIndex].order;
  items[newIndex].order = temp;

  // Swap in array
  [items[index], items[newIndex]] = [items[newIndex], items[index]];

  // Save to server
  const orderedIds = items.map(i => i.id);
  await adminAPI('POST', `/api/admin/reorder/${type}`, { orderedIds });

  // Re-render
  if (type === 'works') renderWorksTable(items);
  else if (type === 'events') renderEventsTable(items);
  else if (type === 'circles') renderCirclesTable(items);
  else if (type === 'projects') renderProjectsTable(items);
}

function renderOrderControls(type, id, index, total) {
  return `
    <div style="display:flex;gap:2px;">
      <button class="btn-sm" onclick="reorderItem('${type}', '${id}', -1)" ${index === 0 ? 'disabled style="opacity:0.3"' : ''}>↑</button>
      <button class="btn-sm" onclick="reorderItem('${type}', '${id}', 1)" ${index === total - 1 ? 'disabled style="opacity:0.3"' : ''}>↓</button>
    </div>
  `;
}

function renderWorksTable(works) {
  const tbody = document.getElementById('worksTableBody');
  if (!works || works.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:var(--haze);padding:2rem;">暂无作品</td></tr>';
    return;
  }
  tbody.innerHTML = works.map((w, i) => {
    const hasImg = w.images && w.images.length > 0;
    const approvalBadge = w.approvalStatus === 'approved' ? '<span style="background:#2ecc71;color:white;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.7rem;">已批准</span>'
      : w.approvalStatus === 'rejected' ? '<span style="background:var(--accent);color:white;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.7rem;">已拒绝</span>'
      : w.approvalStatus === 'pending' ? '<span style="background:#f39c12;color:white;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.7rem;">待审核</span>'
      : '<span style="background:var(--haze);color:white;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.7rem;">-</span>';
    const approveBtn = w.approvalStatus === 'pending' ? `<button class="btn-sm" style="background:#2ecc71;color:white;" onclick="approveWork('${w.id}')">批准</button><button class="btn-sm btn-delete" onclick="rejectWork('${w.id}')">拒绝</button>` : '';
    return `
    <tr data-work-id="${w.id}">
      <td>${renderOrderControls('works', w.id, i, works.length)}</td>
      <td><input type="checkbox" class="work-checkbox" value="${w.id}" onchange="updateBatchBtn()" style="width:16px;height:16px;accent-color:var(--accent);"></td>
      <td>
        <div style="display:flex;align-items:center;gap:0.4rem;">
          <div style="position:relative;width:50px;height:50px;border-radius:6px;overflow:hidden;border:1px solid var(--border);flex-shrink:0;background:var(--paper);">
            ${hasImg ? `<img src="${w.images[0]}" style="width:100%;height:100%;object-fit:cover;">` : '<span style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--haze);font-size:1.2rem;">🎨</span>'}
            ${hasImg ? `<button onclick="removeWorkImage('${w.id}', 0)" style="position:absolute;top:-2px;right:-2px;width:16px;height:16px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:9px;cursor:pointer;line-height:1;">&times;</button>` : ''}
          </div>
          <label style="cursor:pointer;font-size:0.7rem;color:var(--accent);flex-shrink:0;" title="上传图片">
            📷
            <input type="file" accept="image/*" style="display:none;" onchange="quickUploadWorkImage('${w.id}', this)">
          </label>
        </div>
      </td>
      <td class="editable-cell" onclick="makeEditable(this, '${w.id}', 'title', '${escapeHtml(w.title)}')">${w.title}<br><span style="font-size:0.6rem;color:var(--haze);">${w.id}</span></td>
      <td>${approvalBadge}</td>
      <td class="editable-cell" onclick="makeSelectCircles(this, '${w.id}', ${JSON.stringify(w.circles || []).replace(/"/g, '&quot;')})">${(w.circles || []).map(cid => adminCirclesMap[cid] || cid).join(', ') || '-'}</td>
      <td class="editable-cell" onclick="makeSelectCategory(this, '${w.id}', '${w.category}')">${CATEGORIES[w.category] || w.category}</td>
      <td class="editable-cell" onclick="makeEditable(this, '${w.id}', 'price', '${escapeHtml(w.price)}')">${w.price}</td>
      <td style="text-align:center;">${w.likes || 0}</td>
      <td style="text-align:center;color:#3498db;font-weight:600;">${w.wants || 0}</td>
      <td class="editable-cell" onclick="makeSelectStatus(this, '${w.id}', '${w.status}')"><span class="card-tag ${w.status}">${STATUS_LABELS[w.status] || w.status}</span></td>
      <td>
        <div class="table-actions">
          ${approveBtn}
          <button class="btn-sm btn-edit" onclick="manageWorkRelations('${w.id}')">关联</button>
          <button class="btn-sm btn-edit" onclick="editWork('${w.id}')">编辑</button>
          <button class="btn-sm btn-delete" onclick="deleteWork('${w.id}')">删除</button>
        </div>
      </td>
    </tr>
  `}).join('');
}

async function approveWork(id) {
  const result = await adminAPI('POST', `/api/admin/works/${id}/approve`);
  if (result && result.success) { showToast('已批准', 'success'); loadWorks(); }
}

async function rejectWork(id) {
  const reason = prompt('拒绝原因（可选）');
  const result = await adminAPI('POST', `/api/admin/works/${id}/reject`, { reason });
  if (result && result.success) { showToast('已拒绝', 'success'); loadWorks(); }
}

// Batch approve/reject works
async function batchApproveWorks() {
  const pendingWorks = adminWorksData.filter(w => w.approvalStatus === 'pending');
  if (pendingWorks.length === 0) { alert('没有待审核的作品'); return; }
  if (!confirm(`确定批准全部 ${pendingWorks.length} 个待审核作品？`)) return;

  let success = 0;
  for (const w of pendingWorks) {
    const result = await adminAPI('POST', `/api/admin/works/${w.id}/approve`);
    if (result && result.success) success++;
  }
  showToast(`已批准 ${success} 个作品`, 'success');
  loadWorks();
}

async function batchRejectWorks() {
  const pendingWorks = adminWorksData.filter(w => w.approvalStatus === 'pending');
  if (pendingWorks.length === 0) { alert('没有待审核的作品'); return; }
  const reason = prompt('拒绝原因（可选）');
  if (reason === null) return;
  if (!confirm(`确定拒绝全部 ${pendingWorks.length} 个待审核作品？`)) return;

  let success = 0;
  for (const w of pendingWorks) {
    const result = await adminAPI('POST', `/api/admin/works/${w.id}/reject`, { reason });
    if (result && result.success) success++;
  }
  showToast(`已拒绝 ${success} 个作品`, 'success');
  loadWorks();
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function makeEditable(cell, workId, field, currentValue) {
  if (cell.querySelector('input')) return;
  const original = cell.innerHTML;
  cell.innerHTML = `<input type="text" class="form-input" value="${currentValue}" style="padding:0.3rem 0.5rem;font-size:0.85rem;width:100%;">`;
  const input = cell.querySelector('input');
  input.focus();
  input.select();
  const save = async () => {
    const newValue = input.value;
    if (newValue !== currentValue) {
      await inlineUpdateWork(workId, field, newValue);
    }
    cell.innerHTML = original;
    loadWorks();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { cell.innerHTML = original; } });
}

function makeSelectCategory(cell, workId, currentValue) {
  if (cell.querySelector('select')) return;
  const original = cell.innerHTML;
  const options = Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${k === currentValue ? 'selected' : ''}>${v}</option>`).join('');
  cell.innerHTML = `<select class="form-input" style="padding:0.3rem 0.5rem;font-size:0.85rem;">${options}</select>`;
  const select = cell.querySelector('select');
  select.focus();
  const save = async () => {
    const newValue = select.value;
    if (newValue !== currentValue) {
      await inlineUpdateWork(workId, 'category', newValue);
    }
    cell.innerHTML = original;
    loadWorks();
  };
  select.addEventListener('blur', save);
  select.addEventListener('change', () => select.blur());
}

function makeSelectStatus(cell, workId, currentValue) {
  if (cell.querySelector('select')) return;
  const original = cell.innerHTML;
  const options = Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${k === currentValue ? 'selected' : ''}>${v}</option>`).join('');
  cell.innerHTML = `<select class="form-input" style="padding:0.3rem 0.5rem;font-size:0.85rem;">${options}</select>`;
  const select = cell.querySelector('select');
  select.focus();
  const save = async () => {
    const newValue = select.value;
    if (newValue !== currentValue) {
      await inlineUpdateWork(workId, 'status', newValue);
    }
    cell.innerHTML = original;
    loadWorks();
  };
  select.addEventListener('blur', save);
  select.addEventListener('change', () => select.blur());
}

function makeSelectCircles(cell, workId, currentCircles) {
  if (cell.querySelector('input')) return;
  const original = cell.innerHTML;
  const circles = Array.isArray(currentCircles) ? [...currentCircles] : [];
  const datalistOptions = adminCirclesData.map(c => `<option value="${c.name}">`).join('');

  function renderCell() {
    const tags = circles.map((cid, i) => {
      const name = adminCirclesMap[cid] || cid;
      return `<span style="display:inline-flex;align-items:center;gap:0.2rem;padding:0.15rem 0.5rem;background:rgba(233,69,96,0.08);border-radius:100px;font-size:0.8rem;">${escapeHtml(name)}<span data-rm="${i}" style="cursor:pointer;color:var(--accent);font-weight:bold;margin-left:0.15rem;">&times;</span></span>`;
    }).join('');
    cell.innerHTML = `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:0.3rem;">${tags}<input list="circleListInline" style="border:none;outline:none;font-size:0.8rem;width:80px;padding:0.15rem;" placeholder="添加..."><datalist id="circleListInline">${datalistOptions}</datalist></div>`;

    // Remove tag
    cell.querySelectorAll('[data-rm]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.rm);
        circles.splice(idx, 1);
        await inlineUpdateWork(workId, 'circles', circles);
        renderCell();
      });
    });

    // Add tag
    const input = cell.querySelector('input');
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const name = input.value.trim();
        if (!name) return;
        const matched = adminCirclesData.find(c => c.name === name);
        const cid = matched ? matched.id : name;
        if (!circles.includes(cid)) {
          circles.push(cid);
          await inlineUpdateWork(workId, 'circles', circles);
        }
        input.value = '';
        renderCell();
      } else if (e.key === 'Escape') {
        cell.innerHTML = original;
      }
    });
    input.addEventListener('blur', async () => {
      const name = input.value.trim();
      if (name) {
        const matched = adminCirclesData.find(c => c.name === name);
        const cid = matched ? matched.id : name;
        if (!circles.includes(cid)) {
          circles.push(cid);
          await inlineUpdateWork(workId, 'circles', circles);
        }
      }
      input.value = '';
      loadWorks();
    });
  }

  renderCell();
}

async function inlineUpdateWork(workId, field, value) {
  const works = await adminAPI('GET', '/api/admin/works');
  const work = works.find(w => w.id === workId);
  if (!work) return;
  work[field] = value;
  await adminAPI('PUT', `/api/admin/works/${workId}`, work);
  showToast('已保存', 'success');
}

async function quickUploadWorkImage(workId, input) {
  if (!input.files.length) return;
  const works = await adminAPI('GET', '/api/admin/works');
  const work = works.find(w => w.id === workId);
  if (!work) return;
  const res = await uploadImage(input.files[0]);
  if (res.url) {
    const images = [...(work.images || []), res.url];
    await adminAPI('PUT', `/api/admin/works/${workId}`, { ...work, images });
    showToast('图片已上传', 'success');
    loadWorks();
  }
  input.value = '';
}

async function removeWorkImage(workId, index) {
  const works = await adminAPI('GET', '/api/admin/works');
  const work = works.find(w => w.id === workId);
  if (!work) return;
  const images = [...(work.images || [])];
  images.splice(index, 1);
  await adminAPI('PUT', `/api/admin/works/${workId}`, { ...work, images });
  showToast('图片已移除', 'success');
  loadWorks();
}

function filterWorks() {
  const search = document.getElementById('worksSearch').value.toLowerCase();
  if (!search) { renderWorksTable(adminWorksData); return; }
  const filtered = adminWorksData.filter(w =>
    w.title.toLowerCase().includes(search) ||
    (w.circles || []).some(cid => (adminCirclesMap[cid] || cid || '').toLowerCase().includes(search)) ||
    (CATEGORIES[w.category] || '').includes(search) ||
    w.price.toLowerCase().includes(search)
  );
  renderWorksTable(filtered);
}

// Export works to Excel
async function exportAdminWorks() {
  showToast('正在获取全部数据...', 'info');
  // Fetch all works without pagination
  const allWorks = await adminAPI('GET', '/api/admin/works');
  if (!allWorks || allWorks.length === 0) { alert('没有作品可导出'); return; }

  const headers = ['作品名称', '作者', '分类', '状态', '价格', '发售日期', '标签', '喜爱数', '想要数', '描述'];
  const rows = allWorks.map(w => [
    w.title,
    (w.circles || []).map(cid => adminCirclesMap[cid] || cid).join(', '),
    CATEGORIES[w.category] || w.category || '',
    STATUS_LABELS[w.status] || w.status || '',
    w.price || '',
    w.releaseDate || '',
    (w.tags || []).join(', '),
    w.likes || 0,
    w.wants || 0,
    w.description || ''
  ]);

  let csv = '\uFEFF' + headers.join(',') + '\n';
  rows.forEach(row => {
    csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `作品列表_${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  showToast(`导出成功，共 ${allWorks.length} 条`, 'success');
}

// Export events to Excel
async function exportAdminEvents() {
  showToast('正在获取全部数据...', 'info');
  const allEvents = await adminAPI('GET', '/api/admin/events');
  if (!allEvents || allEvents.length === 0) { alert('没有活动可导出'); return; }
  const headers = ['活动名称', '状态', '开始日期', '结束日期', '地点', '描述'];
  const rows = allEvents.map(e => [
    e.title,
    EVENT_STATUS_LABELS[e.status] || e.status || '',
    e.date || '',
    e.endDate || '',
    e.location || '',
    e.description || ''
  ]);
  let csv = '\uFEFF' + headers.join(',') + '\n';
  rows.forEach(row => { csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n'; });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `活动列表_${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  showToast(`导出成功，共 ${allEvents.length} 条`, 'success');
}

// Export circles to Excel
async function exportAdminCircles() {
  showToast('正在获取全部数据...', 'info');
  const allCircles = await adminAPI('GET', '/api/admin/circles');
  if (!allCircles || allCircles.length === 0) { alert('没有作者可导出'); return; }
  const headers = ['作者名称', '分类', '描述', '联系方式'];
  const rows = allCircles.map(c => [
    c.name,
    CIRCLE_CATEGORIES[c.category] || c.category || '',
    c.description || '',
    c.socialLinks?.qq || c.socialLinks?.qqGroup || ''
  ]);
  let csv = '\uFEFF' + headers.join(',') + '\n';
  rows.forEach(row => { csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n'; });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `作者列表_${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  showToast(`导出成功，共 ${allCircles.length} 条`, 'success');
}

// Export projects to Excel
async function exportAdminProjects() {
  showToast('正在获取全部数据...', 'info');
  const allProjects = await adminAPI('GET', '/api/admin/projects');
  if (!allProjects || allProjects.length === 0) { alert('没有企划可导出'); return; }
  const headers = ['企划名称', '分类', '状态', '描述'];
  const rows = allProjects.map(p => [
    p.title,
    PROJECT_CATEGORIES[p.category] || p.category || '',
    PROJECT_STATUS_LABELS[p.status] || p.status || '',
    p.description || ''
  ]);
  let csv = '\uFEFF' + headers.join(',') + '\n';
  rows.forEach(row => { csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n'; });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `企划列表_${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  showToast(`导出成功，共 ${allProjects.length} 条`, 'success');
}

// Export updates to Excel
async function exportAdminUpdates() {
  showToast('正在获取全部数据...', 'info');
  const allUpdates = await adminAPI('GET', '/api/admin/updates');
  if (!allUpdates || allUpdates.length === 0) { alert('没有动态可导出'); return; }
  const headers = ['标题', '发布日期', '置顶', '内容'];
  const rows = allUpdates.map(u => [
    u.title,
    u.publishDate || '',
    u.pinned ? '是' : '否',
    u.content || ''
  ]);
  let csv = '\uFEFF' + headers.join(',') + '\n';
  rows.forEach(row => { csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n'; });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `动态列表_${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  showToast(`导出成功，共 ${allUpdates.length} 条`, 'success');
}

// Import works from Excel
async function importAdminWorks(input) {
  if (!input.files.length) return;
  const file = input.files[0];
  const formData = new FormData();
  formData.append('file', file);

  try {
    showToast('导入中...', 'info');
    const res = await fetch('/api/admin/works/import', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    const result = await res.json();
    if (result.error) {
      alert('导入失败: ' + result.error);
    } else {
      showToast(`导入完成：新增 ${result.added || 0}，更新 ${result.updated || 0}`, 'success');
      loadWorks();
    }
  } catch (e) {
    alert('导入失败: ' + e.message);
  }
  input.value = '';
}

// Import events from Excel
async function importAdminEvents(input) {
  if (!input.files.length) return;
  const file = input.files[0];
  const formData = new FormData();
  formData.append('file', file);
  try {
    showToast('导入中...', 'info');
    const res = await fetch('/api/admin/events/import', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    const result = await res.json();
    if (result.error) {
      alert('导入失败: ' + result.error);
    } else {
      showToast(`导入完成：新增 ${result.added || 0}，更新 ${result.updated || 0}`, 'success');
      loadEvents();
    }
  } catch (e) {
    alert('导入失败: ' + e.message);
  }
  input.value = '';
}

// Import projects from Excel
async function importAdminProjects(input) {
  if (!input.files.length) return;
  const file = input.files[0];
  const formData = new FormData();
  formData.append('file', file);
  try {
    showToast('导入中...', 'info');
    const res = await fetch('/api/admin/projects/import', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    const result = await res.json();
    if (result.error) {
      alert('导入失败: ' + result.error);
    } else {
      showToast(`导入完成：新增 ${result.added || 0}，更新 ${result.updated || 0}`, 'success');
      loadProjects();
    }
  } catch (e) {
    alert('导入失败: ' + e.message);
  }
  input.value = '';
}

// Import updates from Excel
async function importAdminUpdates(input) {
  if (!input.files.length) return;
  const file = input.files[0];
  const formData = new FormData();
  formData.append('file', file);
  try {
    showToast('导入中...', 'info');
    const res = await fetch('/api/admin/updates/import', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    const result = await res.json();
    if (result.error) {
      alert('导入失败: ' + result.error);
    } else {
      showToast(`导入完成：新增 ${result.added || 0}，更新 ${result.updated || 0}`, 'success');
      loadUpdates();
    }
  } catch (e) {
    alert('导入失败: ' + e.message);
  }
  input.value = '';
}

function openWorkModal(work = null, returnToCircleId = null) {
  const isEdit = !!work;
  document.getElementById('modalTitle').textContent = isEdit ? '编辑作品' : '新增作品';
  document.getElementById('modalBody').innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label>标题 <span style="color:var(--accent)">*</span></label>
        <input class="form-input" id="wTitle" value="${work?.title || ''}" required>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>分类 <span style="color:var(--accent)">*</span></label>
        <select class="form-input" id="wCategory">
          ${Object.entries(CATEGORIES).map(([k, v]) =>
            `<option value="${k}" ${work?.category === k ? 'selected' : ''}>${v}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>状态</label>
        <select class="form-input" id="wStatus">
          ${Object.entries(STATUS_LABELS).map(([k, v]) =>
            `<option value="${k}" ${work?.status === k ? 'selected' : ''}>${v}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>价格</label>
        <input class="form-input" id="wPrice" value="${work?.price || ''}" placeholder="¥0">
      </div>
      <div class="form-group">
        <label>发售日</label>
        <input type="date" class="form-input" id="wReleaseDate" value="${work?.releaseDate || ''}">
      </div>
    </div>
    ${isEdit ? `<div class="form-row">
      <div class="form-group">
        <label>点赞数</label>
        <input type="number" class="form-input" id="wLikes" value="${work?.likes || 0}" min="0">
      </div>
      <div class="form-group">
        <label>想要数</label>
        <input type="number" class="form-input" id="wWants" value="${work?.wants || 0}" min="0">
      </div>
    </div>` : ''}
    <div class="form-group">
      <label>作者</label>
      <div id="wCirclesTags" style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-bottom:0.5rem;">
        ${(work?.circles || []).map((cid, i) => `<span class="circle-tag" data-cid="${cid}" style="display:inline-flex;align-items:center;gap:0.2rem;padding:0.2rem 0.6rem;background:rgba(233,69,96,0.08);border-radius:100px;font-size:0.85rem;">${escapeHtml(adminCirclesMap[cid] || cid)}<span class="rm-circle-tag" data-rm="${i}" style="cursor:pointer;color:var(--accent);font-weight:bold;">&times;</span></span>`).join('')}
      </div>
      <div style="display:flex;gap:0.4rem;">
        <input list="wCircleList" class="form-input" id="wCircleInput" placeholder="输入作者名添加..." style="flex:1;padding:0.35rem 0.6rem;font-size:0.85rem;">
        <datalist id="wCircleList">${adminCirclesData.map(c => `<option value="${c.name}">`).join('')}</datalist>
        <button type="button" class="btn-sm btn-edit" id="addCircleBtn">添加</button>
      </div>
    </div>
    <div class="form-group">
      <label>标签（逗号分隔）</label>
      <input class="form-input" id="wTags" value="${work?.tags?.join(', ') || ''}" placeholder="手办, 东方">
    </div>
    <div class="form-group">
      <label>描述</label>
      <textarea class="form-input" id="wDesc">${work?.description || ''}</textarea>
    </div>
    <div class="form-group">
      <label>联系方式类型</label>
      <select class="form-input" id="wContactType">
        <option value="" ${!work?.socialLinks?.qq && !work?.socialLinks?.qqGroup ? 'selected' : ''}>无</option>
        <option value="qq" ${work?.socialLinks?.qq ? 'selected' : ''}>QQ</option>
        <option value="qqGroup" ${work?.socialLinks?.qqGroup ? 'selected' : ''}>QQ群</option>
      </select>
    </div>
    <div class="form-group">
      <label>联系方式</label>
      <input class="form-input" id="wContactValue" value="${work?.socialLinks?.qq || work?.socialLinks?.qqGroup || ''}" placeholder="QQ号或QQ群号">
    </div>
    <div class="form-group">
      <label>显示名称（前台显示的中文）</label>
      <input class="form-input" id="wContactLabel" value="${work?.socialLinks?.contactLabel || ''}" placeholder="如：QQ联系、加入QQ群">
    </div>
    <div class="form-group">
      <label>网站链接</label>
      <input class="form-input" id="wWebsite" value="${work?.socialLinks?.website || ''}" placeholder="https://...">
    </div>
    <div class="form-group">
      <label>网站显示名称</label>
      <input class="form-input" id="wWebsiteLabel" value="${work?.socialLinks?.websiteLabel || ''}" placeholder="如：访问官网、购买链接">
    </div>
    <div class="form-group">
      <label>展示图片</label>
      <div id="wImagePreview" style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.5rem;">
        ${(work?.images || []).map((img, i) => `
          <div style="position:relative;">
            <img src="${img}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;">
            <button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button>
          </div>
        `).join('')}
      </div>
      <input type="file" id="wImage" accept="image/*" multiple style="font-size:0.85rem;">
      <div style="display:flex;gap:0.4rem;margin-top:0.4rem;">
        <button type="button" class="btn-sm btn-edit" onclick="uploadWorkImages()">上传图片</button>
        <button type="button" class="btn-sm" style="background:var(--accent-alt);color:white;" onclick="pickImageFromLibrary('work-images')">从图片库选择</button>
      </div>
    </div>
    <div class="form-group">
      <label>更多图片</label>
      <div id="wMoreImagePreview" style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.5rem;">
        ${(work?.moreImages || []).map((img, i) => `
          <div style="position:relative;">
            <img src="${img}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;">
            <button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button>
          </div>
        `).join('')}
      </div>
      <input type="file" id="wMoreImage" accept="image/*" multiple style="font-size:0.85rem;">
      <div style="display:flex;gap:0.4rem;margin-top:0.4rem;">
        <button type="button" class="btn-sm btn-edit" onclick="uploadWorkMoreImages()">上传图片</button>
        <button type="button" class="btn-sm" style="background:var(--accent-alt);color:white;" onclick="pickImageFromLibrary('work-more-images')">从图片库选择</button>
      </div>
    </div>
    <div class="form-group">
      <label>关联企划</label>
      <input type="text" class="form-input" id="wProjectSearch" placeholder="搜索企划名称..." style="margin-bottom:0.5rem;padding:0.4rem 0.6rem;font-size:0.85rem;" oninput="filterWorkProjectsList(this.value)">
      <div id="wProjectsList" style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0.5rem;">
        ${adminProjectsData.map(p => `
          <label class="work-project-item" data-title="${(p.title || '').toLowerCase()}" style="display:flex;align-items:center;gap:0.5rem;padding:0.3rem;cursor:pointer;font-size:0.85rem;">
            <input type="checkbox" class="w-project-cb" value="${p.id}" ${(work?.relatedProjects || []).includes(p.id) || false ? 'checked' : ''} style="width:14px;height:14px;accent-color:var(--accent);">
            ${escapeHtml(p.title)}
          </label>
        `).join('') || '<p style="color:var(--haze);font-size:0.85rem;">暂无企划</p>'}
      </div>
    </div>
  `;

  document.getElementById('modalSave').onclick = async () => {
    const data = {
      title: document.getElementById('wTitle').value,
      category: document.getElementById('wCategory').value,
      status: document.getElementById('wStatus').value,
      price: document.getElementById('wPrice').value,
      releaseDate: document.getElementById('wReleaseDate').value,
      circles: [...document.querySelectorAll('#wCirclesTags .circle-tag')].map(el => el.dataset.cid),
      tags: document.getElementById('wTags').value.split(',').map(t => t.trim()).filter(Boolean),
      description: document.getElementById('wDesc').value,
      images: [...document.querySelectorAll('#wImagePreview img')].map(img => img.src),
      moreImages: [...document.querySelectorAll('#wMoreImagePreview img')].map(img => img.src),
      socialLinks: (() => {
        const type = document.getElementById('wContactType').value;
        const value = document.getElementById('wContactValue').value;
        const sl = {
          contactLabel: document.getElementById('wContactLabel').value,
          website: document.getElementById('wWebsite').value,
          websiteLabel: document.getElementById('wWebsiteLabel').value
        };
        if (type && value) sl[type] = value;
        return sl;
      })()
    };
    if (isEdit) {
      const likesInput = document.getElementById('wLikes');
      if (likesInput) data.likes = parseInt(likesInput.value) || 0;
      const wantsInput = document.getElementById('wWants');
      if (wantsInput) data.wants = parseInt(wantsInput.value) || 0;
    }

    if (!data.title) { alert('请填写标题'); return; }

    // Handle project association
    const selectedProjectIds = [...document.querySelectorAll('.w-project-cb:checked')].map(cb => cb.value);

    if (isEdit) {
      await adminAPI('PUT', `/api/admin/works/${work.id}`, data);
      // Update project associations
      const allProjects = await adminAPI('GET', '/api/admin/projects');
      for (const proj of allProjects) {
        const hasWork = (proj.works || []).includes(work.id);
        const shouldHave = selectedProjectIds.includes(proj.id);
        if (hasWork && !shouldHave) {
          proj.works = proj.works.filter(id => id !== work.id);
          await adminAPI('PUT', `/api/admin/projects/${proj.id}`, proj);
        } else if (!hasWork && shouldHave) {
          if (!proj.works) proj.works = [];
          proj.works.push(work.id);
          await adminAPI('PUT', `/api/admin/projects/${proj.id}`, proj);
        }
      }
    } else {
      if (returnToCircleId && !data.circles.includes(returnToCircleId)) data.circles.push(returnToCircleId);
      await adminAPI('POST', '/api/admin/works', data);
    }
    closeModal();
    loadWorks();
    if (returnToCircleId) {
      setTimeout(() => manageCircleWorks(returnToCircleId), 100);
    }
  };

  openModal();

  // Circle tag management
  function addCircleTag() {
    const input = document.getElementById('wCircleInput');
    const name = input.value.trim();
    if (!name) return;
    const matched = adminCirclesData.find(c => c.name === name);
    const cid = matched ? matched.id : name;
    const existing = [...document.querySelectorAll('#wCirclesTags .circle-tag')].map(el => el.dataset.cid);
    if (existing.includes(cid)) { input.value = ''; return; }
    const tagsDiv = document.getElementById('wCirclesTags');
    const span = document.createElement('span');
    span.className = 'circle-tag';
    span.dataset.cid = cid;
    span.style.cssText = 'display:inline-flex;align-items:center;gap:0.2rem;padding:0.2rem 0.6rem;background:rgba(233,69,96,0.08);border-radius:100px;font-size:0.85rem;';
    span.innerHTML = `${escapeHtml(name)}<span class="rm-circle-tag" style="cursor:pointer;color:var(--accent);font-weight:bold;">&times;</span>`;
    span.querySelector('.rm-circle-tag').addEventListener('click', () => span.remove());
    tagsDiv.appendChild(span);
    input.value = '';
  }
  document.getElementById('addCircleBtn').addEventListener('click', addCircleTag);
  document.getElementById('wCircleInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCircleTag(); } });
  document.querySelectorAll('#wCirclesTags .rm-circle-tag').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.circle-tag').remove());
  });
}

async function uploadWorkImages() {
  const input = document.getElementById('wImage');
  const preview = document.getElementById('wImagePreview');
  if (!input.files.length) { alert('请选择图片'); return; }
  for (const file of input.files) {
    const res = await uploadImage(file);
    if (res.url) {
      const div = document.createElement('div');
      div.style.position = 'relative';
      div.innerHTML = `<img src="${res.url}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;"><button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button>`;
      preview.appendChild(div);
    }
  }
  input.value = '';
}

async function uploadWorkMoreImages() {
  const input = document.getElementById('wMoreImage');
  const preview = document.getElementById('wMoreImagePreview');
  if (!input.files.length) { alert('请选择图片'); return; }
  for (const file of input.files) {
    const res = await uploadImage(file);
    if (res.url) {
      const div = document.createElement('div');
      div.style.position = 'relative';
      div.innerHTML = `<img src="${res.url}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;"><button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button>`;
      preview.appendChild(div);
    }
  }
  input.value = '';
}

function filterWorkProjectsList(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.work-project-item').forEach(item => {
    const title = item.dataset.title || '';
    item.style.display = title.includes(q) ? 'flex' : 'none';
  });
}

async function editWork(id) {
  const [works, projects] = await Promise.all([
    adminAPI('GET', '/api/admin/works'),
    adminAPI('GET', '/api/admin/projects')
  ]);
  const work = works.find(w => w.id === id);
  if (work) {
    // Compute related projects
    work.relatedProjects = (projects || []).filter(p => (p.works || []).includes(id)).map(p => p.id);
    openWorkModal(work);
  }
}

async function deleteWork(id) {
  if (!confirm('确定要删除这个作品吗？')) return;
  await adminAPI('DELETE', `/api/admin/works/${id}`);
  loadWorks();
}

// ===== Batch Edit =====
function updateBatchBtn() {
  const checked = document.querySelectorAll('.work-checkbox:checked');
  const editBtn = document.getElementById('batchEditBtn');
  const deleteBtn = document.getElementById('batchDeleteBtn');
  if (editBtn) editBtn.style.display = checked.length > 1 ? 'inline-flex' : 'none';
  if (deleteBtn) deleteBtn.style.display = checked.length > 0 ? 'inline-flex' : 'none';
}

function toggleSelectAllWorks() {
  const selectAll = document.getElementById('worksSelectAll');
  document.querySelectorAll('.work-checkbox').forEach(cb => {
    cb.checked = selectAll.checked;
  });
  updateBatchBtn();
}

function addBatchCircleTag() {
  const input = document.getElementById('batchCircleInput');
  const name = input.value.trim();
  if (!name) return;
  const matched = adminCirclesData.find(c => c.name === name);
  const cid = matched ? matched.id : name;
  const existing = [...document.querySelectorAll('#batchCirclesTags .circle-tag')].map(el => el.dataset.cid);
  if (existing.includes(cid)) { input.value = ''; return; }
  const tagsDiv = document.getElementById('batchCirclesTags');
  const span = document.createElement('span');
  span.className = 'circle-tag';
  span.dataset.cid = cid;
  span.style.cssText = 'display:inline-flex;align-items:center;gap:0.2rem;padding:0.2rem 0.6rem;background:rgba(233,69,96,0.08);border-radius:100px;font-size:0.85rem;';
  span.innerHTML = `${escapeHtml(name)}<span class="rm-circle-tag" style="cursor:pointer;color:var(--accent);font-weight:bold;">&times;</span>`;
  span.querySelector('.rm-circle-tag').addEventListener('click', () => span.remove());
  tagsDiv.appendChild(span);
  input.value = '';
}
function clearBatchCircles() {
  const tagsDiv = document.getElementById('batchCirclesTags');
  if (tagsDiv) tagsDiv.innerHTML = '';
}

async function openBatchEditModal() {
  const checkedIds = [...document.querySelectorAll('.work-checkbox:checked')].map(cb => cb.value);
  if (checkedIds.length < 2) { alert('请至少选择2个作品'); return; }
  const works = await adminAPI('GET', '/api/admin/works');
  const selectedWorks = works.filter(w => checkedIds.includes(w.id));
  renderBatchEditForm(selectedWorks);
}

async function openCircleBatchEdit(circleId) {
  const checkedIds = [...document.querySelectorAll('.circle-work-checkbox:checked')].map(cb => cb.value);
  if (checkedIds.length < 2) { alert('请至少选择2个作品'); return; }
  const works = await adminAPI('GET', '/api/admin/works');
  const selectedWorks = works.filter(w => checkedIds.includes(w.id));
  renderBatchEditForm(selectedWorks, circleId);
}

function getFieldValue(works, field, transform) {
  const values = [...new Set(works.map(w => transform ? transform(w[field]) : w[field]).filter(v => v !== undefined && v !== null && v !== ''))];
  return values.length === 1 ? values[0] : null;
}

function renderBatchEditForm(selectedWorks, returnToCircleId = null) {
  const mixed = '（多个不同值）';

  const catVal = getFieldValue(selectedWorks, 'category');
  const statusVal = getFieldValue(selectedWorks, 'status');
  const priceVal = getFieldValue(selectedWorks, 'price');
  const circleVal = getFieldValue(selectedWorks, 'circles');
  const releaseDateVal = getFieldValue(selectedWorks, 'releaseDate');
  const descVal = getFieldValue(selectedWorks, 'description');
  const tagsVal = getFieldValue(selectedWorks, 'tags', t => (t || []).join(', '));

  document.getElementById('modalTitle').textContent = `批量编辑 (${selectedWorks.length} 个作品)`;
  document.getElementById('modalBody').innerHTML = `
    <div style="margin-bottom:1rem;padding:0.6rem 0.8rem;background:rgba(233,69,96,0.04);border-radius:var(--radius-sm);font-size:0.8rem;color:var(--haze);">
      已选：${selectedWorks.map(w => w.title).join('、')}
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>分类</label>
        <select class="form-input" id="batch_category">
          <option value="">— 不修改 —</option>
          ${Object.entries(CATEGORIES).map(([k, v]) =>
            `<option value="${k}" ${catVal === k ? 'selected' : ''}>${v}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>状态</label>
        <select class="form-input" id="batch_status">
          <option value="">— 不修改 —</option>
          ${Object.entries(STATUS_LABELS).map(([k, v]) =>
            `<option value="${k}" ${statusVal === k ? 'selected' : ''}>${v}</option>`
          ).join('')}
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>价格</label>
        <input class="form-input" id="batch_price" value="${priceVal || ''}" placeholder="${priceVal === null ? mixed : '¥0'}">
      </div>
      <div class="form-group">
        <label>发售日</label>
        <input type="date" class="form-input" id="batch_releaseDate" value="${releaseDateVal || ''}" placeholder="${releaseDateVal === null ? mixed : ''}">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>作者</label>
        <div id="batchCirclesTags" style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-bottom:0.5rem;"></div>
        <div style="display:flex;gap:0.4rem;">
          <input list="batchCircleList" class="form-input" id="batchCircleInput" placeholder="输入作者名添加..." style="flex:1;padding:0.35rem 0.6rem;font-size:0.85rem;">
          <datalist id="batchCircleList">${adminCirclesData.map(c => `<option value="${c.name}">`).join('')}</datalist>
          <button type="button" class="btn-sm btn-edit" onclick="addBatchCircleTag()">添加</button>
        </div>
        <button type="button" class="btn-sm" style="background:var(--border);color:var(--ink);margin-top:0.3rem;font-size:0.75rem;" onclick="clearBatchCircles()">清除所有作者</button>
      </div>
    </div>

    <div class="form-group">
      <label>标签（逗号分隔，留空不修改）</label>
      <input class="form-input" id="batch_tags" value="${tagsVal || ''}" placeholder="${tagsVal === null ? mixed : '标签1, 标签2'}">
    </div>

    <div class="form-group">
      <label>描述（留空不修改）</label>
      <textarea class="form-input" id="batch_desc" placeholder="${descVal === null ? mixed : ''}" style="min-height:60px;">${descVal || ''}</textarea>
    </div>

    <p style="color:var(--haze);font-size:0.75rem;margin-top:0.5rem;">提示：留空的字段不会被修改。选中作品共有的值会自动填充，不同值显示"${mixed}"。</p>
  `;

  document.getElementById('modalSave').onclick = async () => {
    const updates = {};
    const cat = document.getElementById('batch_category').value;
    const status = document.getElementById('batch_status').value;
    const price = document.getElementById('batch_price').value;
    const batchCircles = [...document.querySelectorAll('#batchCirclesTags .circle-tag')].map(el => el.dataset.cid);
    const releaseDate = document.getElementById('batch_releaseDate').value;
    const tags = document.getElementById('batch_tags').value;
    const desc = document.getElementById('batch_desc').value;

    if (cat) updates.category = cat;
    if (status) updates.status = status;
    if (price) updates.price = price;
    if (batchCircles.length > 0) updates.circles = batchCircles;
    if (releaseDate) updates.releaseDate = releaseDate;
    if (tags) updates.tags = tags.split(',').map(t => t.trim()).filter(Boolean);
    if (desc) updates.description = desc;

    if (Object.keys(updates).length === 0) { alert('未修改任何内容'); return; }

    for (const work of selectedWorks) {
      await adminAPI('PUT', `/api/admin/works/${work.id}`, { ...work, ...updates });
    }

    closeModal();
    document.getElementById('worksSelectAll') && (document.getElementById('worksSelectAll').checked = false);
    if (returnToCircleId) {
      manageCircleWorks(returnToCircleId);
    } else {
      loadWorks();
    }
  };

  openModal();
}

// ===== Events =====
async function loadEvents(page = 1) {
  const [eventsResp, allWorks, allCircles] = await Promise.all([
    adminAPI('GET', `/api/admin/events?page=${page}&limit=${PAGE_LIMIT}`),
    adminAPI('GET', '/api/admin/works'),
    adminAPI('GET', '/api/admin/circles')
  ]);

  // Handle paginated response
  if (eventsResp && eventsResp.items) {
    adminEventsData = eventsResp.items;
    pagination.events = { page: eventsResp.page, total: eventsResp.total, totalPages: eventsResp.totalPages };
  } else {
    adminEventsData = eventsResp || [];
    pagination.events = { page: 1, total: adminEventsData.length, totalPages: 1 };
  }

  (allCircles || []).forEach(c => adminCirclesMap[c.id] = c.name);
  renderEventsTable(adminEventsData);
  // Render pagination
  const paginationEl = document.getElementById('eventsPagination');
  if (paginationEl) paginationEl.innerHTML = renderPagination('events', 'loadEvents');
}

function renderEventsTable(events) {
  const tbody = document.getElementById('eventsTableBody');
  if (!events || events.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--haze);padding:2rem;">暂无活动</td></tr>';
    return;
  }
  tbody.innerHTML = events.map((e, i) => {
    const worksCount = (e.relatedWorks || []).length;
    const projectsCount = (e.relatedProjects || []).length;
    const approvalBadge = e.approvalStatus === 'approved' ? '<span style="background:#2ecc71;color:white;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.7rem;">已批准</span>'
      : e.approvalStatus === 'rejected' ? '<span style="background:var(--accent);color:white;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.7rem;">已拒绝</span>'
      : e.approvalStatus === 'pending' ? '<span style="background:#f39c12;color:white;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.7rem;">待审核</span>'
      : '<span style="background:var(--haze);color:white;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.7rem;">-</span>';
    const approveBtn = e.approvalStatus === 'pending' ? `<button class="btn-sm" style="background:#2ecc71;color:white;" onclick="approveEvent('${e.id}')">批准</button><button class="btn-sm" style="background:var(--accent);color:white;" onclick="rejectEvent('${e.id}')">拒绝</button>` : '';
    const editableAuthors = (e.editableBy || []).map(cid => {
      const circle = adminCirclesMap[cid];
      return circle ? `<span style="background:var(--paper);padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;margin-right:0.2rem;">${escapeHtml(circle)}</span>` : '';
    }).join('') || '<span style="color:var(--haze);font-size:0.75rem;">-</span>';
    return `
    <tr>
      <td>${renderOrderControls('events', e.id, i, events.length)}</td>
      <td><input type="checkbox" class="event-checkbox" value="${e.id}" onchange="updateEventBatchBtn()" style="width:16px;height:16px;accent-color:var(--accent);"></td>
      <td class="editable-cell" onclick="makeEventEditable(this, '${e.id}', 'title', '${escapeHtml(e.title)}')">${e.title}</td>
      <td>${approvalBadge}</td>
      <td><span class="card-tag ${e.status || ''}">${EVENT_STATUS_LABELS[e.status] || e.status || '-'}</span></td>
      <td class="editable-cell" onclick="makeEventEditable(this, '${e.id}', 'date', '${e.date || ''}')">${e.date || '-'}</td>
      <td class="editable-cell truncate" onclick="makeEventEditable(this, '${e.id}', 'location', '${escapeHtml(e.location || '')}')">${e.location || '-'}</td>
      <td>作品${worksCount} / 企划${projectsCount}</td>
      <td>${editableAuthors} <button class="btn-sm" style="font-size:0.7rem;padding:0.1rem 0.3rem;" onclick="manageEditableAuthors('events','${e.id}')">管理</button></td>
      <td>
        <div class="table-actions">
          ${approveBtn}
          <button class="btn-sm btn-edit" onclick="manageEventWorks('${e.id}')">关联</button>
          <button class="btn-sm btn-edit" onclick="editEvent('${e.id}')">编辑</button>
          <button class="btn-sm btn-delete" onclick="deleteEvent('${e.id}')">删除</button>
        </div>
      </td>
    </tr>
  `}).join('');
}

async function approveEvent(id) {
  const result = await adminAPI('POST', `/api/admin/events/${id}/approve`);
  if (result && result.success) { showToast('已批准', 'success'); loadEvents(); }
}

// Batch approve/reject events
async function batchApproveEvents() {
  const pendingEvents = adminEventsData.filter(e => e.approvalStatus === 'pending');
  if (pendingEvents.length === 0) { alert('没有待审核的活动'); return; }
  if (!confirm(`确定批准全部 ${pendingEvents.length} 个待审核活动？`)) return;

  let success = 0;
  for (const e of pendingEvents) {
    const result = await adminAPI('POST', `/api/admin/events/${e.id}/approve`);
    if (result && result.success) success++;
  }
  showToast(`已批准 ${success} 个活动`, 'success');
  loadEvents();
}

async function batchRejectEvents() {
  const pendingEvents = adminEventsData.filter(e => e.approvalStatus === 'pending');
  if (pendingEvents.length === 0) { alert('没有待审核的活动'); return; }
  const reason = prompt('拒绝原因（可选）');
  if (reason === null) return;
  if (!confirm(`确定拒绝全部 ${pendingEvents.length} 个待审核活动？`)) return;

  let success = 0;
  for (const e of pendingEvents) {
    const result = await adminAPI('POST', `/api/admin/events/${e.id}/reject`, { reason });
    if (result && result.success) success++;
  }
  showToast(`已拒绝 ${success} 个活动`, 'success');
  loadEvents();
}

// Batch delete events
function updateEventBatchBtn() {
  const checked = document.querySelectorAll('.event-checkbox:checked');
  const btn = document.getElementById('eventsBatchDeleteBtn');
  if (btn) btn.style.display = checked.length > 0 ? 'inline-block' : 'none';
}

function toggleSelectAllEvents() {
  const selectAll = document.getElementById('eventsSelectAll');
  document.querySelectorAll('.event-checkbox').forEach(cb => cb.checked = selectAll.checked);
  updateEventBatchBtn();
}

async function batchDeleteEvents() {
  const checked = document.querySelectorAll('.event-checkbox:checked');
  if (checked.length === 0) { alert('请先选择要删除的活动'); return; }
  if (!confirm(`确定删除选中的 ${checked.length} 个活动？此操作不可撤销。`)) return;

  let success = 0;
  for (const cb of checked) {
    const result = await adminAPI('DELETE', `/api/admin/events/${cb.value}`);
    if (result && result.success) success++;
  }
  showToast(`已删除 ${success} 个活动`, 'success');
  loadEvents();
}

async function batchDeleteWorks() {
  const checked = document.querySelectorAll('.work-checkbox:checked');
  if (checked.length === 0) { alert('请先选择要删除的作品'); return; }
  if (!confirm(`确定删除选中的 ${checked.length} 个作品？此操作不可撤销。`)) return;

  let success = 0;
  for (const cb of checked) {
    const result = await adminAPI('DELETE', `/api/admin/works/${cb.value}`);
    if (result && result.success) success++;
  }
  showToast(`已删除 ${success} 个作品`, 'success');
  loadWorks();
}

// Manage editable authors for events/projects/updates
async function manageEditableAuthors(type, id) {
  const apiMap = { events: '/api/admin/events', projects: '/api/admin/projects', updates: '/api/admin/updates' };
  const items = await adminAPI('GET', apiMap[type]);
  const item = items?.find(i => i.id === id);
  if (!item) return;

  const circles = await adminAPI('GET', '/api/admin/circles');
  const approvedAuthors = (circles || []).filter(c => c.authorStatus === 'approved');

  const overlay = document.createElement('div');
  overlay.id = 'editableAuthorsOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem;';
  overlay.innerHTML = `<div style="background:var(--card-bg);border-radius:var(--radius);padding:1.5rem;max-width:400px;width:100%;max-height:80vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
      <h3 style="margin:0;">管理可编辑作者</h3>
      <button onclick="document.getElementById('editableAuthorsOverlay').remove()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--haze);">&times;</button>
    </div>
    <p style="font-size:0.85rem;color:var(--haze);margin-bottom:1rem;">选择可以编辑「${escapeHtml(item.title)}」的作者：</p>
    <div id="editableAuthorsList">
      ${approvedAuthors.map(c => `<label style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem;cursor:pointer;border-bottom:1px solid var(--border);">
        <input type="checkbox" class="editable-author-cb" value="${c.id}" ${(item.editableBy || []).includes(c.id) ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--accent);">
        ${escapeHtml(c.name)}
      </label>`).join('')}
    </div>
    <button class="btn btn-primary" style="width:100%;margin-top:1rem;" onclick="saveEditableAuthors('${type}','${id}')">保存</button>
  </div>`;
  document.body.appendChild(overlay);
}

async function saveEditableAuthors(type, id) {
  const checked = [...document.querySelectorAll('.editable-author-cb:checked')].map(cb => cb.value);
  const apiMap = { events: '/api/admin/events', projects: '/api/admin/projects', updates: '/api/admin/updates' };
  const items = await adminAPI('GET', apiMap[type]);
  const item = items?.find(i => i.id === id);
  if (!item) return;

  item.editableBy = checked;
  await adminAPI('PUT', `${apiMap[type]}/${id}`, item);
  showToast('已保存', 'success');
  document.getElementById('editableAuthorsOverlay')?.remove();
  if (type === 'events') loadEvents();
  else if (type === 'projects') loadProjects();
  else if (type === 'updates') loadUpdates();
}

async function rejectEvent(id) {
  const reason = prompt('拒绝原因（可选）');
  const result = await adminAPI('POST', `/api/admin/events/${id}/reject`, { reason });
  if (result && result.success) { showToast('已拒绝', 'success'); loadEvents(); }
}

async function inlineUpdateEvent(eventId, field, value) {
  const events = await adminAPI('GET', '/api/admin/events');
  const event = events.find(e => e.id === eventId);
  if (!event) return;
  event[field] = value;
  await adminAPI('PUT', `/api/admin/events/${eventId}`, event);
  showToast('已保存', 'success');
}

function makeEventEditable(cell, eventId, field, currentValue) {
  if (cell.querySelector('input')) return;
  const original = cell.innerHTML;
  const inputType = field === 'date' ? 'date' : 'text';
  cell.innerHTML = `<input type="${inputType}" class="form-input" value="${escapeHtml(currentValue)}" style="padding:0.3rem 0.5rem;font-size:0.85rem;width:100%;">`;
  const input = cell.querySelector('input');
  input.focus();
  input.select();
  const save = async () => {
    const newValue = input.value;
    if (newValue !== currentValue) {
      await inlineUpdateEvent(eventId, field, newValue);
    }
    loadEvents();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { cell.innerHTML = original; } });
}

function filterEvents() {
  const search = document.getElementById('eventsSearch').value.toLowerCase();
  if (!search) { renderEventsTable(adminEventsData); return; }
  const filtered = adminEventsData.filter(e =>
    e.title.toLowerCase().includes(search) ||
    (e.location || '').toLowerCase().includes(search) ||
    (e.description || '').toLowerCase().includes(search)
  );
  renderEventsTable(filtered);
}

function openEventModal(event = null) {
  const isEdit = !!event;
  document.getElementById('modalTitle').textContent = isEdit ? '编辑活动' : '新增活动';
  document.getElementById('modalBody').innerHTML = `
    <div class="form-group">
      <label>活动名称 <span style="color:var(--accent)">*</span></label>
      <input class="form-input" id="eTitle" value="${event?.title || ''}" required>
    </div>
    <div class="form-group">
      <label>状态</label>
      <select class="form-input" id="eStatus">
        ${(EVENT_STATUS_ORDERED.length > 0 ? EVENT_STATUS_ORDERED : [{id:'jijiangkaiqi',name:'即将开启'},{id:'jinxingzhong',name:'进行中'},{id:'yijiesu',name:'已结束'}]).map(s =>
          `<option value="${s.id}" ${event?.status === s.id ? 'selected' : ''}>${s.name}</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>开始日期</label>
        <input type="date" class="form-input" id="eDate" value="${event?.date || ''}">
      </div>
      <div class="form-group">
        <label>结束日期</label>
        <input type="date" class="form-input" id="eEndDate" value="${event?.endDate || ''}">
      </div>
    </div>
    <div class="form-group">
      <label>地点</label>
      <input class="form-input" id="eLocation" value="${event?.location || ''}">
    </div>
    <div class="form-group">
      <label>展位</label>
      <input class="form-input" id="eBooth" value="${event?.booth || ''}">
    </div>
    <div class="form-group">
      <label>描述</label>
      <textarea class="form-input" id="eDesc">${event?.description || ''}</textarea>
    </div>
    <div class="form-group">
      <label>联系方式类型</label>
      <select class="form-input" id="eContactType">
        <option value="" ${!event?.socialLinks?.qq && !event?.socialLinks?.qqGroup ? 'selected' : ''}>无</option>
        <option value="qq" ${event?.socialLinks?.qq ? 'selected' : ''}>QQ</option>
        <option value="qqGroup" ${event?.socialLinks?.qqGroup ? 'selected' : ''}>QQ群</option>
      </select>
    </div>
    <div class="form-group">
      <label>联系方式</label>
      <input class="form-input" id="eContactValue" value="${event?.socialLinks?.qq || event?.socialLinks?.qqGroup || ''}" placeholder="QQ号或QQ群号">
    </div>
    <div class="form-group">
      <label>显示名称（前台显示的中文）</label>
      <input class="form-input" id="eContactLabel" value="${event?.socialLinks?.contactLabel || ''}" placeholder="如：QQ联系、加入QQ群">
    </div>
    <div class="form-group">
      <label>网站链接</label>
      <input class="form-input" id="eWebsite" value="${event?.socialLinks?.website || ''}" placeholder="https://...">
    </div>
    <div class="form-group">
      <label>网站显示名称</label>
      <input class="form-input" id="eWebsiteLabel" value="${event?.socialLinks?.websiteLabel || ''}" placeholder="如：访问官网、活动主页">
    </div>
    <div class="form-group">
      <label>首图（时间轴和多格视图的封面图，仅限1张）</label>
      <div id="eCoverPreview" style="margin-bottom:0.5rem;">
        ${event?.coverImage ? `<div style="position:relative;display:inline-block;"><img src="${event.coverImage}" style="width:120px;height:80px;object-fit:cover;border-radius:6px;"><button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button></div>` : ''}
      </div>
      <input type="file" id="eCoverInput" accept="image/*" style="font-size:0.85rem;">
      <div style="display:flex;gap:0.4rem;margin-top:0.4rem;">
        <button type="button" class="btn-sm btn-edit" onclick="uploadEventCover()">上传首图</button>
        <button type="button" class="btn-sm" style="background:var(--accent-alt);color:white;" onclick="pickImageFromLibrary('event-cover')">从图片库选择</button>
      </div>
    </div>
    <div class="form-group">
      <label>详情图片（活动详情页展示，可多张）</label>
      <div id="eImagesPreview" style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.5rem;">
        ${(event?.images || []).map((img, i) => `
          <div style="position:relative;">
            <img src="${img}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;">
            <button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button>
          </div>
        `).join('')}
      </div>
      <input type="file" id="eImageInput" accept="image/*" multiple style="font-size:0.85rem;">
      <div style="display:flex;gap:0.4rem;margin-top:0.4rem;">
        <button type="button" class="btn-sm btn-edit" onclick="uploadEventImages()">上传图片</button>
        <button type="button" class="btn-sm" style="background:var(--accent-alt);color:white;" onclick="pickImageFromLibrary('event-images')">从图片库选择</button>
      </div>
    </div>
  `;

  document.getElementById('modalSave').onclick = async () => {
    const data = {
      title: document.getElementById('eTitle').value,
      status: document.getElementById('eStatus').value,
      date: document.getElementById('eDate').value,
      endDate: document.getElementById('eEndDate').value,
      location: document.getElementById('eLocation').value,
      booth: document.getElementById('eBooth').value,
      description: document.getElementById('eDesc').value,
      coverImage: document.querySelector('#eCoverPreview img')?.src || '',
      images: [...document.querySelectorAll('#eImagesPreview img')].map(img => img.src),
      socialLinks: (() => {
        const type = document.getElementById('eContactType').value;
        const value = document.getElementById('eContactValue').value;
        const sl = {
          contactLabel: document.getElementById('eContactLabel').value,
          website: document.getElementById('eWebsite').value,
          websiteLabel: document.getElementById('eWebsiteLabel').value
        };
        if (type && value) sl[type] = value;
        return sl;
      })(),
      relatedWorks: event?.relatedWorks || [],
      relatedCircles: event?.relatedCircles || [],
      relatedProjects: event?.relatedProjects || []
    };

    if (!data.title) { alert('请填写活动名称'); return; }

    if (isEdit) {
      await adminAPI('PUT', `/api/admin/events/${event.id}`, data);
    } else {
      await adminAPI('POST', '/api/admin/events', data);
    }
    closeModal();
    loadEvents();
  };

  openModal();
}

async function editEvent(id) {
  const events = await adminAPI('GET', '/api/admin/events');
  const event = events.find(e => e.id === id);
  if (event) {
    openEventModal(event);
  }
}

async function deleteEvent(id) {
  if (!confirm('确定要删除这个活动吗？')) return;
  await adminAPI('DELETE', `/api/admin/events/${id}`);
  loadEvents();
}

async function manageEventWorks(eventId) {
  const [events, allWorks, allCircles, allProjects] = await Promise.all([
    adminAPI('GET', '/api/admin/events'),
    adminAPI('GET', '/api/admin/works'),
    adminAPI('GET', '/api/admin/circles'),
    adminAPI('GET', '/api/admin/projects')
  ]);
  const event = events.find(e => e.id === eventId);
  if (!event) return;

  const relatedWorkIds = event.relatedWorks || [];
  const relatedWorks = allWorks.filter(w => relatedWorkIds.includes(w.id));
  const otherWorks = allWorks.filter(w => !relatedWorkIds.includes(w.id));

  const relatedCircleIds = event.relatedCircles || [];
  const relatedCircles = allCircles.filter(c => relatedCircleIds.includes(c.id));
  const otherCircles = allCircles.filter(c => !relatedCircleIds.includes(c.id));

  const relatedProjectIds = event.relatedProjects || [];
  const relatedProjects = allProjects.filter(p => relatedProjectIds.includes(p.id));
  const otherProjects = allProjects.filter(p => !relatedProjectIds.includes(p.id));

  document.getElementById('modalTitle').textContent = `管理关联 — ${event.title}`;
  document.getElementById('modalBody').innerHTML = `
    <!-- 关联作品 -->
    <div style="margin-bottom:1.5rem;">
      <h4 style="font-size:0.95rem;margin-bottom:0.8rem;color:var(--accent);">已关联作品 (${relatedWorks.length})</h4>
      ${relatedWorks.length > 0 ? `
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.8rem;">
          ${relatedWorks.map(w => {
            const circleName = (w.circles || []).map(cid => allCircles.find(c => c.id === cid)?.name || cid).join(', ') || '-';
            return `<span style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.3rem 0.7rem;background:rgba(233,69,96,0.06);border-radius:100px;font-size:0.8rem;">
              ${circleName}
              <button onclick="removeEventWork('${eventId}', '${w.id}')" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:0.9rem;padding:0 0.2rem;" title="移除">&times;</button>
            </span>`;
          }).join('')}
        </div>
      ` : '<p style="color:var(--haze);font-size:0.85rem;margin-bottom:0.8rem;">暂无关联作品</p>'}
      ${otherWorks.length > 0 ? `
        <div>
          <p style="font-size:0.8rem;color:var(--haze);margin-bottom:0.4rem;">勾选添加：</p>
          <input type="text" class="form-input" placeholder="搜索作品名称..." style="margin-bottom:0.5rem;padding:0.4rem 0.6rem;font-size:0.8rem;" oninput="filterEventWorksList(this.value)">
          <div id="eventWorksList" style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);">
            ${otherWorks.map(w => {
              const circleName = (w.circles || []).map(cid => allCircles.find(c => c.id === cid)?.name || cid).join(', ') || '';
              return `<label class="event-work-item" data-title="${(w.title || '').toLowerCase()}" data-circle="${(circleName || '').toLowerCase()}" style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;border-bottom:1px solid var(--border);cursor:pointer;font-size:0.8rem;"
                     onmouseover="this.style.background='rgba(233,69,96,0.03)'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" class="event-work-checkbox" value="${w.id}" style="width:14px;height:14px;accent-color:var(--accent);">
                <span style="flex:1;">${w.title}</span>
                <span style="color:var(--haze);">${circleName}</span>
              </label>`;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>

    <!-- 关联作者 -->
    <div style="margin-bottom:1.5rem;">
      <h4 style="font-size:0.95rem;margin-bottom:0.8rem;color:var(--accent-alt);">已关联作者 (${relatedCircles.length})</h4>
      ${relatedCircles.length > 0 ? `
        <table class="admin-table" style="margin-bottom:0;">
          <thead><tr><th>作者名称</th><th>操作</th></tr></thead>
          <tbody>
            ${relatedCircles.map(c => `
              <tr>
                <td>${c.name}</td>
                <td><button class="btn-sm btn-delete" onclick="removeEventCircle('${eventId}', '${c.id}')">移除</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p style="color:var(--haze);font-size:0.85rem;">暂无关联作者</p>'}
      ${otherCircles.length > 0 ? `
        <div style="margin-top:0.8rem;">
          <p style="font-size:0.8rem;color:var(--haze);margin-bottom:0.4rem;">勾选添加：</p>
          <input type="text" class="form-input" placeholder="搜索作者名称..." style="margin-bottom:0.5rem;padding:0.4rem 0.6rem;font-size:0.8rem;" oninput="filterEventCirclesList(this.value)">
          <div id="eventCirclesList" style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);">
            ${otherCircles.map(c => `
              <label class="event-circle-item" data-name="${(c.name || '').toLowerCase()}" style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;border-bottom:1px solid var(--border);cursor:pointer;font-size:0.8rem;"
                     onmouseover="this.style.background='rgba(233,69,96,0.03)'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" class="event-circle-checkbox" value="${c.id}" style="width:14px;height:14px;accent-color:var(--accent);">
                <span style="flex:1;">${c.name}</span>
              </label>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>

    <!-- 关联企划 -->
    <div style="margin-bottom:1rem;">
      <h4 style="font-size:0.95rem;margin-bottom:0.8rem;color:#f39c12;">已关联企划 (${relatedProjects.length})</h4>
      ${relatedProjects.length > 0 ? `
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.8rem;">
          ${relatedProjects.map(p => `
            <span style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.3rem 0.7rem;background:rgba(243,156,18,0.06);border-radius:100px;font-size:0.8rem;">
              ${p.title}
              <button onclick="removeEventProject('${eventId}', '${p.id}')" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:0.9rem;padding:0 0.2rem;" title="移除">&times;</button>
            </span>
          `).join('')}
        </div>
      ` : '<p style="color:var(--haze);font-size:0.85rem;margin-bottom:0.8rem;">暂无关联企划</p>'}
      ${otherProjects.length > 0 ? `
        <div>
          <p style="font-size:0.8rem;color:var(--haze);margin-bottom:0.4rem;">勾选添加：</p>
          <input type="text" class="form-input" placeholder="搜索企划名称..." style="margin-bottom:0.5rem;padding:0.4rem 0.6rem;font-size:0.8rem;" oninput="filterEventProjectsList(this.value)">
          <div id="eventProjectsList" style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);">
            ${otherProjects.map(p => `
              <label class="event-project-item" data-title="${(p.title || '').toLowerCase()}" style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;border-bottom:1px solid var(--border);cursor:pointer;font-size:0.8rem;"
                     onmouseover="this.style.background='rgba(233,69,96,0.03)'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" class="event-project-checkbox" value="${p.id}" style="width:14px;height:14px;accent-color:var(--accent);">
                <span style="flex:1;">${p.title}</span>
                <span style="color:var(--haze);">${PROJECT_STATUS_LABELS[p.status] || p.status || ''}</span>
              </label>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('modalSave').onclick = async () => {
    const checkedWorkIds = [...document.querySelectorAll('.event-work-checkbox:checked')].map(cb => cb.value);
    const checkedCircleIds = [...document.querySelectorAll('.event-circle-checkbox:checked')].map(cb => cb.value);
    const checkedProjectIds = [...document.querySelectorAll('.event-project-checkbox:checked')].map(cb => cb.value);
    const updatedRelatedWorks = [...new Set([...relatedWorkIds, ...checkedWorkIds])];
    const updatedRelatedCircles = [...new Set([...relatedCircleIds, ...checkedCircleIds])];
    const updatedRelatedProjects = [...new Set([...relatedProjectIds, ...checkedProjectIds])];
    await adminAPI('PUT', `/api/admin/events/${eventId}`, { ...event, relatedWorks: updatedRelatedWorks, relatedCircles: updatedRelatedCircles, relatedProjects: updatedRelatedProjects });
    closeModal();
    loadEvents();
  };

  openModal();
}

async function removeEventWork(eventId, workId) {
  try {
    const events = await adminAPI('GET', '/api/admin/events');
    const event = events.find(e => e.id === eventId);
    if (!event) { alert('活动未找到'); return; }
    const updatedRelatedWorks = (event.relatedWorks || []).filter(id => id !== workId);
    const result = await adminAPI('PUT', `/api/admin/events/${eventId}`, { ...event, relatedWorks: updatedRelatedWorks });
    if (result && !result.error) {
      manageEventWorks(eventId);
    } else {
      alert('移除失败: ' + (result.error || '未知错误'));
    }
  } catch (e) {
    alert('移除失败: ' + e.message);
  }
}

function filterEventWorksList(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.event-work-item').forEach(item => {
    const title = item.dataset.title || '';
    const circle = item.dataset.circle || '';
    item.style.display = (title.includes(q) || circle.includes(q)) ? 'flex' : 'none';
  });
}

function filterEventCirclesList(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.event-circle-item').forEach(item => {
    const name = item.dataset.name || '';
    item.style.display = name.includes(q) ? 'flex' : 'none';
  });
}

function filterEventProjectsList(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.event-project-item').forEach(item => {
    const title = item.dataset.title || '';
    item.style.display = title.includes(q) ? 'flex' : 'none';
  });
}

async function removeEventProject(eventId, projectId) {
  try {
    const events = await adminAPI('GET', '/api/admin/events');
    const event = events.find(e => e.id === eventId);
    if (!event) { alert('活动未找到'); return; }
    const updatedRelatedProjects = (event.relatedProjects || []).filter(id => id !== projectId);
    const result = await adminAPI('PUT', `/api/admin/events/${eventId}`, { ...event, relatedProjects: updatedRelatedProjects });
    if (result && !result.error) {
      manageEventWorks(eventId);
    } else {
      alert('移除失败: ' + (result.error || '未知错误'));
    }
  } catch (e) {
    alert('移除失败: ' + e.message);
  }
}

function filterCircleEventsList(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.circle-event-item').forEach(item => {
    const title = item.dataset.title || '';
    item.style.display = title.includes(q) ? 'flex' : 'none';
  });
}

function filterCircleProjectsList(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.circle-project-item').forEach(item => {
    const title = item.dataset.title || '';
    item.style.display = title.includes(q) ? 'flex' : 'none';
  });
}

async function removeCircleProject(circleId, projectId) {
  try {
    const projects = await adminAPI('GET', '/api/admin/projects');
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const updatedCircles = (project.circles || []).filter(id => id !== circleId);
    const result = await adminAPI('PUT', `/api/admin/projects/${projectId}`, { ...project, circles: updatedCircles });
    if (result && !result.error) {
      manageCircleWorks(circleId);
    }
  } catch (e) {
    alert('移除失败: ' + e.message);
  }
}

async function manageWorkRelations(workId, returnToCircleId) {
  // Always fetch fresh data to avoid stale state
  const [works, allEvents, allProjects] = await Promise.all([
    adminAPI('GET', '/api/admin/works'),
    adminAPI('GET', '/api/admin/events'),
    adminAPI('GET', '/api/admin/projects')
  ]);
  const work = works.find(w => w.id === workId);
  if (!work) { alert('作品未找到'); return; }

  const relatedEvents = allEvents.filter(e => (e.relatedWorks || []).includes(workId));
  const otherEvents = allEvents.filter(e => !relatedEvents.find(re => re.id === e.id));
  const relatedProjects = allProjects.filter(p => (p.works || []).includes(workId));
  const otherProjects = allProjects.filter(p => !relatedProjects.find(rp => rp.id === p.id));

  document.getElementById('modalTitle').textContent = `管理关联 — ${work.title} (${workId})`;
  document.getElementById('modalBody').innerHTML = `
    <!-- 关联活动 -->
    <div style="margin-bottom:1.5rem;">
      <h4 style="font-size:0.95rem;margin-bottom:0.8rem;color:var(--accent-alt);">已关联活动 (${relatedEvents.length})</h4>
      ${relatedEvents.length > 0 ? `
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.8rem;">
          ${relatedEvents.map(e => `
            <span style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.3rem 0.7rem;background:rgba(15,52,96,0.06);border-radius:100px;font-size:0.8rem;">
              ${e.title}
              <button onclick="removeWorkEvent('${workId}', '${e.id}', '${returnToCircleId}')" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:0.9rem;padding:0 0.2rem;" title="移除">&times;</button>
            </span>
          `).join('')}
        </div>
      ` : '<p style="color:var(--haze);font-size:0.85rem;margin-bottom:0.8rem;">暂无关联活动</p>'}
      ${otherEvents.length > 0 ? `
        <div>
          <p style="font-size:0.8rem;color:var(--haze);margin-bottom:0.4rem;">勾选添加：</p>
          <input type="text" class="form-input" placeholder="搜索活动名称..." style="margin-bottom:0.5rem;padding:0.4rem 0.6rem;font-size:0.8rem;" oninput="filterWorkEventsList(this.value)">
          <div id="workEventsList" style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);">
            ${otherEvents.map(e => `
              <label class="work-event-item" data-title="${(e.title || '').toLowerCase()}" style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;border-bottom:1px solid var(--border);cursor:pointer;font-size:0.8rem;"
                     onmouseover="this.style.background='rgba(233,69,96,0.03)'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" class="work-event-checkbox" value="${e.id}" style="width:14px;height:14px;accent-color:var(--accent);">
                <span style="flex:1;">${e.title}</span>
                <span style="color:var(--haze);">${e.date || ''}</span>
              </label>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>

    <!-- 关联企划 -->
    <div style="margin-bottom:1rem;">
      <h4 style="font-size:0.95rem;margin-bottom:0.8rem;color:#f39c12;">已关联企划 (${relatedProjects.length})</h4>
      ${relatedProjects.length > 0 ? `
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.8rem;">
          ${relatedProjects.map(p => `
            <span style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.3rem 0.7rem;background:rgba(243,156,18,0.06);border-radius:100px;font-size:0.8rem;">
              ${p.title}
              <button onclick="removeWorkProject('${workId}', '${p.id}', '${returnToCircleId}')" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:0.9rem;padding:0 0.2rem;" title="移除">&times;</button>
            </span>
          `).join('')}
        </div>
      ` : '<p style="color:var(--haze);font-size:0.85rem;margin-bottom:0.8rem;">暂无关联企划</p>'}
      ${otherProjects.length > 0 ? `
        <div>
          <p style="font-size:0.8rem;color:var(--haze);margin-bottom:0.4rem;">勾选添加：</p>
          <input type="text" class="form-input" placeholder="搜索企划名称..." style="margin-bottom:0.5rem;padding:0.4rem 0.6rem;font-size:0.8rem;" oninput="filterWorkProjectsList(this.value)">
          <div id="workProjectsList" style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);">
            ${otherProjects.map(p => `
              <label class="work-project-item" data-title="${(p.title || '').toLowerCase()}" style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;border-bottom:1px solid var(--border);cursor:pointer;font-size:0.8rem;"
                     onmouseover="this.style.background='rgba(233,69,96,0.03)'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" class="work-project-checkbox" value="${p.id}" style="width:14px;height:14px;accent-color:var(--accent);">
                <span style="flex:1;">${p.title}</span>
                <span style="color:var(--haze);">${PROJECT_STATUS_LABELS[p.status] || p.status || ''}</span>
              </label>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('modalSave').onclick = async () => {
    // Prevent double-submit
    const saveBtn = document.getElementById('modalSave');
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';

    try {
      // Add events to work
      const addEventIds = [...document.querySelectorAll('.work-event-checkbox:checked')].map(cb => cb.value);
      for (const eventId of addEventIds) {
        const event = allEvents.find(e => e.id === eventId);
        if (event) {
          const updatedWorks = [...new Set([...(event.relatedWorks || []), workId])];
          await adminAPI('PUT', `/api/admin/events/${eventId}`, { ...event, relatedWorks: updatedWorks });
        }
      }
      // Add projects to work
      const addProjectIds = [...document.querySelectorAll('.work-project-checkbox:checked')].map(cb => cb.value);
      for (const projectId of addProjectIds) {
        const project = allProjects.find(p => p.id === projectId);
        if (project) {
          const updatedWorks = [...new Set([...(project.works || []), workId])];
          await adminAPI('PUT', `/api/admin/projects/${projectId}`, { ...project, works: updatedWorks });
        }
      }
      closeModal();
      if (returnToCircleId) manageCircleWorks(returnToCircleId);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存';
    }
  };

  openModal();
}

function filterWorkEventsList(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.work-event-item').forEach(item => {
    const title = item.dataset.title || '';
    item.style.display = title.includes(q) ? 'flex' : 'none';
  });
}

function filterWorkProjectsList(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.work-project-item').forEach(item => {
    const title = item.dataset.title || '';
    item.style.display = title.includes(q) ? 'flex' : 'none';
  });
}

async function removeWorkEvent(workId, eventId, returnToCircleId) {
  try {
    const events = await adminAPI('GET', '/api/admin/events');
    const event = events.find(e => e.id === eventId);
    if (!event) return;
    const updatedWorks = (event.relatedWorks || []).filter(id => id !== workId);
    const result = await adminAPI('PUT', `/api/admin/events/${eventId}`, { ...event, relatedWorks: updatedWorks });
    if (result && !result.error) {
      manageWorkRelations(workId, returnToCircleId);
    }
  } catch (e) {
    alert('移除失败: ' + e.message);
  }
}

async function removeWorkProject(workId, projectId, returnToCircleId) {
  try {
    const projects = await adminAPI('GET', '/api/admin/projects');
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const updatedWorks = (project.works || []).filter(id => id !== workId);
    const result = await adminAPI('PUT', `/api/admin/projects/${projectId}`, { ...project, works: updatedWorks });
    if (result && !result.error) {
      manageWorkRelations(workId, returnToCircleId);
    }
  } catch (e) {
    alert('移除失败: ' + e.message);
  }
}

function filterProjectCirclesList(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.project-circle-item').forEach(item => {
    const name = item.dataset.name || '';
    item.style.display = name.includes(q) ? 'flex' : 'none';
  });
}

async function removeEventCircle(eventId, circleId) {
  try {
    const events = await adminAPI('GET', '/api/admin/events');
    const event = events.find(e => e.id === eventId);
    if (!event) { alert('活动未找到'); return; }
    const updatedRelatedCircles = (event.relatedCircles || []).filter(id => id !== circleId);
    const result = await adminAPI('PUT', `/api/admin/events/${eventId}`, { ...event, relatedCircles: updatedRelatedCircles });
    if (result && !result.error) {
      manageEventWorks(eventId);
    } else {
      alert('移除失败: ' + (result.error || '未知错误'));
    }
  } catch (e) {
    alert('移除失败: ' + e.message);
  }
}

async function uploadEventCover() {
  const input = document.getElementById('eCoverInput');
  const preview = document.getElementById('eCoverPreview');
  if (!input.files.length) { alert('请选择首图'); return; }
  const res = await uploadImage(input.files[0]);
  if (res.url) {
    preview.innerHTML = `<div style="position:relative;display:inline-block;"><img src="${res.url}" style="width:120px;height:80px;object-fit:cover;border-radius:6px;"><button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button></div>`;
  }
  input.value = '';
}

async function uploadEventImages() {
  const input = document.getElementById('eImageInput');
  const preview = document.getElementById('eImagesPreview');
  if (!input.files.length) { alert('请选择图片'); return; }
  for (const file of input.files) {
    const res = await uploadImage(file);
    if (res.url) {
      const div = document.createElement('div');
      div.style.position = 'relative';
      div.innerHTML = `<img src="${res.url}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;"><button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button>`;
      preview.appendChild(div);
    }
  }
  input.value = '';
}

// ===== Circles =====
async function loadCircles(page = 1) {
  const [circlesResp, allWorks] = await Promise.all([
    adminAPI('GET', `/api/admin/circles?page=${page}&limit=${PAGE_LIMIT}`),
    adminAPI('GET', '/api/admin/works')
  ]);

  // Handle paginated response
  if (circlesResp && circlesResp.items) {
    adminCirclesData = circlesResp.items;
    pagination.circles = { page: circlesResp.page, total: circlesResp.total, totalPages: circlesResp.totalPages };
  } else {
    adminCirclesData = circlesResp || [];
    pagination.circles = { page: 1, total: adminCirclesData.length, totalPages: 1 };
  }

  const worksCountMap = {};
  (allWorks || []).forEach(w => { (w.circles || []).forEach(cid => { worksCountMap[cid] = (worksCountMap[cid] || 0) + 1; }); });
  adminCirclesData.forEach(c => { c._worksCount = worksCountMap[c.id] || 0; });
  renderCirclesTable(adminCirclesData);
  // Render pagination
  const paginationEl = document.getElementById('circlesPagination');
  if (paginationEl) paginationEl.innerHTML = renderPagination('circles', 'loadCircles');
}

function renderCirclesTable(circles) {
  const tbody = document.getElementById('circlesTableBody');
  if (!circles || circles.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--haze);padding:2rem;">暂无作者</td></tr>';
    return;
  }
  tbody.innerHTML = circles.map((c, i) => {
    let accountHtml = '<span style="color:var(--haze);font-size:0.8rem;">未注册</span>';
    if (c.username) {
      if (c.authorStatus === 'approved') {
        accountHtml = '<span style="color:#2ecc71;font-weight:600;font-size:0.8rem;">✓ 已批准</span><br><span style="font-size:0.7rem;color:var(--haze);">' + escapeHtml(c.username) + '</span>';
      } else if (c.authorStatus === 'pending') {
        accountHtml = '<span style="color:#f39c12;font-weight:600;font-size:0.8rem;">待审批</span><br><span style="font-size:0.7rem;color:var(--haze);">' + escapeHtml(c.username) + '</span>';
      } else if (c.authorStatus === 'rejected') {
        accountHtml = '<span style="color:var(--accent);font-weight:600;font-size:0.8rem;">已拒绝</span><br><span style="font-size:0.7rem;color:var(--haze);">' + escapeHtml(c.username) + '</span>';
      }
    }
    let actionBtns = `
      <button class="btn-sm btn-edit" onclick="manageCircleWorks('${c.id}')">关联</button>
      ${c.username && c.authorStatus === 'approved' ? `<button class="btn-sm btn-edit" onclick="manageCircleEditors('${c.id}')">编辑者</button>` : ''}
      <button class="btn-sm btn-edit" onclick="exportCircleExcel('${c.id}')" title="导出Excel">📥导出</button>
      <button class="btn-sm btn-edit" onclick="importCircleExcel('${c.id}')" title="导入Excel">📤导入</button>
      <button class="btn-sm btn-edit" onclick="editCircle('${c.id}')">编辑</button>
      <button class="btn-sm btn-delete" onclick="deleteCircle('${c.id}')">删除</button>`;
    if (c.username && c.authorStatus === 'pending') {
      actionBtns = `<button class="btn-sm btn-edit" style="background:rgba(46,204,113,0.15);color:#2ecc71;" onclick="approveAuthor('${c.id}')">批准</button>
        <button class="btn-sm btn-delete" onclick="rejectAuthor('${c.id}')">拒绝</button>` + actionBtns;
    } else if (c.username && c.authorStatus === 'approved') {
      actionBtns = `<button class="btn-sm btn-edit" onclick="resetAuthorPassword('${c.id}')">重置密码</button>
        <button class="btn-sm btn-delete" onclick="removeAuthorAccount('${c.id}')">删除账号</button>` + actionBtns;
    }
    return `
    <tr>
      <td>${renderOrderControls('circles', c.id, i, circles.length)}</td>
      <td class="editable-cell" onclick="makeCircleEditable(this, '${c.id}', 'name', '${escapeHtml(c.name)}')">${c.name}</td>
      <td>${CIRCLE_CATEGORIES[c.category] || c.category || '-'}</td>
      <td>${c._worksCount || 0}</td>
      <td>${accountHtml}</td>
      <td>
        <div class="table-actions">
          ${actionBtns}
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function approveAuthor(circleId) {
  if (!confirm('确定批准该作者账号？')) return;
  await adminAPI('POST', `/api/admin/circles/${circleId}/approve-author`);
  showToast('已批准', 'success');
  loadCircles();
}

async function rejectAuthor(circleId) {
  if (!confirm('确定拒绝该作者账号？\n拒绝后将清除账号数据，作者需重新申请。')) return;
  await adminAPI('POST', `/api/admin/circles/${circleId}/reject-author`);
  showToast('已拒绝，账号已清除', 'success');
  loadCircles();
}

async function removeAuthorAccount(circleId) {
  if (!confirm('确定删除该作者的登录账号？\n删除后作者需重新申请才能登录。')) return;
  await adminAPI('POST', `/api/admin/circles/${circleId}/remove-author`);
  showToast('作者账号已删除', 'success');
  loadCircles();
}

// Batch approve/reject authors
async function batchApproveAuthors() {
  const pendingAuthors = adminCirclesData.filter(c => c.authorStatus === 'pending');
  if (pendingAuthors.length === 0) { alert('没有待审核的作者'); return; }
  if (!confirm(`确定批准全部 ${pendingAuthors.length} 个待审核作者？`)) return;

  let success = 0;
  for (const c of pendingAuthors) {
    const result = await adminAPI('POST', `/api/admin/circles/${c.id}/approve-author`);
    if (result && result.success) success++;
  }
  showToast(`已批准 ${success} 个作者`, 'success');
  loadCircles();
}

async function batchRejectAuthors() {
  const pendingAuthors = adminCirclesData.filter(c => c.authorStatus === 'pending');
  if (pendingAuthors.length === 0) { alert('没有待审核的作者'); return; }
  const reason = prompt('拒绝原因（可选）');
  if (reason === null) return;
  if (!confirm(`确定拒绝全部 ${pendingAuthors.length} 个待审核作者？\n拒绝后将清除账号数据，作者需重新申请。`)) return;

  let success = 0;
  for (const c of pendingAuthors) {
    const result = await adminAPI('POST', `/api/admin/circles/${c.id}/reject-author`, { reason });
    if (result && result.success) success++;
  }
  showToast(`已拒绝 ${success} 个作者`, 'success');
  loadCircles();
}

async function manageCircleEditors(circleId) {
  const circles = await adminAPI('GET', '/api/admin/circles');
  const circle = circles.find(c => c.id === circleId);
  if (!circle) return;

  const approvedAuthors = circles.filter(c => c.authorStatus === 'approved' && c.id !== circleId);

  const overlay = document.createElement('div');
  overlay.id = 'circleEditorsOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem;';
  overlay.innerHTML = `<div style="background:var(--card-bg);border-radius:var(--radius);padding:1.5rem;max-width:400px;width:100%;max-height:80vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
      <h3 style="margin:0;">管理编辑者</h3>
      <button onclick="document.getElementById('circleEditorsOverlay').remove()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--haze);">&times;</button>
    </div>
    <p style="font-size:0.85rem;color:var(--haze);margin-bottom:1rem;">选择可以编辑「${escapeHtml(circle.name)}」后台的其他作者：</p>
    <div id="circleEditorsList">
      ${approvedAuthors.length > 0 ? approvedAuthors.map(c => `<label style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem;cursor:pointer;border-bottom:1px solid var(--border);">
        <input type="checkbox" class="circle-editor-cb" value="${c.id}" ${(circle.editableBy || []).includes(c.id) ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--accent);">
        ${escapeHtml(c.name)}
      </label>`).join('') : '<p style="color:var(--haze);">暂无其他已批准的作者</p>'}
    </div>
    <button class="btn btn-primary" style="width:100%;margin-top:1rem;" onclick="saveCircleEditors('${circleId}')">保存</button>
  </div>`;
  document.body.appendChild(overlay);
}

async function saveCircleEditors(circleId) {
  const checked = [...document.querySelectorAll('.circle-editor-cb:checked')].map(cb => cb.value);
  await adminAPI('POST', `/api/admin/circles/${circleId}/set-editors`, { editorIds: checked });
  showToast('编辑者已保存', 'success');
  document.getElementById('circleEditorsOverlay')?.remove();
  loadCircles();
}

async function resetAuthorPassword(circleId) {
  const newPw = prompt('请输入新密码（至少6位）：');
  if (!newPw || newPw.length < 6) { if (newPw !== null) alert('密码至少6位'); return; }
  await adminAPI('POST', `/api/admin/circles/${circleId}/reset-password`, { newPassword: newPw });
  showToast('密码已重置', 'success');
}

async function inlineUpdateCircle(circleId, field, value) {
  const circles = await adminAPI('GET', '/api/admin/circles');
  const circle = circles.find(c => c.id === circleId);
  if (!circle) return;
  circle[field] = value;
  await adminAPI('PUT', `/api/admin/circles/${circleId}`, circle);
  showToast('已保存', 'success');
}

function makeCircleEditable(cell, circleId, field, currentValue) {
  if (cell.querySelector('input')) return;
  const original = cell.innerHTML;
  cell.innerHTML = `<input type="text" class="form-input" value="${escapeHtml(currentValue)}" style="padding:0.3rem 0.5rem;font-size:0.85rem;width:100%;">`;
  const input = cell.querySelector('input');
  input.focus();
  input.select();
  const save = async () => {
    const newValue = input.value;
    if (newValue !== currentValue) {
      await inlineUpdateCircle(circleId, field, newValue);
    }
    loadCircles();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { cell.innerHTML = original; } });
}

function filterCircles() {
  const search = document.getElementById('circlesSearch').value.toLowerCase();
  if (!search) { renderCirclesTable(adminCirclesData); return; }
  const filtered = adminCirclesData.filter(c =>
    c.name.toLowerCase().includes(search) ||
    (c.description || '').toLowerCase().includes(search)
  );
  renderCirclesTable(filtered);
}

async function manageCircleWorks(circleId) {
  const [circles, allWorks, allEvents, allProjects] = await Promise.all([
    adminAPI('GET', '/api/admin/circles'),
    adminAPI('GET', '/api/admin/works'),
    adminAPI('GET', '/api/admin/events'),
    adminAPI('GET', '/api/admin/projects')
  ]);
  const circle = circles.find(c => c.id === circleId);
  if (!circle) return;

  const circleWorks = allWorks.filter(w => (w.circles || []).includes(circleId));
  const otherWorks = allWorks.filter(w => !(w.circles || []).includes(circleId));

  // Find events related to this circle's works
  const circleWorkIds = circleWorks.map(w => w.id);
  const relatedEvents = allEvents.filter(e =>
    (e.relatedCircles || []).includes(circleId) ||
    (e.relatedWorks || []).some(wid => circleWorkIds.includes(wid))
  );
  const otherEvents = allEvents.filter(e => !relatedEvents.find(re => re.id === e.id));

  // Find projects related to this circle
  const relatedProjects = allProjects.filter(p => (p.circles || []).includes(circleId));
  const otherProjects = allProjects.filter(p => !relatedProjects.find(rp => rp.id === p.id));

  document.getElementById('modalTitle').textContent = `管理关联 — ${circle.name}`;
  document.getElementById('modalBody').innerHTML = `
    <!-- 关联作品 -->
    <div style="margin-bottom:1.5rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem;">
        <h4 style="font-size:0.95rem;color:var(--accent);">已关联作品 (${circleWorks.length})</h4>
        <div style="display:flex;gap:0.5rem;">
          <button class="btn-sm btn-edit" id="circleBatchEditBtn" style="display:none;background:var(--accent-alt);" onclick="openCircleBatchEdit('${circleId}')">批量编辑</button>
          <button class="btn-sm btn-edit" onclick="addWorkToCircle('${circleId}')">+ 新增作品</button>
        </div>
      </div>
      ${circleWorks.length > 0 ? `
        <table class="admin-table" style="margin-bottom:0;">
          <thead>
            <tr>
              <th><input type="checkbox" id="circleSelectAll" onchange="toggleSelectAllCircleWorks()" style="width:16px;height:16px;accent-color:var(--accent);"></th>
              <th>标题</th>
              <th>分类</th>
              <th>价格</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${circleWorks.map(w => `
              <tr>
                <td><input type="checkbox" class="circle-work-checkbox" value="${w.id}" onchange="updateCircleBatchBtn()" style="width:16px;height:16px;accent-color:var(--accent);"></td>
                <td class="truncate">${w.title}<span style="color:var(--haze);font-size:0.7rem;margin-left:0.3rem;">活${allEvents.filter(e => (e.relatedWorks || []).includes(w.id)).length} / 企${allProjects.filter(p => (p.works || []).includes(w.id)).length}</span></td>
                <td>${CATEGORIES[w.category] || w.category}</td>
                <td>${w.price}</td>
                <td><span class="card-tag ${w.status}">${STATUS_LABELS[w.status] || w.status}</span></td>
                <td>
                  <div class="table-actions">
                    <button class="btn-sm btn-edit" onclick="manageWorkRelations('${w.id}', '${circleId}')">关联</button>
                    <button class="btn-sm btn-edit" onclick="editWorkFromCircle('${w.id}', '${circleId}')">编辑</button>
                    <button class="btn-sm btn-delete" onclick="toggleCircleWork('${w.id}', '${circleId}', '${circleId}', this)">移除</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p style="color:var(--haze);font-size:0.85rem;">暂无关联作品</p>'}
      ${otherWorks.length > 0 ? `
        <div style="margin-top:0.8rem;">
          <p style="font-size:0.8rem;color:var(--haze);margin-bottom:0.4rem;">勾选添加作品：</p>
          <div style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);">
            ${otherWorks.map(w => `
              <label style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;border-bottom:1px solid var(--border);cursor:pointer;font-size:0.8rem;"
                     onmouseover="this.style.background='rgba(233,69,96,0.03)'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" class="add-work-checkbox" value="${w.id}" style="width:14px;height:14px;accent-color:var(--accent);">
                <span style="flex:1;">${w.title}</span>
                <span style="color:var(--haze);">${CATEGORIES[w.category] || w.category}</span>
              </label>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>

    <!-- 关联活动 -->
    <div style="margin-bottom:1rem;">
      <h4 style="font-size:0.95rem;margin-bottom:0.8rem;color:var(--accent-alt);">已关联活动 (${relatedEvents.length})</h4>
      ${relatedEvents.length > 0 ? `
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.8rem;">
          ${relatedEvents.map(e => `
            <span style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.3rem 0.7rem;background:rgba(15,52,96,0.06);border-radius:100px;font-size:0.8rem;">
              ${e.title}
              <button onclick="removeCircleEvent('${circleId}', '${e.id}')" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:0.9rem;padding:0 0.2rem;" title="移除">&times;</button>
            </span>
          `).join('')}
        </div>
      ` : '<p style="color:var(--haze);font-size:0.85rem;margin-bottom:0.8rem;">暂无关联活动</p>'}
      ${otherEvents.length > 0 ? `
        <div>
          <p style="font-size:0.8rem;color:var(--haze);margin-bottom:0.4rem;">勾选添加活动：</p>
          <input type="text" class="form-input" placeholder="搜索活动名称..." style="margin-bottom:0.5rem;padding:0.4rem 0.6rem;font-size:0.8rem;" oninput="filterCircleEventsList(this.value)">
          <div id="circleEventsList" style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);">
            ${otherEvents.map(e => `
              <label class="circle-event-item" data-title="${(e.title || '').toLowerCase()}" style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;border-bottom:1px solid var(--border);cursor:pointer;font-size:0.8rem;"
                     onmouseover="this.style.background='rgba(233,69,96,0.03)'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" class="add-event-checkbox" value="${e.id}" style="width:14px;height:14px;accent-color:var(--accent);">
                <span style="flex:1;">${e.title}</span>
                <span style="color:var(--haze);">${e.date || ''}</span>
              </label>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>

    <!-- 关联企划 -->
    <div style="margin-bottom:1rem;">
      <h4 style="font-size:0.95rem;margin-bottom:0.8rem;color:#f39c12;">已关联企划 (${relatedProjects.length})</h4>
      ${relatedProjects.length > 0 ? `
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.8rem;">
          ${relatedProjects.map(p => `
            <span style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.3rem 0.7rem;background:rgba(243,156,18,0.06);border-radius:100px;font-size:0.8rem;">
              ${p.title}
              <button onclick="removeCircleProject('${circleId}', '${p.id}')" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:0.9rem;padding:0 0.2rem;" title="移除">&times;</button>
            </span>
          `).join('')}
        </div>
      ` : '<p style="color:var(--haze);font-size:0.85rem;margin-bottom:0.8rem;">暂无关联企划</p>'}
      ${otherProjects.length > 0 ? `
        <div>
          <p style="font-size:0.8rem;color:var(--haze);margin-bottom:0.4rem;">勾选添加企划：</p>
          <input type="text" class="form-input" placeholder="搜索企划名称..." style="margin-bottom:0.5rem;padding:0.4rem 0.6rem;font-size:0.8rem;" oninput="filterCircleProjectsList(this.value)">
          <div id="circleProjectsList" style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);">
            ${otherProjects.map(p => `
              <label class="circle-project-item" data-title="${(p.title || '').toLowerCase()}" style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;border-bottom:1px solid var(--border);cursor:pointer;font-size:0.8rem;"
                     onmouseover="this.style.background='rgba(233,69,96,0.03)'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" class="add-project-checkbox" value="${p.id}" style="width:14px;height:14px;accent-color:var(--accent);">
                <span style="flex:1;">${p.title}</span>
                <span style="color:var(--haze);">${PROJECT_STATUS_LABELS[p.status] || p.status || ''}</span>
              </label>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('modalSave').onclick = async () => {
    // Add works to circle
    const addWorkIds = [...document.querySelectorAll('.add-work-checkbox:checked')].map(cb => cb.value);
    for (const workId of addWorkIds) {
      const work = allWorks.find(w => w.id === workId);
      if (work) {
        const newCircles = [...new Set([...(work.circles || []), circleId])];
        await adminAPI('PUT', `/api/admin/works/${work.id}`, { ...work, circles: newCircles });
      }
    }
    // Add events to circle
    const addEventIds = [...document.querySelectorAll('.add-event-checkbox:checked')].map(cb => cb.value);
    for (const eventId of addEventIds) {
      const event = allEvents.find(e => e.id === eventId);
      if (event) {
        const updatedCircles = [...new Set([...(event.relatedCircles || []), circleId])];
        await adminAPI('PUT', `/api/admin/events/${eventId}`, { ...event, relatedCircles: updatedCircles });
      }
    }
    // Add projects to circle
    const addProjectIds = [...document.querySelectorAll('.add-project-checkbox:checked')].map(cb => cb.value);
    for (const projectId of addProjectIds) {
      const project = allProjects.find(p => p.id === projectId);
      if (project) {
        const updatedCircles = [...new Set([...(project.circles || []), circleId])];
        await adminAPI('PUT', `/api/admin/projects/${projectId}`, { ...project, circles: updatedCircles });
      }
    }
    closeModal();
    loadCircles();
  };

  openModal();
}

async function removeCircleEvent(circleId, eventId) {
  try {
    const events = await adminAPI('GET', '/api/admin/events');
    const event = events.find(e => e.id === eventId);
    if (!event) return;
    const updatedCircles = (event.relatedCircles || []).filter(id => id !== circleId);
    const result = await adminAPI('PUT', `/api/admin/events/${eventId}`, { ...event, relatedCircles: updatedCircles });
    if (result && !result.error) {
      manageCircleWorks(circleId);
    }
  } catch (e) {
    alert('移除失败: ' + e.message);
  }
}

async function toggleCircleWork(workId, circleIdToRemove, circleId, btn) {
  try {
    const works = await adminAPI('GET', '/api/admin/works');
    const work = works.find(w => w.id === workId);
    if (!work) return;
    const newCircles = (work.circles || []).filter(cid => cid !== circleIdToRemove);
    const result = await adminAPI('PUT', `/api/admin/works/${work.id}`, { ...work, circles: newCircles });
    if (result && !result.error) {
      manageCircleWorks(circleId);
    } else {
      alert('移除失败: ' + (result.error || '未知错误'));
    }
  } catch (e) {
    alert('移除失败: ' + e.message);
  }
}

async function editWorkFromCircle(workId, circleId) {
  const works = await adminAPI('GET', '/api/admin/works');
  const work = works.find(w => w.id === workId);
  if (!work) return;
  openWorkModal(work, circleId);
}

function exportCircleExcel(circleId) {
  const a = document.createElement('a');
  a.href = `/api/admin/circles/${circleId}/export`;
  a.download = '';
  // Add auth header by fetching
  fetch(`/api/admin/circles/${circleId}/export`, {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(res => res.blob()).then(blob => {
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function importCircleExcel(circleId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`/api/admin/circles/${circleId}/import`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const result = await res.json();
      if (result.error) {
        alert('导入失败: ' + result.error);
        return;
      }
      // Show result modal
      document.getElementById('modalTitle').textContent = '导入结果';
      document.getElementById('modalBody').innerHTML = `
        <div style="margin-bottom:1rem;">
          <div style="display:flex;gap:1.5rem;margin-bottom:1rem;">
            <div style="text-align:center;flex:1;padding:1rem;background:rgba(46,204,113,0.08);border-radius:var(--radius-sm);">
              <div style="font-size:1.5rem;font-weight:700;color:#2ecc71;">${result.added}</div>
              <div style="font-size:0.8rem;color:var(--haze);">新增</div>
            </div>
            <div style="text-align:center;flex:1;padding:1rem;background:rgba(243,156,18,0.08);border-radius:var(--radius-sm);">
              <div style="font-size:1.5rem;font-weight:700;color:#f39c12;">${result.updated}</div>
              <div style="font-size:0.8rem;color:var(--haze);">更新</div>
            </div>
            <div style="text-align:center;flex:1;padding:1rem;background:rgba(233,69,96,0.08);border-radius:var(--radius-sm);">
              <div style="font-size:1.5rem;font-weight:700;color:var(--accent);">${result.deleted}</div>
              <div style="font-size:0.8rem;color:var(--haze);">删除</div>
            </div>
            <div style="text-align:center;flex:1;padding:1rem;background:rgba(15,52,96,0.08);border-radius:var(--radius-sm);">
              <div style="font-size:1.5rem;font-weight:700;color:var(--accent-alt);">${result.eventLinks || 0}</div>
              <div style="font-size:0.8rem;color:var(--haze);">关联活动</div>
            </div>
          </div>
          ${result.details.length > 0 ? `
            <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0.5rem;">
              ${result.details.map(d => `<div style="padding:0.3rem 0;font-size:0.85rem;border-bottom:1px solid var(--border);">${d}</div>`).join('')}
            </div>
          ` : ''}
        </div>
      `;
      document.getElementById('modalSave').textContent = '确定';
      document.getElementById('modalSave').onclick = () => {
        closeModal();
        document.getElementById('modalSave').textContent = '保存';
        loadCircles();
      };
      openModal();
    } catch (e) {
      alert('导入失败: ' + e.message);
    }
  };
  input.click();
}

function addWorkToCircle(circleId) {
  openWorkModal(null, circleId);
}

function toggleSelectAllCircleWorks() {
  const selectAll = document.getElementById('circleSelectAll');
  document.querySelectorAll('.circle-work-checkbox').forEach(cb => {
    cb.checked = selectAll.checked;
  });
  updateCircleBatchBtn();
}

function updateCircleBatchBtn() {
  const checked = document.querySelectorAll('.circle-work-checkbox:checked');
  const btn = document.getElementById('circleBatchEditBtn');
  if (btn) btn.style.display = checked.length > 1 ? 'inline-flex' : 'none';
}

function openCircleModal(circle = null) {
  const isEdit = !!circle;
  document.getElementById('modalTitle').textContent = isEdit ? '编辑作者' : '新增作者';
  document.getElementById('modalBody').innerHTML = `
    <div class="form-group">
      <label>作者名称 <span style="color:var(--accent)">*</span></label>
      <input class="form-input" id="cName" value="${circle?.name || ''}" required>
    </div>
    <div class="form-group">
      <label>分类</label>
      <select class="form-input" id="cCategory">
        <option value="">未分类</option>
        ${Object.entries(CIRCLE_CATEGORIES).map(([k, v]) =>
          `<option value="${k}" ${circle?.category === k ? 'selected' : ''}>${v}</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>简介</label>
      <textarea class="form-input" id="cDesc">${circle?.description || ''}</textarea>
    </div>
    <div class="form-group">
      <label>联系方式类型</label>
      <select class="form-input" id="cContactType">
        <option value="qq" ${circle?.socialLinks?.qq ? 'selected' : ''}>QQ</option>
        <option value="qqGroup" ${circle?.socialLinks?.qqGroup ? 'selected' : ''}>QQ群</option>
      </select>
    </div>
    <div class="form-group">
      <label>联系方式</label>
      <input class="form-input" id="cContactValue" value="${circle?.socialLinks?.qq || circle?.socialLinks?.qqGroup || ''}" placeholder="QQ号或QQ群号">
    </div>
    <div class="form-group">
      <label>显示名称（前台显示的中文）</label>
      <input class="form-input" id="cContactLabel" value="${circle?.socialLinks?.contactLabel || ''}" placeholder="如：QQ联系、加入QQ群">
    </div>
    <div class="form-group">
      <label>网站链接</label>
      <input class="form-input" id="cWebsite" value="${circle?.socialLinks?.website || ''}" placeholder="https://...">
    </div>
    <div class="form-group">
      <label>网站显示名称</label>
      <input class="form-input" id="cWebsiteLabel" value="${circle?.socialLinks?.websiteLabel || ''}" placeholder="如：访问官网、查看作品集">
    </div>
    <div class="form-group">
      <label>作者头像</label>
      <div id="cLogoPreview" style="margin-bottom:0.5rem;">
        ${circle?.logo ? `<div style="position:relative;display:inline-block;"><img src="${circle.logo}" style="width:80px;height:80px;object-fit:cover;border-radius:50%;"><button onclick="this.parentElement.remove();document.getElementById('cLogoInput').dataset.cleared='1';" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button></div>` : ''}
      </div>
      <input type="file" id="cLogoInput" accept="image/*" style="font-size:0.85rem;">
      <div style="display:flex;gap:0.4rem;margin-top:0.4rem;">
        <button type="button" class="btn-sm btn-edit" onclick="uploadCircleLogo()">上传新头像</button>
        <button type="button" class="btn-sm" style="background:var(--accent-alt);color:white;" onclick="pickImageFromLibrary('circle-logo')">从图片库选择</button>
      </div>
    </div>
    <div class="form-group">
      <label>作者图片</label>
      <div id="cImagesPreview" style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.5rem;">
        ${(circle?.images || []).map((img, i) => `
          <div style="position:relative;">
            <img src="${img}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;">
            <button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button>
          </div>
        `).join('')}
      </div>
      <input type="file" id="cImageInput" accept="image/*" multiple style="font-size:0.85rem;">
      <div style="display:flex;gap:0.4rem;margin-top:0.4rem;">
        <button type="button" class="btn-sm btn-edit" onclick="uploadCircleImages()">上传新图片</button>
        <button type="button" class="btn-sm" style="background:var(--accent-alt);color:white;" onclick="pickImageFromLibrary('circle-images')">从图片库选择</button>
      </div>
    </div>
  `;

  document.getElementById('modalSave').onclick = async () => {
    const data = {
      name: document.getElementById('cName').value,
      category: document.getElementById('cCategory').value,
      description: document.getElementById('cDesc').value,
      socialLinks: {
        [document.getElementById('cContactType').value]: document.getElementById('cContactValue').value,
        contactLabel: document.getElementById('cContactLabel').value,
        website: document.getElementById('cWebsite').value,
        websiteLabel: document.getElementById('cWebsiteLabel').value
      },
      logo: document.getElementById('cLogoPreview').querySelector('img')?.src || '',
      images: [...document.querySelectorAll('#cImagesPreview img')].map(img => img.src)
    };

    if (!data.name) { alert('请填写作者名称'); return; }

    if (isEdit) {
      await adminAPI('PUT', `/api/admin/circles/${circle.id}`, data);
    } else {
      await adminAPI('POST', '/api/admin/circles', data);
    }
    closeModal();
    loadCircles();
  };

  openModal();
}

async function editCircle(id) {
  const circles = await adminAPI('GET', '/api/admin/circles');
  const circle = circles.find(c => c.id === id);
  if (circle) {
    openCircleModal(circle);
  }
}

async function deleteCircle(id) {
  if (!confirm('确定要删除这个作者吗？')) return;
  await adminAPI('DELETE', `/api/admin/circles/${id}`);
  loadCircles();
}

async function uploadCircleLogo() {
  const input = document.getElementById('cLogoInput');
  const preview = document.getElementById('cLogoPreview');
  if (!input.files.length) { alert('请选择头像图片'); return; }
  const res = await uploadImage(input.files[0]);
  if (res.url) {
    preview.innerHTML = `<div style="position:relative;display:inline-block;"><img src="${res.url}" style="width:80px;height:80px;object-fit:cover;border-radius:50%;"><button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button></div>`;
  }
  input.value = '';
}

async function uploadCircleImages() {
  const input = document.getElementById('cImageInput');
  const preview = document.getElementById('cImagesPreview');
  if (!input.files.length) { alert('请选择图片'); return; }
  for (const file of input.files) {
    const res = await uploadImage(file);
    if (res.url) {
      appendImagePreview(preview, res.url);
    }
  }
  input.value = '';
}

function appendImagePreview(container, url) {
  const div = document.createElement('div');
  div.style.position = 'relative';
  div.innerHTML = `<img src="${url}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;"><button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button>`;
  container.appendChild(div);
}

function filterImageLibrary(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('#imageLibGrid .image-pick-item').forEach(item => {
    const name = item.dataset.name || '';
    item.style.display = name.includes(q) ? '' : 'none';
  });
}

async function pickImageFromLibrary(type) {
  const images = await adminAPI('GET', '/api/admin/images');
  if (!images || images.length === 0) {
    alert('图片库为空，请先在图片管理中上传图片');
    return;
  }
  const savedBody = document.getElementById('modalBody').innerHTML;
  const savedTitle = document.getElementById('modalTitle').textContent;
  const savedSaveText = document.getElementById('modalSave').textContent;
  const savedSaveOnclick = document.getElementById('modalSave').onclick;
  document.getElementById('modalTitle').textContent = '选择图片';
  document.getElementById('modalBody').innerHTML = `
    <input type="text" class="form-input" id="imageLibSearch" placeholder="搜索图片名称..." style="margin-bottom:0.8rem;padding:0.4rem 0.8rem;font-size:0.85rem;" oninput="filterImageLibrary(this.value)">
    <p style="color:var(--haze);font-size:0.85rem;margin-bottom:0.8rem;">点击图片选中，然后点击"确定选择"添加。</p>
    <div id="imageLibGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:0.5rem;max-height:350px;overflow-y:auto;">
      ${images.map(img => `
        <div class="image-pick-item" data-url="${img.url}" data-name="${(img.name || '').toLowerCase()}" onclick="this.classList.toggle('selected');this.style.outline=this.classList.contains('selected')?'3px solid var(--accent)':'none';" style="border-radius:6px;overflow:hidden;border:1px solid var(--border);cursor:pointer;transition:var(--transition);">
          <img src="${img.url}" alt="${img.name}" style="width:100%;height:80px;object-fit:cover;display:block;">
          <div style="padding:0.2rem;font-size:0.6rem;color:var(--haze);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${img.name}">${img.name}</div>
        </div>
      `).join('')}
    </div>
  `;
  document.getElementById('modalSave').textContent = '确定选择';
  document.getElementById('modalSave').onclick = () => {
    const selected = [...document.querySelectorAll('.image-pick-item.selected')].map(el => el.dataset.url);
    if (selected.length === 0) { alert('请至少选择一张图片'); return; }

    document.getElementById('modalBody').innerHTML = savedBody;
    document.getElementById('modalTitle').textContent = savedTitle;
    document.getElementById('modalSave').textContent = savedSaveText;
    document.getElementById('modalSave').onclick = savedSaveOnclick;

    if (type === 'circle-logo') {
      const preview = document.getElementById('cLogoPreview');
      if (preview) preview.innerHTML = `<div style="position:relative;display:inline-block;"><img src="${selected[0]}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;"><button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button></div>`;
    } else if (type === 'circle-images') {
      const preview = document.getElementById('cImagesPreview');
      if (preview) selected.forEach(url => appendImagePreview(preview, url));
    } else if (type === 'event-cover') {
      const preview = document.getElementById('eCoverPreview');
      if (preview) preview.innerHTML = `<div style="position:relative;display:inline-block;"><img src="${selected[0]}" style="width:120px;height:80px;object-fit:cover;border-radius:6px;"><button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button></div>`;
    } else if (type === 'event-images') {
      const preview = document.getElementById('eImagesPreview');
      if (preview) selected.forEach(url => appendImagePreview(preview, url));
    } else if (type === 'project-cover') {
      const preview = document.getElementById('pCoverPreview');
      if (preview) preview.innerHTML = `<div style="position:relative;display:inline-block;"><img src="${selected[0]}" style="width:120px;height:80px;object-fit:cover;border-radius:6px;"><button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button></div>`;
    } else if (type === 'project-images') {
      const preview = document.getElementById('pImagesPreview');
      if (preview) selected.forEach(url => appendImagePreview(preview, url));
    } else if (type === 'work-images') {
      const preview = document.getElementById('wImagePreview');
      if (preview) selected.forEach(url => appendImagePreview(preview, url));
    } else if (type === 'work-more-images') {
      const preview = document.getElementById('wMoreImagePreview');
      if (preview) selected.forEach(url => appendImagePreview(preview, url));
    } else if (type === 'update-cover') {
      const preview = document.getElementById('updCoverPreview');
      if (preview) preview.innerHTML = `<div style="position:relative;display:inline-block;"><img src="${selected[0]}" style="width:120px;height:80px;object-fit:cover;border-radius:6px;"><button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button></div>`;
    } else if (type === 'update-images') {
      const preview = document.getElementById('updImagesPreview');
      if (preview) selected.forEach(url => appendImagePreview(preview, url));
    }
  };
  openModal();
}

// ===== Projects =====
async function loadProjects(page = 1) {
  const [projectsResp, circles, events] = await Promise.all([
    adminAPI('GET', `/api/admin/projects?page=${page}&limit=${PAGE_LIMIT}`),
    adminAPI('GET', '/api/admin/circles'),
    adminAPI('GET', '/api/admin/events')
  ]);

  // Handle paginated response
  if (projectsResp && projectsResp.items) {
    adminProjectsData = projectsResp.items;
    pagination.projects = { page: projectsResp.page, total: projectsResp.total, totalPages: projectsResp.totalPages };
  } else {
    adminProjectsData = projectsResp || [];
    pagination.projects = { page: 1, total: adminProjectsData.length, totalPages: 1 };
  }

  (circles || []).forEach(c => adminCirclesMap[c.id] = c.name);
  renderProjectsTable(adminProjectsData);
  // Render pagination
  const paginationEl = document.getElementById('projectsPagination');
  if (paginationEl) paginationEl.innerHTML = renderPagination('projects', 'loadProjects');
}

function renderProjectsTable(projects) {
  const tbody = document.getElementById('projectsTableBody');
  if (!projects || projects.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--haze);padding:2rem;">暂无企划</td></tr>';
    return;
  }
  tbody.innerHTML = projects.map((p, i) => {
    const circlesCount = (p.circles || []).length;
    const eventsCount = (p.events || []).length;
    const approvalBadge = p.approvalStatus === 'approved' ? '<span style="background:#2ecc71;color:white;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.7rem;">已批准</span>'
      : p.approvalStatus === 'rejected' ? '<span style="background:var(--accent);color:white;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.7rem;">已拒绝</span>'
      : p.approvalStatus === 'pending' ? '<span style="background:#f39c12;color:white;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.7rem;">待审核</span>'
      : '<span style="background:var(--haze);color:white;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.7rem;">-</span>';
    const approveBtn = p.approvalStatus === 'pending' ? `<button class="btn-sm" style="background:#2ecc71;color:white;" onclick="approveProject('${p.id}')">批准</button><button class="btn-sm" style="background:var(--accent);color:white;" onclick="rejectProject('${p.id}')">拒绝</button>` : '';
    const editableAuthors = (p.editableBy || []).map(cid => {
      const circle = adminCirclesMap[cid];
      return circle ? `<span style="background:var(--paper);padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;margin-right:0.2rem;">${escapeHtml(circle)}</span>` : '';
    }).join('') || '<span style="color:var(--haze);font-size:0.75rem;">-</span>';
    return `
    <tr>
      <td>${renderOrderControls('projects', p.id, i, projects.length)}</td>
      <td><input type="checkbox" class="project-checkbox" value="${p.id}" onchange="updateProjectBatchBtn()" style="width:16px;height:16px;accent-color:var(--accent);"></td>
      <td class="editable-cell" onclick="makeProjectEditable(this, '${p.id}', 'title', '${escapeHtml(p.title)}')">${p.title}</td>
      <td>${approvalBadge}</td>
      <td class="editable-cell" onclick="makeSelectProjectCategory(this, '${p.id}', '${p.category}')">${PROJECT_CATEGORIES[p.category] || p.category}</td>
      <td class="editable-cell" onclick="makeSelectProjectStatus(this, '${p.id}', '${p.status}')"><span class="card-tag ${p.status}">${PROJECT_STATUS_LABELS[p.status] || p.status}</span></td>
      <td>作者${circlesCount} / 活动${eventsCount}</td>
      <td>${editableAuthors} <button class="btn-sm" style="font-size:0.7rem;padding:0.1rem 0.3rem;" onclick="manageEditableAuthors('projects','${p.id}')">管理</button></td>
      <td>
        <div class="table-actions">
          ${approveBtn}
          <button class="btn-sm btn-edit" onclick="manageProjectRelations('${p.id}')">关联</button>
          <button class="btn-sm btn-edit" onclick="editProject('${p.id}')">编辑</button>
          <button class="btn-sm btn-delete" onclick="deleteProject('${p.id}')">删除</button>
        </div>
      </td>
    </tr>
  `}).join('');
}

async function approveProject(id) {
  const result = await adminAPI('POST', `/api/admin/projects/${id}/approve`);
  if (result && result.success) { showToast('已批准', 'success'); loadProjects(); }
}

async function rejectProject(id) {
  const reason = prompt('拒绝原因（可选）');
  const result = await adminAPI('POST', `/api/admin/projects/${id}/reject`, { reason });
  if (result && result.success) { showToast('已拒绝', 'success'); loadProjects(); }
}

// Batch approve/reject projects
async function batchApproveProjects() {
  const pendingProjects = adminProjectsData.filter(p => p.approvalStatus === 'pending');
  if (pendingProjects.length === 0) { alert('没有待审核的企划'); return; }
  if (!confirm(`确定批准全部 ${pendingProjects.length} 个待审核企划？`)) return;

  let success = 0;
  for (const p of pendingProjects) {
    const result = await adminAPI('POST', `/api/admin/projects/${p.id}/approve`);
    if (result && result.success) success++;
  }
  showToast(`已批准 ${success} 个企划`, 'success');
  loadProjects();
}

async function batchRejectProjects() {
  const pendingProjects = adminProjectsData.filter(p => p.approvalStatus === 'pending');
  if (pendingProjects.length === 0) { alert('没有待审核的企划'); return; }
  const reason = prompt('拒绝原因（可选）');
  if (reason === null) return;
  if (!confirm(`确定拒绝全部 ${pendingProjects.length} 个待审核企划？`)) return;

  let success = 0;
  for (const p of pendingProjects) {
    const result = await adminAPI('POST', `/api/admin/projects/${p.id}/reject`, { reason });
    if (result && result.success) success++;
  }
  showToast(`已拒绝 ${success} 个企划`, 'success');
  loadProjects();
}

// Batch delete projects
function updateProjectBatchBtn() {
  const checked = document.querySelectorAll('.project-checkbox:checked');
  const btn = document.getElementById('projectsBatchDeleteBtn');
  if (btn) btn.style.display = checked.length > 0 ? 'inline-block' : 'none';
}

function toggleSelectAllProjects() {
  const selectAll = document.getElementById('projectsSelectAll');
  document.querySelectorAll('.project-checkbox').forEach(cb => cb.checked = selectAll.checked);
  updateProjectBatchBtn();
}

async function batchDeleteProjects() {
  const checked = document.querySelectorAll('.project-checkbox:checked');
  if (checked.length === 0) { alert('请先选择要删除的企划'); return; }
  if (!confirm(`确定删除选中的 ${checked.length} 个企划？此操作不可撤销。`)) return;

  let success = 0;
  for (const cb of checked) {
    const result = await adminAPI('DELETE', `/api/admin/projects/${cb.value}`);
    if (result && result.success) success++;
  }
  showToast(`已删除 ${success} 个企划`, 'success');
  loadProjects();
}

async function inlineUpdateProject(projectId, field, value) {
  const projects = await adminAPI('GET', '/api/admin/projects');
  const project = projects.find(p => p.id === projectId);
  if (!project) return;
  project[field] = value;
  await adminAPI('PUT', `/api/admin/projects/${projectId}`, project);
  showToast('已保存', 'success');
}

function makeProjectEditable(cell, projectId, field, currentValue) {
  if (cell.querySelector('input')) return;
  const original = cell.innerHTML;
  cell.innerHTML = `<input type="text" class="form-input" value="${escapeHtml(currentValue)}" style="padding:0.3rem 0.5rem;font-size:0.85rem;width:100%;">`;
  const input = cell.querySelector('input');
  input.focus();
  input.select();
  const save = async () => {
    const newValue = input.value;
    if (newValue !== currentValue) {
      await inlineUpdateProject(projectId, field, newValue);
    }
    loadProjects();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { cell.innerHTML = original; } });
}

function makeSelectProjectCategory(cell, projectId, currentValue) {
  if (cell.querySelector('select')) return;
  const original = cell.innerHTML;
  const options = Object.entries(PROJECT_CATEGORIES).map(([k, v]) => `<option value="${k}" ${k === currentValue ? 'selected' : ''}>${v}</option>`).join('');
  cell.innerHTML = `<select class="form-input" style="padding:0.3rem 0.5rem;font-size:0.85rem;">${options}</select>`;
  const select = cell.querySelector('select');
  select.focus();
  const save = async () => {
    const newValue = select.value;
    if (newValue !== currentValue) {
      await inlineUpdateProject(projectId, 'category', newValue);
    }
    cell.innerHTML = original;
    loadProjects();
  };
  select.addEventListener('blur', save);
  select.addEventListener('change', () => select.blur());
}

function makeSelectProjectStatus(cell, projectId, currentValue) {
  if (cell.querySelector('select')) return;
  const original = cell.innerHTML;
  const options = Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${k === currentValue ? 'selected' : ''}>${v}</option>`).join('');
  cell.innerHTML = `<select class="form-input" style="padding:0.3rem 0.5rem;font-size:0.85rem;">${options}</select>`;
  const select = cell.querySelector('select');
  select.focus();
  const save = async () => {
    const newValue = select.value;
    if (newValue !== currentValue) {
      await inlineUpdateProject(projectId, 'status', newValue);
    }
    cell.innerHTML = original;
    loadProjects();
  };
  select.addEventListener('blur', save);
  select.addEventListener('change', () => select.blur());
}

function filterProjects() {
  const search = document.getElementById('projectsSearch').value.toLowerCase();
  if (!search) { renderProjectsTable(adminProjectsData); return; }
  const filtered = adminProjectsData.filter(p =>
    p.title.toLowerCase().includes(search) ||
    (PROJECT_CATEGORIES[p.category] || '').includes(search) ||
    (p.description || '').toLowerCase().includes(search)
  );
  renderProjectsTable(filtered);
}

function openProjectModal(project = null) {
  const isEdit = !!project;
  document.getElementById('modalTitle').textContent = isEdit ? '编辑企划' : '新增企划';
  document.getElementById('modalBody').innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label>企划名称 <span style="color:var(--accent)">*</span></label>
        <input class="form-input" id="pTitle" value="${project?.title || ''}" required>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>分类</label>
        <select class="form-input" id="pCategory">
          ${Object.entries(PROJECT_CATEGORIES).map(([k, v]) =>
            `<option value="${k}" ${project?.category === k ? 'selected' : ''}>${v}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>状态</label>
        <select class="form-input" id="pStatus">
          ${Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) =>
            `<option value="${k}" ${project?.status === k ? 'selected' : ''}>${v}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>开始日期</label>
        <input type="date" class="form-input" id="pStartDate" value="${project?.startDate || ''}">
      </div>
      <div class="form-group">
        <label>结束日期</label>
        <input type="date" class="form-input" id="pEndDate" value="${project?.endDate || ''}">
      </div>
    </div>
    <div class="form-group">
      <label>标签（逗号分隔）</label>
      <input class="form-input" id="pTags" value="${project?.tags?.join(', ') || ''}" placeholder="游戏, 东方">
    </div>
    <div class="form-group">
      <label>描述</label>
      <textarea class="form-input" id="pDesc">${project?.description || ''}</textarea>
    </div>
    <div class="form-group">
      <label>参与方式/联系方式</label>
      <textarea class="form-input" id="pContact">${project?.contactInfo || ''}</textarea>
    </div>
    <div class="form-group">
      <label>联系方式类型</label>
      <select class="form-input" id="pContactType">
        <option value="" ${!project?.socialLinks?.qq && !project?.socialLinks?.qqGroup ? 'selected' : ''}>无</option>
        <option value="qq" ${project?.socialLinks?.qq ? 'selected' : ''}>QQ</option>
        <option value="qqGroup" ${project?.socialLinks?.qqGroup ? 'selected' : ''}>QQ群</option>
      </select>
    </div>
    <div class="form-group">
      <label>联系方式</label>
      <input class="form-input" id="pContactValue" value="${project?.socialLinks?.qq || project?.socialLinks?.qqGroup || ''}" placeholder="QQ号或QQ群号">
    </div>
    <div class="form-group">
      <label>显示名称（前台显示的中文）</label>
      <input class="form-input" id="pContactLabel" value="${project?.socialLinks?.contactLabel || ''}" placeholder="如：QQ联系、加入QQ群">
    </div>
    <div class="form-group">
      <label>网站链接</label>
      <input class="form-input" id="pWebsite" value="${project?.socialLinks?.website || ''}" placeholder="https://...">
    </div>
    <div class="form-group">
      <label>网站显示名称</label>
      <input class="form-input" id="pWebsiteLabel" value="${project?.socialLinks?.websiteLabel || ''}" placeholder="如：访问官网、企划主页">
    </div>
    <div class="form-group">
      <label>首图（列表页封面图，仅限1张）</label>
      <div id="pCoverPreview" style="margin-bottom:0.5rem;">
        ${project?.coverImage ? `<div style="position:relative;display:inline-block;"><img src="${project.coverImage}" style="width:120px;height:80px;object-fit:cover;border-radius:6px;"><button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button></div>` : ''}
      </div>
      <input type="file" id="pCoverInput" accept="image/*" style="font-size:0.85rem;">
      <div style="display:flex;gap:0.4rem;margin-top:0.4rem;">
        <button type="button" class="btn-sm btn-edit" onclick="uploadProjectCover()">上传首图</button>
        <button type="button" class="btn-sm" style="background:var(--accent-alt);color:white;" onclick="pickImageFromLibrary('project-cover')">从图片库选择</button>
      </div>
    </div>
    <div class="form-group">
      <label>详情图片（企划详情页展示，可多张）</label>
      <div id="pImagesPreview" style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.5rem;">
        ${(project?.images || []).map((img, i) => `
          <div style="position:relative;">
            <img src="${img}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;">
            <button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button>
          </div>
        `).join('')}
      </div>
      <input type="file" id="pImageInput" accept="image/*" multiple style="font-size:0.85rem;">
      <div style="display:flex;gap:0.4rem;margin-top:0.4rem;">
        <button type="button" class="btn-sm btn-edit" onclick="uploadProjectImages()">上传图片</button>
        <button type="button" class="btn-sm" style="background:var(--accent-alt);color:white;" onclick="pickImageFromLibrary('project-images')">从图片库选择</button>
      </div>
    </div>
  `;

  document.getElementById('modalSave').onclick = async () => {
    const data = {
      title: document.getElementById('pTitle').value,
      category: document.getElementById('pCategory').value,
      status: document.getElementById('pStatus').value,
      startDate: document.getElementById('pStartDate').value,
      endDate: document.getElementById('pEndDate').value,
      tags: document.getElementById('pTags').value.split(',').map(t => t.trim()).filter(Boolean),
      description: document.getElementById('pDesc').value,
      contactInfo: document.getElementById('pContact').value,
      socialLinks: (() => {
        const type = document.getElementById('pContactType').value;
        const value = document.getElementById('pContactValue').value;
        const sl = {
          contactLabel: document.getElementById('pContactLabel').value,
          website: document.getElementById('pWebsite').value,
          websiteLabel: document.getElementById('pWebsiteLabel').value
        };
        if (type && value) sl[type] = value;
        return sl;
      })(),
      coverImage: document.querySelector('#pCoverPreview img')?.src || '',
      images: [...document.querySelectorAll('#pImagesPreview img')].map(img => img.src)
    };

    if (!data.title) { alert('请填写企划名称'); return; }

    if (isEdit) {
      await adminAPI('PUT', `/api/admin/projects/${project.id}`, data);
    } else {
      await adminAPI('POST', '/api/admin/projects', data);
    }
    closeModal();
    loadProjects();
  };

  openModal();
}

async function editProject(id) {
  const projects = await adminAPI('GET', '/api/admin/projects');
  const project = projects.find(p => p.id === id);
  if (project) {
    openProjectModal(project);
  }
}

async function deleteProject(id) {
  if (!confirm('确定要删除这个企划吗？')) return;
  await adminAPI('DELETE', `/api/admin/projects/${id}`);
  loadProjects();
}

async function manageProjectRelations(projectId) {
  const [projects, allCircles, allEvents] = await Promise.all([
    adminAPI('GET', '/api/admin/projects'),
    adminAPI('GET', '/api/admin/circles'),
    adminAPI('GET', '/api/admin/events')
  ]);
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  const relatedCircleIds = project.circles || [];
  const relatedEventIds = project.events || [];
  const relatedCircles = allCircles.filter(c => relatedCircleIds.includes(c.id));
  const otherCircles = allCircles.filter(c => !relatedCircleIds.includes(c.id));
  const relatedEvents = allEvents.filter(e => relatedEventIds.includes(e.id));
  const otherEvents = allEvents.filter(e => !relatedEventIds.includes(e.id));

  document.getElementById('modalTitle').textContent = `管理关联 — ${project.title}`;
  document.getElementById('modalBody').innerHTML = `
    <!-- 关联作者 -->
    <div style="margin-bottom:1.5rem;">
      <h4 style="font-size:0.95rem;margin-bottom:0.8rem;color:var(--accent);">已关联作者 (${relatedCircles.length})</h4>
      ${relatedCircles.length > 0 ? `
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.8rem;">
          ${relatedCircles.map(c => `
            <span style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.3rem 0.7rem;background:rgba(233,69,96,0.06);border-radius:100px;font-size:0.8rem;">
              ${c.name}
              <button onclick="removeProjectCircle('${projectId}', '${c.id}')" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:0.9rem;padding:0 0.2rem;" title="移除">&times;</button>
            </span>
          `).join('')}
        </div>
      ` : '<p style="color:var(--haze);font-size:0.85rem;margin-bottom:0.8rem;">暂无关联作者</p>'}
      ${otherCircles.length > 0 ? `
        <div>
          <p style="font-size:0.8rem;color:var(--haze);margin-bottom:0.4rem;">勾选添加：</p>
          <input type="text" class="form-input" placeholder="搜索作者名称..." style="margin-bottom:0.5rem;padding:0.4rem 0.6rem;font-size:0.8rem;" oninput="filterProjectCirclesList(this.value)">
          <div id="projectCirclesList" style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);">
            ${otherCircles.map(c => `
              <label class="project-circle-item" data-name="${(c.name || '').toLowerCase()}" style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;border-bottom:1px solid var(--border);cursor:pointer;font-size:0.8rem;"
                     onmouseover="this.style.background='rgba(233,69,96,0.03)'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" class="project-circle-checkbox" value="${c.id}" style="width:14px;height:14px;accent-color:var(--accent);">
                <span style="flex:1;">${c.name}</span>
              </label>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>

    <!-- 关联活动 -->
    <div style="margin-bottom:1rem;">
      <h4 style="font-size:0.95rem;margin-bottom:0.8rem;color:var(--accent-alt);">已关联活动 (${relatedEvents.length})</h4>
      ${relatedEvents.length > 0 ? `
        <table class="admin-table" style="margin-bottom:0;">
          <thead><tr><th>活动名称</th><th>日期</th><th>地点</th><th>操作</th></tr></thead>
          <tbody>
            ${relatedEvents.map(e => `
              <tr>
                <td>${e.title}</td>
                <td>${e.date || '-'}</td>
                <td>${e.location || '-'}</td>
                <td><button class="btn-sm btn-delete" onclick="removeProjectEvent('${projectId}', '${e.id}')">移除</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p style="color:var(--haze);font-size:0.85rem;">暂无关联活动</p>'}
      ${otherEvents.length > 0 ? `
        <div style="margin-top:0.8rem;">
          <p style="font-size:0.8rem;color:var(--haze);margin-bottom:0.4rem;">勾选添加：</p>
          <div style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);">
            ${otherEvents.map(e => `
              <label style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;border-bottom:1px solid var(--border);cursor:pointer;font-size:0.8rem;"
                     onmouseover="this.style.background='rgba(233,69,96,0.03)'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" class="project-event-checkbox" value="${e.id}" style="width:14px;height:14px;accent-color:var(--accent);">
                <span style="flex:1;">${e.title}</span>
                <span style="color:var(--haze);">${e.date || ''}</span>
              </label>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('modalSave').onclick = async () => {
    const checkedCircleIds = [...document.querySelectorAll('.project-circle-checkbox:checked')].map(cb => cb.value);
    const checkedEventIds = [...document.querySelectorAll('.project-event-checkbox:checked')].map(cb => cb.value);
    const updatedCircles = [...new Set([...relatedCircleIds, ...checkedCircleIds])];
    const updatedEvents = [...new Set([...relatedEventIds, ...checkedEventIds])];
    await adminAPI('PUT', `/api/admin/projects/${projectId}`, { ...project, circles: updatedCircles, events: updatedEvents });
    closeModal();
    loadProjects();
  };

  openModal();
}

async function removeProjectCircle(projectId, circleId) {
  try {
    const projects = await adminAPI('GET', '/api/admin/projects');
    const project = projects.find(p => p.id === projectId);
    if (!project) { alert('企划未找到'); return; }
    const updatedCircles = (project.circles || []).filter(id => id !== circleId);
    const result = await adminAPI('PUT', `/api/admin/projects/${projectId}`, { ...project, circles: updatedCircles });
    if (result && !result.error) {
      manageProjectRelations(projectId);
    } else {
      alert('移除失败: ' + (result.error || '未知错误'));
    }
  } catch (e) {
    alert('移除失败: ' + e.message);
  }
}

async function removeProjectEvent(projectId, eventId) {
  try {
    const projects = await adminAPI('GET', '/api/admin/projects');
    const project = projects.find(p => p.id === projectId);
    if (!project) { alert('企划未找到'); return; }
    const updatedEvents = (project.events || []).filter(id => id !== eventId);
    const result = await adminAPI('PUT', `/api/admin/projects/${projectId}`, { ...project, events: updatedEvents });
    if (result && !result.error) {
      manageProjectRelations(projectId);
    } else {
      alert('移除失败: ' + (result.error || '未知错误'));
    }
  } catch (e) {
    alert('移除失败: ' + e.message);
  }
}

async function uploadProjectCover() {
  const input = document.getElementById('pCoverInput');
  const preview = document.getElementById('pCoverPreview');
  if (!input.files.length) { alert('请选择首图'); return; }
  const res = await uploadImage(input.files[0]);
  if (res.url) {
    preview.innerHTML = `<div style="position:relative;display:inline-block;"><img src="${res.url}" style="width:120px;height:80px;object-fit:cover;border-radius:6px;"><button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button></div>`;
  }
  input.value = '';
}

async function uploadProjectImages() {
  const input = document.getElementById('pImageInput');
  const preview = document.getElementById('pImagesPreview');
  if (!input.files.length) { alert('请选择图片'); return; }
  for (const file of input.files) {
    const res = await uploadImage(file);
    if (res.url) {
      const div = document.createElement('div');
      div.style.position = 'relative';
      div.innerHTML = `<img src="${res.url}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;"><button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button>`;
      preview.appendChild(div);
    }
  }
  input.value = '';
}

// ===== Categories =====
let currentCategories = null;

async function loadCategories() {
  try {
    currentCategories = await adminAPI('GET', '/api/admin/categories');
    renderCategories();
  } catch (e) {
    document.getElementById('categoriesContent').innerHTML =
      '<div class="empty-state"><div class="icon">!</div><p>加载失败</p></div>';
  }
}

let currentCatTab = 'works';

function saveCurrentTabEdits() {
  if (!currentCategories) return;
  const types = currentCatTab === 'works'
    ? ['works', 'workStatus']
    : currentCatTab === 'circles'
    ? ['circleCategories']
    : currentCatTab === 'events'
    ? ['eventStatus']
    : ['projects', 'projectStatus'];
  types.forEach(type => {
    const inputs = document.querySelectorAll(`[data-type="${type}"]`);
    const items = [];
    for (let i = 0; i < inputs.length; i += 2) {
      const id = inputs[i].value.trim();
      const name = inputs[i + 1].value.trim();
      if (id && name) items.push({ id, name, order: i / 2 });
    }
    currentCategories[type] = items;
  });
}

function switchCatTab(tab) {
  // Save current tab's edits before switching
  saveCurrentTabEdits();
  currentCatTab = tab;
  document.querySelectorAll('[data-cattab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cattab === tab);
  });
  renderCategories();
}

function renderCategories() {
  if (!currentCategories) return;
  const container = document.getElementById('categoriesContent');

  function renderCategoryItems(items, type) {
    return items.map((cat, i) => `
      <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;align-items:center;">
        <div style="display:flex;gap:2px;">
          <button class="btn-sm" onclick="reorderCategory('${type}', ${i}, -1)" ${i === 0 ? 'disabled style="opacity:0.3"' : ''}>↑</button>
          <button class="btn-sm" onclick="reorderCategory('${type}', ${i}, 1)" ${i === items.length - 1 ? 'disabled style="opacity:0.3"' : ''}>↓</button>
        </div>
        <input class="form-input" value="${cat.id}" data-field="id" data-index="${i}" data-type="${type}" style="flex:1;" placeholder="ID">
        <input class="form-input" value="${cat.name}" data-field="name" data-index="${i}" data-type="${type}" style="flex:2;" placeholder="显示名称">
        <button class="btn-sm btn-delete" onclick="removeCategory('${type}', ${i})">删除</button>
      </div>
    `).join('');
  }

  if (currentCatTab === 'works') {
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;">
        <div class="admin-card">
          <h3 style="margin-bottom:1rem;color:var(--accent);">作品分类</h3>
          <p style="color:var(--haze);font-size:0.8rem;margin-bottom:0.8rem;">用于周边概览页面的作品分类筛选</p>
          <div id="worksCategoriesList">
            ${renderCategoryItems(currentCategories.works, 'works')}
          </div>
          <button class="btn-sm btn-edit" onclick="addCategory('works')" style="margin-top:0.5rem;">+ 添加分类</button>
        </div>
        <div class="admin-card">
          <h3 style="margin-bottom:1rem;color:#2ecc71;">作品状态</h3>
          <p style="color:var(--haze);font-size:0.8rem;margin-bottom:0.8rem;">用于周边概览页面的状态筛选</p>
          <div id="workStatusList">
            ${renderCategoryItems(currentCategories.workStatus, 'workStatus')}
          </div>
          <button class="btn-sm btn-edit" onclick="addCategory('workStatus')" style="margin-top:0.5rem;">+ 添加状态</button>
        </div>
      </div>
    `;
  } else if (currentCatTab === 'circles') {
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr;gap:1.5rem;">
        <div class="admin-card">
          <h3 style="margin-bottom:1rem;color:#9b59b6;">作者分类</h3>
          <p style="color:var(--haze);font-size:0.8rem;margin-bottom:0.8rem;">用于同人作者页面的分类筛选</p>
          <div id="circleCategoriesList">
            ${renderCategoryItems(currentCategories.circleCategories || [], 'circleCategories')}
          </div>
          <button class="btn-sm btn-edit" onclick="addCategory('circleCategories')" style="margin-top:0.5rem;">+ 添加分类</button>
        </div>
      </div>
    `;
  } else if (currentCatTab === 'events') {
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr;gap:1.5rem;">
        <div class="admin-card">
          <h3 style="margin-bottom:1rem;color:#3498db;">活动状态</h3>
          <p style="color:var(--haze);font-size:0.8rem;margin-bottom:0.8rem;">用于近期活动页面的状态筛选和显示</p>
          <div id="eventStatusList">
            ${renderCategoryItems(currentCategories.eventStatus || [], 'eventStatus')}
          </div>
          <button class="btn-sm btn-edit" onclick="addCategory('eventStatus')" style="margin-top:0.5rem;">+ 添加状态</button>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;">
        <div class="admin-card">
          <h3 style="margin-bottom:1rem;color:var(--accent-alt);">企划分类</h3>
          <p style="color:var(--haze);font-size:0.8rem;margin-bottom:0.8rem;">用于同人企划页面的分类筛选</p>
          <div id="projectsCategoriesList">
            ${renderCategoryItems(currentCategories.projects, 'projects')}
          </div>
          <button class="btn-sm btn-edit" onclick="addCategory('projects')" style="margin-top:0.5rem;">+ 添加分类</button>
        </div>
        <div class="admin-card">
          <h3 style="margin-bottom:1rem;color:#f39c12;">企划状态</h3>
          <p style="color:var(--haze);font-size:0.8rem;margin-bottom:0.8rem;">用于同人企划页面的状态筛选</p>
          <div id="projectStatusList">
            ${renderCategoryItems(currentCategories.projectStatus, 'projectStatus')}
          </div>
          <button class="btn-sm btn-edit" onclick="addCategory('projectStatus')" style="margin-top:0.5rem;">+ 添加状态</button>
        </div>
      </div>
    `;
  }
  container.innerHTML += '<p style="color:var(--haze);font-size:0.8rem;margin-top:1rem;">提示：ID 用于系统内部标识（英文小写），名称用于前台显示。使用上下箭头调整排序。修改后请点击右上角"保存更改"。</p>';
}

function reorderCategory(type, index, direction) {
  saveCurrentTabEdits();
  const items = currentCategories[type];
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= items.length) return;
  [items[index], items[newIndex]] = [items[newIndex], items[index]];
  // Update order values
  items.forEach((item, i) => item.order = i);
  renderCategories();
}

function addCategory(type) {
  saveCurrentTabEdits();
  currentCategories[type].push({ id: '', name: '' });
  renderCategories();
}

function removeCategory(type, index) {
  saveCurrentTabEdits();
  currentCategories[type].splice(index, 1);
  renderCategories();
}

async function saveCategories() {
  // Save current tab's edits first
  saveCurrentTabEdits();

  try {
    const result = await adminAPI('PUT', '/api/admin/categories', currentCategories);
    if (result && result.success) {
      showToast('分类保存成功', 'success');
      // Reload categories from server to update admin variables
      await loadCategoriesFromAPI();
      // Re-render current page to reflect new categories
      if (currentPage === 'works') renderWorksTable(adminWorksData);
      else if (currentPage === 'projects') renderProjectsTable(adminProjectsData);
    } else {
      alert('保存失败: ' + (result.error || '未知错误'));
    }
  } catch (e) {
    alert('保存失败: ' + e.message);
  }
}

function showToast(message, type = 'info') {
  let toast = document.getElementById('adminToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'adminToast';
    toast.style.cssText = 'position:fixed;bottom:2rem;right:2rem;padding:1rem 1.5rem;border-radius:8px;font-size:0.9rem;z-index:9999;transition:all 0.3s;transform:translateY(100px);opacity:0;';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.background = type === 'success' ? '#2ecc71' : '#e94560';
  toast.style.color = 'white';
  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
    setTimeout(() => {
      toast.style.transform = 'translateY(100px)';
      toast.style.opacity = '0';
    }, 3000);
  });
}

// ===== Image Manager =====
function batchUploadImages() {
  document.getElementById('batchUploadInput').click();
}

async function handleBatchUpload(input) {
  if (!input.files.length) return;
  const files = Array.from(input.files);
  let uploaded = 0;
  for (const file of files) {
    const res = await uploadImage(file);
    if (res.url) uploaded++;
  }
  input.value = '';
  showToast(`成功上传 ${uploaded} 张图片`, 'success');
  loadImages();
}

async function loadImages() {
  try {
    let images = await adminAPI('GET', '/api/admin/images');
    const gallery = document.getElementById('imageGallery');
    if (!images || images.length === 0) {
      gallery.innerHTML = '<p style="color:var(--haze);grid-column:1/-1;text-align:center;padding:2rem;">暂无已上传的图片</p>';
      document.getElementById('batchDeleteImagesBtn').style.display = 'none';
      return;
    }
    // Apply search filter (name or uploader)
    const search = (document.getElementById('imageSearchInput')?.value || '').toLowerCase().trim();
    if (search) {
      images = images.filter(img => img.name.toLowerCase().includes(search) || (img.uploader || '').toLowerCase().includes(search));
    }
    if (images.length === 0) {
      gallery.innerHTML = '<p style="color:var(--haze);grid-column:1/-1;text-align:center;padding:2rem;">未找到匹配的图片</p>';
      document.getElementById('batchDeleteImagesBtn').style.display = 'none';
      return;
    }
    // Apply sorting
    const sortVal = document.getElementById('imageSortSelect')?.value || 'time-desc';
    if (sortVal === 'time-asc') {
      images.sort((a, b) => new Date(a.time) - new Date(b.time));
    } else if (sortVal === 'size-desc') {
      images.sort((a, b) => (b.size || 0) - (a.size || 0));
    } else if (sortVal === 'size-asc') {
      images.sort((a, b) => (a.size || 0) - (b.size || 0));
    } else if (sortVal === 'name-asc') {
      images.sort((a, b) => a.name.localeCompare(b.name));
    }
    // else 'time-desc' is default from API
    gallery.innerHTML = images.map(img => {
      const sizeMB = img.size ? (img.size / 1024 / 1024).toFixed(2) : '?';
      const uploadDate = img.uploadedAt ? new Date(img.uploadedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '';
      const uploader = img.uploader || '';
      return `
      <div style="position:relative;border-radius:8px;overflow:hidden;border:1px solid var(--border);background:var(--paper);">
        <input type="checkbox" class="image-checkbox" value="${img.name}" style="position:absolute;top:6px;left:6px;z-index:2;width:16px;height:16px;accent-color:var(--accent);cursor:pointer;" onchange="updateImageBatchBtn()">
        <img src="${img.url}" alt="${img.name}" style="width:100%;height:120px;object-fit:cover;display:block;cursor:pointer;" onclick="copyImageUrl('${img.url}')" title="点击复制链接">
        <div style="padding:0.4rem 0.5rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:0.65rem;color:var(--haze);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${img.name}</span>
            <button onclick="deleteImage('${img.name}')" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:0.8rem;padding:0 0.3rem;" title="删除">&times;</button>
          </div>
          <div style="font-size:0.6rem;color:var(--haze);margin-top:0.15rem;">${sizeMB} MB</div>
          ${uploader ? '<div style="font-size:0.6rem;color:var(--accent-alt);margin-top:0.1rem;">' + escapeHtml(uploader) + (uploadDate ? ' · ' + uploadDate : '') + '</div>' : ''}
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    document.getElementById('imageGallery').innerHTML = '<p style="color:var(--haze);grid-column:1/-1;text-align:center;padding:2rem;">加载失败</p>';
  }
}

function updateImageBatchBtn() {
  const checked = document.querySelectorAll('.image-checkbox:checked');
  const btn = document.getElementById('batchDeleteImagesBtn');
  btn.style.display = checked.length > 0 ? 'inline-flex' : 'none';
  btn.textContent = checked.length > 0 ? `删除 ${checked.length} 张` : '批量删除';
}

async function batchDeleteImages() {
  const checked = document.querySelectorAll('.image-checkbox:checked');
  if (checked.length === 0) return;
  const count = checked.length;
  if (!confirm(`确定要删除选中的 ${count} 张图片吗？此操作不可撤销。`)) return;

  let deleted = 0;
  for (const cb of checked) {
    const result = await adminAPI('DELETE', `/api/admin/images/${cb.value}`);
    if (result && result.success) deleted++;
  }
  showToast(`已删除 ${deleted} 张图片`, 'success');
  loadImages();
}

function copyImageUrl(url) {
  const fullUrl = location.origin + url;
  navigator.clipboard.writeText(fullUrl).then(() => {
    showToast('链接已复制', 'success');
  }).catch(() => {
    prompt('复制此链接:', fullUrl);
  });
}

async function deleteImage(filename) {
  if (!confirm(`确定要删除图片 ${filename} 吗？`)) return;
  const result = await adminAPI('DELETE', `/api/admin/images/${filename}`);
  if (result && result.success) {
    showToast('图片已删除', 'success');
    loadImages();
  } else {
    alert('删除失败');
  }
}

async function cleanupUnusedImages() {
  try {
    // First, get preview of unused images
    const preview = await adminAPI('GET', '/api/admin/images/unused');
    if (!preview || preview.error) {
      alert('查询失败: ' + (preview.error || '未知错误'));
      return;
    }

    if (preview.count === 0) {
      showToast('没有未使用的图片', 'success');
      return;
    }

    // Show preview modal
    document.getElementById('modalTitle').textContent = '清理未使用图片';
    document.getElementById('modalBody').innerHTML = `
      <p style="margin-bottom:1rem;">共 ${preview.total} 张图片，其中 <strong style="color:var(--accent);">${preview.count} 张</strong> 未被使用：</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:0.6rem;max-height:300px;overflow-y:auto;padding:0.5rem;border:1px solid var(--border);border-radius:var(--radius-sm);">
        ${preview.unused.map(img => `
          <div style="border-radius:6px;overflow:hidden;border:1px solid var(--border);background:var(--paper);">
            <img src="${img.url}" alt="${img.name}" style="width:100%;height:80px;object-fit:cover;display:block;">
            <div style="padding:0.2rem 0.3rem;font-size:0.6rem;color:var(--haze);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${img.name}">${img.name}</div>
          </div>
        `).join('')}
      </div>
      <p style="margin-top:1rem;color:var(--accent);font-size:0.85rem;">此操作不可撤销，确定要删除以上图片吗？</p>
    `;
    document.getElementById('modalSave').textContent = `删除 ${preview.count} 张`;
    document.getElementById('modalSave').onclick = async () => {
      const result = await adminAPI('POST', '/api/admin/images/cleanup');
      if (result && result.success) {
        showToast(`已删除 ${result.deleted} 张未使用图片`, 'success');
        closeModal();
        document.getElementById('modalSave').textContent = '保存';
        loadImages();
      } else {
        alert('清理失败: ' + (result.error || '未知错误'));
      }
    };
    openModal();
  } catch (e) {
    alert('查询失败: ' + e.message);
  }
}

// ===== Settings =====
let currentSettings = null;

async function loadSettings() {
  try {
    currentSettings = await fetch('/api/settings').then(r => r.json());
    if (!currentSettings.pages) currentSettings.pages = {};
    renderSettings();
  } catch (e) {
    document.getElementById('settingsContent').innerHTML =
      '<div class="empty-state"><div class="icon">!</div><p>加载失败</p></div>';
  }
}

function renderSettings() {
  if (!currentSettings) return;
  const container = document.getElementById('settingsContent');
  const pages = currentSettings.pages;
  const site = currentSettings.site || {};

  const tabs = [
    { key: 'site', name: '网站设置' },
    { key: 'works', name: '周边概览' },
    { key: 'events', name: '近期活动' },
    { key: 'circles', name: '同人作者' },
    { key: 'projects', name: '同人企划' },
    { key: 'updates', name: '同人动态' },
    { key: 'about', name: '关于我们' },
    { key: 'author', name: '作者设置' }
  ];

  container.innerHTML = `
    <div class="view-toggle" style="margin-bottom:1rem;">
      ${tabs.map((t, i) => `
        <button class="view-btn ${i === 0 ? 'active' : ''}" data-settingpage="${t.key}" onclick="switchSettingsTab('${t.key}')">${t.name}</button>
      `).join('')}
    </div>

    <!-- Site Settings -->
    <div id="settings-site" class="settings-tab" style="display:block;">
      <div class="admin-card">
        <h3 style="margin-bottom:1rem;">网站基本设置</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Logo图标文字</label>
            <input class="form-input" id="setting_site_logoText" value="${site.logoText || 'F7'}" placeholder="F7">
            <p style="color:var(--haze);font-size:0.75rem;margin-top:0.3rem;">显示在左上角图标内的文字（1-2个字符）</p>
          </div>
          <div class="form-group">
            <label>品牌名称</label>
            <input class="form-input" id="setting_site_brandName" value="${site.brandName || 'f7goods'}" placeholder="f7goods">
            <p style="color:var(--haze);font-size:0.75rem;margin-top:0.3rem;">显示在Logo图标右边的文字</p>
          </div>
        </div>
        <div class="form-group">
          <label>网站图标 (Favicon)</label>
          <div id="faviconPreview" style="margin-bottom:0.5rem;">
            ${site.favicon ? `<div style="position:relative;display:inline-block;"><img src="${site.favicon}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;border:1px solid var(--border);"><button onclick="removeFavicon()" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:9px;cursor:pointer;line-height:1;">&times;</button></div>` : '<span style="color:var(--haze);font-size:0.85rem;">未设置</span>'}
          </div>
          <input type="file" id="faviconInput" accept="image/*" style="font-size:0.85rem;">
          <div style="display:flex;gap:0.4rem;margin-top:0.4rem;">
            <button type="button" class="btn-sm btn-edit" onclick="uploadFavicon()">上传图标</button>
            <button type="button" class="btn-sm" style="background:var(--accent-alt);color:white;" onclick="pickFaviconFromLibrary()">从图片库选择</button>
          </div>
          <p style="color:var(--haze);font-size:0.75rem;margin-top:0.3rem;">建议使用 32x32 或 64x64 的 PNG 图片</p>
        </div>
      </div>

      <!-- Footer Settings -->
      <div class="admin-card" style="margin-top:1.5rem;">
        <h3 style="margin-bottom:1rem;">底栏设置</h3>
        <div class="form-group">
          <label>底栏描述</label>
          <textarea class="form-input" id="setting_footer_description" style="min-height:80px;">${currentSettings.footer?.description || ''}</textarea>
        </div>
        <div class="form-group">
          <label>社交链接</label>
          <div id="socialLinksContainer">
            ${(currentSettings.footer?.socialLinks || []).map((link, i) => `
              <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;align-items:center;" class="social-link-row">
                <input class="form-input social-icon" value="${link.icon || ''}" style="width:50px;text-align:center;" placeholder="图标">
                <input class="form-input social-name" value="${link.name || ''}" style="flex:1;" placeholder="名称">
                <input class="form-input social-url" value="${link.url || ''}" style="flex:2;" placeholder="链接">
                <button class="btn-sm btn-delete" onclick="this.parentElement.remove()">删除</button>
              </div>
            `).join('')}
          </div>
          <button class="btn-sm btn-edit" onclick="addSocialLink()" style="margin-top:0.5rem;">+ 添加链接</button>
        </div>
      </div>
    </div>

    ${Object.entries({works:'周边概览', events:'近期活动', circles:'同人作者', projects:'同人企划', updates:'同人动态', about:'关于我们'}).map(([key, name]) => `
      <div id="settings-${key}" class="settings-tab" style="display:none;">
        <div class="admin-card">
          <h3 style="margin-bottom:1rem;">${name}页面设置</h3>
          ${key === 'about' ? `
            <div class="form-group">
              <label>顶部标题</label>
              <input class="form-input" id="setting_${key}_heroTitle" value="${pages[key]?.heroTitle || ''}">
            </div>
            <div class="form-group">
              <label>顶部副标题</label>
              <input class="form-input" id="setting_${key}_heroSubtitle" value="${pages[key]?.heroSubtitle || ''}">
            </div>
            <div class="form-group">
              <label>顶部背景图</label>
              <div id="setting_${key}_heroBgPreview" style="margin-bottom:0.5rem;">
                ${pages[key]?.heroBg ? `<div style="position:relative;display:inline-block;"><img src="${pages[key].heroBg}" style="width:160px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--border);"><button onclick="removeHeroBg('${key}')" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:9px;cursor:pointer;line-height:1;">&times;</button></div>` : '<span style="color:var(--haze);font-size:0.85rem;">未设置（使用默认渐变背景）</span>'}
              </div>
              <input type="file" id="setting_${key}_heroBgInput" accept="image/*" style="font-size:0.85rem;">
              <div style="display:flex;gap:0.4rem;margin-top:0.4rem;">
                <button type="button" class="btn-sm btn-edit" onclick="uploadHeroBg('${key}')">上传背景图</button>
                <button type="button" class="btn-sm" style="background:var(--accent-alt);color:white;" onclick="pickImageForHeroBg('${key}')">从图片库选择</button>
              </div>
              <input type="hidden" id="setting_${key}_heroBg" value="${pages[key]?.heroBg || ''}">
            </div>
            <div class="form-group">
              <label>故事标题</label>
              <input class="form-input" id="setting_${key}_storyTitle" value="${pages[key]?.storyTitle || ''}">
            </div>
            <div class="form-group">
              <label>故事内容</label>
              <textarea class="form-input" id="setting_${key}_storyContent" style="min-height:120px;">${pages[key]?.storyContent || ''}</textarea>
            </div>
            <div class="form-group">
              <label>联系标题</label>
              <input class="form-input" id="setting_${key}_contactTitle" value="${pages[key]?.contactTitle || ''}">
            </div>
            <div class="form-group">
              <label>联系内容</label>
              <textarea class="form-input" id="setting_${key}_contactContent">${pages[key]?.contactContent || ''}</textarea>
            </div>
            <div class="form-group">
              <label>联系方式列表</label>
              <div id="aboutContactLinksContainer">
                ${(pages[key]?.contactLinks || []).map((link, i) => `
                  <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;align-items:center;" class="about-link-row">
                    <input class="form-input about-link-icon" value="${link.icon || ''}" style="width:50px;text-align:center;" placeholder="图标">
                    <input class="form-input about-link-text" value="${link.text || ''}" style="flex:1;" placeholder="显示文字">
                    <input class="form-input about-link-url" value="${link.url || ''}" style="flex:2;" placeholder="链接">
                    <button class="btn-sm btn-delete" onclick="this.parentElement.remove()">删除</button>
                  </div>
                `).join('')}
              </div>
              <button class="btn-sm btn-edit" onclick="addAboutContactLink()" style="margin-top:0.5rem;">+ 添加联系方式</button>
            </div>
          ` : `
            <div class="form-group">
              <label>顶部标题</label>
              <input class="form-input" id="setting_${key}_heroTitle" value="${pages[key]?.heroTitle || ''}">
            </div>
            <div class="form-group">
              <label>顶部副标题</label>
              <input class="form-input" id="setting_${key}_heroSubtitle" value="${pages[key]?.heroSubtitle || ''}">
            </div>
            <div class="form-group">
              <label>顶部背景图</label>
              <div id="setting_${key}_heroBgPreview" style="margin-bottom:0.5rem;">
                ${pages[key]?.heroBg ? `<div style="position:relative;display:inline-block;"><img src="${pages[key].heroBg}" style="width:160px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--border);"><button onclick="removeHeroBg('${key}')" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:9px;cursor:pointer;line-height:1;">&times;</button></div>` : '<span style="color:var(--haze);font-size:0.85rem;">未设置（使用默认渐变背景）</span>'}
              </div>
              <input type="file" id="setting_${key}_heroBgInput" accept="image/*" style="font-size:0.85rem;">
              <div style="display:flex;gap:0.4rem;margin-top:0.4rem;">
                <button type="button" class="btn-sm btn-edit" onclick="uploadHeroBg('${key}')">上传背景图</button>
                <button type="button" class="btn-sm" style="background:var(--accent-alt);color:white;" onclick="pickImageForHeroBg('${key}')">从图片库选择</button>
              </div>
              <input type="hidden" id="setting_${key}_heroBg" value="${pages[key]?.heroBg || ''}">
            </div>
            <div class="form-group">
              <label>页面标题</label>
              <input class="form-input" id="setting_${key}_pageTitle" value="${pages[key]?.pageTitle || ''}">
            </div>
            <div class="form-group">
              <label>页面副标题</label>
              <input class="form-input" id="setting_${key}_pageSubtitle" value="${pages[key]?.pageSubtitle || ''}">
            </div>
          `}
        </div>
      </div>
    `).join('')}

    <!-- Author Settings -->
    <div id="settings-author" class="settings-tab" style="display:none;">
      <div class="admin-card">
        <h3 style="margin-bottom:1rem;">作者注册须知</h3>
        <div class="form-group">
          <label>注册须知内容</label>
          <textarea class="form-input" id="setting_author_registrationNotice" style="min-height:200px;" placeholder="请输入注册须知内容...">${currentSettings.authorRegistrationNotice || ''}</textarea>
          <p style="color:var(--haze);font-size:0.75rem;margin-top:0.3rem;">此内容将显示在作者登录页面的"注册须知"弹窗中</p>
        </div>
      </div>
    </div>
  `;
}

function switchSettingsTab(page) {
  document.querySelectorAll('[data-settingpage]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.settingpage === page);
  });
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.style.display = tab.id === `settings-${page}` ? 'block' : 'none';
  });
}

async function saveSettings() {
  const pages = {};
  const pageKeys = ['works', 'events', 'circles', 'projects', 'updates', 'about'];

  pageKeys.forEach(key => {
    pages[key] = {};
    const inputs = document.querySelectorAll(`[id^="setting_${key}_"]`);
    inputs.forEach(input => {
      const field = input.id.replace(`setting_${key}_`, '');
      pages[key][field] = input.value;
    });
  });

  // Collect about page contact links
  const aboutContactLinks = [];
  document.querySelectorAll('.about-link-row').forEach(row => {
    const icon = row.querySelector('.about-link-icon')?.value || '';
    const text = row.querySelector('.about-link-text')?.value || '';
    const url = row.querySelector('.about-link-url')?.value || '';
    if (text) aboutContactLinks.push({ icon, text, url });
  });
  pages.about.contactLinks = aboutContactLinks;

  const site = {
    logoText: document.getElementById('setting_site_logoText')?.value || 'F7',
    brandName: document.getElementById('setting_site_brandName')?.value || 'f7goods',
    favicon: currentSettings.site?.favicon || ''
  };

  // Collect footer social links
  const socialLinks = [];
  document.querySelectorAll('.social-link-row').forEach(row => {
    const icon = row.querySelector('.social-icon')?.value || '';
    const name = row.querySelector('.social-name')?.value || '';
    const url = row.querySelector('.social-url')?.value || '';
    if (name) socialLinks.push({ icon, name, url });
  });

  const footer = {
    description: document.getElementById('setting_footer_description')?.value || '',
    socialLinks
  };

  const authorRegistrationNotice = document.getElementById('setting_author_registrationNotice')?.value || '';

  try {
    const result = await adminAPI('PUT', '/api/admin/settings', { site, footer, pages, authorRegistrationNotice });
    if (result && result.success) {
      currentSettings.site = site;
      currentSettings.footer = footer;
      currentSettings.pages = pages;
      currentSettings.authorRegistrationNotice = authorRegistrationNotice;
      showToast('设置保存成功', 'success');
    } else {
      alert('保存失败');
    }
  } catch (e) {
    alert('保存失败: ' + e.message);
  }
}

function addSocialLink() {
  const container = document.getElementById('socialLinksContainer');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:0.5rem;margin-bottom:0.5rem;align-items:center;';
  row.className = 'social-link-row';
  row.innerHTML = `
    <input class="form-input social-icon" value="" style="width:50px;text-align:center;" placeholder="图标">
    <input class="form-input social-name" value="" style="flex:1;" placeholder="名称">
    <input class="form-input social-url" value="" style="flex:2;" placeholder="链接">
    <button class="btn-sm btn-delete" onclick="this.parentElement.remove()">删除</button>
  `;
  container.appendChild(row);
}

function addAboutContactLink() {
  const container = document.getElementById('aboutContactLinksContainer');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:0.5rem;margin-bottom:0.5rem;align-items:center;';
  row.className = 'about-link-row';
  row.innerHTML = `
    <input class="form-input about-link-icon" value="" style="width:50px;text-align:center;" placeholder="图标">
    <input class="form-input about-link-text" value="" style="flex:1;" placeholder="显示文字">
    <input class="form-input about-link-url" value="" style="flex:2;" placeholder="链接">
    <button class="btn-sm btn-delete" onclick="this.parentElement.remove()">删除</button>
  `;
  container.appendChild(row);
}

async function uploadFavicon() {
  const input = document.getElementById('faviconInput');
  if (!input.files.length) { alert('请选择图标文件'); return; }
  const res = await uploadImage(input.files[0]);
  if (res.url) {
    currentSettings.site = currentSettings.site || {};
    currentSettings.site.favicon = res.url;
    document.getElementById('faviconPreview').innerHTML = `<div style="position:relative;display:inline-block;"><img src="${res.url}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;border:1px solid var(--border);"><button onclick="removeFavicon()" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:9px;cursor:pointer;line-height:1;">&times;</button></div>`;
    showToast('图标已上传，请点击保存设置', 'success');
  }
  input.value = '';
}

function removeFavicon() {
  currentSettings.site = currentSettings.site || {};
  currentSettings.site.favicon = '';
  document.getElementById('faviconPreview').innerHTML = '<span style="color:var(--haze);font-size:0.85rem;">未设置</span>';
  showToast('图标已移除，请点击保存设置', 'success');
}

function pickFaviconFromLibrary() {
  document.getElementById('modalTitle').textContent = '从图片库选择图标';
  document.getElementById('modalBody').innerHTML = '<div class="loading"><div class="spinner"></div><p>加载图片...</p></div>';
  openModal();

  fetch('/api/admin/images', {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(res => res.json()).then(images => {
    if (!images || images.length === 0) {
      document.getElementById('modalBody').innerHTML = '<div class="empty-state"><p>暂无图片，请先上传</p></div>';
      return;
    }
    document.getElementById('modalBody').innerHTML = `
      <input type="text" class="form-input" id="imageLibSearch" placeholder="搜索图片名称..." style="margin-bottom:0.8rem;padding:0.4rem 0.8rem;font-size:0.85rem;" oninput="filterImageLibrary(this.value)">
      <div id="imageLibGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:0.8rem;max-height:400px;overflow-y:auto;">
        ${images.map(img => `
          <div style="position:relative;cursor:pointer;border:2px solid transparent;border-radius:8px;overflow:hidden;transition:var(--transition);" class="image-pick-item" data-url="${img.url}" data-name="${(img.name || '').toLowerCase()}" onclick="selectFaviconFromLibrary('${img.url}')">
            <img src="${img.url}" style="width:100%;height:80px;object-fit:cover;display:block;">
            <div style="font-size:0.65rem;padding:0.2rem;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${img.name}</div>
          </div>
        `).join('')}
      </div>
    `;
    document.getElementById('modalSave').onclick = () => { closeModal(); };
    document.getElementById('modalSave').textContent = '关闭';
  });
}

function selectFaviconFromLibrary(url) {
  currentSettings.site = currentSettings.site || {};
  currentSettings.site.favicon = url;
  document.getElementById('faviconPreview').innerHTML = `<div style="position:relative;display:inline-block;"><img src="${url}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;border:1px solid var(--border);"><button onclick="removeFavicon()" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:9px;cursor:pointer;line-height:1;">&times;</button></div>`;
  closeModal();
  showToast('图标已选择，请点击保存设置', 'success');
}

async function uploadHeroBg(pageKey) {
  const input = document.getElementById(`setting_${pageKey}_heroBgInput`);
  const preview = document.getElementById(`setting_${pageKey}_heroBgPreview`);
  if (!input.files.length) { alert('请选择背景图'); return; }
  const res = await uploadImage(input.files[0]);
  if (res.url) {
    document.getElementById(`setting_${pageKey}_heroBg`).value = res.url;
    preview.innerHTML = `<div style="position:relative;display:inline-block;"><img src="${res.url}" style="width:160px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--border);"><button onclick="removeHeroBg('${pageKey}')" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:9px;cursor:pointer;line-height:1;">&times;</button></div>`;
    showToast('背景图已上传，请点击保存设置', 'success');
  }
  input.value = '';
}

function removeHeroBg(pageKey) {
  document.getElementById(`setting_${pageKey}_heroBg`).value = '';
  document.getElementById(`setting_${pageKey}_heroBgPreview`).innerHTML = '<span style="color:var(--haze);font-size:0.85rem;">未设置（使用默认渐变背景）</span>';
  showToast('背景图已移除，请点击保存设置', 'success');
}

function pickImageForHeroBg(pageKey) {
  // Open image library picker
  const originalSave = document.getElementById('modalSave').onclick;
  const originalTitle = document.getElementById('modalTitle').textContent;
  const originalBody = document.getElementById('modalBody').innerHTML;

  document.getElementById('modalTitle').textContent = '从图片库选择背景图';
  document.getElementById('modalBody').innerHTML = '<div class="loading"><div class="spinner"></div><p>加载图片...</p></div>';
  openModal();

  fetch('/api/admin/images', {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(res => res.json()).then(images => {
    if (!images || images.length === 0) {
      document.getElementById('modalBody').innerHTML = '<div class="empty-state"><p>暂无图片，请先上传</p></div>';
      return;
    }
    document.getElementById('modalBody').innerHTML = `
      <input type="text" class="form-input" id="imageLibSearch" placeholder="搜索图片名称..." style="margin-bottom:0.8rem;padding:0.4rem 0.8rem;font-size:0.85rem;" oninput="filterImageLibrary(this.value)">
      <div id="imageLibGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:0.8rem;max-height:400px;overflow-y:auto;">
        ${images.map(img => `
          <div style="position:relative;cursor:pointer;border:2px solid transparent;border-radius:8px;overflow:hidden;transition:var(--transition);" class="image-pick-item" data-url="${img.url}" data-name="${(img.name || '').toLowerCase()}" onclick="selectHeroBgFromLibrary(this, '${pageKey}')">
            <img src="${img.url}" style="width:100%;height:90px;object-fit:cover;display:block;">
            <div style="font-size:0.7rem;padding:0.3rem;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${img.name}</div>
          </div>
        `).join('')}
      </div>
    `;
    document.getElementById('modalSave').onclick = () => { closeModal(); };
    document.getElementById('modalSave').textContent = '关闭';
  });
}

function selectHeroBgFromLibrary(el, pageKey) {
  const url = el.dataset.url;
  document.getElementById(`setting_${pageKey}_heroBg`).value = url;
  document.getElementById(`setting_${pageKey}_heroBgPreview`).innerHTML = `<div style="position:relative;display:inline-block;"><img src="${url}" style="width:160px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--border);"><button onclick="removeHeroBg('${pageKey}')" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:9px;cursor:pointer;line-height:1;">&times;</button></div>`;
  closeModal();
  showToast('背景图已选择，请点击保存设置', 'success');
}

// ===== Announcements =====
let adminAnnouncementsData = [];

async function loadAnnouncements() {
  try {
    const announcements = await adminAPI('GET', '/api/admin/announcements');
    adminAnnouncementsData = announcements || [];
    renderAnnouncementsTable(adminAnnouncementsData);
  } catch (e) {
    document.getElementById('announcementsTableBody').innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:var(--haze);padding:2rem;">加载失败</td></tr>';
  }
}

function renderAnnouncementsTable(announcements) {
  const tbody = document.getElementById('announcementsTableBody');
  if (!announcements || announcements.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--haze);padding:2rem;">暂无公告</td></tr>';
    return;
  }
  tbody.innerHTML = announcements
    .sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate))
    .map(a => `
      <tr>
        <td>${a.pinned ? '<span style="color:var(--accent);margin-right:0.3rem;">📌</span>' : ''}${escapeHtml(a.title)}</td>
        <td>${formatDateAdmin(a.publishDate)}</td>
        <td style="text-align:center;">${a.pinned ? '<span style="color:var(--accent);font-weight:600;">✓</span>' : '<span style="color:var(--haze);">-</span>'}</td>
        <td style="text-align:center;">${a.popup ? '<span style="color:#2ecc71;font-weight:600;">✓</span>' : '<span style="color:var(--haze);">-</span>'}</td>
        <td class="truncate" style="max-width:300px;">${escapeHtml(a.content)}</td>
        <td>
          <div class="table-actions">
            <button class="btn-sm btn-edit" onclick="editAnnouncement('${a.id}')">编辑</button>
            <button class="btn-sm btn-delete" onclick="deleteAnnouncement('${a.id}')">删除</button>
          </div>
        </td>
      </tr>
    `).join('');
}

function filterAnnouncements() {
  const search = (document.getElementById('announcementsSearch')?.value || '').toLowerCase();
  if (!search) {
    renderAnnouncementsTable(adminAnnouncementsData);
    return;
  }
  const filtered = adminAnnouncementsData.filter(a =>
    (a.title && a.title.toLowerCase().includes(search)) ||
    (a.content && a.content.toLowerCase().includes(search))
  );
  renderAnnouncementsTable(filtered);
}

function formatDateAdmin(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

function openAnnouncementModal(announcement = null) {
  const isEdit = !!announcement;
  document.getElementById('modalTitle').textContent = isEdit ? '编辑公告' : '新增公告';
  document.getElementById('modalBody').innerHTML = `
    <div class="form-group">
      <label>公告标题 <span style="color:var(--accent)">*</span></label>
      <input class="form-input" id="annTitle" value="${announcement?.title || ''}" required>
    </div>
    <div class="form-group">
      <label>发布日期 <span style="color:var(--accent)">*</span></label>
      <input type="date" class="form-input" id="annPublishDate" value="${announcement?.publishDate || new Date().toISOString().split('T')[0]}">
      <p style="color:var(--haze);font-size:0.75rem;margin-top:0.3rem;">设置为未来的日期可以延迟发布</p>
    </div>
    <div class="form-group">
      <label>公告内容 <span style="color:var(--accent)">*</span></label>
      <textarea class="form-input" id="annContent" style="min-height:150px;">${announcement?.content || ''}</textarea>
    </div>
    <div class="form-group" style="display:flex;align-items:center;gap:0.6rem;">
      <input type="checkbox" id="annPinned" style="width:16px;height:16px;accent-color:var(--accent);" ${announcement?.pinned ? 'checked' : ''}>
      <label for="annPinned" style="font-size:0.9rem;cursor:pointer;">置顶公告</label>
    </div>
    <div class="form-group" style="display:flex;align-items:center;gap:0.6rem;">
      <input type="checkbox" id="annPopup" style="width:16px;height:16px;accent-color:var(--accent);" ${announcement?.popup ? 'checked' : ''}>
      <label for="annPopup" style="font-size:0.9rem;cursor:pointer;">首次访问时弹窗显示</label>
    </div>
  `;

  document.getElementById('modalSave').onclick = async () => {
    const data = {
      title: document.getElementById('annTitle').value,
      publishDate: document.getElementById('annPublishDate').value,
      content: document.getElementById('annContent').value,
      pinned: document.getElementById('annPinned').checked,
      popup: document.getElementById('annPopup').checked
    };

    if (!data.title) { alert('请填写标题'); return; }
    if (!data.publishDate) { alert('请选择发布日期'); return; }
    if (!data.content) { alert('请填写内容'); return; }

    if (isEdit) {
      await adminAPI('PUT', `/api/admin/announcements/${announcement.id}`, data);
    } else {
      await adminAPI('POST', '/api/admin/announcements', data);
    }
    closeModal();
    loadAnnouncements();
  };

  openModal();
}

async function editAnnouncement(id) {
  const announcements = await adminAPI('GET', '/api/admin/announcements');
  const announcement = announcements.find(a => a.id === id);
  if (announcement) openAnnouncementModal(announcement);
}

async function deleteAnnouncement(id) {
  if (!confirm('确定要删除这条公告吗？')) return;
  await adminAPI('DELETE', `/api/admin/announcements/${id}`);
  loadAnnouncements();
}

// ===== Updates (同人动态) =====
async function loadUpdates(page = 1) {
  try {
    const [updatesResp, allEvents, allProjects, allCircles] = await Promise.all([
      adminAPI('GET', `/api/admin/updates?page=${page}&limit=${PAGE_LIMIT}`),
      adminAPI('GET', '/api/admin/events'),
      adminAPI('GET', '/api/admin/projects'),
      adminAPI('GET', '/api/admin/circles')
    ]);

    // Handle paginated response
    let updates;
    if (updatesResp && updatesResp.items) {
      updates = updatesResp.items;
      pagination.updates = { page: updatesResp.page, total: updatesResp.total, totalPages: updatesResp.totalPages };
    } else {
      updates = updatesResp || [];
      pagination.updates = { page: 1, total: updates.length, totalPages: 1 };
    }

    adminUpdatesData = updates;
    const eventsMap = {};
    (allEvents || []).forEach(e => eventsMap[e.id] = e.title);
    const projectsMap = {};
    (allProjects || []).forEach(p => projectsMap[p.id] = p.title);
    const circlesMap = {};
    (allCircles || []).forEach(c => circlesMap[c.id] = c.name);

    const tbody = document.getElementById('updatesTableBody');
    if (!updates || updates.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--haze);padding:2rem;">暂无动态</td></tr>';
      return;
    }
    tbody.innerHTML = updates
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.publishDate) - new Date(a.publishDate);
      })
      .map(u => {
        const related = [];
        (u.relatedCircles || []).forEach(cid => { if (circlesMap[cid]) related.push('🏠' + circlesMap[cid]); });
        (u.relatedEvents || []).forEach(eid => { if (eventsMap[eid]) related.push('📅' + eventsMap[eid]); });
        (u.relatedProjects || []).forEach(pid => { if (projectsMap[pid]) related.push('📋' + projectsMap[pid]); });
        const approvalBadge = u.approvalStatus === 'approved' ? '<span style="background:#2ecc71;color:white;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.7rem;">已批准</span>'
          : u.approvalStatus === 'rejected' ? '<span style="background:var(--accent);color:white;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.7rem;">已拒绝</span>'
          : u.approvalStatus === 'pending' ? '<span style="background:#f39c12;color:white;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.7rem;">待审核</span>'
          : '<span style="background:var(--haze);color:white;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.7rem;">-</span>';
        const approveBtn = u.approvalStatus === 'pending' ? `<button class="btn-sm" style="background:#2ecc71;color:white;" onclick="approveUpdate('${u.id}')">批准</button><button class="btn-sm" style="background:var(--accent);color:white;" onclick="rejectUpdate('${u.id}')">拒绝</button>` : '';
        const editableAuthors = (u.editableBy || []).map(cid => {
          const circle = circlesMap[cid];
          return circle ? `<span style="background:var(--paper);padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;margin-right:0.2rem;">${escapeHtml(circle)}</span>` : '';
        }).join('') || '<span style="color:var(--haze);font-size:0.75rem;">-</span>';
        return `
        <tr>
          <td>${u.pinned ? '<span style="color:var(--accent);margin-right:0.3rem;">📌</span>' : ''}${escapeHtml(u.title)}</td>
          <td>${approvalBadge}</td>
          <td>${formatDateAdmin(u.publishDate)}</td>
          <td style="text-align:center;">${u.pinned ? '<span style="color:var(--accent);font-weight:600;">✓</span>' : '<span style="color:var(--haze);">-</span>'}</td>
          <td style="font-size:0.8rem;">${related.length > 0 ? related.join(' ') : '<span style="color:var(--haze);">-</span>'}</td>
          <td>${editableAuthors} <button class="btn-sm" style="font-size:0.7rem;padding:0.1rem 0.3rem;" onclick="manageEditableAuthors('updates','${u.id}')">管理</button></td>
          <td class="truncate" style="max-width:250px;">${escapeHtml(u.content)}</td>
          <td>
            <div class="table-actions">
              ${approveBtn}
              <button class="btn-sm btn-edit" onclick="editUpdate('${u.id}')">编辑</button>
              <button class="btn-sm btn-delete" onclick="deleteUpdate('${u.id}')">删除</button>
            </div>
          </td>
        </tr>`;
      }).join('');

    // Render pagination
    const paginationEl = document.getElementById('updatesPagination');
    if (paginationEl) paginationEl.innerHTML = renderPagination('updates', 'loadUpdates');
  } catch (e) {
    document.getElementById('updatesTableBody').innerHTML =
      '<tr><td colspan="7" style="text-align:center;color:var(--haze);padding:2rem;">加载失败</td></tr>';
  }
}

// View approval detail
async function viewApprovalDetail(type, id) {
  let item = null;
  let html = '';

  if (type === 'author') {
    const circles = await adminAPI('GET', '/api/admin/circles');
    item = circles?.find(c => c.id === id);
    if (!item) return;
    html = `
      <div style="margin-bottom:1rem;"><strong>作者名称：</strong>${escapeHtml(item.name)}</div>
      <div style="margin-bottom:1rem;"><strong>用户名：</strong>${escapeHtml(item.username || '无')}</div>
      <div style="margin-bottom:1rem;"><strong>分类：</strong>${CIRCLE_CATEGORIES[item.category] || item.category || '未分类'}</div>
      <div style="margin-bottom:1rem;"><strong>描述：</strong>${escapeHtml(item.description || '无')}</div>
      <div style="margin-bottom:1rem;"><strong>联系方式：</strong>${item.socialLinks?.qq || item.socialLinks?.qqGroup || '无'}</div>
      ${item.logo ? `<div style="margin-bottom:1rem;"><strong>头像：</strong><br><img src="${item.logo}" style="width:80px;height:80px;object-fit:cover;border-radius:50%;margin-top:0.5rem;"></div>` : ''}
    `;
  } else if (type === 'event') {
    const events = await adminAPI('GET', '/api/admin/events');
    item = events?.find(e => e.id === id);
    if (!item) return;
    html = `
      <div style="margin-bottom:1rem;"><strong>活动名称：</strong>${escapeHtml(item.title)}</div>
      <div style="margin-bottom:1rem;"><strong>开始日期：</strong>${item.date || '未设置'}</div>
      <div style="margin-bottom:1rem;"><strong>结束日期：</strong>${item.endDate || '未设置'}</div>
      <div style="margin-bottom:1rem;"><strong>地点：</strong>${escapeHtml(item.location || '未设置')}</div>
      <div style="margin-bottom:1rem;"><strong>状态：</strong>${EVENT_STATUS_LABELS[item.status] || item.status || '未设置'}</div>
      <div style="margin-bottom:1rem;"><strong>描述：</strong>${escapeHtml(item.description || '无')}</div>
      ${item.coverImage ? `<div style="margin-bottom:1rem;"><strong>封面图：</strong><br><img src="${item.coverImage}" style="max-width:100%;max-height:200px;object-fit:contain;margin-top:0.5rem;border-radius:8px;"></div>` : ''}
    `;
  } else if (type === 'project') {
    const projects = await adminAPI('GET', '/api/admin/projects');
    item = projects?.find(p => p.id === id);
    if (!item) return;
    html = `
      <div style="margin-bottom:1rem;"><strong>企划名称：</strong>${escapeHtml(item.title)}</div>
      <div style="margin-bottom:1rem;"><strong>分类：</strong>${PROJECT_CATEGORIES[item.category] || item.category || '未分类'}</div>
      <div style="margin-bottom:1rem;"><strong>状态：</strong>${PROJECT_STATUS_LABELS[item.status] || item.status || '未设置'}</div>
      <div style="margin-bottom:1rem;"><strong>标签：</strong>${(item.tags || []).join(', ') || '无'}</div>
      <div style="margin-bottom:1rem;"><strong>描述：</strong>${escapeHtml(item.description || '无')}</div>
      ${item.coverImage ? `<div style="margin-bottom:1rem;"><strong>封面图：</strong><br><img src="${item.coverImage}" style="max-width:100%;max-height:200px;object-fit:contain;margin-top:0.5rem;border-radius:8px;"></div>` : ''}
    `;
  } else if (type === 'update') {
    const updates = await adminAPI('GET', '/api/admin/updates');
    item = updates?.find(u => u.id === id);
    if (!item) return;
    html = `
      <div style="margin-bottom:1rem;"><strong>标题：</strong>${escapeHtml(item.title)}</div>
      <div style="margin-bottom:1rem;"><strong>发布日期：</strong>${item.publishDate || '未设置'}</div>
      <div style="margin-bottom:1rem;"><strong>内容：</strong><div style="background:var(--paper);padding:1rem;border-radius:8px;margin-top:0.5rem;white-space:pre-wrap;max-height:300px;overflow-y:auto;">${escapeHtml(item.content || '无')}</div></div>
      ${item.coverImage ? `<div style="margin-bottom:1rem;"><strong>封面图：</strong><br><img src="${item.coverImage}" style="max-width:100%;max-height:200px;object-fit:contain;margin-top:0.5rem;border-radius:8px;"></div>` : ''}
    `;
  }

  if (!item) return;

  const overlay = document.createElement('div');
  overlay.id = 'approvalDetailOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem;';
  overlay.innerHTML = `<div style="background:var(--card-bg);border-radius:var(--radius);padding:1.5rem;max-width:500px;width:100%;max-height:80vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
      <h3 style="margin:0;">查看详情</h3>
      <button onclick="document.getElementById('approvalDetailOverlay').remove()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--haze);">&times;</button>
    </div>
    ${html}
    <button class="btn btn-primary" style="width:100%;margin-top:1rem;" onclick="document.getElementById('approvalDetailOverlay').remove()">关闭</button>
  </div>`;
  document.body.appendChild(overlay);
}

async function approveUpdate(id) {
  const result = await adminAPI('POST', `/api/admin/updates/${id}/approve`);
  if (result && result.success) { showToast('已批准', 'success'); loadUpdates(); }
}

async function rejectUpdate(id) {
  const reason = prompt('拒绝原因（可选）');
  const result = await adminAPI('POST', `/api/admin/updates/${id}/reject`, { reason });
  if (result && result.success) { showToast('已拒绝', 'success'); loadUpdates(); }
}

// Batch approve/reject updates
async function batchApproveUpdates() {
  const pendingUpdates = adminUpdatesData.filter(u => u.approvalStatus === 'pending');
  if (pendingUpdates.length === 0) { alert('没有待审核的动态'); return; }
  if (!confirm(`确定批准全部 ${pendingUpdates.length} 个待审核动态？`)) return;

  let success = 0;
  for (const u of pendingUpdates) {
    const result = await adminAPI('POST', `/api/admin/updates/${u.id}/approve`);
    if (result && result.success) success++;
  }
  showToast(`已批准 ${success} 个动态`, 'success');
  loadUpdates();
}

async function batchRejectUpdates() {
  const pendingUpdates = adminUpdatesData.filter(u => u.approvalStatus === 'pending');
  if (pendingUpdates.length === 0) { alert('没有待审核的动态'); return; }
  const reason = prompt('拒绝原因（可选）');
  if (reason === null) return;
  if (!confirm(`确定拒绝全部 ${pendingUpdates.length} 个待审核动态？`)) return;

  let success = 0;
  for (const u of pendingUpdates) {
    const result = await adminAPI('POST', `/api/admin/updates/${u.id}/reject`, { reason });
    if (result && result.success) success++;
  }
  showToast(`已拒绝 ${success} 个动态`, 'success');
  loadUpdates();
}

function openUpdateModal(update = null) {
  const isEdit = !!update;
  document.getElementById('modalTitle').textContent = isEdit ? '编辑动态' : '新增动态';

  // Load events, projects and circles for association
  Promise.all([
    adminAPI('GET', '/api/admin/events'),
    adminAPI('GET', '/api/admin/projects'),
    adminAPI('GET', '/api/admin/circles')
  ]).then(([allEvents, allProjects, allCircles]) => {
    const eventsMap = {};
    (allEvents || []).forEach(e => eventsMap[e.id] = e.title);
    const projectsMap = {};
    (allProjects || []).forEach(p => projectsMap[p.id] = p.title);

    const relatedEventIds = update?.relatedEvents || [];
    const relatedProjectIds = update?.relatedProjects || [];
    const relatedCircleIds = update?.relatedCircles || [];

    document.getElementById('modalBody').innerHTML = `
      <div class="form-group">
        <label>动态标题 <span style="color:var(--accent)">*</span></label>
        <input class="form-input" id="updTitle" value="${update?.title || ''}" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>发布日期 <span style="color:var(--accent)">*</span></label>
          <input type="date" class="form-input" id="updPublishDate" value="${update?.publishDate || new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group" style="display:flex;align-items:flex-end;gap:0.6rem;padding-bottom:0.3rem;">
          <input type="checkbox" id="updPinned" style="width:16px;height:16px;accent-color:var(--accent);" ${update?.pinned ? 'checked' : ''}>
          <label for="updPinned" style="font-size:0.9rem;cursor:pointer;">置顶</label>
        </div>
      </div>
      <div class="form-group">
        <label>动态内容 <span style="color:var(--accent)">*</span></label>
        <textarea class="form-input" id="updContent" style="min-height:150px;">${update?.content || ''}</textarea>
      </div>
      <div class="form-group">
        <label>首图</label>
        <div id="updCoverPreview" style="margin-bottom:0.5rem;">
          ${update?.coverImage ? `<div style="position:relative;display:inline-block;"><img src="${update.coverImage}" style="width:120px;height:80px;object-fit:cover;border-radius:6px;"><button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button></div>` : ''}
        </div>
        <input type="file" id="updCoverInput" accept="image/*" style="font-size:0.85rem;">
        <div style="display:flex;gap:0.4rem;margin-top:0.4rem;">
          <button type="button" class="btn-sm btn-edit" onclick="uploadUpdateCover()">上传首图</button>
          <button type="button" class="btn-sm" style="background:var(--accent-alt);color:white;" onclick="pickImageFromLibrary('update-cover')">从图片库选择</button>
        </div>
      </div>
      <div class="form-group">
        <label>更多图片</label>
        <div id="updImagesPreview" style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.5rem;">
          ${(update?.images || []).map((img, i) => `
            <div style="position:relative;">
              <img src="${img}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;">
              <button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button>
            </div>
          `).join('')}
        </div>
        <input type="file" id="updImagesInput" accept="image/*" multiple style="font-size:0.85rem;">
        <div style="display:flex;gap:0.4rem;margin-top:0.4rem;">
          <button type="button" class="btn-sm btn-edit" onclick="uploadUpdateImages()">上传图片</button>
          <button type="button" class="btn-sm" style="background:var(--accent-alt);color:white;" onclick="pickImageFromLibrary('update-images')">从图片库选择</button>
        </div>
      </div>
      <div class="form-group">
        <label>关联作者</label>
        <input type="text" class="form-input" id="updCircleSearch" placeholder="搜索作者名称..." style="margin-bottom:0.5rem;padding:0.4rem 0.6rem;font-size:0.85rem;" oninput="filterUpdateCirclesList(this.value)">
        <div id="updCirclesList" style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0.5rem;">
          ${(allCircles || []).map(c => `
            <label class="upd-circle-item" data-name="${(c.name || '').toLowerCase()}" style="display:flex;align-items:center;gap:0.5rem;padding:0.3rem;cursor:pointer;font-size:0.85rem;">
              <input type="checkbox" class="upd-circle-cb" value="${c.id}" ${relatedCircleIds.includes(c.id) ? 'checked' : ''} style="width:14px;height:14px;accent-color:var(--accent);">
              ${escapeHtml(c.name)}
            </label>
          `).join('') || '<p style="color:var(--haze);font-size:0.85rem;">暂无作者</p>'}
        </div>
      </div>
      <div class="form-group">
        <label>关联活动</label>
        <div style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0.5rem;">
          ${(allEvents || []).map(e => `
            <label style="display:flex;align-items:center;gap:0.5rem;padding:0.3rem;cursor:pointer;font-size:0.85rem;">
              <input type="checkbox" class="upd-event-cb" value="${e.id}" ${relatedEventIds.includes(e.id) ? 'checked' : ''} style="width:14px;height:14px;accent-color:var(--accent);">
              ${escapeHtml(e.title)}
            </label>
          `).join('') || '<p style="color:var(--haze);font-size:0.85rem;">暂无活动</p>'}
        </div>
      </div>
      <div class="form-group">
        <label>关联企划</label>
        <div style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0.5rem;">
          ${(allProjects || []).map(p => `
            <label style="display:flex;align-items:center;gap:0.5rem;padding:0.3rem;cursor:pointer;font-size:0.85rem;">
              <input type="checkbox" class="upd-project-cb" value="${p.id}" ${relatedProjectIds.includes(p.id) ? 'checked' : ''} style="width:14px;height:14px;accent-color:var(--accent);">
              ${escapeHtml(p.title)}
            </label>
          `).join('') || '<p style="color:var(--haze);font-size:0.85rem;">暂无企划</p>'}
        </div>
      </div>
    `;

    document.getElementById('modalSave').onclick = async () => {
      const data = {
        title: document.getElementById('updTitle').value,
        publishDate: document.getElementById('updPublishDate').value,
        content: document.getElementById('updContent').value,
        pinned: document.getElementById('updPinned').checked,
        coverImage: document.querySelector('#updCoverPreview img')?.src || '',
        images: [...document.querySelectorAll('#updImagesPreview img')].map(img => img.src),
        relatedCircles: [...document.querySelectorAll('.upd-circle-cb:checked')].map(cb => cb.value),
        relatedEvents: [...document.querySelectorAll('.upd-event-cb:checked')].map(cb => cb.value),
        relatedProjects: [...document.querySelectorAll('.upd-project-cb:checked')].map(cb => cb.value)
      };

      if (!data.title) { alert('请填写标题'); return; }
      if (!data.content) { alert('请填写内容'); return; }

      if (isEdit) {
        await adminAPI('PUT', `/api/admin/updates/${update.id}`, data);
      } else {
        await adminAPI('POST', '/api/admin/updates', data);
      }
      closeModal();
      loadUpdates();
    };

    openModal();
  });
}

async function editUpdate(id) {
  const updates = await adminAPI('GET', '/api/admin/updates');
  const update = updates.find(u => u.id === id);
  if (update) openUpdateModal(update);
}

async function deleteUpdate(id) {
  if (!confirm('确定要删除这条动态吗？')) return;
  await adminAPI('DELETE', `/api/admin/updates/${id}`);
  loadUpdates();
}

function filterUpdateCirclesList(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.upd-circle-item').forEach(item => {
    const name = item.dataset.name || '';
    item.style.display = name.includes(q) ? 'flex' : 'none';
  });
}

async function uploadUpdateCover() {
  const input = document.getElementById('updCoverInput');
  const preview = document.getElementById('updCoverPreview');
  if (!input.files.length) { alert('请选择首图'); return; }
  const res = await uploadImage(input.files[0]);
  if (res.url) {
    preview.innerHTML = `<div style="position:relative;display:inline-block;"><img src="${res.url}" style="width:120px;height:80px;object-fit:cover;border-radius:6px;"><button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button></div>`;
  }
  input.value = '';
}

async function uploadUpdateImages() {
  const input = document.getElementById('updImagesInput');
  const preview = document.getElementById('updImagesPreview');
  if (!input.files.length) { alert('请选择图片'); return; }
  for (const file of input.files) {
    const res = await uploadImage(file);
    if (res.url) {
      const div = document.createElement('div');
      div.style.position = 'relative';
      div.innerHTML = `<img src="${res.url}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;"><button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:white;border:none;font-size:10px;cursor:pointer;line-height:1;">&times;</button>`;
      preview.appendChild(div);
    }
  }
  input.value = '';
}

// ===== Change Password =====
function openChangePasswordModal() {
  document.getElementById('modalTitle').textContent = '修改密码';
  document.getElementById('modalBody').innerHTML = `
    <div class="form-group">
      <label>当前密码 <span style="color:var(--accent)">*</span></label>
      <input type="password" class="form-input" id="pwOld" required>
    </div>
    <div class="form-group">
      <label>新密码 <span style="color:var(--accent)">*</span></label>
      <input type="password" class="form-input" id="pwNew" required placeholder="至少6个字符">
    </div>
    <div class="form-group">
      <label>确认新密码 <span style="color:var(--accent)">*</span></label>
      <input type="password" class="form-input" id="pwConfirm" required>
    </div>
  `;
  document.getElementById('modalSave').onclick = async () => {
    const oldPassword = document.getElementById('pwOld').value;
    const newPassword = document.getElementById('pwNew').value;
    const confirm = document.getElementById('pwConfirm').value;
    if (!oldPassword || !newPassword) { alert('请填写所有字段'); return; }
    if (newPassword.length < 6) { alert('新密码至少6个字符'); return; }
    if (newPassword !== confirm) { alert('两次输入的新密码不一致'); return; }
    const result = await adminAPI('POST', '/api/admin/change-password', { oldPassword, newPassword });
    if (result && result.success) {
      showToast('密码修改成功', 'success');
      closeModal();
    } else {
      alert('修改失败: ' + (result.error || '未知错误'));
    }
  };
  openModal();
}

// Updates search filter
function filterUpdates() {
  const query = document.getElementById('updatesSearch')?.value.toLowerCase().trim() || '';
  const rows = document.querySelectorAll('#updatesTableBody tr');
  rows.forEach(row => {
    const title = row.querySelector('td:first-child')?.textContent.toLowerCase() || '';
    const content = row.querySelector('td:nth-child(7)')?.textContent.toLowerCase() || '';
    row.style.display = (!query || title.includes(query) || content.includes(query)) ? '' : 'none';
  });
}

// ===== Edit History =====
async function loadEditLog(page = 1) {
  try {
    const result = await adminAPI('GET', `/api/admin/edit-log?page=${page}&limit=50`);
    const container = document.getElementById('editLogContainer');

    // Handle paginated response
    let log, total, totalPages;
    if (result && result.items) {
      log = result.items;
      total = result.total;
      totalPages = result.totalPages;
      pagination.editlog = { page: result.page, total, totalPages };
    } else {
      // Fallback for old format
      log = result || [];
      total = log.length;
      totalPages = 1;
      pagination.editlog = { page: 1, total, totalPages };
    }

    if (!log || log.length === 0) {
      container.innerHTML = '<p style="color:var(--haze);text-align:center;padding:2rem;">暂无编辑记录</p>';
      document.getElementById('editLogPagination').innerHTML = '';
      return;
    }
    container.innerHTML = log.map(entry => {
      const time = new Date(entry.time).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      let actionColor = 'var(--ink)';
      if (entry.action.includes('上传')) actionColor = '#2ecc71';
      else if (entry.action.includes('删除')) actionColor = 'var(--accent)';
      else if (entry.action.includes('创建')) actionColor = '#3498db';
      else if (entry.action.includes('编辑')) actionColor = '#f39c12';
      const imgThumb = entry.imageUrl ? `<img src="${entry.imageUrl}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;border:1px solid var(--border);flex-shrink:0;">` : '';
      return `<div style="display:flex;gap:0.8rem;padding:0.7rem 0;border-bottom:1px solid var(--border);font-size:0.85rem;align-items:center;">
        <span style="color:var(--haze);white-space:nowrap;min-width:130px;">${time}</span>
        <span style="color:var(--accent-alt);font-weight:600;min-width:70px;">${escapeHtml(entry.user)}</span>
        <span style="color:${actionColor};font-weight:500;min-width:70px;">${escapeHtml(entry.action)}</span>
        ${imgThumb}
        <span style="flex:1;color:var(--ink);min-width:0;">${escapeHtml(entry.target)}${entry.details ? ' <span style="color:var(--haze);">(' + escapeHtml(entry.details) + ')</span>' : ''}</span>
      </div>`;
    }).join('');

    // Render pagination
    const paginationEl = document.getElementById('editLogPagination');
    if (paginationEl) paginationEl.innerHTML = renderPagination('editlog', 'loadEditLog');

    // Apply existing search filter if any
    filterEditLog();
  } catch (e) {
    document.getElementById('editLogContainer').innerHTML = '<p style="color:var(--accent);text-align:center;padding:2rem;">加载失败</p>';
  }
}

function filterEditLog() {
  const query = document.getElementById('editLogSearch')?.value.toLowerCase().trim() || '';
  const actionFilter = document.getElementById('editLogActionFilter')?.value || '';
  const dateFrom = document.getElementById('editLogDateFrom')?.value || '';
  const dateTo = document.getElementById('editLogDateTo')?.value || '';
  const rows = document.querySelectorAll('#editLogContainer > div');
  rows.forEach(row => {
    const user = row.querySelector('span:nth-child(2)')?.textContent.toLowerCase() || '';
    const action = row.querySelector('span:nth-child(3)')?.textContent || '';
    const timeStr = row.querySelector('span:nth-child(1)')?.textContent || '';
    const matchUser = !query || user.includes(query);
    const matchAction = !actionFilter || action.includes(actionFilter);
    let matchDate = true;
    if (dateFrom || dateTo) {
      // Parse the time string (format: YYYY/MM/DD HH:MM:SS)
      const dateParts = timeStr.split(' ')[0]?.replace(/\//g, '-') || '';
      if (dateFrom && dateParts < dateFrom) matchDate = false;
      if (dateTo && dateParts > dateTo) matchDate = false;
    }
    row.style.display = (matchUser && matchAction && matchDate) ? '' : 'none';
  });
}

// Export edit log
function exportEditLog() {
  const rows = document.querySelectorAll('#editLogContainer > div');
  const visibleRows = [...rows].filter(r => r.style.display !== 'none');
  if (visibleRows.length === 0) { alert('没有可导出的记录'); return; }

  const headers = ['时间', '编辑人', '操作', '目标', '详情'];
  const data = visibleRows.map(row => {
    const spans = row.querySelectorAll('span');
    return [
      spans[0]?.textContent || '',
      spans[1]?.textContent || '',
      spans[2]?.textContent || '',
      spans[3]?.textContent || '',
      spans[4]?.textContent || ''
    ];
  });

  let csv = '\uFEFF' + headers.join(',') + '\n';
  data.forEach(row => {
    csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `编辑历史_${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  showToast('导出成功', 'success');
}

// ===== Author Statistics =====
let authorStatsData = [];
let authorStatsSortBy = 'totalLikes';
let authorStatsSortDir = 'desc';

async function loadAuthorStats() {
  try {
    const [circles, works] = await Promise.all([
      adminAPI('GET', '/api/admin/circles'),
      adminAPI('GET', '/api/admin/works')
    ]);

    if (!circles || circles.length === 0) {
      document.getElementById('authorStatsBody').innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--haze);padding:2rem;">暂无作者</td></tr>';
      return;
    }

    authorStatsData = circles.map(c => {
      const circleWorks = (works || []).filter(w => (w.circles || []).includes(c.id));
      const totalLikes = circleWorks.reduce((sum, w) => sum + (w.likes || 0), 0);
      const totalWants = circleWorks.reduce((sum, w) => sum + (w.wants || 0), 0);
      const workCount = circleWorks.length;
      return {
        name: c.name,
        category: CIRCLE_CATEGORIES[c.category] || c.category || '-',
        workCount,
        totalLikes,
        totalWants,
        avgLikes: workCount > 0 ? Math.round(totalLikes / workCount) : 0,
        avgWants: workCount > 0 ? Math.round(totalWants / workCount) : 0
      };
    });

    renderAuthorStatsTable();
  } catch (e) {
    document.getElementById('authorStatsBody').innerHTML =
      '<tr><td colspan="7" style="text-align:center;color:var(--accent);padding:2rem;">加载失败</td></tr>';
  }
}

function sortAuthorStats(field) {
  if (authorStatsSortBy === field) {
    authorStatsSortDir = authorStatsSortDir === 'desc' ? 'asc' : 'desc';
  } else {
    authorStatsSortBy = field;
    authorStatsSortDir = 'desc';
  }
  renderAuthorStatsTable();
}

function renderAuthorStatsTable() {
  const sorted = [...authorStatsData].sort((a, b) => {
    const aVal = a[authorStatsSortBy] || 0;
    const bVal = b[authorStatsSortBy] || 0;
    return authorStatsSortDir === 'desc' ? bVal - aVal : aVal - bVal;
  });

  const getArrow = (field) => {
    if (authorStatsSortBy !== field) return '↕';
    return authorStatsSortDir === 'desc' ? '↓' : '↑';
  };

  const thead = document.querySelector('#authorStatsTable thead tr');
  if (thead) {
    thead.innerHTML = `
      <th>作者名称</th>
      <th>分类</th>
      <th style="cursor:pointer;" onclick="sortAuthorStats('workCount')">作品数 ${getArrow('workCount')}</th>
      <th style="cursor:pointer;" onclick="sortAuthorStats('totalLikes')">总喜爱数 ${getArrow('totalLikes')}</th>
      <th style="cursor:pointer;" onclick="sortAuthorStats('totalWants')">总想要数 ${getArrow('totalWants')}</th>
      <th style="cursor:pointer;" onclick="sortAuthorStats('avgLikes')">平均喜爱 ${getArrow('avgLikes')}</th>
      <th style="cursor:pointer;" onclick="sortAuthorStats('avgWants')">平均想要 ${getArrow('avgWants')}</th>
    `;
  }

  const tbody = document.getElementById('authorStatsBody');
  tbody.innerHTML = sorted.map(s => `
    <tr>
      <td style="font-weight:600;">${escapeHtml(s.name)}</td>
      <td>${s.category}</td>
      <td>${s.workCount}</td>
      <td>${s.totalLikes}</td>
      <td>${s.totalWants}</td>
      <td>${s.avgLikes}</td>
      <td>${s.avgWants}</td>
    </tr>
  `).join('');
}

function exportAuthorStats() {
  const rows = document.querySelectorAll('#authorStatsBody tr');
  if (rows.length === 0) { alert('没有数据可导出'); return; }

  const headers = ['作者名称', '分类', '作品数', '总喜爱数', '总想要数', '平均喜爱', '平均想要'];
  const data = [...rows].map(row => {
    const cells = row.querySelectorAll('td');
    return [...cells].map(cell => cell.textContent);
  });

  let csv = '\uFEFF' + headers.join(',') + '\n';
  data.forEach(row => {
    csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `作者统计_${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  showToast('导出成功', 'success');
}

// ===== Approval Page =====
async function loadApprovalPage() {
  try {
    const [circles, events, projects, updates] = await Promise.all([
      adminAPI('GET', '/api/admin/circles'),
      adminAPI('GET', '/api/admin/events'),
      adminAPI('GET', '/api/admin/projects'),
      adminAPI('GET', '/api/admin/updates')
    ]);

    // Load author announcement sections
    loadAuthorAnnouncementAuthors();
    loadAuthorAnnouncements();

    // Pending authors
    const pendingAuthors = (circles || []).filter(c => c.authorStatus === 'pending');
    const authorsDiv = document.getElementById('approvalAuthors');
    if (pendingAuthors.length === 0) {
      authorsDiv.innerHTML = '<p style="color:var(--haze);">无待审核作者</p>';
    } else {
      authorsDiv.innerHTML = pendingAuthors.map(c => `
        <div style="display:flex;align-items:center;gap:1rem;padding:0.6rem 0;border-bottom:1px solid var(--border);">
          <span style="font-weight:600;flex:1;">${escapeHtml(c.name)}</span>
          <span style="font-size:0.8rem;color:var(--haze);">${c.username || ''}</span>
          <button class="btn-sm" style="background:var(--accent-alt);color:white;" onclick="viewApprovalDetail('author','${c.id}')">查看</button>
          <button class="btn-sm" style="background:#2ecc71;color:white;" onclick="approveAuthor('${c.id}')">批准</button>
          <button class="btn-sm btn-delete" onclick="rejectAuthor('${c.id}')">拒绝</button>
        </div>
      `).join('');
    }

    // Pending events
    const pendingEvents = (events || []).filter(e => e.approvalStatus === 'pending');
    const eventsDiv = document.getElementById('approvalEvents');
    if (pendingEvents.length === 0) {
      eventsDiv.innerHTML = '<p style="color:var(--haze);">无待审核活动</p>';
    } else {
      eventsDiv.innerHTML = pendingEvents.map(e => {
        const author = circles?.find(c => c.id === e.submittedBy);
        return `
        <div style="display:flex;align-items:center;gap:1rem;padding:0.6rem 0;border-bottom:1px solid var(--border);">
          <span style="font-weight:600;flex:1;">${escapeHtml(e.title)}</span>
          <span style="font-size:0.8rem;color:var(--haze);">提交者: ${author ? escapeHtml(author.name) : '未知'}</span>
          <span style="font-size:0.8rem;color:var(--haze);">${e.date || ''}</span>
          <button class="btn-sm" style="background:var(--accent-alt);color:white;" onclick="viewApprovalDetail('event','${e.id}')">查看</button>
          <button class="btn-sm" style="background:#2ecc71;color:white;" onclick="approveEvent('${e.id}')">批准</button>
          <button class="btn-sm btn-delete" onclick="rejectEvent('${e.id}')">拒绝</button>
        </div>`;
      }).join('');
    }

    // Pending projects
    const pendingProjects = (projects || []).filter(p => p.approvalStatus === 'pending');
    const projectsDiv = document.getElementById('approvalProjects');
    if (pendingProjects.length === 0) {
      projectsDiv.innerHTML = '<p style="color:var(--haze);">无待审核企划</p>';
    } else {
      projectsDiv.innerHTML = pendingProjects.map(p => {
        const author = circles?.find(c => c.id === p.submittedBy);
        return `
        <div style="display:flex;align-items:center;gap:1rem;padding:0.6rem 0;border-bottom:1px solid var(--border);">
          <span style="font-weight:600;flex:1;">${escapeHtml(p.title)}</span>
          <span style="font-size:0.8rem;color:var(--haze);">提交者: ${author ? escapeHtml(author.name) : '未知'}</span>
          <button class="btn-sm" style="background:var(--accent-alt);color:white;" onclick="viewApprovalDetail('project','${p.id}')">查看</button>
          <button class="btn-sm" style="background:#2ecc71;color:white;" onclick="approveProject('${p.id}')">批准</button>
          <button class="btn-sm btn-delete" onclick="rejectProject('${p.id}')">拒绝</button>
        </div>`;
      }).join('');
    }

    // Pending updates
    const pendingUpdates = (updates || []).filter(u => u.approvalStatus === 'pending');
    const updatesDiv = document.getElementById('approvalUpdates');
    if (pendingUpdates.length === 0) {
      updatesDiv.innerHTML = '<p style="color:var(--haze);">无待审核动态</p>';
    } else {
      updatesDiv.innerHTML = pendingUpdates.map(u => {
        const author = circles?.find(c => c.id === u.submittedBy);
        return `
        <div style="display:flex;align-items:center;gap:1rem;padding:0.6rem 0;border-bottom:1px solid var(--border);">
          <span style="font-weight:600;flex:1;">${escapeHtml(u.title)}</span>
          <span style="font-size:0.8rem;color:var(--haze);">提交者: ${author ? escapeHtml(author.name) : '未知'}</span>
          <span style="font-size:0.8rem;color:var(--haze);">${u.publishDate || ''}</span>
          <button class="btn-sm" style="background:var(--accent-alt);color:white;" onclick="viewApprovalDetail('update','${u.id}')">查看</button>
          <button class="btn-sm" style="background:#2ecc71;color:white;" onclick="approveUpdate('${u.id}')">批准</button>
          <button class="btn-sm btn-delete" onclick="rejectUpdate('${u.id}')">拒绝</button>
        </div>`;
      }).join('');
    }

  } catch (e) {
    console.error('Load approval page failed:', e);
  }
}

// ===== Author Announcements =====
let aaAllCircles = [];

async function loadAuthorAnnouncementAuthors() {
  try {
    const circles = await adminAPI('GET', '/api/admin/circles');
    aaAllCircles = (circles || []).filter(c => c.authorStatus === 'approved');
    const listDiv = document.getElementById('aaAuthorList');
    if (aaAllCircles.length === 0) {
      listDiv.innerHTML = '<span style="color:var(--haze);">暂无已批准的作者</span>';
      return;
    }
    listDiv.innerHTML = aaAllCircles.map(c => `
      <label style="font-size:0.85rem;cursor:pointer;display:flex;align-items:center;gap:0.3rem;padding:0.3rem 0.6rem;border:1px solid var(--border);border-radius:6px;">
        <input type="checkbox" class="aa-author-cb" value="${c.id}"> ${escapeHtml(c.name)}
      </label>
    `).join('');
  } catch (e) {
    document.getElementById('aaAuthorList').innerHTML = '<span style="color:var(--accent);">加载失败</span>';
  }
}

function toggleAaForm() {
  const section = document.getElementById('aaFormSection');
  section.style.display = section.style.display === 'none' ? 'block' : 'none';
}

function toggleAaAuthors() {
  const checked = document.getElementById('aaSelectAll').checked;
  document.querySelectorAll('.aa-author-cb').forEach(cb => cb.checked = checked);
}

async function sendAuthorAnnouncement() {
  const title = document.getElementById('aaTitle').value.trim();
  const content = document.getElementById('aaContent').value.trim();
  if (!title || !content) return showToast('请填写标题和内容', 'error');

  const selectedIds = [...document.querySelectorAll('.aa-author-cb:checked')].map(cb => cb.value);
  const pinned = document.getElementById('aaPinned').checked;
  const popup = document.getElementById('aaPopup').checked;

  try {
    const result = await adminAPI('POST', '/api/admin/author-announcements', {
      title, content, circleIds: selectedIds, pinned, popup
    });
    if (result.success) {
      showToast(`公告已发送给 ${result.sentTo} 位作者`, 'success');
      document.getElementById('aaTitle').value = '';
      document.getElementById('aaContent').value = '';
      document.getElementById('aaPinned').checked = false;
      document.getElementById('aaPopup').checked = false;
      document.getElementById('aaSelectAll').checked = false;
      document.querySelectorAll('.aa-author-cb').forEach(cb => cb.checked = false);
      loadAuthorAnnouncements();
    }
  } catch (e) {
    showToast('发送失败: ' + e.message, 'error');
  }
}

async function loadAuthorAnnouncements() {
  try {
    const announcements = await adminAPI('GET', '/api/admin/author-announcements');
    const listDiv = document.getElementById('aaHistoryList');
    if (!announcements || announcements.length === 0) {
      listDiv.innerHTML = '<p style="color:var(--haze);">暂无已发送的公告</p>';
      return;
    }

    listDiv.innerHTML = announcements.map(a => {
      const date = new Date(a.sentAt).toLocaleString('zh-CN');
      return `
        <div style="padding:0.8rem 0;border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="flex:1;">
              <span style="font-weight:600;cursor:pointer;color:var(--accent-alt);" onclick="viewAuthorAnnouncement('${a.id}')">${escapeHtml(a.title)}</span>
              ${a.pinned ? '<span style="font-size:0.75rem;background:var(--accent);color:white;padding:0.1rem 0.4rem;border-radius:4px;margin-left:0.5rem;">置顶</span>' : ''}
              ${a.popup ? '<span style="font-size:0.75rem;background:var(--accent-alt);color:white;padding:0.1rem 0.4rem;border-radius:4px;margin-left:0.3rem;">弹窗</span>' : ''}
              <span style="font-size:0.8rem;color:var(--haze);margin-left:0.5rem;">发送给 ${a.sentTo.length} 位作者</span>
            </div>
            <span style="font-size:0.8rem;color:var(--haze);">${date}</span>
            <button class="btn-sm" style="margin-left:0.5rem;" onclick="viewAaReadStatus('${a.id}')">查看已读</button>
            <button class="btn-sm btn-delete" style="margin-left:0.3rem;" onclick="deleteAuthorAnnouncement('${a.id}')">删除</button>
          </div>
          <div style="font-size:0.85rem;color:var(--haze);margin-top:0.3rem;white-space:pre-wrap;">${escapeHtml(a.content).substring(0, 100)}${a.content.length > 100 ? '...' : ''}</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    document.getElementById('aaHistoryList').innerHTML = '<p style="color:var(--accent);">加载失败</p>';
  }
}

async function viewAaReadStatus(id) {
  try {
    const status = await adminAPI('GET', `/api/admin/author-announcements/${id}/read-status`);
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
      <h3 style="margin-bottom:1rem;">已读状态</h3>
      <p style="margin-bottom:1rem;">已读 ${status.read.length}/${status.total} 人</p>
      <div style="margin-bottom:1rem;">
        <h4 style="font-size:0.9rem;color:#2ecc71;margin-bottom:0.5rem;">已读</h4>
        ${status.read.length > 0 ? status.read.map(a => `<div style="padding:0.3rem 0;font-size:0.85rem;">${escapeHtml(a.name)}</div>`).join('') : '<p style="color:var(--haze);font-size:0.85rem;">暂无</p>'}
      </div>
      <div>
        <h4 style="font-size:0.9rem;color:var(--accent);margin-bottom:0.5rem;">未读</h4>
        ${status.unread.length > 0 ? status.unread.map(a => `<div style="padding:0.3rem 0;font-size:0.85rem;">${escapeHtml(a.name)}</div>`).join('') : '<p style="color:var(--haze);font-size:0.85rem;">全部已读</p>'}
      </div>
    `;
    document.getElementById('modalSave').style.display = 'none';
    openModal();
    document.getElementById('modalSave').style.display = '';
  } catch (e) {
    showToast('加载失败', 'error');
  }
}

async function deleteAuthorAnnouncement(id) {
  if (!confirm('确定要删除这条公告吗？')) return;
  try {
    await adminAPI('DELETE', `/api/admin/author-announcements/${id}`);
    showToast('公告已删除', 'success');
    loadAuthorAnnouncements();
  } catch (e) {
    showToast('删除失败', 'error');
  }
}

async function viewAuthorAnnouncement(id) {
  try {
    const announcements = await adminAPI('GET', '/api/admin/author-announcements');
    const a = announcements.find(x => x.id === id);
    if (!a) return showToast('公告不存在', 'error');

    const readStatus = await adminAPI('GET', `/api/admin/author-announcements/${id}/read-status`);
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
      <h3 style="margin-bottom:1rem;">编辑公告</h3>
      <div style="display:flex;flex-direction:column;gap:0.8rem;">
        <div>
          <label style="font-size:0.85rem;color:var(--haze);">标题</label>
          <input type="text" class="form-input" id="editAaTitle" value="${escapeHtml(a.title)}" style="width:100%;">
        </div>
        <div>
          <label style="font-size:0.85rem;color:var(--haze);">内容</label>
          <textarea class="form-input" id="editAaContent" rows="6" style="width:100%;resize:vertical;">${escapeHtml(a.content)}</textarea>
        </div>
        <div style="display:flex;gap:1rem;align-items:center;">
          <label style="font-size:0.85rem;cursor:pointer;">
            <input type="checkbox" id="editAaPinned" ${a.pinned ? 'checked' : ''}> 置顶
          </label>
          <label style="font-size:0.85rem;cursor:pointer;">
            <input type="checkbox" id="editAaPopup" ${a.popup ? 'checked' : ''}> 首次弹窗
          </label>
        </div>
        <div style="font-size:0.8rem;color:var(--haze);">
          发送时间：${new Date(a.sentAt).toLocaleString('zh-CN')} ｜ 已读 ${readStatus.read.length}/${readStatus.total} 人
        </div>
      </div>
    `;
    const saveBtn = document.getElementById('modalSave');
    saveBtn.style.display = '';
    saveBtn.textContent = '保存';
    saveBtn.onclick = async () => {
      try {
        await adminAPI('PUT', `/api/admin/author-announcements/${id}`, {
          title: document.getElementById('editAaTitle').value.trim(),
          content: document.getElementById('editAaContent').value.trim(),
          pinned: document.getElementById('editAaPinned').checked,
          popup: document.getElementById('editAaPopup').checked
        });
        showToast('保存成功', 'success');
        closeModal();
        loadAuthorAnnouncements();
      } catch (e) {
        showToast('保存失败', 'error');
      }
    };
    openModal();
  } catch (e) {
    showToast('加载失败', 'error');
  }
}

// ===== Contacts =====
async function loadContacts(search = '') {
  try {
    const url = search ? `/api/admin/contacts?search=${encodeURIComponent(search)}` : '/api/admin/contacts';
    const contacts = await adminAPI('GET', url);
    const tbody = document.getElementById('contactsTableBody');
    if (!contacts || contacts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--haze);padding:2rem;">暂无联系消息</td></tr>';
      return;
    }
    tbody.innerHTML = contacts
      .map((c, i) => `
        <tr style="${!c.read ? 'background:rgba(52,152,219,0.05);' : ''}">
          <td style="text-align:center;">${c.read ? '<span style="color:var(--haze);">已读</span>' : '<span style="color:#3498db;font-weight:600;">未读</span>'}</td>
          <td>${escapeHtml(c.name || '')}</td>
          <td>${escapeHtml(c.email || '')}</td>
          <td>${escapeHtml(c.subject || '-')}</td>
          <td class="truncate" style="max-width:200px;" title="${escapeHtml(c.message || '')}">${escapeHtml(c.message || '')}</td>
          <td>${c.createdAt ? formatDateAdmin(c.createdAt) : '-'}</td>
          <td>
            <div class="table-actions">
              <button class="btn-sm btn-edit" onclick="viewContactMessage(${i})">查看</button>
              <button class="btn-sm btn-delete" onclick="deleteContact('${c.id}')">删除</button>
            </div>
          </td>
        </tr>
      `).join('');
    window._contactsData = contacts;
  } catch (e) {
    document.getElementById('contactsTableBody').innerHTML =
      '<tr><td colspan="7" style="text-align:center;color:var(--haze);padding:2rem;">加载失败</td></tr>';
  }
}

function filterContacts() {
  const search = document.getElementById('contactsSearch')?.value || '';
  loadContacts(search);
}

async function deleteContact(id) {
  if (!confirm('确定要删除这条消息吗？')) return;
  await adminAPI('DELETE', `/api/admin/contacts/${id}`);
  loadContacts();
}

async function viewContactMessage(index) {
  const c = (window._contactsData || [])[index];
  if (!c) return;

  // Mark as read
  if (!c.read) {
    await adminAPI('PUT', `/api/admin/contacts/${c.id}/read`);
    c.read = true;
  }

  document.getElementById('modalTitle').textContent = '查看消息';
  document.getElementById('modalBody').innerHTML = `
    <div style="margin-bottom:1rem;">
      <label style="font-size:0.8rem;color:var(--haze);">昵称</label>
      <div style="font-size:0.95rem;margin-top:0.2rem;">${escapeHtml(c.name || '匿名')}</div>
    </div>
    <div style="margin-bottom:1rem;">
      <label style="font-size:0.8rem;color:var(--haze);">联系方式</label>
      <div style="font-size:0.95rem;margin-top:0.2rem;">${escapeHtml(c.email || '未填写')}</div>
    </div>
    <div style="margin-bottom:1rem;">
      <label style="font-size:0.8rem;color:var(--haze);">主题</label>
      <div style="font-size:0.95rem;margin-top:0.2rem;">${escapeHtml(c.subject || '无')}</div>
    </div>
    <div style="margin-bottom:1rem;">
      <label style="font-size:0.8rem;color:var(--haze);">时间</label>
      <div style="font-size:0.95rem;margin-top:0.2rem;">${c.createdAt ? formatDateAdmin(c.createdAt) : '-'}</div>
    </div>
    <div>
      <label style="font-size:0.8rem;color:var(--haze);">消息内容</label>
      <div style="font-size:0.95rem;line-height:1.8;margin-top:0.5rem;padding:1rem;background:var(--bg);border-radius:var(--radius);white-space:pre-wrap;word-break:break-all;">${escapeHtml(c.message || '')}</div>
    </div>
  `;
  document.getElementById('modalSave').style.display = 'none';
  openModal();
  document.getElementById('modalSave').style.display = '';
}

// ===== Modal =====
function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('modalSave').textContent = '保存';
  document.getElementById('modalSave').style.display = '';
}

// Close modal on overlay click
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});
