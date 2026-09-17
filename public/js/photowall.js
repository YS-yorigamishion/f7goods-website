/**
 * f7goods 周边照片墙
 * - 相框贴图，白边薄
 * - 每张图被叠压总面积 ≤ 20%（按旋转后保守包围盒）
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

  function rotK(deg) {
    const rad = Math.abs(deg || 0) * Math.PI / 180;
    return Math.cos(rad) + Math.sin(rad);
  }

  /**
   * 照片墙散落
   * - 每张图被盖住的面积 ≤ 20%
   * - z 严格递增，后放的一定在上层
   * - 用旋转后的保守包围盒算重叠，避免“算法说没超、肉眼却超了”
   * - 放完再校验一轮，超标则删掉盖人的那张
   */
  function scatterPhotoWall(works) {
    var items = [];
    if (!works.length) return items;

    var MAX_COVER = 0.2;
    var isNarrow = typeof window !== 'undefined' && window.innerWidth < 640;
    var padX = isNarrow ? 0.02 : 0.03;
    var padY = 0.05;
    var minX = padX, maxX = 1 - padX;
    var minY = padY, maxY = 0.88;
    var usableW = maxX - minX;
    var usableH = maxY - minY;

    var n = Math.min(works.length, isNarrow ? 9 : 16);
    var cols = isNarrow ? (n <= 4 ? 2 : 3) : 4;
    var rows = Math.ceil(n / cols);
    var cellW = usableW / cols;
    var cellH = usableH / rows;

    var baseW = isNarrow
      ? rand(0.32, 0.42)
      : cellW * rand(0.95, 1.15) * 0.5;

    function ebox(it) {
      var k = rotK(it.r);
      var ew = it.w * k;
      var eh = it.h * k;
      var cx = it.x + it.w / 2;
      var cy = it.y + it.h / 2;
      return { x: cx - ew / 2, y: cy - eh / 2, w: ew, h: eh };
    }

    function interArea(a, b) {
      var ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      var iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      return ix * iy;
    }

    /** 上层（z 更大；z 相同则索引更大 / 更后放）盖住下层的面积占比 */
    function coverOf(list, targetIdx) {
      var tb = ebox(list[targetIdx]);
      var tArea = Math.max(tb.w * tb.h, 1e-6);
      var cov = 0;
      for (var i = 0; i < list.length; i++) {
        if (i === targetIdx) continue;
        var onTop =
          list[i].z > list[targetIdx].z ||
          (list[i].z === list[targetIdx].z && i > targetIdx);
        if (!onTop) continue;
        var inter = interArea(ebox(list[i]), tb);
        if (inter > 0) cov += inter / tArea;
      }
      return cov;
    }

    function allCovers(list) {
      var out = [];
      for (var i = 0; i < list.length; i++) out.push(coverOf(list, i));
      return out;
    }

    /**
     * 候选新图（一定后放、一定在最上层）是否合法：
     * 1) 它盖住的每一张旧图，旧图总被盖 ≤20%
     * 2) 新图自己被盖为 0（在最上层）
     */
    function coverOk(cand, list) {
      var kb = ebox(cand);
      for (var j = 0; j < list.length; j++) {
        var ob = ebox(list[j]);
        var inter = interArea(kb, ob);
        if (inter <= 0) continue;
        var areaOld = Math.max(ob.w * ob.h, 1e-6);
        var cur = coverOf(list, j);
        if (cur + inter / areaOld > MAX_COVER + 0.0001) return false;
      }
      return true;
    }

    for (var i = 0; i < n; i++) {
      var work = works[i];
      var col = i % cols;
      var row = Math.floor(i / cols);

      // z 严格递增，后放的永远在上
      var z = 10 + i * 3;

      var r = Math.random() < 0.75
        ? rand(-10, 10)
        : (Math.random() < 0.5 ? rand(-18, -10) : rand(10, 18));

      var ratio = work.ratio || 1.25;
      var w0 = baseW * rand(0.9, 1.08);
      var h0 = w0 * ratio;
      if (isNarrow && h0 > 0.36) { h0 = 0.36; w0 = h0 / ratio; }
      if (!isNarrow && h0 > 0.16) { h0 = 0.16; w0 = h0 / ratio; }

      var k = rotK(r);
      if (w0 * k > usableW * 0.96) { var s1 = (usableW * 0.96) / (w0 * k); w0 *= s1; h0 *= s1; }
      if (h0 * k > usableH * 0.96) { var s2 = (usableH * 0.96) / (h0 * k); w0 *= s2; h0 *= s2; }

      var jx = isNarrow ? cellW * 0.34 : cellW * 0.38;
      var jy = isNarrow ? cellH * 0.28 : cellH * 0.3;

      var placed = null;
      var scaleSeq = [1, 0.9, 0.82, 0.74, 0.66, 0.56];

      for (var si = 0; si < scaleSeq.length && !placed; si++) {
        var sc = scaleSeq[si];
        var w = w0 * sc;
        var h = h0 * sc;
        var hw0 = (w * k) / 2;
        var hh0 = (h * k) / 2;
        if (minX + hw0 > maxX - hw0 || minY + hh0 > maxY - hh0) continue;

        for (var a = 0; a < 42 && !placed; a++) {
          var cx = minX + cellW * (col + 0.5) + rand(-jx, jx);
          var cy = minY + cellH * (row + 0.5) + rand(-jy, jy);
          if (Math.random() < 0.25) {
            cx += rand(-cellW * 0.25, cellW * 0.25);
            cy += rand(-cellH * 0.2, cellH * 0.2);
          }
          var ccx = Math.min(maxX - hw0, Math.max(minX + hw0, cx));
          var ccy = Math.min(maxY - hh0, Math.max(minY + hh0, cy));
          var nx = ccx - w / 2;
          var ny = ccy - h / 2;

          var cand = { x: nx, y: ny, w: w, h: h, r: r, z: z };
          if (!coverOk(cand, items)) continue;

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
          placed = rec;
        }
      }

      if (!placed) {
        for (var b = 0; b < 48 && !placed; b++) {
          var rw = (isNarrow ? 0.22 : 0.07) * rand(0.75, 1);
          var rh = rw * ratio;
          var kk = rotK(r);
          var hx = (rw * kk) / 2, hy = (rh * kk) / 2;
          if (minX + hx > maxX - hx || minY + hy > maxY - hy) continue;
          var mx = rand(minX + hx, maxX - hx);
          var my = rand(minY + hy, maxY - hy);
          var cand2 = { x: mx - rw / 2, y: my - rh / 2, w: rw, h: rh, r: r, z: z };
          if (!coverOk(cand2, items)) continue;
          items.push({
            x: cand2.x,
            y: cand2.y,
            w: rw,
            h: rh,
            r: r,
            z: z,
            workId: work.id,
            delay: (i * 0.028 + Math.random() * 0.04).toFixed(3)
          });
          placed = items[items.length - 1];
        }
      }
    }

    // 收尾：按绘制规则重算被盖，删掉导致超标的上层图
    for (var guard = 0; guard < 50; guard++) {
      var covs = allCovers(items);
      var bad = -1;
      var worst = 0;
      for (var t = 0; t < items.length; t++) {
        if (covs[t] > MAX_COVER + 0.0001 && covs[t] > worst) {
          worst = covs[t];
          bad = t;
        }
      }
      if (bad < 0) break;

      var victim = -1;
      var bestZ = -Infinity;
      var bb = ebox(items[bad]);
      for (var u = 0; u < items.length; u++) {
        if (u === bad) continue;
        var onTop =
          items[u].z > items[bad].z ||
          (items[u].z === items[bad].z && u > bad);
        if (!onTop) continue;
        if (interArea(ebox(items[u]), bb) <= 0) continue;
        if (items[u].z > bestZ) {
          bestZ = items[u].z;
          victim = u;
        }
      }
      if (victim < 0) items.splice(bad, 1);
      else items.splice(victim, 1);
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
      const w0 = works[0];
      wall.innerHTML =
        '<a class="pw-shot" href="' + detailHref(w0.id) + '"' +
        ' style="left:28%;top:28%;width:22%;z-index:6;transform:rotate(-4deg);">' +
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

    const count = WORKS.length <= 4 ? WORKS.length : (window.innerWidth < 640 ? 9 : 16);
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
      } catch (e) { /* keep unprobed */ }
    }

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
