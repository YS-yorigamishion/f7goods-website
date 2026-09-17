/**
 * f7goods 周边照片墙
 * - 相框贴合图片比例（白边薄包一圈，无大留白）
 * - 点击 → /work-detail.html?id=
 * - 刷新优先换未展示；每批保证数量
 */
(function () {
  const MIN_ON_WALL = 16;
  const MAX_ON_WALL = 22;
  // 显示宽度（相对视口宽），高度 = 宽 × 图片纵横比
  const W_MIN = 0.11;
  const W_MID = 0.15;
  const W_MAX = 0.20;

  let WORKS = [];
  const state = {
    shownIds: new Set(),
    current: [],
    layout: [],
    busy: false,
    ready: false
  };

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function targetCount() {
    return Math.floor(rand(MIN_ON_WALL, MAX_ON_WALL + 1));
  }

  function pickWorks(count) {
    const pool = WORKS.filter(w => w && w.image);
    if (!pool.length || count <= 0) return [];

    const unseen = shuffle(pool.filter(w => !state.shownIds.has(w.id)));
    const seen = shuffle(pool.filter(w => state.shownIds.has(w.id)));

    let picked = unseen.slice();
    if (picked.length < count) {
      picked = picked.concat(seen.filter(w => !picked.includes(w)));
    }
    if (picked.length < count) {
      const bag = shuffle(pool);
      while (picked.length < count) {
        picked.push(bag[picked.length % bag.length]);
      }
    } else if (picked.length > count) {
      picked = picked.slice(0, count);
    }

    picked.forEach(w => state.shownIds.add(w.id));
    return picked;
  }

  function pickWidth(i) {
    const roll = Math.random() + (i < 3 ? -0.06 : 0);
    if (roll < 0.2) return rand(W_MIN, W_MIN + 0.025);
    if (roll < 0.6) return rand(W_MID - 0.02, W_MID + 0.03);
    return rand(W_MAX - 0.025, W_MAX);
  }

  /**
   * 照片墙散落：每张先定宽度，再按图片比例算高度，框贴图。
   */
  function scatterPhotoWall(works, count) {
    const items = [];
    const rects = [];
    const avoid = [
      { x: 0.02, y: 0.02, w: 0.30, h: 0.12 },
      { x: 0.54, y: 0.86, w: 0.43, h: 0.12 }
    ];

    function inAvoid(nx, ny, nw, nh) {
      return avoid.some(a =>
        nx < a.x + a.w && nx + nw > a.x && ny < a.y + a.h && ny + nh > a.y
      );
    }

    function overlapRatio(nx, ny, nw, nh) {
      let maxR = 0;
      for (const r of rects) {
        const ix = Math.max(0, Math.min(nx + nw, r.x + r.w) - Math.max(nx, r.x));
        const iy = Math.max(0, Math.min(ny + nh, r.y + r.h) - Math.max(ny, r.y));
        const inter = ix * iy;
        if (inter <= 0) continue;
        const area = Math.min(nw * nh, r.w * r.h);
        maxR = Math.max(maxR, inter / Math.max(area, 0.0001));
      }
      return maxR;
    }

    function tryPlace(w, h, maxOv, attempts) {
      let best = null;
      let bestScore = -Infinity;
      for (let a = 0; a < attempts; a++) {
        const cx = 0.5 + (Math.random() + Math.random() - 1) * 0.46;
        const cy = 0.5 + (Math.random() + Math.random() - 1) * 0.46;
        const nx = Math.min(0.96 - w, Math.max(0.02, cx - w / 2));
        const ny = Math.min(0.92 - h, Math.max(0.04, cy - h / 2));
        if (inAvoid(nx, ny, w, h)) continue;
        const ov = overlapRatio(nx, ny, w, h);
        if (ov > maxOv) continue;
        const score = (1 - ov * 2.2) + Math.random() * 0.12;
        if (score > bestScore) {
          bestScore = score;
          best = { x: nx, y: ny, w, h, ov };
        }
      }
      return best;
    }

    const n = Math.min(count, works.length);
    for (let i = 0; i < n; i++) {
      const work = works[i];
      const w = pickWidth(i);
      // 图片比例；未知时用 4:5 兜底
      const ratio = work.ratio || 1.25;
      const h = Math.min(w * ratio, 0.42); // 极长图限制高度，避免一根柱子
      // 白边已含在视觉里，布局盒与显示盒一致

      let best =
        tryPlace(w, h, 0.2, 40) ||
        tryPlace(w, h, 0.32, 28) ||
        tryPlace(w, h, 0.48, 18);

      if (!best) {
        let nx = rand(0.03, 0.9 - w);
        let ny = rand(0.06, 0.88 - h);
        for (let k = 0; k < 10; k++) {
          const tx = rand(0.03, 0.9 - w);
          const ty = rand(0.06, 0.88 - h);
          if (!inAvoid(tx, ty, w, h)) { nx = tx; ny = ty; break; }
        }
        best = { x: nx, y: ny, w, h, ov: 0.35 };
      }

      const r = Math.random() < 0.72
        ? rand(-14, 14)
        : (Math.random() < 0.5 ? rand(-22, -14) : rand(14, 22));

      const z = 6 + i + Math.floor(Math.random() * 4);
      rects.push({ x: best.x, y: best.y, w: best.w, h: best.h });
      items.push({
        x: best.x,
        y: best.y,
        w: best.w,
        h: best.h,
        r,
        z,
        workId: work.id,
        delay: (i * 0.022 + Math.random() * 0.03).toFixed(3)
      });
    }
    return items;
  }

  function detailHref(id) {
    return '/work-detail.html?id=' + encodeURIComponent(id);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function render() {
    const wall = document.getElementById('pwWall');
    if (!wall) return;

    const works = state.current;
    const layout = state.layout;
    if (!works.length || !layout.length) {
      wall.innerHTML = '<div class="pw-empty">暂无可展示的周边</div>';
      return;
    }

    const byId = {};
    works.forEach(w => { byId[w.id] = w; });

    // layout 与作品一一对应（scatter 时已绑定）
    wall.innerHTML = layout.map(p => {
      const w = byId[p.workId] || works[0];
      if (!w) return '';
      return (
        '<a class="pw-shot" href="' + detailHref(w.id) + '"' +
        ' style="left:' + (p.x * 100).toFixed(2) + '%;' +
        ' top:' + (p.y * 100).toFixed(2) + '%;' +
        ' width:' + (p.w * 100).toFixed(2) + '%;' +
        ' z-index:' + p.z + ';' +
        ' --rot:rotate(' + p.r.toFixed(1) + 'deg);' +
        ' --delay:' + p.delay + 's;' +
        ' transform:rotate(' + p.r.toFixed(1) + 'deg);"' +
        ' aria-label="' + escapeHtml(w.title) + ' — 查看周边详情">' +
        '<img src="' + escapeHtml(w.image) + '" alt="' + escapeHtml(w.title) + '" loading="lazy"' +
        ' width="' + (w.nw || 400) + '" height="' + (w.nh || 500) + '">' +
        '</a>'
      );
    }).join('');
  }

  function updateCount() {
    const el = document.getElementById('pwCount');
    if (!el) return;
    const remain = Math.max(0, WORKS.length - state.shownIds.size);
    el.textContent = remain > 0
      ? '本墙 ' + state.current.length + ' 张 · 未展示 ' + remain
      : '本墙 ' + state.current.length + ' 张 · 已全部上过';
  }

  function refreshWall() {
    if (state.busy || !state.ready || !WORKS.length) return;
    state.busy = true;

    const btn = document.getElementById('pwRefresh');
    if (btn) {
      btn.classList.add('spinning');
      setTimeout(function () { btn.classList.remove('spinning'); }, 480);
    }

    const count = targetCount();
    const works = pickWorks(count);
    const layout = scatterPhotoWall(works, works.length);

    state.current = works;
    state.layout = layout;
    render();
    updateCount();
    setTimeout(function () { state.busy = false; }, 280);
  }

  function probeImage(src) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () {
        resolve({
          nw: img.naturalWidth || 400,
          nh: img.naturalHeight || 500,
          ratio: (img.naturalHeight || 500) / (img.naturalWidth || 400)
        });
      };
      img.onerror = function () {
        resolve({ nw: 400, nh: 500, ratio: 1.25 });
      };
      img.src = src;
    });
  }

  async function enrichWorks(list) {
    const withMeta = await Promise.all(list.map(async w => {
      const meta = await probeImage(w.image);
      return Object.assign({}, w, meta);
    }));
    return withMeta;
  }

  function mapApiWorks(list) {
    return (list || [])
      .filter(w => w && w.id && Array.isArray(w.images) && w.images[0])
      .map(w => ({
        id: w.id,
        title: w.title || '周边',
        price: w.price || '',
        image: w.images[0],
        ratio: 1.25,
        nw: 400,
        nh: 500
      }));
  }

  async function loadWorks() {
    try {
      if (typeof F7API !== 'undefined' && F7API.getWorks) {
        const data = await F7API.getWorks();
        const list = Array.isArray(data) ? data : (data && data.items) || [];
        WORKS = await enrichWorks(mapApiWorks(list));
      }
    } catch (e) {
      WORKS = [];
    }
    state.ready = true;
    refreshWall();
  }

  function init() {
    const btn = document.getElementById('pwRefresh');
    if (btn) btn.addEventListener('click', refreshWall);
    loadWorks();

    let t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        if (!state.current.length) return;
        state.layout = scatterPhotoWall(state.current, state.current.length);
        render();
      }, 200);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
