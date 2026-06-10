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
export default function AdminApuestasTab() {
  const [grupos, setGrupos]         = useState([]);
  const [jornadas, setJornadas]     = useState([]);
  const [usuarios, setUsuarios]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [toast, setToast]           = useState("");

  // Formulario nuevo grupo
  const [newNombre, setNewNombre]             = useState("");
  const [newDesc, setNewDesc]                 = useState("");
  const [newJornadas, setNewJornadas]         = useState([]);
  const [newParticipantes, setNewParticipantes] = useState([]);
  const [creating, setCreating]               = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2800); };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: gData }, { data: jData }, { data: uData }] = await Promise.all([
      supabase.from("grupos_apuesta").select("*").order("created_at", { ascending: false }),
      supabase.from("jornadas").select("id, nombre").order("created_at"),
      supabase.from("usuarios").select("id, username, nombre").order("username"),
    ]);
    setGrupos(gData || []);
    setJornadas(jData || []);
    setUsuarios(uData || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const crearGrupo = async () => {
    if (!newNombre.trim()) return;
    if (newParticipantes.length === 0) {
      showToast("Debes seleccionar al menos un participante");
      return;
    }
    setCreating(true);
    const { error } = await supabase.from("grupos_apuesta").insert({
      nombre: newNombre.trim(),
      descripcion: newDesc.trim() || null,
      jornadas: newJornadas,
      participantes: newParticipantes,
      estado: "abierto",
    });
    if (!error) {
      setNewNombre(""); setNewDesc(""); setNewJornadas([]); setNewParticipantes([]);
      fetchAll();
      showToast("Grupo creado ✓");
    } else {
      showToast("Error al crear el grupo");
    }
    setCreating(false);
  };

  return (
    <div className="admin-apuestas-layout">
      {toast && <div className="toast">{toast}</div>}

      {/* ── Crear grupo ── */}
      <div className="admin-apuesta-create-card">
        <h3>Nuevo grupo de apuesta</h3>
        <div className="admin-apuesta-fields">

          <div className="admin-apuesta-field">
            <label>Nombre del grupo</label>
            <input
              className="admin-input"
              placeholder="Ej: Apuesta Jornadas 5-7..."
              value={newNombre}
              onChange={(e) => setNewNombre(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && crearGrupo()}
            />
          </div>

          <div className="admin-apuesta-field">
            <label>Descripción (opcional)</label>
            <input
              className="admin-input"
              placeholder="Ej: Quien acierte más en estas 3 jornadas..."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>

          <div className="admin-apuesta-field">
            <label>Jornadas que cubre (para saber quién ganó)</label>
            <JornadasSelector
              jornadas={jornadas}
              selectedIds={newJornadas}
              onChange={setNewJornadas}
            />
          </div>

          <div className="admin-apuesta-field">
            <label>Participantes permitidos</label>
            <UserSelector 
              usuarios={usuarios} 
              selectedIds={newParticipantes} 
              onChange={setNewParticipantes} 
            />
          </div>

          <button
            className="admin-btn-primary"
            onClick={crearGrupo}
            disabled={creating || !newNombre.trim() || newParticipantes.length === 0}
          >
            {creating ? "Creando..." : "＋ Crear grupo"}
          </button>
        </div>
      </div>

      {/* ── Lista de grupos ── */}
      <div className="admin-grupos-list">
        {loading && <div className="loading-state"><div className="spinner" /></div>}
        {!loading && grupos.length === 0 && (
          <div className="apuestas-empty">
            <span className="apuestas-empty-icon">🎲</span>
            <p>Sin grupos creados aún</p>
          </div>
        )}
        {grupos.map((g) => (
          <GrupoAdminCard
            key={g.id}
            grupo={g}
            usuarios={usuarios}
            jornadas={jornadas}
            isExpanded={expandedId === g.id}
            onToggle={() => setExpandedId((prev) => (prev === g.id ? null : g.id))}
            onRefresh={fetchAll}
            showToast={showToast}
          />
        ))}
      </div>
    </div>
  );
}

// ── Tarjeta expandible de un grupo (admin) ────────────────────────────────
function GrupoAdminCard({ grupo, usuarios, jornadas, isExpanded, onToggle, onRefresh, showToast }) {
  const [apuestas, setApuestas]         = useState([]);
  const [ganadores, setGanadores]       = useState([]);   // IDs de ganadores
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving]             = useState(false);
  const [isEditingParticipants, setIsEditingParticipants] = useState(false);
  const [editParticipantes, setEditParticipantes] = useState(grupo.participantes || []);

  const fetchDetail = useCallback(async () => {
    setLoadingDetail(true);
    const [{ data: apData }, { data: ganData }] = await Promise.all([
      supabase.from("apuestas").select("*").eq("grupo_id", grupo.id),
      supabase.from("ganadores_apuesta").select("*").eq("grupo_id", grupo.id),
    ]);
    setApuestas(apData || []);
    setGanadores((ganData || []).map((g) => g.usuario_id));
    setLoadingDetail(false);
  }, [grupo.id]);

  // Cargar detalle al expandir
  useEffect(() => {
    if (isExpanded) fetchDetail();
  }, [isExpanded, fetchDetail]);

  const toggleGanador = (uid) => {
    setGanadores((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]
    );
  };

  const cambiarEstado = async (nuevoEstado) => {
    setSaving(true);
    const { error } = await supabase
      .from("grupos_apuesta")
      .update({ estado: nuevoEstado })
      .eq("id", grupo.id);
    if (!error) {
      showToast(`Grupo ${nuevoEstado} ✓`);
      onRefresh();
    } else {
      showToast("Error al cambiar estado");
    }
    setSaving(false);
  };

  const liquidar = async () => {
    if (ganadores.length === 0) {
      showToast("Selecciona al menos un ganador antes de liquidar", "error");
      return;
    }
    if (!confirm(`¿Confirmar liquidación con ${ganadores.length} ganador(es)?`)) return;

    setSaving(true);
    try {
      // 1. Borrar ganadores anteriores del grupo
      await supabase.from("ganadores_apuesta").delete().eq("grupo_id", grupo.id);

      // 2. Insertar los nuevos ganadores
      if (ganadores.length > 0) {
        const rows = ganadores.map((uid) => ({
          grupo_id: grupo.id,
          usuario_id: uid,
        }));
        const { error: ganErr } = await supabase.from("ganadores_apuesta").insert(rows);
        if (ganErr) throw ganErr;
      }

      // 3. Marcar grupo como liquidado
      const { error: estErr } = await supabase
        .from("grupos_apuesta")
        .update({ estado: "liquidado" })
        .eq("id", grupo.id);
      if (estErr) throw estErr;

      showToast("¡Grupo liquidado! 🏆");
      onRefresh();
    } catch (err) {
      console.error(err);
      showToast("Error al liquidar");
    } finally {
      setSaving(false);
    }
  };

  const eliminarGrupo = async () => {
    if (!confirm(`¿Eliminar el grupo "${grupo.nombre}" y todas sus apuestas?`)) return;
    await supabase.from("ganadores_apuesta").delete().eq("grupo_id", grupo.id);
    await supabase.from("apuestas").delete().eq("grupo_id", grupo.id);
    await supabase.from("grupos_apuesta").delete().eq("id", grupo.id);
    showToast("Grupo eliminado");
    onRefresh();
  };

  const guardarParticipantes = async () => {
    if (editParticipantes.length === 0) {
      showToast("Debes seleccionar al menos un participante", "error");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("grupos_apuesta")
      .update({ participantes: editParticipantes })
      .eq("id", grupo.id);
    
    if (!error) {
      showToast("Participantes actualizados ✓");
      setIsEditingParticipants(false);
      onRefresh(); // Esto recargará los datos del grupo (incluyendo el nuevo array de participantes)
    } else {
      showToast("Error al guardar participantes", "error");
    }
    setSaving(false);
  };

  // ── Preview de cálculo ─────────────────────────────────────────────
  const previewData = (() => {
    if (apuestas.length === 0 || ganadores.length === 0) return null;
    const ganSet = new Set(ganadores);
    const lista = apuestas.map((a) => {
      const usr = usuarios.find((u) => u.id === a.usuario_id);
      return {
        nombre: usr?.nombre || usr?.username || "?",
        usuario_id: a.usuario_id,
        apuesta: a.monto,
        gano: ganSet.has(a.usuario_id),
      };
    });
    return calcularGananciasNetas(lista);
  })();

  const pozoTotal = apuestas.reduce((s, a) => s + Number(a.monto), 0);
  const est = estadoLabel(grupo.estado);
  const jornadasNombres = (grupo.jornadas || [])
    .map((id) => jornadas.find((j) => j.id === id)?.nombre || "?")
    .join(", ");
  
  const totalParticipantes = (grupo.participantes || []).length;

  const nombreUsuario = (uid) => {
    const u = usuarios.find((u) => u.id === uid);
    return u?.nombre || u?.username || "—";
  };

  return (
    <div className="admin-grupo-card">
      {/* Header */}
      <div className="admin-grupo-header" onClick={onToggle}>
        <div className="admin-grupo-header-left">
          <div className={`grupo-card-dot ${est.cls}`} />
          <div>
            <div className="admin-grupo-nombre">{grupo.nombre}</div>
            <div className="admin-grupo-meta">
              {apuestas.length} apuesta{apuestas.length !== 1 ? "s" : ""} · Dinero: {fmtL(pozoTotal)}
              {totalParticipantes > 0 ? ` · ${totalParticipantes} permitidos` : ""}
              {jornadasNombres ? ` · Jornadas: ${jornadasNombres}` : ""}
            </div>
          </div>
        </div>
        <div className="admin-grupo-actions" onClick={(e) => e.stopPropagation()}>
          <span className={`grupo-estado-badge ${est.cls}`}>{est.text}</span>
          <span className="admin-grupo-arrow">
            {isExpanded ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {/* Body expandido */}
      {isExpanded && (
        <div className="admin-grupo-body">
          {loadingDetail ? (
            <div className="loading-state">
              <div className="spinner" />
            </div>
          ) : (
            <>
              {/* Participantes permitidos (Admin) */}
              {grupo.estado === "abierto" && (
                <div>
                  <p className="admin-grupo-section-label">
                    Gestión de Participantes
                  </p>
                  
                  {isEditingParticipants ? (
                    <div className="admin-edit-section">
                      <UserSelector 
                        usuarios={usuarios} 
                        selectedIds={editParticipantes} 
                        onChange={setEditParticipantes} 
                      />
                      <div className="admin-edit-actions">
                        <button className="admin-btn-primary" onClick={guardarParticipantes} disabled={saving}>
                          {saving ? "Guardando..." : "✓ Guardar cambios"}
                        </button>
                        <button className="admin-btn-secondary" onClick={() => { setIsEditingParticipants(false); setEditParticipantes(grupo.participantes || []); }} disabled={saving}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="admin-grupo-edit-btn" onClick={() => setIsEditingParticipants(true)}>
                      ✏️ Editar participantes permitidos ({totalParticipantes})
                    </button>
                  )}
                </div>
              )}

              {/* Lista de apuestas */}
              <div>
                <p className="admin-grupo-section-label">
                  Apuestas registradas ({apuestas.length})
                </p>
                {apuestas.length === 0 ? (
                  <p className="dim-text">Nadie ha apostado aún.</p>
                ) : (
                  <div className="admin-card-inner">
                    {apuestas
                      .sort((a, b) => Number(b.monto) - Number(a.monto))
                      .map((a) => (
                        <div key={a.id} className="apuesta-part-row">
                          <div className="apuesta-part-avatar">
                            {nombreUsuario(a.usuario_id).charAt(0).toUpperCase()}
                          </div>
                          <div className="apuesta-part-info">
                            <div className="apuesta-part-nombre">
                              {nombreUsuario(a.usuario_id)}
                            </div>
                          </div>
                          <div className="apuesta-part-monto">{fmtL(a.monto)}</div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Selección de ganadores (solo si cerrado) */}
              {grupo.estado === "cerrado" && apuestas.length > 0 && (
                <div>
                  <p className="admin-grupo-section-label">
                    Marcar ganador(es)
                  </p>
                  <div className="ganadores-selector">
                    {apuestas.map((a) => {
                      const selected = ganadores.includes(a.usuario_id);
                      return (
                        <div
                          key={a.id}
                          className={`ganador-row ${selected ? "selected" : ""}`}
                          onClick={() => toggleGanador(a.usuario_id)}
                        >
                          <div className="ganador-checkbox">
                            <span className="ganador-checkbox-check">✓</span>
                          </div>
                          <div className="ganador-row-info">
                            <div className="ganador-row-nombre">{nombreUsuario(a.usuario_id)}</div>
                            <div className="ganador-row-apuesta">Apostó: {fmtL(a.monto)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Preview de cálculo */}
              {previewData && grupo.estado === "cerrado" && (
                <div>
                  <p className="admin-grupo-section-label">
                    Preview de distribución
                  </p>
                  <div className="admin-card-inner admin-preview-table-wrap">
                    <table className="admin-preview-table">
                      <thead>
                        <tr>
                          <th>Jugador</th>
                          <th>Apostó</th>
                          <th>Gana neto</th>
                          <th>Total en mano</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.map((row) => (
                          <tr key={row.usuario_id} className={row.gano ? "preview-ganador" : ""}>
                            <td>{row.gano ? "🏆 " : ""}{row.nombre}</td>
                            <td>{fmtL(row.apuestaOriginal)}</td>
                            <td>{row.gananciaNeta > 0 ? `+${fmtL(row.gananciaNeta)}` : "—"}</td>
                            <td>{fmtL(row.totalMano)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Acciones */}
              <div className="admin-apuesta-action-row">
                {grupo.estado === "abierto" && (
                  <button
                    className="admin-apuesta-cerrar-btn"
                    onClick={() => cambiarEstado("cerrado")}
                    disabled={saving}
                  >
                    🔒 Cerrar apuestas
                  </button>
                )}
                {grupo.estado === "cerrado" && (
                  <>
                    <button
                      className="admin-apuesta-reabrir-btn"
                      onClick={() => cambiarEstado("abierto")}
                      disabled={saving}
                    >
                      🔓 Reabrir
                    </button>
                    <button
                      className="admin-apuesta-liquidar-btn"
                      onClick={liquidar}
                      disabled={saving || ganadores.length === 0}
                    >
                      ⚡ Liquidar ({ganadores.length} ganador{ganadores.length !== 1 ? "es" : ""})
                    </button>
                  </>
                )}
                {grupo.estado === "liquidado" && (
                  <button
                    className="admin-apuesta-reabrir-btn"
                    onClick={() => cambiarEstado("cerrado")}
                    disabled={saving}
                  >
                    ↩ Revertir a cerrado
                  </button>
                )}
                <button
                  className="admin-apuesta-delete-btn"
                  onClick={eliminarGrupo}
                  disabled={saving}
                >
                  🗑 Eliminar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Selector de Jornadas (Buscador + Lista) ─────────────────────────────
function JornadasSelector({ jornadas, selectedIds, onChange }) {
  const [search, setSearch] = useState("");

  const toggle = (id) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(x => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectAll = () => onChange(jornadas.map(j => j.id));
  const clearAll = () => onChange([]);

  const filtered = jornadas.filter(j =>
    (j.nombre || "").toLowerCase().includes(search.toLowerCase())
  );

  const CHIP_LIMIT = 5;

  return (
    <div className="user-selector-container">
      {selectedIds.length > 0 && (
        <div className="selected-users-chips">
          {selectedIds.slice(0, CHIP_LIMIT).map(id => {
            const j = jornadas.find(x => x.id === id);
            if (!j) return null;
            return (
              <div key={id} className="selected-user-chip">
                {j.nombre}
                <button type="button" className="selected-user-chip-remove" onClick={() => toggle(id)}>×</button>
              </div>
            );
          })}
          {selectedIds.length > CHIP_LIMIT && (
            <div className="selected-user-chip selected-user-chip-more">
              +{selectedIds.length - CHIP_LIMIT} más
            </div>
          )}
        </div>
      )}

      <div className="user-selector-header">
        <span className="user-selector-count">{selectedIds.length} seleccionados</span>
        <div className="user-selector-actions">
          {selectedIds.length === jornadas.length && jornadas.length > 0 ? (
            <button type="button" onClick={clearAll}>Deseleccionar todos</button>
          ) : (
            <button type="button" onClick={selectAll}>Seleccionar todos</button>
          )}
        </div>
      </div>

      <input
        className="user-selector-search"
        placeholder="🔍 Buscar jornada..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div className="user-selector-list">
        {filtered.map(j => {
          const isSel = selectedIds.includes(j.id);
          return (
            <div key={j.id} className={`user-selector-item ${isSel ? 'selected' : ''}`} onClick={() => toggle(j.id)}>
              <div className="user-selector-name">{j.nombre}</div>
              <div className="user-selector-check">
                <span className="user-selector-check-icon">✓</span>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="dim-text" style={{padding: '8px 0'}}>No se encontraron jornadas</p>}
      </div>
    </div>
  );
}

// ── Selector de Usuarios (Buscador + Chips + Lista) ─────────────────────
function UserSelector({ usuarios, selectedIds, onChange }) {
  const [search, setSearch] = useState("");
  
  const toggle = (id) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(x => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectAll = () => onChange(usuarios.map(u => u.id));
  const clearAll = () => onChange([]);

  const filtered = usuarios.filter(u => 
    (u.nombre || "").toLowerCase().includes(search.toLowerCase()) || 
    (u.username || "").toLowerCase().includes(search.toLowerCase())
  );

  const CHIP_LIMIT = 5;

  return (
    <div className="user-selector-container">
      {selectedIds.length > 0 && (
        <div className="selected-users-chips">
          {selectedIds.slice(0, CHIP_LIMIT).map(id => {
            const u = usuarios.find(x => x.id === id);
            if (!u) return null;
            return (
              <div key={id} className="selected-user-chip">
                {u.nombre || u.username}
                <button type="button" className="selected-user-chip-remove" onClick={() => toggle(id)}>×</button>
              </div>
            );
          })}
          {selectedIds.length > CHIP_LIMIT && (
            <div className="selected-user-chip selected-user-chip-more">
              +{selectedIds.length - CHIP_LIMIT} más
            </div>
          )}
        </div>
      )}

      <div className="user-selector-header">
        <span className="user-selector-count">{selectedIds.length} seleccionados</span>
        <div className="user-selector-actions">
          {selectedIds.length === usuarios.length && usuarios.length > 0 ? (
            <button type="button" onClick={clearAll}>Deseleccionar todos</button>
          ) : (
            <button type="button" onClick={selectAll}>Seleccionar todos</button>
          )}
        </div>
      </div>

      <input 
        className="user-selector-search" 
        placeholder="🔍 Buscar participante..." 
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div className="user-selector-list">
        {filtered.map(u => {
          const isSel = selectedIds.includes(u.id);
          return (
            <div key={u.id} className={`user-selector-item ${isSel ? 'selected' : ''}`} onClick={() => toggle(u.id)}>
              <div className="user-selector-avatar">
                {(u.nombre || u.username).charAt(0).toUpperCase()}
              </div>
              <div className="user-selector-name">
                {u.nombre || u.username}
              </div>
              <div className="user-selector-check">
                <span className="user-selector-check-icon">✓</span>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="dim-text" style={{padding: '8px 0'}}>No se encontraron usuarios</p>}
      </div>
    </div>
  );
}
