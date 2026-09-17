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
   * - 每张图「被盖住的面积」≤ 20%
   * - 手机图更大、可叠；电脑左右也可叠
   * - 不整体溢出屏幕
   */
  function scatterPhotoWall(works) {
    var items = [];
    var covers = []; // 与 items 同步：每张图当前被挡比例
    if (!works.length) return items;

    var MAX_COVER = 0.2;
    var isNarrow = typeof window !== 'undefined' && window.innerWidth < 640;
    var padX = isNarrow ? 0.02 : 0.03;
    var padY = 0.05;
    var minX = padX, maxX = 1 - padX;
    var minY = padY, maxY = 0.88;
    var usableW = maxX - minX;
    var usableH = maxY - minY;

    var n = Math.min(works.length, isNarrow ? 9 : 12);
    var cols = isNarrow
      ? (n <= 4 ? 2 : 3)
      : (n <= 4 ? 2 : n <= 8 ? 3 : 4);
    var rows = Math.ceil(n / cols);
    var cellW = usableW / cols;
    var cellH = usableH / rows;

    var baseW;
    if (isNarrow) {
      baseW = rand(0.34, 0.46);
    } else {
      // 电脑端：约原尺寸的 1/2
      baseW = cellW * rand(1.0, 1.28) * 0.5;
    }

    function interArea(ax, ay, aw, ah, bx, by, bw, bh) {
      var ix = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
      var iy = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
      return ix * iy;
    }

    /**
     * 若把新图放在 (nx,ny,w,h) 且 z 高于已有点：
     * 已有点被挡增量 = inter / 旧面积；新图被挡 = 与更高 z 的交叠（当前 z 最大则为 0）
     * 返回 null = 合法；否则返回原因
     */
    function coverOk(nx, ny, w, h, newZ) {
      var areaNew = Math.max(w * h, 1e-6);
      var newCover = 0;
      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        var inter = interArea(nx, ny, w, h, it.x, it.y, it.w, it.h);
        if (inter <= 0) continue;
        var areaOld = Math.max(it.w * it.h, 1e-6);
        if (newZ > it.z) {
          // 盖在旧图上：旧图被挡增加
          var add = inter / areaOld;
          if (covers[j] + add > MAX_COVER + 0.001) return false;
        } else if (it.z > newZ) {
          // 旧图盖在新图上：新图被挡
          newCover += inter / areaNew;
          if (newCover > MAX_COVER + 0.001) return false;
        }
      }
      return true;
    }

    /** 合法落点时，登记被挡增量 */
    function commitCover(nx, ny, w, h, newZ, idx) {
      var areaNew = Math.max(w * h, 1e-6);
      var newCover = 0;
      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        var inter = interArea(nx, ny, w, h, it.x, it.y, it.w, it.h);
        if (inter <= 0) continue;
        var areaOld = Math.max(it.w * it.h, 1e-6);
        if (newZ > it.z) {
          covers[j] += inter / areaOld;
        } else if (it.z > newZ) {
          newCover += inter / areaNew;
        }
      }
      covers[idx] = newCover;
    }

    for (var i = 0; i < n; i++) {
      var work = works[i];
      var col = i % cols;
      var row = Math.floor(i / cols);

      // z：后画略靠前，保证叠放层次；commit 时按真实 z 算被挡
      var z = 6 + i + Math.floor(Math.random() * 2);

      var r = Math.random() < 0.72
        ? rand(-14, 14)
        : (Math.random() < 0.5 ? rand(-24, -14) : rand(14, 24));

      var ratio = work.ratio || 1.25;
      var w0 = baseW * rand(0.88, 1.1);
      var h0 = w0 * ratio;
      if (isNarrow && h0 > 0.40) { h0 = 0.40; w0 = h0 / ratio; }
      if (!isNarrow && h0 > 0.20) { h0 = 0.20; w0 = h0 / ratio; }

      var k = rotBleed(r);
      if (w0 * k > usableW * 0.98) { var s1 = (usableW * 0.98) / (w0 * k); w0 *= s1; h0 *= s1; }
      if (h0 * k > usableH * 0.98) { var s2 = (usableH * 0.98) / (h0 * k); w0 *= s2; h0 *= s2; }

      var jx = isNarrow ? cellW * 0.4 : cellW * 0.46;
      var jy = isNarrow ? cellH * 0.32 : cellH * 0.38;

      var placed = null;
      var scaleSeq = [1, 0.95, 0.9, 0.85, 0.8, 0.72, 0.65];

      for (var si = 0; si < scaleSeq.length && !placed; si++) {
        var sc = scaleSeq[si];
        var w = w0 * sc;
        var h = h0 * sc;
        var hw0 = (w * k) / 2;
        var hh0 = (h * k) / 2;
        if (minX + hw0 > maxX - hw0 || minY + hh0 > maxY - hh0) continue;

        for (var a = 0; a < 36 && !placed; a++) {
          var cx = minX + cellW * (col + 0.5) + rand(-jx, jx);
          var cy = minY + cellH * (row + 0.5) + rand(-jy, jy);
          if (Math.random() < 0.3) {
            cx += rand(-cellW * 0.3, cellW * 0.3);
            cy += rand(-cellH * 0.25, cellH * 0.25);
          }
          var ccx = Math.min(maxX - hw0, Math.max(minX + hw0, cx));
          var ccy = Math.min(maxY - hh0, Math.max(minY + hh0, cy));
          var nx = ccx - w / 2;
          var ny = ccy - h / 2;

          if (!coverOk(nx, ny, w, h, z)) continue;

          var idx = items.length;
          var rec = {
            x: nx,
            y: ny,
            w: w,
            h: h,
            r: r,
            z: z,
            workId: work.id,
            delay: (i * 0.028 + Math.random() * 0.04).toFixed(3)
          };
          items.push(rec);
          covers.push(0);
          commitCover(nx, ny, w, h, z, idx);
          placed = rec;
        }
      }

      // 仍放不下：再试全局随机小图，被挡仍 ≤20%
      if (!placed) {
        for (var b = 0; b < 40 && !placed; b++) {
          var rw = (isNarrow ? 0.28 : 0.09) * rand(0.75, 1);
          var rh = rw * ratio;
          var kk = rotBleed(r);
          var hx = (rw * kk) / 2, hy = (rh * kk) / 2;
          var mx = Math.min(maxX - hx, Math.max(minX + hx, rand(minX + hx, maxX - hx)));
          var my = Math.min(maxY - hy, Math.max(minY + hy, rand(minY + hy, maxY - hy)));
          var nx2 = mx - rw / 2, ny2 = my - rh / 2;
          if (!coverOk(nx2, ny2, rw, rh, z)) continue;
          var idx2 = items.length;
          items.push({
            x: nx2, y: ny2, w: rw, h: rh, r: r, z: z,
            workId: work.id,
            delay: (i * 0.028 + Math.random() * 0.04).toFixed(3)
          });
          covers.push(0);
          commitCover(nx2, ny2, rw, rh, z, idx2);
          placed = items[items.length - 1];
        }
      }
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
