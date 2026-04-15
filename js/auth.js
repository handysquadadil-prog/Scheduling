// ============================================================
// js/auth.js — Authentication (Supabase Auth + role loading)
// ============================================================
import { getClient } from './config.js';
import { initApp }   from './app.js';
import { showToast } from './ui.js';

// ── Login with email / password ─────────────────────────────
export async function handleLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btnText  = document.getElementById('login-btn-text');

  if (!email || !password) { showLoginError('Please enter email and password.'); return; }

  btnText.textContent = 'Signing in…';
  document.getElementById('login-error').classList.add('hidden');

  try {
    const sb = getClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await loadUserAndInit(data.user);
  } catch (err) {
    showLoginError(err.message || 'Login failed. Check your credentials.');
    btnText.textContent = 'Sign In';
  }
}

// ── Quick demo login (no Supabase) ───────────────────────────
export function quickLogin(role) {
  const user = {
    id:    'demo-' + role,
    email: role + '@demo.fieldops',
    role,
    name:  role.charAt(0).toUpperCase() + role.slice(1) + ' Demo',
  };
  window.currentUser = user;
  initApp(user);
}

// ── Logout ───────────────────────────────────────────────────
export async function handleLogout() {
  stopRealtimeSubscription();
  const sb = getClient();
  await sb.auth.signOut().catch(() => {});
  window.currentUser = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-email').value    = '';
  document.getElementById('login-password').value = '';
}

// ── Check existing session on page load ─────────────────────
export async function checkSession() {
  try {
    const sb = getClient();
    const { data: { session } } = await sb.auth.getSession();
    if (session?.user) await loadUserAndInit(session.user);
  } catch (_e) { /* silent */ }
}

// ── Load user profile from `users` table ────────────────────
async function loadUserAndInit(authUser) {
  try {
    const sb = getClient();
    const { data: profile, error } = await sb
      .from('users').select('*').eq('id', authUser.id).single();
    if (error && error.code !== 'PGRST116') console.warn('Profile fetch:', error.message);
    const user = {
      id:    authUser.id,
      email: authUser.email,
      name:  profile?.name || authUser.email,
      role:  profile?.role || 'sales',
    };
    window.currentUser = user;
    await initApp(user);
  } catch (err) {
    showLoginError('Logged in but failed to load profile: ' + err.message);
  }
}

// ── Helpers ──────────────────────────────────────────────────
function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  document.getElementById('login-btn-text').textContent = 'Sign In';
}

// Import here to avoid circular deps
import { stopRealtimeSubscription } from './realtime.js';
