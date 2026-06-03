/** Quita acentos y deja solo a-z0-9 para usernames. */
function normalizeNombre(nombre) {
  return (nombre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function sanitizePart(s) {
  return s.replace(/[^a-z0-9]/g, "");
}

/**
 * Sugiere un username a partir del nombre completo.
 * Ej: "Harold Espinal" → hespinal, harold, harold26, etc.
 */
export function generateUsernameFromNombre(nombre, existingUsernames = []) {
  const existing = new Set(
    (existingUsernames || []).map((u) => String(u).toLowerCase().trim())
  );
  const parts = normalizeNombre(nombre).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";

  const first = parts[0];
  const last = parts[parts.length - 1];
  const candidates = [];

  if (parts.length >= 2) {
    candidates.push(sanitizePart(first[0] + last));
    candidates.push(sanitizePart(first + last.slice(0, 4)));
    candidates.push(sanitizePart(first + last[0]));
  }
  candidates.push(sanitizePart(first));

  const year = String(new Date().getFullYear() % 100).padStart(2, "0");
  candidates.push(sanitizePart(first) + year);

  const baseInicial =
    parts.length >= 2 ? sanitizePart(first[0] + last) : sanitizePart(first);
  for (let n = 1; n <= 99; n++) {
    candidates.push((baseInicial || sanitizePart(first)) + String(n).padStart(2, "0"));
  }

  const seen = new Set();
  for (const raw of candidates) {
    const c = raw.slice(0, 24);
    if (c.length < 3 || seen.has(c) || existing.has(c)) continue;
    seen.add(c);
    return c;
  }

  let fallback = (baseInicial || "user").slice(0, 20);
  let i = 1;
  while (existing.has(fallback + i)) i++;
  return fallback + i;
}

/** Texto para portapapeles: nombre en una línea, usuario en la siguiente. */
export function formatCredencialesCopy(nombre, username) {
  const n = (nombre || "").trim();
  const u = (username || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!n && !u) return "";
  if (!n) return u;
  if (!u) return n;
  return `${n}\n${u}`;
}

export async function copyTextToClipboard(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}
