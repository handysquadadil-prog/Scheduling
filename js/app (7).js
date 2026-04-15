// ============================================================
// js/app.js — App bootstrap, router, sidebar, navbar
// ============================================================
import { loadAppData }               from './db.js';
import { startRealtimeSubscription } from './realtime.js';
import { renderSalesDashboard }      from './pages/sales.js';
import { renderSchedulerDashboard,
         renderSchedulerSlotsPage,
         renderSchedulerJobsPage }   from './pages/scheduler.js';
import { renderTechniciansPage }     from './pages/technicians.js';
import { renderReportsPage }         from './pages/reports.js';

let _currentPage = 'dashboard';
let _sidebarCollapsed = false;

// ── Bootstrap ────────────────────────────────────────────────
export async function initApp(user) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Navbar / sidebar user info
  document.getElementById('sidebar-avatar').textContent = user.name[0].toUpperCase();
  document.getElementById('sidebar-name').textContent   = user.name;
  document.getElementById('sidebar-role').textContent   = user.role;
  document.getElementById('sidebar-role').className     = `role-badge ${user.role}`;
  document.getElementById('navbar-user').textContent    = user.name;
  document.getElementById('navbar-role').textContent    = user.role;
  document.getElementById('navbar-role').className      = `role-badge ${user.role}`;

  buildSidebarNav(user.role);

  await loadAppData();
  startRealtimeSubscription();

  navigate('dashboard');
}

// ── Sidebar nav by role ───────────────────────────────────────
function buildSidebarNav(role) {
  const nav = document.getElementById('sidebar-nav');
  const isSched = role === 'scheduler';
  const items = [
    { page: 'dashboard', icon: '◈', label: 'Dashboard' },
    ...(isSched ? [
      { page: 'jobs',        icon: '◧', label: 'All Jobs'    },
      { page: 'slots',       icon: '◫', label: 'Slots'       },
      { page: 'technicians', icon: '👷', label: 'Technicians' },
      { page: 'reports',     icon: '📊', label: 'Reports'     },
    ] : [
      { page: 'jobs',    icon: '◧', label: 'My Jobs' },
    ]),
  ];
  nav.innerHTML = items.map(i => `
    <a href="#" class="nav-item" data-page="${i.page}" onclick="window._navigate('${i.page}');return false;">
      <span class="nav-icon">${i.icon}</span>
      <span class="nav-label">${i.label}</span>
    </a>`).join('');
}

// ── Router ────────────────────────────────────────────────────
export function navigate(page) {
  _currentPage = page;
  const user   = window.currentUser;
  const role   = user?.role;

  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  const titles = {
    dashboard:   role === 'scheduler' ? 'Scheduler Dashboard' : 'Sales Dashboard',
    jobs:        role === 'scheduler' ? 'All Jobs'            : 'My Jobs',
    slots:       'Slot Management',
    technicians: 'Technicians',
    reports:     'Reports & Export',
  };
  document.getElementById('page-title').textContent = titles[page] || 'FieldOps';

  const content = document.getElementById('main-content');

  if (page === 'dashboard') {
    content.innerHTML = role === 'scheduler'
      ? renderSchedulerDashboard()
      : renderSalesDashboard();
  } else if (page === 'jobs') {
    content.innerHTML = renderSchedulerJobsPage();
  } else if (page === 'slots') {
    content.innerHTML = renderSchedulerSlotsPage();
  } else if (page === 'technicians') {
    content.innerHTML = renderTechniciansPage();
  } else if (page === 'reports') {
    content.innerHTML = renderReportsPage();
  }

  // Close mobile sidebar after nav
  document.getElementById('sidebar')?.classList.remove('mobile-open');
}

// Expose to inline onclick handlers
window._navigate = navigate;

// ── Sidebar toggle ────────────────────────────────────────────
export function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const wrap    = document.querySelector('.main-wrap');
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('mobile-open');
  } else {
    _sidebarCollapsed = !_sidebarCollapsed;
    sidebar.classList.toggle('collapsed', _sidebarCollapsed);
    wrap?.classList.toggle('collapsed', _sidebarCollapsed);
  }
}
window.toggleSidebar = toggleSidebar;
