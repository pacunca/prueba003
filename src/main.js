// ============================================================
// JL Studio - Prueba de Dos Puntos
// main.js
//
// Conecta la pantalla (index.html), WebXR (xr.js), los puntos
// (puntos.js) y Three.js.
//
// Qué hace: inicia la AR, muestra una mira en el suelo y deja
// marcar dos puntos con un botón. Muestra la distancia medida
// para compararla con una cinta métrica. NO dibuja una casa.
//
// ORDEN DE IMPORTACIÓN: xr.js debe ir ANTES que Three.js, porque
// aplica el workaround (interruptor ?workaround=...) al cargarse.
// ============================================================

import {
    obtenerResultadoWorkaround,
    leerNavegador,
    comprobarSoporteAR,
    describirCapa,
    describirOverlay,
    crearOpcionesDeSesion,
    crearFuenteHitTest,
    liberarFuenteHitTest,
    leerPuntoDeSuelo,
} from './xr.js';

import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

import {
    marcarPunto,
    reiniciarPuntos,
    cantidadPuntos,
    obtenerPuntos,
    calcularDistancia,
    textoBotonMarcar,
    formatearMetros,
    formatearPunto,
} from './puntos.js';

// ------------------------------------------------------------
// Referencias del DOM.
// ------------------------------------------------------------
const $ = (id) => document.getElementById(id);

const overlay = $('overlay');
const estado = $('estado');
const bloqueInicio = $('bloque-inicio');
const bloqueAr = $('bloque-ar');

const diagChrome = $('diag-chrome');
const diagHttps = $('diag-https');
const diagAr = $('diag-ar');
const diagWorkaround = $('diag-workaround');
const diagCapa = $('diag-capa');
const diagOverlay = $('diag-overlay');

const sueloEl = $('suelo');
const pt1El = $('pt1');
const pt2El = $('pt2');
const distanciaEl = $('distancia');

const btnMarcar = $('btn-marcar');
const btnReiniciar = $('btn-reiniciar');
const btnSalir = $('btn-salir');

const elementosEsenciales = {
    overlay, estado, bloqueInicio, bloqueAr, diagChrome, diagHttps, diagAr,
    diagWorkaround, diagCapa, diagOverlay, sueloEl, pt1El, pt2El, distanciaEl,
    btnMarcar, btnReiniciar, btnSalir,
};
for (const [nombre, elemento] of Object.entries(elementosEsenciales)) {
    if (!elemento) {
        console.error(`[main] Falta el elemento "${nombre}" en index.html.`);
    }
}

// ------------------------------------------------------------
// Utilidades de pantalla.
// ------------------------------------------------------------
function escribir(elemento, texto) {
    if (elemento) elemento.textContent = texto;
}

/**
 * @param {string} texto
 * @param {'ok'|'error'|''} tipo
 */
function mostrarEstado(texto, tipo) {
    if (!estado) return;
    estado.textContent = texto;
    estado.className = tipo ? `estado ${tipo}` : 'estado';
}

// ------------------------------------------------------------
// Estado de la aplicación.
// ------------------------------------------------------------
let renderer = null;
let scene = null;
let camera = null;
let reticula = null;

let fuenteHit = null;      // Fuente de hit-test de la sesión actual.
let ultimoSuelo = null;    // Último punto de suelo leído ({x, y, z, matriz}).
let sueloMostrado = null;  // Para no reescribir el texto del suelo en cada cuadro.
let diagnosticoLeido = false;

let marcadores = [];       // Objetos 3D de los puntos marcados.
let linea = null;          // Línea 3D entre los dos puntos.

// ------------------------------------------------------------
// Escena 3D (solo mira, marcadores y línea; sin casa).
// ------------------------------------------------------------
function iniciarEscena() {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.xr.enabled = true;

    const lienzo = renderer.domElement;
    lienzo.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;';
    document.body.appendChild(lienzo);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
        70,
        window.innerWidth / window.innerHeight,
        0.01,
        50
    );

    // Mira: un anillo plano que se apoya en el suelo detectado.
    reticula = new THREE.Mesh(
        new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    reticula.matrixAutoUpdate = false;
    reticula.visible = false;
    scene.add(reticula);

    renderer.setAnimationLoop(alCuadro);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight, false);
    });

    renderer.xr.addEventListener('sessionstart', alIniciarSesion);
    renderer.xr.addEventListener('sessionend', alTerminarSesion);
}

/**
 * Crea un poste con un anillo en la base para señalar un punto.
 */
function crearMarcador(punto, color) {
    const grupo = new THREE.Group();

    const poste = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.6, 12),
        new THREE.MeshBasicMaterial({ color })
    );
    poste.position.y = 0.3;

    const base = new THREE.Mesh(
        new THREE.RingGeometry(0.06, 0.08, 24).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
    );

    grupo.add(poste, base);
    grupo.position.set(punto.x, punto.y, punto.z);
    scene.add(grupo);
    return grupo;
}

/**
 * Crea una línea entre dos puntos.
 */
function crearLinea(a, b) {
    const geometria = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a.x, a.y + 0.02, a.z),
        new THREE.Vector3(b.x, b.y + 0.02, b.z),
    ]);
    const nueva = new THREE.Line(
        geometria,
        new THREE.LineBasicMaterial({ color: 0xffffff })
    );
    scene.add(nueva);
    return nueva;
}

/**
 * Quita un objeto de la escena y libera su memoria.
 */
function quitarObjeto(objeto) {
    if (!objeto) return;
    scene.remove(objeto);
    objeto.traverse((hijo) => {
        if (hijo.geometry) hijo.geometry.dispose();
        if (hijo.material) hijo.material.dispose();
    });
}

function quitarMarcadores() {
    marcadores.forEach(quitarObjeto);
    marcadores = [];
    quitarObjeto(linea);
    linea = null;
}

// ------------------------------------------------------------
// Bucle de dibujo (se ejecuta en cada cuadro).
// ------------------------------------------------------------
function alCuadro(tiempo, cuadro) {
    if (cuadro) {
        const sesion = renderer.xr.getSession();

        // Diagnóstico: se lee en el primer cuadro, cuando la sesión ya está lista.
        if (!diagnosticoLeido && sesion) {
            diagnosticoLeido = true;
            escribir(diagCapa, describirCapa(sesion));
            escribir(diagOverlay, describirOverlay(sesion));
        }

        // Suelo en el centro de la pantalla.
        const espacio = renderer.xr.getReferenceSpace();
        ultimoSuelo = leerPuntoDeSuelo(cuadro, fuenteHit, espacio);

        if (ultimoSuelo) {
            reticula.visible = true;
            reticula.matrix.fromArray(ultimoSuelo.matriz);
        } else {
            reticula.visible = false;
        }

        // Actualizar el texto del suelo solo cuando cambia.
        const hayHit = ultimoSuelo !== null;
        if (hayHit !== sueloMostrado) {
            sueloMostrado = hayHit;
            escribir(sueloEl, hayHit ? 'Detectado' : 'Buscando...');
        }
    }

    renderer.render(scene, camera);
}

// ------------------------------------------------------------
// Sesión de AR: inicio y fin.
// ------------------------------------------------------------
function alIniciarSesion() {
    document.body.classList.add('en-ar');
    if (bloqueInicio) bloqueInicio.classList.add('oculto');
    if (bloqueAr) bloqueAr.classList.remove('oculto');

    diagnosticoLeido = false;
    sueloMostrado = null;
    reiniciarTodo();

    const sesion = renderer.xr.getSession();
    crearFuenteHitTest(sesion)
        .then((fuente) => {
            fuenteHit = fuente;
        })
        .catch((error) => {
            console.error('[main] No se pudo crear el hit-test:', error);
            mostrarEstado('No se pudo iniciar la detección del suelo.', 'error');
        });

    mostrarEstado('Apunta al suelo y mueve el teléfono para que lo detecte.', '');
}

function alTerminarSesion() {
    liberarFuenteHitTest(fuenteHit);
    fuenteHit = null;
    ultimoSuelo = null;
    if (reticula) reticula.visible = false;

    reiniciarTodo();

    document.body.classList.remove('en-ar');
    if (bloqueAr) bloqueAr.classList.add('oculto');
    if (bloqueInicio) bloqueInicio.classList.remove('oculto');

    mostrarEstado('Sesión de AR terminada.', '');
}

// ------------------------------------------------------------
// Puntos: marcar, reiniciar y mostrar en pantalla.
// ------------------------------------------------------------
function actualizarPuntosEnPantalla() {
    const puntos = obtenerPuntos();
    escribir(pt1El, puntos[0] ? formatearPunto(puntos[0]) : 'sin marcar');
    escribir(pt2El, puntos[1] ? formatearPunto(puntos[1]) : 'sin marcar');

    const distancia = calcularDistancia();
    escribir(
        distanciaEl,
        distancia
            ? `${formatearMetros(distancia.horizontal)} horizontal / ${formatearMetros(distancia.total)} total`
            : '-'
    );

    if (btnMarcar) {
        btnMarcar.textContent = textoBotonMarcar();
        btnMarcar.disabled = cantidadPuntos() >= 2;
    }
}

function reiniciarTodo() {
    reiniciarPuntos();
    quitarMarcadores();
    actualizarPuntosEnPantalla();
}

function alMarcar() {
    if (!renderer || !renderer.xr.isPresenting) {
        return;
    }
    if (!ultimoSuelo) {
        mostrarEstado('Todavía no hay suelo detectado. Apunta al suelo y mueve el teléfono.', 'error');
        return;
    }

    const numero = marcarPunto(ultimoSuelo);
    if (numero === 0) {
        return;
    }

    marcadores.push(crearMarcador(ultimoSuelo, numero === 1 ? 0x5bd68a : 0xff6b6b));

    if (numero === 2) {
        const puntos = obtenerPuntos();
        linea = crearLinea(puntos[0], puntos[1]);
        const distancia = calcularDistancia();
        mostrarEstado(
            `Medido: ${formatearMetros(distancia.horizontal)} en horizontal. Compáralo con tu cinta métrica.`,
            'ok'
        );
    } else {
        mostrarEstado('Punto 1 marcado. Apunta al segundo punto y márcalo.', 'ok');
    }

    actualizarPuntosEnPantalla();
}

function alSalir() {
    const sesion = renderer ? renderer.xr.getSession() : null;
    if (sesion) {
        sesion.end();
    }
}

// ------------------------------------------------------------
// Diagnóstico inicial (antes de entrar en AR).
// ------------------------------------------------------------
async function iniciarDiagnostico() {
    const navegador = leerNavegador();
    escribir(diagChrome, navegador.texto);
    escribir(diagHttps, window.isSecureContext ? 'Sí' : 'No');
    escribir(diagWorkaround, obtenerResultadoWorkaround());

    const soporte = await comprobarSoporteAR();
    const textos = {
        'si': 'Sí',
        'no': 'No',
        'sin-webxr': 'Sin WebXR',
        'error': 'Error al comprobar',
    };
    escribir(diagAr, textos[soporte] || '-');

    if (!window.isSecureContext) {
        mostrarEstado('Abre esta página desde una dirección HTTPS.', 'error');
    } else if (soporte === 'si') {
        mostrarEstado('Navegador compatible. Pulsa el botón de abajo para iniciar la AR.', 'ok');
    } else if (soporte === 'sin-webxr') {
        const extra = navegador.posibleInterno
            ? ' Parece un navegador interno de una app: abre el enlace en Chrome.'
            : ' Abre el enlace en Chrome (Android).';
        mostrarEstado('Este navegador no tiene WebXR.' + extra, 'error');
    } else if (soporte === 'no') {
        mostrarEstado('Este navegador o teléfono no soporta AR con WebXR. Prueba en Chrome o Samsung Internet.', 'error');
    } else {
        mostrarEstado('No se pudo comprobar el soporte de AR.', 'error');
    }
}

// ------------------------------------------------------------
// Arranque.
// ------------------------------------------------------------
function iniciar() {
    iniciarEscena();

    // Botón de iniciar AR (de Three.js). Los textos y botones de este
    // overlay se verán encima de la cámara durante la sesión.
    document.body.appendChild(
        ARButton.createButton(renderer, crearOpcionesDeSesion(overlay))
    );

    // Que tocar un botón no cuente además como un toque dentro de la AR.
    [btnMarcar, btnReiniciar, btnSalir].forEach((boton) => {
        if (boton) {
            boton.addEventListener('beforexrselect', (evento) => {
                evento.preventDefault();
            });
        }
    });

    if (btnMarcar) btnMarcar.addEventListener('click', alMarcar);
    if (btnReiniciar) btnReiniciar.addEventListener('click', reiniciarTodo);
    if (btnSalir) btnSalir.addEventListener('click', alSalir);

    actualizarPuntosEnPantalla();
    iniciarDiagnostico();
}

if (overlay) {
    iniciar();
} else {
    console.error('[main] No se encontró #overlay: no se inicia la prueba.');
}