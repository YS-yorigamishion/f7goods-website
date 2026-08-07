/**
 * Pull-to-refresh for listing pages.
 * Usage: PullToRefresh.init({ onRefresh: async () => { ... } })
 */
const PullToRefresh = (() => {
  const THRESHOLD = 80;
  const MAX_PULL = 120;
  let startY = 0;
  let pulling = false;
  let refreshing = false;
  let indicator = null;
  let arrowSvg = null;
  let onRefreshCallback = null;

  const arrowPath = 'M12 19V5M5 12l7-7 7 7';
  const spinnerPath = 'M21 12a9 9 0 11-6.219-8.56';

  function createIndicator() {
    const el = document.createElement('div');
    el.className = 'ptr-indicator';
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${arrowPath}"/></svg>`;
    document.body.appendChild(el);
    arrowSvg = el.querySelector('svg');
    return el;
  }

  function isAtTop() {
    return window.scrollY <= 0;
  }

  function onTouchStart(e) {
    if (refreshing || !isAtTop()) return;
    startY = e.touches[0].clientY;
    pulling = true;
  }

  function onTouchMove(e) {
    if (!pulling || refreshing) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) return;

    e.preventDefault();

    const progress = Math.min(dy / MAX_PULL, 1);
    const translateY = Math.min(dy * 0.5, MAX_PULL * 0.5);

    if (!indicator) indicator = createIndicator();
    indicator.classList.add('pulling');
    indicator.style.transform = `translateX(-50%) translateY(${-100 + translateY * 2.5}px)`;
    arrowSvg.style.transform = `rotate(${progress * 180}deg)`;

    if (dy >= THRESHOLD) {
      indicator.classList.add('ready');
    } else {
      indicator.classList.remove('ready');
    }
  }

  async function onTouchEnd() {
    if (!pulling || refreshing) return;
    pulling = false;

    if (!indicator) return;

    const wasReady = indicator.classList.contains('ready');
    indicator.classList.remove('pulling', 'ready');

    if (wasReady) {
      refreshing = true;
      indicator.classList.add('refreshing');
      arrowSvg.style.transform = 'rotate(180deg)';
      arrowSvg.innerHTML = `<path d="${spinnerPath}"/>`;
      arrowSvg.style.animation = 'spin 0.8s linear infinite';

      try {
        if (onRefreshCallback) await onRefreshCallback();
      } catch (err) {
        console.error('PTR refresh error:', err);
      }

      arrowSvg.style.animation = '';
      arrowSvg.innerHTML = `<path d="${arrowPath}"/>`;
      indicator.classList.remove('refreshing');
      indicator.style.transform = 'translateX(-50%) translateY(-100%)';
      refreshing = false;
    } else {
      indicator.style.transform = 'translateX(-50%) translateY(-100%)';
    }
  }

  function init({ onRefresh }) {
    onRefreshCallback = onRefresh;
    document.documentElement.classList.add('pull-to-refresh-active');
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
  }

  function destroy() {
    document.documentElement.classList.remove('pull-to-refresh-active');
    document.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    if (indicator) { indicator.remove(); indicator = null; }
  }

  return { init, destroy };
})();
