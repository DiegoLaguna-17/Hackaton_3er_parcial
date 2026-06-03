-- Creación de la tabla de notificaciones para el Smart Urban Mobility Platform
-- Esta tabla almacena el historial y la trazabilidad de alertas enviadas a ciudadanos y conductores.

CREATE TABLE IF NOT EXISTS notificaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_receptor VARCHAR(50) NOT NULL CHECK (tipo_receptor IN ('ciudadano', 'conductor', 'operador', 'sistema')),
    receptor_id VARCHAR(100) NOT NULL,
    viaje_id VARCHAR(100),
    tipo_alerta VARCHAR(50) NOT NULL, -- e.g., 'desvio', 'congestion', 'alternativa', 're_enrutamiento'
    mensaje TEXT NOT NULL,
    detalles_desvio JSONB DEFAULT '{}'::jsonb,
    estado VARCHAR(20) DEFAULT 'enviado' CHECK (estado IN ('enviado', 'fallido', 'leido')),
    creado_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para optimizar búsquedas por receptor e historial de auditoría
CREATE INDEX IF NOT EXISTS idx_notificaciones_receptor ON notificaciones (receptor_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_creado_at ON notificaciones (creado_at DESC);
