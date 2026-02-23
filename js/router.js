/* ============================================================
   ABIDE - Hash-Based Router
   ============================================================ */

const Router = (() => {
  const routes = {};
  let currentRoute = null;
  let prevTab = null;
  const TAB_ORDER = ['/', '/scripture', '/prayer', '/journal', '/settings'];

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
    updateSidebarProfile();
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

  function updateSidebarProfile() {
    const el = document.getElementById('sidebar-profile');
    if (!el) return; // no-op on mobile (element hidden, but guard anyway)

    const profile = typeof Store !== 'undefined' ? Store.get('googleProfile') : null;
    if (profile && (profile.email || profile.name)) {
      const initial = (profile.name || profile.email || 'U')[0].toUpperCase();
      const avatarHtml = profile.picture
        ? `<img src="${profile.picture}" alt="${profile.name || ''}" />`
        : `<span class="sidebar-profile__avatar--fallback">${initial}</span>`;
      el.innerHTML = `
        <div class="sidebar-profile__avatar">${avatarHtml}</div>
        <div class="sidebar-profile__meta">
          <div class="sidebar-profile__name">${profile.name || profile.email}</div>
          <div class="sidebar-profile__status sidebar-profile__status--synced">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                 style="display:inline-block;vertical-align:-1px;margin-right:2px;">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>Synced
          </div>
        </div>`;
    } else {
      el.innerHTML = `
        <div class="sidebar-profile__avatar sidebar-profile__avatar--empty">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
        </div>
        <div class="sidebar-profile__meta">
          <div class="sidebar-profile__name">Not signed in</div>
          <div class="sidebar-profile__status">
            <a href="#" class="sidebar-profile__connect" onclick="event.preventDefault();if(typeof Sync!=='undefined'){Sync.connectGoogle().then(()=>Router.updateSidebarProfile()).catch(()=>{});}else{Router.navigate('/settings');}">Connect Google</a>
          </div>
        </div>`;
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
    updateSidebarProfile,
    init,
    get current() { return currentRoute; },
  };
})();

window.Router = Router;
