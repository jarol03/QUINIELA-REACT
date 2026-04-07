import { useState, useEffect } from "react";
import Login from "./components/Login";
import AdminPanel from "./components/Adminpanel";
import UserPanel from "./components/UserPanel";
import {
  getSession,
  clearSession,
  verifyUserStillExists,
} from "./supabaseClient";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    const session = getSession();

    if (!session) {
      // No hay sesión — ir al login
      setLoading(false);
      return;
    }

    // Verificar que el usuario todavía existe en la BD
    // (el admin puede haberlo eliminado mientras estaba logueado)
    const valid = await verifyUserStillExists(session.id);
    if (!valid) {
      clearSession();
      setLoading(false);
      return;
    }

    setUser(session);
    setLoading(false);
  };

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    clearSession();
    setUser(null);
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#0d0f1a",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div className="spinner" />
        <p
          style={{
            color: "rgba(240,244,255,0.3)",
            fontFamily: "sans-serif",
            fontSize: 14,
          }}
        >
          Verificando sesión...
        </p>
      </div>
    );
  }

  if (!user) return <Login onLogin={handleLogin} />;
  if (user.is_admin) return <AdminPanel user={user} onLogout={handleLogout} />;
  return <UserPanel user={user} onLogout={handleLogout} />;
}

