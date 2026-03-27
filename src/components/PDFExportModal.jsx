import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "../styles/pdfmodal.css";
import { jsPDF } from "jspdf";

/**
 * PDFExportModal
 * Props:
 * open: bool
 * onClose: fn
 * title: string  — título del documento
 * subtitle: string — subtítulo
 * type: "previas" | "puntos"
 * data: array de filas a mostrar
 * extraHeader: ReactNode — contenido extra arriba (barras de porcentaje, etc.)
 */
export default function PDFExportModal({ open, onClose, title, subtitle, type, data = [], extraHeader, jornada }) {
  const [cols, setCols]         = useState(3);
  const [fontSize, setFontSize] = useState("md");   // sm | md | lg
  const [showUser, setShowUser] = useState(false);  // mostrar @username
  const [showHora, setShowHora] = useState(type === "previas");
  const [showExtraCols, setShowExtraCols] = useState(false); 
  const [generating, setGenerating] = useState(false);
  const previewRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const n = data.length;
    if (n <= 20) setCols(1);
    else if (n <= 45) setCols(2);
    else if (n <= 80) setCols(3);
    else setCols(4);
  }, [open, data.length]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const itemsPerCol = Math.ceil(data.length / cols);
  const columns = Array.from({ length: cols }, (_, i) => data.slice(i * itemsPerCol, (i + 1) * itemsPerCol));

  const fsMap = { sm: { name: 11, sub: 9, row: 8 }, md: { name: 12, sub: 10, row: 9 }, lg: { name: 14, sub: 11, row: 10 } };
  const fs = fsMap[fontSize];

  // ── Generar PDF ──────────────────────────────────────────────────────────
  const generatePDF = async () => {
    setGenerating(true);
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const PAD = 12;

      // Fondo
      doc.setFillColor(13, 15, 26);
      doc.rect(0, 0, W, H, "F");

      // Franja superior
      doc.setFillColor(0, 180, 120);
      doc.rect(0, 0, W, 1.5, "F");

      // Título
      doc.setFontSize(fs.name + 6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(240, 244, 255);
      doc.text(title, PAD, 14);

      // Subtítulo
      if (subtitle) {
        doc.setFontSize(fs.sub);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 120, 160);
        doc.text(subtitle, PAD, 20);
      }

      // Jornada badge
      if (jornada) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 200, 140);
        doc.text(jornada.toUpperCase(), W - PAD, 14, { align: "right" });
      }

      let contentY = subtitle ? 26 : 22;

      // Extra header (barras de porcentaje)
      if (type === "previas" && extraHeader?.barData) {
        const barW = (W - PAD * 2) / 3;
        extraHeader.barData.forEach((b, i) => {
          const bx = PAD + i * (barW + 3);
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...b.color);
          doc.text(b.label, bx, contentY);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(180, 195, 220);
          doc.text(`${b.pct}%  (${b.count})`, bx + barW - 1, contentY, { align: "right" });
          doc.setFillColor(30, 36, 58);
          doc.roundedRect(bx, contentY + 1.5, barW, 2.5, 0.8, 0.8, "F");
          doc.setFillColor(...b.color);
          const fw = Math.max((b.pct / 100) * barW, 0.5);
          doc.roundedRect(bx, contentY + 1.5, fw, 2.5, 0.8, 0.8, "F");
        });
        contentY += 10;
      }

      // Línea separadora
      doc.setDrawColor(30, 42, 72);
      doc.line(PAD, contentY, W - PAD, contentY);
      contentY += 4;

      // Geometría dinámica de las filas para asegurar centrado vertical
      const rowH    = showUser ? fs.row * 0.6 + 4.5 : fs.row * 0.6 + 2.5; 
      const tableH  = H - contentY - 10;
      const colW    = (W - PAD * 2 - (cols - 1) * 3) / cols;
      const maxRows = Math.floor(tableH / rowH);

      columns.forEach((colData, ci) => {
        const cx = PAD + ci * (colW + 3);

        if (ci > 0) {
          doc.setDrawColor(30, 42, 72);
          doc.line(cx - 1.5, contentY - 4, cx - 1.5, contentY + maxRows * rowH);
        }

        // Header de columna (Alineado perfectamente)
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(70, 90, 130);
        if (type === "puntos") {
          doc.text("PARTICIPANTE", cx, contentY);
          if (showExtraCols) {
            doc.text("PTS", cx + colW * 0.55, contentY, { align: "center" });
            doc.text("🎯", cx + colW * 0.68, contentY, { align: "center" });
            doc.text("✓", cx + colW * 0.80, contentY, { align: "center" });
          } else {
            doc.text("PTS", cx + colW * 0.85, contentY, { align: "center" });
          }
        } else {
          doc.text("PARTICIPANTE", cx, contentY);
          doc.text("MARCADOR", cx + colW * 0.48, contentY, { align: "center" });
          doc.text("R", cx + colW * 0.68, contentY, { align: "center" });
          if (showHora) doc.text("HORA", cx + colW * 0.88, contentY, { align: "center" });
        }

        doc.setDrawColor(40, 55, 85);
        doc.line(cx, contentY + 1, cx + colW, contentY + 1);

        colData.forEach((row, ri) => {
          // Centrado vertical matemático
          const rowTop = contentY + 2 + ri * rowH;
          const centerY = rowTop + rowH / 2;
          const textY = centerY + (fs.row * 0.15); // Compensación de línea base para jsPDF

          // Fondo alternado
          if (ri % 2 === 0) {
            doc.setFillColor(20, 25, 42);
            doc.rect(cx, rowTop, colW, rowH, "F");
          }

          const hasSubName = showUser && row.username && row.nombre !== row.username;
          // Si hay 2 líneas, subimos el nombre principal y bajamos el usuario
          const nameY = hasSubName ? textY - 1.6 : textY;
          const subNameY = textY + 2.2;

          if (type === "puntos") {
            const medal = ri === 0 ? "1" : ri === 1 ? "2" : ri === 2 ? "3" : `${row.pos || ri + 1}`;
            doc.setFontSize(fs.row - 1);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(
              ri === 0 ? 251 : ri === 1 ? 192 : ri === 2 ? 180 : 90,
              ri === 0 ? 191 : ri === 1 ? 192 : ri === 2 ? 100 : 105,
              ri === 0 ? 36  : ri === 1 ? 192 : ri === 2 ? 60  : 140
            );
            // Centrado en su columna
            doc.text(medal, cx + 2, textY, { align: "center" });

            doc.setFont("helvetica", "bold");
            doc.setTextColor(220, 230, 248);
            doc.setFontSize(fs.row);
            const nm = row.nombre || row.username || "";
            doc.text(nm.length > 18 ? nm.slice(0, 17) + "…" : nm, cx + 6, nameY);

            if (hasSubName) {
              doc.setFontSize(fs.row - 2.5);
              doc.setFont("helvetica", "normal");
              doc.setTextColor(80, 100, 140);
              doc.text(`@${row.username}`, cx + 6, subNameY);
            }

            // Datos (Con align: "center" para alinearse bajo el icono)
            doc.setFontSize(fs.name);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(0, 210, 140);
            
            if (showExtraCols) {
              doc.text(String(row.pts ?? 0), cx + colW * 0.55, textY, { align: "center" });
              doc.setFontSize(fs.row);
              doc.setTextColor(180, 220, 255);
              doc.text(String(row.exactos ?? 0), cx + colW * 0.68, textY, { align: "center" });
              doc.setTextColor(140, 175, 220);
              doc.text(String(row.resultados ?? 0), cx + colW * 0.80, textY, { align: "center" });
            } else {
               doc.text(String(row.pts ?? 0), cx + colW * 0.85, textY, { align: "center" });
            }

          } else {
            // Tabla de Previas
            const nm = row.nombre || row.username || "";
            doc.setFontSize(fs.row);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(220, 230, 248);
            doc.text(nm.length > 16 ? nm.slice(0, 15) + "…" : nm, cx + 1, nameY);

            if (hasSubName) {
              doc.setFontSize(fs.row - 2.5);
              doc.setFont("helvetica", "normal");
              doc.setTextColor(80, 100, 140);
              doc.text(`@${row.username}`, cx + 1, subNameY);
            }

            doc.setFont("helvetica", "normal");
            doc.setFontSize(fs.row);

            if (row.gep !== null && row.gep !== undefined) {
              doc.setTextColor(200, 215, 240);
              doc.text(`${row.goles_local} – ${row.goles_visitante}`, cx + colW * 0.48, textY, { align: "center" });
            } else {
              doc.setTextColor(70, 85, 115);
              doc.text("—", cx + colW * 0.48, textY, { align: "center" });
            }

            if (row.gep) {
              const gepC = { G: [0, 210, 140], E: [220, 160, 20], P: [220, 80, 110] };
              doc.setFont("helvetica", "bold");
              doc.setFontSize(fs.row);
              doc.setTextColor(...(gepC[row.gep] || [150, 150, 150]));
              doc.text(row.gep, cx + colW * 0.68, textY, { align: "center" });
            }

            if (showHora && row.hora) {
              doc.setFont("helvetica", "normal");
              doc.setFontSize(fs.row - 1.5);
              doc.setTextColor(90, 110, 150);
              doc.text(row.hora, cx + colW * 0.88, textY, { align: "center" });
            }
          }
        });
      });

      // Footer
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(50, 65, 100);
      doc.text(`Quiniela Mundial 2026 · ${new Date().toLocaleString("es-HN")}`, PAD, H - 5);
      doc.text(`${data.length} participantes`, W - PAD, H - 5, { align: "right" });

      doc.setFillColor(0, 180, 120);
      doc.rect(0, H - 1.5, W, 1.5, "F");

      const fileName = `${type === "puntos" ? "Ranking" : "previa"}-${(title || "export").replace(/\s+/g, "-").toLowerCase()}.pdf`;
      doc.save(fileName);

    } catch (err) {
      console.error("Error generando PDF:", err);
    }
    setGenerating(false);
  };

  return createPortal(
    <div className="pdfm-overlay" onClick={onClose}>
      <div className="pdfm-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="pdfm-header">
          <div>
            <h2 className="pdfm-title">Exportar PDF</h2>
            <p className="pdfm-sub">{title}</p>
          </div>
          <button className="pdfm-close" onClick={onClose}>✕</button>
        </div>

        <div className="pdfm-body">
          {/* ── Configuración ── */}
          <div className="pdfm-config">

            {/* Columnas */}
            <div className="pdfm-field">
              <label className="pdfm-label">Número de columnas</label>
              <p className="pdfm-hint">
                {data.length} participantes → ~{Math.ceil(data.length / cols)} por columna
              </p>
              <div className="pdfm-cols-btns">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    className={`pdfm-col-btn ${cols === n ? "active" : ""}`}
                    onClick={() => setCols(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Tamaño de fuente */}
            <div className="pdfm-field">
              <label className="pdfm-label">Tamaño de texto</label>
              <div className="pdfm-toggle-group">
                {[["sm","Pequeño"],["md","Mediano"],["lg","Grande"]].map(([v, l]) => (
                  <button
                    key={v}
                    className={`pdfm-toggle ${fontSize === v ? "active" : ""}`}
                    onClick={() => setFontSize(v)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Opciones */}
            <div className="pdfm-field">
              <label className="pdfm-label">Opciones</label>
              <div className="pdfm-checkboxes">
                <label className="pdfm-check">
                  <input type="checkbox" checked={showUser} onChange={e => setShowUser(e.target.checked)} />
                  <span>Mostrar @usuario bajo el nombre</span>
                </label>
                {type === "puntos" && (
                  <label className="pdfm-check">
                    {/* <input type="checkbox" checked={showExtraCols} onChange={e => setShowExtraCols(e.target.checked)} />
                    <span>Mostrar desglose de puntos (🎯 exactos, ✓ resultados)</span> */}
                  </label>
                )}
                {type === "previas" && (
                  <label className="pdfm-check">
                    <input type="checkbox" checked={showHora} onChange={e => setShowHora(e.target.checked)} />
                    <span>Mostrar hora del pronóstico</span>
                  </label>
                )}
              </div>
            </div>

            {/* Botón generar */}
            <button className="pdfm-generate-btn" onClick={generatePDF} disabled={generating}>
              {generating ? (
                <><span className="pdfm-spinner" /> Generando PDF...</>
              ) : (
                "⬇ Descargar PDF"
              )}
            </button>
          </div>

          {/* ── Preview (HTML) ── */}
          <div className="pdfm-preview-wrap">
            <div className="pdfm-preview-label">Vista previa (A4 horizontal)</div>
            <div className="pdfm-preview" ref={previewRef}>
              <div className="pdfm-page">
                <div className="pdfm-page-stripe" />
                <div className="pdfm-page-header">
                  <div>
                    <div className="pdfm-page-title">{title}</div>
                    {subtitle && <div className="pdfm-page-sub">{subtitle}</div>}
                  </div>
                  {jornada && <div className="pdfm-page-jornada">{jornada}</div>}
                </div>

                {type === "previas" && extraHeader?.barData && (
                  <div className="pdfm-page-bars">
                    {extraHeader.barData.map(b => (
                      <div key={b.label} className="pdfm-page-bar-item">
                        <div className="pdfm-page-bar-label" style={{ color: `rgb(${b.color.join(",")})` }}>
                          {b.label} — {b.pct}%
                        </div>
                        <div className="pdfm-page-bar-track">
                          <div className="pdfm-page-bar-fill" style={{ width: `${b.pct}%`, background: `rgb(${b.color.join(",")})` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pdfm-page-divider" />

                <div className="pdfm-page-cols" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                  {columns.map((colData, ci) => (
                    <div key={ci} className={`pdfm-page-col ${ci > 0 ? "pdfm-col-border" : ""}`}>
                      <div className="pdfm-page-col-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        {type === "puntos" ? (
                          <><span className="pdfm-ch-main">Participante</span><span className="pdfm-ch-right" style={{ textAlign: "center", width: showExtraCols ? "45%" : "20%" }}>{showExtraCols ? "Pts   🎯   ✓" : "Pts"}</span></>
                        ) : (
                          <><span className="pdfm-ch-main">Participante</span><span className="pdfm-ch-right" style={{ textAlign: "center", width: "45%" }}>Marc.   R{showHora ? "   Hora" : ""}</span></>
                        )}
                      </div>
                      {colData.slice(0, 12).map((row, ri) => (
                        <div key={ri} className={`pdfm-page-row ${ri % 2 === 0 ? "pdfm-row-alt" : ""}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                          <div className="pdfm-row-left" style={{ display: 'flex', flexDirection: 'column' }}>
                            <span className="pdfm-row-name" style={{ lineHeight: '1.2' }}>{row.nombre || row.username || "—"}</span>
                            {showUser && row.username && row.nombre !== row.username && (
                              <span className="pdfm-row-user" style={{ lineHeight: '1', fontSize: '0.85em' }}>@{row.username}</span>
                            )}
                          </div>
                          <div className="pdfm-row-right" style={{ textAlign: 'center', width: (type === "puntos" && showExtraCols) || type === "previas" ? '45%' : '20%', display: 'flex', justifyContent: 'space-evenly' }}>
                            {type === "puntos" ? (
                              showExtraCols ? (
                                <><span>{row.pts ?? 0}</span> <span>{row.exactos ?? 0}</span> <span>{row.resultados ?? 0}</span></>
                              ) : (
                                <span>{row.pts ?? 0}</span>
                              )
                            ) : (
                              row.gep ? (
                                <>
                                  <span className="pdfm-row-score">{row.goles_local}–{row.goles_visitante}</span>
                                  <span className={`pdfm-row-gep pdfm-gep-${(row.gep || "").toLowerCase()}`}>{row.gep}</span>
                                  {showHora && <span>{row.hora}</span>}
                                </>
                              ) : <span className="pdfm-row-missing">—</span>
                            )}
                          </div>
                        </div>
                      ))}
                      {colData.length > 12 && (
                        <div className="pdfm-more">+{colData.length - 12} más...</div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="pdfm-page-footer">
                  Quiniela Mundial 2026 · {data.length} participantes
                </div>
                <div className="pdfm-page-stripe pdfm-page-stripe-bottom" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}