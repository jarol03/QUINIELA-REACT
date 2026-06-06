import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import "../styles/apuestas.css";
import { calcularGananciasNetas } from "../utils/apuestasUtils";

// ── helpers ────────────────────────────────────────────────────────────────
function fmtL(n) {
  return `L ${Number(n).toLocaleString("es-HN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function estadoLabel(estado) {
  const map = {
    abierto:   { text: "Abierto",   cls: "abierto" },
    cerrado:   { text: "Cerrado",   cls: "cerrado" },
    liquidado: { text: "Liquidado", cls: "liquidado" },
  };
  return map[estado] || { text: estado, cls: "abierto" };
}

// ── Componente principal ───────────────────────────────────────────────────
export default function ApuestasView({ user }) {
  const [grupos, setGrupos]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selectedGrupo, setSelected]  = useState(null);
  const [toast, setToast]             = useState({ msg: "", type: "success" });

  const fetchGrupos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("grupos_apuesta")
      .select("*")
      .order("created_at", { ascending: false });
    
    // Filtrar para mostrar solo los grupos donde el usuario está incluido,
    // o aquellos grupos antiguos (sin participantes especificados)
    const permitidos = (data || []).filter(g => 
      !g.participantes || g.participantes.length === 0 || g.participantes.includes(user.id)
    );
    
    setGrupos(permitidos);
    setLoading(false);
  }, [user.id]);

  useEffect(() => { fetchGrupos(); }, [fetchGrupos]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "success" }), 3000);
  };

  // ── Vista detalle ──────────────────────────────────────────────────────
  if (selectedGrupo) {
    return (
      <GrupoDetail
        grupo={selectedGrupo}
        user={user}
        onBack={() => { setSelected(null); fetchGrupos(); }}
        showToast={showToast}
      />
    );
  }

  // ── Lista de grupos ────────────────────────────────────────────────────
  return (
    <div className="user-tab-content">
      <div className="apuestas-section-header">
        <h2 className="apuestas-section-title">Apuestas 💰</h2>
        <p className="apuestas-section-sub">Entra a un grupo, apuesta y gana.</p>
      </div>

      {loading && (
        <div className="loading-state"><div className="spinner" /></div>
      )}

      {!loading && grupos.length === 0 && (
        <div className="apuestas-empty">
          <span className="apuestas-empty-icon">🎲</span>
          <p>Sin grupos activos</p>
          <span>Luis Espinal creará grupos de apuesta pronto.</span>
        </div>
      )}

      {!loading && grupos.length > 0 && (
        <div className="grupos-list">
          {grupos.map((g, idx) => {
            const est = estadoLabel(g.estado);
            const jornadasCount = (g.jornadas || []).length;
            return (
              <div
                key={g.id}
                className="grupo-card"
                onClick={() => setSelected(g)}
                style={{ animationDelay: `${idx * 0.05}s` }}
              >
                <div className="grupo-card-left">
                  <div className={`grupo-card-dot ${est.cls}`} />
                  <div className="grupo-card-info">
                    <span className="grupo-card-nombre">{g.nombre}</span>
                    <span className="grupo-card-meta">
                      {jornadasCount} jornada{jornadasCount !== 1 ? "s" : ""}
                      {g.descripcion ? ` · ${g.descripcion}` : ""}
                    </span>
                  </div>
                </div>
                <div className="grupo-card-right">
                  <span className={`grupo-estado-badge ${est.cls}`}>{est.text}</span>
                  <span className="grupo-card-arrow">›</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast.msg && (
        <div className={`toast ${toast.type === "error" ? "toast-error" : ""}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Vista detalle de un grupo ──────────────────────────────────────────────
function GrupoDetail({ grupo, user, onBack, showToast }) {
  const [apuestas, setApuestas]         = useState([]);
  const [ganadores, setGanadores]       = useState([]);
  const [usuarios, setUsuarios]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [miApuesta, setMiApuesta]       = useState(null);
  const [montoInput, setMontoInput]     = useState("");
  const [saving, setSaving]             = useState(false);

  const fetchDetalle = useCallback(async () => {
    setLoading(true);
    const [
      { data: apData },
      { data: ganData },
      { data: usrData },
    ] = await Promise.all([
      supabase.from("apuestas").select("*").eq("grupo_id", grupo.id),
      supabase.from("ganadores_apuesta").select("*").eq("grupo_id", grupo.id),
      supabase.from("usuarios").select("id, username, nombre").order("username"),
    ]);

    const ap = apData || [];
    setApuestas(ap);
    setGanadores(ganData || []);
    setUsuarios(usrData || []);

    const mia = ap.find((a) => a.usuario_id === user.id);
    setMiApuesta(mia || null);
    setMontoInput(mia ? String(mia.monto) : "");
    setLoading(false);
  }, [grupo.id, user.id]);

  useEffect(() => { fetchDetalle(); }, [fetchDetalle]);

  const handleSaveApuesta = async () => {
    const monto = parseFloat(montoInput);
    if (!monto || monto <= 0) {
      showToast("Ingresa un monto válido mayor a 0", "error");
      return;
    }
    setSaving(true);
    try {
      // Verificar si el grupo sigue abierto antes de guardar
      const { data: currentGroup, error: groupError } = await supabase
        .from("grupos_apuesta")
        .select("estado")
        .eq("id", grupo.id)
        .single();

      if (groupError) throw groupError;

      if (currentGroup.estado !== "abierto") {
        showToast("No se puede guardar: El grupo ya no está abierto", "error");
        fetchDetalle(); // Recargar para mostrar el estado real
        return;
      }

      if (miApuesta) {
        // Actualizar
        const { error } = await supabase
          .from("apuestas")
          .update({ monto })
          .eq("id", miApuesta.id);
        if (error) throw error;
      } else {
        // Insertar
        const { error } = await supabase.from("apuestas").insert({
          grupo_id: grupo.id,
          usuario_id: user.id,
          monto,
        });
        if (error) throw error;
      }
      showToast("¡Apuesta guardada! 🎯");
      fetchDetalle();
    } catch (err) {
      console.error(err);
      showToast("Error al guardar la apuesta", "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Cálculo de liquidación ───────────────────────────────────────────
  const liquidacionData = (() => {
    if (grupo.estado !== "liquidado" || apuestas.length === 0) return null;
    const ganadorIds = new Set(ganadores.map((g) => g.usuario_id));
    const lista = apuestas.map((a) => {
      const usr = usuarios.find((u) => u.id === a.usuario_id);
      return {
        nombre: usr?.nombre || usr?.username || "?",
        usuario_id: a.usuario_id,
        apuesta: a.monto,
        gano: ganadorIds.has(a.usuario_id),
      };
    });
    return calcularGananciasNetas(lista);
  })();

  // ── Helpers de render ────────────────────────────────────────────────
  const pozoTotal = apuestas.reduce((s, a) => s + Number(a.monto), 0);
  const isAbierto = grupo.estado === "abierto";
  const isCerrado = grupo.estado === "cerrado";
  const isLiquidado = grupo.estado === "liquidado";
  const ganadorSet = new Set(ganadores.map((g) => g.usuario_id));

  const nombreUsuario = (uid) => {
    const u = usuarios.find((u) => u.id === uid);
    return u?.nombre || u?.username || "—";
  };

  if (loading) {
    return (
      <div className="user-tab-content">
        <button className="apuestas-back-btn" onClick={onBack}>← Volver</button>
        <div className="loading-state"><div className="spinner" /></div>
      </div>
    );
  }

  return (
    <div className="user-tab-content">
      <button className="apuestas-back-btn" onClick={onBack}>← Volver a grupos</button>

      <div className="apuestas-detail-view">

        {/* Header del grupo */}
        <div className="apuesta-detail-header">
          <div>
            <h2 className="apuesta-detail-title">{grupo.nombre}</h2>
            {grupo.descripcion && (
              <p className="apuesta-detail-desc">{grupo.descripcion}</p>
            )}
          </div>
          <span className={`grupo-estado-badge ${grupo.estado}`}>
            {estadoLabel(grupo.estado).text}
          </span>
        </div>

        {/* Pozo total */}
        {apuestas.length > 0 && (
          <div className="apuesta-pozo-card">
            <div>
              <div className="apuesta-pozo-label">🏆 Dinero en juego</div>
              <div className="apuesta-pozo-participantes">
                {apuestas.length} apostador{apuestas.length !== 1 ? "es" : ""}
              </div>
            </div>
            <div className="apuesta-pozo-monto">{fmtL(pozoTotal)}</div>
          </div>
        )}

        {/* Mi apuesta — solo si abierto */}
        {isAbierto && (
          <div className="mi-apuesta-card">
            <p className="mi-apuesta-title">
              {miApuesta ? "✏️ Editar mi apuesta" : "💸 Registrar mi apuesta"}
            </p>
            <div className="mi-apuesta-input-row">
              <span className="apuesta-prefix">L</span>
              <input
                className="apuesta-monto-input"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                placeholder="0.00"
                value={montoInput}
                onChange={(e) => setMontoInput(e.target.value)}
              />
              <button
                className="apuesta-save-btn"
                onClick={handleSaveApuesta}
                disabled={saving || !montoInput || parseFloat(montoInput) <= 0}
              >
                {saving ? "..." : miApuesta ? "Actualizar" : "Apostar"}
              </button>
            </div>
            {miApuesta && (
              <div className="apuesta-saved-banner">
                ✅ Tienes registrado: {fmtL(miApuesta.monto)} — puedes cambiarlo mientras el grupo esté abierto
              </div>
            )}
          </div>
        )}

        {isCerrado && (
          <div className="apuesta-cerrado-banner">
            🔒 Este grupo está cerrado — ya no se aceptan nuevas apuestas.
            {miApuesta
              ? ` Tu apuesta: ${fmtL(miApuesta.monto)}`
              : " No registraste ninguna apuesta."}
          </div>
        )}

        {/* Tabla de liquidación */}
        {isLiquidado && liquidacionData && (
          <div className="apuesta-liquidacion-card">
            <div className="apuesta-liquidacion-title">📊 Resultado de liquidación</div>
            <table className="liquidacion-table">
              <thead>
                <tr>
                  <th>Jugador</th>
                  <th>Apostó</th>
                  <th>Ganó neto</th>
                  <th>Total en mano</th>
                </tr>
              </thead>
              <tbody>
                {liquidacionData.map((row) => {
                  const esYo = row.usuario_id === user.id;
                  const esGanador = row.gano;
                  return (
                    <tr
                      key={row.usuario_id}
                      className={`${esGanador ? "liq-row-ganador" : ""} ${esYo ? "liq-row-yo" : ""}`}
                    >
                      <td>
                        <div className="liq-nombre-cell">
                          {esGanador && <span>🏆</span>}
                          {row.nombre}
                          {esYo && <span style={{ color: "#818cf8", fontSize: "0.75rem" }}>(tú)</span>}
                        </div>
                      </td>
                      <td>{fmtL(row.apuestaOriginal)}</td>
                      <td className={row.gananciaNeta > 0 ? "liq-ganancia-pos" : "liq-ganancia-neg"}>
                        {row.gananciaNeta > 0 ? `+${fmtL(row.gananciaNeta)}` : "—"}
                      </td>
                      <td className="liq-total-cell">{fmtL(row.totalMano)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Lista de participantes */}
        <div className="apuesta-participantes-card">
          <div className="apuesta-participantes-title">
            Participantes ({apuestas.length})
          </div>
          <div className="apuesta-participantes-list">
            {apuestas.length === 0 ? (
              <div className="apuestas-empty" style={{ padding: "24px" }}>
                <span className="apuestas-empty-icon" style={{ fontSize: "1.5rem" }}>🤷</span>
                <span>Nadie ha apostado todavía</span>
              </div>
            ) : (
              apuestas
                .sort((a, b) => Number(b.monto) - Number(a.monto))
                .map((a) => {
                  const esYo = a.usuario_id === user.id;
                  const esGanador = ganadorSet.has(a.usuario_id);
                  return (
                    <div
                      key={a.id}
                      className={`apuesta-part-row ${esGanador ? "es-ganador" : ""} ${esYo ? "es-yo" : ""}`}
                    >
                      <div className="apuesta-part-avatar">
                        {nombreUsuario(a.usuario_id).charAt(0).toUpperCase()}
                      </div>
                      <div className="apuesta-part-info">
                        <div className="apuesta-part-nombre">
                          {nombreUsuario(a.usuario_id)}
                          {esYo && <span className="apuesta-part-yo">(tú)</span>}
                          {esGanador && (
                            <span className="apuesta-part-ganador-tag">🏆 Ganador</span>
                          )}
                        </div>
                      </div>
                      <div className="apuesta-part-monto">{fmtL(a.monto)}</div>
                    </div>
                  );
                })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
