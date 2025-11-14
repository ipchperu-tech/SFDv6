/**
 * js/dashboard-docente.js
 * ✅ V2.0: Con formularios de acción (Reemplazo, Reprogramación, Reporte)
 */

// --- Importaciones de Núcleo ---
import { auth, db } from './firebase-config.js';
import { signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    doc, 
    getDoc, 
    collection, 
    query, 
    where, 
    getDocs,
    orderBy,
    addDoc,
    Timestamp,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { protectPage } from './auth-guard.js';
import { formatFechaPeru } from './utils/fecha-utils.js';
import { REPORTE_CONFIG } from './config/reporte-config.js';

// --- Elementos del DOM ---
let elements = {};
let docenteData = null;
let docenteCache = new Map();
let signaturePad = null;

// Paginación
let todosLosComentarios = [];
let comentariosMostrados = [];
let paginaActualNum = 1;
const COMENTARIOS_POR_PAGINA = 20;

/**
 * Punto de entrada principal
 */
document.addEventListener('DOMContentLoaded', async () => {
    
    // Capturar elementos del DOM
    elements = {
        userNameDisplay: document.getElementById('user-name-display'),
        userEmailDisplay: document.getElementById('user-email-display'),
        logoutButton: document.getElementById('logout-button'),
        
        // Filtros
        filtroAula: document.getElementById('filtro-aula'),
        filtroFechaComentarios: document.getElementById('filtro-fecha-comentarios'),
        filtroAulaComentarios: document.getElementById('filtro-aula-comentarios'),
        resetFiltrosComentarios: document.getElementById('reset-filtros-comentarios'),
        
        // Paginación
        paginacionContainer: document.getElementById('paginacion-container'),
        comentariosInicio: document.getElementById('comentarios-inicio'),
        comentariosFin: document.getElementById('comentarios-fin'),
        comentariosTotal: document.getElementById('comentarios-total'),
        paginaActual: document.getElementById('pagina-actual'),
        pagAnterior: document.getElementById('pag-anterior'),
        pagSiguiente: document.getElementById('pag-siguiente'),
        
        promedioGlobal: document.getElementById('promedio-global'),
        totalEncuestas: document.getElementById('total-encuestas'),
        totalAulas: document.getElementById('total-aulas'),
        aulasTableContainer: document.getElementById('aulas-table-container'),
        comentariosContainer: document.getElementById('comentarios-container'),
        
        // Botones del footer
        btnReemplazo: document.getElementById('btn-notificar-reemplazo'),
        btnReprogramacion: document.getElementById('btn-notificar-reprogramacion'),
        btnReporte: document.getElementById('btn-registrar-reporte'),
        
        // Modales
        modalReemplazo: document.getElementById('modal-reemplazo'),
        modalReprogramacion: document.getElementById('modal-reprogramacion'),
        modalReporte: document.getElementById('modal-reporte')
    };

    try {
        // 1. Proteger la página (solo docentes)
        const { user } = await protectPage(['docente']);
        
        // 2. Inicializar el dashboard
        await initializeDashboard(user);

    } catch (error) {
        console.error("Error de autenticación:", error);
        window.location.href = 'login.html';
    }
});

/**
 * Inicializa el dashboard del docente
 */
async function initializeDashboard(user) {
    try {
        // Mostrar email del usuario
        if (elements.userEmailDisplay) {
            elements.userEmailDisplay.textContent = user.email;
        }

        // Configurar botón de logout
        if (elements.logoutButton) {
            elements.logoutButton.addEventListener('click', () => {
                signOut(auth).then(() => {
                    window.location.href = 'login.html';
                }).catch((error) => {
                    console.error('Error al cerrar sesión:', error);
                });
            });
        }

        // Obtener el docente_id del usuario actual
        const userDocRef = doc(db, 'sfd_usuarios', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
            throw new Error('No se encontró el registro del usuario.');
        }

        const userData = userDocSnap.data();
        const docenteId = userData.docente_id;

        if (!docenteId) {
            throw new Error('Tu usuario no está vinculado a un registro de docente.');
        }

        // Cargar datos del docente
        const docenteDocRef = doc(db, 'sfd_docentes', docenteId);
        const docenteDocSnap = await getDoc(docenteDocRef);

        if (docenteDocSnap.exists()) {
            docenteData = { id: docenteId, ...docenteDocSnap.data() };
            elements.userNameDisplay.textContent = docenteData.nombre_completo || 'Docente';
        }

        // Cargar todas las encuestas del docente
        const encuestasRef = collection(db, 'sfd_encuestas_respuestas');
        const q = query(
            encuestasRef, 
            where('id_docente', '==', docenteId),
            orderBy('timestamp', 'desc')
        );
        
        const encuestasSnap = await getDocs(q);

        if (encuestasSnap.empty) {
            await mostrarSinDatos(user);
            await inicializarFormularios();
            return;
        }

        // Procesar y calcular estadísticas
        const encuestas = [];
        encuestasSnap.forEach(doc => {
            encuestas.push({ id: doc.id, ...doc.data() });
        });

        const estadisticas = calcularEstadisticas(encuestas);
        const estadisticasConAulas = await cargarNombresAulas(estadisticas.por_aula);
        const comentariosConAulas = await agregarNombresAulasAComentarios(estadisticas.comentarios);

        renderMetricasPrincipales(estadisticas);
        renderTablaAulas(estadisticasConAulas);

        inicializarFiltros(estadisticasConAulas, comentariosConAulas);
        renderComentariosPaginados(comentariosConAulas, 1);

        // Inicializar formularios
        await inicializarFormularios();

        // Quitar loader
        document.body.classList.remove('loading');

    } catch (error) {
        console.error("Error al inicializar dashboard:", error);
        mostrarError(error.message);
    }
}

/**
 * ✅ NUEVO: Inicializa los formularios del footer
 */
async function inicializarFormularios() {
    // Cargar docentes para los selects
    await cargarDocentesCache();
    
    // Verificar si el reporte mensual está habilitado
    await verificarReporteHabilitado();
    
    // Configurar listeners de botones
    elements.btnReemplazo?.addEventListener('click', abrirModalReemplazo);
    elements.btnReprogramacion?.addEventListener('click', abrirModalReprogramacion);
    elements.btnReporte?.addEventListener('click', abrirModalReporte);
    
    // Configurar listeners de cierre de modales
    document.getElementById('close-modal-reemplazo')?.addEventListener('click', () => {
        elements.modalReemplazo.classList.add('hidden');
    });
    
    document.getElementById('close-modal-reprogramacion')?.addEventListener('click', () => {
        elements.modalReprogramacion.classList.add('hidden');
    });
    
    document.getElementById('close-modal-reporte')?.addEventListener('click', () => {
        elements.modalReporte.classList.add('hidden');
    });
    
    // Configurar listeners de formularios
    document.getElementById('form-reemplazo')?.addEventListener('submit', enviarReemplazo);
    document.getElementById('form-reprogramacion')?.addEventListener('submit', enviarReprogramacion);
    document.getElementById('form-reporte')?.addEventListener('submit', enviarReporte);
    
    // Configurar lógica del reporte
    configurarFormularioReporte();
}

/**
 * ✅ NUEVO: Verifica si el reporte mensual está habilitado
 */
async function verificarReporteHabilitado() {
    try {
        const configRef = doc(db, REPORTE_CONFIG.COLLECTION, REPORTE_CONFIG.DOC_ID);
        
        // Escuchar cambios en tiempo real (sin caché)
        onSnapshot(configRef, (docSnap) => {
            if (docSnap.exists()) {
                const config = docSnap.data();
                const habilitado = config.activo === true;
                
                if (habilitado) {
                    elements.btnReporte?.classList.remove('hidden');
                } else {
                    elements.btnReporte?.classList.add('hidden');
                }
                
                console.log(`✅ Reporte mensual: ${habilitado ? 'HABILITADO' : 'DESHABILITADO'}`);
            } else {
                // Si no existe el documento, ocultar botón
                elements.btnReporte?.classList.add('hidden');
            }
        });
        
    } catch (error) {
        console.error('Error verificando reporte:', error);
        elements.btnReporte?.classList.add('hidden');
    }
}

/**
 * ✅ NUEVO: Carga todos los docentes en caché
 */
async function cargarDocentesCache() {
    try {
        const docentesRef = collection(db, 'sfd_docentes');
        const snapshot = await getDocs(docentesRef);
        
        docenteCache.clear();
        
        snapshot.forEach(doc => {
            const docente = { id: doc.id, ...doc.data() };
            docenteCache.set(doc.id, docente);
        });
        
        console.log(`✅ ${docenteCache.size} docentes cargados`);
        
    } catch (error) {
        console.error('Error cargando docentes:', error);
    }
}

// ==========================================
// MODAL 1: NOTIFICAR REEMPLAZO
// ==========================================

function abrirModalReemplazo() {
    // Prellenar campos automáticos
    document.getElementById('reemplazo-fecha-actual').value = new Date().toLocaleDateString('es-PE');
    document.getElementById('reemplazo-docente').value = docenteData?.nombre_completo || 'N/A';
    
    // Cargar docentes en el select
    const select = document.getElementById('reemplazo-docente-reemplazo');
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    
    docenteCache.forEach((docente, id) => {
        if (id !== docenteData?.id) { // No mostrar el mismo docente
            select.innerHTML += `<option value="${id}">${docente.nombre_completo}</option>`;
        }
    });
    
    // Limpiar formulario
    document.getElementById('form-reemplazo').reset();
    document.getElementById('reemplazo-error').classList.add('hidden');
    
    // Mostrar modal
    elements.modalReemplazo.classList.remove('hidden');
}

async function enviarReemplazo(e) {
    e.preventDefault();
    
    const btnEnviar = document.getElementById('btn-enviar-reemplazo');
    const errorDisplay = document.getElementById('reemplazo-error');
    
    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Enviando...';
    errorDisplay.classList.add('hidden');
    
    try {
        // Recopilar datos
        const formData = {
            tipo: 'reemplazo',
            fecha_actual: document.getElementById('reemplazo-fecha-actual').value,
            docente: document.getElementById('reemplazo-docente').value,
            codigo_aula: document.getElementById('reemplazo-codigo-aula').value,
            fecha_reemplazo: document.getElementById('reemplazo-fecha-clase').value,
            docente_reemplazo_id: document.getElementById('reemplazo-docente-reemplazo').value,
            docente_reemplazo_nombre: docenteCache.get(document.getElementById('reemplazo-docente-reemplazo').value)?.nombre_completo || 'N/A',
            comunicado: document.querySelector('input[name="reemplazo-comunicado"]:checked').value,
            horario: convertirHorario12h(
                document.getElementById('reemplazo-horario').value,
                document.getElementById('reemplazo-periodo').value
            ),
            motivo: document.getElementById('reemplazo-motivo').value,
            timestamp: Timestamp.now()
        };
        
        // Guardar en Firestore
        await addDoc(collection(db, 'sfd_formularios_docentes', 'reemplazos', 'registros'), formData);
        
        // Enviar email con EmailJS
        await emailjs.send(
            'service_lnxen1x',
            'template_reemplazo_docente', // ⚠️ Debes crear este template
            {
                fecha_actual: formData.fecha_actual,
                docente: formData.docente,
                codigo_aula: formData.codigo_aula,
                fecha_reemplazo: formData.fecha_reemplazo,
                docente_reemplazo: formData.docente_reemplazo_nombre,
                comunicado: formData.comunicado,
                horario: formData.horario,
                motivo: formData.motivo
            }
        );
        
        // Cerrar modal y mostrar éxito
        elements.modalReemplazo.classList.add('hidden');
        alert('✅ Hemos recibido tu notificación de reemplazo');
        
        console.log('✅ Reemplazo enviado exitosamente');
        
    } catch (error) {
        console.error('Error enviando reemplazo:', error);
        errorDisplay.textContent = 'Error al enviar. Intenta de nuevo.';
        errorDisplay.classList.remove('hidden');
    } finally {
        btnEnviar.disabled = false;
        btnEnviar.textContent = 'Enviar Notificación';
    }
}

// ==========================================
// MODAL 2: NOTIFICAR REPROGRAMACIÓN
// ==========================================

function abrirModalReprogramacion() {
    // Prellenar campos automáticos
    document.getElementById('reprog-fecha-actual').value = new Date().toLocaleDateString('es-PE');
    document.getElementById('reprog-docente').value = docenteData?.nombre_completo || 'N/A';
    
    // Limpiar formulario
    document.getElementById('form-reprogramacion').reset();
    document.getElementById('reprog-error').classList.add('hidden');
    
    // Mostrar modal
    elements.modalReprogramacion.classList.remove('hidden');
}

async function enviarReprogramacion(e) {
    e.preventDefault();
    
    const btnEnviar = document.getElementById('btn-enviar-reprog');
    const errorDisplay = document.getElementById('reprog-error');
    
    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Enviando...';
    errorDisplay.classList.add('hidden');
    
    try {
        // Recopilar datos
        const formData = {
            tipo: 'reprogramacion',
            fecha_actual: document.getElementById('reprog-fecha-actual').value,
            docente: document.getElementById('reprog-docente').value,
            codigo_aula: document.getElementById('reprog-codigo-aula').value,
            fecha_reprogramacion: document.getElementById('reprog-fecha-clase').value,
            numero_sesion: document.getElementById('reprog-numero-sesion').value,
            comunicado: document.querySelector('input[name="reprog-comunicado"]:checked').value,
            horario: convertirHorario12h(
                document.getElementById('reprog-horario').value,
                document.getElementById('reprog-periodo').value
            ),
            motivo: document.getElementById('reprog-motivo').value,
            timestamp: Timestamp.now()
        };
        
        // Guardar en Firestore
        await addDoc(collection(db, 'sfd_formularios_docentes', 'reprogramaciones', 'registros'), formData);
        
        // Enviar email con EmailJS
        await emailjs.send(
            'service_lnxen1x',
            'template_reprogramacion_docente', // ⚠️ Debes crear este template
            {
                fecha_actual: formData.fecha_actual,
                docente: formData.docente,
                codigo_aula: formData.codigo_aula,
                fecha_reprogramacion: formData.fecha_reprogramacion,
                numero_sesion: formData.numero_sesion,
                comunicado: formData.comunicado,
                horario: formData.horario,
                motivo: formData.motivo
            }
        );
        
        // Cerrar modal y mostrar éxito
        elements.modalReprogramacion.classList.add('hidden');
        alert('✅ Hemos recibido tu notificación de reprogramación');
        
        console.log('✅ Reprogramación enviada exitosamente');
        
    } catch (error) {
        console.error('Error enviando reprogramación:', error);
        errorDisplay.textContent = 'Error al enviar. Intenta de nuevo.';
        errorDisplay.classList.remove('hidden');
    } finally {
        btnEnviar.disabled = false;
        btnEnviar.textContent = 'Enviar Notificación';
    }
}

// ==========================================
// MODAL 3: REGISTRAR REPORTE MENSUAL
// ==========================================

function configurarFormularioReporte() {
    // Configurar selector de cantidad de aulas
    document.getElementById('reporte-cantidad-aulas')?.addEventListener('change', (e) => {
        generarCamposAulas(parseInt(e.target.value));
    });
    
    // Configurar radios de reemplazos/reprogramaciones
    document.querySelectorAll('input[name="reporte-reemplazos"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const cantidadInput = document.getElementById('reporte-reemplazos-cantidad');
            if (e.target.value === 'Sí') {
                cantidadInput.classList.remove('hidden');
                cantidadInput.required = true;
            } else {
                cantidadInput.classList.add('hidden');
                cantidadInput.required = false;
                cantidadInput.value = '';
            }
        });
    });
    
    document.querySelectorAll('input[name="reporte-reprogramaciones"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const cantidadInput = document.getElementById('reporte-reprogramaciones-cantidad');
            if (e.target.value === 'Sí') {
                cantidadInput.classList.remove('hidden');
                cantidadInput.required = true;
            } else {
                cantidadInput.classList.add('hidden');
                cantidadInput.required = false;
                cantidadInput.value = '';
            }
        });
    });
    
    // Configurar canvas de firma
    const canvas = document.getElementById('reporte-firma-canvas');
    if (canvas) {
        signaturePad = new SignaturePad(canvas, {
            backgroundColor: 'rgb(255, 255, 255)',
            penColor: 'rgb(0, 0, 0)'
        });
        
        document.getElementById('btn-limpiar-firma')?.addEventListener('click', () => {
            signaturePad.clear();
        });
    }
}

function generarCamposAulas(cantidad) {
    const container = document.getElementById('reporte-aulas-container');
    container.innerHTML = '';
    
    for (let i = 1; i <= cantidad; i++) {
        const aulaDiv = document.createElement('div');
        aulaDiv.className = 'grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200';
        aulaDiv.innerHTML = `
            <div>
                <label class="form-label">Código Aula ${i} <span class="text-red-600">*</span></label>
                <input type="text" id="reporte-aula-codigo-${i}" required placeholder="Ej: CH-GRL-01">
            </div>
            <div>
                <label class="form-label">Asistencia <span class="text-red-600">*</span></label>
                <input type="text" id="reporte-aula-asistencia-${i}" required placeholder="Ej: 18/25">
            </div>
        `;
        container.appendChild(aulaDiv);
    }
}

function abrirModalReporte() {
    // Prellenar campos automáticos
    document.getElementById('reporte-fecha-actual').value = new Date().toLocaleDateString('es-PE');
    document.getElementById('reporte-docente').value = docenteData?.nombre_completo || 'N/A';
    
    // Mes actual
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const mesActual = new Date().getMonth();
    document.getElementById('reporte-mes').value = `${meses[mesActual]} ${new Date().getFullYear()}`;
    
    // Limpiar formulario
    document.getElementById('form-reporte').reset();
    document.getElementById('reporte-error').classList.add('hidden');
    document.getElementById('reporte-aulas-container').innerHTML = '';
    
    if (signaturePad) {
        signaturePad.clear();
    }
    
    // Mostrar modal
    elements.modalReporte.classList.remove('hidden');
}

async function enviarReporte(e) {
    e.preventDefault();
    
    const btnEnviar = document.getElementById('btn-enviar-reporte');
    const errorDisplay = document.getElementById('reporte-error');
    
    // Validar firma
    if (signaturePad.isEmpty()) {
        errorDisplay.textContent = 'Debe firmar el documento';
        errorDisplay.classList.remove('hidden');
        return;
    }
    
    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Enviando...';
    errorDisplay.classList.add('hidden');
    
    try {
        // Recopilar aulas
        const cantidadAulas = parseInt(document.getElementById('reporte-cantidad-aulas').value);
        const aulas = [];
        
        for (let i = 1; i <= cantidadAulas; i++) {
            aulas.push({
                codigo: document.getElementById(`reporte-aula-codigo-${i}`).value,
                asistencia: document.getElementById(`reporte-aula-asistencia-${i}`).value
            });
        }
        
        // Obtener firma en base64
        const firmaBase64 = signaturePad.toDataURL();
        
        // Recopilar datos completos
        const formData = {
            tipo: 'reporte_mensual',
            fecha_actual: document.getElementById('reporte-fecha-actual').value,
            docente: document.getElementById('reporte-docente').value,
            mes: document.getElementById('reporte-mes').value,
            aulas: aulas,
            enlace_notas: document.getElementById('reporte-enlace-notas').value,
            materiales: document.getElementById('reporte-materiales').value || 'N/A',
            evaluaciones: document.getElementById('reporte-evaluaciones').value || 'N/A',
            participacion: document.getElementById('reporte-participacion').value || 'N/A',
            reemplazos: document.querySelector('input[name="reporte-reemplazos"]:checked').value,
            reemplazos_cantidad: document.getElementById('reporte-reemplazos-cantidad').value || '0',
            reprogramaciones: document.querySelector('input[name="reporte-reprogramaciones"]:checked').value,
            reprogramaciones_cantidad: document.getElementById('reporte-reprogramaciones-cantidad').value || '0',
            conclusiones: document.getElementById('reporte-conclusiones').value,
            recomendaciones: document.getElementById('reporte-recomendaciones').value,
            firma_base64: firmaBase64,
            timestamp: Timestamp.now()
        };
        
        // Guardar en Firestore
        await addDoc(collection(db, 'sfd_formularios_docentes', 'reportes_mensuales', 'registros'), formData);
        
        // Preparar lista de aulas para email
        const aulasTexto = aulas.map((a, i) => `${i + 1}. ${a.codigo} (${a.asistencia})`).join('\n');
        
        // Enviar email con EmailJS
        await emailjs.send(
            'service_DIFERENTE', // ⚠️ Service ID diferente según tu instrucción
            'template_reporte_mensual_docente', // ⚠️ Debes crear este template
            {
                fecha_actual: formData.fecha_actual,
                docente: formData.docente,
                mes: formData.mes,
                aulas_lista: aulasTexto,
                enlace_notas: formData.enlace_notas,
                materiales: formData.materiales,
                evaluaciones: formData.evaluaciones,
                participacion: formData.participacion,
                reemplazos: formData.reemplazos,
                reemplazos_cantidad: formData.reemplazos_cantidad,
                reprogramaciones: formData.reprogramaciones,
                reprogramaciones_cantidad: formData.reprogramaciones_cantidad,
                conclusiones: formData.conclusiones,
                recomendaciones: formData.recomendaciones,
                firma_imagen: firmaBase64
            }
        );
        
        // Cerrar modal y mostrar éxito
        elements.modalReporte.classList.add('hidden');
        alert('✅ Hemos recibido tu Reporte Mensual');
        
        console.log('✅ Reporte mensual enviado exitosamente');
        
    } catch (error) {
        console.error('Error enviando reporte:', error);
        errorDisplay.textContent = 'Error al enviar. Intenta de nuevo.';
        errorDisplay.classList.remove('hidden');
    } finally {
        btnEnviar.disabled = false;
        btnEnviar.textContent = 'Enviar Reporte';
    }
}

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================

function convertirHorario12h(hora24, periodo) {
    const [horas, minutos] = hora24.split(':');
    let horasNum = parseInt(horas);
    
    if (periodo === 'PM' && horasNum < 12) {
        horasNum += 12;
    } else if (periodo === 'AM' && horasNum === 12) {
        horasNum = 0;
    }
    
    return `${String(horasNum).padStart(2, '0')}:${minutos} ${periodo}`;
}

// ==========================================
// FUNCIONES EXISTENTES (mantener)
// ==========================================

function calcularEstadisticas(encuestas) {
    const total = encuestas.length;
    const sumaEstrellas = encuestas.reduce((acc, enc) => acc + enc.calificacion_estrellas, 0);
    const promedioGlobal = (sumaEstrellas / total).toFixed(1);
    const porAula = {};
    
    encuestas.forEach(enc => {
        const aulaId = enc.id_aula;
        if (!porAula[aulaId]) {
            porAula[aulaId] = { aula_id: aulaId, encuestas: [], total: 0, suma: 0 };
        }
        porAula[aulaId].encuestas.push(enc);
        porAula[aulaId].total += 1;
        porAula[aulaId].suma += enc.calificacion_estrellas;
    });
    
    const estadisticasPorAula = Object.values(porAula).map(aula => {
        const promedio = (aula.suma / aula.total).toFixed(1);
        const ultimaFecha = aula.encuestas[0].timestamp;
        return { aula_id: aula.aula_id, promedio: parseFloat(promedio), total: aula.total, ultima_fecha: ultimaFecha };
    });
    
    estadisticasPorAula.sort((a, b) => b.promedio - a.promedio);
    
    const comentarios = encuestas
        .filter(enc => enc.comentario && enc.comentario.trim() !== '')
        .map(enc => ({
            aula_id: enc.id_aula,
            estrellas: enc.calificacion_estrellas,
            comentario: enc.comentario,
            fecha: enc.timestamp
        }));
    
    return {
        promedio_global: parseFloat(promedioGlobal),
        total_encuestas: total,
        total_aulas: Object.keys(porAula).length,
        por_aula: estadisticasPorAula,
        comentarios: comentarios
    };
}

async function cargarNombresAulas(estadisticasAulas) {
    const aulasConNombres = [];
    for (const stat of estadisticasAulas) {
        try {
            const aulaDocRef = doc(db, 'sfd_aulas', stat.aula_id);
            const aulaSnap = await getDoc(aulaDocRef);
            const aulaNombre = aulaSnap.exists() ? aulaSnap.data().codigo_aula : 'Aula Desconocida';
            aulasConNombres.push({ ...stat, aula_codigo: aulaNombre });
        } catch (error) {
            console.error(`Error cargando aula ${stat.aula_id}:`, error);
            aulasConNombres.push({ ...stat, aula_codigo: 'Error al cargar' });
        }
    }
    return aulasConNombres;
}

async function agregarNombresAulasAComentarios(comentarios) {
    const comentariosConNombres = [];
    for (const com of comentarios) {
        try {
            const aulaDocRef = doc(db, 'sfd_aulas', com.aula_id);
            const aulaSnap = await getDoc(aulaDocRef);
            const aulaNombre = aulaSnap.exists() ? aulaSnap.data().codigo_aula : 'Aula Desconocida';
            comentariosConNombres.push({ ...com, aula_codigo: aulaNombre });
        } catch (error) {
            console.error(`Error cargando aula ${com.aula_id}:`, error);
            comentariosConNombres.push({ ...com, aula_codigo: 'Error al cargar' });
        }
    }
    return comentariosConNombres;
}

function renderMetricasPrincipales(estadisticas) {
    elements.promedioGlobal.innerHTML = `<span class="text-4xl font-bold">${estadisticas.promedio_global}</span><span class="text-lg text-gray-500">/5</span>`;
    elements.totalEncuestas.textContent = estadisticas.total_encuestas;
    elements.totalAulas.textContent = estadisticas.total_aulas;
}

function renderTablaAulas(aulasConNombres) {
    if (aulasConNombres.length === 0) {
        elements.aulasTableContainer.innerHTML = '<p class="text-center text-gray-500 py-4">No hay datos disponibles.</p>';
        return;
    }
    
    let tableHtml = `<table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-50"><tr>
        <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Aula</th>
        <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Promedio</th>
        <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Total Encuestas</th>
        <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Última Evaluación</th>
    </tr></thead><tbody class="divide-y divide-gray-200 bg-white">`;
    
    aulasConNombres.forEach(aula => {
        const estrellas = renderEstrellas(aula.promedio);
        const fechaFormateada = formatFechaPeru(aula.ultima_fecha);
        tableHtml += `<tr>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${aula.aula_codigo}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900"><div class="flex items-center">${estrellas}<span class="ml-2 font-semibold">${aula.promedio}</span></div></td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${aula.total}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${fechaFormateada}</td>
        </tr>`;
    });
    
    tableHtml += `</tbody></table>`;
    elements.aulasTableContainer.innerHTML = tableHtml;
}

function renderEstrellas(promedio) {
    const estrellasLlenas = Math.floor(promedio);
    const tieneMedia = (promedio % 1) >= 0.5;
    const estrellasVacias = 5 - estrellasLlenas - (tieneMedia ? 1 : 0);
    let html = '<div class="flex items-center">';
    for (let i = 0; i < estrellasLlenas; i++) {
        html += `<svg class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>`;
    }
    if (tieneMedia) {
        html += `<svg class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" opacity="0.5"/></svg>`;
    }
    for (let i = 0; i < estrellasVacias; i++) {
        html += `<svg class="w-5 h-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>`;
    }
    html += '</div>';
    return html;
}

function inicializarFiltros(estadisticas, comentarios) {
    todasLasEstadisticas = estadisticas;
    todosLosComentarios = comentarios;
    const aulasUnicas = [...new Set(estadisticas.map(e => e.aula_codigo))].sort();
    const optionsHtml = '<option value="">Todas las aulas</option>' + aulasUnicas.map(aula => `<option value="${aula}">${aula}</option>`).join('');
    elements.filtroAula.innerHTML = optionsHtml;
    elements.filtroAulaComentarios.innerHTML = optionsHtml;
    elements.filtroAula.addEventListener('change', aplicarFiltroTabla);
    elements.filtroFechaComentarios.addEventListener('change', aplicarFiltrosComentarios);
    elements.filtroAulaComentarios.addEventListener('change', aplicarFiltrosComentarios);
    elements.resetFiltrosComentarios.addEventListener('click', resetearFiltrosComentarios);
    elements.pagAnterior.addEventListener('click', () => cambiarPagina(-1));
    elements.pagSiguiente.addEventListener('click', () => cambiarPagina(1));
}

let todasLasEstadisticas = [];

function aplicarFiltroTabla() {
    const aulaSeleccionada = elements.filtroAula.value;
    const estadisticasFiltradas = aulaSeleccionada ? todasLasEstadisticas.filter(e => e.aula_codigo === aulaSeleccionada) : todasLasEstadisticas;
    renderTablaAulas(estadisticasFiltradas);
}

function aplicarFiltrosComentarios() {
    const fechaSeleccionada = elements.filtroFechaComentarios.value;
    const aulaSeleccionada = elements.filtroAulaComentarios.value;
    let comentariosFiltrados = [...todosLosComentarios];
    if (fechaSeleccionada) {
        const fechaObj = new Date(fechaSeleccionada + 'T00:00:00-05:00');
        comentariosFiltrados = comentariosFiltrados.filter(c => {
            const fechaComentario = c.fecha.toDate();
            return fechaComentario.toDateString() === fechaObj.toDateString();
        });
    }
    if (aulaSeleccionada) {
        comentariosFiltrados = comentariosFiltrados.filter(c => c.aula_codigo === aulaSeleccionada);
    }
    renderComentariosPaginados(comentariosFiltrados, 1);
}

function resetearFiltrosComentarios() {
    elements.filtroFechaComentarios.value = '';
    elements.filtroAulaComentarios.value = '';
    renderComentariosPaginados(todosLosComentarios, 1);
}

function renderComentariosPaginados(comentarios, pagina) {
    comentariosMostrados = comentarios;
    paginaActualNum = pagina;
    const totalComentarios = comentarios.length;
    const totalPaginas = Math.ceil(totalComentarios / COMENTARIOS_POR_PAGINA);
    if (totalComentarios === 0) {
        elements.comentariosContainer.innerHTML = '<p class="text-center text-gray-500 py-4">No hay comentarios disponibles.</p>';
        elements.paginacionContainer.classList.add('hidden');
        return;
    }
    const inicio = (pagina - 1) * COMENTARIOS_POR_PAGINA;
    const fin = Math.min(inicio + COMENTARIOS_POR_PAGINA, totalComentarios);
    const comentariosPagina = comentarios.slice(inicio, fin);
    let comentariosHtml = '';
    comentariosPagina.forEach(com => {
        const estrellas = renderEstrellas(com.estrellas);
        const fechaFormateada = formatFechaPeru(com.fecha);
        const aulaNombre = com.aula_codigo || 'Aula Desconocida';
        comentariosHtml += `<div class="bg-gray-50 rounded-lg p-4 border border-gray-200"><div class="flex items-center justify-between mb-2"><div class="flex items-center space-x-4"><span class="text-sm font-medium text-gray-700">🏫 ${aulaNombre}</span><div class="flex items-center">${estrellas}</div></div><span class="text-xs text-gray-500">📅 ${fechaFormateada}</span></div><p class="text-sm text-gray-800">"${com.comentario}"</p></div>`;
    });
    elements.comentariosContainer.innerHTML = comentariosHtml;
    elements.comentariosInicio.textContent = inicio + 1;
    elements.comentariosFin.textContent = fin;
    elements.comentariosTotal.textContent = totalComentarios;
    elements.paginaActual.textContent = `Página ${pagina} de ${totalPaginas}`;
    elements.pagAnterior.disabled = pagina === 1;
    elements.pagSiguiente.disabled = pagina === totalPaginas;
    elements.paginacionContainer.classList.remove('hidden');
}

function cambiarPagina(direccion) {
    const nuevaPagina = paginaActualNum + direccion;
    renderComentariosPaginados(comentariosMostrados, nuevaPagina);
}

async function mostrarSinDatos(user) {
    await cargarNombreDocente(user.uid);
    document.body.classList.remove('loading');
    elements.promedioGlobal.textContent = '-';
    elements.totalEncuestas.textContent = '0';
    elements.totalAulas.textContent = '0';
    elements.aulasTableContainer.innerHTML = '<div class="text-center py-12"><p class="text-gray-500 text-lg mb-2">Aún no has recibido evaluaciones</p><p class="text-gray-400 text-sm">Cuando tus alumnos completen encuestas, aparecerán aquí</p></div>';
    elements.comentariosContainer.innerHTML = '<div class="text-center py-12"><p class="text-gray-500">No hay comentarios disponibles</p></div>';
}

function mostrarError(mensaje) {
    document.body.classList.remove('loading');
    const errorHtml = `<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"><div class="bg-red-50 border-l-4 border-red-400 p-4 rounded-lg"><div class="flex"><div class="flex-shrink-0"><svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" /></svg></div><div class="ml-3"><h3 class="text-sm font-medium text-red-800">Error al cargar el dashboard</h3><p class="text-sm text-red-700 mt-2">${mensaje}</p><p class="text-sm text-red-600 mt-2">Por favor, contacta al administrador del sistema.</p></div></div></div></div>`;
    document.querySelector('main').innerHTML = errorHtml;
}

async function cargarNombreDocente(uid) {
    try {
        const userDocRef = doc(db, 'sfd_usuarios', uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const docenteId = userData.docente_id;
            if (docenteId) {
                const docenteDocRef = doc(db, 'sfd_docentes', docenteId);
                const docenteDocSnap = await getDoc(docenteDocRef);
                if (docenteDocSnap.exists()) {
                    const docenteData = docenteDocSnap.data();
                    elements.userNameDisplay.textContent = docenteData.nombre_completo || 'Docente';
                    return;
                }
            }
        }
        elements.userNameDisplay.textContent = 'Docente';
    } catch (error) {
        console.error('Error cargando nombre:', error);
        elements.userNameDisplay.textContent = 'Docente';
    }
}