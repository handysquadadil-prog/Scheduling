// ============================================================
// js/pages/scheduler.js — Scheduler views (v2)
// New: district grouping, work_started_time, cleaning rules,
//      supervisor field, complaint → supervisor notification
// ============================================================
import { state, DISTRICTS }                          from '../config.js';
import { getService, getSlot, getTechnicians,
         updateSlotStatus, deleteSlot, createSlot,
         assignTechToSlot, copySlotsFromDate,
         submitReport, updateJob }                   from '../db.js';
import { showToast, openModal, closeModal, today,
         formatTime, formatDate, formatCurrency,
         renderStatsGrid, copyToClipboard }          from '../ui.js';

const IS_CLEANING = (svc) => svc?.segment === 'Cleaning';

// ─────────────────────────────────────────────────────────────
// SCHEDULER DASHBOARD
// ─────────────────────────────────────────────────────────────
export function renderSchedulerDashboard() {
  const jobs      = state.jobs;
  const booked    = jobs.filter(j => j.status === 'booked').length;
  const assigned  = jobs.filter(j => j.status === 'assigned').length;
  const completed = jobs.filter(j => j.status === 'completed').length;
  const complaints = jobs.filter(j => j.complaint && !j.supervisor_notified).length;

  const stats = [
    { label: 'Total Jobs',          value: jobs.length, color: 'blue',   meta: 'All time' },
    { label: 'Booked',              value: booked,      color: 'yellow', meta: 'Needs assignment' },
    { label: 'Assigned',            value: assigned,    color: 'orange', meta: 'Ready' },
    { label: 'Completed',           value: completed,   color: 'green',  meta: 'Done' },
  ];

  return `
  ${renderStatsGrid(stats)}
  ${complaints > 0 ? `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:10px;color:#b91c1c;font-size:13px;font-weight:600">
    ⚠️ ${complaints} unresolved complaint${complaints > 1 ? 's' : ''} pending supervisor notification
    <button class="btn btn-sm" style="margin-left:auto;background:#b91c1c;color:#fff;border:none" onclick="window._navigate('reports')">View Complaints</button>
  </div>` : ''}
  <div class="page-header">
    <div><h2>Slot Management</h2><p>Manage slots by district, assign technicians, copy days</p></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-secondary" onclick="window._openCopySlotsModal()">📋 Copy Day</button>
      <button class="btn btn-secondary" onclick="window._openAddSlotModal()">+ Add Slot</button>
    </div>
  </div>
  <!-- Filters -->
  <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:20px">
    <div class="form-group" style="flex:0 0 auto">
      <label>Date</label>
      <input type="date" id="sched-date-filter" value="${today()}" onchange="window._schedRefreshGrid()" style="width:160px" />
    </div>
    <div class="form-group" style="flex:0 0 auto">
      <label>District</label>
      <select id="sched-district-filter" onchange="window._schedRefreshGrid()" style="width:140px">
        <option value="">Both Districts</option>
        ${DISTRICTS.map(d => `<option value="${d}">${d}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" style="flex:0 0 auto">
      <label>Service</label>
      <select id="sched-svc-filter" onchange="window._schedRefreshGrid()" style="width:160px">
        <option value="">All Services</option>
        ${[...new Set(state.services.map(s => s.name))].map(n => `<option value="${n}">${n}</option>`).join('')}
      </select>
    </div>
  </div>
  <div id="sched-slot-grid"></div>`;
}

// ── Refresh grid ──────────────────────────────────────────────
function refreshSchedGrid() {
  const date     = document.getElementById('sched-date-filter')?.value     || today();
  const district = document.getElementById('sched-district-filter')?.value || '';
  const svcName  = document.getElementById('sched-svc-filter')?.value      || '';
  const grid     = document.getElementById('sched-slot-grid');
  if (grid) grid.innerHTML = renderSchedSlotGrid(date, district, svcName);
}
window._schedRefreshGrid = refreshSchedGrid;
setTimeout(() => refreshSchedGrid(), 0);

// ── Slot grid grouped by district → service ───────────────────
function renderSchedSlotGrid(date, districtFilter, svcNameFilter) {
  let slots = state.slots.filter(s => s.date === date);
  if (districtFilter) slots = slots.filter(s => s.district === districtFilter);
  if (svcNameFilter)  slots = slots.filter(s => {
    const svc = getService(s.service_id);
    return svc.name === svcNameFilter;
  });
  if (!slots.length) return `<div class="empty-state"><div class="empty-state-icon">📅</div><p class="empty-state-text">No slots on ${formatDate(date)}</p><p class="empty-state-sub">Use + Add Slot or Copy Day to populate</p></div>`;

  // Group by district first, then by service
  const byDistrict = {};
  slots.forEach(s => {
    const svc = getService(s.service_id);
    const d   = s.district || svc.district || 'Both';
    if (!byDistrict[d]) byDistrict[d] = {};
    const key = svc.name;
    if (!byDistrict[d][key]) byDistrict[d][key] = [];
    byDistrict[d][key].push(s);
  });

  const DISTRICT_COLORS = { Kochi: '#2563eb', Trivandrum: '#7c3aed', Both: '#0891b2' };

  return Object.entries(byDistrict).map(([dist, svcGroups]) => {
    const dc = DISTRICT_COLORS[dist] || '#64748b';
    return `
      <div style="margin-bottom:32px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding:10px 16px;background:${dc}12;border-left:4px solid ${dc};border-radius:0 8px 8px 0">
          <span style="font-size:18px">${dist === 'Kochi' ? '🏙' : dist === 'Trivandrum' ? '🌴' : '🗺'}</span>
          <span style="font-size:15px;font-weight:700;color:${dc}">${dist}</span>
          <span style="font-size:12px;color:#64748b;margin-left:auto">${slots.filter(s => (s.district || 'Both') === dist).length} slots</span>
        </div>
        ${Object.entries(svcGroups).map(([svcName, slotList]) => {
          const svc = getService(slotList[0].service_id);
          return `
            <div class="service-group-header">
              <div class="service-icon" style="background:${svc.color}18;border:1px solid ${svc.color}40">${svc.icon}</div>
              <div class="service-group-name">${svcName}</div>
              <span style="font-size:11px;color:#94a3b8;margin-left:auto">${slotList.length} slot${slotList.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="slots-grid" style="margin-bottom:16px">
              ${slotList.map(slot => renderSchedSlotCard(slot)).join('')}
            </div>`;
        }).join('')}
      </div>`;
  }).join('');
}

function renderSchedSlotCard(slot) {
  const job  = state.jobs.find(j => j.slot_id === slot.id && j.status !== 'cancelled');
  const tech = slot.technician_id ? state.technicians.find(t => t.id === slot.technician_id) : null;
  const st   = slot.status;
  const svc  = getService(slot.service_id);
  const hasComplaint = job?.complaint && !job?.supervisor_notified;

  return `<div class="slot-card ${hasComplaint ? 'complaint-flag' : ''}" onclick="window._schedSlotClick('${slot.id}')">
    <div class="slot-time">${formatTime(slot.time)}</div>
    <div class="slot-service">${svc.icon} ${svc.name}</div>
    <span class="status status-${st}">${st}</span>
    ${job ? `<div style="font-size:12px;font-weight:600;margin-top:6px;color:#1e293b">👤 ${job.customer_name}</div>` : ''}
    ${job ? `<div style="font-size:11px;color:#64748b;margin-top:2px">📞 ${job.phone}${job.place ? ' · ' + job.place : ''}</div>` : ''}
    ${hasComplaint ? `<div style="font-size:11px;color:#dc2626;margin-top:4px;font-weight:600">⚠️ Complaint pending</div>` : ''}
    <div class="slot-tech">${tech ? '🔧 ' + tech.name : '— Unassigned'}</div>
    <div class="slot-actions">
      ${st === 'available' && !job ? `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();window._blockSlot('${slot.id}')">Block</button>` : ''}
      ${st === 'blocked'           ? `<button class="btn btn-sm btn-success" onclick="event.stopPropagation();window._unblockSlot('${slot.id}')">Unblock</button>` : ''}
      ${st !== 'booked'            ? `<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();window._deleteSlot('${slot.id}')">Delete</button>` : ''}
    </div>
  </div>`;
}

// ── Slot click ────────────────────────────────────────────────
window._schedSlotClick = function(slotId) {
  const slot = state.slots.find(s => s.id === slotId);
  if (!slot) return;
  const job  = state.jobs.find(j => j.slot_id === slotId && j.status !== 'cancelled');
  if (job) openJobDetailModal(job, slot);
  else     openSlotDetailModal(slot);
};

// ── Available slot detail ─────────────────────────────────────
function openSlotDetailModal(slot) {
  const svc   = getService(slot.service_id);
  const techs = getTechnicians(svc.segment);
  openModal('slot-detail-modal', `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">🕐 ${svc.icon} ${svc.name} · ${formatTime(slot.time)} · ${slot.district}</div>
        <button class="modal-close" onclick="closeModal('slot-detail-modal')">✕</button>
      </div>
      <div class="modal-form">
        <div class="form-group">
          <label>Assign Technician</label>
          <select id="sd-tech">
            <option value="">— Select —</option>
            ${techs.map(t => `<option value="${t.id}" ${slot.technician_id === t.id ? 'selected' : ''}>${t.name}${t.supervisor ? ' [' + t.supervisor + ']' : ''}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('slot-detail-modal')">Close</button>
        <button class="btn btn-primary"   onclick="window._assignTechToSlot('${slot.id}')">Save</button>
      </div>
    </div>`);
}
window._assignTechToSlot = async function(slotId) {
  const techId = document.getElementById('sd-tech')?.value;
  if (!techId) { showToast('Select a technician', 'error'); return; }
  await assignTechToSlot(slotId, techId);
  closeModal('slot-detail-modal');
  showToast('Technician assigned!', 'success');
  refreshSchedGrid();
};

// ── Booked slot — full job detail ─────────────────────────────
function openJobDetailModal(job, slot) {
  const svc     = getService(job.service_id);
  const techs   = getTechnicians(svc.segment);
  const tech    = slot.technician_id ? state.technicians.find(t => t.id === slot.technician_id) : null;
  const balance = (job.amount || 0) - (job.advance || 0);
  const hasComplaint = job.complaint && job.complaint.trim();

  openModal('job-detail-modal', `
    <div class="modal modal-lg">
      <div class="modal-header">
        <div class="modal-title">📋 ${job.customer_name} — ${svc.icon} ${svc.name}
          <span style="font-size:11px;font-weight:400;color:#64748b;margin-left:8px">${slot.district}</span>
        </div>
        <button class="modal-close" onclick="closeModal('job-detail-modal')">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:7px;margin-bottom:16px">
        <div class="info-row"><span class="info-key">📞 Phone</span><span class="info-val">${job.phone}${job.alt_phone ? ' / ' + job.alt_phone : ''}</span></div>
        <div class="info-row"><span class="info-key">📍 Place</span><span class="info-val">${job.place || '—'}</span></div>
        ${job.address ? `<div class="info-row"><span class="info-key">🏠 Address</span><span class="info-val" style="font-size:12px">${job.address}</span></div>` : ''}
        <div class="info-row"><span class="info-key">📅 Date</span><span class="info-val">${formatDate(slot.date)}</span></div>
        <div class="info-row"><span class="info-key">⏰ Time</span><span class="info-val mono">${formatTime(slot.time)}</span></div>
        <div class="info-row"><span class="info-key">🔧 Tech</span><span class="info-val">${tech ? tech.name : '<span style="color:#dc2626">Unassigned</span>'}</span></div>
        <div class="info-row"><span class="info-key">🛠 Work Spec</span><span class="info-val">${job.work_spec || '—'}</span></div>
        ${job.work_details ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;font-size:12px;color:#475569">${job.work_details}</div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:4px">
          <div style="text-align:center;background:#f0fdf4;border-radius:6px;padding:8px"><div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase">Quoted</div><div style="font-size:15px;font-weight:700;color:#166534">${formatCurrency(job.amount)}</div></div>
          <div style="text-align:center;background:#fefce8;border-radius:6px;padding:8px"><div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase">Advance</div><div style="font-size:15px;font-weight:700;color:#854d0e">${formatCurrency(job.advance)}</div></div>
          <div style="text-align:center;background:#eff6ff;border-radius:6px;padding:8px"><div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase">Balance</div><div style="font-size:15px;font-weight:700;color:#1d4ed8">${formatCurrency(balance)}</div></div>
        </div>
        ${hasComplaint ? `
        <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:10px 12px;margin-top:4px">
          <div style="font-size:11px;font-weight:700;color:#dc2626;margin-bottom:4px">⚠️ COMPLAINT</div>
          <div style="font-size:13px;color:#7f1d1d">${job.complaint}</div>
          ${job.supervisor_notified ? `<div style="font-size:11px;color:#16a34a;margin-top:4px">✓ Supervisor notified ${job.supervisor_notified_at ? 'at ' + new Date(job.supervisor_notified_at).toLocaleString('en-IN') : ''}</div>` : `<button class="btn btn-sm" style="margin-top:8px;background:#dc2626;color:#fff;border:none" onclick="window._notifySupervisor('${job.id}')">📨 Notify Supervisor Now</button>`}
        </div>` : ''}
        <!-- Assign technician inline -->
        <div class="form-group" style="margin-top:6px">
          <label>Assign / Reassign Technician</label>
          <select id="jd-tech">
            <option value="">— Select —</option>
            ${techs.map(t => `<option value="${t.id}" ${slot.technician_id === t.id ? 'selected' : ''}>${t.name}${t.supervisor ? ' [' + t.supervisor + ']' : ''}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        ${job.location_link ? `<a href="${job.location_link}" target="_blank" class="btn btn-secondary btn-sm">🗺 Map</a>` : ''}
        <button class="btn btn-secondary" onclick="window._copyWhatsApp('${job.id}')">📋 WhatsApp</button>
        <button class="btn btn-secondary" onclick="closeModal('job-detail-modal')">Close</button>
        <button class="btn btn-primary"   onclick="window._saveAssignFromModal('${slot.id}')">Save Assign</button>
        ${job.status !== 'completed' ? `<button class="btn btn-success" onclick="window._openReportModal('${job.id}')">📝 Add Report</button>` : ''}
      </div>
    </div>`);
}

window._saveAssignFromModal = async function(slotId) {
  const techId = document.getElementById('jd-tech')?.value;
  if (!techId) { showToast('Select a technician', 'error'); return; }
  await assignTechToSlot(slotId, techId);
  closeModal('job-detail-modal');
  showToast('Technician assigned!', 'success');
  refreshSchedGrid();
};

// ── Notify supervisor ─────────────────────────────────────────
window._notifySupervisor = async function(jobId) {
  await updateJob(jobId, {
    supervisor_notified:    true,
    supervisor_notified_at: new Date().toISOString(),
  });
  showToast('Supervisor notification recorded!', 'success');
  closeModal('job-detail-modal');
  refreshSchedGrid();
};

// ── WhatsApp copy ─────────────────────────────────────────────
window._copyWhatsApp = function(jobId) {
  const job  = state.jobs.find(j => j.id === jobId);
  if (!job) return;
  const slot = getSlot(job.slot_id);
  const svc  = getService(job.service_id);
  const bal  = (job.amount || 0) - (job.advance || 0);
  const msg  =
`Customer➡️ ${job.customer_name}
Phone➡️ ${job.phone}
Alt➡️ ${job.alt_phone || '—'}
Place➡️ ${job.place || '—'}
Address➡️ ${job.address || '—'}
Location➡️ ${job.location_link || '—'}

Service➡️ ${svc.name} (${slot?.district || svc.district})
Date➡️ ${slot?.date || '—'}
Time➡️ ${slot ? formatTime(slot.time) : '—'}

Amount➡️ ₹${job.amount || 0}
Advance➡️ ₹${job.advance || 0}
Balance➡️ ₹${bal}

Work Spec➡️ ${job.work_spec || '—'}
Work Details➡️ ${job.work_details || '—'}
Attachments➡️`;
  copyToClipboard(msg);
};

// ── Block / Unblock / Delete ──────────────────────────────────
window._blockSlot   = async (id) => { await updateSlotStatus(id, 'blocked');   showToast('Slot blocked', 'info');     refreshSchedGrid(); };
window._unblockSlot = async (id) => { await updateSlotStatus(id, 'available'); showToast('Slot unblocked', 'success'); refreshSchedGrid(); };
window._deleteSlot  = async (id) => {
  if (!confirm('Permanently delete this slot?')) return;
  const ok = await deleteSlot(id);
  if (ok) { showToast('Slot deleted', 'info'); refreshSchedGrid(); }
};

// ── Add slot ──────────────────────────────────────────────────
window._openAddSlotModal = function() {
  const date = document.getElementById('sched-date-filter')?.value || today();
  openModal('add-slot-modal', `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">+ Add Slot</div>
        <button class="modal-close" onclick="closeModal('add-slot-modal')">✕</button>
      </div>
      <div class="modal-form">
        <div class="form-row">
          <div class="form-group"><label>District *</label>
            <select id="as-district">
              ${DISTRICTS.map(d => `<option value="${d}">${d}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Service *</label>
            <select id="as-svc" onchange="window._filterAddSlotServices()">
              <option value="">— select district first —</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Date *</label><input type="date" id="as-date" value="${date}" /></div>
          <div class="form-group"><label>Time *</label><input type="time" id="as-time" /></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('add-slot-modal')">Cancel</button>
        <button class="btn btn-primary"   onclick="window._submitAddSlot()">Add Slot</button>
      </div>
    </div>`);
  // Populate services for default district
  window._filterAddSlotServices();
  document.getElementById('as-district')?.addEventListener('change', window._filterAddSlotServices);
};

window._filterAddSlotServices = function() {
  const dist = document.getElementById('as-district')?.value;
  const sel  = document.getElementById('as-svc');
  if (!sel) return;
  const svcs = state.services.filter(s => s.district === dist || s.district === 'Both');
  sel.innerHTML = svcs.map(s => `<option value="${s.id}">${s.icon} ${s.name}</option>`).join('');
};

window._submitAddSlot = async function() {
  const svcId    = document.getElementById('as-svc')?.value;
  const date     = document.getElementById('as-date')?.value;
  const time     = document.getElementById('as-time')?.value;
  const district = document.getElementById('as-district')?.value;
  if (!svcId || !date || !time || !district) { showToast('Fill all fields', 'error'); return; }
  const result = await createSlot({ service_id: svcId, date, time, status: 'available', technician_id: null, district });
  if (result) { closeModal('add-slot-modal'); showToast('Slot added!', 'success'); refreshSchedGrid(); }
};

// ── Copy slots ────────────────────────────────────────────────
window._openCopySlotsModal = function() {
  const date = document.getElementById('sched-date-filter')?.value || today();
  openModal('copy-slots-modal', `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">📋 Copy Slots Between Dates</div>
        <button class="modal-close" onclick="closeModal('copy-slots-modal')">✕</button>
      </div>
      <div class="modal-form">
        <div class="form-row">
          <div class="form-group"><label>Source Date *</label><input type="date" id="cs-source" value="${date}" /></div>
          <div class="form-group"><label>Target Date *</label><input type="date" id="cs-target" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>District (optional)</label>
            <select id="cs-district">
              <option value="">All Districts</option>
              ${DISTRICTS.map(d => `<option value="${d}">${d}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Service (optional)</label>
            <select id="cs-svc">
              <option value="">All Services</option>
              ${state.services.map(s => `<option value="${s.id}">${s.district} – ${s.icon} ${s.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <p style="font-size:12px;color:#64748b">Copies slots as 'available', clears technician. Duplicates skipped.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('copy-slots-modal')">Cancel</button>
        <button class="btn btn-primary"   onclick="window._submitCopySlots()">Copy Slots</button>
      </div>
    </div>`);
};

window._submitCopySlots = async function() {
  const src  = document.getElementById('cs-source')?.value;
  const tgt  = document.getElementById('cs-target')?.value;
  const svc  = document.getElementById('cs-svc')?.value      || null;
  const dist = document.getElementById('cs-district')?.value || null;
  if (!src || !tgt)  { showToast('Select both dates', 'error'); return; }
  if (src === tgt)   { showToast('Source and target must differ', 'error'); return; }
  const count = await copySlotsFromDate(src, tgt, svc, dist);
  closeModal('copy-slots-modal');
  showToast(`${count} slot${count !== 1 ? 's' : ''} copied to ${formatDate(tgt)}`, 'success');
  const df = document.getElementById('sched-date-filter');
  if (df) { df.value = tgt; refreshSchedGrid(); }
};

// ─────────────────────────────────────────────────────────────
// REPORT MODAL — full evaluator form with all new fields
// ─────────────────────────────────────────────────────────────
window._openReportModal = function(jobId) {
  closeModal('job-detail-modal');
  const job  = state.jobs.find(j => j.id === jobId);
  if (!job) return;
  const svc      = getService(job.service_id);
  const slot     = getSlot(job.slot_id);
  const cleaning = IS_CLEANING(svc);
  const allTechs = state.technicians.filter(t => t.is_active !== false);
  const segTechs = getTechnicians(svc.segment);
  const techOpts = (list) => list.map(t => `<option value="${t.name}">${t.name}${t.supervisor ? ' [' + t.supervisor + ']' : ''}</option>`).join('');

  // Pre-fill supervisor from tech_1's supervisor if available
  const prefillSupervisor = job.supervisor || (segTechs[0]?.supervisor || '');

  openModal('report-modal', `
    <div class="modal modal-lg" style="max-width:720px">
      <div class="modal-header">
        <div class="modal-title">📝 Work Report — ${job.customer_name}
          <span style="font-size:11px;font-weight:400;color:#64748b;margin-left:8px">${svc.icon} ${svc.name} · ${slot?.district || ''}</span>
        </div>
        <button class="modal-close" onclick="closeModal('report-modal')">✕</button>
      </div>
      <div class="modal-form">

        <!-- Read-only summary -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:12px">
          <div><span style="color:#94a3b8">Customer:</span> <strong>${job.customer_name}</strong></div>
          <div><span style="color:#94a3b8">Phone:</span> ${job.phone}</div>
          <div><span style="color:#94a3b8">Service:</span> ${svc.icon} ${svc.name}</div>
          <div><span style="color:#94a3b8">District:</span> ${slot?.district || '—'}</div>
          <div><span style="color:#94a3b8">Scheduled:</span> ${formatDate(slot?.date)}</div>
          <div><span style="color:#94a3b8">Quoted:</span> <strong>${formatCurrency(job.amount)}</strong></div>
        </div>

        <!-- ── Technicians ── -->
        <div class="section-title" style="margin-top:6px">Technicians & Supervisor</div>
        ${cleaning ? `
        <!-- CLEANING: tech-1 = any tech, tech-2 = outsider free text -->
        <div class="form-row">
          <div class="form-group">
            <label>Tech 1 (Any Technician)</label>
            <select id="rp-tech1"><option value="">—</option>${techOpts(allTechs)}</select>
          </div>
          <div class="form-group">
            <label>Tech 2 – Outsider Name</label>
            <input type="text" id="rp-tech2-text" placeholder="Enter outsider name" value="${job.outsider_name || job.tech_2 || ''}" />
          </div>
        </div>
        ` : `
        <!-- Other services: tech-1/tech-2 filtered by segment; tech-3/4 any -->
        <div class="form-row">
          <div class="form-group">
            <label>Tech 1 (${svc.segment})</label>
            <select id="rp-tech1"><option value="">—</option>${techOpts(segTechs)}</select>
          </div>
          <div class="form-group">
            <label>Tech 2 (${svc.segment})</label>
            <select id="rp-tech2"><option value="">—</option>${techOpts(segTechs)}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Tech 3 (Any)</label>
            <select id="rp-tech3"><option value="">—</option>${techOpts(allTechs)}</select>
          </div>
          <div class="form-group">
            <label>Tech 4 (Any)</label>
            <select id="rp-tech4"><option value="">—</option>${techOpts(allTechs)}</select>
          </div>
        </div>
        `}
        <!-- Supervisor (replaces helper) -->
        <div class="form-group">
          <label>Supervisor</label>
          <input type="text" id="rp-supervisor" placeholder="Supervisor name" value="${prefillSupervisor}" />
          <span style="font-size:11px;color:#94a3b8;margin-top:2px">Auto-filled from technician record. Edit if different.</span>
        </div>

        <!-- ── Time tracking ── -->
        <div class="section-title">Site Times</div>
        <div class="form-row-3">
          <div class="form-group">
            <label>Site In</label>
            <input type="time" id="rp-site-in" value="${job.site_in || ''}" />
            <span style="font-size:11px;color:#94a3b8;margin-top:2px">Technician entered premises</span>
          </div>
          <div class="form-group">
            <label>Work Started</label>
            <input type="time" id="rp-work-started" value="${job.work_started_time || ''}" />
            <span style="font-size:11px;color:#94a3b8;margin-top:2px">Actual work commenced</span>
          </div>
          <div class="form-group">
            <label>Site Out</label>
            <input type="time" id="rp-site-out" value="${job.site_out || ''}" />
            <span style="font-size:11px;color:#94a3b8;margin-top:2px">Technician left premises</span>
          </div>
        </div>

        <!-- ── Financials ── -->
        <div class="section-title">Financials</div>
        <div class="form-row-3">
          <div class="form-group"><label>Final Amount (₹)</label><input type="number" id="rp-final-amt" value="${job.final_amount || job.amount || 0}" /></div>
          <div class="form-group"><label>Mode of Payment</label>
            <select id="rp-payment">
              <option value="">—</option>
              ${['Cash','UPI','Card','Pending'].map(m => `<option value="${m}" ${job.mode_of_payment === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Material Cost (₹)</label><input type="number" id="rp-material" value="${job.material_cost || 0}" /></div>
        </div>

        <!-- ── Notes ── -->
        <div class="section-title">Notes</div>
        <div class="form-group"><label>Internal Notes</label><textarea id="rp-notes" placeholder="Site observations, issues, etc.">${job.notes || ''}</textarea></div>
        <div class="form-group"><label>Feedback Call Note</label><textarea id="rp-feedback" placeholder="Customer feedback summary">${job.feedback_call_note || ''}</textarea></div>

        <!-- ── Work Status ── -->
        <div class="section-title">Completion</div>
        <div class="form-row">
          <div class="form-group"><label>Work Status *</label>
            <select id="rp-work-status">
              ${['Completed','Partial','Pending','Cancelled'].map(s => `<option value="${s}" ${job.work_status === s ? 'selected' : ''}>${s === 'Completed' ? '✅' : s === 'Partial' ? '⚠️' : s === 'Pending' ? '🕐' : '❌'} ${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Executed Date</label><input type="date" id="rp-exec-date" value="${job.executed_date || slot?.date || today()}" /></div>
        </div>
        <div class="form-group"><label>Distance (km)</label><input type="number" id="rp-distance" value="${job.distance || ''}" style="max-width:180px" /></div>

        <!-- ── Complaint ── -->
        <div class="section-title" style="color:#dc2626">Complaint (if any)</div>
        <div class="form-group">
          <label>Complaint Description</label>
          <textarea id="rp-complaint" placeholder="Describe the complaint from the customer or on-site issue...">${job.complaint || ''}</textarea>
          <span style="font-size:11px;color:#94a3b8;margin-top:2px">If filled, this will be flagged and pushed to the supervisor listed above.</span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('report-modal')">Cancel</button>
        <button class="btn btn-success"   onclick="window._submitReport('${jobId}')">✓ Save Report</button>
      </div>
    </div>`);

  // Auto-fill supervisor when tech-1 changes (non-cleaning)
  if (!cleaning) {
    document.getElementById('rp-tech1')?.addEventListener('change', function() {
      const techName = this.value;
      const tech = allTechs.find(t => t.name === techName);
      if (tech?.supervisor) {
        const supEl = document.getElementById('rp-supervisor');
        if (supEl && !supEl.value) supEl.value = tech.supervisor;
      }
    });
  }
};

window._submitReport = async function(jobId) {
  const workStatus = document.getElementById('rp-work-status')?.value;
  if (!workStatus) { showToast('Select work status', 'error'); return; }

  const job         = state.jobs.find(j => j.id === jobId);
  const svc         = job ? getService(job.service_id) : null;
  const cleaning    = IS_CLEANING(svc);
  const complaintTxt = document.getElementById('rp-complaint')?.value?.trim() || null;
  const supervisorVal = document.getElementById('rp-supervisor')?.value?.trim() || null;

  const reportData = {
    tech_1:             document.getElementById('rp-tech1')?.value      || null,
    tech_2:             cleaning
                          ? (document.getElementById('rp-tech2-text')?.value?.trim() || null)
                          : (document.getElementById('rp-tech2')?.value || null),
    outsider_name:      cleaning
                          ? (document.getElementById('rp-tech2-text')?.value?.trim() || null)
                          : null,
    tech_3:             !cleaning ? (document.getElementById('rp-tech3')?.value || null) : null,
    tech_4:             !cleaning ? (document.getElementById('rp-tech4')?.value || null) : null,
    supervisor:         supervisorVal,
    site_in:            document.getElementById('rp-site-in')?.value       || null,
    work_started_time:  document.getElementById('rp-work-started')?.value  || null,
    site_out:           document.getElementById('rp-site-out')?.value      || null,
    final_amount:       parseFloat(document.getElementById('rp-final-amt')?.value) || 0,
    mode_of_payment:    document.getElementById('rp-payment')?.value       || null,
    material_cost:      parseFloat(document.getElementById('rp-material')?.value)  || 0,
    notes:              document.getElementById('rp-notes')?.value         || null,
    feedback_call_note: document.getElementById('rp-feedback')?.value      || null,
    work_status:        workStatus,
    executed_date:      document.getElementById('rp-exec-date')?.value     || null,
    distance:           parseFloat(document.getElementById('rp-distance')?.value)  || null,
    complaint:          complaintTxt,
    complaint_raised_at: complaintTxt ? new Date().toISOString() : null,
    supervisor_notified: false,
  };

  const result = await submitReport(jobId, reportData);
  if (result) {
    closeModal('report-modal');
    if (complaintTxt && supervisorVal) {
      showToast(`Report saved. Complaint flagged → Supervisor: ${supervisorVal}`, 'warning');
    } else {
      showToast('Report saved!', 'success');
    }
    const grid = document.getElementById('sched-slot-grid');
    if (grid) refreshSchedGrid();
    const wrap = document.getElementById('sched-jobs-wrap');
    if (wrap) wrap.innerHTML = renderJobsTable(state.jobs);
  }
};

// ─────────────────────────────────────────────────────────────
// ALL JOBS PAGE
// ─────────────────────────────────────────────────────────────
export function renderSchedulerJobsPage() {
  const jobs = state.jobs.filter(j => j.status !== 'cancelled');
  const counts = {
    booked:    jobs.filter(j => j.status === 'booked').length,
    assigned:  jobs.filter(j => j.status === 'assigned').length,
    completed: jobs.filter(j => j.status === 'completed').length,
  };
  return `
  <div class="page-header">
    <div><h2>All Jobs</h2><p>Click any row to manage, assign or add a report</p></div>
    <!-- District quick filter -->
    <div style="display:flex;gap:8px">
      ${DISTRICTS.map(d => `<button class="btn btn-secondary btn-sm" onclick="window._filterJobsByDistrict('${d}',this)">${d}</button>`).join('')}
      <button class="btn btn-primary btn-sm" onclick="window._filterJobsByDistrict('',this)">All</button>
    </div>
  </div>
  <div class="scheduler-layout">
    <div>
      <div class="filters-bar" style="margin-bottom:12px">
        <div class="filter-pill active" onclick="window._filterJobs(this,'all')">All (${jobs.length})</div>
        <div class="filter-pill" onclick="window._filterJobs(this,'booked')">Booked (${counts.booked})</div>
        <div class="filter-pill" onclick="window._filterJobs(this,'assigned')">Assigned (${counts.assigned})</div>
        <div class="filter-pill" onclick="window._filterJobs(this,'completed')">Completed (${counts.completed})</div>
      </div>
      <div id="sched-jobs-wrap">${renderJobsTable(jobs)}</div>
    </div>
    <div class="detail-panel empty" id="job-detail-panel">
      <div style="text-align:center"><div style="font-size:32px;margin-bottom:12px">◧</div><div style="font-size:13px;color:#94a3b8">Click a job to see details</div></div>
    </div>
  </div>`;
}

function renderJobsTable(jobs) {
  if (!jobs.length) return `<div class="empty-state"><div class="empty-state-icon">📋</div><p class="empty-state-text">No jobs found</p></div>`;
  return `<div class="table-wrap"><table>
    <thead><tr><th>Customer</th><th>Service</th><th>District</th><th>Date</th><th>Time</th><th>Amount</th><th>Status</th></tr></thead>
    <tbody>
    ${jobs.map(job => {
      const svc  = getService(job.service_id);
      const slot = getSlot(job.slot_id);
      const hasCmpl = job.complaint && !job.supervisor_notified;
      return `<tr onclick="window._openJobRowModal('${job.id}')" style="${hasCmpl ? 'background:#fef2f2' : ''}">
        <td><div style="font-weight:600">${job.customer_name}${hasCmpl ? ' ⚠️' : ''}</div><div style="font-size:11px;color:#94a3b8">${job.place || ''}</div></td>
        <td>${svc.icon} ${svc.name}</td>
        <td><span style="font-size:11px;background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:12px;font-weight:600">${slot?.district || svc.district || '—'}</span></td>
        <td style="font-size:12px">${slot?.date || '—'}</td>
        <td style="font-family:monospace;font-size:12px">${slot ? formatTime(slot.time) : '—'}</td>
        <td style="font-family:monospace">${formatCurrency(job.amount)}</td>
        <td><span class="status status-${job.status}">${job.status}</span></td>
      </tr>`;
    }).join('')}
    </tbody>
  </table></div>`;
}

window._filterJobs = function(el, status) {
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  const jobs = (status === 'all' ? state.jobs : state.jobs.filter(j => j.status === status)).filter(j => j.status !== 'cancelled');
  const wrap = document.getElementById('sched-jobs-wrap');
  if (wrap) wrap.innerHTML = renderJobsTable(jobs);
};

window._filterJobsByDistrict = function(dist, btn) {
  const jobs = dist
    ? state.jobs.filter(j => { const s = getSlot(j.slot_id); return (s?.district || getService(j.service_id)?.district) === dist; })
    : state.jobs;
  const wrap = document.getElementById('sched-jobs-wrap');
  if (wrap) wrap.innerHTML = renderJobsTable(jobs.filter(j => j.status !== 'cancelled'));
};

window._openJobRowModal = function(jobId) {
  const job  = state.jobs.find(j => j.id === jobId);
  if (!job) return;
  const slot = getSlot(job.slot_id);
  if (slot) openJobDetailModal(job, slot);
};

export function renderSchedulerSlotsPage() { return renderSchedulerDashboard(); }
