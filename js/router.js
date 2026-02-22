/* ============================================================
   ABIDE - Hash-Based Router
   ============================================================ */

const Router = (() => {
  const routes = {};
  let currentRoute = null;
  let prevTab = null;
  const TAB_ORDER = ['/', '/scripture', '/prayer', '/journal', '/ask'];

  function register(path, handler) {
    routes[path] = handler;
  }

  function navigate(path, { back = false } = {}) {
    window.location.hash = '#' + path;
  }

  function back() {
    navigate(currentRoute || '/', { back: true });
    window.history.back();
  }

  function resolve() {
    const hash = window.location.hash;
    const path = hash.replace('#', '') || '/';

    // Determine direction for animation
    const currentIdx = TAB_ORDER.indexOf(currentRoute);
    const newIdx = TAB_ORDER.indexOf(path);
    const goingBack = newIdx < currentIdx;

    currentRoute = path;
    document.body.dataset.route = path;
    updateTabBar(path);
    updateHeaderBack(path);
    renderRoute(path, goingBack);
  }

  function renderRoute(path, back = false) {
    // Find exact match or parameterized match
    const handler = routes[path] || routes['/'];
    if (!handler) return;

    const container = document.getElementById('view-container');
    if (!container) return;

    // Animate out old content if it exists
    const old = container.querySelector('.view-content, .view-root');
    if (old) {
      old.classList.add('view-exit');
      old.addEventListener('animationend', () => old.remove(), { once: true });
    }

    // Call the view handler
    handler(container, back);

    // Scroll to top
    container.scrollTop = 0;
  }

  function updateTabBar(path) {
    const tabs = document.querySelectorAll('.tab-item');
    tabs.forEach(tab => {
      const tabPath = '/' + (tab.dataset.tab === 'home' ? '' : tab.dataset.tab);
      const normalized = tabPath === '//' ? '/' : tabPath;
      tab.classList.toggle('active', path === normalized || (path === '/' && tab.dataset.tab === 'home'));
    });
  }

  function updateHeaderBack(path) {
    const backBtn = document.getElementById('header-back');
    const tabPaths = TAB_ORDER;
    const isTopLevel = tabPaths.includes(path);
    if (backBtn) {
      if (isTopLevel) {
        backBtn.setAttribute('hidden', '');
      } else {
        backBtn.removeAttribute('hidden');
      }
    }
  }

  function setTitle(title) {
    const el = document.getElementById('view-title');
    if (el) el.textContent = title;
  }

  function setHeaderActions(html) {
    const el = document.getElementById('header-actions');
    if (el) el.innerHTML = html;
  }

  function clearHeaderActions() {
    setHeaderActions('');
  }

  function init() {
    window.addEventListener('hashchange', resolve);
    document.getElementById('header-back')?.addEventListener('click', () => {
      window.history.back();
    });

    // Initial route
    resolve();
  }

  return {
    register,
    navigate,
    back,
    resolve,
    setTitle,
    setHeaderActions,
    clearHeaderActions,
    init,
    get current() { return currentRoute; },
  };
})();

window.Router = Router;
