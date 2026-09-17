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
   * 照片墙散落
   * - 手机：图更大、数量略少、叠压更明显
   * - 电脑：左右也可叠（放宽横向抖动 + 允许盖过相邻格）
   * - 仍夹在安全区内，不整体溢出屏幕
   */
  function scatterPhotoWall(works) {
    var items = [];
    if (!works.length) return items;

    var isNarrow = typeof window !== 'undefined' && window.innerWidth < 640;
    var padX = isNarrow ? 0.02 : 0.03;
    var padY = isNarrow ? 0.05 : 0.05;
    var minX = padX, maxX = 1 - padX;
    var minY = padY, maxY = 0.88;
    var usableW = maxX - minX;
    var usableH = maxY - minY;

    // 数量：手机少而大，电脑适中
    var n = Math.min(works.length, isNarrow ? 9 : 12);
    var cols = isNarrow
      ? (n <= 4 ? 2 : 3)
      : (n <= 4 ? 2 : n <= 8 ? 3 : 4);
    var rows = Math.ceil(n / cols);
    var cellW = usableW / cols;
    var cellH = usableH / rows;

    // 基准宽度：故意大于格子，制造左右/上下叠压
    // 手机约屏宽 34%–48%；电脑约 22%–32%
    var baseW = isNarrow
      ? usableW * rand(0.40, 0.55) / cols * cols * 0.55 // 见下方再算
      : 0;
    if (isNarrow) {
      // 每张约占半屏多一点，两列会自然左右叠
      baseW = rand(0.34, 0.48);
    } else {
      // 比单格更宽，邻列会重叠
      baseW = cellW * rand(1.05, 1.35);
    }

    for (var i = 0; i < n; i++) {
      var work = works[i];
      var col = i % cols;
      var row = Math.floor(i / cols);

      // 角度
      var r = Math.random() < 0.72
        ? rand(-14, 14)
        : (Math.random() < 0.5 ? rand(-24, -14) : rand(14, 24));

      var ratio = work.ratio || 1.25;
      var w = baseW * rand(0.88, 1.12);
      var h = w * ratio;
      if (isNarrow && h > 0.42) { h = 0.42; w = h / ratio; }
      if (!isNarrow && h > 0.40) { h = 0.40; w = h / ratio; }

      // 旋转包络下，最大允许尺寸（以安全区为准，不限死在格子里）
      var k = rotBleed(r);
      var maxW = usableW * 0.98;
      var maxH = usableH * 0.98;
      if (w * k > maxW) { var s1 = maxW / (w * k); w *= s1; h *= s1; }
      if (h * k > maxH) { var s2 = maxH / (h * k); w *= s2; h *= s2; }

      // 格心 + 大幅抖动：横向抖动可跨过相邻列 → 左右也叠
      var jx = isNarrow ? cellW * 0.42 : cellW * 0.48;
      var jy = isNarrow ? cellH * 0.35 : cellH * 0.40;
      var cx = minX + cellW * (col + 0.5) + rand(-jx, jx);
      var cy = minY + cellH * (row + 0.5) + rand(-jy, jy);
      // 偶尔整张偏出格心，更「乱」一点
      if (Math.random() < 0.35) {
        cx += rand(-cellW * 0.35, cellW * 0.35);
        cy += rand(-cellH * 0.3, cellH * 0.3);
      }

      // 夹在安全区：保证不溢出屏幕（叠是可以的）
      var hw = (w * k) / 2;
      var hh = (h * k) / 2;
      var ccx = Math.min(maxX - hw, Math.max(minX + hw, cx));
      var ccy = Math.min(maxY - hh, Math.max(minY + hh, cy));
      var nx = ccx - w / 2;
      var ny = ccy - h / 2;

      items.push({
        x: nx,
        y: ny,
        w: w,
        h: h,
        r: r,
        z: 6 + i + Math.floor(Math.random() * 3),
        workId: work.id,
        delay: (i * 0.028 + Math.random() * 0.04).toFixed(3)
      });
    }

    items.sort(function (a, b) { return a.z - b.z; });
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

    const count = WORKS.length <= 4 ? WORKS.length : (window.innerWidth < 640 ? 9 : 12);
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
