/**
 * f7goods 周边照片墙
 * - 相框贴图，白边薄
 * - 不溢出屏幕；叠压尽量轻，但保证有图可看
 * - 点击 → /work-detail.html?id=
 */
(function () {
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

  function pickWorks(count) {
    const pool = WORKS.filter(function (w) { return w && w.image; });
    if (!pool.length || count <= 0) return [];

    const unseen = shuffle(pool.filter(function (w) { return !state.shownIds.has(w.id); }));
    const seen = shuffle(pool.filter(function (w) { return state.shownIds.has(w.id); }));

    let picked = unseen.slice();
    if (picked.length < count) {
      picked = picked.concat(seen.filter(function (w) { return picked.indexOf(w) === -1; }));
    }
    if (picked.length < count) {
      const bag = shuffle(pool);
      while (picked.length < count) {
        picked.push(bag[picked.length % bag.length]);
      }
    } else if (picked.length > count) {
      picked = picked.slice(0, count);
    }

    picked.forEach(function (w) { state.shownIds.add(w.id); });
    return picked;
  }

  function rotBleed(deg) {
    const rad = Math.abs(deg) * Math.PI / 180;
    return Math.cos(rad) + Math.sin(rad);
  }

  /**
   * 网格式散落：把安全区分成格子，每格中心随机抖动。
   * 保证每张图都有位置，最多轻叠，绝不整页空白。
   */
  function scatterPhotoWall(works) {
    const items = [];
    if (!works.length) return items;

    const isNarrow = typeof window !== 'undefined' && window.innerWidth < 640;
    // 安全区：避开文案与底部按钮，四周不贴边
    const minX = 0.04, maxX = 0.96;
    const minY = 0.08, maxY = 0.86;
    const usableW = maxX - minX;
    const usableH = maxY - minY;

    // 按数量选网格，保证塞得下
    const n = Math.min(works.length, isNarrow ? 10 : 12);
    const cols = n <= 4 ? 2 : n <= 6 ? 3 : n <= 9 ? 3 : 4;
    const rows = Math.ceil(n / cols);

    // 单元尺寸
    const cellW = usableW / cols;
    const cellH = usableH / rows;

    // 每张图目标宽度：略小于格宽，留出呼吸
    const baseW = cellW * rand(0.72, 0.92);

    for (let i = 0; i < n; i++) {
      const work = works[i];
      const col = i % cols;
      const row = Math.floor(i / cols);

      const r = Math.random() < 0.78
        ? rand(-11, 11)
        : (Math.random() < 0.5 ? rand(-18, -11) : rand(11, 18));

      const ratio = work.ratio || 1.25;
      let w = baseW * rand(0.88, 1.08);
      let h = w * ratio;

      // 旋转后包围盒不得超出单元太多，也不得超出安全区
      const k = rotBleed(r);
      const maxCellW = cellW * 0.95;
      const maxCellH = cellH * 0.95;
      if (w * k > maxCellW) {
        const s = maxCellW / (w * k);
        w *= s; h *= s;
      }
      if (h * k > maxCellH) {
        const s = maxCellH / (h * k);
        w *= s; h *= s;
      }

      // 格心 + 抖动
      const cx = minX + cellW * (col + 0.5) + rand(-cellW * 0.12, cellW * 0.12);
      const cy = minY + cellH * (row + 0.5) + rand(-cellH * 0.12, cellH * 0.12);

      // 用旋转包围盒夹紧，保证整张在屏内
      const hw = (w * k) / 2;
      const hh = (h * k) / 2;
      const ccx = Math.min(maxX - hw, Math.max(minX + hw, cx));
      const ccy = Math.min(maxY - hh, Math.max(minY + hh, cy));

      const nx = ccx - w / 2;
      const ny = ccy - h / 2;

      items.push({
        x: nx,
        y: ny,
        w: w,
        h: h,
        r: r,
        z: 6 + row * cols + col + Math.floor(Math.random() * 2),
        workId: work.id,
        delay: (i * 0.028 + Math.random() * 0.04).toFixed(3)
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

    if (!works.length) {
      wall.innerHTML = '<div class="pw-empty">暂无可展示的周边</div>';
      return;
    }
    if (!layout.length) {
      // 极端兜底：至少摆第一张
      const w0 = works[0];
      wall.innerHTML =
        '<a class="pw-shot" href="' + detailHref(w0.id) + '"' +
        ' style="left:28%;top:28%;width:28%;z-index:6;transform:rotate(-4deg);">' +
        '<img src="' + escapeHtml(w0.image) + '" alt="' + escapeHtml(w0.title) + '">' +
        '</a>';
      return;
    }

    const byId = {};
    works.forEach(function (w) { byId[w.id] = w; });

    wall.innerHTML = layout.map(function (p) {
      const w = byId[p.workId] || works[0];
      if (!w) return '';
      return (
        '<a class="pw-shot" href="' + detailHref(w.id) + '"' +
        ' style="left:' + (p.x * 100).toFixed(2) + '%;' +
        ' top:' + (p.y * 100).toFixed(2) + '%;' +
        ' width:' + (p.w * 100).toFixed(2) + '%;' +
        ' z-index:' + p.z + ';' +
        ' --rot:rotate(' + Number(p.r).toFixed(1) + 'deg);' +
        ' --delay:' + p.delay + 's;' +
        ' transform:rotate(' + Number(p.r).toFixed(1) + 'deg);"' +
        ' aria-label="' + escapeHtml(w.title) + '">' +
        '<img src="' + escapeHtml(w.image) + '" alt="' + escapeHtml(w.title) + '" loading="lazy"' +
        (w.nw ? ' width="' + w.nw + '"' : '') +
        (w.nh ? ' height="' + w.nh + '"' : '') +
        '>' +
        '</a>'
      );
    }).join('');
  }

  function updateCount() {
    const el = document.getElementById('pwCount');
    if (!el) return;
    const remain = Math.max(0, WORKS.length - state.shownIds.size);
    el.textContent = remain > 0
      ? '本墙 ' + state.layout.length + ' 张 · 未展示 ' + remain
      : '本墙 ' + state.layout.length + ' 张 · 已全部上过';
  }

  function refreshWall() {
    if (state.busy || !state.ready) return;
    state.busy = true;

    const btn = document.getElementById('pwRefresh');
    if (btn) {
      btn.classList.add('spinning');
      setTimeout(function () { btn.classList.remove('spinning'); }, 480);
    }

    const count = WORKS.length <= 6 ? WORKS.length : (window.innerWidth < 640 ? 8 : 10);
    const works = pickWorks(Math.max(count, 1));
    const layout = scatterPhotoWall(works);

    state.current = works;
    state.layout = layout;
    render();
    updateCount();
    setTimeout(function () { state.busy = false; }, 220);
  }

  function probeImage(src) {
    return new Promise(function (resolve) {
      const img = new Image();
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        resolve({ nw: 400, nh: 500, ratio: 1.25 });
      }, 4000);
      img.onload = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({
          nw: img.naturalWidth || 400,
          nh: img.naturalHeight || 500,
          ratio: (img.naturalHeight || 500) / (img.naturalWidth || 400)
        });
      };
      img.onerror = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ nw: 400, nh: 500, ratio: 1.25 });
      };
      img.src = src;
    });
  }

  async function enrichWorks(list) {
    return Promise.all(list.map(function (w) {
      return probeImage(w.image).then(function (meta) {
        return Object.assign({}, w, meta);
      });
    }));
  }

  function mapApiWorks(list) {
    return (list || [])
      .filter(function (w) { return w && w.id && Array.isArray(w.images) && w.images[0]; })
      .map(function (w) {
        return {
          id: w.id,
          title: w.title || '周边',
          price: w.price || '',
          image: w.images[0],
          ratio: 1.25,
          nw: 400,
          nh: 500
        };
      });
  }

  async function loadWorks() {
    var list = [];
    try {
      if (typeof F7API !== 'undefined' && F7API.getWorks) {
        var data = await F7API.getWorks();
        list = Array.isArray(data) ? data : ((data && data.items) || []);
      }
    } catch (e) {
      list = [];
    }

    WORKS = mapApiWorks(list);
    if (WORKS.length) {
      try {
        WORKS = await enrichWorks(WORKS);
      } catch (e) {
        // 保留未 probe 的数据，也要能展示
      }
    }

    // API 失败时用公开 uploads 兜底，避免空白墙
    if (!WORKS.length) {
      WORKS = [
        { id: 'w1785585980921k4h69', title: '安托涅瓦', image: '/uploads/006antuoniewa1.png', ratio: 1.25, nw: 400, nh: 500 },
        { id: 'w1785585980921k4h70', title: '安托涅瓦', image: '/uploads/006antuoniewa2.png', ratio: 1.25, nw: 400, nh: 500 },
        { id: 'w1785524299488', title: '珈儿', image: '/uploads/006jiaer.png', ratio: 1.25, nw: 400, nh: 500 }
      ];
    }

    state.ready = true;
    refreshWall();
  }

  function init() {
    const btn = document.getElementById('pwRefresh');
    if (btn) btn.addEventListener('click', refreshWall);
    loadWorks();

    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        if (!state.current.length) return;
        state.layout = scatterPhotoWall(state.current);
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
