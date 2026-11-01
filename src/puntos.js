// ============================================================
// JL Studio - Prueba de Dos Puntos
// puntos.js
//
// Guarda hasta dos puntos marcados en el suelo y calcula la
// distancia entre ellos.
//
// Solo hace cálculos: no usa Three.js, ni WebXR, ni la pantalla.
// Las coordenadas están en metros. El eje Y es la altura
// (en el espacio local-floor de WebXR, Y = 0 es el suelo).
// ============================================================

// Máximo de puntos que se guardan.
const MAXIMO_PUNTOS = 2;

// Lista de puntos marcados. Cada punto es { x, y, z }.
let puntos = [];

/**
 * Comprueba que el punto tenga tres números válidos.
 * @param {*} punto
 * @returns {boolean}
 */
function esPuntoValido(punto) {
    return !!punto
        && Number.isFinite(punto.x)
        && Number.isFinite(punto.y)
        && Number.isFinite(punto.z);
}

/**
 * Guarda un punto nuevo (se guarda una copia).
 * @param {{x: number, y: number, z: number}} punto
 * @returns {number} El número del punto guardado (1 o 2),
 *                   o 0 si no se pudo guardar.
 */
export function marcarPunto(punto) {
    if (!esPuntoValido(punto)) {
        console.warn('[puntos] Punto no válido, no se guarda.');
        return 0;
    }
    if (puntos.length >= MAXIMO_PUNTOS) {
        return 0;
    }
    puntos.push({ x: punto.x, y: punto.y, z: punto.z });
    return puntos.length;
}

/**
 * Borra todos los puntos.
 */
export function reiniciarPuntos() {
    puntos = [];
}

/**
 * Cantidad de puntos marcados (0, 1 o 2).
 * @returns {number}
 */
export function cantidadPuntos() {
    return puntos.length;
}

/**
 * Devuelve una copia de los puntos marcados.
 * @returns {Array<{x: number, y: number, z: number}>}
 */
export function obtenerPuntos() {
    return puntos.map((p) => ({ x: p.x, y: p.y, z: p.z }));
}

/**
 * Calcula la distancia entre los dos puntos.
 *  - total: en línea recta (incluye la diferencia de altura).
 *  - horizontal: solo sobre el suelo (ignora la altura).
 *  - diferenciaAltura: cuánto sube o baja un punto respecto al otro.
 *
 * @returns {{total: number, horizontal: number, diferenciaAltura: number}|null}
 *          null si todavía no hay dos puntos.
 */
export function calcularDistancia() {
    if (puntos.length < MAXIMO_PUNTOS) {
        return null;
    }
    const a = puntos[0];
    const b = puntos[1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;

    return {
        total: Math.sqrt(dx * dx + dy * dy + dz * dz),
        horizontal: Math.sqrt(dx * dx + dz * dz),
        diferenciaAltura: Math.abs(dy),
    };
}

/**
 * Texto del botón principal según cuántos puntos hay.
 * @returns {string}
 */
export function textoBotonMarcar() {
    if (puntos.length === 0) return 'Marcar punto 1';
    if (puntos.length === 1) return 'Marcar punto 2';
    return 'Puntos marcados';
}

/**
 * Formatea metros con dos decimales (centímetros).
 * @param {number} metros
 * @returns {string}
 */
export function formatearMetros(metros) {
    return `${metros.toFixed(2)} m`;
}

/**
 * Formatea un punto para mostrarlo en pantalla.
 * @param {{x: number, y: number, z: number}} punto
 * @returns {string}
 */
export function formatearPunto(punto) {
    return `x ${punto.x.toFixed(2)}  y ${punto.y.toFixed(2)}  z ${punto.z.toFixed(2)}`;
}