import { useState } from "react";
import { supabase } from "../supabaseClient";
import "../styles/panel.css";
import "../styles/admin.css";
import DateTimePicker, { formatDisplay } from "./DateTimePicker";
import PuntosTab from "./PuntosTab";
import PreviasTab from "./PreviasTab";
import AdminFinalTab from "./AdminFinalTab";
import RachaTab from "./RachaTab";
import { useEffect } from "react";

const TABS = [
  { id: "jornadas", icon: "🗓",  label: "Jornadas" },
  { id: "usuarios", icon: "👥",  label: "Jugadores" },
  { id: "puntos",   icon: "🏆",  label: "Puntos" },
  { id: "previas",  icon: "📊",  label: "Previas" },
  { id: "final",    icon: "🥇",  label: "La Final" },
  { id: "racha",    icon: "🔥",  label: "Racha" },
  { id: "copiar",   icon: "📋",  label: "Copiar" },
  { id: "pagos",    icon: "💰",  label: "Pagos" },
];

const TAB_DESC = {
  jornadas: "Gestiona jornadas y partidos",
  usuarios: "Administra los participantes",
  puntos:   "Tabla de posiciones",
  previas:  "Pronósticos por partido",
  final:    "Predicción del partido final",
  racha:    "Premio por 3 exactos seguidos",
  copiar:   "Exporta pronósticos a Excel",
  pagos:    "Control de pagos y recaudación",
};

export default function AdminPanel({ user, onLogout }) {
  const [tab, setTab] = useState("jornadas");

  return (
    <div className="admin-app">
      {/* ── HEADER ── */}
      <header className="admin-app-header">
        <div className="admin-app-header-left">
          <span className="admin-app-logo">⚽</span>
          <div>
            <span className="admin-app-title">Quiniela 2026</span>
            <span className="admin-app-badge">Luis Espinal</span>
          </div>
        </div>
        <button className="panel-logout" onClick={onLogout}>Salir</button>
      </header>

      {/* ── TAB TITLE ── */}
      <div className="admin-tab-title-bar">
        <h1 className="admin-tab-title">{TABS.find(t => t.id === tab)?.icon} {TABS.find(t => t.id === tab)?.label}</h1>
        <p className="admin-tab-desc">{TAB_DESC[tab]}</p>
      </div>

      {/* ── CONTENT ── */}
      <div className="admin-app-content">
        {tab === "jornadas" && <JornadasTab />}
        {tab === "usuarios" && <UsuariosTab />}
        {tab === "puntos"   && <PuntosTab />}
        {tab === "previas"  && <PreviasTab />}
        {tab === "final"    && <AdminFinalTab />}
        {tab === "racha"    && <RachaTab />}
        {tab === "copiar"   && <CopiarTab />}
        {tab === "pagos"    && <PagosTab />}
      </div>

      {/* ── BOTTOM NAV ── */}
      <nav className="admin-bottom-nav">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`admin-bn-item ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span className="admin-bn-icon">{t.icon}</span>
            <span className="admin-bn-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}


/* ═══════════════════════════════════════
   TAB: JORNADAS
═══════════════════════════════════════ */
function JornadasTab() {
  const [jornadas,      setJornadas]      = useState([]);
  const [selectedJ,     setSelectedJ]     = useState(null);
  const [partidos,      setPartidos]      = useState([]);
  const [newName,       setNewName]       = useState("");
  const [newLocal,      setNewLocal]      = useState("");
  const [newVisitante,  setNewVisitante]  = useState("");
  const [newPartidoFecha, setNewPartidoFecha] = useState("");
  const [creating,      setCreating]      = useState(false);
  const [toast,         setToast]         = useState("");
  // Edición de fecha por partido
  const [editFechaPartidoId, setEditFechaPartidoId] = useState(null);
  const [editFechaPartidoVal, setEditFechaPartidoVal] = useState("");

  useEffect(() => { fetchJornadas(); }, []);

  const fetchJornadas = async () => {
    const { data } = await supabase.from("jornadas").select("*").order("created_at", { ascending: false });
    setJornadas(data || []);
  };

  const fetchPartidos = async (id) => {
    const { data } = await supabase.from("partidos").select("*").eq("jornada_id", id).order("orden");
    setPartidos(data || []);
  };

  const createJornada = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    await supabase.from("jornadas").insert({ nombre: newName.trim(), terminada: false });
    setNewName("");
    fetchJornadas();
    showToast("Jornada creada ✓");
    setCreating(false);
  };

  const deleteJornada = async (id) => {
    if (!confirm("¿Eliminar esta jornada y todos sus datos?")) return;
    await supabase.from("pronosticos").delete().eq("jornada_id", id);
    await supabase.from("partidos").delete().eq("jornada_id", id);
    await supabase.from("jornadas").delete().eq("id", id);
    if (selectedJ?.id === id) setSelectedJ(null);
    fetchJornadas();
    showToast("Jornada eliminada");
  };

  const toggleTerminada = async (j) => {
    const nuevoEstado = !j.terminada;
    await supabase.from("jornadas").update({ terminada: nuevoEstado }).eq("id", j.id);
    fetchJornadas();
    if (selectedJ?.id === j.id) setSelectedJ(prev => ({ ...prev, terminada: nuevoEstado }));
    showToast(nuevoEstado ? "Jornada terminada" : "Jornada reactivada ✓");
  };

  const selectJornada = (j) => { setSelectedJ(j); fetchPartidos(j.id); };

  const addPartido = async () => {
    if (!newLocal.trim() || !newVisitante.trim()) return;
    await supabase.from("partidos").insert({
      jornada_id:       selectedJ.id,
      equipo_local:     newLocal.trim(),
      equipo_visitante: newVisitante.trim(),
      orden:            partidos.length + 1,
      fecha_limite:     newPartidoFecha || null,
    });
    setNewLocal(""); setNewVisitante(""); setNewPartidoFecha("");
    fetchPartidos(selectedJ.id);
    showToast("Partido agregado ✓");
  };

  const deletePartido = async (id) => {
    await supabase.from("pronosticos").delete().eq("partido_id", id);
    await supabase.from("partidos").delete().eq("id", id);
    fetchPartidos(selectedJ.id);
  };

  const startEditFechaPartido = (p) => {
    setEditFechaPartidoId(p.id);
    setEditFechaPartidoVal(p.fecha_limite || "");
  };

  const saveFechaPartido = async (id) => {
    await supabase.from("partidos").update({ fecha_limite: editFechaPartidoVal || null }).eq("id", id);
    setEditFechaPartidoId(null);
    fetchPartidos(selectedJ.id);
    showToast("Fecha del partido actualizada ✓");
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const statusLabel = (j) => {
    if (j.terminada) return { text: "Terminada", cls: "tag-done" };
    return { text: "Activa", cls: "tag-open" };
  };

  return (
    <div className="jornadas-tab">
      {toast && <div className="toast">{toast}</div>}
      <div className="jornadas-layout">
        {/* ── Col izq: jornadas ── */}
        <div className="jornadas-col">
          <div className="col-section">
            <h3 className="col-label">Nueva jornada</h3>
            <div className="create-stack">
              <input className="admin-input" placeholder="Nombre de la jornada..." value={newName}
                onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && createJornada()} />
              <button className="admin-btn-primary w-full" onClick={createJornada} disabled={creating || !newName.trim()}>
                {creating ? "Creando..." : "+ Crear jornada"}
              </button>
            </div>
          </div>

          <div className="col-section">
            <h3 className="col-label">Jornadas ({jornadas.length})</h3>
            <div className="jornada-list">
              {jornadas.length === 0 && <p className="dim-text">Sin jornadas aún.</p>}
              {jornadas.map(j => {
                const st = statusLabel(j);
                return (
                  <div key={j.id} className={`jornada-item ${selectedJ?.id === j.id ? "selected" : ""} ${j.terminada ? "item-done" : ""}`}>
                    <div className="jornada-item-top" onClick={() => selectJornada(j)}>
                      <div className="jornada-item-info">
                        <span className={`item-tag ${st.cls}`}>{st.text}</span>
                        <span className="jornada-item-name">{j.nombre}</span>
                      </div>
                      <div className="jornada-item-actions" onClick={e => e.stopPropagation()}>
                        <button className={`toggle-btn ${j.terminada ? "toggle-reactivar" : "toggle-terminar"}`} onClick={() => toggleTerminada(j)}>
                          {j.terminada ? "↩ Reactivar" : "✓ Terminar"}
                        </button>
                        <button className="icon-btn danger" onClick={() => deleteJornada(j.id)}>🗑</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Col der: partidos ── */}
        <div className="partidos-col">
          {!selectedJ ? (
            <div className="empty-state-col"><span style={{ fontSize: 40 }}>👈</span><p>Selecciona una jornada</p></div>
          ) : (
            <>
              <div className="col-section">
                <h3 className="col-label">Partidos — {selectedJ.nombre}</h3>
                <p className="dim-text" style={{marginBottom:12}}>{partidos.length} partido{partidos.length !== 1 ? "s" : ""}</p>
                <div className="create-stack">
                  <div className="partido-inputs-row">
                    <input className="admin-input" placeholder="Equipo local" value={newLocal}
                      onChange={e => setNewLocal(e.target.value)} onKeyDown={e => e.key === "Enter" && addPartido()} />
                    <span className="vs-mini-label">vs</span>
                    <input className="admin-input" placeholder="Equipo visitante" value={newVisitante}
                      onChange={e => setNewVisitante(e.target.value)} onKeyDown={e => e.key === "Enter" && addPartido()} />
                  </div>
                  <div className="datetime-row">
                    <label className="dt-label">Fecha límite del partido (opcional)</label>
                    <DateTimePicker value={newPartidoFecha} onChange={setNewPartidoFecha} placeholder="Sin fecha límite — click para agregar" />
                  </div>
                  <button className="admin-btn-primary" onClick={addPartido} disabled={!newLocal.trim() || !newVisitante.trim()}>
                    + Agregar partido
                  </button>
                </div>
              </div>

              <div className="col-section">
                <div className="partido-items">
                  {partidos.length === 0 && <p className="dim-text">Sin partidos aún.</p>}
                  {partidos.map((p, i) => {
                    const isClosed = p.fecha_limite && new Date() > new Date(p.fecha_limite);
                    const isEditingFecha = editFechaPartidoId === p.id;
                    return (
                      <div key={p.id} className={`partido-item-admin ${isClosed ? "partido-item-closed" : ""}`}>
                        <div className="partido-item-top">
                          <span className="partido-item-num">{i + 1}</span>
                          <div className="partido-item-teams">
                            <span className="pit-team">{p.equipo_local}</span>
                            <span className="pit-vs">vs</span>
                            <span className="pit-team">{p.equipo_visitante}</span>
                          </div>
                          <button className="icon-btn danger" onClick={() => deletePartido(p.id)}>🗑</button>
                        </div>
                        {/* Fecha límite por partido */}
                        <div className="partido-item-fecha" onClick={e => e.stopPropagation()}>
                          {isEditingFecha ? (
                            <div className="fecha-edit-row">
                              <DateTimePicker value={editFechaPartidoVal} onChange={setEditFechaPartidoVal} placeholder="Sin fecha límite" />
                              <button className="fecha-save-btn" onClick={() => saveFechaPartido(p.id)}>Guardar</button>
                              <button className="fecha-cancel-btn" onClick={() => setEditFechaPartidoId(null)}>✕</button>
                            </div>
                          ) : (
                            <button className="fecha-display-btn" onClick={() => startEditFechaPartido(p)}>
                              {p.fecha_limite
                                ? `${isClosed ? "🔒" : "⏰"} ${formatDisplay(p.fecha_limite)}`
                                : "⏰ Sin fecha límite — click para agregar"}
                              <span className="fecha-edit-hint">✏️</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   TAB: USUARIOS
═══════════════════════════════════════ */
function UsuariosTab() {
  const [usuarios,    setUsuarios]    = useState([]);
  const [newUser,     setNewUser]     = useState("");
  const [newNombre,   setNewNombre]   = useState("");
  const [creating,    setCreating]    = useState(false);
  const [search,      setSearch]      = useState("");
  const [toast,       setToast]       = useState("");
  const [editingId,   setEditingId]   = useState(null);
  const [editNombre,  setEditNombre]  = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [savingEdit,  setSavingEdit]  = useState(false);

  useEffect(() => { fetchUsuarios(); }, []);

  const fetchUsuarios = async () => {
    const { data } = await supabase.from("usuarios").select("*").order("username");
    setUsuarios(data || []);
  };

  const createUser = async () => {
    const username = newUser.trim().toLowerCase().replace(/\s+/g, "");
    if (!username) return;
    setCreating(true);
    const { error } = await supabase.from("usuarios").insert({
      username,
      nombre: newNombre.trim() || username,
    });
    if (!error) { setNewUser(""); setNewNombre(""); fetchUsuarios(); showToast("Usuario creado ✓"); }
    else showToast("Error: ese usuario ya existe.");
    setCreating(false);
  };

  const deleteUser = async (id, name) => {
    if (!confirm(`¿Eliminar a "${name}" y todos sus pronósticos?`)) return;
    await supabase.from("pronosticos").delete().eq("usuario_id", id);
    await supabase.from("usuarios").delete().eq("id", id);
    fetchUsuarios();
    showToast("Usuario eliminado");
  };

  const startEdit = (u) => {
    setEditingId(u.id);
    setEditNombre(u.nombre || u.username);
    setEditUsername(u.username);
  };

  const saveEdit = async (id) => {
    const nuevoUsername = editUsername.trim().toLowerCase().replace(/\s+/g, "");
    const nuevoNombre   = editNombre.trim();
    if (!nuevoUsername) return showToast("El usuario no puede estar vacío.");

    setSavingEdit(true);

    // Verificar si el nuevo username ya existe (en otro usuario)
    const usuarioActual = usuarios.find(u => u.id === id);
    if (nuevoUsername !== usuarioActual.username) {
      const { data: existe } = await supabase
        .from("usuarios").select("id").eq("username", nuevoUsername).single();
      if (existe) {
        showToast("Ese usuario ya existe, elige otro.");
        setSavingEdit(false);
        return;
      }
    }

    const { error } = await supabase.from("usuarios").update({
      username: nuevoUsername,
      nombre:   nuevoNombre || nuevoUsername,
    }).eq("id", id);

    if (!error) {
      setEditingId(null);
      fetchUsuarios();
      showToast("Usuario actualizado ✓");
    } else {
      showToast("Error al actualizar.");
    }
    setSavingEdit(false);
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const filtered = usuarios.filter(u =>
    u.username.includes(search.toLowerCase()) ||
    (u.nombre || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="usuarios-tab">
      {toast && <div className="toast">{toast}</div>}
      <div className="usuarios-layout">

        {/* Agregar */}
        <div className="usuarios-add-card">
          <h3 className="col-label">Agregar participante</h3>
          <div className="add-user-fields">
            <div className="add-user-field">
              <label className="dt-label">Nombre completo</label>
              <input className="admin-input" placeholder="Ej: Juan García..." value={newNombre}
                onChange={e => setNewNombre(e.target.value)} onKeyDown={e => e.key === "Enter" && createUser()} />
            </div>
            <div className="add-user-field">
              <label className="dt-label">Usuario (para login)</label>
              <input className="admin-input" placeholder="Ej: juangarcia (sin espacios)..." value={newUser}
                onChange={e => setNewUser(e.target.value)} onKeyDown={e => e.key === "Enter" && createUser()} />
            </div>
          </div>
          <button className="admin-btn-primary w-full" onClick={createUser} disabled={creating || !newUser.trim()}>
            {creating ? "..." : "+ Agregar participante"}
          </button>
          <p className="field-hint" style={{marginTop:8}}>
            El usuario ingresa con el <strong>usuario</strong> (sin contraseña). El nombre se muestra en las tablas.
          </p>
        </div>

        {/* Lista */}
        <div className="usuarios-list-card">
          <div className="usuarios-list-header">
            <h3 className="col-label">Participantes ({usuarios.length})</h3>
            <input className="admin-input admin-input-sm" placeholder="🔍 Buscar..." value={search}
              onChange={e => setSearch(e.target.value)} style={{ maxWidth: 200 }} />
          </div>
          <div className="usuarios-grid">
            {filtered.length === 0 && <p className="dim-text">Sin resultados.</p>}
            {filtered.map((u, i) => (
              <div key={u.id} className="user-card" style={{ animationDelay: `${i * 0.03}s` }}>
                <div className="user-card-avatar">{(u.nombre || u.username).charAt(0).toUpperCase()}</div>

                <div className="user-card-info">
                  {editingId === u.id ? (
                    /* ── Modo edición ── */
                    <div className="user-edit-fields">
                      <div className="user-edit-field">
                        <label className="user-edit-label">Nombre</label>
                        <div className="user-edit-row">
                          <input
                            className="admin-input admin-input-sm"
                            value={editNombre}
                            onChange={e => setEditNombre(e.target.value)}
                            placeholder="Nombre completo"
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="user-edit-field">
                        <label className="user-edit-label">Usuario (login)</label>
                        <div className="user-edit-row">
                          <input
                            className="admin-input admin-input-sm"
                            value={editUsername}
                            onChange={e => setEditUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                            placeholder="username"
                          />
                        </div>
                      </div>
                      <div className="user-edit-actions">
                        <button className="fecha-save-btn" onClick={() => saveEdit(u.id)} disabled={savingEdit}>
                          {savingEdit ? "..." : "✓ Guardar"}
                        </button>
                        <button className="fecha-cancel-btn" onClick={() => setEditingId(null)}>✕ Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    /* ── Modo visualización ── */
                    <>
                      <span className="user-card-name">{u.nombre || u.username}</span>
                      <span className="user-card-username">@{u.username}</span>
                    </>
                  )}
                </div>

                {editingId !== u.id && (
                  <div className="user-card-actions">
                    <button className="icon-btn" onClick={() => startEdit(u)} title="Editar">✏️</button>
                    <button className="user-card-delete" onClick={() => deleteUser(u.id, u.nombre || u.username)}>✕</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   TAB: COPIAR
═══════════════════════════════════════ */
function CopiarTab() {
  const [jornadas, setJornadas]   = useState([]);
  const [selectedJ, setSelectedJ] = useState(null);
  const [usuarios, setUsuarios]   = useState([]);
  const [partidos, setPartidos]   = useState([]);
  const [allProns, setAllProns]   = useState([]);
  const [userIdx, setUserIdx]     = useState(0);
  const [copied, setCopied]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [sortAZ, setSortAZ]       = useState(true);
  const [search, setSearch]       = useState("");

  useEffect(() => {
    const fetchJornadas = async () => {
      const { data } = await supabase.from("jornadas").select("*").order("created_at", { ascending: false });
      setJornadas(data || []);
    };
    fetchJornadas();
  }, []);

  const loadJornada = async (j) => {
    setLoading(true); setSelectedJ(j); setUserIdx(0); setCopied(false); setSearch("");
    const [{ data: pts }, { data: prons }, { data: usrs }] = await Promise.all([
      supabase.from("partidos").select("*").eq("jornada_id", j.id).order("orden"),
      supabase.from("pronosticos").select("*").eq("jornada_id", j.id),
      supabase.from("usuarios").select("*").order("username"),
    ]);
    setPartidos(pts || []); setAllProns(prons || []); setUsuarios(usrs || []);
    setLoading(false);
  };

  const filteredUsers = usuarios
    .filter(u => u.username.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortAZ ? a.username.localeCompare(b.username) : b.username.localeCompare(a.username));

  const currentUser = filteredUsers[userIdx];
  const countProns = (u) => partidos.filter(p => allProns.some(pr => pr.usuario_id === u.id && pr.partido_id === p.id && pr.goles_local !== null)).length;

  const handleCopy = () => {
    if (!currentUser) return;
    const text = partidos.map(p => {
      const pron = allProns.find(pr => pr.usuario_id === currentUser.id && pr.partido_id === p.id);
      return `${pron?.goles_local ?? ""}\t${pron?.goles_visitante ?? ""}`;
    }).join("\n");
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const goTo = (idx) => { setCopied(false); setUserIdx(idx); };
  useEffect(() => { setUserIdx(0); setCopied(false); }, [sortAZ, search]);

  const totalProns = currentUser ? countProns(currentUser) : 0;
  const pct = partidos.length > 0 ? Math.round((totalProns / partidos.length) * 100) : 0;

  return (
    <div className="copiar-tab">
      <div className="copiar-section">
        <h3 className="col-label">Selecciona una jornada</h3>
        <div className="jornada-pills">
          {jornadas.map(j => (
            <button key={j.id} className={`jornada-pill ${selectedJ?.id === j.id ? "active" : ""}`} onClick={() => loadJornada(j)}>
              {j.nombre}{j.terminada && <span className="pill-done">✓</span>}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="loading-state"><div className="spinner" /><p>Cargando...</p></div>}

      {selectedJ && !loading && (
        <div className="copiar-layout">
          <div className="copiar-users-panel">
            <div className="cup-header">
              <h3 className="col-label">Participantes ({filteredUsers.length})</h3>
              <div className="cup-controls">
                <input className="admin-input admin-input-sm" placeholder="🔍 Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
                <button className={`sort-btn ${sortAZ ? "active" : ""}`} onClick={() => setSortAZ(v => !v)}>{sortAZ ? "A→Z" : "Z→A"}</button>
              </div>
            </div>
            <div className="cup-list">
              {filteredUsers.map((u, i) => {
                const cnt = countProns(u);
                const done = cnt === partidos.length;
                return (
                  <button key={u.id} className={`cup-user-item ${userIdx === i ? "active" : ""} ${done ? "cup-done" : ""}`} onClick={() => goTo(i)}>
                    <div className="cup-avatar">{u.username.charAt(0).toUpperCase()}</div>
                    <div className="cup-user-info">
                      <span className="cup-username">{u.username}</span>
                      <span className="cup-progress-text">{cnt}/{partidos.length} pronósticos</span>
                    </div>
                    {done && <span className="cup-check">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="copiar-detail-panel">
            {!currentUser ? <div className="empty-state-col"><p>Selecciona un participante</p></div> : (
              <>
                <div className="detail-user-header">
                  <div className="detail-avatar">{currentUser.username.charAt(0).toUpperCase()}</div>
                  <div className="detail-user-meta">
                    <h2 className="detail-username">{currentUser.username}</h2>
                    <div className="detail-progress-row">
                      <div className="detail-progress-track"><div className="detail-progress-fill" style={{ width: `${pct}%` }} /></div>
                      <span className="detail-pct">{totalProns}/{partidos.length}</span>
                    </div>
                  </div>
                  <div className="detail-nav">
                    <button className="nav-arrow" onClick={() => goTo(Math.max(userIdx-1,0))} disabled={userIdx===0}>◀</button>
                    <span className="detail-nav-count">{userIdx+1}/{filteredUsers.length}</span>
                    <button className="nav-arrow" onClick={() => goTo(Math.min(userIdx+1,filteredUsers.length-1))} disabled={userIdx===filteredUsers.length-1}>▶</button>
                  </div>
                </div>
                <div className="detail-table-wrap">
                  <table className="preview-table">
                    <thead><tr><th className="pt-num">#</th><th className="pt-partido">Partido</th><th className="pt-gol">Local</th><th className="pt-sep"></th><th className="pt-gol">Visit.</th></tr></thead>
                    <tbody>
                      {partidos.map((p, i) => {
                        const pron = allProns.find(pr => pr.usuario_id === currentUser.id && pr.partido_id === p.id);
                        return (
                          <tr key={p.id}>
                            <td className="pt-num-cell">{i+1}</td>
                            <td className="pt-partido">{p.equipo_local} <span className="pt-vs">vs</span> {p.equipo_visitante}</td>
                            <td className={`pt-gol ${pron?.goles_local === null || pron?.goles_local === undefined ? "missing" : ""}`}>{pron?.goles_local ?? "—"}</td>
                            <td className="pt-sep-cell">–</td>
                            <td className={`pt-gol ${pron?.goles_visitante === null || pron?.goles_visitante === undefined ? "missing" : ""}`}>{pron?.goles_visitante ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="detail-actions">
                  <div className="detail-btns">
                    <button className={`copiar-btn ${copied ? "copied" : ""}`} onClick={handleCopy}>{copied ? "✓ Copiado" : "📋 Copiar para Excel"}</button>
                    {userIdx < filteredUsers.length - 1 && (
                      <button className="siguiente-btn" onClick={() => goTo(userIdx+1)}>Siguiente → {filteredUsers[userIdx+1]?.username}</button>
                    )}
                    {userIdx === filteredUsers.length - 1 && <span className="fin-text">✓ Último participante</span>}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PagosTab() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [updating, setUpdating] = useState(null);
  const [precioInscripcion, setPrecioInscripcion] = useState(0);
  const [savingPrecio, setSavingPrecio] = useState(false);

  useEffect(() => { 
    fetchUsuarios(); 
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    const { data } = await supabase
      .from("configuracion")
      .select("valor")
      .eq("clave", "precio_inscripcion")
      .maybeSingle();
    if (data) setPrecioInscripcion(data.valor.monto || 0);
  };

  const saveConfig = async (monto) => {
    setSavingPrecio(true);
    const { error } = await supabase
      .from("configuracion")
      .upsert({ clave: "precio_inscripcion", valor: { monto } });
    if (!error) {
      setPrecioInscripcion(monto);
      showToast("Precio guardado ✓");
    } else {
      showToast("Error al guardar precio");
    }
    setSavingPrecio(false);
  };

  const fetchUsuarios = async () => {
    setLoading(true);
    const { data: usrs } = await supabase.from("usuarios").select("id, username, nombre").order("nombre");
    const { data: pgs } = await supabase.from("pagos").select("*");
    const combined = (usrs || []).map(u => {
      const p = pgs?.find(x => x.usuario_id === u.id);
      return { ...u, pagado: p?.pagado ?? false };
    });
    setUsuarios(combined);
    setLoading(false);
  };

  const syncPago = async (user, updates) => {
    setUpdating(user.id);
    const { error } = await supabase.from("pagos").upsert({
      usuario_id: user.id,
      ...updates,
      updated_at: new Date().toISOString()
    });
    if (!error) {
      setUsuarios(prev => prev.map(u => u.id === user.id ? { ...u, ...updates } : u));
      if (updates.pagado !== undefined) {
        showToast(updates.pagado ? "Marcado como pagado ✓" : "Marcado como pendiente");
      }
    } else {
      showToast("Error al guardar");
    }
    setUpdating(null);
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2000); };

  const filtered = usuarios.filter(u =>
    (u.nombre || "").toLowerCase().includes(search.toLowerCase()) ||
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  const pagadosCount = usuarios.filter(u => u.pagado).length;
  const totalDinero = pagadosCount * precioInscripcion;

  return (
    <div className="pagos-tab">
      {toast && <div className="toast">{toast}</div>}
      <div className="pagos-summary-grid">
        <div className="pagos-stat-card">
          <span className="psc-label">Participantes Pagados</span>
          <span className="psc-value">{pagadosCount} <span className="psc-total">/ {usuarios.length}</span></span>
        </div>
        <div className="pagos-stat-card highlight">
          <span className="psc-label">Total Recaudado</span>
          <span className="psc-value">L. {totalDinero.toLocaleString()}</span>
        </div>
      </div>

      <div className="pagos-config-card">
        <div className="pcc-info">
          <span className="pcc-label">Precio de Inscripción</span>
          <span className="pcc-sub">Establece el monto único para todos</span>
        </div>
        <div className="pcc-action">
          <span className="monto-currency">L.</span>
          <input 
            type="number" 
            className="monto-input" 
            defaultValue={precioInscripcion}
            onBlur={(e) => {
              const val = parseFloat(e.target.value) || 0;
              if (val !== precioInscripcion) saveConfig(val);
            }}
            disabled={savingPrecio}
          />
        </div>
      </div>
      <div className="pagos-controls">
        <h3 className="col-label">Lista de Usuarios</h3>
        <input className="admin-input" placeholder="🔍 Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="pagos-list">
        {loading && <div className="loading-state"><div className="spinner" /> Cargando...</div>}
        {filtered.map(u => (
          <div key={u.id} className={`pago-card ${u.pagado ? "is-paid" : ""}`}>
            <div className="pago-card-info">
              <span className="pci-name">{u.nombre || u.username}</span>
              <span className="pci-username">@{u.username}</span>
            </div>
            <div className="pago-card-actions">
              <button className={`pago-toggle ${u.pagado ? "btn-paid" : "btn-pending"}`}
                onClick={() => syncPago(u, { pagado: !u.pagado })} disabled={updating === u.id}>
                {u.pagado ? "✓ PAGADO" : "MARCAR PAGO"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}