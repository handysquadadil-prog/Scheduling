// ============================================================
// js/config.js — Supabase credentials & app-wide constants
// ============================================================

export const SUPABASE_URL  = 'https://egdseuuzjpqwpeclpujj.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnZHNldXV6anBxd3BlY2xwdWpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzODQxNDUsImV4cCI6MjA5MDk2MDE0NX0.n1oZDVPtN68ExgrWMi8bzgleXlz4aIXsqPPQG6BGeDE';

export const DISTRICTS = ['Kochi', 'Trivandrum'];

// Supabase singleton
let _sb = null;
export function getClient() {
  if (!_sb) _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  return _sb;
}

// Fallback services (used if DB is empty)
export const MOCK_SERVICES = [
  // Kochi
  { id: 'svc-kochi-clean', name: 'Cleaning',     icon: '🧹',  color: '#0891b2', segment: 'Cleaning',     district: 'Kochi' },
  // Trivandrum
  { id: 'svc-tvm-ac',      name: 'AC',           icon: '❄️',  color: '#2563eb', segment: 'AC',           district: 'Trivandrum' },
  { id: 'svc-tvm-elec',    name: 'Electrical',   icon: '⚡',  color: '#d97706', segment: 'Electrical',   district: 'Trivandrum' },
  { id: 'svc-tvm-plumb',   name: 'Plumbing',     icon: '🪠',  color: '#16a34a', segment: 'Plumbing',     district: 'Trivandrum' },
  { id: 'svc-tvm-carp',    name: 'Carpentry',    icon: '🪚',  color: '#ea580c', segment: 'Carpentry',    district: 'Trivandrum' },
  { id: 'svc-tvm-pest',    name: 'Pest Control', icon: '🪲',  color: '#7c3aed', segment: 'Pest Control', district: 'Trivandrum' },
  { id: 'svc-tvm-maint',   name: 'Maintenance',     icon: '🖌️', color: '#db2777', segment: 'Maintenance',     district: 'Trivandrum' },
  { id: 'svc-tvm-clean',   name: 'Cleaning',     icon: '🧹',  color: '#0891b2', segment: 'Cleaning',     district: 'Trivandrum' },
];

// Global reactive state
export const state = {
  jobs:        [],
  slots:       [],
  technicians: [],
  services:    [...MOCK_SERVICES],
};
