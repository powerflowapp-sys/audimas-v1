-- =============================================================================
-- PARTE 1: ARQUITECTURA DE BASE DE DATOS, CONCURRENCIA Y REALTIME EN SUPABASE
-- Web App Mobile-First de Auditoría de Camiones CD en Tienda Retail
-- =============================================================================

-- 0. Habilitar extensión para UUIDs si no está activa
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. TABLA: maestro_productos
-- Catálogo ligero de productos para validación de escaneo
-- =============================================================================
CREATE TABLE IF NOT EXISTS maestro_productos (
    upc VARCHAR(50) PRIMARY KEY,
    sku VARCHAR(50) NOT NULL,
    descripcion TEXT NOT NULL,
    depto_codigo VARCHAR(20),
    depto_nombre VARCHAR(100),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices solicitados para maestro_productos
CREATE INDEX IF NOT EXISTS idx_maestro_productos_sku ON maestro_productos(sku);
CREATE INDEX IF NOT EXISTS idx_maestro_productos_depto_nombre ON maestro_productos(depto_nombre);

-- =============================================================================
-- 2. TABLA: camiones_nae
-- Cabecera de viaje de camiones recibidos en tienda
-- =============================================================================
CREATE TABLE IF NOT EXISTS camiones_nae (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_nae VARCHAR(50) NOT NULL UNIQUE,
    tienda_codigo VARCHAR(20),
    tienda_nombre VARCHAR(100),
    fecha_arribo DATE DEFAULT CURRENT_DATE,
    estado VARCHAR(20) DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'EN_PROCESO', 'FINALIZADO', 'CERRADO')),
    fecha_inicio_auditoria TIMESTAMP WITH TIME ZONE,
    fecha_fin_auditoria TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Asegurar columnas y restricciones si la tabla ya existía previamente
ALTER TABLE camiones_nae ADD COLUMN IF NOT EXISTS fecha_inicio_auditoria TIMESTAMP WITH TIME ZONE;
ALTER TABLE camiones_nae ADD COLUMN IF NOT EXISTS fecha_fin_auditoria TIMESTAMP WITH TIME ZONE;
ALTER TABLE camiones_nae ADD COLUMN IF NOT EXISTS fecha_reapertura TIMESTAMP WITH TIME ZONE;
ALTER TABLE camiones_nae ADD COLUMN IF NOT EXISTS fecha_fin_reapertura TIMESTAMP WITH TIME ZONE;
ALTER TABLE camiones_nae ADD COLUMN IF NOT EXISTS fecha_fin TIMESTAMP WITH TIME ZONE;
ALTER TABLE camiones_nae ADD COLUMN IF NOT EXISTS tiene_reporte_ap BOOLEAN DEFAULT FALSE;
ALTER TABLE camiones_nae ADD COLUMN IF NOT EXISTS monto_total_esperado NUMERIC DEFAULT 0;
ALTER TABLE camiones_nae ADD COLUMN IF NOT EXISTS modo_auditoria VARCHAR(20) DEFAULT 'TOTAL';
ALTER TABLE camiones_nae ADD COLUMN IF NOT EXISTS meta_monto NUMERIC DEFAULT 0;
ALTER TABLE camiones_nae ADD COLUMN IF NOT EXISTS meta_unidades NUMERIC DEFAULT 0;
ALTER TABLE camiones_nae ADD COLUMN IF NOT EXISTS meta_porcentaje NUMERIC DEFAULT 0;
ALTER TABLE camiones_nae ADD COLUMN IF NOT EXISTS umbral_unidades NUMERIC DEFAULT 0;
ALTER TABLE camiones_nae ADD COLUMN IF NOT EXISTS umbral_monto NUMERIC DEFAULT 0;
ALTER TABLE camiones_nae ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE camiones_nae ALTER COLUMN estado SET DEFAULT 'PENDIENTE';
ALTER TABLE camiones_nae DROP CONSTRAINT IF EXISTS camiones_nae_estado_check;
ALTER TABLE camiones_nae ADD CONSTRAINT camiones_nae_estado_check CHECK (estado IN ('PENDIENTE', 'EN_PROCESO', 'FINALIZADO', 'CERRADO'));

-- Índices de optimización para camiones_nae
CREATE INDEX IF NOT EXISTS idx_camiones_nae_estado ON camiones_nae(estado);
CREATE INDEX IF NOT EXISTS idx_camiones_nae_numero_nae ON camiones_nae(numero_nae);

-- =============================================================================
-- 3. TABLA: auditoria_items
-- Detalle de mercadería por camión / NAE
-- =============================================================================
CREATE TABLE IF NOT EXISTS auditoria_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nae_id UUID NOT NULL REFERENCES camiones_nae(id) ON DELETE CASCADE,
    upc VARCHAR(50) NOT NULL,
    sku VARCHAR(50) NOT NULL,
    descripcion TEXT NOT NULL,
    depto_codigo VARCHAR(20),
    depto_nombre VARCHAR(100),
    bultos_esperados NUMERIC DEFAULT 0,
    unidades_esperadas NUMERIC DEFAULT 0,
    stock_disponible NUMERIC DEFAULT 0,
    es_agotado_transito BOOLEAN DEFAULT FALSE,
    bultos_escaneados NUMERIC DEFAULT 0,
    unidades_escaneadas NUMERIC DEFAULT 0,
    es_sobrante_no_facturado BOOLEAN DEFAULT FALSE,
    caja_separada_transito BOOLEAN DEFAULT FALSE,
    cantidad_danada NUMERIC DEFAULT 0,
    observacion_dano TEXT DEFAULT '',
    foto_dano_url TEXT DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_auditoria_items_nae_upc UNIQUE (nae_id, upc)
);

-- Asegurar columnas si auditoria_items ya existía
ALTER TABLE auditoria_items ADD COLUMN IF NOT EXISTS cantidad_danada NUMERIC DEFAULT 0;
ALTER TABLE auditoria_items ADD COLUMN IF NOT EXISTS observacion_dano TEXT DEFAULT '';
ALTER TABLE auditoria_items ADD COLUMN IF NOT EXISTS foto_dano_url TEXT DEFAULT '';

-- Índices de optimización para auditoria_items
CREATE INDEX IF NOT EXISTS idx_auditoria_items_nae_id ON auditoria_items(nae_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_items_upc ON auditoria_items(upc);
CREATE INDEX IF NOT EXISTS idx_auditoria_items_nae_upc ON auditoria_items(nae_id, upc);

-- =============================================================================
-- =============================================================================
-- 4. TABLA: auditoria_logs
-- Histórico atómico auditale de cada escaneo ejecutado
-- =============================================================================
CREATE TABLE IF NOT EXISTS auditoria_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nae_id UUID NOT NULL REFERENCES camiones_nae(id) ON DELETE CASCADE,
    upc VARCHAR(50) NOT NULL,
    colaborador_nombre VARCHAR(100) NOT NULL,
    modo_conteo VARCHAR(20) NOT NULL CHECK (modo_conteo IN ('BULTOS', 'UNIDADES')),
    cantidad NUMERIC NOT NULL CHECK (cantidad <> 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Asegurar que el constraint permita valores negativos para correcciones/restas
ALTER TABLE auditoria_logs DROP CONSTRAINT IF EXISTS auditoria_logs_cantidad_check;
ALTER TABLE auditoria_logs ADD CONSTRAINT auditoria_logs_cantidad_check CHECK (cantidad <> 0);

-- Índice para consultas de auditoría e historial por camión y producto
CREATE INDEX IF NOT EXISTS idx_auditoria_logs_nae_id ON auditoria_logs(nae_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_logs_created_at ON auditoria_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_logs_nae_upc ON auditoria_logs(nae_id, upc);

-- Habilitar RLS y Políticas de acceso abierto para auditoria_logs
ALTER TABLE auditoria_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura publica auditoria_logs" ON auditoria_logs;
CREATE POLICY "Permitir lectura publica auditoria_logs" ON auditoria_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir insercion publica auditoria_logs" ON auditoria_logs;
CREATE POLICY "Permitir insercion publica auditoria_logs" ON auditoria_logs FOR INSERT WITH CHECK (true);

GRANT ALL ON TABLE auditoria_logs TO anon, authenticated, service_role;
GRANT ALL ON TABLE camiones_nae TO anon, authenticated, service_role;
GRANT ALL ON TABLE auditoria_items TO anon, authenticated, service_role;

-- =============================================================================
-- 5. FUNCIÓN ALMACENADA RPC: registrar_escaneo
-- Lógica atómica de registro de conteo concurrente con bloqueo de fila FOR UPDATE
-- =============================================================================
CREATE OR REPLACE FUNCTION registrar_escaneo(
    p_nae_id UUID,
    p_upc VARCHAR(50),
    p_modo VARCHAR(20),
    p_cantidad NUMERIC,
    p_colaborador VARCHAR(100),
    p_caja_separada BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item auditoria_items%ROWTYPE;
    v_producto maestro_productos%ROWTYPE;
    v_modo_upper VARCHAR(20);
    v_item_id UUID;
    v_nombre_colaborador_log VARCHAR(150);
BEGIN
    -- Normalizar modo de conteo
    v_modo_upper := UPPER(TRIM(p_modo));

    -- Validar parámetros de entrada
    IF v_modo_upper NOT IN ('BULTOS', 'UNIDADES') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'MODO_INVALIDO',
            'message', 'El modo de conteo debe ser BULTOS o UNIDADES.'
        );
    END IF;

    IF p_cantidad IS NULL OR p_cantidad = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'CANTIDAD_INVALIDA',
            'message', 'La cantidad a registrar debe ser diferente de cero.'
        );
    END IF;

    -- Intentar obtener la fila existente en auditoria_items aplicando bloqueo para concurrencia (FOR UPDATE)
    SELECT * INTO v_item
    FROM auditoria_items
    WHERE nae_id = p_nae_id AND upc = p_upc
    FOR UPDATE;

    IF FOUND THEN
        -- CASO 1: El producto ya está en la auditoría del camión -> Actualizar contadores con GREATEST(0, ...)
        UPDATE auditoria_items
        SET 
            bultos_escaneados = CASE 
                WHEN v_modo_upper = 'BULTOS' THEN GREATEST(0, bultos_escaneados + p_cantidad)
                ELSE bultos_escaneados 
            END,
            unidades_escaneadas = CASE 
                WHEN v_modo_upper = 'UNIDADES' THEN GREATEST(0, unidades_escaneadas + p_cantidad)
                ELSE unidades_escaneadas 
            END,
            caja_separada_transito = CASE
                WHEN p_caja_separada = TRUE THEN TRUE
                ELSE caja_separada_transito
            END,
            ultimo_colaborador = p_colaborador,
            updated_at = NOW()
        WHERE id = v_item.id
        RETURNING * INTO v_item;

    ELSE
        -- CASO 2: El producto NO está en auditoria_items -> Buscar en maestro_productos
        SELECT * INTO v_producto
        FROM maestro_productos
        WHERE upc = p_upc;

        IF FOUND THEN
            -- Insertar como producto sobrante no facturado
            INSERT INTO auditoria_items (
                nae_id,
                upc,
                sku,
                descripcion,
                depto_codigo,
                depto_nombre,
                bultos_esperados,
                unidades_esperadas,
                stock_disponible,
                es_agotado_transito,
                bultos_escaneados,
                unidades_escaneadas,
                es_sobrante_no_facturado,
                caja_separada_transito,
                ultimo_colaborador,
                updated_at
            ) VALUES (
                p_nae_id,
                p_upc,
                v_producto.sku,
                v_producto.descripcion,
                v_producto.depto_codigo,
                v_producto.depto_nombre,
                0, -- bultos_esperados
                0, -- unidades_esperadas
                0, -- stock_disponible
                FALSE, -- es_agotado_transito
                CASE WHEN v_modo_upper = 'BULTOS' THEN GREATEST(0, p_cantidad) ELSE 0 END,
                CASE WHEN v_modo_upper = 'UNIDADES' THEN GREATEST(0, p_cantidad) ELSE 0 END,
                TRUE, -- es_sobrante_no_facturado,
                p_caja_separada,
                p_colaborador,
                NOW()
            )
            RETURNING * INTO v_item;
        ELSE
            -- CASO 3: Tampoco existe en maestro_productos -> Insertar como producto desconocido fuera de catálogo
            INSERT INTO auditoria_items (
                nae_id,
                upc,
                sku,
                descripcion,
                depto_codigo,
                depto_nombre,
                bultos_esperados,
                unidades_esperadas,
                stock_disponible,
                es_agotado_transito,
                bultos_escaneados,
                unidades_escaneadas,
                es_sobrante_no_facturado,
                caja_separada_transito,
                ultimo_colaborador,
                updated_at
            ) VALUES (
                p_nae_id,
                p_upc,
                p_upc,
                '⚠️ PRODUCTO NO ENCONTRADO - BUSCAR DATOS EN SIM',
                '99',
                'DESCONOCIDO',
                0,
                0,
                0,
                FALSE,
                CASE WHEN v_modo_upper = 'BULTOS' THEN GREATEST(0, p_cantidad) ELSE 0 END,
                CASE WHEN v_modo_upper = 'UNIDADES' THEN GREATEST(0, p_cantidad) ELSE 0 END,
                TRUE,
                p_caja_separada,
                p_colaborador,
                NOW()
            )
            RETURNING * INTO v_item;
        END IF;
    END IF;

    -- Formatear nombre de colaborador para log de auditoría
    IF p_caja_separada THEN
        v_nombre_colaborador_log := p_colaborador || ' (Separó 1 caja para góndola)';
    ELSE
        v_nombre_colaborador_log := p_colaborador;
    END IF;

    -- Registrar log de auditoría atómico
    INSERT INTO auditoria_logs (
        nae_id,
        upc,
        colaborador_nombre,
        modo_conteo,
        cantidad
    ) VALUES (
        p_nae_id,
        p_upc,
        v_nombre_colaborador_log,
        v_modo_upper,
        p_cantidad
    );

    -- Retornar resultado exitoso con el registro actualizado de auditoria_items
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Escaneo registrado con éxito.',
        'data', to_jsonb(v_item)
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'ERROR_INTERNO',
            'message', SQLERRM
        );
END;
$$;

-- Permisos de ejecución de la RPC
GRANT EXECUTE ON FUNCTION registrar_escaneo(UUID, VARCHAR, VARCHAR, NUMERIC, VARCHAR, BOOLEAN) TO anon, authenticated, service_role;

-- =============================================================================
-- 6. PUBLICACIÓN DE REALTIME SUPABASE
-- Publicar las tablas camiones_nae y auditoria_items en supabase_realtime
-- =============================================================================
DO $$
BEGIN
    -- Asegurar que exista la publicación supabase_realtime
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    -- Agregar camiones_nae si no está en la publicación
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_rel pr
        JOIN pg_publication p ON p.oid = pr.prpubid
        JOIN pg_class c ON c.oid = pr.prrelid
        WHERE p.pubname = 'supabase_realtime' AND c.relname = 'camiones_nae'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE camiones_nae;
    END IF;

    -- Agregar auditoria_items si no está en la publicación
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_rel pr
        JOIN pg_publication p ON p.oid = pr.prpubid
        JOIN pg_class c ON c.oid = pr.prrelid
        WHERE p.pubname = 'supabase_realtime' AND c.relname = 'auditoria_items'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE auditoria_items;
    END IF;
END $$;

-- Permisos generales para roles de Supabase (anon, authenticated, service_role)
GRANT ALL ON TABLE maestro_productos TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE camiones_nae TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE auditoria_items TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE auditoria_logs TO postgres, anon, authenticated, service_role;

-- Configuración RLS opcional (Permitir lectura/escritura pública si no hay auth habilitado aún)
ALTER TABLE maestro_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE camiones_nae ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acceso total maestro_productos" ON maestro_productos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total camiones_nae" ON camiones_nae FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total auditoria_items" ON auditoria_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total auditoria_logs" ON auditoria_logs FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- 8. FUNCIONES RPC DE LIMPIEZA Y MANTENIMIENTO
-- =============================================================================

-- Función RPC: vaciar_maestro_productos
CREATE OR REPLACE FUNCTION vaciar_maestro_productos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    TRUNCATE TABLE maestro_productos;
END;
$$;

GRANT EXECUTE ON FUNCTION vaciar_maestro_productos() TO anon, authenticated, service_role;

-- Función RPC: eliminar_camion_nae
CREATE OR REPLACE FUNCTION eliminar_camion_nae(p_nae_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM camiones_nae WHERE id = p_nae_id;
END;
$$;

GRANT EXECUTE ON FUNCTION eliminar_camion_nae(UUID) TO anon, authenticated, service_role;

-- Función RPC: purgar_camiones_antiguos
-- Elimina en cascada camiones NAE con más de N días de antigüedad
CREATE OR REPLACE FUNCTION purgar_camiones_antiguos(p_dias INTEGER DEFAULT 7)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_eliminados_count INTEGER := 0;
BEGIN
    WITH deleted AS (
        DELETE FROM camiones_nae
        WHERE created_at < NOW() - (p_dias || ' days')::INTERVAL
           OR (fecha_fin_auditoria IS NOT NULL AND fecha_fin_auditoria < NOW() - (p_dias || ' days')::INTERVAL)
        RETURNING id
    )
    SELECT COUNT(*) INTO v_eliminados_count FROM deleted;

    RETURN jsonb_build_object(
        'success', true,
        'camiones_eliminados', v_eliminados_count,
        'message', format('Se purgaron %s camiones con más de %s días de antigüedad.', v_eliminados_count, p_dias)
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'ERROR_PURGA',
            'message', SQLERRM
        );
END;
$$;

GRANT EXECUTE ON FUNCTION purgar_camiones_antiguos(INTEGER) TO anon, authenticated, service_role;

-- ==========================================
-- TABLA DE COLABORADORES ACTIVOS Y DISPOSITIVOS
-- ==========================================
CREATE TABLE IF NOT EXISTS colaboradores_activos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT UNIQUE NOT NULL,
    avatar TEXT,
    device_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Políticas RLS para colaboradores_activos
ALTER TABLE colaboradores_activos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura publica colaboradores_activos"
    ON colaboradores_activos FOR SELECT
    USING (true);

CREATE POLICY "Permitir insercion publica colaboradores_activos"
    ON colaboradores_activos FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Permitir actualizacion publica colaboradores_activos"
    ON colaboradores_activos FOR UPDATE
    USING (true);

GRANT ALL ON TABLE colaboradores_activos TO anon, authenticated, service_role;

-- =============================================================================
-- 9. TABLAS DE AUTENTICACIÓN NATIVA, CONFIGURACIÓN Y SUPERADMIN
-- =============================================================================

-- Tabla app_settings (Clave Maestra SuperAdmin y configuraciones globales)
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed de Clave Maestra inicial ("Jujuy1031")
INSERT INTO app_settings (key, value, description)
VALUES ('superadmin_master_key', 'Jujuy1031', 'Clave Maestra de Acceso SuperAdmin AudiMAS')
ON CONFLICT (key) DO NOTHING;

-- Tabla tiendas (Gestión dinámica de sucursales)
CREATE TABLE IF NOT EXISTS tiendas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(50) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    activa BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed inicial de Tiendas
INSERT INTO tiendas (codigo, nombre, activa) VALUES
('1031', '1031 - Tienda Jujuy', TRUE)
ON CONFLICT (codigo) DO NOTHING;

-- Tabla sectores (Gestión dinámica de sectores/departamentos)
CREATE TABLE IF NOT EXISTS sectores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(150) NOT NULL UNIQUE,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed inicial de Sectores
INSERT INTO sectores (nombre, activo) VALUES
('Operaciones Back', TRUE),
('Perecederos', TRUE),
('Piso de Venta', TRUE),
('Calidad', TRUE),
('Gerencia', TRUE)
ON CONFLICT (nombre) DO NOTHING;

-- Tabla profiles (Perfiles extendidos de colaboradores)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    nombre_apellido TEXT NOT NULL,
    telefono TEXT,
    tienda_id TEXT,
    tienda_codigo TEXT,
    tienda_nombre TEXT,
    sector_id TEXT,
    sector_nombre TEXT,
    estado VARCHAR(30) DEFAULT 'pendiente_aprobacion' CHECK (estado IN ('pendiente_aprobacion', 'activo', 'suspendido')),
    origen VARCHAR(20) DEFAULT 'Nativo',
    requiere_onboarding BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS origen VARCHAR(20) DEFAULT 'Nativo';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telefono TEXT;

-- Habilitar RLS y políticas
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE sectores ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acceso total app_settings" ON app_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total tiendas" ON tiendas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total sectores" ON sectores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total profiles" ON profiles FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON TABLE app_settings TO anon, authenticated, service_role;
GRANT ALL ON TABLE tiendas TO anon, authenticated, service_role;
GRANT ALL ON TABLE sectores TO anon, authenticated, service_role;
GRANT ALL ON TABLE profiles TO anon, authenticated, service_role;


