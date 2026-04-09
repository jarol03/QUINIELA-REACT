import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "../styles/pdfmodal.css";
import { jsPDF } from "jspdf";

export default function PDFExportModal({
  open,
  onClose,
  title,
  subtitle,
  type,
  data = [],
  extraHeader,
  jornada,
}) {
  const [cols, setCols] = useState(3);
  const [fontSize, setFontSize] = useState("md");
  const [showUser, setShowUser] = useState(false);
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
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);


  if (!open) return null;

  // Ordenar por nombre solo en previas
  const sortedData = type === "previas"
    ? [...data].sort((a, b) => {
        const nA = (a.nombre || a.username || "").toLowerCase();
        const nB = (b.nombre || b.username || "").toLowerCase();
        return nA.localeCompare(nB, "es");
      })
    : data;

  const itemsPerCol = Math.ceil(sortedData.length / cols);
  const columns = Array.from({ length: cols }, (_, i) =>
    sortedData.slice(i * itemsPerCol, (i + 1) * itemsPerCol),
  );

  const fsMap = {
    sm: { name: 11, sub: 9, row: 8 },
    md: { name: 12, sub: 10, row: 9 },
    lg: { name: 14, sub: 11, row: 10 },
  };
  const fs = fsMap[fontSize];

  const truncateText = (doc, text, maxWidth) => {
    if (doc.getTextWidth(text) <= maxWidth) return text;
    let truncated = text;
    while (
      doc.getTextWidth(truncated + "…") > maxWidth &&
      truncated.length > 0
    ) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + "…";
  };

  const generatePDF = async () => {
    setGenerating(true);
    try {
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: [220, 210],
      });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const PAD = 12;

      // --- LÓGICA DE DESPLAZAMIENTO (Solo para previas) ---
      const offsetMap = { 1: 90, 2: 40, 3: 20, 4: 12, 5: 5 };
      const currentOffset = type === "previas" ? offsetMap[cols] || 17 : 17;
      const dataBlockWidth = type === "previas" ? currentOffset + 5 : 25;

      doc.setFillColor(13, 15, 26);
      doc.rect(0, 0, W, H, "F");
      doc.setFillColor(0, 180, 120);
      doc.rect(0, 0, W, 1.5, "F");

      doc.setFontSize(fs.name + 6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(240, 244, 255);
      doc.text(title, PAD, 14);

      if (subtitle) {
        doc.setFontSize(fs.sub);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 120, 160);
        doc.text(subtitle, PAD, 20);
      }

      if (jornada) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 200, 140);
        doc.text(jornada.toUpperCase(), W - PAD, 14, { align: "right" });
      }

      let contentY = subtitle ? 26 : 22;

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
          doc.text(`${b.pct}%  (${b.count})`, bx + barW - 1, contentY, {
            align: "right",
          });
          doc.setFillColor(30, 36, 58);
          doc.roundedRect(bx, contentY + 1.5, barW, 2.5, 0.8, 0.8, "F");
          doc.setFillColor(...b.color);
          const fw = Math.max((b.pct / 100) * barW, 0.5);
          doc.roundedRect(bx, contentY + 1.5, fw, 2.5, 0.8, 0.8, "F");
        });
        contentY += 10;
      }

      doc.setDrawColor(30, 42, 72);
      doc.line(PAD, contentY, W - PAD, contentY);
      contentY += 4;

      const rowH =
        showUser || (type === "previas" && showHora)
          ? fs.row * 0.6 + 4.5
          : fs.row * 0.6 + 2.5;
      const tableH = H - contentY - 10;
      const colW = (W - PAD * 2 - (cols - 1) * 3) / cols;
      const maxRows = Math.floor(tableH / rowH);

      columns.forEach((colData, ci) => {
        const cx = PAD + ci * (colW + 3);
        const rightEdge = cx + colW;

        // Línea divisoria entre columnas
        if (ci > 0) {
          doc.setDrawColor(30, 42, 72);
          doc.line(cx - 1.5, contentY - 4, cx - 1.5, contentY + maxRows * rowH);
        }

        // --- ENCABEZADOS DE COLUMNA (Se dibujan una vez por columna) ---
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(70, 90, 130);

        if (type === "puntos") {
          doc.text("PARTICIPANTE", cx, contentY);
          if (showExtraCols) {
            doc.text("PTS", cx + colW * 0.55, contentY, { align: "center" });
            doc.text("🎯", cx + colW * 0.68, contentY, { align: "center" });
            doc.text("✓", cx + colW * 0.8, contentY, { align: "center" });
          } else {
            doc.text("PTS", cx + colW * 0.9, contentY, { align: "center" });
          }
        } else {
          doc.text("PARTICIPANTE", cx, contentY);
          doc.text("MARCADOR", rightEdge - currentOffset, contentY, {
            align: "center",
          });
          doc.text("R", rightEdge - 1, contentY, { align: "right" });
        }

        doc.setDrawColor(40, 55, 85);
        doc.line(cx, contentY + 1, cx + colW, contentY + 1);

        // --- FILAS DE DATOS ---
        colData.forEach((row, ri) => {
          // CALCULAMOS EL ÍNDICE GLOBAL: (Columna actual * Items por columna) + Fila actual
          const globalIndex = ci * itemsPerCol + ri;

          const rowTop = contentY + 2 + ri * rowH;
          const centerY = rowTop + rowH / 2;
          const textY = centerY + fs.row * 0.15;

          // Fondo cebra
          if (ri % 2 === 0) {
            doc.setFillColor(20, 25, 42);
            doc.rect(cx, rowTop, colW, rowH, "F");
          }

          const hasSubName =
            showUser && row.username && row.nombre !== row.username;
          const nameY = hasSubName ? textY - 1.6 : textY;
          const subNameY = textY + 2.2;

          if (type === "puntos") {
            // El número de ranking ahora es global
            const medal = `${row.pos || globalIndex + 1}`;

            doc.setFontSize(fs.row - 1);
            doc.setFont("helvetica", "bold");

            // Colores Oro, Plata y Bronce solo para el top 3 GLOBAL
            doc.setTextColor(
              globalIndex === 0
                ? 251
                : globalIndex === 1
                  ? 192
                  : globalIndex === 2
                    ? 180
                    : 90,
              globalIndex === 0
                ? 191
                : globalIndex === 1
                  ? 192
                  : globalIndex === 2
                    ? 100
                    : 105,
              globalIndex === 0
                ? 36
                : globalIndex === 1
                  ? 192
                  : globalIndex === 2
                    ? 60
                    : 140,
            );

            doc.text(medal, cx + 2, textY, { align: "center" });

            // Datos del Participante
            doc.setFont("helvetica", "bold");
            doc.setTextColor(220, 230, 248);
            doc.setFontSize(fs.row);
            const nm = row.nombre || row.username || "";
            doc.text(truncateText(doc, nm, colW * 0.45), cx + 6, nameY);

            if (hasSubName) {
              doc.setFontSize(fs.row - 2.5);
              doc.setFont("helvetica", "normal");
              doc.setTextColor(80, 100, 140);
              doc.text(`@${row.username}`, cx + 6, subNameY);
            }

            // Puntajes
            doc.setFontSize(fs.name);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(0, 210, 140);

            if (showExtraCols) {
              doc.text(String(row.pts ?? 0), cx + colW * 0.55, textY, {
                align: "center",
              });
              doc.setFontSize(fs.row);
              doc.setTextColor(180, 220, 255);
              doc.text(String(row.exactos ?? 0), cx + colW * 0.68, textY, {
                align: "center",
              });
              doc.setTextColor(140, 175, 220);
              doc.text(String(row.resultados ?? 0), cx + colW * 0.8, textY, {
                align: "center",
              });
            } else {
              doc.text(String(row.pts ?? 0), cx + colW * 0.9, textY, {
                align: "center",
              });
            }
          } else {
            // MODO PREVIAS
            const nm = row.nombre || row.username || "";
            doc.setFontSize(fs.row);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(220, 230, 248);

            const maxNameWidth = colW - dataBlockWidth;
            doc.text(truncateText(doc, nm, maxNameWidth), cx + 1, nameY);

            if (hasSubName) {
              doc.setFontSize(fs.row - 2.5);
              doc.setFont("helvetica", "normal");
              doc.setTextColor(80, 100, 140);
              doc.text(
                truncateText(doc, `@${row.username}`, maxNameWidth),
                cx + 1,
                subNameY,
              );
            }

            doc.setFont("helvetica", "normal");
            doc.setFontSize(fs.row);

            if (row.gep !== null && row.gep !== undefined) {
              doc.setTextColor(200, 215, 240);
              doc.text(
                `${row.goles_local} – ${row.goles_visitante}`,
                rightEdge - currentOffset,
                textY,
                { align: "center" },
              );

              // NUEVO: Agregar la hora en pequeñito si el check está activo
              if (showHora && row.hora) {
                doc.setFontSize(fs.row - 3); // Hace la letra más pequeña
                doc.setTextColor(120, 135, 160); // Un tono gris sutil
                doc.text(
                  row.hora,
                  rightEdge - currentOffset,
                  textY + 2.8, // Lo baja un poco respecto al marcador
                  { align: "center" },
                );
                doc.setFontSize(fs.row); // Restaurar el tamaño de fuente original
              }
            } else {
              doc.setTextColor(70, 85, 115);
              doc.text("—", rightEdge - currentOffset, textY, {
                align: "center",
              });
            }

            if (row.gep) {
              const gepC = {
                G: [0, 210, 140],
                E: [220, 160, 20],
                P: [220, 80, 110],
              };
              doc.setFont("helvetica", "bold");
              doc.setTextColor(...(gepC[row.gep] || [150, 150, 150]));
              doc.text(row.gep, rightEdge - 1, textY, { align: "right" });
            }
          }
        });
      });

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(50, 65, 100);
      doc.text(
        `Quiniela Mundial 2026 · ${new Date().toLocaleString("es-HN")}`,
        PAD,
        H - 5,
      );

      doc.text(`${sortedData.length} participantes`, W - PAD, H - 5, {
        align: "right",
      });

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
      <div className="pdfm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pdfm-header">
          <div>
            <h2 className="pdfm-title">Exportar PDF</h2>
            <p className="pdfm-sub">{title}</p>
          </div>
          <button className="pdfm-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="pdfm-body">
          <div className="pdfm-config">
            <div className="pdfm-field">
              <label className="pdfm-label">Número de columnas</label>
              <div className="pdfm-cols-btns">
                {[3, 4].map((n) => (
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
            <div className="pdfm-field">
              <label className="pdfm-label">Tamaño de texto</label>
              <div className="pdfm-toggle-group">
                {[
                  ["sm", "Pequeño"],
                  ["md", "Mediano"],
                  ["lg", "Grande"],
                ].map(([v, l]) => (
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
            <div className="pdfm-field">
              <label className="pdfm-label">Opciones</label>
              <div className="pdfm-checkboxes">
                <label className="pdfm-check">
                  {/* <input type="checkbox" checked={showUser} onChange={e => setShowUser(e.target.checked)} />
                  <span>Mostrar @usuario bajo el nombre</span> */}
                </label>
                {type === "previas" && (
                  <label className="pdfm-check">
                    <input
                      type="checkbox"
                      checked={showHora}
                      onChange={(e) => setShowHora(e.target.checked)}
                    />
                    <span>Mostrar hora del pronóstico</span>
                  </label>
                )}
              </div>
            </div>
            <button
              className="pdfm-generate-btn"
              onClick={generatePDF}
              disabled={generating}
            >
              {generating ? "Generando..." : "⬇ Descargar PDF"}
            </button>
          </div>
          <div className="pdfm-preview-wrap">
            <div className="pdfm-preview-label">
              Vista previa (A4 horizontal)
            </div>
            <div className="pdfm-preview" ref={previewRef}>
              <div className="pdfm-page">
                <div className="pdfm-page-header">
                  <div>
                    <div className="pdfm-page-title">{title}</div>
                    {subtitle && (
                      <div className="pdfm-page-sub">{subtitle}</div>
                    )}
                  </div>
                  {jornada && (
                    <div className="pdfm-page-jornada">{jornada}</div>
                  )}
                </div>
                <div className="pdfm-page-divider" />
                <div
                  className="pdfm-page-cols"
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    gap: "10px",
                  }}
                >
                  {columns.map((colData, ci) => (
                    <div
                      key={ci}
                      className={`pdfm-page-col ${ci > 0 ? "pdfm-col-border" : ""}`}
                      style={{ paddingLeft: "8px" }}
                    >
                      {colData.slice(0, 10).map((row, ri) => (
                        <div
                          key={ri}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "3px 0",
                            borderBottom: "1px solid #222",
                            fontSize: "10px",
                          }}
                        >
                          <span>{row.nombre || row.username}</span>
                          <span style={{ color: "#00d28c" }}>
                            {row.goles_local}-{row.goles_visitante}{" "}
                            <b>{row.gep}</b>
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

