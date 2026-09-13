// f7goods i18n — 中文为源，缺译回退；切换语言不整页刷新
let _lang = localStorage.getItem('f7lang') || 'zh';
let _i18n = {};
let _langHooks = [];

// 语言文件版本：新增/修改词条后递增，避免浏览器缓存旧 JSON
const F7_LANG_VER = '20260913a';

function t(key, params) {
  if (!key) return '';
  const keys = String(key).split('.');
  let val = _i18n;
  for (const k of keys) {
    if (val && typeof val === 'object') val = val[k];
    else return key;
  }
  if (val == null || val === '' || typeof val === 'object') return key;
  let text = String(val);
  if (params && typeof params === 'object') {
    Object.keys(params).forEach((k) => {
      text = text.split('{' + k + '}').join(String(params[k]));
    });
  }
  return text;
}

function tText(key, fallback) {
  const v = t(key);
  return (v && v !== key) ? v : fallback;
}

function applyTranslations(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const text = t(key);
    if (text === key) return;
    if (el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'radio') {
      el.placeholder = text;
    } else {
      el.textContent = text;
    }
  });
  scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    const text = t(key);
    if (text !== key) el.placeholder = text;
  });
  scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    const text = t(key);
    if (text !== key) {
      el.title = text;
      if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', text);
    }
  });
}

function updateLangButtons() {
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === _lang);
  });
}

function getLangName(code) {
  const names = { zh: '中文', en: 'EN', ja: '日本語', ko: '한국어' };
  return names[code] || code;
}

function onLangChange(fn) {
  if (typeof fn === 'function') _langHooks.push(fn);
}

function _applyPageSettingsText() {
  const pageKey = document.getElementById('navbar')?.dataset?.activePage;
  if (!pageKey || typeof getPageSettings !== 'function') return;
  const ps = getPageSettings(pageKey);
  const map = {
    heroTitle: 'heroTitle',
    heroSubtitle: 'heroSubtitle',
    pageTitle: 'pageTitle',
    pageSubtitle: 'pageSubtitle'
  };
  Object.keys(map).forEach((k) => {
    if (!ps[k]) return;
    const el = document.getElementById(map[k]);
    if (el) el.textContent = ps[k];
  });
}

async function loadLang(lang, isInit = false) {
  try {
    const _fetchL = typeof fetchWithTimeout === 'function' ? fetchWithTimeout : fetch;
    const res = await _fetchL('/lang/' + lang + '.json?v=' + F7_LANG_VER);
    _i18n = await res.json();
    _lang = lang;
    localStorage.setItem('f7lang', lang);
    document.documentElement.lang = _lang;
    if (typeof loadCategoriesFromAPI === 'function') {
      await loadCategoriesFromAPI();
    }
    if (typeof buildNavbar === 'function') {
      const navbar = document.getElementById('navbar');
      if (navbar) {
        navbar.innerHTML = buildNavbar(navbar.dataset.activePage);
      }
    }
    if (typeof buildFooter === 'function') {
      const footer = document.getElementById('footer');
      if (footer) footer.innerHTML = buildFooter();
    }
    if (typeof buildFilterButtons === 'function') buildFilterButtons();
    if (typeof buildProjectFilterButtons === 'function') buildProjectFilterButtons();
    if (typeof buildUpdateFilterButtons === 'function') buildUpdateFilterButtons();
    _applyPageSettingsText();
    applyTranslations();
    updateLangButtons();
    _langHooks.forEach((fn) => {
      try { fn(_lang); } catch (e) { console.error('[i18n hook]', e); }
    });
    // 不整页 reload：页面通过 onLangChange 重渲染
    if (!isInit && localStorage.getItem('f7lang_switch')) {
      localStorage.removeItem('f7lang_switch');
    }
  } catch (e) {
    console.error('Failed to load language:', lang, e);
  }
}
