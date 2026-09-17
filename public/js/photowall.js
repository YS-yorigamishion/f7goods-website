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
    // 每批目标数量：够用即可，避免为凑数而重叠
    return Math.floor(rand(10, 15));
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

  /** 旋转后包围盒相对轴对齐盒的放大系数 */
  function rotBleed(deg) {
    const rad = Math.abs(deg) * Math.PI / 180;
    return {
      kx: Math.cos(rad) + Math.sin(rad),
      ky: Math.cos(rad) + Math.sin(rad)
    };
  }

  /** 把 w,h 缩到旋转后仍完全落在安全区内 */
  function fitWithin(w, h, deg, pad) {
    const { kx, ky } = rotBleed(deg);
    const maxW = 1 - pad.x * 2;
    const maxH = 1 - pad.y * 2;
    // 旋转包围盒：w'≈w*kx, h'≈h*ky（近似，对 |deg|≤30° 够用）
    let scale = 1;
    if (w * kx > maxW) scale = Math.min(scale, maxW / (w * kx));
    if (h * ky > maxH) scale = Math.min(scale, maxH / (h * ky));
    if (scale < 1) {
      w *= scale;
      h *= scale;
    }
    // 仍过高（长图）再压高，保持比例
    if (h * ky > maxH) {
      const s2 = maxH / (h * ky);
      w *= s2;
      h *= s2;
    }
    return { w, h };
  }

  /**
   * 照片墙散落：每张先定宽度，再按图片比例算高度；
   * 旋转后的盒子不得溢出屏幕；优先轻叠，避免被盖太狠。
   */
  function scatterPhotoWall(works, count) {
    const items = [];
    const rects = [];
    const pad = { x: 0.03, y: 0.05 };
    const avoid = [
      { x: 0.02, y: 0.02, w: 0.32, h: 0.13 },
      { x: 0.52, y: 0.84, w: 0.45, h: 0.14 },
      { x: 0.28, y: 0.90, w: 0.44, h: 0.08 }
    ];

    function inAvoid(nx, ny, nw, nh) {
      return avoid.some(a =>
        nx < a.x + a.w && nx + nw > a.x && ny < a.y + a.h && ny + nh > a.y
      );
    }

    function overlapRatio(nx, ny, nw, nh) {
      let maxR = 0;
      let sumR = 0;
      let hits = 0;
      for (const r of rects) {
        const ix = Math.max(0, Math.min(nx + nw, r.x + r.w) - Math.max(nx, r.x));
        const iy = Math.max(0, Math.min(ny + nh, r.y + r.h) - Math.max(ny, r.y));
        const inter = ix * iy;
        if (inter <= 0) continue;
        const area = Math.min(nw * nh, r.w * r.h);
        const ratio = inter / Math.max(area, 0.0001);
        maxR = Math.max(maxR, ratio);
        sumR += ratio;
        hits += 1;
      }
      return { maxR, avgR: hits ? sumR / hits : 0, hits };
    }

    /** 在安全区内落点；优先几乎不叠的位置 */
    function tryPlace(w, h, deg, maxOv, attempts) {
      const { kx, ky } = rotBleed(deg);
      const hw = (w * kx) / 2;
      const hh = (h * ky) / 2;
      let best = null;
      let bestScore = -Infinity;
      for (let a = 0; a < attempts; a++) {
        const cx = 0.5 + (Math.random() + Math.random() - 1) * 0.42;
        const cy = 0.5 + (Math.random() + Math.random() - 1) * 0.4;
        const cxMin = pad.x + hw;
        const cxMax = 1 - pad.x - hw;
        const cyMin = pad.y + hh;
        const cyMax = 1 - pad.y - hh;
        if (cxMin > cxMax || cyMin > cyMax) continue;
        const ccx = Math.min(cxMax, Math.max(cxMin, cx));
        const ccy = Math.min(cyMax, Math.max(cyMin, cy));
        const nx = ccx - w / 2;
        const ny = ccy - h / 2;
        if (nx < pad.x - 0.01 || ny < pad.y - 0.01 ||
            nx + w > 1 - pad.x + 0.01 || ny + h > 1 - pad.y + 0.01) continue;
        if (inAvoid(nx, ny, w, h)) continue;

        const ov = overlapRatio(nx, ny, w, h);
        if (ov.maxR > maxOv) continue;

        // 强烈惩罚叠压：最大重叠权重高，均叠也扣分
        const score =
          1.0
          - ov.maxR * 4.5
          - ov.avgR * 1.8
          - ov.hits * 0.04
          + Math.random() * 0.06;

        if (score > bestScore) {
          bestScore = score;
          best = { x: nx, y: ny, w, h, ov: ov.maxR };
        }
      }
      return best;
    }

    const isNarrow = typeof window !== 'undefined' && window.innerWidth < 640;
    // 展示密度：宁可稍少，也不让图被盖死
    const target = Math.min(count, isNarrow ? 12 : 14, Math.max(works.length, 6));
    const n = Math.min(target, works.length);

    for (let i = 0; i < n; i++) {
      const work = works[i];
      const r = Math.random() < 0.75
        ? rand(-12, 12)
        : (Math.random() < 0.5 ? rand(-20, -12) : rand(12, 20));

      let w = pickWidth(i);
      if (isNarrow) w *= 0.82;
      const ratio = work.ratio || 1.25;
      let h = w * ratio;
      if (h > 0.36) h = 0.36;
      w = h / ratio;

      const fitted = fitWithin(w, h, r, pad);
      w = fitted.w;
      h = fitted.h;

      // 叠压上限逐步放宽，但起手就很严，尽量找空位
      let best =
        tryPlace(w, h, r, 0.04, 48) ||
        tryPlace(w, h, r, 0.08, 40) ||
        tryPlace(w, h, r, 0.14, 32) ||
        tryPlace(w, h, r, 0.22, 24);

      if (!best) {
        // 缩小后再找，而不是硬叠上去
        for (let s = 0.88; s >= 0.5 && !best; s -= 0.08) {
          const sw = w * s;
          const sh = h * s;
          best = tryPlace(sw, sh, r, 0.12, 36) || tryPlace(sw, sh, r, 0.2, 24);
          if (best) { w = sw; h = sh; }
        }
      }

      if (!best) {
        // 实在放不下：跳过这张，留给下一批，避免硬盖
        continue;
      }

      const z = 6 + i + Math.floor(Math.random() * 2);
      rects.push({ x: best.x, y: best.y, w: best.w, h: best.h });
      items.push({
        x: best.x,
        y: best.y,
        w: best.w,
        h: best.h,
        r,
        z,
        workId: work.id,
        delay: (i * 0.025 + Math.random() * 0.03).toFixed(3)
      });
    }

    // 若因避让跳过导致过少，用更小的图补位
    if (items.length < Math.min(8, works.length) && works.length) {
      const placed = new Set(items.map(it => it.workId));
      const fill = works.filter(w => !placed.has(w.id)).concat(works);
      for (let j = 0; j < fill.length && items.length < 10; j++) {
        const work = fill[j];
        const r = rand(-10, 10);
        let w = rand(0.09, 0.12);
        if (isNarrow) w *= 0.85;
        const ratio = work.ratio || 1.25;
        let h = Math.min(w * ratio, 0.22);
        w = h / ratio;
        const fitted = fitWithin(w, h, r, pad);
        const best = tryPlace(fitted.w, fitted.h, r, 0.1, 40) ||
          tryPlace(fitted.w * 0.8, fitted.h * 0.8, r, 0.16, 30);
        if (!best) continue;
        const z = 6 + items.length;
        rects.push({ x: best.x, y: best.y, w: best.w, h: best.h });
        items.push({
          x: best.x,
          y: best.y,
          w: best.w,
          h: best.h,
          r,
          z,
          workId: work.id,
          delay: (items.length * 0.02).toFixed(3)
        });
      }
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
