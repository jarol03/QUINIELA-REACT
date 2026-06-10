-- ═══════════════════════════════════════════════════════════════════
--  MÓDULO DE APUESTAS — Script SQL para Supabase
--  Ejecutar en: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. Grupos de apuesta
--    Un grupo agrupa una o varias jornadas y tiene un estado:
--    abierto → cerrado → liquidado
CREATE TABLE IF NOT EXISTS grupos_apuesta (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre       TEXT NOT NULL,
  descripcion  TEXT,
  jornadas     UUID[] NOT NULL DEFAULT '{}',
  participantes UUID[] NOT NULL DEFAULT '{}',
  estado       TEXT NOT NULL DEFAULT 'abierto'
                 CHECK (estado IN ('abierto', 'cerrado', 'liquidado')),
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 2. Apuestas individuales por grupo
--    Cada usuario puede apostar un monto distinto.
--    Un usuario solo puede tener UNA apuesta por grupo.
CREATE TABLE IF NOT EXISTS apuestas (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grupo_id    UUID NOT NULL REFERENCES grupos_apuesta(id) ON DELETE CASCADE,
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  monto       NUMERIC(12, 2) NOT NULL CHECK (monto > 0),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(grupo_id, usuario_id)
);

-- 3. Ganadores por grupo
--    El admin marca quién ganó; puede haber varios ganadores.
CREATE TABLE IF NOT EXISTS ganadores_apuesta (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grupo_id    UUID NOT NULL REFERENCES grupos_apuesta(id) ON DELETE CASCADE,
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(grupo_id, usuario_id)
);

-- 4. Índices para performance con muchos datos
CREATE INDEX IF NOT EXISTS idx_apuestas_grupo ON apuestas(grupo_id);
CREATE INDEX IF NOT EXISTS idx_ganadores_grupo ON ganadores_apuesta(grupo_id);

-- ═══════════════════════════════════════════════════════════════════
--  DESHABILITAR RLS (Row Level Security)
--  Necesario para que la aplicación pueda escribir sin Supabase Auth
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE grupos_apuesta DISABLE ROW LEVEL SECURITY;
ALTER TABLE apuestas DISABLE ROW LEVEL SECURITY;
ALTER TABLE ganadores_apuesta DISABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════
--  VERIFICACIÓN (ejecutar después de la creación)
-- ═══════════════════════════════════════════════════════════════════
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('grupos_apuesta', 'apuestas', 'ganadores_apuesta');
