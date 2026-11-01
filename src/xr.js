// ============================================================
// JL Studio - Prueba de Dos Puntos
// xr.js
//
// Todo lo de WebXR que NO depende de Three.js:
//   - Interruptor por URL para probar el workaround de capas.
//   - Diagnóstico (navegador, soporte de AR, tipo de capa, overlay).
//   - Opciones de la sesión de AR.
//   - Lectura del suelo con hit-test.
//
// IMPORTANTE: este archivo aplica el workaround al cargarse, así que
// main.js debe importarlo ANTES que Three.js.
//
// Interruptor (se escribe al final de la dirección):
//   (nada) o ?workaround=ninguno  -> no cambia nada (línea base)
//   ?workaround=projection        -> oculta XRWebGLBinding.prototype.createProjectionLayer
//   ?workaround=layers            -> oculta XRRenderState.prototype.layers
//
// NO usa GPS, brújula ni cámara directamente.
// ============================================================

const MODOS_WORKAROUND = ['ninguno', 'projection', 'layers'];

/**
 * Lee el modo del workaround desde la dirección (?workaround=...).
 * @returns {'ninguno'|'projection'|'layers'}
 */
export function leerModoWorkaround() {
    const valor = new URLSearchParams(window.location.search).get('workaround');
    return MODOS_WORKAROUND.includes(valor) ? valor : 'ninguno';
}

/**
 * Oculta una propiedad de un prototipo y comprueba si quedó oculta.
 * @param {object|null} prototipo
 * @param {string} nombre
 * @returns {string} Resultado en español.
 */
function ocultarPropiedad(prototipo, nombre) {
    if (!prototipo) {
        return 'el objeto no existe en este navegador';
    }
    const descriptor = Object.getOwnPropertyDescriptor(prototipo, nombre);
    if (!descriptor) {
        return 'la propiedad no existe';
    }
    if (!descriptor.configurable) {
        return 'no se puede ocultar';
    }
    try {
        delete prototipo[nombre];
    } catch (e) {
        console.warn('[xr] Error al ocultar', nombre, e);
        return 'error al ocultar';
    }
    return (nombre in prototipo) ? 'no se ocultó' : 'ocultada';
}

/**
 * Aplica el workaround según el modo.
 * @param {string} modo
 * @returns {{modo: string, detalle: string}}
 */
function aplicarWorkaround(modo) {
    if (modo === 'projection') {
        const prototipo = (typeof XRWebGLBinding !== 'undefined')
            ? XRWebGLBinding.prototype
            : null;
        return {
            modo,
            detalle: 'createProjectionLayer: ' + ocultarPropiedad(prototipo, 'createProjectionLayer'),
        };
    }

    if (modo === 'layers') {
        const prototipo = (typeof XRRenderState !== 'undefined')
            ? XRRenderState.prototype
            : null;
        return {
            modo,
            detalle: 'layers: ' + ocultarPropiedad(prototipo, 'layers'),
        };
    }

    return { modo, detalle: 'sin cambios' };
}

// Se aplica UNA sola vez, al cargar este archivo.
const resultadoWorkaround = aplicarWorkaround(leerModoWorkaround());

/**
 * Texto para mostrar en el diagnóstico.
 * @returns {string}
 */
export function obtenerResultadoWorkaround() {
    return `${resultadoWorkaround.modo} (${resultadoWorkaround.detalle})`;
}

// ------------------------------------------------------------
// Diagnóstico del navegador.
// ------------------------------------------------------------

/**
 * Lee el navegador a partir del texto que él mismo declara.
 * NOTA: son pistas, no datos seguros. Chrome puede mostrar solo el
 * número principal de versión. La marca "; wv)" suele indicar un
 * navegador interno de una app (no verificado en esta sesión).
 *
 * @returns {{nombre: string, version: string, versionPrincipal: number|null,
 *            posibleInterno: boolean, texto: string}}
 */
export function leerNavegador() {
    const ua = navigator.userAgent || '';
    let nombre = 'Desconocido';
    let version = '';
    let coincidencia = null;

    if ((coincidencia = ua.match(/SamsungBrowser\/([\d.]+)/))) {
        nombre = 'Samsung Internet';
        version = coincidencia[1];
    } else if ((coincidencia = ua.match(/EdgA\/([\d.]+)/))) {
        nombre = 'Edge';
        version = coincidencia[1];
    } else if ((coincidencia = ua.match(/OPR\/([\d.]+)/))) {
        nombre = 'Opera';
        version = coincidencia[1];
    } else if ((coincidencia = ua.match(/Firefox\/([\d.]+)/))) {
        nombre = 'Firefox';
        version = coincidencia[1];
    } else if ((coincidencia = ua.match(/Chrome\/([\d.]+)/))) {
        nombre = 'Chrome';
        version = coincidencia[1];
    }

    const posibleInterno = /; wv\)/.test(ua);
    const principal = version ? parseInt(version.split('.')[0], 10) : NaN;
    const versionPrincipal = Number.isFinite(principal) ? principal : null;

    let texto = version ? `${nombre} ${version}` : nombre;
    if (posibleInterno) {
        texto += ' (posible navegador interno de una app)';
    }

    return { nombre, version, versionPrincipal, posibleInterno, texto };
}

/**
 * Pregunta al navegador si soporta AR con WebXR.
 * @returns {Promise<'si'|'no'|'sin-webxr'|'error'>}
 */
export async function comprobarSoporteAR() {
    if (!('xr' in navigator)) {
        return 'sin-webxr';
    }
    try {
        const soportado = await navigator.xr.isSessionSupported('immersive-ar');
        return soportado ? 'si' : 'no';
    } catch (e) {
        console.warn('[xr] Error al comprobar soporte de AR:', e);
        return 'error';
    }
}

/**
 * Dice qué tipo de capa de dibujo está usando la sesión.
 * - baseLayer con valor  -> XRWebGLLayer (camino clásico)
 * - baseLayer vacío y layers con elementos -> XRProjectionLayer
 * @param {XRSession} sesion
 * @returns {string}
 */
export function describirCapa(sesion) {
    try {
        const estado = sesion && sesion.renderState;
        if (!estado) {
            return 'No determinada';
        }
        if (estado.baseLayer) {
            return 'XRWebGLLayer (clásica)';
        }
        if (estado.layers && estado.layers.length > 0) {
            return 'XRProjectionLayer (capas)';
        }
        return 'No determinada';
    } catch (e) {
        console.warn('[xr] Error al leer la capa:', e);
        return 'Error al leer';
    }
}

/**
 * Dice si el DOM Overlay quedó activo en la sesión.
 * @param {XRSession} sesion
 * @returns {string}
 */
export function describirOverlay(sesion) {
    try {
        if (sesion && sesion.domOverlayState) {
            return `Activo (${sesion.domOverlayState.type})`;
        }
        return 'No activo';
    } catch (e) {
        console.warn('[xr] Error al leer el overlay:', e);
        return 'Error al leer';
    }
}

// ------------------------------------------------------------
// Sesión de AR.
// ------------------------------------------------------------

/**
 * Opciones para iniciar la sesión de AR.
 * hit-test es obligatorio; el DOM Overlay es opcional.
 * @param {HTMLElement} raizOverlay  Elemento que se verá encima de la cámara.
 * @returns {object}
 */
export function crearOpcionesDeSesion(raizOverlay) {
    return {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'dom-overlay-for-handheld-ar'],
        domOverlay: { root: raizOverlay },
    };
}

// ------------------------------------------------------------
// Hit-test: leer el punto del suelo que está en el centro de la pantalla.
// ------------------------------------------------------------

/**
 * Crea la fuente de hit-test, que sigue lo que mira el teléfono.
 * @param {XRSession} sesion
 * @returns {Promise<XRHitTestSource>}
 */
export async function crearFuenteHitTest(sesion) {
    const espacioVisor = await sesion.requestReferenceSpace('viewer');
    return sesion.requestHitTestSource({ space: espacioVisor });
}

/**
 * Libera la fuente de hit-test.
 * @param {XRHitTestSource|null} fuente
 */
export function liberarFuenteHitTest(fuente) {
    if (fuente && typeof fuente.cancel === 'function') {
        fuente.cancel();
    }
}

/**
 * Lee el punto del suelo en este cuadro.
 *
 * @param {XRFrame} cuadro
 * @param {XRHitTestSource} fuente
 * @param {XRReferenceSpace} espacioReferencia  El mismo espacio con que se dibuja.
 * @returns {{x: number, y: number, z: number, matriz: Float32Array}|null}
 *          Posición en metros, o null si no hay suelo detectado.
 */
export function leerPuntoDeSuelo(cuadro, fuente, espacioReferencia) {
    if (!cuadro || !fuente || !espacioReferencia) {
        return null;
    }

    const resultados = cuadro.getHitTestResults(fuente);
    if (resultados.length === 0) {
        return null;
    }

    const pose = resultados[0].getPose(espacioReferencia);
    if (!pose) {
        return null;
    }

    const m = pose.transform.matrix;
    return { x: m[12], y: m[13], z: m[14], matriz: m };
}