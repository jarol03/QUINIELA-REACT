import { createClient as createInsforgeClient } from "@insforge/sdk";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const provider = import.meta.env.VITE_BACKEND || "insforge";
console.log("🔌 DB provider:", provider === "supabase" ? "SUPABASE" : "INSFORGE");

let db;
if (provider === "supabase") {
  db = createSupabaseClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
  );
} else {
  db = createInsforgeClient({
    baseUrl: import.meta.env.VITE_INSFORGE_URL,
    anonKey: import.meta.env.VITE_INSFORGE_ANON_KEY,
  }).database;
}

export const supabase = db;

export const ADMIN_USERNAME = "luis02";
export const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;

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
  const { data, error } = await db
    .from("usuarios").select("id").eq("id", userId).single();
  if (error) console.error("🔍 verifyUserStillExists — userId:", userId, "error:", error);
  return !error && !!data;
}
