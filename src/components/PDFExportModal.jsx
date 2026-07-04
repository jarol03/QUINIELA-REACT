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
    else if (n <= 120) setCols(4);
    else if (n <= 200) setCols(6);
    else setCols(7);
  }, [open, data.length]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);


  if (!open) return null;

  // Ordenar por pronóstico (campeón) en final, por nombre en previas
  const sortedData = type === "previas"
    ? [...data].sort((a, b) => {
        const nA = (a.nombre || a.username || "").toLowerCase();
        const nB = (b.nombre || b.username || "").toLowerCase();
        return nA.localeCompare(nB, "es");
      })
    : type === "final"
    ? [...data].sort((a, b) => {
        if (a.sinPred && !b.sinPred) return 1;
        if (!a.sinPred && b.sinPred) return -1;
        if (a.sinPred && b.sinPred) {
          const nA = (a.nombre || a.username || "").toLowerCase();
          const nB = (b.nombre || b.username || "").toLowerCase();
          return nA.localeCompare(nB, "es");
        }
        const cA = (a.campeon || "").toLowerCase();
        const cB = (b.campeon || "").toLowerCase();
        if (cA !== cB) return cA.localeCompare(cB, "es");
        const vA = (a.subcampeon || "").toLowerCase();
        const vB = (b.subcampeon || "").toLowerCase();
        if (vA !== vB) return vA.localeCompare(vB, "es");
        const gA = Number(a.goles_campeon);
        const gB = Number(b.goles_campeon);
        if (gA !== gB) return gA - gB;
        const sgA = Number(a.goles_subcampeon);
        const sgB = Number(b.goles_subcampeon);
        if (sgA !== sgB) return sgA - sgB;
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
      const neededRows = Math.max(...columns.map(c => c.length));
      const fs = fsMap[fontSize];
      const rowH = type === "final"
        ? fs.row * 0.4 + 3.5
        : showUser || (type === "previas" && showHora)
          ? fs.row * 0.6 + 4.5
          : fs.row * 0.6 + 2.5;

      let preContentY = subtitle ? 26 : 22;
      if (type === "final" && extraHeader?.stats) preContentY += 8;
      if ((type === "previas" || type === "final") && extraHeader?.barData) {
        const barsPerRow = 4;
        preContentY += Math.ceil(extraHeader.barData.length / barsPerRow) * 10;
      }
      preContentY += 4;

      const pageHeight = Math.max(preContentY + neededRows * rowH + 120, 200);

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: [270, pageHeight],
      });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const PAD = 12;

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

      if ((type === "previas" || type === "final") && extraHeader?.barData) {
        if (type === "final" && extraHeader.stats) {
          // Draw "Con Vida" / "Eliminados"
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(240, 244, 255);
          doc.text("Participantes", PAD, contentY);
          
          doc.setFillColor(0, 200, 140);
          doc.roundedRect(PAD + 25, contentY - 4, 30, 6, 1, 1, "F");
          doc.setTextColor(10, 20, 30);
          doc.text(`Con Vida  ${extraHeader.stats.pctVivos}%`, PAD + 27, contentY + 0.5);

          doc.setFillColor(248, 113, 113);
          doc.roundedRect(PAD + 60, contentY - 4, 30, 6, 1, 1, "F");
          doc.setTextColor(10, 20, 30);
          doc.text(`Eliminados  ${extraHeader.stats.pctMuertos}%`, PAD + 62, contentY + 0.5);

          doc.setFillColor(56, 189, 248);
          const llenaronTxt = `Llenaron  ${extraHeader.stats.llenaron}/${extraHeader.stats.totalUsuarios}`;
          const llenaronW = doc.getTextWidth(llenaronTxt) + 10;
          doc.roundedRect(PAD + 95, contentY - 4, Math.max(llenaronW, 30), 6, 1, 1, "F");
          doc.setTextColor(10, 20, 30);
          doc.text(llenaronTxt, PAD + 97, contentY + 0.5);
          
          contentY += 8;
        }

        const barsPerRow = 4;
        const barW = (W - PAD * 2 - (barsPerRow - 1) * 3) / barsPerRow;
        extraHeader.barData.forEach((b, i) => {
          const rowIdx = Math.floor(i / barsPerRow);
          const colIdx = i % barsPerRow;
          const bx = PAD + colIdx * (barW + 3);
          const yOff = contentY + rowIdx * 10;
          doc.setFontSize(7);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...b.color);
          const maxLabelW = barW - 22;
          const label = doc.getTextWidth(b.label) > maxLabelW
            ? truncateText(doc, b.label, maxLabelW)
            : b.label;
          doc.text(label, bx, yOff);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(180, 195, 220);
          doc.text(`${b.pct}%  (${b.count})`, bx + barW - 1, yOff, {
            align: "right",
          });
          doc.setFillColor(30, 36, 58);
          doc.roundedRect(bx, yOff + 1.5, barW, 2.5, 0.8, 0.8, "F");
          doc.setFillColor(...b.color);
          const fw = Math.max((b.pct / 100) * barW, 0.5);
          doc.roundedRect(bx, yOff + 1.5, fw, 2.5, 0.8, 0.8, "F");
        });
        const numRows = Math.ceil(extraHeader.barData.length / barsPerRow);
        contentY += numRows * 10;
      }

      doc.setDrawColor(30, 42, 72);
      doc.line(PAD, contentY, W - PAD, contentY);
      contentY += 4;

      const colW = (W - PAD * 2 - (cols - 1) * 3) / cols;
      const scoreBlockWidth = type === "previas"
        ? Math.min(Math.max(colW * 0.3, cols >= 6 ? 15 : 21), 35)
        : 0;
      const nameMaxWidth = colW - scoreBlockWidth - 3;

      columns.forEach((colData, ci) => {
        const cx = PAD + ci * (colW + 3);
        const rightEdge = cx + colW;

        // Línea divisoria entre columnas
        if (ci > 0) {
          doc.setDrawColor(30, 42, 72);
          doc.line(cx - 1.5, contentY - 4, cx - 1.5, contentY + colData.length * rowH);
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
        } else if (type === "final") {
          doc.text("PARTICIPANTE", cx, contentY);
          doc.text("CAMP", cx + colW * 0.42, contentY);
          doc.text("RES", cx + colW * 0.68, contentY, { align: "center" });
          doc.text("PREMIO", rightEdge - 1, contentY, { align: "right" });
        } else {
          doc.text("PARTICIPANTE", cx, contentY);
          doc.text("MARCADOR", rightEdge - scoreBlockWidth / 2, contentY, {
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

          // Fondo basado en chances o cebra
          if (row.chances === "zona") {
            doc.setFillColor(0, 35, 22);
            doc.rect(cx, rowTop, colW, rowH, "F");
          } else if (row.chances === "con") {
            doc.setFillColor(30, 27, 12);
            doc.rect(cx, rowTop, colW, rowH, "F");
          } else if (row.chances === "sin") {
            doc.setFillColor(35, 18, 24);
            doc.rect(cx, rowTop, colW, rowH, "F");
          } else if (ri % 2 === 0) {
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

            // Colores según chances (jornada) o posición global
            if (row.chances === "zona") {
              const p = row.pos || globalIndex + 1;
              doc.setTextColor(
                p <= 1 ? 251 : p <= 2 ? 192 : 180,
                p <= 1 ? 191 : p <= 2 ? 192 : 100,
                p <= 1 ? 36  : p <= 2 ? 192 : 60,
              );
            } else if (row.chances === "con") {
              doc.setTextColor(251, 191, 36);
            } else if (row.chances === "sin") {
              doc.setTextColor(220, 110, 130);
            } else {
              doc.setTextColor(
                globalIndex === 0 ? 251 : globalIndex === 1 ? 192 : globalIndex === 2 ? 180 : 90,
                globalIndex === 0 ? 191 : globalIndex === 1 ? 192 : globalIndex === 2 ? 100 : 105,
                globalIndex === 0 ? 36  : globalIndex === 1 ? 192 : globalIndex === 2 ? 60  : 140,
              );
            }

            doc.text(medal, cx + 2, textY, { align: "center" });

            // Datos del Participante
            doc.setFont("helvetica", "bold");
            if (row.chances === "sin") {
              doc.setTextColor(200, 180, 185);
            } else {
              doc.setTextColor(220, 230, 248);
            }
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
            if (row.chances === "zona") {
              doc.setTextColor(0, 210, 140);
            } else if (row.chances === "con") {
              doc.setTextColor(251, 191, 36);
            } else if (row.chances === "sin") {
              doc.setTextColor(255, 130, 150);
            } else {
              doc.setTextColor(0, 210, 140);
            }

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
          } else if (type === "final") {
            const nm = row.nombre || row.username || "";
            doc.setFont("helvetica", "bold");
            doc.setTextColor(220, 230, 248);

            let nameFS = fs.row - 1;
            doc.setFontSize(nameFS);
            let displayName = nm;
            const maxNameW = colW * 0.32;
            while (doc.getTextWidth(displayName) > maxNameW && nameFS > 5.5) {
              nameFS -= 0.5;
              doc.setFontSize(nameFS);
            }
            if (doc.getTextWidth(displayName) > maxNameW) {
              displayName = truncateText(doc, nm, maxNameW);
            }
            doc.text(displayName, cx + 1, nameY);

            if (row.sinPred) {
              doc.setFontSize(fs.row - 2);
              doc.setFont("helvetica", "normal");
              doc.setTextColor(100, 115, 150);
              doc.text("Sin predicción", cx + colW * 0.42, nameY);
            } else {
              // Campeon
              doc.setFont("helvetica", "bold");
              doc.setFontSize(fs.row - 2.5);
              doc.setTextColor(0, 210, 140);
              const champTxt = truncateText(doc, row.campeon || "", colW * 0.16);
              doc.text(champTxt, cx + colW * 0.42, nameY - 0.3);
              
              // Resultado
              doc.setFontSize(fs.row - 1);
              doc.setTextColor(200, 215, 240);
              const gC = row.goles_campeon != null ? row.goles_campeon : "–";
              const gS = row.goles_subcampeon != null ? row.goles_subcampeon : "–";
              doc.text(`${gC} - ${gS}`, cx + colW * 0.68, nameY, { align: "center" });
              
              // Subcampeon
              doc.setFontSize(fs.row - 3);
              doc.setFont("helvetica", "normal");
              doc.setTextColor(120, 135, 160);
              const subcTxt = truncateText(doc, `vs ${row.subcampeon || ""}`, colW * 0.28);
              doc.text(subcTxt, cx + colW * 0.42, subNameY);
            }
            
            if (hasSubName) {
              doc.setFontSize(fs.row - 3);
              doc.setFont("helvetica", "normal");
              doc.setTextColor(80, 100, 140);
              doc.text(
                truncateText(doc, `@${row.username}`, maxNameW),
                cx + 1,
                subNameY,
              );
            }

            // Premio
            doc.setFont("helvetica", "bold");
            doc.setFontSize(fs.row - 1);
            doc.setTextColor(251, 191, 36); // gold
            const premioStr = `L ${Number(row.premio || 0).toLocaleString("es-HN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            doc.text(premioStr, rightEdge - 1, nameY, { align: "right" });
          } else {
            // MODO PREVIAS
            const nm = row.nombre || row.username || "";
            doc.setFont("helvetica", "bold");
            doc.setTextColor(220, 230, 248);

            let nameFS = fs.row;
            doc.setFontSize(nameFS);
            let displayName = nm;
            while (doc.getTextWidth(displayName) > nameMaxWidth && nameFS > 7) {
              nameFS -= 0.5;
              doc.setFontSize(nameFS);
            }
            if (doc.getTextWidth(displayName) > nameMaxWidth) {
              displayName = truncateText(doc, nm, nameMaxWidth);
            }
            doc.text(displayName, cx + 1, nameY);

            if (hasSubName) {
              doc.setFontSize(fs.row - 2.5);
              doc.setFont("helvetica", "normal");
              doc.setTextColor(80, 100, 140);
              doc.text(
                truncateText(doc, `@${row.username}`, nameMaxWidth),
                cx + 1,
                subNameY,
              );
            }

            doc.setFont("helvetica", "normal");
            doc.setFontSize(fs.row);

            const scoreCenterX = rightEdge - scoreBlockWidth / 2;

            if (row.gep !== null && row.gep !== undefined) {
              doc.setTextColor(200, 215, 240);
              doc.text(
                `${row.goles_local} – ${row.goles_visitante}`,
                scoreCenterX,
                textY,
                { align: "center" },
              );

              if (showHora && row.hora) {
                doc.setFontSize(fs.row - 3);
                doc.setTextColor(120, 135, 160);
                doc.text(
                  row.hora,
                  scoreCenterX,
                  textY + 2.8,
                  { align: "center" },
                );
                doc.setFontSize(fs.row);
              }
            } else {
              doc.setTextColor(70, 85, 115);
              doc.text("—", scoreCenterX, textY, {
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

      // --- FINALIZAR Y DESCARGAR ---
      // Sanitizar el nombre del archivo de forma estricta para Chrome
      const safeTitle = (title || "export")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Elimina acentos
        .replace(/[^a-z0-9]/gi, "-")     // Solo letras, números y guiones
        .replace(/-+/g, "-")             // Evita múltiples guiones
        .toLowerCase();
        
      const fileName = `${type === "puntos" ? "Ranking" : type === "final" ? "Final" : "Previa"}-${safeTitle}.pdf`;

      // Método robusto para Chrome (Manual Blob + Delay)
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      
      link.href = url;
      link.download = fileName;
      link.style.display = "none";
      
      document.body.appendChild(link);
      link.click();
      
      // Limpieza con retraso para dar tiempo a que Chrome procese el archivo
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 60000); // 1 minuto de vida para la URL temporal

    } catch (err) {
      console.error("Error generando PDF:", err);
    } finally {
      setGenerating(false);
    }
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
                {[2, 3, 4, 5, 6, 7].map((n) => (
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
                      {colData.map((row, ri) => (
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
                            {type === "final" ? (
                              <span>
                                {row.campeon} <b>{row.goles_campeon}-{row.goles_subcampeon}</b>
                              </span>
                            ) : (
                              <span>
                                {row.goles_local}-{row.goles_visitante} <b>{row.gep}</b>
                              </span>
                            )}
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

