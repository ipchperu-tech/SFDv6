/**
 * js/widget-docente.js
 * ✅ V2.0: Widget Mejorado con Tendencias, Insignias y Certificación
 */

// --- Importaciones de Firebase ---
import { db } from './firebase-config.js';

import { 
    doc, 
    getDoc,
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Configuración de Caché ---
const CACHE_DURACION_MS = 4 * 60 * 60 * 1000; // 4 horas
const CACHE_KEY_PREFIX = 'widget_docente_';

// --- Elementos del DOM ---
const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const notFoundState = document.getElementById('not-found-state');
const widgetContent = document.getElementById('widget-content');

const docenteNombre = document.getElementById('docente-nombre');
const docentePromedio = document.getElementById('docente-promedio');
const docenteEstrellas = document.getElementById('docente-estrellas');
const docenteEvaluaciones = document.getElementById('docente-evaluaciones');

// ✅ NUEVO: Elementos adicionales
const badgeCertificacion = document.getElementById('badge-certificacion');
const seccionTendencia = document.getElementById('seccion-tendencia');
const badgeTendencia = document.getElementById('badge-tendencia');
const iconoTendencia = document.getElementById('icono-tendencia');
const textoTendencia = document.getElementById('texto-tendencia');
const seccionInsignias = document.getElementById('seccion-insignias');

/**
 * Punto de entrada principal
 */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const docenteId = urlParams.get('docente');
        
        if (!docenteId) {
            throw new Error('No se proporcionó ID de docente en la URL');
        }
        
        console.log(`📊 Cargando widget mejorado para docente: ${docenteId}`);
        
        await cargarWidget(docenteId);
        
    } catch (error) {
        console.error('❌ Error al inicializar widget:', error);
        mostrarError();
    }
});

/**
 * ✅ NUEVO: Obtiene datos del caché si están frescos
 */
function obtenerDeCache(docenteId) {
    try {
        const cacheKey = CACHE_KEY_PREFIX + docenteId;
        const cached = localStorage.getItem(cacheKey);
        
        if (!cached) return null;
        
        const data = JSON.parse(cached);
        const ahora = Date.now();
        
        // Verificar si el caché expiró
        if (ahora - data.timestamp > CACHE_DURACION_MS) {
            localStorage.removeItem(cacheKey);
            return null;
        }
        
        console.log('✅ Datos cargados desde caché');
        return data;
        
    } catch (error) {
        console.error('Error leyendo caché:', error);
        return null;
    }
}

/**
 * ✅ NUEVO: Guarda datos en caché
 */
function guardarEnCache(docenteId, datos) {
    try {
        const cacheKey = CACHE_KEY_PREFIX + docenteId;
        const cacheData = {
            ...datos,
            timestamp: Date.now()
        };
        
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        console.log('✅ Datos guardados en caché');
        
    } catch (error) {
        console.error('Error guardando caché:', error);
    }
}

async function cargarWidget(docenteId) {
    try {
        // ✅ PASO 1: Intentar cargar desde caché
        const cached = obtenerDeCache(docenteId);
        
        if (cached) {
            // Renderizar con datos cacheados
            renderizarWidget(
                cached.nombre,
                cached.certificado,
                cached.promedio,
                cached.totalEvaluaciones,
                cached.evaluaciones,
                cached.tendencia,
                cached.insignias
            );
            
            // Mostrar última actualización
            mostrarUltimaActualizacion(cached.timestamp);
            return;
        }
        
        // ✅ PASO 2: Si no hay caché, consultar Firestore
        console.log('📡 Consultando Firestore...');
        
        const docenteDocRef = doc(db, 'sfd_docentes', docenteId);
        const docenteSnap = await getDoc(docenteDocRef);
        
        if (!docenteSnap.exists()) {
            console.warn('⚠️ Docente no encontrado');
            mostrarNoEncontrado();
            return;
        }
        
        const docenteData = docenteSnap.data();
        const nombreCompleto = docenteData.nombre_completo || 'Docente';
        const certificado = docenteData.certificado_ipch === true;
        
        console.log(`✅ Docente: ${nombreCompleto} | Certificado: ${certificado}`);
        
        const encuestasRef = collection(db, 'sfd_encuestas_respuestas');
        const q = query(encuestasRef, where('id_docente', '==', docenteId));
        const encuestasSnap = await getDocs(q);
        
        if (encuestasSnap.empty) {
            console.log('ℹ️ Sin evaluaciones aún');
            
            const datosVacios = {
                nombre: nombreCompleto,
                certificado: certificado,
                promedio: 0,
                totalEvaluaciones: 0,
                evaluaciones: [],
                tendencia: null,
                insignias: []
            };
            
            guardarEnCache(docenteId, datosVacios);
            renderizarWidget(nombreCompleto, certificado, 0, 0, [], null, []);
            mostrarUltimaActualizacion(Date.now());
            return;
        }
        
        const evaluaciones = [];
        encuestasSnap.forEach(doc => {
            const encuesta = doc.data();
            if (encuesta.calificacion_estrellas && encuesta.timestamp) {
                evaluaciones.push({
                    estrellas: encuesta.calificacion_estrellas,
                    fecha: encuesta.timestamp.toDate()
                });
            }
        });
        
        if (evaluaciones.length === 0) {
            const datosVacios = {
                nombre: nombreCompleto,
                certificado: certificado,
                promedio: 0,
                totalEvaluaciones: 0,
                evaluaciones: [],
                tendencia: null,
                insignias: []
            };
            
            guardarEnCache(docenteId, datosVacios);
            renderizarWidget(nombreCompleto, certificado, 0, 0, [], null, []);
            mostrarUltimaActualizacion(Date.now());
            return;
        }
        
        evaluaciones.sort((a, b) => b.fecha - a.fecha);
        
        const promedio = calcularPromedio(evaluaciones);
        const tendencia = calcularTendencia(evaluaciones);
        const insignias = await calcularInsignias(docenteId, evaluaciones, promedio);
        
        console.log(`✅ Promedio: ${promedio.toFixed(1)} | Tendencia: ${tendencia?.cambio || 'N/A'} | Insignias: ${insignias.length}`);
        
        // ✅ PASO 3: Guardar en caché
        const datosParaCache = {
            nombre: nombreCompleto,
            certificado: certificado,
            promedio: promedio,
            totalEvaluaciones: evaluaciones.length,
            evaluaciones: evaluaciones,
            tendencia: tendencia,
            insignias: insignias
        };
        
        guardarEnCache(docenteId, datosParaCache);
        
        // ✅ PASO 4: Renderizar
        renderizarWidget(nombreCompleto, certificado, promedio, evaluaciones.length, evaluaciones, tendencia, insignias);
        mostrarUltimaActualizacion(Date.now());
        
    } catch (error) {
        console.error('❌ Error al cargar datos:', error);
        mostrarError();
    }
}

/**
 * ✅ NUEVO: Calcula el promedio general
 */
function calcularPromedio(evaluaciones) {
    const suma = evaluaciones.reduce((acc, ev) => acc + ev.estrellas, 0);
    return suma / evaluaciones.length;
}

/**
 * ✅ NUEVO: Calcula la tendencia mensual
 */
function calcularTendencia(evaluaciones) {
    if (evaluaciones.length < 5) return null; // Mínimo 5 evaluaciones
    
    const ahora = new Date();
    const hace30Dias = new Date(ahora.getTime() - (30 * 24 * 60 * 60 * 1000));
    const hace60Dias = new Date(ahora.getTime() - (60 * 24 * 60 * 60 * 1000));
    
    // Filtrar evaluaciones
    const ultimoMes = evaluaciones.filter(ev => ev.fecha >= hace30Dias);
    const mesAnterior = evaluaciones.filter(ev => ev.fecha >= hace60Dias && ev.fecha < hace30Dias);
    
    if (ultimoMes.length === 0 || mesAnterior.length === 0) return null;
    
    const promedioUltimoMes = calcularPromedio(ultimoMes);
    const promedioMesAnterior = calcularPromedio(mesAnterior);
    
    const cambio = promedioUltimoMes - promedioMesAnterior;
    
    let tipo, texto, icono, colorClasses;
    
    if (cambio >= 0.3) {
        tipo = 'mejora';
        texto = `+${cambio.toFixed(1)} este mes (En mejora)`;
        icono = '📈';
        colorClasses = 'bg-green-100 text-green-800 border border-green-300';
    } else if (cambio <= -0.3) {
        tipo = 'desmejora';
        texto = `${cambio.toFixed(1)} este mes (Necesita atención)`;
        icono = '📉';
        colorClasses = 'bg-orange-100 text-orange-800 border border-orange-300';
    } else {
        tipo = 'estable';
        texto = `Estable este mes`;
        icono = '📊';
        colorClasses = 'bg-blue-100 text-blue-800 border border-blue-300';
    }
    
    return { tipo, texto, icono, colorClasses, cambio };
}

/**
 * ✅ NUEVO: Calcula insignias de desempeño
 */
async function calcularInsignias(docenteId, evaluaciones, promedio) {
    const insignias = [];
    
    // 1. 🏆 Top 5 IPCH (requiere consulta)
    try {
        const ranking = await calcularRanking(docenteId, promedio);
        if (ranking <= 5) {
            insignias.push({
                id: 'top5',
                texto: '🏆 Top 5 Lăoshī',
                color: 'bg-yellow-100 text-yellow-800 border-yellow-300'
            });
        } else if (ranking <= 10) {
            insignias.push({
                id: 'top10',
                texto: '🏆 Top 10 Lăoshī',
                color: 'bg-yellow-50 text-yellow-700 border-yellow-200'
            });
        }
    } catch (error) {
        console.warn('No se pudo calcular ranking:', error);
    }
    
    // 2. ⭐ Excelencia (Promedio ≥ 4.5)
    if (promedio >= 4.5) {
        insignias.push({
            id: 'excelencia',
            texto: '⭐ Excelencia',
            color: 'bg-purple-100 text-purple-800 border-purple-300'
        });
    }
    
    // 3. 📚 Veterano (Más de 100 evaluaciones)
    if (evaluaciones.length >= 100) {
        insignias.push({
            id: 'veterano',
            texto: '📚 Veterano',
            color: 'bg-indigo-100 text-indigo-800 border-indigo-300'
        });
    }
    
    // 4. 🚀 En Ascenso (Tendencia > +0.5)
    const tendencia = calcularTendencia(evaluaciones);
    if (tendencia && tendencia.cambio >= 0.5) {
        insignias.push({
            id: 'ascenso',
            texto: '🚀 En Ascenso',
            color: 'bg-green-100 text-green-800 border-green-300'
        });
    }
    
    // 5. 🎯 Consistente (Desviación estándar < 0.5)
    const desviacion = calcularDesviacionEstandar(evaluaciones);
    if (desviacion < 0.5) {
        insignias.push({
            id: 'consistente',
            texto: '🎯 Consistente',
            color: 'bg-cyan-100 text-cyan-800 border-cyan-300'
        });
    }
    
    // 6. 💎 Platino (4.8+ por 6 meses consecutivos)
    if (esDocentePlatino(evaluaciones, promedio)) {
        insignias.push({
            id: 'platino',
            texto: '💎 Platino',
            color: 'bg-gray-100 text-gray-800 border-gray-300'
        });
    }
    
    return insignias;
}

/**
 * ✅ NUEVO: Calcula el ranking del docente
 */
async function calcularRanking(docenteId, promedioActual) {
    try {
        // Obtener todos los docentes con sus evaluaciones
        const docentesRef = collection(db, 'sfd_docentes');
        const docentesSnap = await getDocs(docentesRef);
        
        const promedios = [];
        
        for (const docenteDoc of docentesSnap.docs) {
            const id = docenteDoc.id;
            
            // Obtener evaluaciones del docente
            const encuestasRef = collection(db, 'sfd_encuestas_respuestas');
            const q = query(encuestasRef, where('id_docente', '==', id));
            const encuestasSnap = await getDocs(q);
            
            if (!encuestasSnap.empty) {
                const evaluaciones = [];
                encuestasSnap.forEach(doc => {
                    const encuesta = doc.data();
                    if (encuesta.calificacion_estrellas) {
                        evaluaciones.push(encuesta.calificacion_estrellas);
                    }
                });
                
                if (evaluaciones.length > 0) {
                    const suma = evaluaciones.reduce((acc, val) => acc + val, 0);
                    const promedio = suma / evaluaciones.length;
                    promedios.push({ id, promedio });
                }
            }
        }
        
        // Ordenar por promedio descendente
        promedios.sort((a, b) => b.promedio - a.promedio);
        
        // Encontrar posición
        const posicion = promedios.findIndex(d => d.id === docenteId) + 1;
        
        return posicion || 999;
        
    } catch (error) {
        console.error('Error calculando ranking:', error);
        return 999;
    }
}

/**
 * ✅ NUEVO: Calcula la desviación estándar
 */
function calcularDesviacionEstandar(evaluaciones) {
    const promedio = calcularPromedio(evaluaciones);
    const varianza = evaluaciones.reduce((acc, ev) => {
        return acc + Math.pow(ev.estrellas - promedio, 2);
    }, 0) / evaluaciones.length;
    
    return Math.sqrt(varianza);
}

/**
 * ✅ NUEVO: Verifica si es Docente Platino
 */
function esDocentePlatino(evaluaciones, promedioGeneral) {
    if (promedioGeneral < 4.8) return false;
    
    const ahora = new Date();
    const hace6Meses = new Date(ahora.getTime() - (180 * 24 * 60 * 60 * 1000));
    
    const evaluacionesRecientes = evaluaciones.filter(ev => ev.fecha >= hace6Meses);
    
    if (evaluacionesRecientes.length < 10) return false; // Mínimo 10 evaluaciones
    
    const promedioReciente = calcularPromedio(evaluacionesRecientes);
    
    return promedioReciente >= 4.8;
}

/**
 * ✅ MEJORADO: Renderiza el widget completo
 */
function renderizarWidget(nombre, certificado, promedio, totalEvaluaciones, evaluaciones, tendencia, insignias) {
    // 1. Nombre
    docenteNombre.textContent = nombre;
    
    // 2. Certificación IPCH
    if (certificado) {
        badgeCertificacion.classList.remove('hidden');
    }
    
    // 3. Promedio y estrellas
    if (totalEvaluaciones > 0) {
        docentePromedio.textContent = promedio.toFixed(1);
        docenteEstrellas.innerHTML = generarEstrellas(promedio);
    } else {
        docentePromedio.textContent = '—';
        docenteEstrellas.innerHTML = '';
    }
    
    // 4. Cantidad de evaluaciones
    if (totalEvaluaciones === 0) {
        docenteEvaluaciones.textContent = 'Sin evaluaciones aún';
    } else if (totalEvaluaciones === 1) {
        docenteEvaluaciones.textContent = '1 evaluación';
    } else {
        docenteEvaluaciones.textContent = `${totalEvaluaciones} evaluaciones`;
    }
    
    // 5. Tendencia
    if (tendencia) {
        seccionTendencia.classList.remove('hidden');
        badgeTendencia.className = `inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium ${tendencia.colorClasses}`;
        iconoTendencia.textContent = tendencia.icono;
        textoTendencia.textContent = tendencia.texto;
    }
    
    // 6. Insignias
    if (insignias.length > 0) {
        seccionInsignias.classList.remove('hidden');
        seccionInsignias.innerHTML = insignias.map(insignia => `
            <span class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${insignia.color} border">
                ${insignia.texto}
            </span>
        `).join('');
    }
    
    // Mostrar widget
    loadingState.classList.add('hidden');
    widgetContent.classList.remove('hidden');
}

/**
 * Genera HTML de estrellas según el promedio
 */
function generarEstrellas(promedio) {
    const estrellasLlenas = Math.floor(promedio);
    const tieneMedia = (promedio % 1) >= 0.5;
    const estrellasVacias = 5 - estrellasLlenas - (tieneMedia ? 1 : 0);
    
    let html = '';
    
    // Estrellas llenas
    for (let i = 0; i < estrellasLlenas; i++) {
        html += `
            <svg class="w-7 h-7 star-filled" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
            </svg>
        `;
    }
    
    // Media estrella
    if (tieneMedia) {
        html += `
            <svg class="w-7 h-7 star-filled" fill="currentColor" viewBox="0 0 20 20">
                <defs>
                    <linearGradient id="half-star">
                        <stop offset="50%" stop-color="currentColor"/>
                        <stop offset="50%" stop-color="#E0E0E0"/>
                    </linearGradient>
                </defs>
                <path fill="url(#half-star)" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
            </svg>
        `;
    }
    
    // Estrellas vacías
    for (let i = 0; i < estrellasVacias; i++) {
        html += `
            <svg class="w-7 h-7 star-empty" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
            </svg>
        `;
    }
    
    return html;
}

/**
 * Muestra estado de error
 */
function mostrarError() {
    loadingState.classList.add('hidden');
    errorState.classList.remove('hidden');
}

/**
 * Muestra estado de no encontrado
 */
function mostrarNoEncontrado() {
    loadingState.classList.add('hidden');
    notFoundState.classList.remove('hidden');
}

/**
 * ✅ NUEVO: Muestra cuándo se actualizaron los datos
 */
function mostrarUltimaActualizacion(timestamp) {
    const ahora = Date.now();
    const diferencia = ahora - timestamp;
    
    let texto;
    
    if (diferencia < 60000) { // Menos de 1 minuto
        texto = 'Actualizado ahora';
    } else if (diferencia < 3600000) { // Menos de 1 hora
        const minutos = Math.floor(diferencia / 60000);
        texto = `Actualizado hace ${minutos} min`;
    } else if (diferencia < 86400000) { // Menos de 24 horas
        const horas = Math.floor(diferencia / 3600000);
        texto = `Actualizado hace ${horas}h`;
    } else {
        const dias = Math.floor(diferencia / 86400000);
        texto = `Actualizado hace ${dias}d`;
    }
    
    // Agregar al footer (antes del badge IPCH)
    const footer = widgetContent.querySelector('.mt-3.pt-3');
    
    if (footer && !footer.querySelector('.ultima-actualizacion')) {
        const actualizacionDiv = document.createElement('div');
        actualizacionDiv.className = 'ultima-actualizacion text-center text-xs text-gray-500 mb-2';
        actualizacionDiv.textContent = texto;
        
        footer.insertBefore(actualizacionDiv, footer.firstChild);
    }
}