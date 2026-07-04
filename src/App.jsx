import { useState, useEffect } from "react";
import Login from "./components/Login";
import AdminPanel from "./components/Adminpanel";
import UserPanel from "./components/UserPanel";
import AccessDenied from "./components/AccessDenied";
import { supabase } from "./supabaseClient";
import {
  getSession,
  clearSession,
  verifyUserStillExists,
} from "./supabaseClient";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPaid, setIsPaid] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);

  useEffect(() => {
    checkSession();
  }, []);

  // Verifica cada 1 min si hay deploy nuevo; si cambió, recarga
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const { data } = await supabase
        .from("configuracion")
        .select("valor")
        .eq("clave", "app_version")
        .maybeSingle();
      if (!data?.valor || !mounted) return;
      const stored = localStorage.getItem("app_version");
      if (stored && stored !== data.valor) {
        localStorage.setItem("app_version", data.valor);
        window.location.reload();
      } else if (!stored) {
        localStorage.setItem("app_version", data.valor);
      }
    };
    check();
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    const onFocus = () => { check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    const id = setInterval(check, 60 * 1000);
    return () => { mounted = false; document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onFocus); clearInterval(id); };
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
    if (!session.is_admin) {
      await verifyPayment(session.id);
    } else {
      setIsPaid(true);
    }
    setLoading(false);
  };

  const verifyPayment = async (userId) => {
    setCheckingPayment(true);
    const { data } = await supabase
      .from("pagos")
      .select("pagado")
      .eq("usuario_id", userId)
      .maybeSingle();
    
    setIsPaid(data?.pagado || false);
    setCheckingPayment(false);
  };

  const handleLogin = async (userData) => {
    setUser(userData);
    if (!userData.is_admin) {
      await verifyPayment(userData.id);
    } else {
      setIsPaid(true);
    }
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
  
  if (checkingPayment) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0d0f1a", flexDirection: "column", gap: 16 }}>
        <div className="spinner" />
        <p style={{ color: "rgba(240,244,255,0.3)", fontFamily: "sans-serif", fontSize: 14 }}>Verificando pago...</p>
      </div>
    );
  }

  if (user.is_admin) return <AdminPanel user={user} onLogout={handleLogout} />;
  
  // Bloqueo de acceso temporalmente deshabilitado
  // if (!isPaid) return <AccessDenied onLogout={handleLogout} onRetry={() => verifyPayment(user.id)} />;
  
  return <UserPanel user={user} onLogout={handleLogout} />;
}

