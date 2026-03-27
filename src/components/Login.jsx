import { useState } from "react";
import { supabase, saveSession, ADMIN_USERNAME, ADMIN_PASSWORD } from "../supabaseClient";
import "../styles/login.css";

export default function Login({ onLogin }) {
  const [username, setUsername]   = useState("");
  const [password, setPassword]   = useState("");
  const [showPass, setShowPass]   = useState(false);
  const [isAdmin, setIsAdmin]     = useState(false);
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);

  // Detectar si el usuario que escriben es admin para mostrar campo de contraseña
  const handleUsernameChange = (e) => {
    const val = e.target.value;
    setUsername(val);
    setIsAdmin(val.trim().toLowerCase() === ADMIN_USERNAME);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setError("");

    const name = username.trim().toLowerCase();

    // ── LOGIN ADMIN ──────────────────────────────────────
    if (name === ADMIN_USERNAME) {
      if (!password) {
        setError("El admin requiere contraseña.");
        setLoading(false);
        return;
      }
      if (password !== ADMIN_PASSWORD) {
        // Pequeño delay para dificultar fuerza bruta
        await new Promise(r => setTimeout(r, 800));
        setError("Contraseña incorrecta.");
        setLoading(false);
        return;
      }
      const userData = { id: "admin", username: "admin", is_admin: true };
      saveSession(userData);
      onLogin(userData);
      setLoading(false);
      return;
    }

    // ── LOGIN PARTICIPANTE ────────────────────────────────
    const { data, error: err } = await supabase
      .from("usuarios")
      .select("*")
      .eq("username", name)
      .single();

    if (err || !data) {
      setError("Usuario no encontrado. Contacta al administrador.");
      setLoading(false);
      return;
    }

    const userData = { ...data, is_admin: false };
    saveSession(userData);
    onLogin(userData);
    setLoading(false);
  };

  return (
    <div className="login-bg">
      <div className="login-orb" />

      <div className="login-card">
        <div className="login-badge">FIFA WORLD CUP</div>
        <h1 className="login-title">
          <span className="login-title-big">2026</span>
          <span className="login-title-sub">QUINIELA OFICIAL DE LUIS</span>
        </h1>

        <div className="login-flags">🇲🇽 🇺🇸 🇨🇦</div>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-label">NOMBRE DE USUARIO</label>
          <input
            className="login-input"
            type="text"
            value={username}
            onChange={handleUsernameChange}
            placeholder="Escribe tu usuario..."
            autoFocus
            autoComplete="username"
          />

          {/* Campo de contraseña — solo aparece si es admin */}
          {isAdmin && (
            <div className="login-pass-wrap">
              <label className="login-label">CONTRASEÑA</label>
              <div className="login-pass-row">
                <input
                  className="login-input"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Contraseña del admin..."
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="show-pass-btn"
                  onClick={() => setShowPass(v => !v)}
                  tabIndex={-1}
                >
                  {showPass ? "🙈" : "👁"}
                </button>
              </div>
            </div>
          )}

          {error && <p className="login-error">{error}</p>}

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? "Verificando..." : "INGRESAR →"}
          </button>
        </form>

        <p className="login-footer">Mundial USA · México · Canadá 2026</p>
      </div>
    </div>
  );
}