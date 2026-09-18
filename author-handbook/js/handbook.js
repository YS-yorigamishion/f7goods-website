/**
 * 作者手册
 * - 作品列表：显示该作者最新作品的展示图（按上传时间取前 3 张封面）
 * - 活动 / 企划：叠加展示图
 * - 简介过长可展开；不显示标识、编号
 */
const AUTHORS = [
  {
    id: 'c1785520414879',
    name: '八日晨光',
    category: '同人平台',
    logo: '../uploads/barichenguang.png',
    worksCount: 0,
    eventCount: 1,
    projectCount: 1,
    intro: '八日晨光为永远的7日之都吧吧务组在同人作品升级计划基础上，经过两年多个版本完善后，于2022年成立的同人平台。\n\n以无偿帮助创作者与企划为主。成立后试行两年邀请制，2024年8月起正式对外试开放投稿与合作渠道。\n\n我们相信同人创作能让这座城市继续被点亮。',
    contact: '灰机 Wiki · 八日晨光',
    // 若 API 不可用时的兜底展示图
    latestWorkImages: [],
    eventImages: [
      '../uploads/711chengdu.jpg',
      '../uploads/bawuzu.jpg',
      '../uploads/7wiki.png'
    ],
    projectImages: [
      '../uploads/2026xinchunyan.png',
      '../uploads/404zhizuozu.png',
      '../uploads/barichenguang.png'
    ]
  },
  {
    id: 'c1785520390477',
    name: '未命名制作组',
    category: '社团',
    logo: '../uploads/404zhizuozu.png',
    worksCount: 0,
    eventCount: 0,
    projectCount: 0,
    intro: '《未命名》同人游戏制作组，正在制作永远的7日之都同人游戏。\n\n如需了解更多信息，可添加游客群。',
    contact: '「未命名」游客群 765852632',
    latestWorkImages: [],
    eventImages: [],
    projectImages: [
      '../uploads/2026xinchunyan.png',
      '../uploads/404zhizuozu.png'
    ]
  },
  {
    id: 'c002',
    name: '单纯7压抑阿妍',
    category: '个人',
    logo: '../uploads/danchun7yayiayan.png',
    worksCount: 0,
    eventCount: 1,
    projectCount: 1,
    intro: '个人创作者。以钥匙扣等同人小物为主，参与 ONLY 与同人企划。',
    contact: 'QQ（见社团页）',
    latestWorkImages: [],
    eventImages: [
      '../uploads/711chengdu.jpg'
    ],
    projectImages: [
      '../uploads/2026xinchunyan.png'
    ]
  }
];

let authorIndex = 0;
let ALL_WORKS = [];
let dataReady = false;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bg(url) {
  return url ? `style="background-image:url('${esc(url)}')"` : '';
}

/** 从全站作品里取该作者最新 N 件的展示图（封面） */
function latestWorkCovers(circleId, limit) {
  const n = limit || 3;
  const list = (ALL_WORKS || [])
    .filter(w => w && (w.circles || []).indexOf(circleId) !== -1)
    .filter(w => Array.isArray(w.images) && w.images[0])
    .filter(w => !w.approvalStatus || w.approvalStatus === 'approved')
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.createdAt || a.releaseDate || '') || 0;
      const tb = Date.parse(b.createdAt || b.releaseDate || '') || 0;
      return tb - ta;
    });
  return {
    images: list.slice(0, n).map(w => w.images[0]),
    count: list.length,
    titles: list.slice(0, n).map(w => w.title || '')
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
    <div class="v intro-clamp" id="intro-${id}" data-full="0">
      <div class="intro-text" data-preview="${esc(preview)}" data-fulltext="${esc(full)}">${esc(preview)}…</div>
      <button type="button" class="intro-toggle" data-toggle="${id}">展开</button>
    </div>`;
}

function stackHtml(images, emptyText) {
  const list = (images || []).filter(Boolean).slice(0, 3);
  if (!list.length) {
    return `<div class="tile-stack"><div class="empty-ph">${esc(emptyText || '暂无图片')}</div></div>`;
  }
  const n = list.length;
  return `<div class="tile-stack tile-stack-n${n}">${list.map(u => `<div class="ph" ${bg(u)}></div>`).join('')}</div>`;
}

function renderHandbook() {
  const a = AUTHORS[authorIndex];
  const root = document.getElementById('hbRoot');
  if (!root || !a) return;

  // 作品展示图：优先用 API 最新作品封面
  const fromApi = latestWorkCovers(a.id, 3);
  const workImages = fromApi.images.length ? fromApi.images : (a.latestWorkImages || []);
  const workCount = fromApi.count || a.worksCount || 0;

  const logoHtml = a.logo
    ? `<img src="${esc(a.logo)}" alt="">`
    : esc((a.name || '?').slice(0, 2));

  const picker = document.getElementById('authorPicker');
  if (picker) picker.textContent = a.name;

  const circleUrl = `/circle-detail.html?id=${encodeURIComponent(a.id)}`;
  const introId = 'a' + authorIndex;

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
              <div style="flex:1;min-width:0;">
                <div class="id-name">${esc(a.name)}</div>
                <div class="id-sub">${esc(a.category || '同人作者')}</div>
              </div>
            </div>

            <div class="id-block">
              <div class="k">作者简介</div>
              ${introHtml(a.intro, introId)}
            </div>
            <div class="id-block">
              <div class="k">联络</div>
              <div class="v">${esc(a.contact || '—')}</div>
            </div>

            <div class="id-stats">
              <div class="id-stat"><span class="k">作品</span><span class="v">${workCount}</span></div>
              <div class="id-stat"><span class="k">活动</span><span class="v">${a.eventCount}</span></div>
              <div class="id-stat"><span class="k">企划</span><span class="v">${a.projectCount}</span></div>
            </div>
          </article>
        </div>

        <div class="hb-tiles">
          <a class="tile tile-main" href="${circleUrl}#works" title="作品列表（最新作品展示图）">
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

function mapApiWorks(list) {
  return (list || [])
    .filter(w => w && w.id)
    .map(w => ({
      id: w.id,
      title: w.title || '',
      images: w.images || [],
      circles: w.circles || [],
      createdAt: w.createdAt || '',
      releaseDate: w.releaseDate || '',
      approvalStatus: w.approvalStatus || ''
    }));
}

async function loadWorks() {
  try {
    if (typeof F7API !== 'undefined' && F7API.getWorks) {
      const data = await F7API.getWorks();
      const list = Array.isArray(data) ? data : ((data && data.items) || []);
      ALL_WORKS = mapApiWorks(list);
    }
  } catch (e) {
    ALL_WORKS = [];
  }
  dataReady = true;
  renderHandbook();
}

document.getElementById('prevAuthor')?.addEventListener('click', () => {
  authorIndex = (authorIndex - 1 + AUTHORS.length) % AUTHORS.length;
  renderHandbook();
});
document.getElementById('nextAuthor')?.addEventListener('click', () => {
  authorIndex = (authorIndex + 1) % AUTHORS.length;
  renderHandbook();
});

loadWorks();
