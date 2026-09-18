/**
 * 作者手册
 * - 档案卡：简介（可展开）→ 联络 → 作品/活动/企划数量
 * - 不显示标识、编号；不提供右上角搜索
 * - 作品/活动/企划：图片叠加展示
 */
const AUTHORS = [
  {
    id: 'c1785520414879',
    name: '八日晨光',
    category: '同人平台',
    logo: '../uploads/barichenguang.png',
    worksCount: 3,
    eventCount: 1,
    projectCount: 1,
    intro: '八日晨光为永远的7日之都吧吧务组在同人作品升级计划基础上，经过两年多个版本完善后，于2022年成立的同人平台。\n\n以无偿帮助创作者与企划为主。成立后试行两年邀请制，2024年8月起正式对外试开放投稿与合作渠道。\n\n我们相信同人创作能让这座城市继续被点亮。',
    contact: '灰机 Wiki · 八日晨光',
    latestWorkImages: [
      '../uploads/006jiaer.png',
      '../uploads/006antuoniewa1.png',
      '../uploads/006antuoniewa2.png'
    ],
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
    worksCount: 2,
    eventCount: 1,
    projectCount: 1,
    intro: '个人创作者。以钥匙扣等同人小物为主，参与 ONLY 与同人企划。',
    contact: 'QQ（见社团页）',
    latestWorkImages: [
      '../uploads/006antuoniewa1.png',
      '../uploads/006antuoniewa2.png',
      '../uploads/006jiaer.png'
    ],
    eventImages: [
      '../uploads/711chengdu.jpg'
    ],
    projectImages: [
      '../uploads/2026xinchunyan.png'
    ]
  }
];

let authorIndex = 0;

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

/** 简介：过长时截断，可展开 */
function introHtml(text, id) {
  const full = String(text || '').trim();
  if (!full) return '<div class="v muted">暂无简介</div>';
  const paras = full.split(/\n+/).filter(Boolean);
  const isLong = paras.length > 2 || full.length > 90;
  if (!isLong) {
    return `<div class="v" data-intro-body="${id}">${esc(full).replace(/\n/g, '<br>')}</div>`;
  }
  const preview = paras.slice(0, 2).join('\n');
  return `
    <div class="v intro-clamp" id="intro-${id}" data-full="0">
      <div class="intro-text" data-preview="${esc(preview)}" data-fulltext="${esc(full)}">${esc(preview)}…</div>
      <button type="button" class="intro-toggle" data-toggle="${id}">展开</button>
    </div>`;
}

/** 叠加展示：最多 3 张；不足则有几张叠几张 */
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

            <!-- 简介（可展开）→ 联络 → 作品/活动/企划 -->
            <div class="id-block">
              <div class="k">作者简介</div>
              ${introHtml(a.intro, introId)}
            </div>
            <div class="id-block">
              <div class="k">联络</div>
              <div class="v">${esc(a.contact || '—')}</div>
            </div>

            <div class="id-stats">
              <div class="id-stat"><span class="k">作品</span><span class="v">${a.worksCount}</span></div>
              <div class="id-stat"><span class="k">活动</span><span class="v">${a.eventCount}</span></div>
              <div class="id-stat"><span class="k">企划</span><span class="v">${a.projectCount}</span></div>
            </div>
          </article>
        </div>

        <div class="hb-tiles">
          <a class="tile tile-main" href="${circleUrl}#works" title="作品列表">
            ${stackHtml(a.latestWorkImages, '暂无最新作品图')}
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

document.getElementById('prevAuthor')?.addEventListener('click', () => {
  authorIndex = (authorIndex - 1 + AUTHORS.length) % AUTHORS.length;
  renderHandbook();
});
document.getElementById('nextAuthor')?.addEventListener('click', () => {
  authorIndex = (authorIndex + 1) % AUTHORS.length;
  renderHandbook();
});

renderHandbook();
