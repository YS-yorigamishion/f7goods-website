/**
 * f7goods 故事页 — 叙事数据与交互
 * 线索：日韩停更 → wiki 解包预警与聚集作者活动 → 国服停更 → 保存与宣传同人 →
 *       持续创作与 ONLY → 信息分散 → f7goods
 */
const CHAPTERS = [
  {
    id: 'cover',
    day: 'PROLOGUE',
    kicker: 'OUR STORY',
    title: '我们的故事，\n还没有结束',
    paragraphs: [
      '《永远的7日之都》的服务器仍在。你可以登录，可以走完熟悉的七日。',
      '但有一件事，已经永远改变——更新停了。这一页，记的是玩家如何在断更之后，把这座城接着写下去。'
    ],
    aside: '预览稿 · 可替换为正式站内路径与真实日期节点。',
    hint: '点击任意处开始',
    nextLabel: '翻开故事'
  },
  {
    id: 'echo',
    day: 'CHAPTER 01',
    kicker: 'ECHOES OVERSEAS',
    title: '山雨欲来：\n日服、韩服接连停更',
    paragraphs: [
      '在国服还更新的时候，海外服务器已经先一步合上了日志。对仍在线的玩家来说，那像远处的雷声——还不在脚下，却已经听得见。',
      '很多人选择不去多想。继续登录、继续过七日。只是偶尔会问：如果有一天轮到我们呢？'
    ],
    aside: '时间线起点：国服尚未停更，日服 / 韩服已相继停止更新。',
    nextLabel: '继续'
  },
  {
    id: 'signal',
    day: 'CHAPTER 02',
    kicker: 'THE SIGNAL',
    title: '解包里看见的，\n不只是数据',
    paragraphs: [
      '某次更新之后，Wiki 组在解包时察觉到了端倪：官方似乎已经准备停下。',
      '没有等到告别公告，一位 Wiki 成员先行动了——发起活动，试图聚集同人作者，把同人生态维系下去。这件事一直持续到今天，并衍生出许多其他活动。'
    ],
    aside: '<strong>关键节点</strong> · 预警不是终点，而是玩家自治的起点。',
    nextLabel: '继续'
  },
  {
    id: 'freeze',
    day: 'CHAPTER 03',
    kicker: 'THE LAST BUILD',
    title: '国服，也停在了那一天',
    paragraphs: [
      '该来的还是来了。国服没有关服，却再也没有新的篇章。',
      '城市仍亮着灯，登录界面仍熟悉。只是版本号永远停住了——官方的剧本，到此为止。'
    ],
    aside: '未停服，永断更。对许多指挥使来说，这是沉默而非告别。',
    nextLabel: '继续'
  },
  {
    id: 'keep',
    day: 'CHAPTER 04',
    kicker: 'KEEPING THE CITY',
    title: '把故事留下来',
    paragraphs: [
      '停更之后，玩家们开始大规模录屏，收集 CG 与剧情文案，生怕哪天连档案也失传。',
      'Wiki 组完成了整个游戏剧情的抄录；Wiki 站长把首页轮播让给同人宣传——官方不再给流量的地方，由玩家自己点亮。'
    ],
    aside: '保存 + 展示：考据、录屏、全文抄录、首页轮播推广同人。',
    nextLabel: '继续'
  },
  {
    id: 'make',
    day: 'CHAPTER 05',
    kicker: 'WE KEEP MAKING',
    title: '更新，由双手发布',
    paragraphs: [
      '保存只是开始。玩家们没有停下来：制作周边、书写同人剧情、绘制作品、开发同人游戏、策划活动，甚至举办 ONLY。',
      '版本号不再前进，创作却在继续。每一次上架、每一场会面，都是这座城市的新更新日志。'
    ],
    aside: '生态形态：周边 · 同人文 · 美术 · 同人游戏 · 企划 · ONLY 展会',
    nextLabel: '继续'
  },
  {
    id: 'scatter',
    day: 'CHAPTER 06',
    kicker: 'SCATTERED MAP',
    title: '热爱很完整，\n信息却太散',
    paragraphs: [
      '玩家群体太过分散。很多人并不知道：哪里在办活动、哪里在招募企划、哪里出了新周边。',
      '不是没有人创作，而是地图碎成了许多页——散落在群公告、社交动态和口耳相传里。想认真支持，却常常找不到入口。'
    ],
    aside: '<strong>问题核心</strong> · 不是缺乏热爱，而是缺乏一张完整的目录。',
    nextLabel: '继续'
  },
  {
    id: 'f7',
    day: 'CHAPTER 07',
    kicker: 'F7GOODS',
    title: '本网站，因此而来',
    paragraphs: [
      'f7goods 想做的，是把散落的页码重新装订：同人周边、作者社团、活动与企划，整理成可浏览、可筛选、可收藏的一份场刊。',
      '心愿单帮你排开展清单；ONLY 专场串起摊位与商品。我们不生产热爱——我们只让热爱被看见。'
    ],
    aside: '定位：安静、可信的同人周边展示与连接平台。不做促销卖场。',
    nextLabel: '最后一页'
  },
  {
    id: 'end',
    day: 'EPILOGUE',
    kicker: 'TO BE CONTINUED',
    title: '我们的故事，\n还没有结束',
    paragraphs: [
      '官方的更新停在了某一版；玩家的更新，写在每一次上架、每一次逛展、每一次转发里。',
      '下一页，由你翻开——无论是创作者，还是仍在寻找这座城市的人。'
    ],
    end: true,
    nextLabel: '进入站内'
  }
];

let index = 0;

const scene = document.getElementById('scene');
const meter = document.getElementById('meter');
const meterTrack = document.getElementById('meterTrack');
const meterLabel = document.getElementById('meterLabel');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const skipBtn = document.getElementById('skipBtn');
const footHint = document.getElementById('footHint');

function glyphSvg(id) {
  const g = {
    cover: '<circle cx="50" cy="50" r="38" fill="none" stroke="#22201E" stroke-width="2"/><path d="M50 22v12" stroke="#D94F5C" stroke-width="2.5" stroke-linecap="round"/><circle cx="50" cy="50" r="3" fill="#D94F5C"/>',
    echo: '<path d="M18 55c8-18 22-28 32-28" fill="none" stroke="#22201E" stroke-width="2" stroke-linecap="round"/><path d="M30 62c6-12 16-18 24-18" fill="none" stroke="#22201E" stroke-width="2" stroke-linecap="round"/><circle cx="72" cy="40" r="4" fill="#D94F5C"/>',
    signal: '<rect x="28" y="22" width="44" height="56" rx="4" fill="none" stroke="#22201E" stroke-width="2"/><path d="M38 40h24M38 50h24M38 60h14" stroke="#D94F5C" stroke-width="2" stroke-linecap="round"/>',
    freeze: '<rect x="24" y="24" width="52" height="52" rx="4" fill="none" stroke="#22201E" stroke-width="2"/><path d="M34 50h32" stroke="#D94F5C" stroke-width="2" stroke-linecap="round"/>',
    keep: '<path d="M30 28h40v48H30z" fill="none" stroke="#22201E" stroke-width="2"/><path d="M38 40h24M38 50h24M38 60h16" stroke="#22201E" stroke-width="2" stroke-linecap="round"/><circle cx="68" cy="66" r="8" fill="none" stroke="#D94F5C" stroke-width="2"/>',
    make: '<circle cx="36" cy="40" r="10" fill="none" stroke="#22201E" stroke-width="2"/><rect x="52" y="32" width="24" height="24" rx="3" fill="none" stroke="#D94F5C" stroke-width="2"/><path d="M24 72c8-10 44-10 52 0" fill="none" stroke="#22201E" stroke-width="2"/>',
    scatter: '<circle cx="26" cy="34" r="3.5" fill="#22201E"/><circle cx="50" cy="26" r="3.5" fill="#22201E"/><circle cx="74" cy="40" r="3.5" fill="#22201E"/><circle cx="38" cy="58" r="3.5" fill="#D94F5C"/><circle cx="62" cy="70" r="3.5" fill="#22201E"/><circle cx="48" cy="44" r="3.5" fill="#22201E"/>',
    f7: '<rect x="18" y="30" width="64" height="44" rx="4" fill="none" stroke="#22201E" stroke-width="2"/><path d="M18 42h64" stroke="#22201E" stroke-width="2"/><path d="M28 30v-6h44v6" stroke="#D94F5C" stroke-width="2"/>',
    end: '<circle cx="50" cy="50" r="34" fill="none" stroke="#22201E" stroke-width="2" stroke-dasharray="5 9"/><circle cx="50" cy="50" r="7" fill="#D94F5C"/>'
  };
  return '<svg viewBox="0 0 100 100" aria-hidden="true">' + (g[id] || g.cover) + '</svg>';
}

function buildMeter() {
  meterTrack.innerHTML = CHAPTERS.map(function () {
    return '<span class="meter-seg"></span>';
  }).join('');
}

function render(i) {
  const ch = CHAPTERS[i];
  const isCover = ch.id === 'cover';
  const isEnd = !!ch.end;
  const titleHtml = ch.title.replace(/\n/g, '<br>');

  scene.innerHTML =
    '<article class="chapter active" data-id="' + ch.id + '">' +
      '<div class="glyph">' + glyphSvg(ch.id) + '</div>' +
      '<div class="day-kicker">' + ch.day + ' · ' + ch.kicker + '</div>' +
      '<h1>' + titleHtml + '</h1>' +
      ch.paragraphs.map(function (p) { return '<p class="lead">' + p + '</p>'; }).join('') +
      (ch.aside ? '<div class="aside">' + ch.aside + '</div>' : '') +
      (isEnd
        ? '<div class="stat-row" aria-hidden="true">' +
            '<div class="stat"><b>日韩停更</b><span>预警在前</span></div>' +
            '<div class="stat"><b>国服停更</b><span>剧本合上</span></div>' +
            '<div class="stat"><b>玩家续写</b><span>持续至今</span></div>' +
          '</div>' +
          '<div class="end-row">' +
            '<a class="btn-primary" href="/">逛逛同人周边</a>' +
            '<a class="btn-ghost" href="/contact.html">了解 f7goods</a>' +
          '</div>'
        : '') +
      (isCover
        ? '<p class="hint">点击任意处，或按 <kbd>空格</kbd> / <kbd>→</kbd> 推进</p>'
        : '') +
    '</article>';

  if (isCover) {
    meter.hidden = true;
    skipBtn.hidden = true;
  } else {
    meter.hidden = false;
    skipBtn.hidden = false;
    meterLabel.textContent = ch.day;
    Array.prototype.forEach.call(meterTrack.children, function (seg, si) {
      seg.classList.toggle('done', si + 1 < i);
      seg.classList.toggle('now', si + 1 === i);
    });
  }

  prevBtn.disabled = i === 0;
  nextBtn.textContent = ch.nextLabel || '下一步';

  if (isEnd) {
    nextBtn.onclick = function () { location.href = '/'; };
    footHint.textContent = '断更之后，故事仍在继续';
  } else {
    nextBtn.onclick = function () { go(1); };
    footHint.textContent = isCover ? '点击开始' : '点击画面或按钮继续';
  }
}

function go(delta) {
  const next = index + delta;
  if (next < 0 || next >= CHAPTERS.length) return;
  index = next;
  render(index);
}

buildMeter();
render(0);

document.getElementById('scene').addEventListener('click', function (e) {
  if (e.target.closest('a, button')) return;
  if (index >= CHAPTERS.length - 1) return;
  go(1);
});

prevBtn.addEventListener('click', function (e) {
  e.stopPropagation();
  go(-1);
});

skipBtn.addEventListener('click', function (e) {
  e.stopPropagation();
  index = CHAPTERS.length - 1;
  render(index);
});

window.addEventListener('keydown', function (e) {
  if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
    if (e.target.closest('a, button, input, textarea')) return;
    e.preventDefault();
    if (index < CHAPTERS.length - 1) go(1);
    else location.href = '/';
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    go(-1);
  } else if (e.key === 'Escape') {
    location.href = '/';
  }
});

let touchX = null;
window.addEventListener('touchstart', function (e) {
  touchX = e.changedTouches[0].clientX;
}, { passive: true });

window.addEventListener('touchend', function (e) {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) < 48) return;
  if (dx < 0 && index < CHAPTERS.length - 1) go(1);
  if (dx > 0) go(-1);
}, { passive: true });
