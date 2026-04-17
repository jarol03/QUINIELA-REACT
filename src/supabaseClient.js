// import { createClient } from "@supabase/supabase-js";
import { createClient } from "@insforge/sdk";

// 🔧 Reemplaza con los valores de tu proyecto (Settings > API)
const SUPABASE_URL = import.meta.env.VITE_INSFORGE_URL || import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_INSFORGE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

// 🔧 Username del admin (el que pones en el login)
export const ADMIN_USERNAME = "luis02";

// 🔧 Contraseña del admin — cámbiala a algo seguro
// Esta contraseña solo la sabe el admin, los participantes no tienen contraseña
export const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;

// export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const insforgeSdk = createClient({ baseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });

// Wrapper de compatibilidad para código existente de Supabase
export const supabase = {
  get from() {
    return (table) => {
      const tableRef = insforgeSdk.database.from(table);
      return new Proxy(tableRef, {
        get(target, prop) {
          if (prop === 'insert') {
            return (data, ...args) => target.insert(Array.isArray(data) ? data : [data], ...args);
          }
          const val = target[prop];
          return typeof val === 'function' ? val.bind(target) : val;
        }
      });
    };
  },
  get rpc() {
    return insforgeSdk.database.rpc.bind(insforgeSdk.database);
  },
  get auth() {
    return insforgeSdk.auth;
  },
  get storage() {
    return insforgeSdk.storage;
  }
};

// ── Helpers de sesión ─────────────────────────────────────────────────────

const SESSION_KEY = "qn_session";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 horas

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
  localStorage.removeItem("quinela_user"); // limpiar clave vieja
}

// Verifica que el usuario sigue existiendo en la BD
export async function verifyUserStillExists(userId) {
  if (userId === "admin") return true;
  const { data, error } = await supabase
    .from("usuarios")
    .select("id")
    .eq("id", userId)
    .single();
  return !error && !!data;
}