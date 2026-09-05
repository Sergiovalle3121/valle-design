/**
 * Plugin de ejemplo **que escribe**: MARCOLAMINA.
 *
 * Dibuja las dos polilíneas de una lámina —el borde del papel y el marco
 * interior con su margen de encuadernación— a partir de las dos esquinas que
 * designe el dibujante. Es lo primero que hace cualquiera que se sienta a
 * preparar una lámina, y por eso vale de ejemplo: no es un «hola mundo» que
 * dibuja un círculo en el origen, es una orden que alguien tecleraría.
 *
 * ## Qué enseña este archivo, y por qué está en el producto
 *
 * Es la PLANTILLA del desarrollador y el SUJETO de la spec a la vez
 * (`plugins-permisos.spec.ts`). Un ejemplo que sólo vive en la documentación
 * envejece sin que nadie se entere; éste se rompe en la corrida si la API
 * cambia, que es la única forma de que un ejemplo siga siendo cierto.
 *
 * Enseña las cuatro cosas que hay que saber para escribir un plugin:
 *
 *  1. **El manifiesto declara lo que necesita.** `documento:escritura` porque
 *     dibuja, `comandos:registro` porque ocupa un nombre, y `documento:lectura`
 *     porque su `activate` mira la tabla de capas. Lo que no pide, no lo tiene:
 *     sin `ui:panel` no puede publicar un panel, y no lo publica.
 *  2. **Un comando de plugin es un comando normal.** La misma máquina de
 *     estados pura que LINE: `begin` da el primer prompt, `step` recibe una
 *     entrada y devuelve la siguiente. No hay React, ni documento mutable, ni
 *     acceso al historial; se prueba en Node como una función.
 *  3. **Un comando termina o dice por qué no.** Con dos esquinas demasiado
 *     juntas para el margen, no dibuja un marco degenerado ni se queda callado:
 *     devuelve un mensaje diciendo qué pasó. Es la regla 2 de la casa —ningún
 *     comando responde éxito sin efecto— aplicada a un plugin.
 *  4. **Un lote, un paso de deshacer.** Las dos polilíneas salen en el MISMO
 *     `commands`, así que Ctrl+Z quita la lámina entera y no media.
 */
import type { CadPoint2 } from "../../../cad/cad-document";
import type { CadNativeEntity } from "../../../cad/entity-runtime";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../../../cad/engine";
import type { CadPlugin } from "../api";

/**
 * Margen por defecto, en UNIDADES DE DIBUJO.
 *
 * 10 es el margen de una lámina en milímetros, que es como se dibuja la
 * inmensa mayoría de los planos. Un dibujo en metros necesitará teclear el
 * suyo, y por eso el margen es un argumento con valor por defecto y no una
 * constante escondida: el comando no sabe en qué unidad está el dibujo —el
 * motor no le pasa `INSUNITS` por esta ruta— y prefiere preguntarlo a
 * suponerlo.
 */
const MARGEN_POR_DEFECTO = 10;

/**
 * El margen izquierdo es DOBLE. Es el de encuadernación: el lado por el que se
 * perfora o se cose el juego de planos, y lo que se pierde ahí no se recupera
 * doblando la lámina.
 */
const FACTOR_ENCUADERNADO = 2;

interface MarcoState {
  primera: CadPoint2 | null;
  segunda: CadPoint2 | null;
}

const PIDE_PRIMERA = "Precise la primera esquina de la lámina";
const PIDE_SEGUNDA = "Precise la esquina opuesta";

function pidePrimera(state: MarcoState): CadCommandStep<MarcoState> {
  return { state, prompt: { message: PIDE_PRIMERA, options: [] }, accepts: CAD_ACCEPT_POINT };
}

function pideSegunda(state: MarcoState): CadCommandStep<MarcoState> {
  return { state, prompt: { message: PIDE_SEGUNDA, options: [] }, accepts: CAD_ACCEPT_POINT };
}

function pideMargen(state: MarcoState): CadCommandStep<MarcoState> {
  return {
    state,
    prompt: {
      message: "Margen del marco",
      options: [],
      defaultValue: String(MARGEN_POR_DEFECTO),
    },
    accepts: CAD_ACCEPT_DISTANCE,
  };
}

/** Rectángulo cerrado como polilínea de cuatro vértices, en una capa. */
function rectangulo(
  id: string,
  min: CadPoint2,
  max: CadPoint2,
  layer: string,
): CadNativeEntity {
  return {
    id,
    type: "polyline",
    vertices: [
      { x: min.x, y: min.y, z: 0 },
      { x: max.x, y: min.y, z: 0 },
      { x: max.x, y: max.y, z: 0 },
      { x: min.x, y: max.y, z: 0 },
    ],
    closed: true,
    layer,
  };
}

function marcoLaminaCommand(): CadCommandDescriptor<MarcoState> {
  return {
    name: "MARCOLAMINA",
    aliases: ["MLAM"],
    kind: "draw",
    transparent: false,
    selection: "none",
    repeatable: true,
    mutates: true,
    cursor: "crosshair",
    begin: () => pidePrimera({ primera: null, segunda: null }),
    step: (state, input, context: CadCommandContext) => {
      if (input.kind === "cancel") return pidePrimera({ primera: null, segunda: null });

      if (input.kind === "point") {
        if (!state.primera) return pideSegunda({ ...state, primera: input.point });
        return pideMargen({ ...state, segunda: input.point });
      }

      const esperaMargen = state.primera !== null && state.segunda !== null;
      if (!esperaMargen) return state.primera ? pideSegunda(state) : pidePrimera(state);

      // Enter acepta el margen por defecto; una distancia lo sustituye. Cualquier
      // otra cosa vuelve a preguntar en vez de tomarla por buena.
      let margen = MARGEN_POR_DEFECTO;
      if (input.kind === "distance") margen = input.value;
      else if (input.kind !== "enter") return pideMargen(state);

      const primera = state.primera as CadPoint2;
      const segunda = state.segunda as CadPoint2;
      const min = { x: Math.min(primera.x, segunda.x), y: Math.min(primera.y, segunda.y) };
      const max = { x: Math.max(primera.x, segunda.x), y: Math.max(primera.y, segunda.y) };
      const ancho = max.x - min.x;
      const alto = max.y - min.y;
      const consumidoX = margen * (1 + FACTOR_ENCUADERNADO);
      const consumidoY = margen * 2;

      if (!(margen > 0) || ancho <= consumidoX || alto <= consumidoY) {
        // Ni marco degenerado ni silencio: la orden dice qué midió y qué
        // necesitaba. Un rectángulo invertido se dibuja igual de bien que uno
        // bueno y no se ve hasta que se imprime.
        const texto =
          `MARCOLAMINA: la lámina mide ${redondea(ancho)} × ${redondea(alto)} y un margen de ` +
          `${redondea(margen)} necesita al menos ${redondea(consumidoX)} × ${redondea(consumidoY)}. ` +
          `No se dibujó nada.`;
        return {
          state,
          prompt: { message: texto, options: [] },
          accepts: 0,
          result: { kind: "message", text: texto },
        };
      }

      const layer = context.activeLayer;
      const interior = {
        min: { x: min.x + margen * FACTOR_ENCUADERNADO, y: min.y + margen },
        max: { x: max.x - margen, y: max.y - margen },
      };

      return {
        state,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: {
          kind: "document",
          // Las DOS en el mismo lote: es lo que hace que deshacer quite la
          // lámina entera y no deje el borde sin su marco.
          commands: [
            { type: "insert", entity: rectangulo(context.newEntityId(), min, max, layer) },
            {
              type: "insert",
              entity: rectangulo(context.newEntityId(), interior.min, interior.max, layer),
            },
          ],
          label: "MARCOLAMINA",
          notice:
            `Lámina de ${redondea(ancho)} × ${redondea(alto)} con margen ${redondea(margen)} ` +
            `(izquierdo ${redondea(margen * FACTOR_ENCUADERNADO)}, de encuadernación).`,
        },
      };
    },
  };
}

/** Sin decimales de más: los números salen a un renglón que lee una persona. */
function redondea(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * El plugin. `activate` mira el dibujo —por eso pide `documento:lectura`— y
 * deja anotado en qué capa va a dibujar, que es lo primero que alguien quiere
 * saber antes de teclear una orden que escribe.
 */
export const MARCO_LAMINA_PLUGIN: CadPlugin = {
  manifiesto: 1,
  id: "marco-lamina",
  name: "Marco de lámina",
  version: "1.0.0",
  permisos: ["documento:lectura", "documento:escritura", "comandos:registro"],
  commands: [asCadCommand(marcoLaminaCommand())],
  activate: (context) => {
    if (!context.documento) {
      context.anotar("MARCOLAMINA listo. Todavía no hay dibujo abierto donde mirar la capa.");
      return;
    }
    const capa = context.documento.activeLayer();
    context.anotar(`MARCOLAMINA listo. El marco se dibujará en la capa "${capa}".`);
  },
  deactivate: () => {
    // Este plugin no retiene nada —ni temporizadores, ni suscripciones—, y por
    // eso su despedida está vacía. Se deja escrita, y no omitida, porque es
    // parte de lo que la plantilla enseña: quien SÍ retenga algo lo suelta aquí.
  },
};
