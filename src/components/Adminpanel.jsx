import { useState } from "react";
import { supabase } from "../supabaseClient";
import "../styles/panel.css";
import "../styles/admin.css";
import DateTimePicker, { formatDisplay } from "./DateTimePicker";
import PuntosTab from "./PuntosTab";
import PreviasTab from "./PreviasTab";
import { useEffect } from "react";

const TABS = [
  { id: "jornadas", label: "🗓 Jornadas",          desc: "Gestiona jornadas y partidos" },
  { id: "usuarios", label: "👥 Participantes",      desc: "Administra los usuarios" },
  { id: "puntos",   label: "🏆 Tabla de Puntos",    desc: "Posiciones y puntajes" },
  { id: "previas",  label: "📊 Previas",             desc: "Pronósticos por partido" },
  { id: "copiar",   label: "📋 Copiar Resultados",   desc: "Exporta pronósticos a Excel" },
];

export default function AdminPanel({ user, onLogout }) {
  const [tab, setTab]           = useState("jornadas");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const current = TABS.find(t => t.id === tab);

  const handleTabChange = (id) => { setTab(id); setSidebarOpen(false); };

  return (
    <div className="panel-bg admin-layout">
      {/* ── OVERLAY MÓVIL ── */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* ── SIDEBAR ── */}
      <aside className={`admin-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="panel-logo">⚽ Quiniela</span>
          <span className="sidebar-year">2026</span>
          <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>

        <nav className="sidebar-nav">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`sidebar-item ${tab === t.id ? "active" : ""}`}
              onClick={() => handleTabChange(t.id)}
            >
              <span className="sidebar-item-label">{t.label}</span>
              <span className="sidebar-item-desc">{t.desc}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="admin-badge-sm">ADMIN</span>
            <span className="sidebar-username">{user.username}</span>
          </div>
          <button className="panel-logout" onClick={onLogout}>Salir</button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="admin-main">
        {/* Header móvil */}
        <header className="admin-mobile-header">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}>☰</button>
          <span className="panel-logo">⚽ Quiniela 2026</span>
          <button className="panel-logout" onClick={onLogout}>Salir</button>
        </header>

        <div className="admin-content">
          <div className="admin-page-header">
            <h1 className="admin-page-title">{current?.label}</h1>
            <p className="admin-page-desc">{current?.desc}</p>
          </div>

          {tab === "jornadas" && <JornadasTab />}
          {tab === "usuarios" && <UsuariosTab />}
          {tab === "puntos"   && <PuntosTab />}
          {tab === "previas"  && <PreviasTab />}
          {tab === "copiar"   && <CopiarTab />}
        </div>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════
   TAB: JORNADAS
═══════════════════════════════════════ */
function JornadasTab() {
  const [jornadas, setJornadas]         = useState([]);
  const [selectedJ, setSelectedJ]       = useState(null);
  const [partidos, setPartidos]         = useState([]);
  const [newName, setNewName]           = useState("");
  const [newFecha, setNewFecha]         = useState("");
  const [newLocal, setNewLocal]         = useState("");
  const [newVisitante, setNewVisitante] = useState("");
  const [creating, setCreating]         = useState(false);
  const [toast, setToast]               = useState("");
  const [editFechaId, setEditFechaId]   = useState(null);
  const [editFechaVal, setEditFechaVal] = useState("");

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
    await supabase.from("jornadas").insert({ nombre: newName.trim(), fecha_limite: newFecha || null, terminada: false });
    setNewName(""); setNewFecha("");
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

  const startEditFecha = (j) => { setEditFechaId(j.id); setEditFechaVal(j.fecha_limite || ""); };
  const saveFecha = async (id) => {
    await supabase.from("jornadas").update({ fecha_limite: editFechaVal || null }).eq("id", id);
    setEditFechaId(null);
    fetchJornadas();
    showToast("Fecha actualizada ✓");
  };

  const selectJornada = (j) => { setSelectedJ(j); fetchPartidos(j.id); };

  const addPartido = async () => {
    if (!newLocal.trim() || !newVisitante.trim()) return;
    await supabase.from("partidos").insert({
      jornada_id: selectedJ.id,
      equipo_local: newLocal.trim(),
      equipo_visitante: newVisitante.trim(),
      orden: partidos.length + 1,
    });
    setNewLocal(""); setNewVisitante("");
    fetchPartidos(selectedJ.id);
    showToast("Partido agregado ✓");
  };

  const deletePartido = async (id) => {
    await supabase.from("pronosticos").delete().eq("partido_id", id);
    await supabase.from("partidos").delete().eq("id", id);
    fetchPartidos(selectedJ.id);
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const statusLabel = (j) => {
    if (j.terminada) return { text: "Terminada", cls: "tag-done" };
    if (j.fecha_limite && new Date() > new Date(j.fecha_limite)) return { text: "Cerrada", cls: "tag-closed" };
    return { text: "Activa", cls: "tag-open" };
  };

  return (
    <div className="jornadas-tab">
      {toast && <div className="toast">{toast}</div>}
      <div className="jornadas-layout">
        <div className="jornadas-col">
          <div className="col-section">
            <h3 className="col-label">Nueva jornada</h3>
            <div className="create-stack">
              <input className="admin-input" placeholder="Nombre de la jornada..." value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && createJornada()} />
              <div className="datetime-row">
                <label className="dt-label">Fecha límite (opcional)</label>
                <DateTimePicker value={newFecha} onChange={setNewFecha} placeholder="Sin fecha límite — click para agregar" />
              </div>
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
                const isEditing = editFechaId === j.id;
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
                    <div className="jornada-item-fecha" onClick={e => e.stopPropagation()}>
                      {isEditing ? (
                        <div className="fecha-edit-row">
                          <DateTimePicker value={editFechaVal} onChange={setEditFechaVal} placeholder="Sin fecha límite" />
                          <button className="fecha-save-btn" onClick={() => saveFecha(j.id)}>Guardar</button>
                          <button className="fecha-cancel-btn" onClick={() => setEditFechaId(null)}>✕</button>
                        </div>
                      ) : (
                        <button className="fecha-display-btn" onClick={() => startEditFecha(j)}>
                          {j.fecha_limite ? `⏰ ${formatDisplay(j.fecha_limite)}` : "⏰ Sin fecha límite — click para agregar"}
                          <span className="fecha-edit-hint">✏️</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

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
                    <input className="admin-input" placeholder="Equipo local" value={newLocal} onChange={e => setNewLocal(e.target.value)} onKeyDown={e => e.key === "Enter" && addPartido()} />
                    <span className="vs-mini-label">vs</span>
                    <input className="admin-input" placeholder="Equipo visitante" value={newVisitante} onChange={e => setNewVisitante(e.target.value)} onKeyDown={e => e.key === "Enter" && addPartido()} />
                  </div>
                  <button className="admin-btn-primary" onClick={addPartido} disabled={!newLocal.trim() || !newVisitante.trim()}>+ Agregar partido</button>
                </div>
              </div>
              <div className="col-section">
                <div className="partido-items">
                  {partidos.length === 0 && <p className="dim-text">Sin partidos aún.</p>}
                  {partidos.map((p, i) => (
                    <div key={p.id} className="partido-item">
                      <span className="partido-item-num">{i + 1}</span>
                      <div className="partido-item-teams">
                        <span className="pit-team">{p.equipo_local}</span>
                        <span className="pit-vs">vs</span>
                        <span className="pit-team">{p.equipo_visitante}</span>
                      </div>
                      <button className="icon-btn danger" onClick={() => deletePartido(p.id)}>🗑</button>
                    </div>
                  ))}
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
  const [usuarios, setUsuarios] = useState([]);
  const [newUser, setNewUser]   = useState("");
  const [newNombre, setNewNombre] = useState("");
  const [creating, setCreating] = useState(false);
  const [search, setSearch]     = useState("");
  const [toast, setToast]       = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editNombre, setEditNombre] = useState("");

  useEffect(() => { fetchUsuarios(); }, []);

  const fetchUsuarios = async () => {
    const { data } = await supabase.from("usuarios").select("*").order("username");
    setUsuarios(data || []);
  };

  const createUser = async () => {
    const username = newUser.trim().toLowerCase();
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

  const saveNombre = async (id) => {
    await supabase.from("usuarios").update({ nombre: editNombre.trim() }).eq("id", id);
    setEditingId(null);
    fetchUsuarios();
    showToast("Nombre actualizado ✓");
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
        <div className="usuarios-add-card">
          <h3 className="col-label">Agregar participante</h3>
          <div className="add-user-fields">
            <div className="add-user-field">
              <label className="dt-label">Nombre completo</label>
              <input className="admin-input" placeholder="Ej: Luis Espinal..." value={newNombre} onChange={e => setNewNombre(e.target.value)} onKeyDown={e => e.key === "Enter" && createUser()} />
            </div>
            <div className="add-user-field">
              <label className="dt-label">Usuario (para login)</label>
              <input className="admin-input" placeholder="Ej: lespinal02 (sin espacios)..." value={newUser} onChange={e => setNewUser(e.target.value)} onKeyDown={e => e.key === "Enter" && createUser()} />
            </div>
          </div>
          <button className="admin-btn-primary w-full" onClick={createUser} disabled={creating || !newUser.trim()}>
            {creating ? "..." : "+ Agregar participante"}
          </button>
          <p className="field-hint" style={{marginTop:8}}>El usuario ingresa con el <strong>usuario</strong> (sin contraseña). El nombre se muestra en las tablas.</p>
        </div>
        <div className="usuarios-list-card">
          <div className="usuarios-list-header">
            <h3 className="col-label">Participantes ({usuarios.length})</h3>
            <input className="admin-input admin-input-sm" placeholder="🔍 Buscar..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 200 }} />
          </div>
          <div className="usuarios-grid">
            {filtered.length === 0 && <p className="dim-text">Sin resultados.</p>}
            {filtered.map((u, i) => (
              <div key={u.id} className="user-card" style={{ animationDelay: `${i * 0.03}s` }}>
                <div className="user-card-avatar">{(u.nombre || u.username).charAt(0).toUpperCase()}</div>
                <div className="user-card-info">
                  {editingId === u.id ? (
                    <div className="user-edit-row">
                      <input
                        className="admin-input admin-input-sm"
                        value={editNombre}
                        onChange={e => setEditNombre(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveNombre(u.id); if (e.key === "Escape") setEditingId(null); }}
                        autoFocus
                      />
                      <button className="fecha-save-btn" onClick={() => saveNombre(u.id)}>✓</button>
                      <button className="fecha-cancel-btn" onClick={() => setEditingId(null)}>✕</button>
                    </div>
                  ) : (
                    <>
                      <span className="user-card-name">{u.nombre || u.username}</span>
                      <span className="user-card-username">@{u.username}</span>
                    </>
                  )}
                </div>
                <div className="user-card-actions">
                  {editingId !== u.id && (
                    <button className="icon-btn" onClick={() => { setEditingId(u.id); setEditNombre(u.nombre || u.username); }} title="Editar nombre">✏️</button>
                  )}
                  <button className="user-card-delete" onClick={() => deleteUser(u.id, u.nombre || u.username)}>✕</button>
                </div>
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

  useEffect(() => { fetchJornadas(); }, []);
  const fetchJornadas = async () => {
    const { data } = await supabase.from("jornadas").select("*").order("created_at", { ascending: false });
    setJornadas(data || []);
  };

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