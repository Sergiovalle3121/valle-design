/**
 * DUCT, PIPE y CABLETRAY: el trazado MEP en planta (Ola F, 2026-09-02).
 *
 * Medido antes (`distancia-autocad-completo-20260901.md`, §4 2º MEP): no
 * había entidades ni órdenes MEP; un plano de instalaciones se dibujaba con
 * LINE en capas a mano y sin tipo de línea que dijera el servicio.
 *
 * Las tres se teclean como LINE —punto a punto, Intro para terminar, desHacer
 * retira el último vértice— y emiten UN lote al terminar:
 *
 *   - PIPE: una POLYLINE por tramo continuo, en la capa del servicio (agua
 *     Fría, agua Caliente, Sanitario, Pluvial, Gas, contra Incendio) cuyo tipo
 *     de línea con texto la rotula en planta; el `Diámetro` nominal viaja en
 *     `context.metadata` para el cuadro de instalaciones.
 *   - DUCT y CABLETRAY: el contorno a doble línea con las esquinas a inglete
 *     (`cadDoubleLineOutline`) y el EJE como polilínea con tipo de línea
 *     CENTER; el `aNcho` es geometría (en la unidad del documento). El cuadro
 *     mide la longitud por el eje, no por el contorno.
 *
 * La capa del servicio se da de alta si no existe, con su color y su tipo de
 * línea, y no se toca si ya existe. Nada se persiste fuera del formato: son
 * polilíneas, capas y metadatos que el esquema ya tiene.
 *
 * ## LA COTA Y EL MONTANTE (Ola G, 2026-09-04)
 *
 * Una instalación no vive en el suelo: el agua fría corre por el plafón a
 * +2.400 y BAJA a +900 para salir en el mueble de la cocina. Ese tramo
 * vertical —el montante— es tubo que se compra, se corta y se soporta, y hasta
 * esta ola no existía en el dibujo: cada vértice se escribía con `z: 0` y la
 * longitud se medía en planta, así que un montante de 2 m contaba CERO metros
 * en el cuadro de instalaciones. Un número que falta y no deja hueco es peor
 * que un número mal: sale redondo y nadie lo revisa.
 *
 * Ahora las tres órdenes ofrecen `Elevación` como PIDROUTE: teclear una cota
 * nueva a mitad de trazo mete el tramo vertical EN EL SITIO —mismo punto en
 * planta, cota distinta— y cada vértice escribe su `z`. Un trazo que nadie
 * eleva sigue saliendo exactamente igual que antes, vértice a vértice y
 * palabra a palabra: es la condición para no romper el golden de
 * instalaciones, y la spec la fija con igualdad exacta.
 *
 * Y al cerrar, la corrida se mide contra lo que el dibujo ya tiene levantado
 * (`plant/clash.ts`): muros con su altura y sus vanos restados, sólidos y las
 * demás conducciones. Cuelga de estas órdenes en vez de vivir en una orden
 * nueva por lo mismo que en PIDROUTE — una comprobación que hay que acordarse
 * de teclear es una comprobación que no se hace, y una orden nueva obliga a
 * tocar `ribbon.ts`, que está fuera de este territorio (P-mep-plant-02).
 *
 * ## Los grados de `spatial`, y por qué no son el mismo en las tres
 *
 *   - PIPE es `spatial: true`: escribe UNA polilínea cuyos vértices son los
 *     puntos tal como llegan, con la cota que traigan. Con un SCU inclinado, el
 *     trazo queda en el plano del SCU, que es donde el usuario lo puso.
 *   - DUCT y CABLETRAY son `spatial: "elevation"`: su contorno a doble línea es
 *     una convención de PLANTA —la proyección del ancho— y se dibuja a la cota
 *     de arranque. Honra un SCU llano y elevado, y no uno inclinado, porque
 *     sobre un faldón el contorno saldría plano bajo un eje que no lo está.
 *     Declararlo `true` mentiría exactamente ahí.
 *
 * ## Lo que NO hacen, dicho aquí
 *
 *   - Sin accesorios automáticos (codos, tes, reducciones como símbolos): el
 *     codo es la esquina a inglete del propio contorno; una te se traza como
 *     dos tramos. El cuadro de instalaciones sí los CUENTA, deducidos de la
 *     geometría, pero nadie coloca una pieza. Sin diámetros por especificación:
 *     el catálogo es del proyecto.
 *   - Sin tramos curvos (arcos): un codo es una esquina. El ducto no guarda su
 *     canto, sólo su ancho, así que el contorno es planta y no sección.
 */
import type { CadPoint2, CadPoint3 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import {
  CAD_PL_CLASH_LIMITS,
  CAD_PL_CLASH_WORD,
  cadPipeClashReport,
} from "../../plant/clash";
import { cadPointZ } from "../spatial-point";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandInput,
  type CadCommandStep,
  type CadKeyword,
  type CadPreviewPath,
} from "../command-types";
import { cadFromMillimetres, cadMillimetresLabel } from "./architecture-support";
import { cadDoubleLineOutline, cadMepLayerCommands, cadMepRisers, cadMepServicesOf, cadPathLength, type CadMepKind, type CadMepService } from "./mep-support";
import { formatMagnitude } from "./solids-support";

const SIZE_KEYWORD: Record<CadMepKind, CadKeyword> = {
  pipe: { keyword: "Diámetro", shortcut: "D" },
  duct: { keyword: "aNcho", shortcut: "N" },
  tray: { keyword: "aNcho", shortcut: "N" },
};
const UNDO = { keyword: "desHacer", shortcut: "H" } as const;
/**
 * `Elevación` con atajo de DOS letras, y no es un capricho: en DUCT la `E` ya
 * es de `Extracción`, y `matchCadKeyword` no resuelve un empate —devuelve
 * `null` a propósito, para no adivinar—. Una `E` nueva habría dejado mudo un
 * servicio que hoy funciona, que es la peor manera de añadir una capacidad.
 */
const ELEVATION = { keyword: "Elevación", shortcut: "EL" } as const;

const NOUN: Record<CadMepKind, string> = { pipe: "la tubería", duct: "el ducto", tray: "la charola" };

interface TracingState {
  points: CadPoint3[];
  service: CadMepService;
  /** Diámetro nominal en mm (tubería) o ancho en unidades del documento (ducto y charola). */
  size: number;
  /** La cota actual, en unidades de dibujo. Arranca en el suelo y la mueve `Elevación`. */
  elevation: number;
  pending: "none" | "size" | "elevation";
}

function sizePrompt(kind: CadMepKind): string {
  return kind === "pipe" ? "Precise el diámetro nominal en mm" : `Precise el ancho de ${NOUN[kind].replace(/^(el|la) /, "")}`;
}

function preview(state: TracingState, kind: CadMepKind, cursor: CadPoint2 | undefined): CadPreviewPath[] {
  // La vista previa es en PLANTA, que es donde está el cursor: un montante se
  // proyecta en un punto y no se ve, y así debe ser — el prompt dice la cota.
  const plana = state.points.map((point) => ({ x: point.x, y: point.y }));
  const points = cursor && plana.length > 0 ? [...plana, cursor] : plana;
  if (points.length < 2) return [];
  if (kind === "pipe") return [{ points, closed: false }];
  const outline = cadDoubleLineOutline(points, state.size);
  return [{ points, closed: false }, ...(outline ? [{ points: outline, closed: true }] : [])];
}

function ask(state: TracingState, kind: CadMepKind, context: CadCommandContext): CadCommandStep<TracingState> {
  if (state.pending === "size")
    return { state, prompt: { message: sizePrompt(kind), options: [], defaultValue: String(state.size) }, accepts: CAD_ACCEPT_DISTANCE };
  if (state.pending === "elevation")
    return {
      state,
      prompt: {
        message: `Nueva cota (ahora ${cadMillimetresLabel(state.elevation, context.unit)} mm); el montante se traza solo, Intro para dejarla`,
        options: [],
        defaultValue: String(state.elevation),
      },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  const services = cadMepServicesOf(kind).flatMap((service) => (service.keyword ? [service.keyword] : []));
  const options = [...services, SIZE_KEYWORD[kind], ELEVATION, ...(state.points.length > 0 ? [UNDO] : [])];
  const recipe = kind === "pipe" ? `${state.service.label} Ø${formatMagnitude(state.size)} mm en ${state.service.layer}.` : `${state.service.label}, ancho ${cadMillimetresLabel(state.size, context.unit)} mm en ${state.service.layer}.`;
  // La cota se dice SIEMPRE, también cuando vale cero: un dato que sólo aparece
  // cuando cambia es un dato que nadie sabe que puede cambiar. Va al final del
  // mensaje porque el principio ya lo afirma el golden de instalaciones.
  const cota = `, a la cota ${cadMillimetresLabel(state.elevation, context.unit)} mm`;
  return {
    state,
    prompt: {
      message: state.points.length === 0 ? `${recipe} Precise el punto inicial de ${NOUN[kind]}${cota}` : `${recipe} Precise el punto siguiente${cota}`,
      options,
    },
    // Sin `CAD_ACCEPT_DISTANCE`, como LINE: un número suelto es entrada
    // directa sobre la dirección del cursor y la resuelve el pipeline.
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    preview: preview(state, kind, context.cursor),
  };
}

/**
 * Lo que la corrida recién trazada choca contra lo construido, dicho en el
 * mismo aliento en que se tiende.
 *
 * Devuelve cadena VACÍA cuando no hay nada que decir —sin choques, o sin un
 * anfitrión que exponga el dibujo—, y por eso un trazo en un dibujo sin muros
 * deja el aviso exactamente como estaba antes de esta ola. El informe se
 * calcula sobre el documento MÁS la corrida que se acaba de cerrar, que todavía
 * no está insertada, y filtrado a ella: lo que ya chocaba entre sí no es
 * noticia de este trazo.
 */
function choquesDe(context: CadCommandContext, nueva: CadNativeEntity): string {
  if (!context.entity) return "";
  const entities = context.entityIds
    .map((id) => context.entity!(id))
    .filter((entity): entity is NonNullable<ReturnType<NonNullable<CadCommandContext["entity"]>>> => !!entity);
  const informe = cadPipeClashReport(
    { entities: [...entities, nueva as never] },
    { unit: context.unit, routeIds: [nueva.id] },
  );
  if (informe.clashes.length === 0) return "";
  const dichos = informe.clashes
    .map(
      (choque) =>
        `${CAD_PL_CLASH_WORD[choque.kind]} contra ${choque.againstId}` +
        (choque.depth === undefined ? ` a ${choque.gap}` : ` con ${choque.depth} de calado`),
    )
    .join("; ");
  return ` ${dichos}. ${CAD_PL_CLASH_LIMITS}.`;
}

/** El lote de un trazado: la capa si falta, y la geometría con sus metadatos. */
export function cadMepTracingCommands(kind: CadMepKind, state: TracingState, context: CadCommandContext): { commands: CadEntityCommand[]; notice: string } | { refused: string } {
  // El filtro es EN TRES DIMENSIONES: dos puntos que coinciden en planta y
  // difieren en cota son un montante, y medirlos en 2D lo habría borrado justo
  // aquí, después de haberlo trazado a propósito.
  const points = state.points.filter(
    (point, index) =>
      index === 0 ||
      Math.hypot(point.x - state.points[index - 1].x, point.y - state.points[index - 1].y, point.z - state.points[index - 1].z) > 1e-9,
  );
  if (points.length < 2) return { refused: `${kind.toUpperCase()} necesita al menos dos puntos.` };
  const layer = state.service.layer;
  const length = cadPathLength(points);
  const montantes = cadMepRisers(points);
  const dichoMontante =
    montantes.count === 0
      ? ""
      : ` ${montantes.count} montante(s), ${cadMillimetresLabel(montantes.rise, context.unit)} mm verticales.`;
  const metadata = { mep: kind, service: state.service.id, size: state.size };
  const commands: CadEntityCommand[] = [...cadMepLayerCommands(state.service, context)];
  if (kind === "pipe") {
    const pipe: CadNativeEntity = { id: context.newEntityId(), type: "polyline", vertices: points, closed: false, layer, context: { metadata } };
    commands.push({ type: "insert", entity: pipe });
    return {
      commands,
      notice:
        `PIPE: ${points.length - 1} tramo(s) de ${state.service.label.toLowerCase()} Ø${formatMagnitude(state.size)} mm, ${cadMillimetresLabel(length, context.unit)} mm en la capa ${layer}.` +
        dichoMontante +
        choquesDe(context, pipe),
    };
  }
  const outline = cadDoubleLineOutline(points, state.size);
  if (!outline) {
    // Con la cota, la negativa tiene una causa nueva que la frase de siempre no
    // explica: un ducto que SÓLO sube tiene dos puntos distintos —lo son en el
    // espacio— y ninguno en planta, así que no hay contorno que dibujar. Se
    // dice ahí mismo en vez de dejar al dibujante buscando un ancho que sí está.
    const enPlanta = points.filter(
      (point, index) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 1e-9,
    );
    return {
      refused:
        `${kind === "duct" ? "DUCT" : "CABLETRAY"} necesita un ancho mayor que cero y dos puntos distintos.` +
        (enPlanta.length < 2 ? " Un tramo que sólo sube no tiene contorno en planta: trace también el recorrido horizontal." : ""),
    };
  }
  // El contorno se dibuja a la cota de ARRANQUE. Es una convención de planta —la
  // proyección del ancho, no una sección— y una proyección no tiene una sola
  // cota cuando el eje sube: elegir la del arranque es una decisión que se
  // declara en el aviso, no un cero disimulado.
  const suelo = points[0].z;
  const ring: CadNativeEntity = { id: context.newEntityId(), type: "polyline", vertices: outline.map((point) => ({ x: point.x, y: point.y, z: suelo })), closed: true, layer, context: { metadata: { ...metadata, outline: true } } };
  const axis: CadNativeEntity = {
    id: context.newEntityId(),
    type: "polyline",
    vertices: points,
    closed: false,
    layer,
    context: { metadata: { ...metadata, axis: true }, presentation: { linetype: { source: "explicit", value: "CENTER" } } },
  };
  commands.push({ type: "insert", entity: ring }, { type: "insert", entity: axis });
  const label = kind === "duct" ? "DUCT" : "CABLETRAY";
  return {
    commands,
    notice:
      `${label}: ${points.length - 1} tramo(s) de ${state.service.label.toLowerCase()}, ancho ${cadMillimetresLabel(state.size, context.unit)} mm, ${cadMillimetresLabel(length, context.unit)} mm por el eje en la capa ${layer}.` +
      dichoMontante +
      (montantes.count === 0 ? "" : ` El contorno queda a la cota de arranque (${cadMillimetresLabel(suelo, context.unit)} mm): la doble línea es planta.`) +
      choquesDe(context, axis),
  };
}

function finish(kind: CadMepKind, state: TracingState, context: CadCommandContext, label: string): CadCommandStep<TracingState> {
  if (state.points.length < 2)
    return { state, prompt: { message: "", options: [] }, accepts: 0, result: state.points.length === 0 ? { kind: "none" } : { kind: "message", text: `${label} necesita al menos dos puntos.` } };
  const built = cadMepTracingCommands(kind, state, context);
  if ("refused" in built) return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text: built.refused } };
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "document", commands: built.commands, label, notice: built.notice } };
}

/**
 * La cota nueva, con el MONTANTE metido en el sitio si ya hay por dónde subir.
 *
 * Mismo punto en planta, cota distinta: eso es el tramo vertical que se
 * construye, y sale solo porque nadie lo dibuja aparte. Antes del primer punto
 * no hay montante que trazar y la cota sólo fija por dónde arranca la corrida;
 * repetir la cota que ya se tiene no mete nada, para no dejar un tramo de
 * longitud cero que el isométrico dibujaría como un punto.
 */
function elevar(state: TracingState, elevation: number): TracingState {
  const ultimo = state.points[state.points.length - 1];
  if (!ultimo || Math.abs(ultimo.z - elevation) <= 1e-9) return { ...state, elevation, pending: "none" };
  return { ...state, elevation, pending: "none", points: [...state.points, { x: ultimo.x, y: ultimo.y, z: elevation }] };
}

function tracingCommand(name: string, aliases: readonly string[], kind: CadMepKind): CadCommandDescriptor<TracingState> {
  const services = cadMepServicesOf(kind);
  return {
    name,
    aliases,
    kind: "draw",
    transparent: false,
    selection: "none",
    repeatable: true,
    mutates: true,
    // PIPE conserva la cota de punta a punta y su única entidad es la
    // polilínea de los puntos tal como llegan: dibuja EN el plano del SCU.
    // DUCT y CABLETRAY escriben además el contorno a doble línea, que es
    // planta por definición, así que honran un SCU elevado y no uno inclinado.
    // La frontera del formato está medida aparte (`verification/z-frontiers.spec.ts`,
    // apartado 4: ida y vuelta por DXF de una polilínea con tres cotas leída
    // con un oráculo externo); sin esa vuelta, declararlo sería prometer una
    // cota que el fichero no guarda.
    spatial: kind === "pipe" ? true : "elevation",
    cursor: "crosshair",
    begin: (context) => {
      const service = services[0];
      const size = kind === "pipe" ? service.defaultSize : cadFromMillimetres(service.defaultSize, context.unit);
      return ask({ points: [], service, size, elevation: 0, pending: "none" }, kind, context);
    },
    step: (state, input: CadCommandInput, context) => {
      if (input.kind === "cancel") return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
      if (state.pending === "elevation") {
        // Intro deja la cota como estaba: preguntar no es cambiar.
        if (input.kind === "enter") return ask({ ...state, pending: "none" }, kind, context);
        if (input.kind !== "distance") return ask(state, kind, context);
        // Sin `Math.abs`: una instalación baja tanto como sube y una cota
        // negativa —un drenaje bajo el nivel de piso— es un dato, no un error.
        return ask(elevar(state, input.value), kind, context);
      }
      if (state.pending === "size") {
        if (input.kind === "enter") return ask({ ...state, pending: "none" }, kind, context);
        if (input.kind !== "distance") return ask(state, kind, context);
        const value = Math.abs(input.value);
        if (!(value > 1e-9)) return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text: `${name}: ${kind === "pipe" ? "el diámetro" : "el ancho"} tiene que ser mayor que cero.` } };
        return ask({ ...state, size: value, pending: "none" }, kind, context);
      }
      if (input.kind === "keyword") {
        if (input.keyword === SIZE_KEYWORD[kind].keyword) return ask({ ...state, pending: "size" }, kind, context);
        if (input.keyword === ELEVATION.keyword) return ask({ ...state, pending: "elevation" }, kind, context);
        if (input.keyword === UNDO.keyword) {
          // desHacer retira el vértice Y devuelve la cota a la del que queda:
          // si no, el siguiente punto saldría a la altura de un tramo que ya no
          // existe, que es la clase de error que no se ve en planta.
          const points = state.points.slice(0, -1);
          return ask({ ...state, points, elevation: points[points.length - 1]?.z ?? state.elevation }, kind, context);
        }
        const service = services.find((candidate) => candidate.keyword?.keyword === input.keyword);
        if (!service) return ask(state, kind, context);
        // Cambiar de servicio conserva el tamaño tecleado si lo hubo; si no,
        // toma el de fábrica del servicio nuevo.
        const size = state.size === (kind === "pipe" ? state.service.defaultSize : cadFromMillimetres(state.service.defaultSize, context.unit))
          ? (kind === "pipe" ? service.defaultSize : cadFromMillimetres(service.defaultSize, context.unit))
          : state.size;
        return ask({ ...state, service, size }, kind, context);
      }
      if (input.kind === "enter") return finish(kind, state, context, name);
      if (input.kind !== "point") return ask(state, kind, context);
      // La cota del punto manda si el anfitrión la trae —un plano de trabajo
      // elevado o inclinado—; si no, la que se tecleó. Igual que PIDROUTE.
      const z = cadPointZ(input.point) ?? state.elevation;
      return ask({ ...state, elevation: z, points: [...state.points, { x: input.point.x, y: input.point.y, z }] }, kind, context);
    },
  };
}

export const CAD_MEP_TRACING_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(tracingCommand("PIPE", ["PIPEADD", "TUBERIA"], "pipe")),
  asCadCommand(tracingCommand("DUCT", ["DUCTADD", "DUCTO"], "duct")),
  asCadCommand(tracingCommand("CABLETRAY", ["CABLETRAYADD", "CHAROLA"], "tray")),
];
