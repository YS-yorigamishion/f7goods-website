/**
 * f7goods 周边照片墙
 * - 数据来自 /api/works（需有封面）
 * - 点击 → /work-detail.html?id=
 * - 刷新优先换未展示过的周边；每批保证 MIN–MAX 数量
 */
(function () {
  const MIN_ON_WALL = 16;
  const MAX_ON_WALL = 22;

  let WORKS = [];
  const state = {
    shownIds: new Set(),
    current: [],
    layout: [],
    busy: false
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

  function scatterPhotoWall(count) {
    const items = [];
    const rects = [];
    const avoid = [
      { x: 0.02, y: 0.02, w: 0.30, h: 0.13 },
      { x: 0.54, y: 0.85, w: 0.43, h: 0.13 }
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

    for (let i = 0; i < count; i++) {
      // 相框略放大，全图更清楚
      const roll = Math.random() + (i < 4 ? -0.08 : 0);
      let w;
      if (roll < 0.16) w = rand(0.095, 0.115);
      else if (roll < 0.58) w = rand(0.12, 0.155);
      else w = rand(0.155, 0.20);
      const h = w * rand(1.18, 1.42);

      let best =
        tryPlace(w, h, 0.22, 36) ||
        tryPlace(w, h, 0.35, 28) ||
        tryPlace(w, h, 0.55, 20);

      if (!best) {
        let nx = rand(0.03, 0.9 - w);
        let ny = rand(0.06, 0.88 - h);
        for (let k = 0; k < 12; k++) {
          const tx = rand(0.03, 0.9 - w);
          const ty = rand(0.06, 0.88 - h);
          if (!inAvoid(tx, ty, w, h)) { nx = tx; ny = ty; break; }
        }
        best = { x: nx, y: ny, w, h, ov: 0.4 };
      }

      const r = Math.random() < 0.72
        ? rand(-16, 16)
        : (Math.random() < 0.5 ? rand(-26, -16) : rand(16, 26));

      const z = 6 + i + Math.floor(Math.random() * 4);
      rects.push({ x: best.x, y: best.y, w: best.w, h: best.h });
      items.push({
        x: best.x,
        y: best.y,
        w: best.w,
        h: best.h,
        r,
        z,
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

    const mixed = shuffle(layout.map((pos, i) => ({
      pos,
      work: works[i % works.length]
    })));

    wall.innerHTML = mixed.map(item => {
      const p = item.pos;
      const w = item.work;
      return (
        '<a class="pw-shot" href="' + detailHref(w.id) + '"' +
        ' style="left:' + (p.x * 100).toFixed(2) + '%;' +
        ' top:' + (p.y * 100).toFixed(2) + '%;' +
        ' width:' + (p.w * 100).toFixed(2) + '%;' +
        ' height:' + (p.h * 100).toFixed(2) + '%;' +
        ' z-index:' + p.z + ';' +
        ' --rot:rotate(' + p.r.toFixed(1) + 'deg);' +
        ' --delay:' + p.delay + 's;' +
        ' transform:rotate(' + p.r.toFixed(1) + 'deg);"' +
        ' aria-label="' + escapeHtml(w.title) + ' — 查看周边详情">' +
        '<div class="frame"><img src="' + escapeHtml(w.image) + '" alt="' + escapeHtml(w.title) + '" loading="lazy"></div>' +
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
    if (state.busy || !WORKS.length) return;
    state.busy = true;

    const btn = document.getElementById('pwRefresh');
    if (btn) {
      btn.classList.add('spinning');
      setTimeout(function () { btn.classList.remove('spinning'); }, 480);
    }

    const count = targetCount();
    const works = pickWorks(count);
    const layout = scatterPhotoWall(count);

    state.current = works;
    state.layout = layout;
    render();
    updateCount();
    setTimeout(function () { state.busy = false; }, 280);
  }

  function mapApiWorks(list) {
    return (list || [])
      .filter(w => w && w.id && Array.isArray(w.images) && w.images[0])
      .map(w => ({
        id: w.id,
        title: w.title || '周边',
        price: w.price || '',
        image: w.images[0],
        circle: ''
      }));
  }

  async function loadWorks() {
    try {
      if (typeof F7API !== 'undefined' && F7API.getWorks) {
        const data = await F7API.getWorks();
        const list = Array.isArray(data) ? data : (data && data.items) || [];
        WORKS = mapApiWorks(list);
      }
    } catch (e) {
      WORKS = [];
    }
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
        if (!state.layout.length) return;
        state.layout = scatterPhotoWall(state.layout.length);
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
