/**
 * 作者手册 — UI 对照庭域手册
 */
const FALLBACK_AUTHORS = [{
  id: 'c1785520414879',
  name: '八日晨光',
  category: '同人平台',
  logo: '/uploads/barichenguang.png',
  worksCount: 0,
  eventCount: 0,
  projectCount: 0,
  intro: '以无偿帮助创作者与企划为主的七都同人平台。',
  contactText: '',
  contactUrl: '',
  workCover: '',
  eventCover: '',
  projectCover: ''
}];

let AUTHORS = FALLBACK_AUTHORS.slice();
let authorIndex = 0;
let ALL_WORKS = [];
let ALL_EVENTS = [];
let ALL_PROJECTS = [];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function normImg(u) {
  if (!u) return '';
  const s = String(u).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.charAt(0) === '/') return s;
  return '/' + s.replace(/^\.?\/*/, '');
}

function normUrl(u) {
  if (!u) return '';
  const s = String(u).trim();
  if (!s || s === '#') return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^mailto:/i.test(s)) return s;
  return 'https://' + s.replace(/^\/+/, '');
}

function categoryLabel(id) {
  const map = { geren: '个人', shetuan: '社团', guanfang: '官方' };
  return map[id] || id || '同人作者';
}

function contactFromCircle(c) {
  if (!c) return { text: '', url: '' };
  const sl = c.socialLinks || {};
  const website = normUrl(sl.website);
  const websiteLabel = String(sl.websiteLabel || '').trim();
  const qqGroup = String(sl.qqGroup || '').trim();
  const qq = String(sl.qq || '').trim();
  const contactLabel = String(sl.contactLabel || '').trim();
  let text = '';
  if (contactLabel && (qq || qqGroup || website)) text = contactLabel;
  else if (websiteLabel && website) text = websiteLabel;
  else if (qqGroup) text = 'QQ群 ' + qqGroup;
  else if (qq) text = 'QQ ' + qq;
  else if (website) text = websiteLabel || website;
  return { text: text || '', url: website || '' };
}

function worksOf(id) {
  return (ALL_WORKS || []).filter(w =>
    w && (w.circles || []).indexOf(id) !== -1 &&
    Array.isArray(w.images) && w.images[0] &&
    (!w.approvalStatus || w.approvalStatus === 'approved')
  );
}

function latestWorkCover(id) {
  const list = worksOf(id).slice().sort((a, b) =>
    (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0)
  );
  return { cover: list[0] ? normImg(list[0].images[0]) : '', count: list.length };
}

function latestEventCover(id) {
  const list = (ALL_EVENTS || []).filter(e =>
    e && (!e.approvalStatus || e.approvalStatus === 'approved') &&
    (e.relatedCircles || e.circles || []).indexOf(id) !== -1 &&
    normImg(e.coverImage)
  ).sort((a, b) => (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0));
  return { cover: list[0] ? normImg(list[0].coverImage) : '', count: list.length };
}

function latestProjectCover(id) {
  const list = (ALL_PROJECTS || []).filter(p =>
    p && (!p.approvalStatus || p.approvalStatus === 'approved') &&
    (p.circles || []).indexOf(id) !== -1 &&
    normImg(p.coverImage)
  ).sort((a, b) =>
    (Date.parse(b.startDate || b.createdAt || '') || 0) -
    (Date.parse(a.startDate || a.createdAt || '') || 0)
  );
  return { cover: list[0] ? normImg(list[0].coverImage) : '', count: list.length };
}

/** 作品密度条：对照参考图「等级」下的能量条 */
function activityBar(worksCount) {
  const n = Number(worksCount) || 0;
  const pct = Math.max(8, Math.min(100, Math.round(Math.log10(n + 1) / Math.log10(80) * 100)));
  return `<div class="id-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>`;
}

function introHtml(text) {
  const full = String(text || '').trim();
  if (!full) return '<div class="v muted">暂无简介</div>';
  const paras = full.split(/\n+/).filter(Boolean);
  const isLong = paras.length > 2 || full.length > 80;
  if (!isLong) {
    return `<div class="v">${esc(full).replace(/\n/g, '<br>')}</div>`;
  }
  const preview = paras.slice(0, 2).join('\n');
  return `
    <div class="v intro-clamp" data-full="0">
      <div class="intro-text" data-preview="${esc(preview)}" data-fulltext="${esc(full)}">${esc(preview)}…</div>
      <button type="button" class="intro-toggle">展开</button>
    </div>`;
}

function contactHtml(text, url) {
  const t = String(text || '').trim();
  const u = normUrl(url);
  if (u) {
    return `<div class="v"><a class="contact-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t || u)} <span class="ext">↗</span></a></div>`;
  }
  if (t) return `<div class="v">${esc(t)}</div>`;
  return '<div class="v muted">—</div>';
}

function coverHtml(src, emptyText) {
  const u = normImg(src);
  if (!u) {
    return `<div class="tile-cover"><div class="empty-ph">${esc(emptyText || '暂无图片')}</div></div>`;
  }
  return `<div class="tile-cover"><img src="${esc(u)}" alt="" loading="lazy" onerror="this.style.display='none'"></div>`;
}

function renderHandbook() {
  if (!AUTHORS.length) AUTHORS = FALLBACK_AUTHORS;
  if (authorIndex >= AUTHORS.length) authorIndex = 0;
  if (authorIndex < 0) authorIndex = 0;
  const a = AUTHORS[authorIndex];
  const root = document.getElementById('hbRoot');
  if (!root || !a) return;

  const w = latestWorkCover(a.id);
  const ev = latestEventCover(a.id);
  const pr = latestProjectCover(a.id);
  const workCover = w.cover || normImg(a.workCover);
  const eventCover = ev.cover || normImg(a.eventCover);
  const projectCover = pr.cover || normImg(a.projectCover);
  const workCount = w.count || a.worksCount || 0;
  const eventCount = ev.count || a.eventCount || 0;
  const projectCount = pr.count || a.projectCount || 0;

  const logoSrc = normImg(a.logo);
  const logoHtml = logoSrc
    ? `<img src="${esc(logoSrc)}" alt="" onerror="this.style.display='none'">`
    : esc((a.name || '?').slice(0, 2));

  const picker = document.getElementById('authorPicker');
  if (picker) picker.textContent = a.name;
  const circleUrl = `/circle-detail.html?id=${encodeURIComponent(a.id)}`;

  root.innerHTML = `
    <div class="handbook">
      <div class="hb-ribbon" aria-hidden="true"></div>
      <div class="hb-title-static">
        <h1>作者手册</h1>
        <span>HANDBOOK</span>
      </div>
      <div class="hb-body">
        <div class="idcard-wrap">
          <div class="idcard-clip" aria-hidden="true"></div>
          <div class="idcard">
            <div class="idcard-inner">
              <div class="id-head">
                <div class="id-avatar">${logoHtml}</div>
                <div class="id-head-text">
                  <div class="id-name">${esc(a.name)}</div>
                  <div class="id-sub">${esc(a.category || '同人作者')}</div>
                </div>
              </div>

              <div class="id-rows">
                <div class="id-row">
                  <span class="k">作者简介</span>
                </div>
                <div class="id-goal">${introHtml(a.intro)}</div>
              </div>

              <div class="id-rows">
                <div class="id-row">
                  <span class="k">联络</span>
                  <span class="v-inline">${contactHtml(a.contactText || a.contact || '', a.contactUrl || '')}</span>
                </div>
              </div>

              <div class="id-rows id-nums">
                <div class="id-row">
                  <span class="k">作品</span>
                  <span class="v num">${workCount}</span>
                </div>
                <div class="id-row">
                  <span class="k">活动</span>
                  <span class="v num">${eventCount}</span>
                </div>
                <div class="id-row">
                  <span class="k">企划</span>
                  <span class="v num">${projectCount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="hb-tiles">
          <a class="tile tile-main" href="${circleUrl}#works" title="作品列表">
            ${coverHtml(workCover, '暂无作品展示图')}
            <div class="tile-label"><b>作品列表</b><span>WORKS</span></div>
          </a>
          <a class="tile" href="${circleUrl}#events" title="参与活动">
            ${coverHtml(eventCover, '暂无活动封面')}
            <div class="tile-label"><b>参与活动</b><span>EVENTS</span></div>
          </a>
          <a class="tile" href="${circleUrl}#projects" title="同人企划">
            ${coverHtml(projectCover, '暂无企划封面')}
            <div class="tile-label"><b>同人企划</b><span>PROJECTS</span></div>
          </a>
        </div>
      </div>
    </div>
  `;

  bindIntroToggle();
}

function bindIntroToggle() {
  document.querySelectorAll('.intro-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const wrap = btn.closest('.intro-clamp');
      if (!wrap) return;
      const textEl = wrap.querySelector('.intro-text');
      if (!textEl) return;
      const expanded = wrap.getAttribute('data-full') === '1';
      if (expanded) {
        textEl.innerHTML = esc(textEl.getAttribute('data-preview') || '') + '…';
        wrap.setAttribute('data-full', '0');
        btn.textContent = '展开';
        wrap.classList.add('intro-clamp');
      } else {
        textEl.innerHTML = esc(textEl.getAttribute('data-fulltext') || '').replace(/\n/g, '<br>');
        wrap.setAttribute('data-full', '1');
        btn.textContent = '收起';
        wrap.classList.remove('intro-clamp');
      }
    });
  });
}

function authorSearchHits(q) {
  const key = String(q || '').trim().toLowerCase();
  if (!key) return AUTHORS.slice(0, 8);
  return AUTHORS.filter(a =>
    String(a.name || '').toLowerCase().indexOf(key) !== -1 ||
    String(a.category || '').toLowerCase().indexOf(key) !== -1
  ).slice(0, 8);
}

function renderAuthorSearchList(q) {
  const list = document.getElementById('authorSearchList');
  if (!list) return;
  const hits = authorSearchHits(q);
  if (!hits.length) {
    list.innerHTML = '<div class="as-empty">未找到该作者</div>';
    return;
  }
  list.innerHTML = hits.map(a => {
    const i = AUTHORS.indexOf(a);
    const logo = normImg(a.logo);
    const mini = logo
      ? `<span class="as-mini"><img src="${esc(logo)}" alt="" onerror="this.style.visibility='hidden'"></span>`
      : `<span class="as-mini">${esc((a.name || '?').slice(0, 1))}</span>`;
    return `<button type="button" class="as-item" data-i="${i}">
      ${mini}
      <span class="as-meta"><b>${esc(a.name)}</b><small>${esc(a.category || '')}</small></span>
    </button>`;
  }).join('');
  list.querySelectorAll('.as-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      if (!isNaN(i) && AUTHORS[i]) {
        authorIndex = i;
        renderHandbook();
      }
      closeAuthorSearch();
    });
  });
}

function openAuthorSearch() {
  const mask = document.getElementById('authorSearchMask');
  const input = document.getElementById('authorSearchInput');
  if (!mask) return;
  mask.classList.add('open');
  renderAuthorSearchList(input ? input.value : '');
  if (input) setTimeout(() => { try { input.focus(); input.select(); } catch (e) {} }, 40);
}

function closeAuthorSearch() {
  const mask = document.getElementById('authorSearchMask');
  if (mask) mask.classList.remove('open');
}

function buildAuthorsFromApi(circles, works, events, projects) {
  return (circles || []).filter(c => c && c.id).map(c => {
    const mine = (works || []).filter(w =>
      w && (w.circles || []).indexOf(c.id) !== -1 &&
      Array.isArray(w.images) && w.images[0] &&
      (!w.approvalStatus || w.approvalStatus === 'approved')
    ).sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0));

    const evs = (events || []).filter(e =>
      e && (!e.approvalStatus || e.approvalStatus === 'approved') &&
      (e.relatedCircles || e.circles || []).indexOf(c.id) !== -1
    ).sort((a, b) => (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0));

    const prs = (projects || []).filter(p =>
      p && (!p.approvalStatus || p.approvalStatus === 'approved') &&
      (p.circles || []).indexOf(c.id) !== -1
    ).sort((a, b) =>
      (Date.parse(b.startDate || b.createdAt || '') || 0) -
      (Date.parse(a.startDate || a.createdAt || '') || 0)
    );

    const contact = contactFromCircle(c);
    return {
      id: c.id,
      name: c.name || '未命名',
      category: categoryLabel(c.category),
      logo: normImg(c.logo),
      worksCount: mine.length,
      eventCount: evs.length,
      projectCount: prs.length,
      intro: c.description || '',
      contactText: contact.text,
      contactUrl: contact.url,
      workCover: mine[0] ? normImg(mine[0].images[0]) : '',
      eventCover: evs[0] ? normImg(evs[0].coverImage) : '',
      projectCover: prs[0] ? normImg(prs[0].coverImage) : ''
    };
  }).filter(a =>
    a.worksCount || a.eventCount || a.projectCount || a.contactUrl || a.intro || a.logo
  ).sort((a, b) =>
    (b.worksCount + b.eventCount + b.projectCount) -
    (a.worksCount + a.eventCount + a.projectCount) ||
    String(a.name).localeCompare(String(b.name), 'zh')
  ).slice(0, 24);
}

async function fetchJsonList(fn) {
  try {
    if (typeof fn === 'function') {
      const data = await fn();
      return Array.isArray(data) ? data : ((data && data.items) || []);
    }
  } catch (e) {}
  return [];
}

async function loadFromApi() {
  const [works, circles, events, projects] = await Promise.all([
    fetchJsonList(typeof F7API !== 'undefined' ? F7API.getWorks : null),
    fetchJsonList(typeof F7API !== 'undefined' ? F7API.getCircles : null),
    fetchJsonList(typeof F7API !== 'undefined' ? F7API.getEvents : null),
    fetchJsonList(typeof F7API !== 'undefined' ? F7API.getProjects : null)
  ]);
  ALL_WORKS = works; ALL_EVENTS = events; ALL_PROJECTS = projects;
  const built = buildAuthorsFromApi(circles, works, events, projects);
  AUTHORS = built.length ? built : FALLBACK_AUTHORS.slice();
  authorIndex = 0;
  renderHandbook();
}

function bindChrome() {
  document.getElementById('prevAuthor')?.addEventListener('click', () => {
    if (!AUTHORS.length) return;
    authorIndex = (authorIndex - 1 + AUTHORS.length) % AUTHORS.length;
    renderHandbook();
  });
  document.getElementById('nextAuthor')?.addEventListener('click', () => {
    if (!AUTHORS.length) return;
    authorIndex = (authorIndex + 1) % AUTHORS.length;
    renderHandbook();
  });
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;
    if (t.closest && t.closest('#openAuthorSearch')) { e.preventDefault(); openAuthorSearch(); return; }
    if (t.closest && t.closest('#authorSearchClose')) { e.preventDefault(); closeAuthorSearch(); return; }
    if (t.id === 'authorSearchMask') closeAuthorSearch();
  });
  const input = document.getElementById('authorSearchInput');
  if (input) {
    input.addEventListener('input', (e) => renderAuthorSearchList(e.target.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = document.querySelector('#authorSearchList .as-item');
        if (first) first.click();
      }
      if (e.key === 'Escape') closeAuthorSearch();
    });
  }
}

bindChrome();
loadFromApi();
