/**
 * js/modulos/evaluacion-calidad.js
 * ✅ Módulo de Evaluación de Calidad
 * 
 * Permite al personal de Calidad evaluar docentes durante las clases
 * con un flujo: Aula → Fecha → Sesión → Docente (detecta reemplazos)
 */

// --- Importaciones ---
import { db, auth } from '../firebase-config.js';
import {
    collection,
    doc,
    addDoc,
    getDocs,
    getDoc,
    query,
    where,
    orderBy,
    Timestamp,
    onSnapshot,
    limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { 
    crearFechaPeru,
    formatFechaPeru 
} from '../utils/fecha-utils.js';

// --- Caché ---
let aulaCache = new Map();
let docenteCache = new Map();
let todasLasEvaluaciones = [];
let evaluacionesFiltradas = [];
let paginaActualNum = 1;
const EVALUACIONES_POR_PAGINA = 20;

// --- Variables de sesión actual ---
let sesionActual = null;
let docenteActual = null;
let calificacionSeleccionada = 0;

// --- Elementos DOM ---
let form, container, buttonShow, buttonCancel, buttonSave, errorDisplay;
let aulaSelect, fechaClaseInput, infoContainer;
let infoSesion, infoDocente, infoFrecuencia, btnVerUltima;
let asistenciaInput, observacionTextarea;
let estrellasContainer, ratingText, calificacionInput;
let tableContainer, filtroDocente, filtroFecha, resetFiltros;
let paginacionContainer, evalInicio, evalFin, evalTotal, paginaActualTexto;
let pagAnterior, pagSiguiente;
let ultimaEvalModal, ultimaEvalContent, closeUltimaEvalModal;

/**
 * Inicialización del módulo
 */
export function initEvaluacionCalidad(user, role) {
    console.log("✅ Módulo de Evaluación de Calidad inicializado");
    
    // Capturar elementos
    form = document.getElementById('new-evaluacion-form');
    container = document.getElementById('new-evaluacion-form-container');
    buttonShow = document.getElementById('show-evaluacion-form-button');
    buttonCancel = document.getElementById('cancel-evaluacion-form-button');
    buttonSave = document.getElementById('save-evaluacion-button');
    errorDisplay = document.getElementById('form-evaluacion-error');
    
    aulaSelect = document.getElementById('eval_aula_select');
    fechaClaseInput = document.getElementById('eval_fecha_clase');
    infoContainer = document.getElementById('eval_info_container');
    infoSesion = document.getElementById('eval_info_sesion');
    infoDocente = document.getElementById('eval_info_docente');
    infoFrecuencia = document.getElementById('eval_info_frecuencia');
    btnVerUltima = document.getElementById('btn_ver_ultima_eval');
    
    asistenciaInput = document.getElementById('eval_asistencia');
    observacionTextarea = document.getElementById('eval_observacion');
    
    estrellasContainer = document.getElementById('eval_estrellas_container');
    ratingText = document.getElementById('eval_rating_text');
    calificacionInput = document.getElementById('eval_calificacion_input');
    
    tableContainer = document.getElementById('evaluaciones-table-container');
    filtroDocente = document.getElementById('filtro-docente-eval');
    filtroFecha = document.getElementById('filtro-fecha-eval');
    resetFiltros = document.getElementById('reset-filtros-eval');
    
    paginacionContainer = document.getElementById('eval-paginacion-container');
    evalInicio = document.getElementById('eval-inicio');
    evalFin = document.getElementById('eval-fin');
    evalTotal = document.getElementById('eval-total');
    paginaActualTexto = document.getElementById('pagina-actual-eval');
    pagAnterior = document.getElementById('pag-anterior-eval');
    pagSiguiente = document.getElementById('pag-siguiente-eval');
    
    ultimaEvalModal = document.getElementById('ultima-eval-modal');
    ultimaEvalContent = document.getElementById('ultima-eval-content');
    closeUltimaEvalModal = document.getElementById('close-ultima-eval-modal');
    
    // Configurar listeners
    buttonShow.addEventListener('click', () => toggleForm(true));
    buttonCancel.addEventListener('click', () => toggleForm(false));
    form.addEventListener('submit', handleSaveEvaluacion);
    
    aulaSelect.addEventListener('change', handleAulaChange);
    fechaClaseInput.addEventListener('change', handleFechaChange);
    btnVerUltima.addEventListener('click', mostrarUltimaEvaluacion);
    
    // Estrellas
    setupEstrellas();
    
    // Filtros
    filtroDocente.addEventListener('change', aplicarFiltros);
    filtroFecha.addEventListener('change', aplicarFiltros);
    resetFiltros.addEventListener('click', resetearFiltros);
    
    // Paginación
    pagAnterior.addEventListener('click', () => cambiarPagina(-1));
    pagSiguiente.addEventListener('click', () => cambiarPagina(1));
    
    // Modal
    closeUltimaEvalModal.addEventListener('click', () => ultimaEvalModal.classList.add('hidden'));
    
    // Cargar datos
    loadAulasActivas();
    loadDocentes();
    listenForEvaluaciones();
}

/**
 * Muestra/oculta formulario
 */
function toggleForm(show) {
    if (show) {
        container.classList.remove('hidden');
        buttonShow.classList.add('hidden');
        form.reset();
        errorDisplay.textContent = '';
        infoContainer.classList.add('hidden');
        calificacionSeleccionada = 0;
        sesionActual = null;
        docenteActual = null;
        resetEstrellas();
    } else {
        container.classList.add('hidden');
        buttonShow.classList.remove('hidden');
    }
}

/**
 * Carga aulas activas
 */
function loadAulasActivas() {
    const q = query(
        collection(db, 'sfd_aulas'), 
        where('estado', 'in', ['En Curso', 'Próxima'])
    );
    
    onSnapshot(q, (snapshot) => {
        aulaCache.clear();
        aulaSelect.innerHTML = '<option value="">-- Selecciona un aula --</option>';
        
        snapshot.forEach(doc => {
            const aula = { id: doc.id, ...doc.data() };
            aulaCache.set(aula.id, aula);
            aulaSelect.innerHTML += `<option value="${aula.id}">${aula.codigo_aula}</option>`;
        });
        
        console.log(`✅ ${aulaCache.size} aulas activas cargadas`);
    });
}

/**
 * Carga docentes
 */
async function loadDocentes() {
    const snapshot = await getDocs(collection(db, 'sfd_docentes'));
    docenteCache.clear();
    
    filtroDocente.innerHTML = '<option value="">Todos los docentes</option>';
    
    snapshot.forEach(doc => {
        const docente = { id: doc.id, ...doc.data() };
        docenteCache.set(doc.id, docente);
        filtroDocente.innerHTML += `<option value="${doc.id}">${docente.nombre_completo}</option>`;
    });
    
    console.log(`✅ ${docenteCache.size} docentes cargados`);
}

/**
 * Maneja cambio de aula
 */
function handleAulaChange() {
    const aulaId = aulaSelect.value;
    fechaClaseInput.value = '';
    infoContainer.classList.add('hidden');
    sesionActual = null;
    docenteActual = null;
    
    if (!aulaId) return;
    
    // Habilitar selector de fecha
    fechaClaseInput.disabled = false;
}

/**
 * Maneja cambio de fecha
 */
async function handleFechaChange() {
    const aulaId = aulaSelect.value;
    const fechaStr = fechaClaseInput.value;
    
    if (!aulaId || !fechaStr) return;
    
    try {
        // Convertir fecha a timestamp de Perú
        const [year, month, day] = fechaStr.split('-').map(Number);
        const fechaPeru = crearFechaPeru(year, month, day);
        const fechaTimestamp = Timestamp.fromDate(fechaPeru);
        
        // Buscar sesión en esa fecha
        const sesionesRef = collection(db, `sfd_aulas/${aulaId}/sesiones`);
        const q = query(sesionesRef, where('fecha', '==', fechaTimestamp));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            errorDisplay.textContent = 'No hay sesión programada para esta fecha en esta aula.';
            infoContainer.classList.add('hidden');
            return;
        }
        
        errorDisplay.textContent = '';
        
        // Obtener sesión
        const sesionDoc = snapshot.docs[0];
        sesionActual = { id: sesionDoc.id, ...sesionDoc.data() };
        
        // Determinar docente
        const aula = aulaCache.get(aulaId);
        let docenteId = aula.id_docente_asignado;
        let esReemplazo = false;
        
        if (sesionActual.estado === 'con_novedad_reemplazo' && sesionActual.id_docente) {
            docenteId = sesionActual.id_docente;
            esReemplazo = true;
        }
        
        docenteActual = {
            id: docenteId,
            esReemplazo: esReemplazo
        };
        
        const docente = docenteCache.get(docenteId);
        
        // Mostrar información
        infoSesion.textContent = `Sesión ${sesionActual.sesion}`;
        infoDocente.textContent = docente ? docente.nombre_completo : 'No asignado';
        infoFrecuencia.textContent = aula.frecuencia;
        
        infoContainer.classList.remove('hidden');
        
        console.log(`✅ Sesión encontrada: ${sesionActual.sesion} | Docente: ${docenteId} | Reemplazo: ${esReemplazo}`);
        
    } catch (error) {
        console.error('Error buscando sesión:', error);
        errorDisplay.textContent = 'Error al buscar la sesión. Intenta de nuevo.';
    }
}

/**
 * Configura estrellas interactivas
 */
function setupEstrellas() {
    const estrellas = estrellasContainer.querySelectorAll('.star-eval');
    
    const mensajes = {
        0: 'Selecciona una calificación',
        1: 'Muy Malo',
        2: 'Malo',
        3: 'Regular',
        4: 'Bueno',
        5: '¡Excelente!'
    };
    
    estrellas.forEach(star => {
        star.addEventListener('mouseover', () => {
            const rating = parseInt(star.dataset.rating);
            estrellas.forEach((s, i) => {
                s.classList.toggle('text-yellow-400', i < rating);
                s.classList.toggle('text-gray-300', i >= rating);
            });
        });
        
        star.addEventListener('mouseout', () => {
            estrellas.forEach((s, i) => {
                s.classList.toggle('text-yellow-400', i < calificacionSeleccionada);
                s.classList.toggle('text-gray-300', i >= calificacionSeleccionada);
            });
        });
        
        star.addEventListener('click', () => {
            calificacionSeleccionada = parseInt(star.dataset.rating);
            calificacionInput.value = calificacionSeleccionada;
            ratingText.textContent = mensajes[calificacionSeleccionada];
            errorDisplay.textContent = '';
        });
    });
}

function resetEstrellas() {
    const estrellas = estrellasContainer.querySelectorAll('.star-eval');
    estrellas.forEach(s => {
        s.classList.add('text-gray-300');
        s.classList.remove('text-yellow-400');
    });
    ratingText.textContent = 'Selecciona una calificación';
    calificacionInput.value = '';
}

/**
 * Guarda evaluación
 */
async function handleSaveEvaluacion(e) {
    e.preventDefault();
    buttonSave.disabled = true;
    buttonSave.textContent = 'Guardando...';
    errorDisplay.textContent = '';
    
    try {
        if (!sesionActual || !docenteActual) {
            throw new Error('Debes seleccionar un aula y una fecha válida.');
        }
        
        if (calificacionSeleccionada === 0) {
            throw new Error('Debes seleccionar una calificación con estrellas.');
        }
        
        const aulaId = aulaSelect.value;
        const aula = aulaCache.get(aulaId);
        const docente = docenteCache.get(docenteActual.id);
        
        const formData = new FormData(form);
        
        const evaluacion = {
            // Identificación
            id_aula: aulaId,
            codigo_aula: aula.codigo_aula,
            sesion_numero: sesionActual.sesion,
            fecha_clase: sesionActual.fecha,
            
            id_docente: docenteActual.id,
            nombre_docente: docente.nombre_completo,
            es_reemplazo: docenteActual.esReemplazo,
            
            // Evaluación
            criterio_clase: formData.get('criterio_clase'),
            interaccion_fuera_clase: formData.get('interaccion_fuera_clase'),
            atencion: formData.get('atencion'),
            asistencia: parseInt(formData.get('eval_asistencia')),
            calificacion_docente: calificacionSeleccionada,
            ejecucion_clase: formData.get('eval_ejecucion_clase'),
            observacion: formData.get('eval_observacion') || '',
            
            // Metadatos
            evaluador_uid: auth.currentUser.uid,
            evaluador_nombre: auth.currentUser.email,
            timestamp: Timestamp.now()
        };
 
await addDoc(collection(db, 'sfd_evaluaciones_calidad'), evaluacion);

console.log('✅ Evaluación guardada exitosamente');

// ✅ Enviar email a área de Calidad
try {
    await enviarEmailCalidad(evaluacion);
    console.log('✅ Email enviado correctamente');
} catch (emailError) {
    console.warn('⚠️ Error al enviar email (la evaluación sí se guardó):', emailError);
}

toggleForm(false);
        
    } catch (error) {
        console.error('❌ Error al guardar evaluación:', error);
        errorDisplay.textContent = `Error: ${error.message}`;
    } finally {
        buttonSave.disabled = false;
        buttonSave.textContent = 'Guardar Evaluación';
    }
}

/**
 * Escucha evaluaciones
 */
function listenForEvaluaciones() {
    const q = query(
        collection(db, 'sfd_evaluaciones_calidad'),
        orderBy('timestamp', 'desc')
    );
    
    onSnapshot(q, (snapshot) => {
        todasLasEvaluaciones = [];
        
        snapshot.forEach(doc => {
            todasLasEvaluaciones.push({ id: doc.id, ...doc.data() });
        });
        
        console.log(`✅ ${todasLasEvaluaciones.length} evaluaciones cargadas`);
        aplicarFiltros();
    });
}

/**
 * Aplica filtros
 */
function aplicarFiltros() {
    const docenteId = filtroDocente.value;
    const fechaStr = filtroFecha.value;
    
    evaluacionesFiltradas = [...todasLasEvaluaciones];
    
    if (docenteId) {
        evaluacionesFiltradas = evaluacionesFiltradas.filter(e => e.id_docente === docenteId);
    }
    
    if (fechaStr) {
        const [year, month, day] = fechaStr.split('-').map(Number);
        const fechaBuscar = crearFechaPeru(year, month, day);
        
        evaluacionesFiltradas = evaluacionesFiltradas.filter(e => {
            const fechaEval = e.fecha_clase.toDate();
            return fechaEval.toDateString() === fechaBuscar.toDateString();
        });
    }
    
    renderEvaluacionesPaginadas(1);
}

function resetearFiltros() {
    filtroDocente.value = '';
    filtroFecha.value = '';
    aplicarFiltros();
}

/**
 * Renderiza tabla con paginación
 */
function renderEvaluacionesPaginadas(pagina) {
    paginaActualNum = pagina;
    
    const total = evaluacionesFiltradas.length;
    const totalPaginas = Math.ceil(total / EVALUACIONES_POR_PAGINA);
    
    const inicio = (pagina - 1) * EVALUACIONES_POR_PAGINA;
    const fin = Math.min(inicio + EVALUACIONES_POR_PAGINA, total);
    const evaluacionesPagina = evaluacionesFiltradas.slice(inicio, fin);
    
    let tableHtml = `
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Fecha</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Aula</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Sesión</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Docente</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Calificación</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Asistencia</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Evaluador</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white">
    `;
    
    if (evaluacionesPagina.length === 0) {
        tableHtml += `<tr><td colspan="7" class="px-6 py-4 text-center text-gray-500">No hay evaluaciones.</td></tr>`;
    } else {
        evaluacionesPagina.forEach(e => {
            const estrellas = '⭐'.repeat(e.calificacion_docente);
            
            tableHtml += `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 text-sm text-gray-500">${formatFechaPeru(e.fecha_clase)}</td>
                    <td class="px-6 py-4 text-sm font-medium text-gray-900">${e.codigo_aula}</td>
                    <td class="px-6 py-4 text-sm text-gray-500">S${e.sesion_numero}</td>
                    <td class="px-6 py-4 text-sm text-gray-700">${e.nombre_docente}${e.es_reemplazo ? ' 🔄' : ''}</td>
                    <td class="px-6 py-4 text-sm">${estrellas} (${e.calificacion_docente}/5)</td>
                    <td class="px-6 py-4 text-sm text-gray-500">${e.asistencia} alumnos</td>
                    <td class="px-6 py-4 text-sm text-gray-500">${e.evaluador_nombre.split('@')[0]}</td>
                </tr>
            `;
        });
    }
    
    tableHtml += `</tbody></table>`;
    tableContainer.innerHTML = tableHtml;
    
    // Paginación
    if (total > 0) {
        evalInicio.textContent = inicio + 1;
        evalFin.textContent = fin;
        evalTotal.textContent = total;
        paginaActualTexto.textContent = `Página ${pagina} de ${totalPaginas}`;
        
        pagAnterior.disabled = pagina === 1;
        pagSiguiente.disabled = pagina === totalPaginas;
        
        paginacionContainer.classList.remove('hidden');
    } else {
        paginacionContainer.classList.add('hidden');
    }
}

function cambiarPagina(direccion) {
    renderEvaluacionesPaginadas(paginaActualNum + direccion);
}

/**
 * Muestra última evaluación del docente
 */
async function mostrarUltimaEvaluacion() {
    if (!docenteActual) return;
    
    try {
        const q = query(
            collection(db, 'sfd_evaluaciones_calidad'),
            where('id_docente', '==', docenteActual.id),
            orderBy('timestamp', 'desc'),
            limit(1)
        );
        
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            ultimaEvalContent.innerHTML = '<p class="text-gray-500">Este docente no tiene evaluaciones previas.</p>';
        } else {
            const evaluacion = snapshot.docs[0].data();
            
ultimaEvalContent.innerHTML = `
    <div class="space-y-2 text-sm">
        <div><strong>Fecha:</strong> ${formatFechaPeru(evaluacion.fecha_clase)}</div>
        <div><strong>Aula:</strong> ${evaluacion.codigo_aula} (Sesión ${evaluacion.sesion_numero})</div>
        <div><strong>Criterio Clase:</strong> ${evaluacion.criterio_clase}</div>
        <div><strong>Interacción:</strong> ${evaluacion.interaccion_fuera_clase}</div>
        <div><strong>Atención:</strong> ${evaluacion.atencion}</div>
        <div><strong>Asistencia:</strong> ${evaluacion.asistencia} alumnos</div>
        <div><strong>Calificación:</strong> ${'⭐'.repeat(evaluacion.calificacion_docente)} (${evaluacion.calificacion_docente}/5)</div>
        <div><strong>Ejecución:</strong> ${evaluacion.ejecucion_clase}</div>
        ${evaluacion.observacion ? `<div><strong>Observación:</strong> ${evaluacion.observacion}</div>` : ''}
    </div>
`;
        }
        
        ultimaEvalModal.classList.remove('hidden');
        
    } catch (error) {
        console.error('Error cargando última evaluación:', error);
        alert('Error al cargar la última evaluación.');
    }
}


/**
 * ✅ Envía email con EmailJS
 */
async function enviarEmailCalidad(evaluacion) {
    const templateParams = {
        codigo_aula: evaluacion.codigo_aula,
        sesion_numero: evaluacion.sesion_numero,
        fecha_clase: formatFechaPeru(evaluacion.fecha_clase),
        nombre_docente: evaluacion.nombre_docente,
        criterio_clase: evaluacion.criterio_clase,
        interaccion_fuera_clase: evaluacion.interaccion_fuera_clase,
        atencion: evaluacion.atencion,
        asistencia: evaluacion.asistencia,
        calificacion_docente: evaluacion.calificacion_docente,
        ejecucion_clase: evaluacion.ejecucion_clase,
        observacion: evaluacion.observacion || 'Sin observaciones',
        evaluador_nombre: evaluacion.evaluador_nombre,
        timestamp: new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })
    };
    
    // ⚠️ REEMPLAZAR con tus IDs de EmailJS
    return emailjs.send(
        'service_lnxen1x',      // ← Service ID de EmailJS
        'evaluacion_calidad_ipch',     // ← Template ID de EmailJS
        templateParams
    );
}