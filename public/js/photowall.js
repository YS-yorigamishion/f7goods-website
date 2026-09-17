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
   * 照片墙散落 — 参考「撒在桌上」：
   * 不用死板网格；允许轻到中等叠压；有疏有密；不溢出屏。
   */
  function scatterPhotoWall(works) {
    var items = [];
    var rects = [];
    if (!works.length) return items;

    var isNarrow = typeof window !== 'undefined' && window.innerWidth < 640;
    var padX = 0.025, padY = 0.04;
    // 文案与按钮避让（可与照片轻擦，不整块压死）
    var softAvoid = [
      { x: 0.01, y: 0.01, w: 0.30, h: 0.12 },
      { x: 0.55, y: 0.86, w: 0.42, h: 0.12 },
      { x: 0.30, y: 0.90, w: 0.40, h: 0.08 }
    ];

    function softHit(nx, ny, nw, nh) {
      for (var i = 0; i < softAvoid.length; i++) {
        var a = softAvoid[i];
        var ix = Math.max(0, Math.min(nx + nw, a.x + a.w) - Math.max(nx, a.x));
        var iy = Math.max(0, Math.min(ny + nh, a.y + a.h) - Math.max(ny, a.y));
        if (ix * iy > nw * nh * 0.35) return true; // 压到文案区太多才拒绝
      }
      return false;
    }

    function maxOverlap(nx, ny, nw, nh) {
      var maxR = 0;
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        var ix = Math.max(0, Math.min(nx + nw, r.x + r.w) - Math.max(nx, r.x));
        var iy = Math.max(0, Math.min(ny + nh, r.y + r.h) - Math.max(ny, r.y));
        var inter = ix * iy;
        if (inter <= 0) continue;
        var area = Math.min(nw * nh, r.w * r.h);
        maxR = Math.max(maxR, inter / Math.max(area, 0.0001));
      }
      return maxR;
    }

    function rotK(deg) {
      var rad = Math.abs(deg) * Math.PI / 180;
      return Math.cos(rad) + Math.sin(rad);
    }

    // 每张：随机尺寸、角度；在屏内撒点，挑叠压最合适的
    function placeOne(work, preferSize) {
      var ratio = work.ratio || 1.25;
      var i;
      // 尺寸：参考图有大有小，中等偏多
      var roll = Math.random();
      var w;
      if (preferSize) {
        w = preferSize;
      } else if (roll < 0.22) {
        w = rand(0.085, 0.11);
      } else if (roll < 0.68) {
        w = rand(0.11, 0.145);
      } else {
        w = rand(0.145, 0.185);
      }
      if (isNarrow) w *= 0.88;

      var r = Math.random() < 0.7
        ? rand(-16, 16)
        : (Math.random() < 0.5 ? rand(-28, -16) : rand(16, 28));

      var h = w * ratio;
      if (h > 0.38) {
        h = 0.38;
        w = h / ratio;
      }

      // 旋转包络收到安全区
      var k = rotK(r);
      var maxW = 1 - padX * 2;
      var maxH = 1 - padY * 2;
      if (w * k > maxW) { var s1 = maxW / (w * k); w *= s1; h *= s1; }
      if (h * k > maxH) { var s2 = maxH / (h * k); w *= s2; h *= s2; }

      var best = null;
      var bestScore = -Infinity;
      // 目标叠压：像参考图一样「有叠但不糊」
      var targetOv = rand(0.02, 0.18);

      for (var a = 0; a < 50; a++) {
        // 比均匀分布更「乱」：中心略聚 + 两次随机和
        var cx = 0.5 + (Math.random() + Math.random() - 1) * 0.48;
        var cy = 0.5 + (Math.random() + Math.random() - 1) * 0.46;
        var hw = (w * k) / 2;
        var hh = (h * k) / 2;
        var cxMin = padX + hw;
        var cxMax = 1 - padX - hw;
        var cyMin = padY + hh;
        var cyMax = 1 - padY - hh;
        if (cxMin > cxMax || cyMin > cyMax) continue;
        cx = Math.min(cxMax, Math.max(cxMin, cx));
        cy = Math.min(cyMax, Math.max(cyMin, cy));
        var nx = cx - w / 2;
        var ny = cy - h / 2;
        if (softHit(nx, ny, w, h)) continue;

        var ov = maxOverlap(nx, ny, w, h);
        // 叠太狠（>0.45）不要；太贴目标叠压 + 位置抖动更自然
        if (ov > 0.45) continue;
        var score = -Math.abs(ov - targetOv) * 3 + Math.random() * 0.25;
        // 略偏好边缘/空隙的「随手丢」感
        score += (Math.abs(cx - 0.5) + Math.abs(cy - 0.5)) * 0.08;
        if (score > bestScore) {
          bestScore = score;
          best = { x: nx, y: ny, w: w, h: h, ov: ov };
        }
      }

      if (!best) {
        // 缩小再试，或接受轻叠
        for (var sc = 0.9; sc >= 0.55 && !best; sc -= 0.1) {
          var sw = w * sc, sh = h * sc;
          var kk = rotK(r);
          var hx = (sw * kk) / 2, hy = (sh * kk) / 2;
          var mx = Math.min(1 - padX - hx, Math.max(padX + hx, rand(0.25, 0.75)));
          var my = Math.min(1 - padY - hy, Math.max(padY + hy, rand(0.25, 0.7)));
          var bx = mx - sw / 2, by = my - sh / 2;
          var ov2 = maxOverlap(bx, by, sw, sh);
          if (ov2 <= 0.35 && !softHit(bx, by, sw, sh)) {
            best = { x: bx, y: by, w: sw, h: sh, ov: ov2 };
          }
        }
      }

      if (!best) {
        // 最后兜底：落在安全区中心附近，允许叠
        var fw = w * 0.7, fh = h * 0.7;
        best = {
          x: 0.5 + rand(-0.2, 0.2) - fw / 2,
          y: 0.48 + rand(-0.15, 0.15) - fh / 2,
          w: fw,
          h: fh,
          ov: 0.2
        };
        best.x = Math.min(1 - padX - best.w, Math.max(padX, best.x));
        best.y = Math.min(1 - padY - best.h, Math.max(padY, best.y));
      }

      return {
        x: best.x,
        y: best.y,
        w: best.w,
        h: best.h,
        r: r,
        z: 0,
        workId: work.id,
        delay: (items.length * 0.025 + Math.random() * 0.04).toFixed(3)
      };
    }

    // 密度：参考图很满；移动端略减
    var n = Math.min(works.length, isNarrow ? 12 : 16);
    // 若作品少，允许同一作品多张入墙
    var pool = [];
    while (pool.length < n) {
      for (var p = 0; p < works.length && pool.length < n; p++) {
        pool.push(works[p]);
      }
    }

    for (var i = 0; i < n; i++) {
      var item = placeOne(pool[i]);
      // z：大致后画的压前画的，再随机扰动，避免「排队」
      item.z = 5 + i + Math.floor(Math.random() * 3);
      rects.push({ x: item.x, y: item.y, w: item.w, h: item.h });
      items.push(item);
    }

    // 按最终 z 排一下，render 顺序即叠放顺序
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

    const count = WORKS.length <= 4 ? WORKS.length : (window.innerWidth < 640 ? 12 : 16);
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
