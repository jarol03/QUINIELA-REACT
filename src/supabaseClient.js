import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const ADMIN_USERNAME = "luis02";
export const ADMIN_PASSWORD = "lespinal02h";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SESSION_KEY = "qn_session";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

export function saveSession(userData) {
  const session = { ...userData, expires_at: Date.now() + SESSION_DURATION_MS };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession() {
  const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (Date.now() > session.expires_at) { clearSession(); return null; }
    return session;
  } catch { clearSession(); return null; }
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem("quinela_user");
}

export async function verifyUserStillExists(userId) {
  if (userId === "admin") return true;
  const { data, error } = await supabase
    .from("usuarios").select("id").eq("id", userId).single();
  return !error && !!data;
}