// ============================================================
// js/ui.js — Shared UI utilities
// ============================================================

// ── Toast notifications ──────────────────────────────────────
let _toastTimer = null;
export function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(container);
  }
  const colors = { success: '#22c55e', error: '#ef4444', info: '#3b82f6', warning: '#eab308' };
  const icons  = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const toast  = document.createElement('div');
  toast.style.cssText = `
    background:var(--bg-card);
    border:1px solid ${colors[type] || colors.info}44;
    border-left:3px solid ${colors[type] || colors.info};
    color:var(--text-primary);
    padding:12px 16px;
    border-radius:8px;
    font-size:13px;
    box-shadow:0 4px 20px rgba(0,0,0,0.4);
    display:flex;align-items:center;gap:8px;
    pointer-events:auto;
    animation:slideInRight 0.2s ease;
    max-width:320px;
  `;
  toast.innerHTML = `<span style="color:${colors[type]};font-weight:700">${icons[type]}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3500);
}

// ── Modal helpers ────────────────────────────────────────────
export function openModal(id, html) {
  closeModal(id);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = id;
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(id); });
  return overlay;
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ── Date / time formatters ───────────────────────────────────
export function today() { return new Date().toISOString().split('T')[0]; }

export function formatTime(t) {
  if (!t) return '—';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

export function formatDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

export function formatCurrency(n) {
  return '₹' + (parseFloat(n) || 0).toLocaleString('en-IN');
}

// ── Stats grid renderer ───────────────────────────────────────
export function renderStatsGrid(stats) {
  return `<div class="stats-grid" style="margin-bottom:24px">
    ${stats.map(s => `
      <div class="stat-card ${s.color}">
        <div class="stat-label">${s.label}</div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-meta">${s.meta || ''}</div>
      </div>`).join('')}
  </div>`;
}

// ── WhatsApp copy helper ──────────────────────────────────────
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!', 'success');
  } catch (_) {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity  = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('Copied!', 'success');
  }
}

// ── CSV download ──────────────────────────────────────────────
export function downloadCSV(rows, filename = 'fieldops-export.csv') {
  if (!rows.length) { showToast('No data to export', 'warning'); return; }
  const headers = Object.keys(rows[0]);
  const escape  = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv     = [headers.map(escape).join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
  const blob    = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${rows.length} rows`, 'success');
}

// ── Notification system ───────────────────────────────────────
window._notifications = window._notifications || [];

export function addNotification(title, body) {
  window._notifications.unshift({
    title, body,
    time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    read: false,
  });
  const dot = document.getElementById('notif-dot');
  if (dot) dot.classList.add('show');
  showToast(`${title}: ${body}`, 'info');
  if (Notification?.permission === 'granted') new Notification(title, { body });
}

export function toggleNotifPanel() {
  const existing = document.getElementById('notif-panel');
  if (existing) { existing.remove(); return; }
  window._notifications.forEach(n => n.read = true);
  const dot = document.getElementById('notif-dot');
  if (dot) dot.classList.remove('show');
  const panel = document.createElement('div');
  panel.id = 'notif-panel';
  panel.className = 'notif-panel';
  const notifs = window._notifications;
  panel.innerHTML = `
    <div class="notif-header">
      <span style="font-size:14px;font-weight:700">🔔 Notifications</span>
      <button onclick="document.getElementById('notif-panel').remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px">✕</button>
    </div>
    ${notifs.length === 0
      ? '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">No notifications yet</div>'
      : notifs.slice(0, 20).map(n => `
          <div class="notif-item ${n.read ? '' : 'unread'}">
            <div class="notif-item-title">${n.title}</div>
            <div class="notif-item-body">${n.body}</div>
            <div class="notif-item-time">${n.time}</div>
          </div>`).join('')}`;
  document.body.appendChild(panel);
  document.addEventListener('click', function close(e) {
    if (!panel.contains(e.target) && e.target.id !== 'notif-bell') {
      panel.remove();
      document.removeEventListener('click', close);
    }
  }, { capture: true });
}
