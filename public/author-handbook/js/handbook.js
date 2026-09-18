/**
 * 作者手册
 * - 作品：最新作品展示图（≤3 张叠加）
 * - 活动 / 企划：相关页面顶栏封面图（coverImage），≤3 张叠加
 * - 作者切换右侧：搜索作者
 * - 联络：设置了网页链接时可点击跳转
 */
const FALLBACK_AUTHORS = [
  {
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
    latestWorkImages: [],
    eventImages: ['/uploads/711chengdu.jpg'],
    projectImages: ['/uploads/2026xinchunyan.png']
  }
];

let AUTHORS = FALLBACK_AUTHORS.slice();
let authorIndex = 0;
let ALL_WORKS = [];
let ALL_CIRCLES = [];
let ALL_EVENTS = [];
let ALL_PROJECTS = [];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function bg(url) {
  const u = normImg(url);
  return u ? `style="background-image:url('${esc(u)}')"` : '';
}

function categoryLabel(id) {
  const map = { geren: '个人', shetuan: '社团', guanfang: '官方' };
  return map[id] || id || '同人作者';
}

/** 联络文案 + 可跳转网页链接 */
function contactFromCircle(c) {
  if (!c) return { text: '', url: '' };
  const sl = c.socialLinks || {};
  const website = normUrl(sl.website);
  const websiteLabel = String(sl.websiteLabel || '').trim();
  const qqGroup = String(sl.qqGroup || '').trim();
  const qq = String(sl.qq || '').trim();
  const contactLabel = String(sl.contactLabel || '').trim();

  let text = '';
  if (contactLabel && (qq || qqGroup || website)) {
    text = contactLabel;
  } else if (websiteLabel && website) {
    text = websiteLabel;
  } else if (qqGroup) {
    text = 'QQ群 ' + qqGroup;
  } else if (qq) {
    text = 'QQ ' + qq;
  } else if (website) {
    text = websiteLabel || website;
  }

  return { text: text || '', url: website || '' };
}

function worksOf(circleId) {
  return (ALL_WORKS || [])
    .filter(w => w && (w.circles || []).indexOf(circleId) !== -1)
    .filter(w => Array.isArray(w.images) && w.images[0])
    .filter(w => !w.approvalStatus || w.approvalStatus === 'approved');
}

function latestWorkCovers(circleId, limit) {
  const n = limit || 3;
  const list = worksOf(circleId).slice().sort((a, b) => {
    const ta = Date.parse(a.createdAt || a.releaseDate || '') || 0;
    const tb = Date.parse(b.createdAt || b.releaseDate || '') || 0;
    return tb - ta;
  });
  return {
    images: list.slice(0, n).map(w => normImg(w.images[0])).filter(Boolean),
    count: list.length
  };
}

/** 活动：relatedCircles 含本作者；取详情页顶栏 coverImage */
function eventCoversOf(circleId, limit) {
  const n = limit || 3;
  const list = (ALL_EVENTS || [])
    .filter(e => e && (!e.approvalStatus || e.approvalStatus === 'approved'))
    .filter(e => e && (e.relatedCircles || e.circles || []).indexOf(circleId) !== -1)
    .filter(e => e && normImg(e.coverImage))
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.date || a.createdAt || '') || 0;
      const tb = Date.parse(b.date || b.createdAt || '') || 0;
      return tb - ta;
    });
  return {
    images: list.slice(0, n).map(e => normImg(e.coverImage)).filter(Boolean),
    count: list.length
  };
}

/** 企划：circles 含本作者；取详情页顶栏 coverImage（最新优先） */
function projectCoversOf(circleId, limit) {
  const n = limit || 3;
  const list = (ALL_PROJECTS || [])
    .filter(p => p && (!p.approvalStatus || p.approvalStatus === 'approved'))
    .filter(p => p && (p.circles || []).indexOf(circleId) !== -1)
    .filter(p => p && normImg(p.coverImage))
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.startDate || a.createdAt || '') || 0;
      const tb = Date.parse(b.startDate || b.createdAt || '') || 0;
      return tb - ta;
    });
  return {
    images: list.slice(0, n).map(p => normImg(p.coverImage)).filter(Boolean),
    count: list.length
  };
}

function introHtml(text) {
  const full = String(text || '').trim();
  if (!full) return '<div class="v muted">暂无简介</div>';
  const paras = full.split(/\n+/).filter(Boolean);
  const isLong = paras.length > 2 || full.length > 90;
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
    const label = t || u;
    return `<div class="v"><a class="contact-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)} <span class="ext">↗</span></a></div>`;
  }
  if (t) return `<div class="v">${esc(t)}</div>`;
  return '<div class="v muted">—</div>';
}

function stackHtml(images, emptyText, kind) {
  const list = (images || []).map(normImg).filter(Boolean).slice(0, 3);
  const kindCls = kind === 'cover' ? ' tile-stack-cover' : '';
  if (!list.length) {
    return `<div class="tile-stack${kindCls}"><div class="empty-ph">${esc(emptyText || '暂无图片')}</div></div>`;
  }
  const n = list.length;
  return `<div class="tile-stack${kindCls} tile-stack-n${n}">` +
    list.map((u, i) =>
      `<div class="ph ph-${i + 1}"><img src="${esc(u)}" alt="" loading="lazy" onerror="this.style.display='none'"></div>`
    ).join('') +
    `</div>`;
}

function renderHandbook() {
  if (!AUTHORS.length) AUTHORS = FALLBACK_AUTHORS;
  if (authorIndex >= AUTHORS.length) authorIndex = 0;
  if (authorIndex < 0) authorIndex = 0;
  const a = AUTHORS[authorIndex];
  const root = document.getElementById('hbRoot');
  if (!root || !a) return;

  const workCover = latestWorkCovers(a.id, 3);
  const evCover = eventCoversOf(a.id, 3);
  const prCover = projectCoversOf(a.id, 3);

  const workImages = workCover.images.length
    ? workCover.images
    : (a.latestWorkImages || []).map(normImg).filter(Boolean);
  const eventImages = evCover.images.length
    ? evCover.images
    : (a.eventImages || []).map(normImg).filter(Boolean);
  const projectImages = prCover.images.length
    ? prCover.images
    : (a.projectImages || []).map(normImg).filter(Boolean);

  const workCount = workCover.count || a.worksCount || 0;
  const eventCount = evCover.count || a.eventCount || 0;
  const projectCount = prCover.count || a.projectCount || 0;

  const logoSrc = normImg(a.logo);
  const logoHtml = logoSrc
    ? `<img src="${esc(logoSrc)}" alt="" onerror="this.style.display='none'">`
    : esc((a.name || '?').slice(0, 2));

  const picker = document.getElementById('authorPicker');
  if (picker) picker.textContent = a.name;

  const circleUrl = `/circle-detail.html?id=${encodeURIComponent(a.id)}`;
  const contactText = a.contactText || a.contact || '';
  const contactUrl = a.contactUrl || '';

  root.innerHTML = `
    <div class="handbook">
      <div class="hb-title-static">
        <h1>作者手册</h1>
        <span>HANDBOOK</span>
      </div>
      <div class="hb-body">
        <div class="idcard-wrap">
          <div class="idcard-clip" aria-hidden="true"></div>
          <article class="idcard">
            <div class="id-head">
              <div class="id-avatar">${logoHtml}</div>
              <div class="id-head-text">
                <div class="id-name">${esc(a.name)}</div>
                <div class="id-sub">${esc(a.category || '同人作者')}</div>
              </div>
            </div>

            <div class="id-block">
              <div class="k">作者简介</div>
              ${introHtml(a.intro)}
            </div>
            <div class="id-block">
              <div class="k">联络</div>
              ${contactHtml(contactText, contactUrl)}
            </div>

            <div class="id-stats">
              <div class="id-stat"><span class="k">作品</span><span class="v">${workCount}</span></div>
              <div class="id-stat"><span class="k">活动</span><span class="v">${eventCount}</span></div>
              <div class="id-stat"><span class="k">企划</span><span class="v">${projectCount}</span></div>
            </div>
          </article>
        </div>

        <div class="hb-tiles">
          <a class="tile tile-main" href="${circleUrl}#works" title="作品列表">
            ${stackHtml(workImages, '暂无最新作品展示图', 'work')}
            <div class="tile-label">
              <b>作品列表</b>
              <span>WORKS</span>
            </div>
          </a>
          <a class="tile" href="${circleUrl}#events" title="参与活动">
            ${stackHtml(eventImages, '暂无参与活动封面', 'cover')}
            <div class="tile-label">
              <b>参与活动</b>
              <span>EVENTS</span>
            </div>
          </a>
          <a class="tile" href="${circleUrl}#projects" title="同人企划">
            ${stackHtml(projectImages, '暂无同人企划封面', 'cover')}
            <div class="tile-label">
              <b>同人企划</b>
              <span>PROJECTS</span>
            </div>
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

/** 作者搜索（切换栏右侧） */
function authorSearchHits(q) {
  const key = String(q || '').trim().toLowerCase();
  if (!key) return AUTHORS.slice(0, 8);
  return AUTHORS.filter(a =>
    String(a.name || '').toLowerCase().indexOf(key) !== -1 ||
    String(a.category || '').toLowerCase().indexOf(key) !== -1 ||
    String(a.id || '').toLowerCase().indexOf(key) !== -1
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
      : `<span class="as-mini as-txt">${esc((a.name || '?').slice(0, 1))}</span>`;
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
  // DOM 结构：遮罩 id=authorSearchMask，open 类控制显示
  const mask = document.getElementById('authorSearchMask');
  const input = document.getElementById('authorSearchInput');
  if (!mask) return;
  mask.classList.add('open');
  renderAuthorSearchList(input ? input.value : '');
  if (input) {
    setTimeout(() => {
      try { input.focus(); input.select(); } catch (e) {}
    }, 50);
  }
}

function closeAuthorSearch() {
  const mask = document.getElementById('authorSearchMask');
  if (mask) mask.classList.remove('open');
}

function buildAuthorsFromApi(circles, works, events, projects) {
  const worksBy = {};
  (works || []).forEach(w => {
    (w.circles || []).forEach(cid => {
      if (!worksBy[cid]) worksBy[cid] = [];
      worksBy[cid].push(w);
    });
  });

  const list = (circles || [])
    .filter(c => c && c.id)
    .map(c => {
      const mineWorks = (worksBy[c.id] || []).filter(w =>
        Array.isArray(w.images) && w.images[0] &&
        (!w.approvalStatus || w.approvalStatus === 'approved')
      );
      const latest = mineWorks.slice().sort((a, b) => {
        const ta = Date.parse(a.createdAt || '') || 0;
        const tb = Date.parse(b.createdAt || '') || 0;
        return tb - ta;
      }).slice(0, 3).map(w => normImg(w.images[0])).filter(Boolean);

      const evs = (events || []).filter(e =>
        e && (!e.approvalStatus || e.approvalStatus === 'approved') &&
        (e.relatedCircles || e.circles || []).indexOf(c.id) !== -1 &&
        normImg(e.coverImage)
      );
      const evImgs = evs.slice().sort((a, b) => {
        return (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0);
      }).slice(0, 3).map(e => normImg(e.coverImage)).filter(Boolean);

      const prs = (projects || []).filter(p =>
        p && (!p.approvalStatus || p.approvalStatus === 'approved') &&
        (p.circles || []).indexOf(c.id) !== -1 &&
        normImg(p.coverImage)
      );
      const prImgs = prs.slice().sort((a, b) => {
        return (Date.parse(b.startDate || b.createdAt || '') || 0) -
               (Date.parse(a.startDate || a.createdAt || '') || 0);
      }).slice(0, 3).map(p => normImg(p.coverImage)).filter(Boolean);

      const contact = contactFromCircle(c);

      return {
        id: c.id,
        name: c.name || '未命名',
        category: categoryLabel(c.category),
        logo: normImg(c.logo),
        worksCount: mineWorks.length,
        eventCount: evs.length,
        projectCount: prs.length,
        intro: c.description || '',
        contactText: contact.text,
        contactUrl: contact.url,
        latestWorkImages: latest,
        eventImages: evImgs,
        projectImages: prImgs
      };
    })
    .sort((a, b) =>
      (b.worksCount + b.eventCount + b.projectCount) -
      (a.worksCount + a.eventCount + a.projectCount) ||
      String(a.name).localeCompare(String(b.name), 'zh')
    );

  const withAny = list.filter(a =>
    a.worksCount > 0 || a.eventCount > 0 || a.projectCount > 0 || a.contactUrl || a.intro
  );
  return (withAny.length ? withAny : list).slice(0, 24);
}

async function fetchJsonList(fn) {
  try {
    if (typeof fn === 'function') {
      const data = await fn();
      return Array.isArray(data) ? data : ((data && data.items) || []);
    }
  } catch (e) { /* ignore */ }
  return [];
}

async function loadFromApi() {
  const [works, circles, events, projects] = await Promise.all([
    fetchJsonList(typeof F7API !== 'undefined' ? F7API.getWorks : null),
    fetchJsonList(typeof F7API !== 'undefined' ? F7API.getCircles : null),
    fetchJsonList(typeof F7API !== 'undefined' ? F7API.getEvents : null),
    fetchJsonList(typeof F7API !== 'undefined' ? F7API.getProjects : null)
  ]);

  ALL_WORKS = works;
  ALL_CIRCLES = circles;
  ALL_EVENTS = events;
  ALL_PROJECTS = projects;

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

  // 搜索入口：委托 + 直接绑定，避免节点替换后失效
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;
    if (t.closest && t.closest('#openAuthorSearch')) {
      e.preventDefault();
      openAuthorSearch();
      return;
    }
    if (t.closest && t.closest('#authorSearchClose')) {
      e.preventDefault();
      closeAuthorSearch();
      return;
    }
    if (t.id === 'authorSearchMask') {
      closeAuthorSearch();
    }
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
