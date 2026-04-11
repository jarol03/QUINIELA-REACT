# 🏆 Quiniela 2026 - React

Una aplicación web moderna, rápida y optimizada para la gestión y participación en quinielas de fútbol. Construida con **React**, **Vite** y **Supabase**, diseñada expresamente para escalar eficientemente a miles de pronósticos sin sacrificar velocidad ni rendimiento.

---

## ✨ Características Principales

*   **🎮 Panel de Usuario Interactivo:** Los usuarios pueden seleccionar jornadas, ingresar pronósticos y llevar un seguimiento del porcentaje de llenado antes de la fecha límite de cada partido.
*   **📊 Sistema de Clasificación Global y por Jornadas:** Ranking competitivo dinámico que se actualiza en tiempo real basado en los resultados reales ingresados por el administrador.
*   **🔥 Sistema de Racha (3 Exactos):** Un premio especial calculado meticulosamente para encontrar al primer usuario en acertar 3 marcadores exactos consecutivos.
*   **⚙️ Funciones Administrativas Avanzadas:** 
    *   Creación, congelación y cierre de Jornadas.
    *   Alta y edición en vivo de partidos (Nombres, fechas límites, resultados finales).
    *   Visibilidad de las rachas y recálculo de puntuación con modo "Debug".
*   **🚀 Ultra Optimizado (O(N)):** Las lógicas pesadas (como la clasificación y las rachas) se calculan mediante agrupamientos indexados en JS y se apoyan nativamente en *Vistas SQL (Views)* en Supabase, ahorrando la descarga de miles de pronósticos obsoletos.

---

## 🛠️ Tecnologías Utilizadas

*   **Frontend:** React (Hooks funcionales) via Vite
*   **Backend / Base de Datos:** Supabase (PostgreSQL)
*   **Despliegue de DB:** Supabase RPCs, Vistas SQL para filtrado de datos (*ranking_jornada_view*, *racha_pronosticos_view*).

---

## ⚙️ Requisitos y Instalación

1.  **Clonar el repositorio:**
    ```bash
    git clone https://github.com/jarol03/QUINIELA-REACT.git
    cd quiniela-react
    ```

2.  **Instalar dependencias:**
    Asegúrate de tener Node.js instalado.
    ```bash
    npm install
    ```

3.  **Configurar Variables de Entorno:**
    Crea un archivo `.env` en la raíz del proyecto y agrega tus claves de Supabase:
    ```env
    VITE_SUPABASE_URL=tu_url_de_supabase
    VITE_SUPABASE_ANON_KEY=tu_llave_anonima
    VITE_ADMIN_PASSWORD=contraseña_para_entrar_al_dash_admin
    ```

4.  **Correr el Servidor de Desarrollo:**
    ```bash
    npm run dev
    ```

---

## 🗄️ Notas de Base de Datos (Supabase)

Para el funcionamiento fluido y ultra-rápido de los cálculos, la base de datos debe contemplar ciertas vistas optimizadas.

### 1. Vista de Rachas (`racha_pronosticos_view`)
Esta vista destruye duplicados e ignora los pronósticos de partidos que aún no terminan, pre-entregando una versión pura de los datos para la pantalla de *Rachas*:
```sql
CREATE OR REPLACE VIEW racha_pronosticos_view AS
SELECT DISTINCT ON (pr.usuario_id, pr.partido_id)
    pr.id, pr.created_at, pr.usuario_id, pr.jornada_id, pr.partido_id, pr.goles_local, pr.goles_visitante
FROM pronosticos pr
INNER JOIN partidos p ON p.id = pr.partido_id
WHERE p.goles_local_real IS NOT NULL
ORDER BY pr.usuario_id, pr.partido_id, pr.created_at DESC;

GRANT SELECT ON racha_pronosticos_view TO anon, authenticated;
```

---

*Creado a medida para la Quiniela 2026. ¡Que gane el mejor pronosticador!*
