import React, { useState, useEffect } from 'react';
import { 
    FileText, Clock, Database, Printer, CheckCircle, XCircle, 
    RefreshCw, Eye, Download, Code, Calendar, Settings, 
    Monitor, Layers, Zap, Info, ChevronDown, ChevronUp, 
    Search, Filter, ArrowLeft, ArrowRight, Activity, AlertCircle,
    Server, Hash, Play, Square, Pause, FileSpreadsheet, X, RotateCcw
} from 'lucide-react';

const API_URL = 'http://159.223.196.3:3001/api';

const App = () => {
    const [jobs, setJobs] = useState([]);
    const [selectedJob, setSelectedJob] = useState(null);
    const [jobContent, setJobContent] = useState(null);
    const [loading, setLoading] = useState(false);
    const [contentLoading, setContentLoading] = useState(false);
    const [showMobileFilters, setShowMobileFilters] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedSections, setExpandedSections] = useState({
        file_info: true,
        printer_info: true,
        timing: true,
        technical: false,
        status: true,
        html_info: false,
        unmapped: false
    });
    const [filters, setFilters] = useState({
        page: 1,
        limit: 20,
        printer: '',
        status: '',
        startDate: '',
        endDate: '',
        workStartDate: '',
        workEndDate: ''
    });
    const [pagination, setPagination] = useState({});
    const [stats, setStats] = useState({ total: 0, completed: 0, errors: 0, pending: 0 });
    const [exportLoading, setExportLoading] = useState(false);

    useEffect(() => {
        fetchJobs();
    }, [filters]);

    useEffect(() => {
        const filtered = jobs.filter(job => 
            (job.printer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
             job.file_path?.toLowerCase().includes(searchTerm.toLowerCase()) ||
             job.id.toString().includes(searchTerm))
        );
        
        const newStats = {
            total: filtered.length,
            completed: filtered.filter(j => j.job_status === 'completed').length,
            errors: filtered.filter(j => j.job_status === 'error').length,
            pending: filtered.filter(j => j.job_status === 'unknown').length
        };
        setStats(newStats);
    }, [jobs, searchTerm]);

    const fetchJobs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            Object.entries(filters).forEach(([key, value]) => {
                if (value) {
                    // Mapear los nombres de filtros para el backend
                    let paramName = key;
                    if (key === 'startDate') paramName = 'from_date';
                    if (key === 'endDate') paramName = 'to_date';
                    if (key === 'workStartDate') paramName = 'work_start_date';
                    if (key === 'workEndDate') paramName = 'work_end_date';
                    
                    params.append(paramName, value);
                }
            });

            const response = await fetch(`${API_URL}/rip-jobs/all-content?${params}`);
            const data = await response.json();
            setJobs(data.jobs || []);
            setPagination(data.pagination || {});
        } catch (error) {
            console.error('Error fetching jobs:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchJobContent = async (jobId) => {
        setContentLoading(true);
        try {
            const response = await fetch(`${API_URL}/rip-jobs/${jobId}/content`);
            const data = await response.json();
            setJobContent(data);
        } catch (error) {
            console.error('Error fetching job content:', error);
        } finally {
            setContentLoading(false);
        }
    };

    const handleJobSelect = (job) => {
        setSelectedJob(job);
        fetchJobContent(job.id);
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getStatusConfig = (status) => {
        switch (status) {
            case 'completed':
                return {
                    icon: CheckCircle,
                    color: 'text-emerald-600',
                    bg: 'bg-emerald-50',
                    border: 'border-emerald-200',
                    badge: 'bg-emerald-100 text-emerald-800'
                };
            case 'error':
                return {
                    icon: XCircle,
                    color: 'text-red-600',
                    bg: 'bg-red-50',
                    border: 'border-red-200',
                    badge: 'bg-red-100 text-red-800'
                };
            default:
                return {
                    icon: Clock,
                    color: 'text-amber-600',
                    bg: 'bg-amber-50',
                    border: 'border-amber-200',
                    badge: 'bg-amber-100 text-amber-800'
                };
        }
    };

    const toggleSection = (section) => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };

    const filteredJobs = jobs.filter(job => 
        (job.printer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
         job.file_path?.toLowerCase().includes(searchTerm.toLowerCase()) ||
         job.id.toString().includes(searchTerm))
    );

    const exportToExcel = async () => {
        setExportLoading(true);
        try {
            const exportData = {
                startDate: filters.startDate || null,
                endDate: filters.endDate || null,
                workStartDate: filters.workStartDate || null,
                workEndDate: filters.workEndDate || null,
                printer: filters.printer || null,
                status: filters.status || null
            };

            console.log('📊 Exportando con filtros:', exportData);

            const response = await fetch(`${API_URL}/rip-jobs/export-excel`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(exportData)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Crear blob y descargar
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `trabajos_rip_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            console.log('✅ Excel exportado exitosamente');
        } catch (error) {
            console.error('Error exportando a Excel:', error);
            alert('Error al exportar a Excel: ' + error.message);
        } finally {
            setExportLoading(false);
        }
    };

    const clearFilters = () => {
        setFilters({
            page: 1,
            limit: 20,
            printer: '',
            status: '',
            startDate: '',
            endDate: '',
            workStartDate: '',
            workEndDate: ''
        });
        setSearchTerm('');
    };

    const StatCard = ({ title, value, icon: Icon, color, trend }) => (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium text-gray-600">{title}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
                    {trend && (
                        <p className="text-xs text-gray-500 mt-1">{trend}</p>
                    )}
                </div>
                <div className={`p-3 rounded-full ${color}`}>
                    <Icon className="w-6 h-6 text-white" />
                </div>
            </div>
        </div>
    );

    const InfoCard = ({ title, icon: Icon, children, isExpanded, onToggle, className = "" }) => (
        <div className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-200 hover:shadow-md ${className}`}>
            <div 
                className="p-6 cursor-pointer hover:bg-gray-50 transition-colors duration-150"
                onClick={onToggle}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-blue-50 rounded-lg">
                            <Icon className="w-5 h-5 text-blue-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                    </div>
                    <div className="flex items-center space-x-2">
                        <div className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                        </div>
                    </div>
                </div>
            </div>
            <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-96' : 'max-h-0'}`}>
                <div className="px-6 pb-6 border-t border-gray-50">
                    {children}
                </div>
            </div>
        </div>
    );

    const DataField = ({ label, value, icon: Icon, highlight = false }) => (
        <div className={`flex items-start space-x-3 p-4 rounded-lg transition-all duration-150 ${highlight ? 'bg-blue-50 border-l-4 border-blue-400' : 'hover:bg-gray-50'}`}>
            {Icon && (
                <div className="p-1.5 bg-gray-100 rounded-lg flex-shrink-0">
                    <Icon className="w-4 h-4 text-gray-600" />
                </div>
            )}
            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-700 mb-1">{label}</div>
                <div className="text-sm text-gray-900 break-words font-mono bg-gray-50 px-2 py-1 rounded">
                    {value || 'N/A'}
                </div>
            </div>
        </div>
    );

    const LoadingSpinner = () => (
        <div className="flex items-center justify-center p-8">
            <div className="relative">
                <div className="w-12 h-12 border-4 border-blue-200 rounded-full animate-spin"></div>
                <div className="absolute top-0 left-0 w-12 h-12 border-4 border-blue-600 rounded-full animate-spin border-t-transparent"></div>
            </div>
        </div>
    );

    const EmptyState = ({ icon: Icon, title, description }) => (
        <div className="text-center py-12">
            <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Icon className="w-12 h-12 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
            <p className="text-gray-500 max-w-md mx-auto">{description}</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white shadow-sm sticky top-0 z-50 border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-blue-600 rounded-lg">
                                    <Database className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h1 className="text-xl font-bold text-gray-900">RIP Jobs</h1>
                                    <p className="text-sm text-gray-500">Sistema de monitoreo</p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex items-center space-x-4">
                            <div className="hidden sm:flex items-center space-x-2 text-sm text-gray-600">
                                <Activity className="w-4 h-4" />
                                <span>Última actualización: {new Date().toLocaleTimeString()}</span>
                            </div>
                            <button
                                onClick={fetchJobs}
                                disabled={loading}
                                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 space-x-2"
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                <span className="hidden sm:inline">Actualizar</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <StatCard
                        title="Total Trabajos"
                        value={stats.total}
                        icon={Database}
                        color="bg-blue-500"
                        trend="Todos los registros"
                    />
                    <StatCard
                        title="Completados"
                        value={stats.completed}
                        icon={CheckCircle}
                        color="bg-emerald-500"
                        trend={`${stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}% del total`}
                    />
                    <StatCard
                        title="Con Errores"
                        value={stats.errors}
                        icon={XCircle}
                        color="bg-red-500"
                        trend={`${stats.total > 0 ? Math.round((stats.errors / stats.total) * 100) : 0}% del total`}
                    />
                    <StatCard
                        title="Pendientes"
                        value={stats.pending}
                        icon={Clock}
                        color="bg-amber-500"
                        trend={`${stats.total > 0 ? Math.round((stats.pending / stats.total) * 100) : 0}% del total`}
                    />
                </div>

                {/* Filters */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-8">
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                                <Filter className="w-5 h-5 text-gray-600" />
                                <span>Filtros y Búsqueda</span>
                            </h2>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={clearFilters}
                                    className="hidden sm:flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    <span>Limpiar</span>
                                </button>
                                <button
                                    onClick={exportToExcel}
                                    disabled={exportLoading}
                                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                                >
                                    {exportLoading ? (
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <FileSpreadsheet className="w-4 h-4" />
                                    )}
                                    <span className="hidden sm:inline">
                                        {exportLoading ? 'Exportando...' : 'Exportar Excel'}
                                    </span>
                                </button>
                                <button
                                    onClick={() => setShowMobileFilters(!showMobileFilters)}
                                    className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <Filter className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        
                        <div className={`space-y-4 ${showMobileFilters ? 'block' : 'hidden lg:block'}`}>
                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Buscar por ID, impresora o archivo..."
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                                />
                            </div>

                            {/* Filters Grid */}
                            <div className="space-y-6">
                                {/* Basic Filters */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Filtrar por impresora
                                        </label>
                                        <select
                                            value={filters.printer}
                                            onChange={(e) => setFilters(prev => ({ ...prev, printer: e.target.value, page: 1 }))}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                                        >
                                            <option value="">Todas las impresoras</option>
                                            {[...new Set(jobs.map(j => j.printer_name).filter(Boolean))].map(printer => (
                                                <option key={printer} value={printer}>{printer}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Estado
                                        </label>
                                        <select
                                            value={filters.status}
                                            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value, page: 1 }))}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                                        >
                                            <option value="">Todos los estados</option>
                                            <option value="completed">Completados</option>
                                            <option value="error">Con errores</option>
                                            <option value="unknown">Desconocido</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Elementos por página
                                        </label>
                                        <select
                                            value={filters.limit}
                                            onChange={(e) => setFilters(prev => ({ ...prev, limit: parseInt(e.target.value), page: 1 }))}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                                        >
                                            <option value="10">10</option>
                                            <option value="20">20</option>
                                            <option value="50">50</option>
                                            <option value="100">100</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Date Filters */}
                                <div className="border-t border-gray-200 pt-6">
                                    <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                                        <Calendar className="w-4 h-4 text-gray-600" />
                                        <span>Filtros de Fecha</span>
                                    </h3>
                                    
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* Creation Date Range */}
                                        <div className="space-y-4">
                                            <h4 className="text-sm font-medium text-gray-700 flex items-center space-x-2">
                                                <Database className="w-4 h-4" />
                                                <span>Fecha de Creación en Sistema</span>
                                            </h4>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm text-gray-600 mb-2">Desde</label>
                                                    <input
                                                        type="date"
                                                        value={filters.startDate}
                                                        onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value, page: 1 }))}
                                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm text-gray-600 mb-2">Hasta</label>
                                                    <input
                                                        type="date"
                                                        value={filters.endDate}
                                                        onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value, page: 1 }))}
                                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Work Date Range */}
                                        <div className="space-y-4">
                                            <h4 className="text-sm font-medium text-gray-700 flex items-center space-x-2">
                                                <Clock className="w-4 h-4" />
                                                <span>Fecha de Ejecución de Trabajo</span>
                                            </h4>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm text-gray-600 mb-2">Desde</label>
                                                    <input
                                                        type="date"
                                                        value={filters.workStartDate}
                                                        onChange={(e) => setFilters(prev => ({ ...prev, workStartDate: e.target.value, page: 1 }))}
                                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm text-gray-600 mb-2">Hasta</label>
                                                    <input
                                                        type="date"
                                                        value={filters.workEndDate}
                                                        onChange={(e) => setFilters(prev => ({ ...prev, workEndDate: e.target.value, page: 1 }))}
                                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Filter Info */}
                                    <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                                        <p className="text-sm text-blue-700">
                                            <Info className="w-4 h-4 inline mr-1" />
                                            <strong>Nota:</strong> Los filtros de fecha se aplicarán tanto a la vista como a la exportación de Excel.
                                            La fecha de creación se refiere a cuando el trabajo fue procesado por el sistema.
                                            La fecha de ejecución se refiere a cuando se ejecutó el trabajo RIP/impresión.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                    {/* Jobs List */}
                    <div className="xl:col-span-4">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                            <div className="p-6 border-b border-gray-100">
                                <h2 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                                    <Server className="w-5 h-5 text-gray-600" />
                                    <span>Trabajos ({filteredJobs.length})</span>
                                </h2>
                            </div>
                            
                            <div className="max-h-[600px] overflow-y-auto">
                                {loading ? (
                                    <LoadingSpinner />
                                ) : filteredJobs.length === 0 ? (
                                    <EmptyState
                                        icon={Database}
                                        title="No hay trabajos"
                                        description="No se encontraron trabajos que coincidan con los filtros actuales"
                                    />
                                ) : (
                                    <div className="divide-y divide-gray-100">
                                        {filteredJobs.map((job) => {
                                            const statusConfig = getStatusConfig(job.job_status);
                                            const StatusIcon = statusConfig.icon;
                                            
                                            return (
                                                <div
                                                    key={job.id}
                                                    onClick={() => handleJobSelect(job)}
                                                    className={`p-6 cursor-pointer transition-all duration-200 hover:bg-gray-50 ${
                                                        selectedJob?.id === job.id 
                                                            ? 'bg-blue-50 border-r-4 border-blue-600' 
                                                            : ''
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div className="flex items-center space-x-3">
                                                            <div className={`p-2 rounded-lg ${statusConfig.bg}`}>
                                                                <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
                                                            </div>
                                                            <div>
                                                                <h3 className="font-semibold text-gray-900">
                                                                    Trabajo #{job.id}
                                                                </h3>
                                                                <p className="text-sm text-gray-500">
                                                                    Tabla #{job.table_number}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${statusConfig.badge}`}>
                                                            {job.job_status}
                                                        </span>
                                                    </div>
                                                    
                                                    <div className="space-y-2">
                                                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                                                            <Printer className="w-4 h-4 flex-shrink-0" />
                                                            <span className="truncate">{job.printer_name || 'Sin impresora'}</span>
                                                        </div>
                                                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                                                            <Monitor className="w-4 h-4 flex-shrink-0" />
                                                            <span className="truncate">{job.dimensions || 'Sin dimensiones'}</span>
                                                        </div>
                                                        <div className="flex items-center space-x-2 text-sm text-gray-500">
                                                            <Calendar className="w-4 h-4 flex-shrink-0" />
                                                            <span>{formatDate(job.rip_start_datetime || job.output_start_datetime)}</span>
                                                        </div>
                                                        <div className="flex items-center space-x-2 text-xs text-gray-500">
                                                            <Hash className="w-3 h-3 flex-shrink-0" />
                                                            <span>{job.table_html_length || 0} caracteres HTML</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            
                            {/* Pagination */}
                            {pagination.totalPages > 1 && (
                                <div className="p-6 border-t border-gray-100 flex items-center justify-between">
                                    <button
                                        onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
                                        disabled={!pagination.hasPrev}
                                        className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                        <span>Anterior</span>
                                    </button>
                                    <div className="flex items-center space-x-2">
                                        <span className="text-sm text-gray-700">
                                            Página {pagination.page} de {pagination.totalPages}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
                                        disabled={!pagination.hasNext}
                                        className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                                    >
                                        <span>Siguiente</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Job Details */}
                    <div className="xl:col-span-8">
                        {selectedJob ? (
                            <div className="space-y-6">
                                {/* Header */}
                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="flex items-center space-x-4">
                                            <div className="p-3 bg-blue-600 rounded-xl">
                                                <FileText className="w-8 h-8 text-white" />
                                            </div>
                                            <div>
                                                <h2 className="text-2xl font-bold text-gray-900">
                                                    Trabajo #{selectedJob.id}
                                                </h2>
                                                <p className="text-gray-600 flex items-center space-x-2">
                                                    <Layers className="w-4 h-4" />
                                                    <span>Tabla #{selectedJob.table_number}</span>
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-3">
                                            <span className={`px-4 py-2 text-sm font-medium rounded-full ${getStatusConfig(selectedJob.job_status).badge}`}>
                                                {selectedJob.job_status}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
                                            <Calendar className="w-5 h-5 text-gray-600" />
                                            <div>
                                                <p className="text-sm text-gray-600">Creado</p>
                                                <p className="font-medium text-gray-900">{formatDate(selectedJob.created_at)}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
                                            <Code className="w-5 h-5 text-gray-600" />
                                            <div>
                                                <p className="text-sm text-gray-600">Tamaño HTML</p>
                                                <p className="font-medium text-gray-900">{selectedJob.table_html_length?.toLocaleString() || 0} chars</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
                                            <Hash className="w-5 h-5 text-gray-600" />
                                            <div>
                                                <p className="text-sm text-gray-600">ID Único</p>
                                                <p className="font-medium text-gray-900">{selectedJob.id}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Job Content */}
                                {contentLoading ? (
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12">
                                        <LoadingSpinner />
                                        <p className="text-center text-gray-500 mt-4">Cargando detalles del trabajo...</p>
                                    </div>
                                ) : jobContent ? (
                                    <div className="space-y-6">
                                        {/* File Info */}
                                        <InfoCard
                                            title="Información del Archivo"
                                            icon={FileText}
                                            isExpanded={expandedSections.file_info}
                                            onToggle={() => toggleSection('file_info')}
                                        >
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                                                <DataField
                                                    label="Ruta del archivo"
                                                    value={jobContent.extracted_fields?.file_info?.file_path}
                                                    icon={FileText}
                                                    highlight={true}
                                                />
                                                <DataField
                                                    label="Tamaño del archivo"
                                                    value={jobContent.extracted_fields?.file_info?.file_size}
                                                    icon={Database}
                                                />
                                                <DataField
                                                    label="Tipo de archivo"
                                                    value={jobContent.extracted_fields?.file_info?.file_type}
                                                    icon={FileText}
                                                />
                                            </div>
                                        </InfoCard>

                                        {/* Printer Info */}
                                        <InfoCard
                                            title="Información de Impresión"
                                            icon={Printer}
                                            isExpanded={expandedSections.printer_info}
                                            onToggle={() => toggleSection('printer_info')}
                                        >
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                                                <DataField
                                                    label="Impresora"
                                                    value={jobContent.extracted_fields?.printer_info?.printer_name}
                                                    icon={Printer}
                                                    highlight={true}
                                                />
                                                <DataField
                                                    label="Puerto"
                                                    value={jobContent.extracted_fields?.printer_info?.port}
                                                    icon={Settings}
                                                />
                                                <DataField
                                                    label="Remitente"
                                                    value={jobContent.extracted_fields?.printer_info?.sender}
                                                    icon={Info}
                                                />
                                                <DataField
                                                    label="Tipo de trabajo"
                                                    value={jobContent.extracted_fields?.printer_info?.job_type}
                                                    icon={Settings}
                                                />
                                            </div>
                                        </InfoCard>

                                        {/* Timing */}
                                        <InfoCard
                                            title="Tiempos de Procesamiento"
                                            icon={Clock}
                                            isExpanded={expandedSections.timing}
                                            onToggle={() => toggleSection('timing')}
                                        >
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                                                <DataField
                                                    label="Inicio RIP"
                                                    value={formatDate(jobContent.extracted_fields?.timing?.rip_start_datetime)}
                                                    icon={Play}
                                                    highlight={true}
                                                />
                                                <DataField
                                                    label="Fin RIP"
                                                    value={formatDate(jobContent.extracted_fields?.timing?.rip_end_datetime)}
                                                    icon={Square}
                                                />
                                                <DataField
                                                    label="Duración RIP"
                                                    value={jobContent.extracted_fields?.timing?.rip_duration}
                                                    icon={Zap}
                                                />
                                                <DataField
                                                    label="Inicio Salida"
                                                    value={formatDate(jobContent.extracted_fields?.timing?.output_start_datetime)}
                                                    icon={Play}
                                                    highlight={true}
                                                />
                                                <DataField
                                                    label="Fin Salida"
                                                    value={formatDate(jobContent.extracted_fields?.timing?.output_end_datetime)}
                                                    icon={Square}
                                                />
                                                <DataField
                                                    label="Duración Salida"
                                                    value={jobContent.extracted_fields?.timing?.output_duration}
                                                    icon={Zap}
                                                />
                                            </div>
                                        </InfoCard>

                                        {/* Technical */}
                                        <InfoCard
                                            title="Especificaciones Técnicas"
                                            icon={Settings}
                                            isExpanded={expandedSections.technical}
                                            onToggle={() => toggleSection('technical')}
                                        >
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                                                <DataField
                                                    label="Dimensiones"
                                                    value={jobContent.extracted_fields?.technical?.dimensions}
                                                    icon={Monitor}
                                                    highlight={true}
                                                />
                                                <DataField
                                                    label="Resolución"
                                                    value={jobContent.extracted_fields?.technical?.resolution}
                                                    icon={Settings}
                                                />
                                                <DataField
                                                    label="Modo de color"
                                                    value={jobContent.extracted_fields?.technical?.color_mode}
                                                    icon={Settings}
                                                />
                                                <DataField
                                                    label="Número de copias"
                                                    value={jobContent.extracted_fields?.technical?.number_of_copies}
                                                    icon={FileText}
                                                />
                                                <DataField
                                                    label="Número de páginas"
                                                    value={jobContent.extracted_fields?.technical?.number_of_pages}
                                                    icon={FileText}
                                                />
                                            </div>
                                        </InfoCard>

                                        {/* Status */}
                                        <InfoCard
                                            title="Estado del Trabajo"
                                            icon={Info}
                                            isExpanded={expandedSections.status}
                                            onToggle={() => toggleSection('status')}
                                        >
                                            <div className="grid grid-cols-1 gap-4 mt-4">
                                                <DataField
                                                    label="Estado"
                                                    value={jobContent.extracted_fields?.status?.job_status}
                                                    icon={AlertCircle}
                                                    highlight={true}
                                                />
                                                <DataField
                                                    label="Información del estado"
                                                    value={jobContent.extracted_fields?.status?.job_info}
                                                    icon={Info}
                                                />
                                            </div>
                                        </InfoCard>

                                        {/* HTML Info */}
                                        <InfoCard
                                            title="Código HTML Completo"
                                            icon={Code}
                                            isExpanded={expandedSections.html_info}
                                            onToggle={() => toggleSection('html_info')}
                                        >
                                            <div className="space-y-6 mt-4">
                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                    <DataField
                                                        label="Tamaño del HTML"
                                                        value={`${jobContent.html_info?.table_html_length?.toLocaleString() || 0} caracteres`}
                                                        icon={Database}
                                                        highlight={true}
                                                    />
                                                </div>
                                                
                                                <div className="flex flex-wrap gap-3">
                                                    <a
                                                        href={`${API_URL}${jobContent.html_info?.view_html_url}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200 shadow-sm hover:shadow-md"
                                                    >
                                                        <Eye className="w-5 h-5" />
                                                        <span>Ver HTML Completo</span>
                                                    </a>
                                                    <a
                                                        href={`${API_URL}${jobContent.html_info?.download_url}`}
                                                        download
                                                        className="inline-flex items-center space-x-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all duration-200 shadow-sm hover:shadow-md"
                                                    >
                                                        <Download className="w-5 h-5" />
                                                        <span>Descargar HTML</span>
                                                    </a>
                                                </div>
                                                
                                                <div className="bg-gray-900 p-6 rounded-lg">
                                                    <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center space-x-2">
                                                        <Code className="w-4 h-4" />
                                                        <span>Vista previa del código</span>
                                                    </h4>
                                                    <pre className="text-xs text-green-400 bg-gray-800 p-4 rounded overflow-x-auto border border-gray-700">
                                                        <code>{jobContent.html_info?.table_html_preview}</code>
                                                    </pre>
                                                </div>
                                            </div>
                                        </InfoCard>

                                        {/* Unmapped Fields */}
                                        {jobContent.unmapped_fields && Object.keys(jobContent.unmapped_fields).length > 0 && (
                                            <InfoCard
                                                title="Campos Adicionales Detectados"
                                                icon={Database}
                                                isExpanded={expandedSections.unmapped}
                                                onToggle={() => toggleSection('unmapped')}
                                            >
                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                                                    {Object.entries(jobContent.unmapped_fields).map(([key, value]) => (
                                                        <DataField
                                                            key={key}
                                                            label={key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                                            value={value}
                                                            icon={Database}
                                                        />
                                                    ))}
                                                </div>
                                            </InfoCard>
                                        )}
                                    </div>
                                ) : (
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12">
                                        <EmptyState
                                            icon={AlertCircle}
                                            title="Error cargando contenido"
                                            description="No se pudo cargar el contenido del trabajo seleccionado"
                                        />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12">
                                <EmptyState
                                    icon={Eye}
                                    title="Selecciona un trabajo"
                                    description="Elige un trabajo de la lista para ver sus detalles completos y acceder a toda la información"
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default App;
