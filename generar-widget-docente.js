/**
 * js/generar-widget-docente.js
 * ✅ Generador de Códigos Iframe para Widgets Individuales
 * 
 * Este script:
 * 1. Carga todos los docentes en un dropdown
 * 2. Genera código iframe único para cada docente
 * 3. Muestra vista previa del widget
 * 4. Permite copiar el código al portapapeles
 */

// --- Importaciones de Firebase ---
import { auth, db } from './firebase-config.js';
import { protectPage } from './auth-guard.js';
import {
    collection,
    query,
    getDocs,
    orderBy
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Elementos del DOM ---
let docenteSelect, previewSection, widgetPreview, codeSection;
let generatedCode, copyCodeButton, copySuccess;

// --- Estado ---
let docentesCache = new Map();

/**
 * Punto de entrada principal
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Capturar elementos del DOM
    docenteSelect = document.getElementById('docente-select');
    previewSection = document.getElementById('preview-section');
    widgetPreview = document.getElementById('widget-preview');
    codeSection = document.getElementById('code-section');
    generatedCode = document.getElementById('generated-code');
    copyCodeButton = document.getElementById('copy-code-button');
    copySuccess = document.getElementById('copy-success');
    
    try {
        // Proteger página (solo admin y calidad)
        const { user, userRole } = await protectPage(['admin', 'calidad']);
        
        // Cargar docentes
        await cargarDocentes();
        
        // Configurar listeners
        docenteSelect.addEventListener('change', handleDocenteChange);
        copyCodeButton.addEventListener('click', copiarCodigo);
        
        // Quitar loader
        document.body.classList.remove('loading');
        
    } catch (error) {
        console.error("Error de autenticación:", error);
        window.location.href = 'login.html';
    }
});

/**
 * Carga todos los docentes en el dropdown
 */
async function cargarDocentes() {
    try {
        docenteSelect.innerHTML = '<option value="">-- Cargando docentes... --</option>';
        
        const docentesRef = collection(db, 'sfd_docentes');
        const q = query(docentesRef, orderBy('nombre_completo', 'asc'));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            docenteSelect.innerHTML = '<option value="">No hay docentes registrados</option>';
            return;
        }
        
        docentesCache.clear();
        docenteSelect.innerHTML = '<option value="">-- Selecciona un docente --</option>';
        
        snapshot.forEach(doc => {
            const docente = { id: doc.id, ...doc.data() };
            docentesCache.set(doc.id, docente);
            
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = docente.nombre_completo;
            docenteSelect.appendChild(option);
        });
        
        console.log(`✅ ${docentesCache.size} docentes cargados`);
        
    } catch (error) {
        console.error("❌ Error cargando docentes:", error);
        docenteSelect.innerHTML = '<option value="">Error al cargar docentes</option>';
    }
}

/**
 * Maneja el cambio de docente seleccionado
 */
function handleDocenteChange() {
    const docenteId = docenteSelect.value;
    
    if (!docenteId) {
        // Ocultar todo si no hay selección
        previewSection.classList.add('hidden');
        codeSection.classList.add('hidden');
        copySuccess.classList.add('hidden');
        return;
    }
    
    const docente = docentesCache.get(docenteId);
    if (!docente) {
        console.error("⚠️ Docente no encontrado en caché");
        return;
    }
    
    console.log(`📊 Generando widget para: ${docente.nombre_completo}`);
    
    // Generar código iframe
    const baseUrl = window.location.origin + window.location.pathname.replace('generar-widget-docente.html', '');
    const widgetUrl = `${baseUrl}widget-docente.html?docente=${docenteId}`;
    
    const iframeCode = `<iframe src="${widgetUrl}" width="100%" height="280" frameborder="0" style="border: none; border-radius: 8px;"></iframe>`;
    
    // Actualizar vista previa
    widgetPreview.src = widgetUrl;
    previewSection.classList.remove('hidden');
    
    // Actualizar código generado
    generatedCode.textContent = iframeCode;
    codeSection.classList.remove('hidden');
    
    // Resetear estado de copiado
    copySuccess.classList.add('hidden');
    copyCodeButton.innerHTML = '<i class="fas fa-copy mr-2"></i> Copiar Código';
    copyCodeButton.classList.remove('btn-success');
    copyCodeButton.classList.add('btn-primary');
}

/**
 * Copia el código al portapapeles
 */
async function copiarCodigo() {
    try {
        const codigo = generatedCode.textContent;
        
        // Método moderno (Clipboard API)
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(codigo);
        } else {
            // Fallback para navegadores antiguos
            const textArea = document.createElement('textarea');
            textArea.value = codigo;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
        }
        
        // Mostrar feedback de éxito
        copySuccess.classList.remove('hidden');
        copyCodeButton.innerHTML = '<i class="fas fa-check mr-2"></i> ¡Copiado!';
        copyCodeButton.classList.remove('btn-primary');
        copyCodeButton.classList.add('btn-success');
        
        console.log('✅ Código copiado al portapapeles');
        
        // Resetear después de 3 segundos
        setTimeout(() => {
            copySuccess.classList.add('hidden');
            copyCodeButton.innerHTML = '<i class="fas fa-copy mr-2"></i> Copiar Código';
            copyCodeButton.classList.add('btn-primary');
            copyCodeButton.classList.remove('btn-success');
        }, 3000);
        
    } catch (error) {
        console.error('❌ Error al copiar código:', error);
        alert('Error al copiar el código. Por favor, cópialo manualmente.');
    }
}