const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3001;

// Configuración de PostgreSQL
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Verificar conexión a la base de datos
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Error conectando a PostgreSQL:', err);
    } else {
        console.log('✅ Conectado a PostgreSQL');
        release();
    }
});

// 📨 ENDPOINT PRINCIPAL - PROCESAR HTML Y GUARDAR EN DB
app.post('/api/process-file', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { filename, content, size, modified } = req.body;
        
        console.log(`📄 Procesando archivo: ${filename}`);
        console.log(`📏 Tamaño del HTML: ${content.length} caracteres`);
        
        // Mostrar muestra del HTML para debug
        console.log('👀 Muestra del HTML:');
        console.log('--- INICIO HTML ---');
        console.log(content.substring(0, 1000));
        console.log('--- FIN MUESTRA ---');
        
        // 🔍 EXTRAER DATOS DE LAS TABLAS
        const ripJobs = extractRipJobsFromHTML(content);
        
        if (ripJobs.length === 0) {
            console.log('⚠️ No se encontraron trabajos RIP en el HTML');
            return res.json({
                success: true,
                message: 'No se encontraron trabajos RIP para procesar',
                jobsProcessed: 0
            });
        }
        
        console.log(`🔍 Encontrados ${ripJobs.length} trabajos RIP`);
        
        await client.query('BEGIN');
        
        let newJobs = 0;
        let duplicateJobs = 0;
        const processedJobs = [];
        
        // 💾 GUARDAR CADA TRABAJO EN LA BASE DE DATOS
        for (const job of ripJobs) {
            try {
                // Crear hash único para evitar duplicados
                const jobHash = createJobHash(job);
                job.job_hash = jobHash;
                
                // Separar campos mapeados de no mapeados
                const unmappedFields = {};
                const mappedJob = {};
                
                for (const [key, value] of Object.entries(job)) {
                    if (key.startsWith('unmapped_')) {
                        unmappedFields[key.replace('unmapped_', '')] = value;
                    } else {
                        mappedJob[key] = value;
                    }
                }
                
                // Verificar si ya existe
                const existingJob = await client.query(
                    'SELECT id FROM rip_jobs WHERE job_hash = $1',
                    [jobHash]
                );
                
                if (existingJob.rows.length > 0) {
                    console.log(`⚠️ Trabajo duplicado encontrado: ${jobHash.substring(0, 8)}...`);
                    duplicateJobs++;
                    continue;
                }
                
                // Insertar nuevo trabajo
                const insertQuery = `
                    INSERT INTO rip_jobs (
                        job_hash, table_html, table_html_length,
                        file_path, file_size, file_type, printer_name, port,
                        sender, job_type, after_output, dimensions, resolution,
                        gray_icc_profile, rgb_icc_profile, cmyk_icc_profile, output_icc_profile,
                        color_mode, dither_type, rendering_mode, number_of_copies, number_of_pages,
                        rip_start_datetime, rip_end_datetime, rip_duration, job_prepare_time,
                        output_start_datetime, output_end_datetime, output_duration,
                        job_status, job_info, table_number, unmapped_fields
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                        $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33
                    ) RETURNING id
                `;
                
               // En la función donde insertas los datos, cambia esta línea:
                const values = [
                    mappedJob.job_hash,
                    mappedJob.table_html,
                    mappedJob.table_html_length,
                    mappedJob.file_path,
                    mappedJob.file_size,
                    mappedJob.file_type,
                    mappedJob.printer_name,
                    mappedJob.port,
                    mappedJob.sender,
                    mappedJob.job_type,
                    mappedJob.after_output,
                    mappedJob.dimensions,
                    mappedJob.resolution,
                    mappedJob.gray_icc_profile,
                    mappedJob.rgb_icc_profile,
                    mappedJob.cmyk_icc_profile,
                    mappedJob.output_icc_profile,
                    mappedJob.color_mode,
                    mappedJob.dither_type,
                    mappedJob.rendering_mode,
                    mappedJob.number_of_copies,
                    mappedJob.number_of_pages,
                    mappedJob.rip_start_datetime,
                    mappedJob.rip_end_datetime,
                    mappedJob.rip_duration,
                    mappedJob.job_prepare_time,
                    mappedJob.output_start_datetime,
                    mappedJob.output_end_datetime,
                    mappedJob.output_duration,
                    mappedJob.job_status,
                    mappedJob.job_info,
                    mappedJob.table_number,
                    // CORREGIDO: Mejor manejo del JSON
                    Object.keys(unmappedFields).length > 0 ? JSON.stringify(unmappedFields) : null
                ];
                
                const result = await client.query(insertQuery, values);
                job.id = result.rows[0].id;
                processedJobs.push(job);
                newJobs++;
                
                console.log(`✅ Trabajo guardado con ID: ${job.id}`);
                
            } catch (error) {
                console.error(`❌ Error guardando trabajo:`, error);
            }
        }
        
        await client.query('COMMIT');
        
        console.log(`🎉 Procesamiento completado: ${newJobs} nuevos, ${duplicateJobs} duplicados`);
        
        res.json({
            success: true,
            message: 'Trabajos RIP procesados exitosamente',
            totalFound: ripJobs.length,
            newJobs,
            duplicateJobs,
            processedJobs
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error procesando archivo:', error);
        res.status(500).json({
            success: false,
            message: 'Error procesando archivo',
            error: error.message
        });
    } finally {
        client.release();
    }
});

// 📋 ENDPOINT PARA VER CONTENIDO DETALLADO DE UN TRABAJO
// 📋 ENDPOINT PARA VER CONTENIDO DETALLADO DE UN TRABAJO - CORREGIDO
app.get('/api/rip-jobs/:id/content', async (req, res) => {
    try {
        const jobId = req.params.id;
        const result = await pool.query('SELECT * FROM rip_jobs WHERE id = $1', [jobId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Trabajo no encontrado' });
        }
        
        const job = result.rows[0];
        
        // FUNCIÓN PARA PARSEAR UNMAPPED_FIELDS SAFELY
        const parseUnmappedFields = (unmappedData) => {
            if (!unmappedData) return {};
            
            // Si ya es un objeto, devolverlo directamente
            if (typeof unmappedData === 'object' && unmappedData !== null) {
                return unmappedData;
            }
            
            // Si es una cadena, intentar parsearlo
            if (typeof unmappedData === 'string') {
                try {
                    return JSON.parse(unmappedData);
                } catch (e) {
                    console.error('Error parsing unmapped_fields:', e);
                    return {};
                }
            }
            
            return {};
        };
        
        // Estructurar la respuesta para el frontend
        const response = {
            id: job.id,
            table_number: job.table_number,
            created_at: job.created_at,
            
            // Campos principales extraídos
            extracted_fields: {
                file_info: {
                    file_path: job.file_path || null,
                    file_size: job.file_size || null,
                    file_type: job.file_type || null
                },
                printer_info: {
                    printer_name: job.printer_name || null,
                    port: job.port || null,
                    sender: job.sender || null,
                    job_type: job.job_type || null
                },
                timing: {
                    rip_start_datetime: job.rip_start_datetime || null,
                    rip_end_datetime: job.rip_end_datetime || null,
                    rip_duration: job.rip_duration || null,
                    output_start_datetime: job.output_start_datetime || null,
                    output_end_datetime: job.output_end_datetime || null,
                    output_duration: job.output_duration || null
                },
                technical: {
                    dimensions: job.dimensions || null,
                    resolution: job.resolution || null,
                    color_mode: job.color_mode || null,
                    number_of_copies: job.number_of_copies || null,
                    number_of_pages: job.number_of_pages || null
                },
                status: {
                    job_status: job.job_status || 'unknown',
                    job_info: job.job_info || null
                }
            },
            
            // Campos no mapeados - CORREGIDO
            unmapped_fields: parseUnmappedFields(job.unmapped_fields),
            
            // HTML información
            html_info: {
                table_html_length: job.table_html_length || 0,
                table_html_preview: job.table_html ? job.table_html.substring(0, 500) + '...' : 'No disponible',
                view_html_url: `/api/rip-jobs/${job.id}/table-html`,
                download_url: `/api/rip-jobs/${job.id}/download-html`
            }
        };
        
        res.json(response);
    } catch (error) {
        console.error('Error en endpoint content:', error);
        res.status(500).json({ error: error.message });
    }
});

// 📊 ENDPOINT PARA VER TODOS LOS CAMPOS - CORREGIDO
app.get('/api/rip-jobs/all-content', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        
        const printer = req.query.printer;
        const status = req.query.status;
        const fromDate = req.query.from_date;
        const toDate = req.query.to_date;
        const workStartDate = req.query.work_start_date;
        const workEndDate = req.query.work_end_date;
        
        let whereConditions = [];
        let queryParams = [];
        let paramCount = 0;
        
        console.log('📊 Filtros recibidos:', {
            printer, status, fromDate, toDate, workStartDate, workEndDate
        });
        
        // Filtros opcionales
        if (printer) {
            paramCount++;
            whereConditions.push(`printer_name ILIKE $${paramCount}`);
            queryParams.push(`%${printer}%`);
        }
        
        if (status) {
            paramCount++;
            whereConditions.push(`job_status = $${paramCount}`);
            queryParams.push(status);
        }
        
        // Filtros de fecha de creación en sistema
        if (fromDate) {
            paramCount++;
            whereConditions.push(`created_at >= $${paramCount}`);
            queryParams.push(fromDate + ' 00:00:00');
        }
        
        if (toDate) {
            paramCount++;
            whereConditions.push(`created_at <= $${paramCount}`);
            queryParams.push(toDate + ' 23:59:59');
        }
        
        // FILTROS DE FECHA DE TRABAJO - CORREGIDO
        if (workStartDate) {
            paramCount++;
            whereConditions.push(`(
                (rip_start_datetime >= $${paramCount}) OR 
                (output_start_datetime >= $${paramCount} AND rip_start_datetime IS NULL)
            )`);
            queryParams.push(workStartDate + ' 00:00:00');
        }
        
        if (workEndDate) {
            paramCount++;
            whereConditions.push(`(
                (rip_end_datetime <= $${paramCount}) OR 
                (output_end_datetime <= $${paramCount} AND rip_end_datetime IS NULL) OR
                (rip_start_datetime <= $${paramCount} AND rip_end_datetime IS NULL AND output_end_datetime IS NULL)
            )`);
            queryParams.push(workEndDate + ' 23:59:59');
        }
        
        const whereClause = whereConditions.length > 0 
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';
        
        console.log('📊 Query WHERE:', whereClause);
        console.log('📊 Query Params:', queryParams);
        
        // Consulta principal
        paramCount++;
        queryParams.push(limit);
        paramCount++;
        queryParams.push(offset);
        
        const query = `
            SELECT 
                id, table_number, created_at, job_status,
                file_path, printer_name, dimensions,
                rip_start_datetime, output_start_datetime,
                rip_end_datetime, output_end_datetime,
                table_html_length,
                CASE 
                    WHEN LENGTH(table_html) > 100 
                    THEN SUBSTRING(table_html FROM 1 FOR 100) || '...'
                    ELSE table_html 
                END as table_preview
            FROM rip_jobs 
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${paramCount - 1} OFFSET $${paramCount}
        `;
        
        // Consulta para contar total
        const countQuery = `
            SELECT COUNT(*) as total FROM rip_jobs ${whereClause}
        `;
        
        const [jobsResult, countResult] = await Promise.all([
            pool.query(query, queryParams),
            pool.query(countQuery, queryParams.slice(0, -2)) // Remover limit y offset para count
        ]);
        
        const total = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);
        
        console.log(`📊 Resultados: ${jobsResult.rows.length} trabajos de ${total} total`);
        
        res.json({
            jobs: jobsResult.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo trabajos:', error);
        res.status(500).json({ error: error.message });
    }
});

// 📊 ENDPOINT PARA EXPORTAR A EXCEL - CORREGIDO
app.post('/api/rip-jobs/export-excel', async (req, res) => {
    try {
        const { 
            startDate, 
            endDate, 
            workStartDate, 
            workEndDate, 
            printer, 
            status 
        } = req.body;

        console.log('📊 Exportando con filtros:', req.body);

        // Construir query con filtros CORREGIDOS
        let whereConditions = [];
        let queryParams = [];
        let paramCount = 0;

        // Filtro por fecha de creación en sistema
        if (startDate) {
            paramCount++;
            whereConditions.push(`created_at >= $${paramCount}`);
            queryParams.push(startDate + ' 00:00:00');
        }

        if (endDate) {
            paramCount++;
            whereConditions.push(`created_at <= $${paramCount}`);
            queryParams.push(endDate + ' 23:59:59');
        }

        // FILTROS DE FECHA DE TRABAJO - CORREGIDO
        if (workStartDate) {
            paramCount++;
            whereConditions.push(`(
                (rip_start_datetime >= $${paramCount}) OR 
                (output_start_datetime >= $${paramCount} AND rip_start_datetime IS NULL)
            )`);
            queryParams.push(workStartDate + ' 00:00:00');
        }

        if (workEndDate) {
            paramCount++;
            whereConditions.push(`(
                (rip_end_datetime <= $${paramCount}) OR 
                (output_end_datetime <= $${paramCount} AND rip_end_datetime IS NULL) OR
                (rip_start_datetime <= $${paramCount} AND rip_end_datetime IS NULL AND output_end_datetime IS NULL)
            )`);
            queryParams.push(workEndDate + ' 23:59:59');
        }

        // Filtro por impresora
        if (printer) {
            paramCount++;
            whereConditions.push(`printer_name ILIKE $${paramCount}`);
            queryParams.push(`%${printer}%`);
        }

        // Filtro por estado
        if (status) {
            paramCount++;
            whereConditions.push(`job_status = $${paramCount}`);
            queryParams.push(status);
        }

        const whereClause = whereConditions.length > 0 
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';

        console.log('📊 Export Query WHERE:', whereClause);
        console.log('📊 Export Query Params:', queryParams);

        const query = `
            SELECT 
                id,
                table_number,
                created_at,
                printer_name,
                file_path,
                file_size,
                file_type,
                dimensions,
                resolution,
                color_mode,
                number_of_copies,
                number_of_pages,
                rip_start_datetime,
                rip_end_datetime,
                rip_duration,
                output_start_datetime,
                output_end_datetime,
                output_duration,
                job_status,
                job_info,
                table_html_length,
                port,
                sender,
                job_type
            FROM rip_jobs 
            ${whereClause}
            ORDER BY created_at DESC
        `;

        const result = await pool.query(query, queryParams);
        
        console.log(`📊 Exportando ${result.rows.length} trabajos`);

        // Preparar datos para Excel
        const excelData = result.rows.map(job => ({
            'ID': job.id,
            'Número de Tabla': job.table_number,
            'Fecha Creación Sistema': job.created_at ? new Date(job.created_at).toLocaleString('es-ES') : 'N/A',
            'Impresora': job.printer_name || 'N/A',
            'Archivo': job.file_path ? job.file_path.split('\\').pop() : 'N/A',
            'Tamaño Archivo': job.file_size || 'N/A',
            'Tipo Archivo': job.file_type || 'N/A',
            'Dimensiones': job.dimensions || 'N/A',
            'Resolución': job.resolution || 'N/A',
            'Modo Color': job.color_mode || 'N/A',
            'Copias': job.number_of_copies || 'N/A',
            'Páginas': job.number_of_pages || 'N/A',
            'Inicio RIP': job.rip_start_datetime ? new Date(job.rip_start_datetime).toLocaleString('es-ES') : 'N/A',
            'Fin RIP': job.rip_end_datetime ? new Date(job.rip_end_datetime).toLocaleString('es-ES') : 'N/A',
            'Duración RIP': job.rip_duration || 'N/A',
            'Inicio Salida': job.output_start_datetime ? new Date(job.output_start_datetime).toLocaleString('es-ES') : 'N/A',
            'Fin Salida': job.output_end_datetime ? new Date(job.output_end_datetime).toLocaleString('es-ES') : 'N/A',
            'Duración Salida': job.output_duration || 'N/A',
            'Estado': job.job_status || 'N/A',
            'Información': job.job_info || 'N/A',
            'Tamaño HTML': job.table_html_length || 0,
            'Puerto': job.port || 'N/A',
            'Remitente': job.sender || 'N/A',
            'Tipo Trabajo': job.job_type || 'N/A'
        }));

        // Crear workbook
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(excelData);

        // Configurar anchos de columnas
        const columnWidths = [
            { wch: 6 },   // ID
            { wch: 10 },  // Número de Tabla
            { wch: 20 },  // Fecha Creación Sistema
            { wch: 25 },  // Impresora
            { wch: 30 },  // Archivo
            { wch: 12 },  // Tamaño Archivo
            { wch: 18 },  // Tipo Archivo
            { wch: 15 },  // Dimensiones
            { wch: 15 },  // Resolución
            { wch: 15 },  // Modo Color
            { wch: 8 },   // Copias
            { wch: 8 },   // Páginas
            { wch: 20 },  // Inicio RIP
            { wch: 20 },  // Fin RIP
            { wch: 15 },  // Duración RIP
            { wch: 20 },  // Inicio Salida
            { wch: 20 },  // Fin Salida
            { wch: 15 },  // Duración Salida
            { wch: 12 },  // Estado
            { wch: 30 },  // Información
            { wch: 12 },  // Tamaño HTML
            { wch: 12 },  // Puerto
            { wch: 20 },  // Remitente
            { wch: 20 }   // Tipo Trabajo
        ];

        worksheet['!cols'] = columnWidths;

        // Agregar hoja al workbook
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Trabajos RIP');

        // Crear buffer
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Configurar headers para descarga
        const dateRange = workStartDate && workEndDate 
            ? `_${workStartDate}_a_${workEndDate}` 
            : `_${new Date().toISOString().split('T')[0]}`;
        const filename = `trabajos_rip${dateRange}.xlsx`;
        
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Length', buffer.length);

        res.send(buffer);

    } catch (error) {
        console.error('Error exportando a Excel:', error);
        res.status(500).json({ error: error.message });
    }
});

// 🔍 FUNCIÓN PARA EXTRAER TRABAJOS DEL HTML (TODAS LAS TABLAS)
function extractRipJobsFromHTML(htmlContent) {
    const jobs = [];
    
    console.log('🔍 Analizando HTML completo...');
    console.log('📏 Tamaño HTML:', htmlContent.length, 'caracteres');
    
    // Buscar TODAS las tablas del HTML (COMPLETAS desde <TABLE> hasta </TABLE>)
    const tableRegex = /<TABLE[^>]*>[\s\S]*?<\/TABLE>/gi;
    const tables = htmlContent.match(tableRegex) || [];
    
    console.log(`📊 Encontradas ${tables.length} tablas en el HTML`);
    
    for (let i = 0; i < tables.length; i++) {
        const tableHTML = tables[i];
        console.log(`🔍 Procesando tabla ${i + 1}/${tables.length}`);
        console.log(`📏 Tamaño de tabla ${i + 1}: ${tableHTML.length} caracteres`);
        
        // 💾 GUARDAR HTML COMPLETO DE LA TABLA
        const job = {
            table_html: tableHTML, // ← AQUÍ SE GUARDA TODO EL HTML
            table_html_length: tableHTML.length,
            table_number: i + 1
        };
        
        // Extraer también los campos específicos para análisis
        const extractedFields = extractJobDataFromTable(tableHTML, i + 1);
        
        // Combinar HTML completo con campos extraídos
        Object.assign(job, extractedFields);
        
        if (Object.keys(job).length > 3) { // Al menos tiene HTML + table_number + algún campo más
            console.log(`✅ Tabla ${i + 1}: HTML completo guardado (${tableHTML.length} chars) + ${Object.keys(extractedFields).length} campos extraídos`);
            jobs.push(job);
        } else {
            console.log(`⚠️ Tabla ${i + 1}: Solo HTML guardado, pocos campos extraídos`);
            // Aún así guardamos la tabla porque contiene HTML
            jobs.push(job);
        }
    }
    
    console.log(`🎉 Total trabajos extraídos: ${jobs.length}`);
    return jobs;
}

// 📊 FUNCIÓN PARA EXTRAER DATOS DE UNA TABLA
function extractJobDataFromTable(tableHTML, tableNumber) {
    const normalizedHTML = tableHTML.toUpperCase();
    
    const job = {};
    
    console.log(`📋 Analizando tabla ${tableNumber}...`);
    
    // Mapeo AMPLIADO de nombres de campos (inglés y español)
    const fieldMapping = {
        // Campos en inglés (originales)
        'File:': 'file_path',
        'File Size:': 'file_size',
        'File Type:': 'file_type',
        'Printer:': 'printer_name',
        'Port:': 'port',
        'Sender:': 'sender',
        'Job Type:': 'job_type',
        'After Output:': 'after_output',
        'Dimensions:': 'dimensions',
        'Resolution:': 'resolution',
        'Gray ICC Profile:': 'gray_icc_profile',
        'RGB ICC Profile:': 'rgb_icc_profile',
        'CMYK ICC Profile:': 'cmyk_icc_profile',
        'Output ICC Profile:': 'output_icc_profile',
        'Color Mode:': 'color_mode',
        'Dither Type:': 'dither_type',
        'Rendering Mode:': 'rendering_mode',
        'Number Of Copies:': 'number_of_copies',
        'Number of Pages:': 'number_of_pages',
        'RIP Start Date and Time:': 'rip_start_datetime',
        'RIP End Date and Time:': 'rip_end_datetime',
        'RIP Duration:': 'rip_duration',
        'Job prepare time': 'job_prepare_time',
        'Info:': 'job_info',
        
        // Campos en español (nuevos)
        'Archivo:': 'file_path',
        'Tamaño del archivo:': 'file_size',
        'Tipo de archivo:': 'file_type',
        'Impresora:': 'printer_name',
        'Puerto:': 'port',
        'Remitente:': 'sender',
        'Tipo de trabajo:': 'job_type',
        'Después de la salida:': 'after_output',
        'Dimensiones:': 'dimensions',
        'Resolución:': 'resolution',
        'Perfil ICC gris:': 'gray_icc_profile',
        'Perfil ICC RGB:': 'rgb_icc_profile',
        'Perfil ICC CMYK:': 'cmyk_icc_profile',
        'Perfil ICC de salida:': 'output_icc_profile',
        'Modo de color:': 'color_mode',
        'Tipo de trama:': 'dither_type',
        'Modo de renderizado:': 'rendering_mode',
        'Número de copias:': 'number_of_copies',
        'Número de páginas:': 'number_of_pages',
        'Fecha y hora de inicio de RIP:': 'rip_start_datetime',
        'Fecha y hora de finalización de RIP:': 'rip_end_datetime',
        'Duración del RIP:': 'rip_duration',
        'Tiempo de preparación del trabajo': 'job_prepare_time',
        'Información:': 'job_info',
        
        // Campos específicos de tu HTML
        'Fecha y hora de inicio de la salida:': 'output_start_datetime',
        'Fecha y hora de finalización de la salida:': 'output_end_datetime',
        'Duración de la salida:': 'output_duration',
        'Fecha y hora de inicio de salida:': 'output_start_datetime',
        'Fecha y hora de finalizacion de la salida:': 'output_end_datetime',
        'Fecha y hora de finalizaci�n de la salida:': 'output_end_datetime', // Con caracteres especiales
        'Duraci�n de la salida:': 'output_duration',
        
        // Otros campos posibles
        'Estado:': 'job_status',
        'Observaciones:': 'job_info'
    };
    
    // Extraer filas de la tabla
    const rowRegex = /<TR[^>]*>[\s\S]*?<\/TR>/gi;
const rows = tableHTML.match(rowRegex) || [];

console.log(`📄 Filas encontradas en tabla ${tableNumber}: ${rows.length}`);

let fieldsExtracted = 0;

for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    // Extraer celdas TH y TD - MEJORADO
    const thRegex = /<TH[^>]*>([\s\S]*?)<\/TH>/i;
    const tdRegex = /<TD[^>]*>([\s\S]*?)<\/TD>/i;
    
    const thMatch = row.match(thRegex);
    const tdMatch = row.match(tdRegex);
    
    if (thMatch && tdMatch) {
        let fieldName = cleanText(thMatch[1]);
        let fieldValue = cleanText(tdMatch[1]);
        
        console.log(`  📊 Campo RAW: TH="${thMatch[1]}" TD="${tdMatch[1]}"`);
        console.log(`  📊 Campo LIMPIO: "${fieldName}" = "${fieldValue}"`);
        
            
            console.log(`  📊 Campo encontrado: "${fieldName}" = "${fieldValue}"`);
            
            // Buscar el mapeo correspondiente (exacto primero)
            let dbField = fieldMapping[fieldName];
            
            // Si no encuentra exacto, buscar parcial
            if (!dbField) {
                const fieldNameLower = fieldName.toLowerCase();
                for (const [key, value] of Object.entries(fieldMapping)) {
                    if (fieldNameLower.includes(key.toLowerCase().replace(':', '')) ||
                        key.toLowerCase().replace(':', '').includes(fieldNameLower)) {
                        dbField = value;
                        break;
                    }
                }
            }
            
            if (dbField && fieldValue && fieldValue !== 'N/A' && fieldValue.trim() !== '') {
                // Procesamiento especial para ciertos campos
                if (dbField === 'number_of_copies' || dbField === 'number_of_pages') {
                    job[dbField] = parseInt(fieldValue) || null;
                } else if (dbField.includes('datetime') || dbField === 'rip_start_datetime' || dbField === 'rip_end_datetime') {
                    job[dbField] = parseDateTime(fieldValue);
                } else {
                    job[dbField] = fieldValue;
                }
                
                fieldsExtracted++;
                console.log(`  ✅ Mapeado a: ${dbField}`);
            } else if (fieldValue && fieldValue.trim() !== '') {
                // Guardar campos no mapeados para revisión
                const unmappedField = fieldName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                job[`unmapped_${unmappedField}`] = fieldValue;
                fieldsExtracted++;
                console.log(`  📝 Campo no mapeado guardado como: unmapped_${unmappedField}`);
            }
        }
    }
    
    console.log(`  🎯 Total campos extraídos: ${fieldsExtracted}`);
    
    // Si tiene campos de salida pero no de RIP, copiar los datos
    if (job.output_start_datetime && !job.rip_start_datetime) {
        job.rip_start_datetime = job.output_start_datetime;
    }
    if (job.output_end_datetime && !job.rip_end_datetime) {
        job.rip_end_datetime = job.output_end_datetime;
    }
    if (job.output_duration && !job.rip_duration) {
        job.rip_duration = job.output_duration;
    }
    
    // Determinar estado del trabajo basado en la información disponible
    if (!job.job_status) {
        if (job.job_info) {
            if (job.job_info.toLowerCase().includes('exitosa') || 
                job.job_info.toLowerCase().includes('successfully') ||
                job.job_info.toLowerCase().includes('completado')) {
                job.job_status = 'completed';
            } else if (job.job_info.toLowerCase().includes('error') ||
                      job.job_info.toLowerCase().includes('fallo')) {
                job.job_status = 'error';
            } else {
                job.job_status = 'unknown';
            }
        } else if (job.rip_end_datetime || job.output_end_datetime) {
            job.job_status = 'completed'; // Si tiene fecha de fin, probablemente se completó
        } else {
            job.job_status = 'unknown';
        }
    }
    
    // Agregar número de tabla para referencia
    job.table_number = tableNumber;
    
    return job;
}

// 🧹 FUNCIÓN PARA LIMPIAR TEXTO
function cleanText(text) {
    if (!text) return '';
    
    // Remover etiquetas HTML
    text = text.replace(/<[^>]+>/g, '');
    
    // Decodificar entidades HTML
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    
    // Limpiar espacios y caracteres especiales
    text = text.trim();
    text = text.replace(/\s+/g, ' ');
    text = text.replace(/\u00a0/g, ' '); // Espacios no rompibles
    
    return text;
}

// 📅 FUNCIÓN PARA PARSEAR FECHA Y HORA (FORMATOS MÚLTIPLES)
function parseDateTime(dateTimeStr) {
    if (!dateTimeStr) return null;
    
    try {
        console.log(`🕐 Parseando fecha: "${dateTimeStr}"`);
        
        // Formato 1: "9:26:38 15/06/2022" (inglés)
        let match = dateTimeStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        
        // Formato 2: "10:04:27 03/07/2025" (español)
        if (!match) {
            match = dateTimeStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        }
        
        // Formato 3: Solo fecha "03/07/2025"
        if (!match) {
            match = dateTimeStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (match) {
                const [, day, month, year] = match;
                const date = new Date(year, month - 1, day, 0, 0, 0);
                console.log(`✅ Fecha parseada (solo fecha): ${date.toISOString()}`);
                return date.toISOString();
            }
        }
        
        if (match && match.length >= 6) {
            const [, hours, minutes, seconds, day, month, year] = match;
            const date = new Date(year, month - 1, day, hours, minutes, seconds);
            console.log(`✅ Fecha parseada: ${date.toISOString()}`);
            return date.toISOString();
        }
        
        // Formato alternativo: intentar con Date.parse
        const parsedDate = new Date(dateTimeStr);
        if (!isNaN(parsedDate.getTime())) {
            console.log(`✅ Fecha parseada (Date.parse): ${parsedDate.toISOString()}`);
            return parsedDate.toISOString();
        }
        
        console.log(`⚠️ No se pudo parsear la fecha: ${dateTimeStr}`);
        return null;
    } catch (error) {
        console.error('❌ Error parseando fecha:', dateTimeStr, error);
        return null;
    }
}

// 🔐 FUNCIÓN PARA CREAR HASH ÚNICO
function createJobHash(job) {
    // Crear un hash basado en campos clave que identifiquen únicamente el trabajo
    const uniqueString = [
        job.file_path,
        job.rip_start_datetime || job.output_start_datetime,
        job.rip_end_datetime || job.output_end_datetime,
        job.printer_name,
        job.dimensions,
        job.file_size,
        job.table_number
    ].filter(Boolean).join('|');
    
    console.log(`🔐 Creando hash para: ${uniqueString}`);
    const hash = crypto.createHash('sha256').update(uniqueString).digest('hex');
    console.log(`🔐 Hash generado: ${hash.substring(0, 16)}...`);
    
    return hash;
}

// 📋 OBTENER TODOS LOS TRABAJOS RIP
app.get('/api/rip-jobs', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        
        const printer = req.query.printer;
        const status = req.query.status;
        const fromDate = req.query.from_date;
        const toDate = req.query.to_date;
        
        let whereConditions = [];
        let queryParams = [];
        let paramCount = 0;
        
        // Filtros opcionales
        if (printer) {
            paramCount++;
            whereConditions.push(`printer_name ILIKE $${paramCount}`);
            queryParams.push(`%${printer}%`);
        }
        
        if (status) {
            paramCount++;
            whereConditions.push(`job_status = $${paramCount}`);
            queryParams.push(status);
        }
        
        if (fromDate) {
            paramCount++;
            whereConditions.push(`rip_start_datetime >= $${paramCount}`);
            queryParams.push(fromDate);
        }
        
        if (toDate) {
            paramCount++;
            whereConditions.push(`rip_start_datetime <= $${paramCount}`);
            queryParams.push(toDate);
        }
        
        const whereClause = whereConditions.length > 0 
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';
        
        // Consulta principal
        paramCount++;
        queryParams.push(limit);
        paramCount++;
        queryParams.push(offset);
        
        const query = `
            SELECT * FROM rip_jobs 
            ${whereClause}
            ORDER BY rip_start_datetime DESC, created_at DESC
            LIMIT $${paramCount - 1} OFFSET $${paramCount}
        `;
        
        // Consulta para contar total
        const countQuery = `
            SELECT COUNT(*) as total FROM rip_jobs ${whereClause}
        `;
        
        const [jobsResult, countResult] = await Promise.all([
            pool.query(query, queryParams),
            pool.query(countQuery, queryParams.slice(0, -2)) // Remover limit y offset para count
        ]);
        
        const total = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);
        
        res.json({
            jobs: jobsResult.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo trabajos RIP:', error);
        res.status(500).json({ error: error.message });
    }
});

// 📊 OBTENER ESTADÍSTICAS
app.get('/api/rip-jobs/stats', async (req, res) => {
    try {
        const statsQuery = `
            SELECT 
                COUNT(*) as total_jobs,
                COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as completed_jobs,
                COUNT(CASE WHEN job_status = 'error' THEN 1 END) as error_jobs,
                COUNT(DISTINCT printer_name) as total_printers,
                COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as today_jobs,
                AVG(CASE 
                    WHEN rip_duration ~ '^\\d+' 
                    THEN CAST(regexp_replace(rip_duration, '\\D+', '', 'g') AS INTEGER)
                    ELSE NULL 
                END) as avg_duration_seconds
            FROM rip_jobs
        `;
        
        const printersQuery = `
            SELECT 
                printer_name,
                COUNT(*) as job_count,
                COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as completed_count
            FROM rip_jobs 
            WHERE printer_name IS NOT NULL
            GROUP BY printer_name
            ORDER BY job_count DESC
            LIMIT 10
        `;
        
        const dailyStatsQuery = `
            SELECT 
                DATE(rip_start_datetime) as job_date,
                COUNT(*) as job_count
            FROM rip_jobs 
            WHERE rip_start_datetime >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY DATE(rip_start_datetime)
            ORDER BY job_date DESC
        `;
        
        const [statsResult, printersResult, dailyResult] = await Promise.all([
            pool.query(statsQuery),
            pool.query(printersQuery),
            pool.query(dailyStatsQuery)
        ]);
        
        res.json({
            general: statsResult.rows[0],
            printers: printersResult.rows,
            daily: dailyResult.rows
        });
        
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ error: error.message });
    }
});

// 🔍 OBTENER TRABAJO ESPECÍFICO
app.get('/api/rip-jobs/:id', async (req, res) => {
    try {
        const jobId = req.params.id;
        const result = await pool.query('SELECT * FROM rip_jobs WHERE id = $1', [jobId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Trabajo no encontrado' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📄 ENDPOINT PARA OBTENER HTML COMPLETO DE UNA TABLA
app.get('/api/rip-jobs/:id/table-html', async (req, res) => {
    try {
        const jobId = req.params.id;
        const result = await pool.query(
            'SELECT table_html, table_html_length, table_number FROM rip_jobs WHERE id = $1', 
            [jobId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Trabajo no encontrado' });
        }
        
        const job = result.rows[0];
        
        // Responder con HTML para visualización directa
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Tabla HTML - Trabajo #${jobId}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .info { background: #f0f8ff; padding: 10px; margin-bottom: 20px; border-radius: 5px; }
                    table { border-collapse: collapse; }
                    th, td { border: 1px solid #ccc; padding: 8px; }
                    th { background-color: #0066CC; color: white; }
                </style>
            </head>
            <body>
                <div class="info">
                    <h2>Tabla HTML Completa - Trabajo #${jobId}</h2>
                    <p><strong>Tabla número:</strong> ${job.table_number}</p>
                    <p><strong>Tamaño HTML:</strong> ${job.table_html_length} caracteres</p>
                    <p><a href="/api/rip-jobs/${jobId}/table-html/raw">Ver HTML crudo</a></p>
                </div>
                ${job.table_html}
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📄 ENDPOINT PARA OBTENER HTML CRUDO DE UNA TABLA
app.get('/api/rip-jobs/:id/table-html/raw', async (req, res) => {
    try {
        const jobId = req.params.id;
        const result = await pool.query(
            'SELECT table_html FROM rip_jobs WHERE id = $1', 
            [jobId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Trabajo no encontrado' });
        }
        
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(result.rows[0].table_html);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📄 ENDPOINT PARA OBTENER TODAS LAS TABLAS HTML DE UN ARCHIVO
app.get('/api/rip-jobs/tables/all', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        
        const result = await pool.query(`
            SELECT id, table_number, table_html_length, 
                   SUBSTRING(table_html FROM 1 FOR 200) as table_preview,
                   created_at, job_status
            FROM rip_jobs 
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);
        
        const countResult = await pool.query('SELECT COUNT(*) as total FROM rip_jobs');
        const total = parseInt(countResult.rows[0].total);
        
        res.json({
            tables: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 💾 ENDPOINT PARA DESCARGAR HTML COMPLETO
app.get('/api/rip-jobs/:id/download-html', async (req, res) => {
    try {
        const jobId = req.params.id;
        const result = await pool.query(
            'SELECT table_html, table_number, created_at FROM rip_jobs WHERE id = $1', 
            [jobId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Trabajo no encontrado' });
        }
        
        const job = result.rows[0];
        const filename = `tabla_${jobId}_${job.table_number}_${new Date(job.created_at).toISOString().split('T')[0]}.html`;
        
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(job.table_html);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🗑️ ELIMINAR TRABAJOS ANTIGUOS (opcional)
app.delete('/api/rip-jobs/cleanup', async (req, res) => {
    try {
        const daysOld = parseInt(req.query.days) || 30;
        
        const result = await pool.query(`
            DELETE FROM rip_jobs 
            WHERE created_at < CURRENT_DATE - INTERVAL '${daysOld} days'
        `);
        
        res.json({
            message: `Eliminados ${result.rowCount} trabajos de más de ${daysOld} días`,
            deletedCount: result.rowCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📊 Base de datos: ${process.env.DB_NAME}`);
});