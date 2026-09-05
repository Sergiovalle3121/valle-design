/**
 * AEWIRE y AEWIRELIST: el conductor numerado y su listado (Ola 5).
 *
 * ## Qué estaba roto, medido
 *
 * El informe del 1 de septiembre daba **Electrical ~ 1 %**: *«Nada. Ni un
 * comando, ni una entidad de cable o componente, ni numeración de
 * conductores»*. Lo re-medí el 3 de septiembre sondeando catorce nombres de la
 * familia contra `engine/` —AEWIRE, AECOMPONENT, AEPANEL, AELADDER, AEPLC,
 * WIRENUMBER, AEBOM…—: CERO aciertos. Lo único eléctrico eran cuatro símbolos
 * colocables con `MEPSYMBOL`, y símbolos sin conductores son iconos, no una
 * instalación.
 *
 * ## Por qué son DOS órdenes y no una
 *
 * Un sistema de numeración sin forma de listarlo es medio sistema: el valor de
 * numerar no está en el número que se pone, está en poder preguntarle al
 * dibujo qué conductores hay y si alguno repite. `AEWIRE` dibuja; `AEWIRELIST`
 * pregunta y NO escribe nada — que es lo que permite consultarlo antes de
 * entregar sin ensuciar el documento ni el historial de deshacer.
 *
 * ## El número no se teclea
 *
 * Se calcula del dibujo (`wire-numbering.ts`) y se dice en el renglón. Dejarlo
 * teclear sería devolver el problema que la orden existe para quitar: dos
 * personas del mismo despacho escribiendo «14» en el mismo circuito.
 *
 * ## Lo que AEWIRELIST añadió después: DE/A y los sueltos
 *
 * Una lista de conductores numerados contesta «cuáles hay». La pregunta que un
 * electricista hace con el plano en la mano es otra: «éste, ¿de dónde sale y a
 * dónde llega?». `wire-connections.ts` la contesta cruzando los extremos del
 * recorrido con los componentes etiquetados, y de paso caza el defecto que la
 * pantalla esconde —el conductor que parece llegar al motor y termina a dos
 * centímetros—, que es la cuenta de SUELTOS del renglón.
 *
 * Esa sección va al FINAL del renglón y no toca su arranque: el arranque es lo
 * que lee quien tecleó la orden, y es también lo que la sonda de integridad
 * ve. Y viaja siempre con su criterio y su tolerancia, porque una conexión
 * deducida por cercanía no es una conexión declarada y el renglón no puede
 * insinuar que lo sea.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  CAD_IE_WIRE_LAYER,
  cadNextWireNumber,
  cadWireClashes,
  cadWireDefects,
  cadWireMetadata,
  cadWiresOf,
} from "../../electrical/wire-numbering";
import {
  cadFormatLooseEnd,
  cadFormatWireConnection,
  cadWireConnectionReport,
  cadWireLinkCriterion,
} from "../../electrical/wire-connections";
import {
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const NO_DOCUMENT =
  "AEWIRE necesita leer el dibujo para numerar: este anfitrión no lo expone.";

/** La vista del documento que estas dos órdenes necesitan. Nada más. */
function documentView(context: CadCommandContext): { entities: never[] } | null {
  if (!context.entity) return null;
  const entities = context.entityIds
    .map((id) => context.entity!(id))
    .filter((entity): entity is NonNullable<typeof entity> => !!entity);
  return { entities: entities as never[] };
}

const say = (text: string): CadCommandStep<never> => ({
  state: undefined as never,
  prompt: { message: "", options: [] },
  accepts: 0,
  result: { kind: "message", text },
});

// ---------------------------------------------------------------------------
// AEWIRE
// ---------------------------------------------------------------------------

interface WireState {
  circuit: string | null;
  gauge: string | null;
  points: CadPoint2[];
}

function wireStep(state: WireState): CadCommandStep<WireState> {
  if (!state.circuit)
    return {
      state,
      prompt: { message: "Circuito del conductor (el que lleva el tablero)", options: [] },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (state.gauge === null)
    return {
      state,
      prompt: { message: "Calibre AWG, Intro para no anotarlo", options: [] },
      accepts: CAD_ACCEPT_TEXT,
    };
  return {
    state,
    prompt: {
      message:
        state.points.length === 0
          ? "Precise el origen del conductor"
          : "Precise el siguiente punto, Intro para terminar",
      options: [],
    },
    accepts: CAD_ACCEPT_POINT,
    ...(state.points.length > 0 ? { preview: [{ points: state.points }] } : {}),
  };
}

/** El lote: la capa del circuito si falta, y la polilínea con su marca. */
function wireCommands(
  state: WireState,
  number: number,
  context: CadCommandContext,
): CadEntityCommand[] {
  const commands: CadEntityCommand[] = [];
  const layers = context.layers?.();
  if (
    layers &&
    !layers.some(
      (layer) =>
        layer.name.toUpperCase() === CAD_IE_WIRE_LAYER ||
        layer.id.toUpperCase() === CAD_IE_WIRE_LAYER,
    )
  )
    commands.push({
      type: "layer",
      op: "upsert",
      layer: {
        id: CAD_IE_WIRE_LAYER,
        name: CAD_IE_WIRE_LAYER,
        // Amarillo: el color con el que un plano mexicano dibuja la instalación
        // eléctrica, y el mismo que ya usa el servicio IE del cuadro MEP.
        color: "#eab308",
        visible: true,
        locked: false,
      },
    });
  commands.push({
    type: "insert",
    entity: {
      id: context.newEntityId(),
      type: "polyline",
      vertices: state.points.map((point) => ({ x: point.x, y: point.y, z: 0 })),
      closed: false,
      layer: CAD_IE_WIRE_LAYER,
      context: {
        metadata: cadWireMetadata({
          circuit: state.circuit!,
          number,
          gauge: state.gauge,
        }),
      },
    } as never,
  });
  return commands;
}

function finishWire(
  state: WireState,
  context: CadCommandContext,
): CadCommandStep<never> {
  const view = documentView(context);
  if (!view) return say(NO_DOCUMENT);
  if (state.points.length < 2)
    return say("Un conductor necesita al menos dos puntos: no se traza un punto.");

  const number = cadNextWireNumber(view, state.circuit!);
  // El choque se mira ANTES de escribir y sobre el dibujo de ahora: si el
  // circuito ya venía con un número repetido —de copiar y pegar, de un DXF
  // ajeno o de fusionar dos dibujos—, el electricista se entera aquí y no en
  // la obra.
  const choques = cadWireClashes(view).filter(
    (choque) => choque.circuit.toUpperCase() === state.circuit!.trim().toUpperCase(),
  );
  const aviso =
    choques.length > 0
      ? ` · OJO: en ${state.circuit} ya se repite el número ${choques
          .map((choque) => choque.number)
          .join(", ")}`
      : "";
  const calibre = state.gauge ? `, calibre ${state.gauge}` : "";
  const dicho = `AEWIRE: conductor ${state.circuit}-${number}${calibre}, ${state.points.length} punto(s) en ${CAD_IE_WIRE_LAYER}${aviso}`;
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands: wireCommands(state, number, context),
      label: "AEWIRE",
      // Sin `notice` la orden sería MUDA y el número asignado —que es TODO lo
      // que aporta— no se leería en ninguna parte.
      notice: dicho,
    },
  };
}

const wireCommand: CadCommandDescriptor<WireState> = {
  name: "AEWIRE",
  aliases: ["CONDUCTOR", "WIRENUMBER"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => wireStep({ circuit: null, gauge: null, points: [] }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("AEWIRE cancelado.");
    if (!state.circuit) {
      if (input.kind !== "text" || input.value.trim() === "")
        return say("AEWIRE necesita el circuito: sin él, un número no significa nada.");
      return wireStep({ ...state, circuit: input.value.trim() });
    }
    if (state.gauge === null) {
      if (input.kind === "enter") return wireStep({ ...state, gauge: "" });
      if (input.kind !== "text") return wireStep(state);
      return wireStep({ ...state, gauge: input.value.trim() });
    }
    if (input.kind === "point")
      return wireStep({ ...state, points: [...state.points, input.point] });
    if (input.kind === "enter") return finishWire(state, context);
    return wireStep(state);
  },
};

// ---------------------------------------------------------------------------
// AEWIRELIST
// ---------------------------------------------------------------------------

/** Cuántos de/a caben en el renglón antes de volverse ilegible. */
const DE_A_VISIBLES = 6;
/** Y cuántos sueltos se detallan; el resto se cuenta. */
const SUELTOS_VISIBLES = 3;

/**
 * La sección DE/A del renglón: de qué componente a qué componente va cada
 * conductor, cuántos tienen un extremo suelto, y con qué criterio se dedujo.
 *
 * Va DETRÁS de la lista de conductores, de los repetidos y de las marcas
 * ilegibles, por la misma razón por la que los renglones de la NOM van detrás
 * del resumen del circuito: lo primero que lee quien teclea la orden es lo que
 * pidió, y lo que se le añade no le puede empujar el dato de arriba fuera de
 * la vista. También es lo que deja intacto el arranque del mensaje.
 *
 * Y el criterio viaja con el resultado, siempre. Una conexión deducida por
 * cercanía no es una conexión declarada: si el renglón la enseñara sin decir de
 * qué está hecha, el dibujante la leería como un dato del proyecto y este
 * módulo habría empeorado el plano en vez de mejorarlo.
 */
function deA(
  view: Parameters<typeof cadWireConnectionReport>[0],
  unit: string | undefined,
): string[] {
  const reporte = cadWireConnectionReport(view, { unit });
  const partes: string[] = [];

  if (reporte.devices === 0) {
    // Callar aquí sería lo peor: una lista de conductores «todos sueltos»
    // significaría un plano mal dibujado cuando lo que pasa es que nadie
    // etiquetó los componentes todavía. Se dice cuál de las dos cosas es.
    partes.push(
      "DE/A: no hay ningún componente etiquetado en el dibujo, así que no se puede decir a qué llega ningún conductor — etiquételos con AETAG",
    );
    return partes;
  }

  const muestra = reporte.connections.slice(0, DE_A_VISIBLES).map(cadFormatWireConnection);
  const resto = reporte.connections.length - muestra.length;
  partes.push(
    `DE/A: ${muestra.join("; ")}${resto > 0 ? `; y ${resto} más` : ""}`,
  );

  if (reporte.loose.length === 0)
    partes.push(
      `SUELTOS: ninguno · los ${reporte.connections.length} conductor(es) rematan en un componente`,
    );
  else {
    const detalle = reporte.loose
      .slice(0, SUELTOS_VISIBLES)
      .flatMap((conexion) =>
        [conexion.from, conexion.to]
          .filter((extremo) => extremo.tag === null)
          .map((extremo) => cadFormatLooseEnd(conexion, extremo, unit)),
      )
      .join("; ");
    const mas = reporte.loose.length - Math.min(reporte.loose.length, SUELTOS_VISIBLES);
    partes.push(
      `SUELTOS: ${reporte.loose.length} de ${reporte.connections.length} conductor(es) · ${detalle}${mas > 0 ? `; y ${mas} más` : ""}`,
    );
  }

  if (reporte.withoutRun.length > 0)
    partes.push(
      `${reporte.withoutRun.length} marcado(s) como conductor sin recorrido que medir: ${reporte.withoutRun
        .slice(0, 3)
        .join(", ")}`,
    );

  partes.push(cadWireLinkCriterion(unit));
  return partes;
}

const wireListCommand: CadCommandDescriptor<never> = {
  name: "AEWIRELIST",
  aliases: ["LISTACONDUCTORES"],
  kind: "inquiry",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: (context) => {
    const view = documentView(context);
    if (!view)
      return say("AEWIRELIST necesita leer el dibujo: este anfitrión no lo expone.");
    const wires = cadWiresOf(view);
    if (wires.length === 0)
      return say("No hay ningún conductor numerado en el dibujo. Trace uno con AEWIRE.");

    const porCircuito = new Map<string, number[]>();
    for (const wire of wires) {
      const lista = porCircuito.get(wire.circuit) ?? [];
      lista.push(wire.number);
      porCircuito.set(wire.circuit, lista);
    }
    const renglones = [...porCircuito.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([circuito, numeros]) => `${circuito}: ${numeros.sort((a, b) => a - b).join(", ")}`);

    const choques = cadWireClashes(view);
    const defectos = cadWireDefects(view);
    const partes = [`${wires.length} conductor(es) · ${renglones.join(" · ")}`];
    if (choques.length > 0)
      partes.push(
        `REPETIDOS: ${choques
          .map((choque) => `${choque.circuit}-${choque.number} en ${choque.entityIds.join(" y ")}`)
          .join("; ")}`,
      );
    if (defectos.length > 0)
      partes.push(
        `${defectos.length} marca(s) ilegible(s): ${defectos
          .slice(0, 3)
          .map((defecto) => `${defecto.entityId} ${defecto.reason}`)
          .join("; ")}`,
      );
    partes.push(...deA(view, context.unit));
    return say(`AEWIRELIST — ${partes.join(" · ")}.`);
  },
  step: (state) => ({
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "none" },
  }),
};

export const CAD_ELECTRICAL_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(wireCommand),
  asCadCommand(wireListCommand),
];
