// ============================================================
// js/realtime.js — Supabase Realtime subscriptions
// ============================================================
import { getClient, state } from './config.js';
import { addNotification }  from './ui.js';
import { getSlot }          from './db.js';

let _channel = null;

export function startRealtimeSubscription() {
  if (!window.currentUser || _channel) return;
  const sb   = getClient();
  const role = window.currentUser.role;

  _channel = sb.channel('fieldops-live')

    // ── Jobs: INSERT ──────────────────────────────────────────
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jobs' }, ({ new: job }) => {
      if (!state.jobs.find(j => j.id === job.id)) state.jobs.unshift(job);
      if (role === 'scheduler') addNotification('📋 New Job Booked', `${job.customer_name} · ${job.place}`);
    })

    // ── Jobs: UPDATE ──────────────────────────────────────────
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs' }, ({ new: job, old }) => {
      const idx = state.jobs.findIndex(j => j.id === job.id);
      if (idx >= 0) state.jobs[idx] = { ...state.jobs[idx], ...job };
      else           state.jobs.unshift(job);

      if (role === 'scheduler' && job.status === 'completed' && old.status !== 'completed') {
        addNotification('✅ Report Submitted', `${job.customer_name} — ${job.work_status}`);
      }
    })

    // ── Slots: UPDATE ─────────────────────────────────────────
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'slots' }, ({ new: slot }) => {
      const idx = state.slots.findIndex(s => s.id === slot.id);
      if (idx >= 0) state.slots[idx] = { ...state.slots[idx], ...slot };
    })

    .subscribe();
}

export function stopRealtimeSubscription() {
  if (_channel) {
    getClient().removeChannel(_channel);
    _channel = null;
  }
}
