import { createClient } from "@insforge/sdk";

const INSFORGE_URL = import.meta.env.VITE_INSFORGE_URL;
const INSFORGE_ANON_KEY = import.meta.env.VITE_INSFORGE_ANON_KEY;

export const insforge = createClient({
  baseUrl: INSFORGE_URL,
  anonKey: INSFORGE_ANON_KEY,
});

export const ADMIN_USERNAME = "luis02";
export const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;

const SESSION_KEY = "qn_session";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

export function saveSession(userData) {
  const session = {
    ...userData,
    expires_at: Date.now() + SESSION_DURATION_MS,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession() {
  const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (Date.now() > session.expires_at) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem("quinela_user");
}

export async function verifyUserStillExists(userId) {
  if (userId === "admin") return true;
  const { data, error } = await insforge.database
    .from("usuarios")
    .select("id")
    .eq("id", userId)
    .single();
  return !error && !!data;
}
