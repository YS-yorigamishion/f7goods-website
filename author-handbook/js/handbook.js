/**
 * 作者手册预览
 * - 档案卡：简介 → 标识 → 编号 → 联络 → 作品/活动/企划
 * - 右上角作者名：点击弹出搜索，输入后跳转指定作者
 * - 作品卡：最新三张图叠加；活动/企划用封面图
 * - 不显示数量角标
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
    code: 'C-17855204',
    stars: 4,
    intro: '以无偿帮助创作者与企划为主的七都同人平台。2022 年成立，2024 年 8 月起试开放投稿 / 合作渠道。',
    contact: '灰机 Wiki · 八日晨光',
    // 最新三张作品图（叠加展示）
    latestWorkImages: [
      '../uploads/006jiaer.png',
      '../uploads/006antuoniewa1.png',
      '../uploads/006antuoniewa2.png'
    ],
    eventCover: '../uploads/711chengdu.jpg',
    projectCover: '../uploads/2026xinchunyan.png'
  },
  {
    id: 'c1785520390477',
    name: '未命名制作组',
    category: '社团',
    logo: '../uploads/404zhizuozu.png',
    worksCount: 0,
    eventCount: 0,
    projectCount: 0,
    code: 'C-17855203',
    stars: 3,
    intro: '《未命名》同人游戏制作组，目前正在制作中。游客群：765852632。',
    contact: '「未命名」游客群',
    latestWorkImages: [],
    eventCover: '../uploads/bawuzu.jpg',
    projectCover: '../uploads/2026xinchunyan.png'
  },
  {
    id: 'c002',
    name: '单纯7压抑阿妍',
    category: '个人',
    logo: '../uploads/danchun7yayiayan.png',
    worksCount: 2,
    eventCount: 1,
    projectCount: 1,
    code: 'C-002',
    stars: 5,
    intro: '个人创作者。以钥匙扣等小物为主，参与 ONLY 与同人企划。',
    contact: 'QQ（见社团页）',
    latestWorkImages: [
      '../uploads/006antuoniewa1.png',
      '../uploads/006antuoniewa2.png',
      '../uploads/006jiaer.png'
    ],
    eventCover: '../uploads/711chengdu.jpg',
    projectCover: '../uploads/2026xinchunyan.png'
  }
];

let authorIndex = 0;

function stars(n) {
  const max = 8;
  const on = Math.max(0, Math.min(max, n || 0));
  return '★'.repeat(on) + '☆'.repeat(Math.max(0, max - on));
}

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

/** 作品三图叠加；不足三张则有几张叠几张 */
function stackHtml(images) {
  const list = (images || []).filter(Boolean).slice(0, 3);
  if (!list.length) {
    return `<div class="tile-stack"><div class="empty-ph">暂无最新作品图</div></div>`;
  }
  return `<div class="tile-stack">${list.map(u => `<div class="ph" ${bg(u)}></div>`).join('')}</div>`;
}

function renderHandbook() {
  const a = AUTHORS[authorIndex];
  const root = document.getElementById('hbRoot');
  if (!root || !a) return;

  const logoHtml = a.logo
    ? `<img src="${esc(a.logo)}" alt="">`
    : esc((a.name || '?').slice(0, 2));

  const nameBtn = document.getElementById('hbAuthorName');
  if (nameBtn) {
    nameBtn.innerHTML = `${esc(a.name)}<span class="chev">⌕</span>`;
  }
  const picker = document.getElementById('authorPicker');
  if (picker) picker.textContent = a.name;

  const circleUrl = `/circle-detail.html?id=${encodeURIComponent(a.id)}`;

  root.innerHTML = `
    <div class="handbook">
      <div class="hb-title">
        <button type="button" class="hb-author-btn" id="hbAuthorName" aria-label="搜索作者" title="点击搜索作者">
          ${esc(a.name)}<span class="chev">⌕</span>
        </button>
        <span class="handbook-word">作者手册</span>
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

            <!-- 顺序：简介 → 标识 → 编号 → 联络 →（下方）作品/活动/企划 -->
            <div class="id-block">
              <div class="k">作者简介</div>
              <div class="v">${esc(a.intro || '暂无简介')}</div>
            </div>
            <div class="id-block">
              <div class="k">标识</div>
              <div class="v stars">${stars(a.stars)}</div>
            </div>
            <div class="id-block">
              <div class="k">编号</div>
              <div class="v num">${esc(a.code)}</div>
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
            ${stackHtml(a.latestWorkImages)}
            <div class="tile-label">
              <b>作品列表</b>
              <span>WORKS</span>
            </div>
          </a>
          <a class="tile" href="${circleUrl}#events" title="参与活动">
            <div class="tile-img" ${bg(a.eventCover)}></div>
            <div class="tile-label">
              <b>参与活动</b>
              <span>EVENTS</span>
            </div>
          </a>
          <a class="tile" href="${circleUrl}#projects" title="同人企划">
            <div class="tile-img" ${bg(a.projectCover)}></div>
            <div class="tile-label">
              <b>同人企划</b>
              <span>PROJECTS</span>
            </div>
          </a>
        </div>
      </div>
    </div>
    <div class="note">
      <strong>预览</strong> · 作者列表「全部/个人/社团/官方」最右为紫底白字「作者手册」入口。
      右上角作者名可点击搜索；作品区为最新三张图叠加；活动/企划用对应封面；分区不显示数量角标。
      正式接入时请挂到 <code>/public/author-handbook/</code>，数据接 API。
    </div>
  `;

  bindNameSearch();
}

/* ── 搜索：右上角名字 ── */
function openSearch() {
  const mask = document.getElementById('searchMask');
  const input = document.getElementById('searchInput');
  const list = document.getElementById('searchList');
  const hint = document.getElementById('searchHint');
  if (!mask) return;
  mask.classList.add('open');
  if (hint) hint.textContent = '输入作者名称，回车或点击结果进入手册';
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 50);
  }
  renderSearchList('');
  function renderSearchList(q) {
    const key = String(q || '').trim().toLowerCase();
    const hits = AUTHORS.filter(a =>
      !key ||
      String(a.name || '').toLowerCase().includes(key) ||
      String(a.code || '').toLowerCase().includes(key) ||
      String(a.category || '').toLowerCase().includes(key)
    );
    if (!list) return;
    if (!hits.length) {
      list.innerHTML = '<div style="font-size:0.8rem;color:rgba(232,196,255,0.55);padding:0.4rem;">未找到该作者</div>';
      return;
    }
    list.innerHTML = hits.map(a => {
      const i = AUTHORS.indexOf(a);
      const mini = a.logo
        ? `<span class="mini"><img src="${esc(a.logo)}" alt=""></span>`
        : `<span class="mini">${esc((a.name || '?').slice(0, 1))}</span>`;
      return `<button type="button" class="search-item" data-i="${i}">
        ${mini}
        <span>${esc(a.name)}<small>${esc(a.category || '')} · ${esc(a.code)}</small></span>
      </button>`;
    }).join('');
    list.querySelectorAll('.search-item').forEach(btn => {
      btn.addEventListener('click', () => {
        authorIndex = Number(btn.dataset.i) || 0;
        closeSearch();
        renderHandbook();
      });
    });
  }
  if (input) {
    input.oninput = () => renderSearchList(input.value);
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = list?.querySelector('.search-item');
        if (first) first.click();
      }
      if (e.key === 'Escape') closeSearch();
    };
  }
}

function closeSearch() {
  document.getElementById('searchMask')?.classList.remove('open');
}

function bindNameSearch() {
  document.getElementById('hbAuthorName')?.addEventListener('click', openSearch);
}

document.getElementById('prevAuthor')?.addEventListener('click', () => {
  authorIndex = (authorIndex - 1 + AUTHORS.length) % AUTHORS.length;
  renderHandbook();
});
document.getElementById('nextAuthor')?.addEventListener('click', () => {
  authorIndex = (authorIndex + 1) % AUTHORS.length;
  renderHandbook();
});
document.getElementById('searchMask')?.addEventListener('click', (e) => {
  if (e.target.id === 'searchMask') closeSearch();
});
document.getElementById('searchClose')?.addEventListener('click', closeSearch);
document.getElementById('openSearchDemo')?.addEventListener('click', openSearch);
document.getElementById('handbookEntry')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.querySelector('.handbook')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

renderHandbook();
