/**
 * 作者手册
 * - 数据优先来自 /api/circles + /api/works
 * - 作品列表：最新作品展示图（最多 3 张叠加）
 * - 简介过长可展开；不显示标识、编号
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
    contact: '',
    latestWorkImages: [],
    eventImages: ['/uploads/711chengdu.jpg'],
    projectImages: ['/uploads/2026xinchunyan.png']
  }
];

let AUTHORS = FALLBACK_AUTHORS.slice();
let authorIndex = 0;
let ALL_WORKS = [];
let ALL_CIRCLES = [];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 图片地址归一化：站内相对路径 / 外链均可 */
function normImg(u) {
  if (!u) return '';
  const s = String(u).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.charAt(0) === '/') return s;
  return '/' + s.replace(/^\.?\/*/, '');
}

function bg(url) {
  const u = normImg(url);
  return u ? `style="background-image:url('${esc(u)}')"` : '';
}

function categoryLabel(id) {
  const map = { geren: '个人', shetuan: '社团', guanfang: '官方' };
  return map[id] || id || '同人作者';
}

function contactFromCircle(c) {
  if (!c) return '';
  const sl = c.socialLinks || {};
  if (sl.contactLabel && (sl.qq || sl.qqGroup || sl.website)) {
    return sl.contactLabel;
  }
  if (sl.websiteLabel && sl.website) return sl.websiteLabel;
  if (sl.qqGroup) return 'QQ群 ' + sl.qqGroup;
  if (sl.qq) return 'QQ ' + sl.qq;
  if (sl.website) return sl.website;
  return '';
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

function introHtml(text, id) {
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

/** 叠加：img 标签便于加载失败时看见 alt/占位 */
function stackHtml(images, emptyText) {
  const list = (images || []).map(normImg).filter(Boolean).slice(0, 3);
  if (!list.length) {
    return `<div class="tile-stack"><div class="empty-ph">${esc(emptyText || '暂无图片')}</div></div>`;
  }
  const n = list.length;
  return `<div class="tile-stack tile-stack-n${n}">` +
    list.map((u, i) =>
      `<div class="ph ph-${i + 1}"><img src="${esc(u)}" alt="" loading="lazy" onerror="this.style.display='none'"></div>`
    ).join('') +
    `</div>`;
}

function renderHandbook() {
  if (!AUTHORS.length) AUTHORS = FALLBACK_AUTHORS;
  if (authorIndex >= AUTHORS.length) authorIndex = 0;
  const a = AUTHORS[authorIndex];
  const root = document.getElementById('hbRoot');
  if (!root || !a) return;

  const cover = latestWorkCovers(a.id, 3);
  const workImages = cover.images.length
    ? cover.images
    : (a.latestWorkImages || []).map(normImg).filter(Boolean);
  const workCount = cover.count || a.worksCount || 0;

  const logoSrc = normImg(a.logo);
  const logoHtml = logoSrc
    ? `<img src="${esc(logoSrc)}" alt="" onerror="this.style.display='none'">`
    : esc((a.name || '?').slice(0, 2));

  const picker = document.getElementById('authorPicker');
  if (picker) picker.textContent = a.name;

  const circleUrl = `/circle-detail.html?id=${encodeURIComponent(a.id)}`;

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
              <div class="v">${esc(a.contact || '—')}</div>
            </div>

            <div class="id-stats">
              <div class="id-stat"><span class="k">作品</span><span class="v">${workCount}</span></div>
              <div class="id-stat"><span class="k">活动</span><span class="v">${a.eventCount || 0}</span></div>
              <div class="id-stat"><span class="k">企划</span><span class="v">${a.projectCount || 0}</span></div>
            </div>
          </article>
        </div>

        <div class="hb-tiles">
          <a class="tile tile-main" href="${circleUrl}#works" title="作品列表">
            ${stackHtml(workImages, '暂无最新作品展示图')}
            <div class="tile-label">
              <b>作品列表</b>
              <span>WORKS</span>
            </div>
          </a>
          <a class="tile" href="${circleUrl}#events" title="参与活动">
            ${stackHtml(a.eventImages, '暂无参与活动')}
            <div class="tile-label">
              <b>参与活动</b>
              <span>EVENTS</span>
            </div>
          </a>
          <a class="tile" href="${circleUrl}#projects" title="同人企划">
            ${stackHtml(a.projectImages, '暂无同人企划')}
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

function buildAuthorsFromApi(circles, works) {
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
      const mine = (worksBy[c.id] || []).filter(w =>
        Array.isArray(w.images) && w.images[0] &&
        (!w.approvalStatus || w.approvalStatus === 'approved')
      );
      const latest = mine.slice().sort((a, b) => {
        const ta = Date.parse(a.createdAt || '') || 0;
        const tb = Date.parse(b.createdAt || '') || 0;
        return tb - ta;
      }).slice(0, 3).map(w => normImg(w.images[0])).filter(Boolean);

      return {
        id: c.id,
        name: c.name || '未命名',
        category: categoryLabel(c.category),
        logo: normImg(c.logo),
        worksCount: mine.length,
        eventCount: 0,
        projectCount: 0,
        intro: c.description || '',
        contact: contactFromCircle(c),
        latestWorkImages: latest,
        eventImages: [],
        projectImages: []
      };
    })
    // 有作品的优先，其次有简介/头像的入驻作者
    .sort((a, b) => (b.worksCount - a.worksCount) || String(a.name).localeCompare(String(b.name), 'zh'));

  // 至少展示有作品的作者；若全无则展示前 12 位
  const withWorks = list.filter(a => a.worksCount > 0);
  return withWorks.length ? withWorks.slice(0, 24) : list.slice(0, 12);
}

async function loadFromApi() {
  let circles = [];
  let works = [];
  try {
    if (typeof F7API !== 'undefined' && F7API.getWorks) {
      const wd = await F7API.getWorks();
      works = Array.isArray(wd) ? wd : ((wd && wd.items) || []);
    }
  } catch (e) { works = []; }
  try {
    if (typeof F7API !== 'undefined' && F7API.getCircles) {
      const cd = await F7API.getCircles();
      circles = Array.isArray(cd) ? cd : ((cd && cd.items) || []);
    }
  } catch (e) { circles = []; }

  ALL_WORKS = works;
  ALL_CIRCLES = circles;

  const built = buildAuthorsFromApi(circles, works);
  if (built.length) {
    AUTHORS = built;
  } else {
    // API 无数据时：用兜底作者 + 若能读到 works 则仍按 id 取图
    AUTHORS = FALLBACK_AUTHORS.slice();
  }
  authorIndex = 0;
  renderHandbook();
}

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

loadFromApi();
