import { useState } from "react";

const REGLAS_SOURCES = ["/reglas.jpeg", "/reglas.png", "/reglas.jpg", "/reglas.webp"];

export default function ReglasView() {
  const [srcIndex, setSrcIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  const src = REGLAS_SOURCES[srcIndex];

  const handleError = () => {
    if (srcIndex < REGLAS_SOURCES.length - 1) {
      setSrcIndex((i) => i + 1);
    } else {
      setFailed(true);
    }
  };

  return (
    <div className="user-tab-content reglas-view">
      <div className="user-section-header">
        <h2 className="user-section-title">📋 Reglas</h2>
        <p className="user-section-sub">Normas oficiales de la quiniela</p>
      </div>

      {failed ? (
        <div className="empty-state reglas-empty">
          <span className="empty-icon">🖼️</span>
          <p>No se encontró la imagen de reglas.</p>
          <span>
            Coloca el archivo en <code>public/reglas.png</code> (o .jpg / .webp) y recarga la página.
          </span>
        </div>
      ) : (
        <div className="reglas-img-wrap">
          <img
            key={src}
            src={src}
            alt="Reglas de la quiniela"
            className="reglas-img"
            onError={handleError}
          />
        </div>
      )}
    </div>
  );
}
