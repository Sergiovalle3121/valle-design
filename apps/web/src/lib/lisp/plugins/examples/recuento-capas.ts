/**
 * Plugin de ejemplo **de sólo lectura**: RECUENTOCAPAS y su panel.
 *
 * Cuenta cuántos objetos hay en cada capa del dibujo. Es la consulta que hace
 * cualquiera antes de purgar, congelar o entregar un plano —«¿en qué capa se me
 * ha colado esto?»— y sirve de ejemplo justamente porque NO necesita escribir.
 *
 * ## Qué enseña, y por qué es el par del otro ejemplo
 *
 * `marco-lamina.ts` enseña un plugin que dibuja; éste enseña el caso contrario y
 * el más común: la extensión que MIRA. Y enseña lo que en la práctica es más
 * difícil de creer sin verlo: que el permiso que no se pide, no se tiene.
 *
 * Este manifiesto declara `documento:lectura`, `comandos:registro` y `ui:panel`,
 * y deliberadamente NO declara `documento:escritura`. La consecuencia es
 * comprobable y está en `plugins-permisos.spec.ts`: si el anfitrión llama a
 * `apply` en su nombre, recibe un `PluginPermissionError` que dice qué permiso
 * falta, y el documento no cambia. No un `apply` que no hace nada —eso sería
 * peor que no tener permisos, porque el autor creería haber escrito.
 *
 * ## Por qué el recuento es una función exportada
 *
 * `recuentoPorCapa` es una función pura sobre entidades y capas, y por eso la
 * usan las tres: el comando, el `activate` que deja la primera nota, y el panel
 * que el editor monte cuando exista. Con la cuenta escrita dentro del `step`
 * del comando, el panel habría acabado teniendo la suya y las dos habrían
 * discrepado el día que alguien contase también los bloques.
 */
import type { CadEntity, CadLayerDef } from "../../../cad/cad-document";
import {
  asCadCommand,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../../../cad/engine";
import type { CadPlugin } from "../api";

export interface RecuentoDeCapa {
  capa: string;
  objetos: number;
}

/**
 * Objetos por capa, en el orden de la tabla de capas del documento.
 *
 * Las capas VACÍAS salen con 0 en vez de omitirse: una capa vacía es
 * exactamente lo que se busca cuando se va a purgar, y una lista que sólo
 * enseña lo que tiene contenido no puede contestar esa pregunta. Y una entidad
 * cuya capa no está en la tabla —las hay, en dibujos importados— se cuenta
 * aparte con su nombre, en vez de sumarse a «0» y desaparecer del problema.
 */
export function recuentoPorCapa(
  entities: readonly CadEntity[],
  layers: readonly CadLayerDef[],
): readonly RecuentoDeCapa[] {
  const cuenta = new Map<string, number>();
  for (const layer of layers) cuenta.set(layer.name, 0);
  const huerfanas: string[] = [];
  for (const entity of entities) {
    const capa = entity.layer;
    if (!cuenta.has(capa)) huerfanas.push(capa);
    cuenta.set(capa, (cuenta.get(capa) ?? 0) + 1);
  }
  const enTabla = layers.map((layer) => ({ capa: layer.name, objetos: cuenta.get(layer.name) ?? 0 }));
  const fuera = [...new Set(huerfanas)].map((capa) => ({ capa, objetos: cuenta.get(capa) ?? 0 }));
  return [...enTabla, ...fuera];
}

/** El recuento en un renglón, que es lo que cabe en la línea de comandos. */
export function textoDelRecuento(recuento: readonly RecuentoDeCapa[]): string {
  const total = recuento.reduce((suma, fila) => suma + fila.objetos, 0);
  const detalle = recuento.map((fila) => `${fila.capa}: ${fila.objetos}`).join(", ");
  return `${total} objeto(s) en ${recuento.length} capa(s) — ${detalle}`;
}

/**
 * El comando. Termina en su PRIMER paso: no hay nada que preguntar, y pedir un
 * Enter para una consulta sería ruido. `mutates: false` no es decorativo — es
 * lo que declara que esta orden no toca el dibujo, y el motor lo lee para
 * decidir si hace falta permiso de escritura.
 */
function recuentoCapasCommand(): CadCommandDescriptor<null> {
  const responde = (context: CadCommandContext): CadCommandStep<null> => {
    const entities = context.entityIds
      .map((id) => context.entity?.(id))
      .filter((entity): entity is CadEntity => entity !== undefined);
    // `layers` es una capacidad OPCIONAL del contexto: quien no la aporta
    // recibe una respuesta que lo dice, no una lista vacía que parecería un
    // dibujo sin capas.
    const layers = context.layers?.();
    const texto = layers
      ? `RECUENTOCAPAS: ${textoDelRecuento(recuentoPorCapa(entities, layers))}`
      : "RECUENTOCAPAS: el anfitrión no expone la tabla de capas, así que no se puede repartir el recuento.";
    return {
      state: null,
      prompt: { message: texto, options: [] },
      accepts: 0,
      result: { kind: "message", text: texto },
    };
  };
  return {
    name: "RECUENTOCAPAS",
    aliases: ["RCAP"],
    kind: "inquiry",
    transparent: true,
    selection: "none",
    repeatable: true,
    mutates: false,
    cursor: "none",
    begin: (context) => responde(context),
    // Una consulta que ya terminó no espera entradas; si alguien la empuja de
    // todas formas, vuelve a contestar con el estado del dibujo de ese momento.
    step: (_state, _input, context) => responde(context),
  };
}

export const RECUENTO_CAPAS_PLUGIN: CadPlugin = {
  manifiesto: 1,
  id: "recuento-capas",
  name: "Recuento por capa",
  version: "1.0.0",
  // Sin `documento:escritura`, y es el punto del ejemplo.
  permisos: ["documento:lectura", "comandos:registro", "ui:panel"],
  commands: [asCadCommand(recuentoCapasCommand())],
  panels: [
    {
      id: "recuento-capas",
      title: "Recuento por capa",
      placement: "right",
      // Una CADENA, no un componente: el registro es datos puros y quien decide
      // qué se monta es el anfitrión. Mientras el editor no conozca este
      // nombre, el panel está declarado y no pintado — que es un límite
      // declarado, no un panel roto.
      component: "PluginRecuentoCapas",
    },
  ],
  activate: (context) => {
    if (!context.documento) {
      context.anotar("Recuento por capa listo. Se contará al abrir un dibujo.");
      return;
    }
    const recuento = recuentoPorCapa(context.documento.entities(), context.documento.layers());
    context.anotar(textoDelRecuento(recuento));
  },
};
