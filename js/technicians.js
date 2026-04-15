// ============================================================
// js/pages/technicians.js — Technician management (v2)
// Added: supervisor field, Cleaning segment note
// ============================================================
import { state }                                     from '../config.js';
import { addTechnician, updateTechnician,
         deleteTechnician }                          from '../db.js';
import { showToast, openModal, closeModal,
         renderStatsGrid }                           from '../ui.js';

const SEGMENTS = ['AC', 'Electrical', 'Plumbing', 'Carpentry', 'Pest Control', 'Painting', 'Cleaning', 'All'];

export function renderTechniciansPage() {
  const techs  = state.technicians;
  const active = techs.filter(t => t.is_active !== false);
  const segments = [...new Set(active.map(t => t.segment))];

  const stats = [
    { label: 'Total Technicians', value: techs.length,    color: 'blue',   meta: 'Registered' },
    { label: 'Active',            value: active.length,   color: 'green',  meta: 'Available' },
    { label: 'Segments',          value: segments.length, color: 'yellow', meta: 'Specialisms' },
    { label: 'Cleaning',          value: active.filter(t => t.segment === 'Cleaning').length, color: 'blue', meta: 'Outsiders managed per job' },
  ];

  const grouped = {};
  active.forEach(t => { if (!grouped[t.segment]) grouped[t.segment] = []; grouped[t.segment].push(t); });

  return `
  ${renderStatsGrid(stats)}
  <div class="page-header">
    <div><h2>Technician Management</h2><p>Add, edit, or remove field technicians. For Cleaning jobs, outsiders are entered directly in the report form.</p></div>
    <button class="btn btn-primary" onclick="window._openAddTechModal()">+ Add Technician</button>
  </div>
  ${SEGMENTS.filter(seg => grouped[seg]).map(seg => `
    <div class="section-title">${seg}${seg === 'Cleaning' ? ' <span style="font-size:10px;color:#0891b2;background:#e0f2fe;padding:2px 8px;border-radius:8px;margin-left:6px">Outsiders entered per job</span>' : ''}</div>
    <div class="users-grid" style="margin-bottom:24px">
      ${grouped[seg].map(t => renderTechCard(t)).join('')}
    </div>`).join('')}
  ${!active.length ? `<div class="empty-state"><div class="empty-state-icon">👷</div><p class="empty-state-text">No technicians yet</p></div>` : ''}`;
}

function renderTechCard(tech) {
  const SEG_COLORS = {
    AC:'#2563eb', Electrical:'#d97706', Plumbing:'#16a34a',
    Carpentry:'#ea580c', 'Pest Control':'#7c3aed',
    Painting:'#db2777', Cleaning:'#0891b2', All:'#64748b',
  };
  const col = SEG_COLORS[tech.segment] || '#64748b';
  return `<div class="user-card">
    <div class="user-card-avatar" style="background:${col}18;color:${col};border:1px solid ${col}40">${tech.name[0].toUpperCase()}</div>
    <div class="user-card-info">
      <div class="user-card-name">${tech.name}</div>
      <div class="user-card-phone">${tech.phone || '—'}</div>
      ${tech.supervisor ? `<div style="font-size:11px;color:#64748b;margin-top:2px">👤 Supervisor: ${tech.supervisor}</div>` : ''}
      <div style="margin-top:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <span style="font-size:10px;background:${col}18;color:${col};border:1px solid ${col}30;padding:2px 8px;border-radius:12px;font-weight:700">${tech.segment}</span>
        <button class="btn btn-sm btn-secondary" onclick="window._openEditTechModal('${tech.id}')">Edit</button>
        <button class="btn btn-sm btn-danger"    onclick="window._confirmDeleteTech('${tech.id}','${tech.name}')">Remove</button>
      </div>
    </div>
  </div>`;
}

// ── Add ───────────────────────────────────────────────────────
window._openAddTechModal = function() {
  openModal('add-tech-modal', `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">👷 Add Technician</div>
        <button class="modal-close" onclick="closeModal('add-tech-modal')">✕</button>
      </div>
      <div class="modal-form">
        <div class="form-group"><label>Full Name *</label><input type="text" id="at-name" placeholder="Technician name" /></div>
        <div class="form-group"><label>Phone</label><input type="tel" id="at-phone" placeholder="9876543210" /></div>
        <div class="form-group"><label>Segment / Speciality *</label>
          <select id="at-segment">${SEGMENTS.map(s => `<option value="${s}">${s}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Supervisor</label>
          <input type="text" id="at-supervisor" placeholder="Supervisor name (for notifications)" />
          <span style="font-size:11px;color:#94a3b8;margin-top:2px">Used to auto-fill and notify on complaints</span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('add-tech-modal')">Cancel</button>
        <button class="btn btn-primary"   onclick="window._submitAddTech()">Add</button>
      </div>
    </div>`);
};

window._submitAddTech = async function() {
  const name       = document.getElementById('at-name')?.value.trim();
  const phone      = document.getElementById('at-phone')?.value.trim();
  const segment    = document.getElementById('at-segment')?.value;
  const supervisor = document.getElementById('at-supervisor')?.value.trim();
  if (!name) { showToast('Name is required', 'error'); return; }
  const result = await addTechnician({ name, phone: phone || null, segment, supervisor: supervisor || null, is_active: true });
  if (result) { closeModal('add-tech-modal'); showToast(`${name} added!`, 'success'); refreshPage(); }
};

// ── Edit ──────────────────────────────────────────────────────
window._openEditTechModal = function(id) {
  const tech = state.technicians.find(t => t.id === id);
  if (!tech) return;
  openModal('edit-tech-modal', `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">✏️ Edit Technician</div>
        <button class="modal-close" onclick="closeModal('edit-tech-modal')">✕</button>
      </div>
      <div class="modal-form">
        <div class="form-group"><label>Full Name *</label><input type="text" id="et-name" value="${tech.name}" /></div>
        <div class="form-group"><label>Phone</label><input type="tel" id="et-phone" value="${tech.phone || ''}" /></div>
        <div class="form-group"><label>Segment *</label>
          <select id="et-segment">${SEGMENTS.map(s => `<option value="${s}" ${tech.segment === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Supervisor</label>
          <input type="text" id="et-supervisor" value="${tech.supervisor || ''}" placeholder="Supervisor name" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('edit-tech-modal')">Cancel</button>
        <button class="btn btn-primary"   onclick="window._submitEditTech('${id}')">Save</button>
      </div>
    </div>`);
};

window._submitEditTech = async function(id) {
  const name       = document.getElementById('et-name')?.value.trim();
  const phone      = document.getElementById('et-phone')?.value.trim();
  const segment    = document.getElementById('et-segment')?.value;
  const supervisor = document.getElementById('et-supervisor')?.value.trim();
  if (!name) { showToast('Name is required', 'error'); return; }
  const result = await updateTechnician(id, { name, phone: phone || null, segment, supervisor: supervisor || null });
  if (result) { closeModal('edit-tech-modal'); showToast('Updated!', 'success'); refreshPage(); }
};

// ── Delete ────────────────────────────────────────────────────
window._confirmDeleteTech = function(id, name) {
  if (!confirm(`Remove ${name} from the active list?`)) return;
  deleteTechnician(id).then(r => { if (r) { showToast(`${name} removed`, 'info'); refreshPage(); } });
};

function refreshPage() {
  const content = document.getElementById('main-content');
  if (content) content.innerHTML = renderTechniciansPage();
}
