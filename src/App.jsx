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

