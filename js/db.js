// ============================================================
// js/db.js — All Supabase database operations
// ============================================================
import { getClient, state, MOCK_SERVICES } from './config.js';
import { showToast }                        from './ui.js';

// ── Load all app data on login ───────────────────────────────
export async function loadAppData() {
  try {
    const sb = getClient();
    const [jobsRes, slotsRes, techRes, svcRes] = await Promise.all([
      sb.from('jobs').select('*').order('created_at', { ascending: false }),
      sb.from('slots').select('*').order('date').order('time'),
      sb.from('technicians').select('*').eq('is_active', true).order('name'),
      sb.from('services').select('*'),
    ]);

    if (jobsRes.error?.code === '42501') showToast('⚠️ RLS blocking jobs — enable policy in Supabase', 'error');
    else if (jobsRes.data) state.jobs = jobsRes.data;

    if (slotsRes.data)  state.slots       = slotsRes.data;
    if (techRes.data)   state.technicians = techRes.data;

    if (svcRes.data && svcRes.data.length > 0) {
      state.services = svcRes.data.map(s => ({
        ...s,
        icon:  s.icon  || getServiceMeta(s.name).icon,
        color: s.color || getServiceMeta(s.name).color,
      }));
    } else {
      state.services = [...MOCK_SERVICES];
    }
  } catch (e) {
    console.error('loadAppData error:', e);
  }
}

// ── Lookup helpers ───────────────────────────────────────────
export function getService(id)      { return state.services.find(s => s.id === id) || { name: '—', icon: '?', color: '#888', segment: 'All' }; }
export function getSlot(id)         { return state.slots.find(s => s.id === id); }
export function getTechnicians(segment = null) {
  const all = state.technicians.filter(t => t.is_active !== false);
  if (!segment || segment === 'All') return all;
  return all.filter(t => t.segment === segment || t.segment === 'All');
}

// ── Jobs ─────────────────────────────────────────────────────
export async function addJob(jobData) {
  const sb     = getClient();
  const newJob = { ...jobData, created_at: new Date().toISOString(), status: 'booked' };
  const { data, error } = await sb.from('jobs').insert(newJob).select().single();
  if (error) { showToast('Failed to save job: ' + error.message, 'error'); return null; }
  state.jobs.unshift(data);
  await updateSlotStatus(jobData.slot_id, 'booked');
  return data;
}

export async function updateJob(jobId, fields) {
  const sb = getClient();
  const { data, error } = await sb.from('jobs').update(fields).eq('id', jobId).select().single();
  if (error) { showToast('Failed to update job: ' + error.message, 'error'); return null; }
  const idx = state.jobs.findIndex(j => j.id === jobId);
  if (idx >= 0) state.jobs[idx] = { ...state.jobs[idx], ...data };
  return data;
}

export async function cancelJob(jobId, slotId) {
  const sb = getClient();
  await sb.from('jobs').update({ status: 'cancelled' }).eq('id', jobId);
  const idx = state.jobs.findIndex(j => j.id === jobId);
  if (idx >= 0) state.jobs[idx].status = 'cancelled';
  await updateSlotStatus(slotId, 'available');
}

export async function submitReport(jobId, reportData) {
  const fields = {
    ...reportData,
    status:             'completed',
    report_submitted_at: new Date().toISOString(),
  };
  return updateJob(jobId, fields);
}

// ── Slots ─────────────────────────────────────────────────────
export async function createSlot(slotData) {
  const sb = getClient();
  const { data, error } = await sb.from('slots').insert(slotData).select().single();
  if (error) { showToast('Failed to create slot: ' + error.message, 'error'); return null; }
  state.slots.push(data);
  return data;
}

export async function updateSlotStatus(slotId, status) {
  const sb = getClient();
  await sb.from('slots').update({ status }).eq('id', slotId);
  const slot = state.slots.find(s => s.id === slotId);
  if (slot) slot.status = status;
}

export async function assignTechToSlot(slotId, technicianId) {
  const sb = getClient();
  await sb.from('slots').update({ technician_id: technicianId }).eq('id', slotId);
  const slot = state.slots.find(s => s.id === slotId);
  if (slot) slot.technician_id = technicianId;
  // Also mark related booked jobs as assigned
  const jobs = state.jobs.filter(j => j.slot_id === slotId && j.status === 'booked');
  for (const j of jobs) {
    await sb.from('jobs').update({ status: 'assigned' }).eq('id', j.id);
    j.status = 'assigned';
  }
}

export async function deleteSlot(slotId) {
  const sb = getClient();
  const { error } = await sb.from('slots').delete().eq('id', slotId);
  if (error) { showToast('Failed to delete slot: ' + error.message, 'error'); return false; }
  const idx = state.slots.findIndex(s => s.id === slotId);
  if (idx >= 0) state.slots.splice(idx, 1);
  return true;
}

export async function copySlotsFromDate(sourceDate, targetDate, serviceId = null, district = null) {
  const sb = getClient();
  const { data, error } = await sb.rpc('copy_slots', {
    p_source_date: sourceDate,
    p_target_date: targetDate,
    p_service_id:  serviceId || null,
    p_district:    district  || null,
  });
  if (error) { showToast('Copy failed: ' + error.message, 'error'); return 0; }
  // Reload slots after copy
  const res = await sb.from('slots').select('*').eq('date', targetDate);
  if (res.data) {
    const existing = state.slots.filter(s => s.date !== targetDate);
    state.slots = [...existing, ...res.data].sort((a, b) => a.time.localeCompare(b.time));
  }
  return data || 0;
}

// ── Technicians (CRUD) ───────────────────────────────────────
export async function addTechnician(tech) {
  const sb = getClient();
  const { data, error } = await sb.from('technicians').insert(tech).select().single();
  if (error) { showToast('Failed to add technician: ' + error.message, 'error'); return null; }
  state.technicians.push(data);
  return data;
}

export async function updateTechnician(id, fields) {
  const sb = getClient();
  const { data, error } = await sb.from('technicians').update(fields).eq('id', id).select().single();
  if (error) { showToast('Failed to update technician: ' + error.message, 'error'); return null; }
  const idx = state.technicians.findIndex(t => t.id === id);
  if (idx >= 0) state.technicians[idx] = { ...state.technicians[idx], ...data };
  return data;
}

export async function deleteTechnician(id) {
  // Soft delete — set is_active = false
  const result = await updateTechnician(id, { is_active: false });
  if (result) {
    const idx = state.technicians.findIndex(t => t.id === id);
    if (idx >= 0) state.technicians.splice(idx, 1);
  }
  return result;
}

// ── Utilities ─────────────────────────────────────────────────
const SERVICE_META = {
  'ac':           { icon: '❄️',  color: '#3b82f6' },
  'electrical':   { icon: '⚡',  color: '#eab308' },
  'plumbing':     { icon: '🪠',  color: '#22c55e' },
  'carpentry':    { icon: '🪚',  color: '#f97316' },
  'pest control': { icon: '🪲',  color: '#a855f7' },
  'cleaning':     { icon: '🧹',  color: '#06b6d4' },
  'painting':     { icon: '🖌️', color: '#ec4899' },
};

function getServiceMeta(name = '') {
  const key = name.toLowerCase().trim();
  return SERVICE_META[key]
    || Object.entries(SERVICE_META).find(([k]) => key.includes(k))?.[1]
    || { icon: '🔧', color: '#3b82f6' };
}
