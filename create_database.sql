-- Crear base de datos
CREATE DATABASE rip_jobs_db;

-- Conectarse a la base de datos
\c rip_jobs_db;

-- Crear tabla para trabajos RIP/Salida
CREATE TABLE rip_jobs (
    id SERIAL PRIMARY KEY,
    
    -- Identificador único para evitar duplicados
    job_hash VARCHAR(64) UNIQUE NOT NULL,
    
    -- HTML COMPLETO DE LA TABLA (NUEVO)
    table_html TEXT NOT NULL,
    table_html_length INTEGER,
    
    -- Información del archivo
    file_path TEXT,
    file_size VARCHAR(20),
    file_type VARCHAR(100),
    
    -- Información de impresión
    printer_name VARCHAR(200),
    port VARCHAR(100),
    sender VARCHAR(100),
    job_type VARCHAR(100),
    after_output VARCHAR(100),
    
    -- Dimensiones y resolución
    dimensions VARCHAR(50),
    resolution VARCHAR(50),
    
    -- Perfiles de color
    gray_icc_profile VARCHAR(200),
    rgb_icc_profile VARCHAR(200),
    cmyk_icc_profile VARCHAR(200),
    output_icc_profile VARCHAR(200),
    
    -- Configuración de color
    color_mode VARCHAR(100),
    dither_type VARCHAR(100),
    rendering_mode VARCHAR(100),
    
    -- Información del trabajo
    number_of_copies INTEGER,
    number_of_pages INTEGER,
    
    -- Tiempos RIP
    rip_start_datetime TIMESTAMP,
    rip_end_datetime TIMESTAMP,
    rip_duration VARCHAR(50),
    job_prepare_time VARCHAR(50),
    
    -- Tiempos de SALIDA (nuevos campos)
    output_start_datetime TIMESTAMP,
    output_end_datetime TIMESTAMP,
    output_duration VARCHAR(50),
    
    -- Estado y información adicional
    job_status VARCHAR(50),
    job_info TEXT,
    
    -- Número de tabla para referencia
    table_number INTEGER,
    
    -- Campos no mapeados (JSON para flexibilidad)
    unmapped_fields JSONB,
    
    -- Metadatos
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para mejor rendimiento
CREATE INDEX idx_rip_jobs_job_hash ON rip_jobs(job_hash);
CREATE INDEX idx_rip_jobs_printer ON rip_jobs(printer_name);
CREATE INDEX idx_rip_jobs_start_time ON rip_jobs(rip_start_datetime);
CREATE INDEX idx_rip_jobs_output_start ON rip_jobs(output_start_datetime);
CREATE INDEX idx_rip_jobs_status ON rip_jobs(job_status);
CREATE INDEX idx_rip_jobs_created_at ON rip_jobs(created_at);
CREATE INDEX idx_rip_jobs_unmapped ON rip_jobs USING gin(unmapped_fields);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$ language 'plpgsql';

-- Trigger para actualizar updated_at
CREATE TRIGGER update_rip_jobs_updated_at 
    BEFORE UPDATE ON rip_jobs 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();