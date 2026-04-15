// ============================================================
// js/pages/sales.js — Sales Dashboard (slot grid + booking)
// ============================================================
import { state }                                        from '../config.js';
import { getService, getSlot, addJob, updateJob,
         cancelJob, updateSlotStatus }                  from '../db.js';
import { showToast, openModal, closeModal, today,
         formatTime, formatDate, formatCurrency,
         renderStatsGrid }                              from '../ui.js';
import { navigate }                                     from '../app.js';

// ── Main render ───────────────────────────────────────────────
export function renderSalesDashboard() {
  const jobs    = state.jobs;
  const booked  = jobs.filter(j => j.status === 'booked').length;
  const total   = jobs.length;
  const revenue = jobs.reduce((a, j) => a + (j.amount || 0), 0);

  const stats = [
    { label: 'Total Jobs',    value: total,                   color: 'blue',   meta: 'All time' },
    { label: 'Booked Today',  value: booked,                  color: 'yellow', meta: 'Pending assignment' },
    { label: 'Total Revenue', value: formatCurrency(revenue), color: 'green',  meta: 'Quoted amounts' },
    { label: 'Today',         value: todayJobs().length,      color: 'blue',   meta: 'Scheduled' },
  ];

  return `
  ${renderStatsGrid(stats)}
  <div class="page-header">
    <div><h2>Slot Grid</h2><p>Click an available slot to book a job</p></div>
  </div>
  <!-- Filters -->
  <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:20px">
    <div class="form-group" style="flex:0 0 auto">
      <label>Date</label>
      <input type="date" id="sales-date-filter" value="${today()}" onchange="window._salesRefreshGrid()" style="width:160px" />
    </div>
    <div class="form-group" style="flex:0 0 auto">
      <label>District</label>
      <select id="sales-district-filter" onchange="window._salesRefreshGrid()" style="width:140px">
        <option value="">Both Districts</option>
        <option value="Kochi">🏙 Kochi</option>
        <option value="Trivandrum">🌴 Trivandrum</option>
      </select>
    </div>
    <div class="form-group" style="flex:0 0 auto">
      <label>Service</label>
      <select id="sales-svc-filter" onchange="window._salesRefreshGrid()" style="width:160px">
        <option value="">All Services</option>
        ${[...new Set(state.services.map(s => s.name))].map(n => `<option value="${n}">${n}</option>`).join('')}
      </select>
    </div>
  </div>
  <!-- Slot legend -->
  <div class="slot-legend">
    <div class="slot-legend-item"><div class="slot-legend-dot" style="background:var(--green-dim);border:1px solid var(--green)"></div> Available</div>
    <div class="slot-legend-item"><div class="slot-legend-dot" style="background:var(--yellow-dim);border:1px solid var(--yellow)"></div> Booked</div>
    <div class="slot-legend-item"><div class="slot-legend-dot" style="background:var(--red-dim);border:1px solid var(--red)"></div> Blocked</div>
  </div>
  <!-- Grid -->
  <div id="sales-slot-grid"></div>
  <!-- Today's jobs list -->
  <div id="sales-today-jobs" style="margin-top:28px"></div>`;
}

// ── Refresh grid (called on filter change) ────────────────────
function refreshSalesGrid() {
  const date     = document.getElementById('sales-date-filter')?.value     || today();
  const district = document.getElementById('sales-district-filter')?.value || '';
  const svcName  = document.getElementById('sales-svc-filter')?.value      || '';
  const grid     = document.getElementById('sales-slot-grid');
  const jobDiv   = document.getElementById('sales-today-jobs');
  if (grid)   grid.innerHTML   = renderSlotGrid(date, district, svcName);
  if (jobDiv) jobDiv.innerHTML = renderTodayJobsList(date);
}
window._salesRefreshGrid = refreshSalesGrid;

// Trigger initial render after DOM paint
setTimeout(() => refreshSalesGrid(), 0);

// ── Slot grid renderer ────────────────────────────────────────
function renderSlotGrid(date, districtFilter, svcNameFilter) {
  let slots = state.slots.filter(s => s.date === date);
  if (districtFilter) slots = slots.filter(s => s.district === districtFilter);
  if (svcNameFilter)  slots = slots.filter(s => getService(s.service_id).name === svcNameFilter);

  if (!slots.length) {
    return `<div class="empty-state"><div class="empty-state-icon">📅</div><p class="empty-state-text">No slots for ${formatDate(date)}</p><p class="empty-state-sub">Ask the scheduler to add slots for this date</p></div>`;
  }

  // Group by district then service name
  const byDistrict = {};
  slots.forEach(s => {
    const svc = getService(s.service_id);
    const d   = s.district || svc.district || 'Both';
    const key = svc.name;
    if (!byDistrict[d]) byDistrict[d] = {};
    if (!byDistrict[d][key]) byDistrict[d][key] = [];
    byDistrict[d][key].push(s);
  });

  const DISTRICT_COLORS = { Kochi: '#2563eb', Trivandrum: '#7c3aed', Both: '#0891b2' };

  return Object.entries(byDistrict).map(([dist, svcGroups]) => {
    const dc = DISTRICT_COLORS[dist] || '#64748b';
    return `
      <div style="margin-bottom:28px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding:10px 16px;background:${dc}0e;border-left:4px solid ${dc};border-radius:0 8px 8px 0">
          <span style="font-size:18px">${dist === 'Kochi' ? '🏙' : dist === 'Trivandrum' ? '🌴' : '🗺'}</span>
          <span style="font-size:14px;font-weight:700;color:${dc}">${dist}</span>
        </div>
        ${Object.entries(svcGroups).map(([svcName, slotList]) => {
          const svc = getService(slotList[0].service_id);
          return `
            <div class="service-group-header">
              <div class="service-icon" style="background:${svc.color}18;border:1px solid ${svc.color}30">${svc.icon}</div>
              <div class="service-group-name">${svcName}</div>
            </div>
            <div class="slot-picker-grid" style="margin-bottom:16px">
              ${slotList.map(slot => renderSlotTile(slot)).join('')}
            </div>`;
        }).join('')}
      </div>`;
  }).join('');
}

function renderSlotTile(slot) {
  const job = state.jobs.find(j => j.slot_id === slot.id && j.status !== 'cancelled');
  const st  = slot.status;

  if (st === 'available') {
    return `<div class="slot-tile available" onclick="window._openBookingModal('${slot.id}')">
      <div class="slot-tile-time">${formatTime(slot.time)}</div>
      <div class="slot-tile-status">Available</div>
      <span class="slot-tile-check">✓</span>
    </div>`;
  }
  if (st === 'booked' && job) {
    return `<div class="slot-tile booked" onclick="window._openEditJobModal('${job.id}')">
      <div class="slot-tile-time">${formatTime(slot.time)}</div>
      <div style="font-size:11px;font-weight:600;color:var(--yellow);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${job.customer_name}</div>
      <div class="slot-tile-status">Booked</div>
    </div>`;
  }
  return `<div class="slot-tile blocked">
    <div class="slot-tile-time">${formatTime(slot.time)}</div>
    <div class="slot-tile-status">Blocked</div>
  </div>`;
}

// ── Today's jobs list ─────────────────────────────────────────
function todayJobs() {
  const t = today();
  return state.jobs.filter(j => {
    const slot = getSlot(j.slot_id);
    return slot?.date === t && j.status !== 'cancelled';
  });
}

function renderTodayJobsList(date) {
  const jobs = state.jobs.filter(j => {
    const slot = getSlot(j.slot_id);
    return slot?.date === date && j.status !== 'cancelled';
  });
  if (!jobs.length) return '';
  return `
    <div class="section-title">Jobs on ${formatDate(date)}</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Customer</th><th>Service</th><th>Time</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
        ${jobs.map(job => {
          const svc  = getService(job.service_id);
          const slot = getSlot(job.slot_id);
          return `<tr>
            <td><div style="font-weight:600">${job.customer_name}</div><div class="text-xs text-muted">${job.place || ''}</div></td>
            <td>${svc.icon} ${svc.name}</td>
            <td class="mono text-sm">${slot ? formatTime(slot.time) : '—'}</td>
            <td class="mono">${formatCurrency(job.amount)}</td>
            <td><span class="status status-${job.status}">${job.status}</span></td>
            <td><button class="btn btn-sm btn-secondary" onclick="window._openEditJobModal('${job.id}')">Edit</button></td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── Booking modal (new) ───────────────────────────────────────
window._openBookingModal = function(slotId) {
  const slot = state.slots.find(s => s.id === slotId);
  if (!slot) return;
  const svc = getService(slot.service_id);
  openModal('booking-modal', `
    <div class="modal modal-lg">
      <div class="modal-header">
        <div class="modal-title">📋 Book Job — ${svc.icon} ${svc.name} · ${formatTime(slot.time)}</div>
        <button class="modal-close" onclick="closeModal('booking-modal')">✕</button>
      </div>
      <div class="modal-form">
        ${bookingFields(slotId)}
        <!-- Text-paste import -->
        <details style="margin-top:4px">
          <summary style="cursor:pointer;font-size:12px;color:var(--text-muted);user-select:none">📋 Paste booking text (auto-fill)</summary>
          <div style="margin-top:8px;display:flex;gap:8px">
            <textarea id="paste-import-text" placeholder="Paste customer details block here..." style="flex:1;min-height:80px;font-size:12px"></textarea>
            <button class="btn btn-secondary btn-sm" onclick="window._parsePasteImport()">Parse</button>
          </div>
        </details>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('booking-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="window._submitBooking('${slotId}')">✓ Book Job</button>
      </div>
    </div>`);
};

function bookingFields(slotId, job = {}) {
  return `
    <input type="hidden" id="bk-slot-id" value="${slotId}" />
    <div class="form-row">
      <div class="form-group"><label>Customer Name *</label><input id="bk-name"     type="text"  placeholder="Full name"          value="${job.customer_name || ''}" /></div>
      <div class="form-group"><label>Phone *</label>         <input id="bk-phone"    type="tel"   placeholder="9876543210"         value="${job.phone || ''}" /></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Alt Phone</label>       <input id="bk-altphone" type="tel"   placeholder="Alternate number"   value="${job.alt_phone || ''}" /></div>
      <div class="form-group"><label>Place</label>           <input id="bk-place"    type="text"  placeholder="Area / locality"    value="${job.place || ''}" /></div>
    </div>
    <div class="form-group"><label>Address</label>           <input id="bk-address"  type="text"  placeholder="Full address"        value="${job.address || ''}" /></div>
    <div class="form-group"><label>Location Link</label>     <input id="bk-loclink"  type="url"   placeholder="Google Maps link"   value="${job.location_link || ''}" /></div>
    <div class="form-row">
      <div class="form-group"><label>Work Spec</label>       <input id="bk-spec"     type="text"  placeholder="e.g. AC Servicing"  value="${job.work_spec || ''}" /></div>
      <div class="form-group"><label>Work Details</label>    <textarea id="bk-details" placeholder="Describe the work needed...">${job.work_details || ''}</textarea></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Quoted Amount (₹)</label><input id="bk-amount"  type="number" placeholder="0"  value="${job.amount || ''}" /></div>
      <div class="form-group"><label>Advance (₹)</label>     <input id="bk-advance"  type="number" placeholder="0"  value="${job.advance || ''}" /></div>
    </div>`;
}

window._submitBooking = async function(slotId) {
  const name   = document.getElementById('bk-name')?.value.trim();
  const phone  = document.getElementById('bk-phone')?.value.trim();
  if (!name || !phone) { showToast('Name and phone are required', 'error'); return; }
  const slot   = state.slots.find(s => s.id === slotId);
  const jobData = {
    slot_id:       slotId,
    service_id:    slot?.service_id,
    customer_name: name,
    phone,
    alt_phone:     document.getElementById('bk-altphone')?.value.trim() || null,
    place:         document.getElementById('bk-place')?.value.trim()    || null,
    address:       document.getElementById('bk-address')?.value.trim()  || null,
    location_link: document.getElementById('bk-loclink')?.value.trim()  || null,
    work_spec:     document.getElementById('bk-spec')?.value.trim()     || null,
    work_details:  document.getElementById('bk-details')?.value.trim()  || null,
    amount:        parseFloat(document.getElementById('bk-amount')?.value)  || 0,
    advance:       parseFloat(document.getElementById('bk-advance')?.value) || 0,
    created_by:    window.currentUser?.id,
  };
  const result = await addJob(jobData);
  if (result) {
    closeModal('booking-modal');
    showToast(`Job booked for ${name}!`, 'success');
    refreshSalesGrid();
  }
};

// ── Edit job modal ────────────────────────────────────────────
window._openEditJobModal = function(jobId) {
  const job  = state.jobs.find(j => j.id === jobId);
  if (!job) return;
  const slot = getSlot(job.slot_id);
  const svc  = getService(job.service_id);
  openModal('edit-job-modal', `
    <div class="modal modal-lg">
      <div class="modal-header">
        <div class="modal-title">✏️ Edit Job — ${svc.icon} ${svc.name} · ${slot ? formatTime(slot.time) : ''}</div>
        <button class="modal-close" onclick="closeModal('edit-job-modal')">✕</button>
      </div>
      <div class="modal-form">
        ${bookingFields(job.slot_id, job)}
      </div>
      <div class="modal-footer">
        <button class="btn btn-danger" style="margin-right:auto" onclick="window._confirmCancelJob('${jobId}','${job.slot_id}')">🗑 Cancel Booking</button>
        <button class="btn btn-secondary" onclick="closeModal('edit-job-modal')">Close</button>
        <button class="btn btn-primary" onclick="window._saveEditJob('${jobId}')">Save Changes</button>
      </div>
    </div>`);
};

window._saveEditJob = async function(jobId) {
  const name  = document.getElementById('bk-name')?.value.trim();
  const phone = document.getElementById('bk-phone')?.value.trim();
  if (!name || !phone) { showToast('Name and phone required', 'error'); return; }
  const fields = {
    customer_name: name,
    phone,
    alt_phone:     document.getElementById('bk-altphone')?.value.trim() || null,
    place:         document.getElementById('bk-place')?.value.trim()    || null,
    address:       document.getElementById('bk-address')?.value.trim()  || null,
    location_link: document.getElementById('bk-loclink')?.value.trim()  || null,
    work_spec:     document.getElementById('bk-spec')?.value.trim()     || null,
    work_details:  document.getElementById('bk-details')?.value.trim()  || null,
    amount:        parseFloat(document.getElementById('bk-amount')?.value)  || 0,
    advance:       parseFloat(document.getElementById('bk-advance')?.value) || 0,
  };
  const result = await updateJob(jobId, fields);
  if (result) {
    closeModal('edit-job-modal');
    showToast('Job updated!', 'success');
    refreshSalesGrid();
  }
};

window._confirmCancelJob = function(jobId, slotId) {
  if (!confirm('Cancel this booking? The slot will be freed.')) return;
  cancelJob(jobId, slotId).then(() => {
    closeModal('edit-job-modal');
    showToast('Booking cancelled', 'info');
    refreshSalesGrid();
  });
};

// ── Paste-import parser ───────────────────────────────────────
window._parsePasteImport = function() {
  const raw = document.getElementById('paste-import-text')?.value || '';
  const get = (keys, text) => {
    for (const k of keys) {
      const m = text.match(new RegExp(k + '[➡:→\\-]?\\s*(.+)', 'i'));
      if (m) return m[1].trim();
    }
    return '';
  };
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('bk-name',    get(['Customer', 'Name', 'ഉപഭോക്താവ്'],  raw));
  set('bk-phone',   get(['Phone', 'Mobile', 'Ph'],            raw));
  set('bk-altphone',get(['Alt', 'Alternate'],                 raw));
  set('bk-place',   get(['Place', 'Area', 'Location'],        raw));
  set('bk-address', get(['Address', 'Addr'],                  raw));
  set('bk-loclink', get(['Map', 'Link', 'Location Link'],     raw));
  set('bk-spec',    get(['Work Spec', 'Spec', 'Job'],         raw));
  set('bk-details', get(['Work Details', 'Details', 'Note'],  raw));
  set('bk-amount',  get(['Amount', 'Amt', 'Price'],           raw));
  set('bk-advance', get(['Advance', 'Adv'],                   raw));
  showToast('Fields populated from paste text', 'success');
};
