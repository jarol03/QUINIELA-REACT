import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import "../styles/datetimepicker.css";

// ── Helpers ────────────────────────────────────────────────────────────────

export function utcToLocal(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  return {
    year:   d.getFullYear(),
    month:  d.getMonth() + 1,
    day:    d.getDate(),
    hour:   d.getHours(),
    minute: d.getMinutes(),
  };
}

export function localToISO({ year, month, day, hour, minute }) {
  const d = new Date(year, month - 1, day, hour, minute, 0);
  const pad = n => String(n).padStart(2, "0");
  const tzOffset = -d.getTimezoneOffset();
  const sign = tzOffset >= 0 ? "+" : "-";
  const absOffset = Math.abs(tzOffset);
  const tzHH = pad(Math.floor(absOffset / 60));
  const tzMM = pad(absOffset % 60);
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${sign}${tzHH}:${tzMM}`;
}

export function formatDisplay(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  return d.toLocaleString("es-HN", {
    weekday: "short", day: "2-digit", month: "short",
    year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ── Constantes ─────────────────────────────────────────────────────────────
const MONTHS     = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS_SHORT = ["Do","Lu","Ma","Mi","Ju","Vi","Sá"];

function getDaysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
function getFirstDayOfMonth(year, month) { return new Date(year, month - 1, 1).getDay(); }

// ── Componente ─────────────────────────────────────────────────────────────
export default function DateTimePicker({ value, onChange, placeholder = "Sin fecha límite" }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState("calendar");

  const init = value ? utcToLocal(value) : null;
  const now  = new Date();
  const [viewYear,  setViewYear]  = useState(init?.year  ?? now.getFullYear());
  const [viewMonth, setViewMonth] = useState(init?.month ?? now.getMonth() + 1);
  const [selDay,    setSelDay]    = useState(init?.day   ?? null);
  const [selYear,   setSelYear]   = useState(init?.year  ?? null);
  const [selMonth,  setSelMonth]  = useState(init?.month ?? null);
  const [hour,      setHour]      = useState(init?.hour  ?? 23);
  const [minute,    setMinute]    = useState(init?.minute ?? 59);

  useEffect(() => {
    const parsed = value ? utcToLocal(value) : null;
    if (parsed) {
      setViewYear(parsed.year); setViewMonth(parsed.month);
      setSelYear(parsed.year); setSelMonth(parsed.month); setSelDay(parsed.day);
      setHour(parsed.hour); setMinute(parsed.minute);
    } else {
      setSelDay(null); setSelYear(null); setSelMonth(null);
    }
  }, [value]);

  // Bloquear scroll del body cuando el modal está abierto
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const openModal  = () => { setOpen(true); setStep("calendar"); };
  const closeModal = () => setOpen(false);

  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1); }
    else setViewMonth(m => m + 1);
  };

  const selectDay = (day) => {
    setSelDay(day); setSelYear(viewYear); setSelMonth(viewMonth);
    setStep("time");
  };

  const confirm = () => {
    if (!selDay) return;
    onChange(localToISO({ year: selYear, month: selMonth, day: selDay, hour, minute }));
    closeModal();
  };

  const clear = (e) => {
    e.stopPropagation();
    onChange("");
    setSelDay(null); setSelYear(null); setSelMonth(null);
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay    = getFirstDayOfMonth(viewYear, viewMonth);
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const isSelected = d => d && selDay === d && selMonth === viewMonth && selYear === viewYear;
  const isToday    = d => {
    const t = new Date();
    return d === t.getDate() && viewMonth === t.getMonth() + 1 && viewYear === t.getFullYear();
  };

  const displayText = value ? formatDisplay(value) : null;

  const modal = open && createPortal(
    <div className="dtp-overlay" onClick={closeModal}>
      <div className="dtp-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header del modal ── */}
        <div className="dtp-modal-header">
          <div>
            <h3 className="dtp-modal-title">Fecha límite</h3>
            <p className="dtp-modal-sub">
              {step === "calendar" ? "Selecciona el día de cierre" : `${selDay} de ${MONTHS[selMonth - 1]} ${selYear}`}
            </p>
          </div>
          <button className="dtp-close" onClick={closeModal}>✕</button>
        </div>

        {step === "calendar" ? (
          <>
            {/* Navegación de mes */}
            <div className="dtp-month-nav">
              <button className="dtp-nav-btn" onClick={prevMonth}>◀</button>
              <span className="dtp-month-label">{MONTHS[viewMonth - 1]} {viewYear}</span>
              <button className="dtp-nav-btn" onClick={nextMonth}>▶</button>
            </div>

            {/* Grilla de días */}
            <div className="dtp-grid">
              {DAYS_SHORT.map(d => <span key={d} className="dtp-day-header">{d}</span>)}
              {cells.map((d, i) => (
                <button
                  key={i}
                  className={`dtp-day ${!d ? "dtp-empty" : ""} ${isSelected(d) ? "dtp-selected" : ""} ${isToday(d) ? "dtp-today" : ""}`}
                  onClick={() => d && selectDay(d)}
                  disabled={!d}
                >
                  {d ?? ""}
                </button>
              ))}
            </div>

            {/* Footer */}
            {selDay && selMonth === viewMonth && selYear === viewYear && (
              <div className="dtp-footer">
                <span className="dtp-sel-label">Seleccionado: {selDay} de {MONTHS[selMonth - 1]}</span>
                <button className="dtp-next-btn" onClick={() => setStep("time")}>Hora →</button>
              </div>
            )}

            {/* Quitar fecha */}
            {value && (
              <button className="dtp-remove-btn" onClick={e => { clear(e); closeModal(); }}>
                🗑 Quitar fecha límite
              </button>
            )}
          </>
        ) : (
          <>
            {/* Selector de hora */}
            <div className="dtp-time-picker">
              <div className="dtp-time-col">
                <button className="dtp-time-arrow" onClick={() => setHour(h => (h + 1) % 24)}>▲</button>
                <span className="dtp-time-val">{String(hour).padStart(2, "0")}</span>
                <button className="dtp-time-arrow" onClick={() => setHour(h => (h - 1 + 24) % 24)}>▼</button>
                <span className="dtp-time-unit">hora</span>
              </div>
              <span className="dtp-time-colon">:</span>
              <div className="dtp-time-col">
                <button className="dtp-time-arrow" onClick={() => setMinute(m => (m + 5) % 60)}>▲</button>
                <span className="dtp-time-val">{String(minute).padStart(2, "0")}</span>
                <button className="dtp-time-arrow" onClick={() => setMinute(m => (m - 5 + 60) % 60)}>▼</button>
                <span className="dtp-time-unit">min</span>
              </div>
            </div>

            {/* Atajos de hora */}
            <div className="dtp-time-presets">
              {[[8,0],[12,0],[18,0],[23,59]].map(([h,m]) => (
                <button
                  key={h}
                  className={`dtp-preset ${hour === h && minute === m ? "active" : ""}`}
                  onClick={() => { setHour(h); setMinute(m); }}
                >
                  {String(h).padStart(2,"0")}:{String(m).padStart(2,"0")}
                </button>
              ))}
            </div>

            {/* Acciones */}
            <div className="dtp-modal-actions">
              <button className="dtp-back-btn" onClick={() => setStep("calendar")}>◀ Cambiar día</button>
              <button className="dtp-confirm-btn" onClick={confirm}>✓ Confirmar</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );

  return (
    <>
      {/* Trigger */}
      <button
        className={`dtp-trigger ${open ? "dtp-open" : ""} ${value ? "dtp-has-value" : ""}`}
        onClick={openModal}
      >
        <span className="dtp-icon">🗓</span>
        <span className="dtp-label">{displayText ?? placeholder}</span>
        {value && <span className="dtp-clear" onClick={clear} title="Quitar fecha">✕</span>}
        <span className="dtp-chevron">▼</span>
      </button>

      {modal}
    </>
  );
}