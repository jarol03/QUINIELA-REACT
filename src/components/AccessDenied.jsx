import React from "react";

export default function AccessDenied({ onLogout, onRetry }) {
  return (
    <div className="login-bg">
      <div className="login-orb" />
      <div className="login-card" style={{ textAlign: "center", maxWidth: 450 }}>
        <div className="login-badge" style={{ background: "rgba(255, 171, 0, 0.2)", color: "#ffab00" }}>
          ACCESO RESTRINGIDO
        </div>
        
        <div style={{ fontSize: "60px", marginBottom: "30px" }}>🚧</div>
        
        <h1 className="login-title" style={{ marginBottom: "20px" }}>
          ¡Hola participante!
        </h1>
        
        <p style={{ 
          color: "rgba(255,255,255,0.7)", 
          fontSize: "16px", 
          lineHeight: "1.6",
          marginBottom: "30px" 
        }}>
          Tu acceso a la <strong>Quiniela 2026</strong> aún no ha sido activado. 
          Por favor, contacta a <strong>Luis Espinal</strong> para confirmar tu pago de inscripción.
        </p>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <button 
            className="login-btn" 
            onClick={onRetry}
            style={{ background: "linear-gradient(135deg, #00e5a0, #00c0fa)" }}
          >
            YA PAGUÉ, REINTENTAR ↻
          </button>
          
          <button 
            className="login-btn" 
            onClick={onLogout}
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            SALIR / CERRAR SESIÓN
          </button>
        </div>

        <p className="login-footer" style={{ marginTop: "30px" }}>
          Una vez confirmado el pago, podrás entrar a poner tus pronósticos.
        </p>
      </div>
    </div>
  );
}
