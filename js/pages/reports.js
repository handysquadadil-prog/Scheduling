// ============================================================
// js/pages/reports.js — Reports, Analytics & CSV (v2)
// New: segment analysis, district analysis, complaints view
// ============================================================
import { state, DISTRICTS }             from '../config.js';
import { getService, getSlot, updateJob } from '../db.js';
import { showToast, today, formatDate,
         formatTime, formatCurrency,
         renderStatsGrid, downloadCSV } from '../ui.js';

// ─────────────────────────────────────────────────────────────
// MAIN RENDER — tabbed view
// ─────────────────────────────────────────────────────────────
export function renderReportsPage() {
  return `
  <div class="page-header">
    <div><h2>Reports & Analytics</h2><p>Job performance, district breakdowns, complaints and CSV export</p></div>
    <div style="display:flex;gap:8px">
      <input type="date" id="rpt-date-from" style="width:145px" />
      <input type="date" id="rpt-date-to"   style="width:145px" />
      <button class="btn btn-secondary" onclick="window._refreshAllReports()">Filter</button>
      <button class="btn btn-primary"   onclick="window._exportCSV()">⬇ CSV Export</button>
    </div>
  </div>

  <!-- Tabs -->
  <div class="tabs" style="margin-bottom:0">
    <div class="tab active" onclick="window._switchReportTab('overview',  this)">Overview</div>
    <div class="tab"        onclick="window._switchReportTab('segment',   this)">By Segment</div>
    <div class="tab"        onclick="window._switchReportTab('district',  this)">By District</div>
    <div class="tab"        onclick="window._switchReportTab('completed', this)">Completed Jobs</div>
    <div class="tab"        onclick="window._switchReportTab('complaints',this)">Complaints</div>
  </div>
  <div id="report-tab-body" style="margin-top:20px">${renderOverview()}</div>`;
}

// ─────────────────────────────────────────────────────────────
// TAB SWITCH
// ─────────────────────────────────────────────────────────────
window._switchReportTab = function(tab, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const from = document.getElementById('rpt-date-from')?.value || '';
  const to   = document.getElementById('rpt-date-to')?.value   || '';
  const body = document.getElementById('report-tab-body');
  if (!body) return;
  if (tab === 'overview')   body.innerHTML = renderOverview(from, to);
  if (tab === 'segment')    body.innerHTML = renderSegmentAnalysis(from, to);
  if (tab === 'district')   body.innerHTML = renderDistrictAnalysis(from, to);
  if (tab === 'completed')  body.innerHTML = renderCompletedJobs(from, to);
  if (tab === 'complaints') body.innerHTML = renderComplaints();
};

window._refreshAllReports = function() {
  const active = document.querySelector('.tab.active');
  if (active) active.click();
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function filterJobs(from = '', to = '') {
  let jobs = state.jobs;
  if (from) jobs = jobs.filter(j => { const s = getSlot(j.slot_id); return (j.executed_date || s?.date || '') >= from; });
  if (to)   jobs = jobs.filter(j => { const s = getSlot(j.slot_id); return (j.executed_date || s?.date || '') <= to; });
  return jobs;
}

function completedJobs(from = '', to = '') {
  return filterJobs(from, to).filter(j => j.status === 'completed');
}

function jobDistrict(j) {
  const slot = getSlot(j.slot_id);
  if (slot?.district) return slot.district;
  return getService(j.service_id)?.district || '—';
}

// ─────────────────────────────────────────────────────────────
// OVERVIEW TAB
// ─────────────────────────────────────────────────────────────
function renderOverview(from = '', to = '') {
  const all       = filterJobs(from, to);
  const done      = completedJobs(from, to);
  const revenue   = done.reduce((a, j) => a + (j.final_amount || j.amount || 0), 0);
  const advance   = all.reduce((a, j) => a + (j.advance || 0), 0);
  const material  = done.reduce((a, j) => a + (j.material_cost || 0), 0);
  const complaints = all.filter(j => j.complaint).length;
  const unresolved = all.filter(j => j.complaint && !j.supervisor_notified).length;

  const stats = [
    { label: 'Total Jobs',      value: all.length,                color: 'blue',   meta: from || to ? 'Filtered' : 'All time' },
    { label: 'Completed',       value: done.length,               color: 'green',  meta: `${all.length ? Math.round(done.length / all.length * 100) : 0}% rate` },
    { label: 'Revenue',         value: formatCurrency(revenue),   color: 'green',  meta: 'Final amounts' },
    { label: 'Material Cost',   value: formatCurrency(material),  color: 'red',    meta: 'Site expenses' },
    { label: 'Advance Collected', value: formatCurrency(advance), color: 'yellow', meta: 'Pre-collected' },
    { label: 'Complaints',      value: complaints,                color: 'red',    meta: `${unresolved} unresolved` },
    { label: 'Kochi Jobs',      value: all.filter(j => jobDistrict(j) === 'Kochi').length,       color: 'blue',   meta: 'District' },
    { label: 'Trivandrum Jobs', value: all.filter(j => jobDistrict(j) === 'Trivandrum').length,  color: 'orange', meta: 'District' },
  ];

  // Monthly trend (last 6 months)
  const monthly = {};
  done.forEach(j => {
    const slot = getSlot(j.slot_id);
    const d    = j.executed_date || slot?.date || '';
    if (!d) return;
    const key  = d.substring(0, 7); // YYYY-MM
    if (!monthly[key]) monthly[key] = { jobs: 0, revenue: 0 };
    monthly[key].jobs++;
    monthly[key].revenue += j.final_amount || j.amount || 0;
  });
  const sortedMonths = Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b)).slice(-6);

  return `
  ${renderStatsGrid(stats)}
  ${sortedMonths.length > 0 ? `
  <div class="section-title" style="margin-top:8px">Monthly Trend (Last 6 Months)</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:24px">
    ${sortedMonths.map(([month, data]) => `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center">
        <div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:6px">${month}</div>
        <div style="font-size:22px;font-weight:700;color:#2563eb">${data.jobs}</div>
        <div style="font-size:11px;color:#94a3b8">jobs</div>
        <div style="font-size:14px;font-weight:600;color:#16a34a;margin-top:4px">${formatCurrency(data.revenue)}</div>
      </div>`).join('')}
  </div>` : ''}`;
}

// ─────────────────────────────────────────────────────────────
// SEGMENT ANALYSIS TAB
// ─────────────────────────────────────────────────────────────
function renderSegmentAnalysis(from = '', to = '') {
  const all = filterJobs(from, to);
  const segments = {};
  all.forEach(j => {
    const seg = getService(j.service_id)?.segment || 'Unknown';
    if (!segments[seg]) segments[seg] = { total: 0, completed: 0, revenue: 0, complaints: 0, advance: 0 };
    segments[seg].total++;
    segments[seg].advance += j.advance || 0;
    if (j.status === 'completed') {
      segments[seg].completed++;
      segments[seg].revenue += j.final_amount || j.amount || 0;
    }
    if (j.complaint) segments[seg].complaints++;
  });

  const sorted = Object.entries(segments).sort(([, a], [, b]) => b.revenue - a.revenue);
  if (!sorted.length) return `<div class="empty-state"><div class="empty-state-icon">📊</div><p class="empty-state-text">No data for this period</p></div>`;

  const maxRevenue = Math.max(...sorted.map(([, d]) => d.revenue), 1);

  return `
  <div class="section-title">Revenue by Segment</div>
  <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:28px">
    ${sorted.map(([seg, data]) => {
      const pct = Math.round(data.revenue / maxRevenue * 100);
      const SEG_COLORS = { AC:'#2563eb', Electrical:'#d97706', Plumbing:'#16a34a', Carpentry:'#ea580c', 'Pest Control':'#7c3aed', Painting:'#db2777', Cleaning:'#0891b2' };
      const col = SEG_COLORS[seg] || '#64748b';
      return `
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <span style="font-size:14px;font-weight:700;color:#1e293b">${seg}</span>
            <div style="display:flex;gap:16px;font-size:12px">
              <span style="color:#64748b">${data.total} jobs</span>
              <span style="color:#16a34a;font-weight:600">${formatCurrency(data.revenue)}</span>
              ${data.complaints ? `<span style="color:#dc2626;font-weight:600">⚠️ ${data.complaints}</span>` : ''}
            </div>
          </div>
          <div style="background:#f1f5f9;border-radius:100px;height:8px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${col};border-radius:100px;transition:width 0.4s ease"></div>
          </div>
          <div style="display:flex;gap:20px;margin-top:8px;font-size:11px;color:#94a3b8">
            <span>✅ ${data.completed} completed (${data.total ? Math.round(data.completed/data.total*100) : 0}%)</span>
            <span>💳 Advance: ${formatCurrency(data.advance)}</span>
          </div>
        </div>`;
    }).join('')}
  </div>

  <div class="section-title">Segment Summary Table</div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Segment</th><th>Total</th><th>Completed</th><th>Rate</th><th>Revenue</th><th>Avg Value</th><th>Complaints</th></tr></thead>
      <tbody>
      ${sorted.map(([seg, data]) => `<tr>
        <td style="font-weight:600">${seg}</td>
        <td>${data.total}</td>
        <td>${data.completed}</td>
        <td>${data.total ? Math.round(data.completed/data.total*100) : 0}%</td>
        <td style="font-family:monospace;font-weight:600;color:#16a34a">${formatCurrency(data.revenue)}</td>
        <td style="font-family:monospace">${data.completed ? formatCurrency(data.revenue / data.completed) : '—'}</td>
        <td style="${data.complaints ? 'color:#dc2626;font-weight:600' : 'color:#94a3b8'}">${data.complaints || 0}</td>
      </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// DISTRICT ANALYSIS TAB
// ─────────────────────────────────────────────────────────────
function renderDistrictAnalysis(from = '', to = '') {
  const all = filterJobs(from, to);
  const districts = {};

  all.forEach(j => {
    const d = jobDistrict(j);
    if (!districts[d]) districts[d] = { total: 0, completed: 0, revenue: 0, advance: 0, complaints: 0, bySegment: {} };
    districts[d].total++;
    districts[d].advance += j.advance || 0;
    if (j.status === 'completed') {
      districts[d].completed++;
      districts[d].revenue += j.final_amount || j.amount || 0;
    }
    if (j.complaint) districts[d].complaints++;
    const seg = getService(j.service_id)?.segment || 'Other';
    districts[d].bySegment[seg] = (districts[d].bySegment[seg] || 0) + 1;
  });

  const DIST_ICONS = { Kochi: '🏙', Trivandrum: '🌴' };
  const DIST_COLORS = { Kochi: '#2563eb', Trivandrum: '#7c3aed' };

  return `
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:20px;margin-bottom:28px">
    ${Object.entries(districts).map(([dist, data]) => {
      const col = DIST_COLORS[dist] || '#64748b';
      return `
        <div style="background:#fff;border:2px solid ${col}30;border-radius:12px;overflow:hidden">
          <div style="background:${col}12;padding:16px 20px;border-bottom:1px solid ${col}20;display:flex;align-items:center;gap:10px">
            <span style="font-size:24px">${DIST_ICONS[dist] || '📍'}</span>
            <div>
              <div style="font-size:16px;font-weight:700;color:${col}">${dist}</div>
              <div style="font-size:12px;color:#64748b">${data.total} jobs · ${formatCurrency(data.revenue)} revenue</div>
            </div>
          </div>
          <div style="padding:16px 20px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
              <div style="text-align:center;background:#f0fdf4;border-radius:8px;padding:10px">
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b">Completed</div>
                <div style="font-size:22px;font-weight:700;color:#16a34a">${data.completed}</div>
              </div>
              <div style="text-align:center;background:#eff6ff;border-radius:8px;padding:10px">
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b">Completion</div>
                <div style="font-size:22px;font-weight:700;color:${col}">${data.total ? Math.round(data.completed/data.total*100) : 0}%</div>
              </div>
              <div style="text-align:center;background:#fefce8;border-radius:8px;padding:10px">
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b">Advance</div>
                <div style="font-size:15px;font-weight:700;color:#854d0e">${formatCurrency(data.advance)}</div>
              </div>
              <div style="text-align:center;background:${data.complaints ? '#fef2f2' : '#f8fafc'};border-radius:8px;padding:10px">
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b">Complaints</div>
                <div style="font-size:22px;font-weight:700;color:${data.complaints ? '#dc2626' : '#94a3b8'}">${data.complaints}</div>
              </div>
            </div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:8px">Jobs by Segment</div>
            ${Object.entries(data.bySegment).sort(([,a],[,b]) => b-a).map(([seg, cnt]) => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f1f5f9;font-size:12px">
                <span style="color:#475569">${seg}</span>
                <span style="font-weight:600;color:#1e293b">${cnt}</span>
              </div>`).join('')}
          </div>
        </div>`;
    }).join('')}
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// COMPLETED JOBS TABLE
// ─────────────────────────────────────────────────────────────
function renderCompletedJobs(from = '', to = '') {
  const done = completedJobs(from, to);
  if (!done.length) return `<div class="empty-state"><div class="empty-state-icon">📋</div><p class="empty-state-text">No completed jobs${from || to ? ' in this range' : ''}</p></div>`;

  const revenue  = done.reduce((a, j) => a + (j.final_amount || j.amount || 0), 0);
  const material = done.reduce((a, j) => a + (j.material_cost || 0), 0);

  return `
  ${renderStatsGrid([
    { label: 'Completed Jobs',  value: done.length,              color: 'blue',  meta: from||to ? 'Filtered' : 'All time' },
    { label: 'Revenue',         value: formatCurrency(revenue),  color: 'green', meta: 'Final amounts' },
    { label: 'Material Cost',   value: formatCurrency(material), color: 'red',   meta: 'Site expenses' },
    { label: 'Net Revenue',     value: formatCurrency(revenue - material), color: 'green', meta: 'After materials' },
  ])}
  <div class="table-wrap">
    <table>
      <thead><tr><th>Customer</th><th>Service</th><th>District</th><th>Exec Date</th><th>Techs</th><th>Site In</th><th>Work Start</th><th>Site Out</th><th>Final</th><th>Payment</th><th>Status</th></tr></thead>
      <tbody>
      ${done.map(j => {
        const svc  = getService(j.service_id);
        const slot = getSlot(j.slot_id);
        const techStr = [j.tech_1, j.tech_2, j.tech_3, j.tech_4].filter(Boolean).join(', ');
        return `<tr>
          <td><div style="font-weight:600">${j.customer_name}</div><div style="font-size:11px;color:#94a3b8">${j.place||''}</div></td>
          <td>${svc.icon} ${svc.name}</td>
          <td><span style="font-size:11px;background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:12px">${jobDistrict(j)}</span></td>
          <td style="font-size:12px">${formatDate(j.executed_date || slot?.date)}</td>
          <td style="font-size:11px;color:#475569">${techStr || '—'}</td>
          <td style="font-family:monospace;font-size:11px">${j.site_in ? formatTime(j.site_in) : '—'}</td>
          <td style="font-family:monospace;font-size:11px;color:#2563eb">${j.work_started_time ? formatTime(j.work_started_time) : '—'}</td>
          <td style="font-family:monospace;font-size:11px">${j.site_out ? formatTime(j.site_out) : '—'}</td>
          <td style="font-family:monospace;font-weight:600;color:#16a34a">${formatCurrency(j.final_amount || j.amount)}</td>
          <td style="font-size:11px">${j.mode_of_payment || '—'}</td>
          <td><span class="status status-completed">${j.work_status || 'Completed'}</span></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// COMPLAINTS TAB
// ─────────────────────────────────────────────────────────────
function renderComplaints() {
  const jobs = state.jobs.filter(j => j.complaint && j.complaint.trim());
  if (!jobs.length) return `<div class="empty-state"><div class="empty-state-icon">✅</div><p class="empty-state-text">No complaints on record</p></div>`;

  const unresolved = jobs.filter(j => !j.supervisor_notified);
  const resolved   = jobs.filter(j => j.supervisor_notified);

  const renderCard = (j) => {
    const svc  = getService(j.service_id);
    const slot = getSlot(j.slot_id);
    return `
      <div style="background:#fff;border:1px solid ${j.supervisor_notified ? '#bbf7d0' : '#fca5a5'};border-left:4px solid ${j.supervisor_notified ? '#16a34a' : '#dc2626'};border-radius:8px;padding:16px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <div>
            <span style="font-weight:700;font-size:14px">${j.customer_name}</span>
            <span style="font-size:12px;color:#64748b;margin-left:8px">${svc.icon} ${svc.name} · ${jobDistrict(j)}</span>
          </div>
          <span style="font-size:11px;color:${j.supervisor_notified ? '#16a34a' : '#dc2626'};font-weight:700">${j.supervisor_notified ? '✓ Notified' : '⚠️ Pending'}</span>
        </div>
        <div style="font-size:13px;color:#374151;background:#fef9f9;border-radius:6px;padding:8px 10px;margin-bottom:8px">"${j.complaint}"</div>
        <div style="font-size:11px;color:#64748b;display:flex;gap:16px;flex-wrap:wrap">
          <span>📅 ${formatDate(slot?.date || j.executed_date)}</span>
          <span>👷 Supervisor: <strong>${j.supervisor || '—'}</strong></span>
          ${j.complaint_raised_at ? `<span>🕐 Raised: ${new Date(j.complaint_raised_at).toLocaleString('en-IN')}</span>` : ''}
          ${j.supervisor_notified_at ? `<span>📨 Notified: ${new Date(j.supervisor_notified_at).toLocaleString('en-IN')}</span>` : ''}
        </div>
        ${!j.supervisor_notified ? `
        <button class="btn btn-sm" style="margin-top:10px;background:#2563eb;color:#fff;border:none" onclick="window._notifySupervisorFromReport('${j.id}')">
          📨 Mark Supervisor Notified
        </button>` : ''}
      </div>`;
  };

  return `
  ${unresolved.length ? `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <span style="font-size:14px;font-weight:700;color:#dc2626">⚠️ Unresolved (${unresolved.length})</span>
    </div>
    ${unresolved.map(renderCard).join('')}` : ''}
  ${resolved.length ? `
    <div style="display:flex;align-items:center;gap:8px;margin:20px 0 12px">
      <span style="font-size:14px;font-weight:700;color:#16a34a">✅ Resolved (${resolved.length})</span>
    </div>
    ${resolved.map(renderCard).join('')}` : ''}`;
}

window._notifySupervisorFromReport = async function(jobId) {
  await updateJob(jobId, {
    supervisor_notified:    true,
    supervisor_notified_at: new Date().toISOString(),
  });
  showToast('Supervisor notification recorded!', 'success');
  const body = document.getElementById('report-tab-body');
  if (body) body.innerHTML = renderComplaints();
};

// ─────────────────────────────────────────────────────────────
// CSV EXPORT
// ─────────────────────────────────────────────────────────────
window._exportCSV = function() {
  const from = document.getElementById('rpt-date-from')?.value || '';
  const to   = document.getElementById('rpt-date-to')?.value   || '';
  const done = completedJobs(from, to);
  if (!done.length) { showToast('No completed jobs to export', 'warning'); return; }

  const rows = done.map(j => {
    const svc  = getService(j.service_id);
    const slot = getSlot(j.slot_id);
    return {
      'ID':                 j.id,
      'Customer Name':      j.customer_name,
      'Phone':              j.phone,
      'Alt Phone':          j.alt_phone || '',
      'Place':              j.place     || '',
      'Address':            j.address   || '',
      'Service':            svc.name,
      'Segment':            svc.segment,
      'District':           jobDistrict(j),
      'Work Spec':          j.work_spec    || '',
      'Work Details':       j.work_details || '',
      'Scheduled Date':     slot?.date     || '',
      'Executed Date':      j.executed_date || '',
      'Amount':             j.amount        || 0,
      'Advance':            j.advance       || 0,
      'Final Amount':       j.final_amount  || j.amount || 0,
      'Mode of Payment':    j.mode_of_payment || '',
      'Material Cost':      j.material_cost   || 0,
      'Tech-1':             j.tech_1          || '',
      'Tech-2 / Outsider':  j.tech_2          || j.outsider_name || '',
      'Tech-3':             j.tech_3          || '',
      'Tech-4':             j.tech_4          || '',
      'Supervisor':         j.supervisor      || '',
      'Site In':            j.site_in             || '',
      'Work Started':       j.work_started_time   || '',
      'Site Out':           j.site_out            || '',
      'Distance (km)':      j.distance            || '',
      'Work Status':        j.work_status         || '',
      'Notes':              j.notes               || '',
      'Feedback Call':      j.feedback_call_note  || '',
      'Complaint':          j.complaint           || '',
      'Supervisor Notified': j.supervisor_notified ? 'Yes' : 'No',
      'Report At':          j.report_submitted_at || '',
    };
  });

  downloadCSV(rows, `fieldops-report-${today()}.csv`);
};
