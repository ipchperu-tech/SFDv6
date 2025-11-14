/**
 * js/modulos/analisis-docentes.js
 * ✅ Módulo de Análisis Completo de Docentes
 * 
 * Proporciona visualización detallada del desempeño de cada docente:
 * - Resumen global de calificaciones
 * - Evaluaciones del área de calidad
 * - Comentarios de estudiantes con paginación
 */

// --- Importaciones ---
import { db } from '../firebase-config.js';
import {
    collection,
    query,
    where,
    orderBy,
    getDocs,
    limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { formatFechaPeru } from '../utils/fecha-utils.js';

// --- Estado del módulo ---
let docenteCache = new Map();
let aulaCache = new Map();
let docenteSeleccionado = null;
let mesSeleccionado = null;

// Datos del docente actual
let evaluacionesCalidad = [];
let comentariosEstudiantes = [];
let comentariosFiltrados = [];
let encuestasPublicas = []; // ✅ NUEVO: Para gráficos

// Paginación de comentarios
let paginaActualComentarios = 1;
const COMENTARIOS_POR_PAGINA = 20;

// ✅ NUEVO: Instancias de gráficos
let chartEvolucion = null;
let chartDistribucion = null;

// --- Elementos DOM ---
let docenteSelect, mesSelect;
let resumenContainer, resumenPromedio, resumenTotal, resumenPeriodo;
let tabsContainer, sinSeleccionState;
let tabEvaluaciones, tabComentarios, tabGraficos; // ✅ NUEVO: tabGraficos
let contentEvaluaciones, contentComentarios, contentGraficos; // ✅ NUEVO: contentGraficos
let evaluacionesContainer, comentariosContainer;
let comentariosPaginacion, comentariosInicio, comentariosFin, comentariosTotal;
let comentariosPagActual, comentariosPagAnterior, comentariosPagSiguiente;

/**
 * Inicialización del módulo
 */
export function initAnalisisDocentes(user, role) {
    console.log("✅ Módulo de Análisis de Docentes inicializado");
    
    // Capturar elementos DOM
    docenteSelect = document.getElementById('analisis-docente-select');
    mesSelect = document.getElementById('analisis-mes-select');
    
    resumenContainer = document.getElementById('resumen-global-container');
    resumenPromedio = document.getElementById('resumen-promedio');
    resumenTotal = document.getElementById('resumen-total');
    resumenPeriodo = document.getElementById('resumen-periodo');
    
    tabsContainer = document.getElementById('analisis-tabs-container');
    sinSeleccionState = document.getElementById('sin-seleccion-state');
    
    tabEvaluaciones = document.getElementById('tab-evaluaciones');
    tabComentarios = document.getElementById('tab-comentarios');
    tabGraficos = document.getElementById('tab-graficos'); // ✅ NUEVO
    
    contentEvaluaciones = document.getElementById('content-evaluaciones');
    contentComentarios = document.getElementById('content-comentarios');
    contentGraficos = document.getElementById('content-graficos'); // ✅ NUEVO
    
    evaluacionesContainer = document.getElementById('evaluaciones-calidad-container');
    comentariosContainer = document.getElementById('comentarios-estudiantes-container');
    
    comentariosPaginacion = document.getElementById('comentarios-paginacion');
    comentariosInicio = document.getElementById('comentarios-inicio');
    comentariosFin = document.getElementById('comentarios-fin');
    comentariosTotal = document.getElementById('comentarios-total');
    comentariosPagActual = document.getElementById('comentarios-pagina-actual');
    comentariosPagAnterior = document.getElementById('comentarios-pag-anterior');
    comentariosPagSiguiente = document.getElementById('comentarios-pag-siguiente');
    
    // Configurar listeners
    docenteSelect.addEventListener('change', handleDocenteChange);
    mesSelect.addEventListener('change', handleMesChange);
    
    tabEvaluaciones.addEventListener('click', () => cambiarTab('evaluaciones'));
    tabComentarios.addEventListener('click', () => cambiarTab('comentarios'));
    tabGraficos.addEventListener('click', () => cambiarTab('graficos')); // ✅ NUEVO
    
    comentariosPagAnterior.addEventListener('click', () => cambiarPaginaComentarios(-1));
    comentariosPagSiguiente.addEventListener('click', () => cambiarPaginaComentarios(1));
    
    // Cargar datos iniciales
    cargarDocentes();
    cargarAulas();
    generarOpcionesMeses();
}

/**
 * Carga todos los docentes
 */
async function cargarDocentes() {
    try {
        docenteSelect.innerHTML = '<option value="">-- Cargando... --</option>';
        
        const snapshot = await getDocs(collection(db, 'sfd_docentes'));
        
        docenteCache.clear();
        docenteSelect.innerHTML = '<option value="">-- Selecciona un docente --</option>';
        
        snapshot.forEach(doc => {
            const docente = { id: doc.id, ...doc.data() };
            docenteCache.set(doc.id, docente);
            
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = docente.nombre_completo;
            docenteSelect.appendChild(option);
        });
        
        console.log(`✅ ${docenteCache.size} docentes cargados`);
        
    } catch (error) {
        console.error('❌ Error cargando docentes:', error);
        docenteSelect.innerHTML = '<option value="">Error al cargar</option>';
    }
}

/**
 * Carga todas las aulas (para nombres)
 */
async function cargarAulas() {
    try {
        const snapshot = await getDocs(collection(db, 'sfd_aulas'));
        aulaCache.clear();
        
        snapshot.forEach(doc => {
            aulaCache.set(doc.id, doc.data());
        });
        
        console.log(`✅ ${aulaCache.size} aulas cargadas`);
        
    } catch (error) {
        console.error('❌ Error cargando aulas:', error);
    }
}

/**
 * Genera opciones de meses (últimos 12 meses) - SE ACTUALIZA AUTOMÁTICAMENTE
 */
function generarOpcionesMeses() {
    const ahora = new Date();
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    mesSelect.innerHTML = '<option value="">Todos los meses</option>';
    
    // Generar los últimos 12 meses desde HOY
    for (let i = 0; i < 12; i++) {
        const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
        const mesNum = fecha.getMonth();
        const año = fecha.getFullYear();
        const valor = `${año}-${String(mesNum + 1).padStart(2, '0')}`;
        
        const option = document.createElement('option');
        option.value = valor;
        option.textContent = `${meses[mesNum]} ${año}`;
        mesSelect.appendChild(option);
    }
    
    console.log(`✅ Selector de meses generado (actualizado a ${meses[ahora.getMonth()]} ${ahora.getFullYear()})`);
}

/**
 * Maneja el cambio de docente seleccionado
 */
async function handleDocenteChange() {
    const docenteId = docenteSelect.value;
    
    if (!docenteId) {
        ocultarAnalisis();
        return;
    }
    
    docenteSeleccionado = docenteId;
    mesSeleccionado = mesSelect.value;
    
    await cargarDatosDocente();
}

/**
 * Maneja el cambio de mes
 */
async function handleMesChange() {
    if (!docenteSeleccionado) return;
    
    mesSeleccionado = mesSelect.value;
    await cargarDatosDocente();
}

/**
 * Carga todos los datos del docente seleccionado
 */
async function cargarDatosDocente() {
    try {
        // Mostrar loading
        evaluacionesContainer.innerHTML = '<p class="text-center text-gray-500 py-4">Cargando evaluaciones...</p>';
        comentariosContainer.innerHTML = '<p class="text-center text-gray-500 py-4">Cargando comentarios...</p>';
        
        // Cargar evaluaciones de calidad
        await cargarEvaluacionesCalidad();
        
        // Cargar comentarios de estudiantes
        await cargarComentariosEstudiantes();
        
        // ✅ NUEVO: Cargar encuestas para gráficos
        await cargarEncuestasPublicas();
        
        // Calcular y mostrar resumen
        calcularResumenGlobal();
        
        // Mostrar interfaz
        mostrarAnalisis();
        
    } catch (error) {
        console.error('❌ Error cargando datos:', error);
        alert('Error al cargar los datos del docente');
    }
}

/**
 * Carga evaluaciones del área de calidad
 */
async function cargarEvaluacionesCalidad() {
    const q = query(
        collection(db, 'sfd_evaluaciones_calidad'),
        where('id_docente', '==', docenteSeleccionado),
        orderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(q);
    evaluacionesCalidad = [];
    
    snapshot.forEach(doc => {
        evaluacionesCalidad.push({ id: doc.id, ...doc.data() });
    });
    
    console.log(`✅ ${evaluacionesCalidad.length} evaluaciones de calidad cargadas`);
    renderEvaluacionesCalidad();
}

/**
 * Carga comentarios de encuestas públicas
 */
async function cargarComentariosEstudiantes() {
    const q = query(
        collection(db, 'sfd_encuestas_respuestas'),
        where('id_docente', '==', docenteSeleccionado),
        where('comentario', '!=', null),
        orderBy('comentario'),
        orderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(q);
    comentariosEstudiantes = [];
    
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.comentario && data.comentario.trim() !== '') {
            comentariosEstudiantes.push({ id: doc.id, ...data });
        }
    });
    
    console.log(`✅ ${comentariosEstudiantes.length} comentarios cargados`);
    aplicarFiltroMesComentarios();
}

/**
 * Calcula el resumen global del docente
 */
function calcularResumenGlobal() {
    // Obtener TODAS las encuestas (sin filtro de mes para el resumen)
    getDocs(query(
        collection(db, 'sfd_encuestas_respuestas'),
        where('id_docente', '==', docenteSeleccionado)
    )).then(snapshot => {
        const evaluaciones = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.calificacion_estrellas && data.timestamp) {
                evaluaciones.push({
                    estrellas: data.calificacion_estrellas,
                    fecha: data.timestamp.toDate()
                });
            }
        });
        
        if (evaluaciones.length === 0) {
            resumenPromedio.textContent = '--';
            resumenTotal.textContent = '0';
            resumenPeriodo.textContent = '--';
            return;
        }
        
        // Calcular promedio
        const suma = evaluaciones.reduce((acc, e) => acc + e.estrellas, 0);
        const promedio = (suma / evaluaciones.length).toFixed(1);
        
        // Calcular periodo
        const fechas = evaluaciones.map(e => e.fecha).sort((a, b) => a - b);
        const primera = fechas[0];
        const ultima = fechas[fechas.length - 1];
        
        const mesInicio = primera.toLocaleDateString('es-PE', { month: 'short', year: 'numeric' });
        const mesFin = ultima.toLocaleDateString('es-PE', { month: 'short', year: 'numeric' });
        
        // Actualizar resumen
        resumenPromedio.innerHTML = `${promedio} <span class="text-2xl">⭐</span>`;
        resumenTotal.textContent = evaluaciones.length;
        resumenPeriodo.textContent = mesInicio === mesFin ? mesInicio : `${mesInicio} - ${mesFin}`;
    });
}

/**
 * Renderiza las evaluaciones de calidad
 */
function renderEvaluacionesCalidad() {
    // Filtrar por mes si está seleccionado
    let evaluacionesFiltradas = [...evaluacionesCalidad];
    
    if (mesSeleccionado) {
        const [año, mes] = mesSeleccionado.split('-').map(Number);
        
        evaluacionesFiltradas = evaluacionesFiltradas.filter(ev => {
            const fechaEval = ev.fecha_clase.toDate();
            return fechaEval.getFullYear() === año && fechaEval.getMonth() === mes - 1;
        });
    }
    
    if (evaluacionesFiltradas.length === 0) {
        evaluacionesContainer.innerHTML = '<p class="text-center text-gray-500 py-4">No hay evaluaciones para este periodo</p>';
        return;
    }
    
    let html = '<div class="space-y-4">';
    
    evaluacionesFiltradas.forEach(ev => {
        const aula = aulaCache.get(ev.id_aula);
        const nombreAula = aula ? aula.codigo_aula : ev.codigo_aula || 'Aula desconocida';
        
        const estrellas = '⭐'.repeat(ev.calificacion_docente);
        
        html += `
            <div class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                <div class="flex items-start justify-between mb-3">
                    <div>
                        <div class="font-medium text-gray-900">${nombreAula} - Sesión ${ev.sesion_numero}</div>
                        <div class="text-sm text-gray-500">${formatFechaPeru(ev.fecha_clase)}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-lg">${estrellas}</div>
                        <div class="text-xs text-gray-500">${ev.calificacion_docente}/5</div>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-3 text-sm mb-3">
                    <div>
                        <span class="text-gray-600">Criterio:</span>
                        <span class="font-medium ml-1">${ev.criterio_clase}</span>
                    </div>
                    <div>
                        <span class="text-gray-600">Interacción:</span>
                        <span class="font-medium ml-1">${ev.interaccion_fuera_clase}</span>
                    </div>
                    <div>
                        <span class="text-gray-600">Atención:</span>
                        <span class="font-medium ml-1">${ev.atencion}</span>
                    </div>
                    <div>
                        <span class="text-gray-600">Asistencia:</span>
                        <span class="font-medium ml-1">${ev.asistencia} alumnos</span>
                    </div>
                </div>
                
                ${ev.observacion ? `
                    <div class="mt-3 pt-3 border-t border-gray-200">
                        <div class="text-xs text-gray-600 mb-1">Observación:</div>
                        <div class="text-sm text-gray-800">${ev.observacion}</div>
                    </div>
                ` : ''}
            </div>
        `;
    });
    
    html += '</div>';
    evaluacionesContainer.innerHTML = html;
    
    console.log(`📊 ${evaluacionesFiltradas.length} evaluaciones renderizadas`);
}

/**
 * Aplica filtro de mes a comentarios
 */
function aplicarFiltroMesComentarios() {
    comentariosFiltrados = [...comentariosEstudiantes];
    
    if (mesSeleccionado) {
        const [año, mes] = mesSeleccionado.split('-').map(Number);
        
        comentariosFiltrados = comentariosFiltrados.filter(com => {
            const fechaCom = com.timestamp.toDate();
            return fechaCom.getFullYear() === año && fechaCom.getMonth() === mes - 1;
        });
    }
    
    paginaActualComentarios = 1;
    renderComentariosPaginados();
}

/**
 * Renderiza comentarios con paginación
 */
function renderComentariosPaginados() {
    const total = comentariosFiltrados.length;
    const totalPaginas = Math.ceil(total / COMENTARIOS_POR_PAGINA);
    
    if (total === 0) {
        comentariosContainer.innerHTML = '<p class="text-center text-gray-500 py-4">No hay comentarios para este periodo</p>';
        comentariosPaginacion.classList.add('hidden');
        return;
    }
    
    // Calcular rango
    const inicio = (paginaActualComentarios - 1) * COMENTARIOS_POR_PAGINA;
    const fin = Math.min(inicio + COMENTARIOS_POR_PAGINA, total);
    const comentariosPagina = comentariosFiltrados.slice(inicio, fin);
    
    // Renderizar comentarios
    let html = '<div class="space-y-4">';
    
    comentariosPagina.forEach(com => {
        const aula = aulaCache.get(com.id_aula);
        const nombreAula = aula ? aula.codigo_aula : 'Aula desconocida';
        
        const estrellas = '⭐'.repeat(com.calificacion_estrellas);
        
        html += `
            <div class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                <div class="flex items-start justify-between mb-2">
                    <div>
                        <div class="font-medium text-gray-900">${nombreAula} - Sesión ${com.sesion}</div>
                        <div class="text-sm text-gray-500">${formatFechaPeru(com.timestamp)}</div>
                    </div>
                    <div class="text-lg">${estrellas}</div>
                </div>
                
                <div class="text-sm text-gray-800 italic">"${com.comentario}"</div>
            </div>
        `;
    });
    
    html += '</div>';
    comentariosContainer.innerHTML = html;
    
    // Actualizar paginación
    comentariosInicio.textContent = inicio + 1;
    comentariosFin.textContent = fin;
    comentariosTotal.textContent = total;
    comentariosPagActual.textContent = `Página ${paginaActualComentarios} de ${totalPaginas}`;
    
    comentariosPagAnterior.disabled = paginaActualComentarios === 1;
    comentariosPagSiguiente.disabled = paginaActualComentarios === totalPaginas;
    
    comentariosPaginacion.classList.remove('hidden');
    
    console.log(`💬 ${comentariosPagina.length} comentarios renderizados (página ${paginaActualComentarios})`);
}

/**
 * Cambia de página en comentarios
 */
function cambiarPaginaComentarios(direccion) {
    paginaActualComentarios += direccion;
    renderComentariosPaginados();
}

/**
 * Cambia entre tabs
 */
function cambiarTab(tab) {
    // Actualizar tabs
    const tabs = document.querySelectorAll('.analisis-tab');
    tabs.forEach(t => {
        t.classList.remove('tab-active', 'border-red-600', 'text-red-600');
        t.classList.add('border-transparent', 'text-gray-500');
    });
    
    // Actualizar contenidos
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(c => c.classList.add('hidden'));
    
    if (tab === 'evaluaciones') {
        tabEvaluaciones.classList.add('tab-active', 'border-red-600', 'text-red-600');
        tabEvaluaciones.classList.remove('border-transparent', 'text-gray-500');
        contentEvaluaciones.classList.remove('hidden');
    } else if (tab === 'comentarios') {
        tabComentarios.classList.add('tab-active', 'border-red-600', 'text-red-600');
        tabComentarios.classList.remove('border-transparent', 'text-gray-500');
        contentComentarios.classList.remove('hidden');
    } else if (tab === 'graficos') {
        tabGraficos.classList.add('tab-active', 'border-red-600', 'text-red-600');
        tabGraficos.classList.remove('border-transparent', 'text-gray-500');
        contentGraficos.classList.remove('hidden');
    }
}

/**
 * Muestra la interfaz de análisis
 */
function mostrarAnalisis() {
    sinSeleccionState.classList.add('hidden');
    resumenContainer.classList.remove('hidden');
    tabsContainer.classList.remove('hidden');
}

/**
 * Oculta la interfaz de análisis
 */
function ocultarAnalisis() {
    resumenContainer.classList.add('hidden');
    tabsContainer.classList.add('hidden');
    sinSeleccionState.classList.remove('hidden');
    
    destruirGraficos(); // ✅ NUEVO
    
    docenteSeleccionado = null;
    mesSeleccionado = null;
}

/**
 * ✅ NUEVO: Carga todas las encuestas públicas del docente
 */
async function cargarEncuestasPublicas() {
    const q = query(
        collection(db, 'sfd_encuestas_respuestas'),
        where('id_docente', '==', docenteSeleccionado),
        orderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(q);
    encuestasPublicas = [];
    
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.calificacion_estrellas && data.timestamp) {
            encuestasPublicas.push({
                estrellas: data.calificacion_estrellas,
                fecha: data.timestamp.toDate()
            });
        }
    });
    
    console.log(`✅ ${encuestasPublicas.length} encuestas cargadas para gráficos`);
    renderizarGraficos();
}

/**
 * ✅ NUEVO: Renderiza ambos gráficos
 */
function renderizarGraficos() {
    // Aplicar filtro de mes si está activo
    let datosFiltrados = [...encuestasPublicas];
    
    if (mesSeleccionado) {
        const [año, mes] = mesSeleccionado.split('-').map(Number);
        datosFiltrados = datosFiltrados.filter(enc => {
            return enc.fecha.getFullYear() === año && enc.fecha.getMonth() === mes - 1;
        });
    }
    
    if (datosFiltrados.length === 0) {
        destruirGraficos();
        return;
    }
    
    renderGraficoEvolucion(datosFiltrados);
    renderGraficoDistribucion(datosFiltrados);
}

/**
 * ✅ NUEVO: Gráfico de evolución mensual
 */
function renderGraficoEvolucion(datos) {
    // Agrupar por mes
    const porMes = {};
    
    datos.forEach(enc => {
        const mes = `${enc.fecha.getFullYear()}-${String(enc.fecha.getMonth() + 1).padStart(2, '0')}`;
        
        if (!porMes[mes]) {
            porMes[mes] = { suma: 0, count: 0 };
        }
        
        porMes[mes].suma += enc.estrellas;
        porMes[mes].count += 1;
    });
    
    // Calcular promedios
    const mesesOrdenados = Object.keys(porMes).sort();
    const labels = mesesOrdenados.map(mes => {
        const [año, m] = mes.split('-');
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${meses[parseInt(m) - 1]} ${año}`;
    });
    
    const promedios = mesesOrdenados.map(mes => {
        const data = porMes[mes];
        return (data.suma / data.count).toFixed(2);
    });
    
    // Destruir gráfico anterior si existe
    if (chartEvolucion) {
        chartEvolucion.destroy();
    }
    
    // Crear nuevo gráfico
    const ctx = document.getElementById('chart-evolucion').getContext('2d');
    chartEvolucion = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Promedio mensual',
                data: promedios,
                borderColor: '#c80000',
                backgroundColor: 'rgba(200, 0, 0, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointRadius: 5,
                pointBackgroundColor: '#c80000',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    callbacks: {
                        label: function(context) {
                            return `Promedio: ${context.parsed.y} ⭐`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    min: 1,
                    max: 5,
                    ticks: {
                        stepSize: 0.5,
                        callback: function(value) {
                            return value.toFixed(1) + ' ⭐';
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
    
    console.log('📈 Gráfico de evolución renderizado');
}

/**
 * ✅ NUEVO: Gráfico de distribución de calificaciones
 */
function renderGraficoDistribucion(datos) {
    // Contar por estrellas
    const distribucion = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    
    datos.forEach(enc => {
        distribucion[enc.estrellas]++;
    });
    
    const labels = ['1 ⭐', '2 ⭐', '3 ⭐', '4 ⭐', '5 ⭐'];
    const valores = [
        distribucion[1],
        distribucion[2],
        distribucion[3],
        distribucion[4],
        distribucion[5]
    ];
    
    // Colores degradados
    const colores = [
        'rgba(239, 68, 68, 0.8)',   // Rojo (1 estrella)
        'rgba(251, 146, 60, 0.8)',  // Naranja (2 estrellas)
        'rgba(250, 204, 21, 0.8)',  // Amarillo (3 estrellas)
        'rgba(163, 230, 53, 0.8)',  // Verde claro (4 estrellas)
        'rgba(34, 197, 94, 0.8)'    // Verde (5 estrellas)
    ];
    
    // Destruir gráfico anterior si existe
    if (chartDistribucion) {
        chartDistribucion.destroy();
    }
    
    // Crear nuevo gráfico
    const ctx = document.getElementById('chart-distribucion').getContext('2d');
    chartDistribucion = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cantidad de evaluaciones',
                data: valores,
                backgroundColor: colores,
                borderColor: colores.map(c => c.replace('0.8', '1')),
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    callbacks: {
                        label: function(context) {
                            const total = valores.reduce((a, b) => a + b, 0);
                            const porcentaje = ((context.parsed.y / total) * 100).toFixed(1);
                            return [
                                `Cantidad: ${context.parsed.y}`,
                                `Porcentaje: ${porcentaje}%`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        callback: function(value) {
                            return Number.isInteger(value) ? value : null;
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
    
    console.log('📊 Gráfico de distribución renderizado');
}

/**
 * ✅ NUEVO: Destruye los gráficos existentes
 */
function destruirGraficos() {
    if (chartEvolucion) {
        chartEvolucion.destroy();
        chartEvolucion = null;
    }
    
    if (chartDistribucion) {
        chartDistribucion.destroy();
        chartDistribucion = null;
    }
}