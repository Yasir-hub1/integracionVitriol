const { Pool } = require('pg');
require('dotenv').config();

async function setupDatabase() {
    const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'rip_jobs_db',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    });

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS rip_jobs (
                id SERIAL PRIMARY KEY,
                job_hash VARCHAR(64) UNIQUE NOT NULL,
                table_html TEXT NOT NULL,
                table_html_length INTEGER,
                file_path TEXT,
                file_size VARCHAR(20),
                file_type VARCHAR(100),
                printer_name VARCHAR(200),
                port VARCHAR(100),
                sender VARCHAR(100),
                job_type VARCHAR(100),
                after_output VARCHAR(100),
                dimensions VARCHAR(50),
                resolution VARCHAR(50),
                gray_icc_profile VARCHAR(200),
                rgb_icc_profile VARCHAR(200),
                cmyk_icc_profile VARCHAR(200),
                output_icc_profile VARCHAR(200),
                color_mode VARCHAR(100),
                dither_type VARCHAR(100),
                rendering_mode VARCHAR(100),
                number_of_copies INTEGER,
                number_of_pages INTEGER,
                rip_start_datetime TIMESTAMP,
                rip_end_datetime TIMESTAMP,
                rip_duration VARCHAR(50),
                job_prepare_time VARCHAR(50),
                output_start_datetime TIMESTAMP,
                output_end_datetime TIMESTAMP,
                output_duration VARCHAR(50),
                job_status VARCHAR(50),
                job_info TEXT,
                table_number INTEGER,
                unmapped_fields JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('✅ Tabla rip_jobs creada exitosamente');
        await pool.end();
    } catch (error) {
        console.error('❌ Error:', error);
        await pool.end();
    }
}

setupDatabase();