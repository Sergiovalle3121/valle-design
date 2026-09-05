/**
 * EL CICLO DE ACTUALIZACIÓN, EJERCIDO EVENTO A EVENTO.
 *
 * Lo que aquí se prueba no es un componente: es la DECISIÓN que toma
 * `update-lifecycle.ts` cuando el navegador le cuenta lo que pasó. Esa
 * separación existe justamente para poder escribir este archivo — los eventos
 * de verdad (`updatefound`, `statechange`, `controllerchange`) sólo los emite
 * un service worker instalándose encima de otro, y eso pide un navegador y dos
 * despliegues distintos.
 *
 * Los cinco casos que la entrega pedía, en el orden en que están abajo:
 *
 *   1. La primera instalación, sin controlador, NO avisa.
 *   2. Una instalación sobre un controlador vivo SÍ avisa.
 *   3. `controllerchange` recarga UNA vez cuando la recarga se pidió.
 *   4. Un segundo `controllerchange` no vuelve a recargar.
 *   5. El rechazo de `register()` deja «sin service worker» y no lanza.
 *
 * Y cinco más que salieron de escribirlos, todos de la misma familia —cosas que
 * pasan en el navegador de alguien y en ningún test—: el `controllerchange` que
 * NADIE pidió (el que recarga el plano abierto por su cuenta, que es el defecto
 * de verdad de este patrón), el plazo que vence porque el relevo no llegó, el
 * aviso que se cierra y vuelve con la SIGUIENTE versión, el worker entrante que
 * muere en `redundant` porque su precacheo falló, y la invariante que las cubre
 * a todas: desde un estado que YA recargó, ningún evento puede emitir otra
 * recarga.
 */
import { strict as assert } from "node:assert";
import {
  ESTADO_INICIAL,
  PLAZO_DE_RELEVO_MS,
  avisoVisible,
  debeRegistrar,
  siguiente,
  type EfectoSW,
  type EstadoSW,
  type EventoSW,
  type FaseSW,
} from "./update-lifecycle";

let comprobaciones = 0;
const ok = () => {
  comprobaciones += 1;
};

/** Encadena eventos como los encadena el componente, y devuelve todo lo visto. */
function correr(
  eventos: readonly EventoSW[],
  desde: EstadoSW = ESTADO_INICIAL,
): { estado: EstadoSW; efectos: EfectoSW[] } {
  let estado = desde;
  const efectos: EfectoSW[] = [];
  for (const evento of eventos) {
    const paso = siguiente(estado, evento);
    estado = paso.estado;
    efectos.push(...paso.efectos);
  }
  return { estado, efectos };
}

const recargas = (efectos: readonly EfectoSW[]) =>
  efectos.filter((efecto) => efecto.tipo === "recargar").length;

/** El registro tal y como llega en una primera visita: nadie controla la página. */
const PRIMERA_VISITA: EventoSW = {
  tipo: "registro-aceptado",
  controlado: false,
  hayEsperando: false,
  hayInstalando: false,
};

/** El registro de una visita normal: ya hay un worker controlando. */
const VISITA_CONTROLADA: EventoSW = {
  tipo: "registro-aceptado",
  controlado: true,
  hayEsperando: false,
  hayInstalando: false,
};

/* ── 1 · LA PRIMERA INSTALACIÓN NO AVISA ─────────────────────────────────────
   Un worker instalándose sin controlador vivo no es una actualización: es la
   primera visita de este navegador. El ciclo completo de esa primera visita
   —updatefound, installed, y el controllerchange del `clients.claim()`— no
   puede producir ni un aviso ni una recarga. Decirle «hay una versión nueva» a
   quien acaba de abrir el producto por primera vez es, literalmente, falso. */
{
  /* PASO A PASO, y no sólo el final: el aviso de la primera visita duraría los
     pocos segundos que tarda el `clients.claim()`, y comprobar únicamente el
     estado final lo dejaría pasar. Un parpadeo de «hay una versión nueva» en la
     primera carga del producto es exactamente el tipo de defecto que nadie
     reproduce después. */
  let estado = ESTADO_INICIAL;
  const todos: EfectoSW[] = [];
  for (const evento of [
    PRIMERA_VISITA,
    { tipo: "worker-entrante" },
    { tipo: "worker-listo" },
    { tipo: "cambio-de-controlador" },
  ] as const) {
    const paso = siguiente(estado, evento);
    estado = paso.estado;
    todos.push(...paso.efectos);
    assert.equal(
      avisoVisible(estado),
      false,
      `la primera visita avisó de una versión nueva tras ${evento.tipo}`,
    );
    assert.notEqual(estado.fase, "instalando", `la primera visita se creyó una actualización tras ${evento.tipo}`);
    assert.deepEqual(todos, [], `la primera visita ejecutó un efecto tras ${evento.tipo}`);
  }
  assert.equal(estado.fase, "al-dia", "la primera instalación no puede acabar avisando");
  assert.equal(estado.controlado, true, "tras el claim, la página sí queda controlada");
  ok();
}

/* ── 2 · UNA INSTALACIÓN SOBRE UN CONTROLADOR VIVO SÍ AVISA ────────────────── */
{
  const { estado, efectos } = correr([
    VISITA_CONTROLADA,
    { tipo: "worker-entrante" },
  ]);
  assert.equal(estado.fase, "instalando", "el worker entrante todavía no se puede usar");
  assert.equal(avisoVisible(estado), false, "avisar a media instalación ofrece una recarga que no está lista");

  const listo = correr([{ tipo: "worker-listo" }], estado);
  assert.equal(listo.estado.fase, "version-nueva");
  assert.equal(avisoVisible(listo.estado), true, "con la versión nueva lista, el aviso se pinta");
  assert.deepEqual(efectos, [], "detectar una versión nueva no dispara nada por su cuenta");
  assert.deepEqual(listo.efectos, []);
  ok();
}

/* ── 2-bis · EL REGISTRO QUE LLEGA TARDE ─────────────────────────────────────
   `register()` puede resolver cuando el navegador YA tenía un worker en espera
   de una visita anterior, o uno instalándose. Esos dos casos no vuelven a
   emitir `updatefound`: si el estado saliera sólo de los eventos, el aviso no
   aparecería nunca y el usuario se quedaría en la versión vieja hasta que
   cerrara todas las pestañas. Por eso el registro lleva su foto. */
{
  const esperando = correr([
    { tipo: "registro-aceptado", controlado: true, hayEsperando: true, hayInstalando: false },
  ]);
  assert.equal(esperando.estado.fase, "version-nueva", "un worker en espera ya es una versión nueva");

  const instalando = correr([
    { tipo: "registro-aceptado", controlado: true, hayEsperando: false, hayInstalando: true },
  ]);
  assert.equal(instalando.estado.fase, "instalando");

  // Y la misma foto SIN controlador sigue sin avisar: es la primera visita.
  const virgen = correr([
    { tipo: "registro-aceptado", controlado: false, hayEsperando: true, hayInstalando: true },
  ]);
  assert.equal(virgen.estado.fase, "al-dia", "sin controlador previo no hay actualización que anunciar");
  ok();
}

/* ── 3 · SE PIDE LA RECARGA: SALTO DE ESPERA, RELEVO, UNA RECARGA ──────────── */
{
  const listo = correr([
    VISITA_CONTROLADA,
    { tipo: "worker-entrante" },
    { tipo: "worker-listo" },
  ]);

  const pedida = correr([{ tipo: "recarga-pedida", hayEsperando: true }], listo.estado);
  assert.deepEqual(
    pedida.efectos,
    [{ tipo: "saltar-espera" }, { tipo: "armar-plazo", ms: PLAZO_DE_RELEVO_MS }],
    "con un worker en espera hay que pedirle el relevo y ponerle plazo",
  );
  assert.equal(pedida.estado.fase, "recargando");
  assert.equal(recargas(pedida.efectos), 0, "no se recarga antes del relevo: la página nueva arrancaría bajo el worker viejo");

  const relevo = correr([{ tipo: "cambio-de-controlador" }], pedida.estado);
  assert.deepEqual(relevo.efectos, [{ tipo: "recargar" }], "el relevo pedido sí recarga");
  assert.equal(relevo.estado.recargado, true);
  ok();
}

/* ── 3-bis · SIN NADIE EN ESPERA, SE RECARGA DIRECTO ──────────────────────────
   Es el caso NORMAL con este worker: `install` llama a `skipWaiting`, así que
   para cuando el usuario lee el aviso el worker nuevo ya tomó el mando y no hay
   relevo que esperar. Pedir un salto de espera aquí dejaría el botón girando
   hasta que venciera el plazo. */
{
  const listo = correr([
    VISITA_CONTROLADA,
    { tipo: "worker-entrante" },
    { tipo: "worker-listo" },
  ]);
  const pedida = correr([{ tipo: "recarga-pedida", hayEsperando: false }], listo.estado);
  assert.deepEqual(pedida.efectos, [{ tipo: "recargar" }]);
  assert.equal(pedida.estado.recargado, true);
  ok();
}

/* ── 4 · UN SEGUNDO `controllerchange` NO VUELVE A RECARGAR ───────────────────
   El bucle de recarga infinita es el defecto clásico de este patrón y no se ve
   en desarrollo: hace falta un worker que se active dos veces. Se prueban las
   dos formas de repetirlo —el evento repetido y el doble clic en el botón—
   porque la guarda tiene que ser del ESTADO, no del manejador. */
{
  const pedida = correr([
    VISITA_CONTROLADA,
    { tipo: "worker-entrante" },
    { tipo: "worker-listo" },
    { tipo: "recarga-pedida", hayEsperando: true },
  ]);
  const seguido = correr(
    [
      { tipo: "cambio-de-controlador" },
      { tipo: "cambio-de-controlador" },
      { tipo: "cambio-de-controlador" },
      { tipo: "plazo-agotado" },
    ],
    pedida.estado,
  );
  assert.equal(recargas(seguido.efectos), 1, "tres relevos y un plazo no pueden dar más de una recarga");

  const dobleClic = correr(
    [
      { tipo: "recarga-pedida", hayEsperando: false },
      { tipo: "recarga-pedida", hayEsperando: false },
      { tipo: "recarga-pedida", hayEsperando: true },
    ],
    correr([
      VISITA_CONTROLADA,
      { tipo: "worker-entrante" },
      { tipo: "worker-listo" },
    ]).estado,
  );
  assert.equal(recargas(dobleClic.efectos), 1, "el doble clic no puede recargar dos veces");
  ok();
}

/* ── 5 · EL RECHAZO DEL REGISTRO NO LANZA ─────────────────────────────────────
   `register()` rechaza por cosas que el usuario no puede arreglar: el script
   servido con el MIME equivocado, el almacenamiento bloqueado, un ámbito
   prohibido. La aplicación con red funciona igual —lo único que se pierde es el
   cascarón sin conexión—, así que el rechazo no puede lanzar, no puede avisar y
   no puede dejar el aviso a medias. */
{
  const { estado, efectos } = correr([
    { tipo: "registro-rechazado", detalle: "SecurityError: unsupported MIME type" },
  ]);
  assert.equal(estado.fase, "sin-service-worker");
  assert.equal(estado.motivo, "registro-rechazado");
  assert.match(String(estado.detalle), /MIME/, "el motivo se conserva para diagnóstico");
  assert.equal(avisoVisible(estado), false);
  assert.deepEqual(efectos, []);

  // La misma fase para las otras dos formas de quedarse sin worker.
  assert.equal(correr([{ tipo: "sin-soporte" }]).estado.motivo, "sin-soporte");
  assert.equal(
    correr([{ tipo: "desactivado-en-desarrollo" }]).estado.motivo,
    "desactivado-en-desarrollo",
  );
  ok();
}

/* ── 6 · EL RELEVO QUE NADIE PIDIÓ NO RECARGA ─────────────────────────────────
   ÉSTE es el defecto que importa, y es peor que el bucle. Este worker llama a
   `skipWaiting()` en `install`, así que toma el mando SOLO y la página recibe
   un `controllerchange` que nadie pidió. La receta que circula por ahí —recarga
   en `controllerchange`— recarga entonces encima de un plano abierto: el
   histórico de deshacer vive en RAM. Se avisa; se recarga cuando lo pidan. */
{
  const { estado, efectos } = correr([
    VISITA_CONTROLADA,
    { tipo: "worker-entrante" },
    { tipo: "worker-listo" },
    { tipo: "cambio-de-controlador" },
  ]);
  assert.equal(recargas(efectos), 0, "un relevo que nadie pidió NO puede recargar la pestaña");
  assert.equal(estado.fase, "version-nueva", "pero sí se sigue ofreciendo la recarga");
  assert.equal(estado.recargado, false);

  // Y también cuando el relevo se adelanta al `installed` (otra pestaña ya lo
  // tenía instalado y esta página sólo ve el cambio de controlador).
  const adelantado = correr([VISITA_CONTROLADA, { tipo: "cambio-de-controlador" }]);
  assert.equal(recargas(adelantado.efectos), 0);
  assert.equal(adelantado.estado.fase, "version-nueva");
  ok();
}

/* ── 7 · EL PLAZO QUE VENCE ──────────────────────────────────────────────────
   Se pidió el relevo y no llegó: otra pestaña sostiene al worker en espera, o
   el navegador ignoró el mensaje. El botón no se puede quedar girando para
   siempre; al vencer el plazo se recarga a secas, que es lo que el usuario
   pidió. Y si el relevo llega DESPUÉS, ya no recarga por segunda vez. */
{
  const pedida = correr([
    VISITA_CONTROLADA,
    { tipo: "worker-entrante" },
    { tipo: "worker-listo" },
    { tipo: "recarga-pedida", hayEsperando: true },
  ]);
  const vencido = correr([{ tipo: "plazo-agotado" }], pedida.estado);
  assert.deepEqual(vencido.efectos, [{ tipo: "recargar" }]);
  const tarde = correr([{ tipo: "cambio-de-controlador" }], vencido.estado);
  assert.deepEqual(tarde.efectos, [], "el relevo tardío ya no recarga: la página se está yendo");

  // Un plazo que vence sin haber pedido nada no hace nada.
  assert.deepEqual(correr([{ tipo: "plazo-agotado" }]).efectos, []);
  ok();
}

/* ── 8 · EL AVISO SE CIERRA, Y VUELVE CON LA SIGUIENTE VERSIÓN ────────────────
   Un aviso que no se puede cerrar tapa una esquina del área de dibujo hasta que
   el usuario ceda. Pero cerrarlo no puede significar «no me lo digas nunca
   más»: la SIGUIENTE versión vuelve a merecer aviso. */
{
  const listo = correr([
    VISITA_CONTROLADA,
    { tipo: "worker-entrante" },
    { tipo: "worker-listo" },
  ]);
  const cerrado = correr([{ tipo: "aviso-descartado" }], listo.estado);
  assert.equal(avisoVisible(cerrado.estado), false, "cerrar el aviso lo quita de la pantalla");
  assert.equal(cerrado.estado.fase, "version-nueva", "pero la versión nueva sigue estando ahí");

  const otraMas = correr(
    [{ tipo: "worker-entrante" }, { tipo: "worker-listo" }],
    cerrado.estado,
  );
  assert.equal(avisoVisible(otraMas.estado), true, "una versión posterior vuelve a avisar");
  ok();
}

/* ── 9 · EL WORKER ENTRANTE QUE MUERE ────────────────────────────────────────
   `redundant` con este worker significa una cosa concreta: alguna URL del
   cascarón no respondió 200 y el precacheo, que es todo-o-nada, tumbó el
   `install`. Lo que había sigue sirviendo. Ofrecer «recargar a la versión
   nueva» cuando esa versión no llegó a instalarse es ofrecer una recarga que no
   cambia nada. */
{
  const muerto = correr([
    VISITA_CONTROLADA,
    { tipo: "worker-entrante" },
    { tipo: "worker-descartado" },
  ]);
  assert.equal(muerto.estado.fase, "al-dia");
  assert.equal(avisoVisible(muerto.estado), false);

  const muertoTrasAvisar = correr([
    VISITA_CONTROLADA,
    { tipo: "worker-entrante" },
    { tipo: "worker-listo" },
    { tipo: "worker-descartado" },
  ]);
  assert.equal(muertoTrasAvisar.estado.fase, "al-dia", "el aviso se retira si la versión nueva muere");
  ok();
}

/* ── 10 · LA INVARIANTE, SOBRE TODO EL ESPACIO ───────────────────────────────
   Las nueve comprobaciones de arriba cubren caminos concretos. Ésta cubre el
   espacio entero: desde CUALQUIER estado que ya recargó, NINGÚN evento puede
   emitir otra recarga. Es la que hace que añadir un evento nuevo mañana no
   pueda reabrir el bucle por una salida que se olvidó de mirar la guarda.

   De paso: ningún evento lanza desde ningún estado, y el reductor no muta el
   estado que recibe (la copia congelada de antes tiene que seguir igual). */
{
  const FASES: FaseSW[] = [
    "sondeando",
    "sin-service-worker",
    "al-dia",
    "instalando",
    "version-nueva",
    "recargando",
  ];
  const EVENTOS: EventoSW[] = [
    { tipo: "sin-soporte" },
    { tipo: "desactivado-en-desarrollo" },
    { tipo: "registro-rechazado", detalle: "x" },
    PRIMERA_VISITA,
    VISITA_CONTROLADA,
    { tipo: "registro-aceptado", controlado: true, hayEsperando: true, hayInstalando: true },
    { tipo: "worker-entrante" },
    { tipo: "worker-listo" },
    { tipo: "worker-descartado" },
    { tipo: "cambio-de-controlador" },
    { tipo: "recarga-pedida", hayEsperando: true },
    { tipo: "recarga-pedida", hayEsperando: false },
    { tipo: "aviso-descartado" },
    { tipo: "plazo-agotado" },
  ];

  let combinaciones = 0;
  for (const fase of FASES) {
    for (const controlado of [false, true]) {
      for (const avisoDescartado of [false, true]) {
        for (const recargado of [false, true]) {
          for (const evento of EVENTOS) {
            const estado: EstadoSW = {
              fase,
              motivo: null,
              detalle: null,
              controlado,
              recargado,
              avisoDescartado,
            };
            const copia = { ...estado };
            const paso = siguiente(Object.freeze(estado), evento);
            combinaciones += 1;
            assert.deepEqual(estado, copia, `el reductor mutó su entrada con ${evento.tipo}`);
            if (recargado) {
              assert.equal(
                recargas(paso.efectos),
                0,
                `${fase} + ${evento.tipo} recargó una segunda vez`,
              );
            }
            assert.ok(
              recargas(paso.efectos) <= 1,
              `${fase} + ${evento.tipo} emitió dos recargas de golpe`,
            );
            if (recargas(paso.efectos) === 1) {
              assert.equal(
                paso.estado.recargado,
                true,
                `${fase} + ${evento.tipo} recargó sin dejar puesta la guarda`,
              );
            }
          }
        }
      }
    }
  }
  assert.equal(combinaciones, FASES.length * 2 * 2 * 2 * EVENTOS.length);
  ok();
}

/* ── 11 · LA BANDERA DE DESARROLLO ───────────────────────────────────────────
   En producción se registra siempre. En desarrollo NO, salvo bandera explícita:
   un worker instalado una tarde en `localhost` sobrevive a todos los `next dev`
   siguientes sirviendo el cascarón de aquella tarde, sin error visible, sólo
   con cambios que «no se aplican». */
{
  assert.equal(debeRegistrar("production", undefined), true);
  assert.equal(debeRegistrar("development", undefined), false);
  assert.equal(debeRegistrar("test", undefined), false);
  assert.equal(debeRegistrar(undefined, undefined), false, "sin entorno se asume que no es producción");
  assert.equal(debeRegistrar("development", "1"), true);
  assert.equal(debeRegistrar("development", "true"), true);
  assert.equal(debeRegistrar("development", "0"), false);
  assert.equal(debeRegistrar("development", ""), false);
  ok();
}

console.log(
  `update-lifecycle: ${comprobaciones} bloques verdes; la recarga sale por una sola puerta y el plazo es de ${PLAZO_DE_RELEVO_MS} ms.`,
);
