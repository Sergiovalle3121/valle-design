/**
 * SOLDRAW: dibuja el perfil y el sombreado de corte de las vistas que creó
 * SOLVIEW, y vuelve a dibujarlos cuando el modelo cambia.
 *
 * Es la mitad que hace que la asociatividad sea real. `solview-associativity.ts`
 * sabe DECIR que un corte está obsoleto; esto es lo que lo pone al día. Sin
 * ello, la asociatividad sería un aviso: «tu corte ya no vale, redibújalo a
 * mano» — que es exactamente el trabajo que este producto existe para quitar.
 *
 * ## Qué se escribe, y dónde
 *
 * Por cada cuerpo que la vista ve: sus aristas VISTAS como líneas en
 * `<base>-VIS`, las que el propio cuerpo tapa en `<base>-HID`, y —sólo en las
 * secciones— la huella del corte como sombreado en `<base>-HAT`. `<base>-DIM`
 * se crea vacía: es donde el usuario acota, y SOLDRAW no la toca nunca, porque
 * las cotas son suyas.
 *
 * Todo aterriza en la PLACA de la vista: el rectángulo del espacio modelo que
 * la ventana encuadra. La proyección se calcula en coordenadas de la cámara y
 * se traslada al sitio de la placa. El porqué de la placa está en `solview.ts`.
 *
 * ## La política de lo editado a mano, que es la parte delicada
 *
 * Redibujar es borrar y volver a escribir. Hacerlo a ciegas destruye el trabajo
 * de quien retocó una línea del alzado, y lo destruye EN SILENCIO: el usuario
 * no ve desaparecer su corrección, la ve reaparecer mal.
 *
 * Así que SOLDRAW recuerda cada trazo que escribió Y CON QUÉ HUELLA lo dejó. Al
 * redibujar:
 *
 *  - Trazo intacto (misma huella) → se borra y se rehace. Era suyo.
 *  - Trazo cambiado (otra huella) → se ADOPTA: se queda donde está, deja de
 *    contarse como generado, y sale en el informe. A partir de ahí es geometría
 *    del usuario y SOLDRAW no vuelve a tocarla.
 *  - Trazo borrado por el usuario → se vuelve a crear. Borrar un trazo derivado
 *    no es editarlo: es pedir una vista incompleta, y una vista incompleta que
 *    parece completa es la clase de mentira que aquí no se admite. Quien quiera
 *    quitar algo de la vista, lo quita del modelo o congela la capa.
 *
 * Cualquier otra entidad que viva en esas capas y que SOLDRAW no escribiera se
 * queda intacta: son del usuario y no se cuentan.
 */
import type {
  CadDocument,
  CadEntity,
  CadPaperSpace,
  CadPaperViewport,
  CadPoint2,
} from "../cad-document";
import type { CadEntityCommand } from "../entity-commands";
import type { CadNativeEntity } from "../entity-runtime";
import { cadSolviewEvaluate } from "./solview-associativity";
import { cadSolviewLayerName } from "./solview";
import {
  cadSolviewDetailBubble,
  cadSolviewLabelEntities,
  cadSolviewSectionMark,
} from "./solview-annotations";
import type { CadSolviewContribution } from "./solview-model";

/** Clave de metadatos que ata un trazo derivado a la ventana que lo produjo. */
export const CAD_SOLVIEW_METADATA = "solviewFor";

/** Patrón del sombreado de corte. Es el rayado a 45° de toda la vida. */
export const CAD_SOLVIEW_HATCH_PATTERN = "ANSI31";

/** Mismas cifras que la huella del modelo: ver `solview-associativity.ts`. */
const DECIMALS = 6;
const round = (value: number): string => value.toFixed(DECIMALS);

export interface CadSoldrawReport {
  spaceId: string;
  viewportId: string;
  layerBase: string;
  status: "drawn" | "skipped";
  /** Trazos nuevos escritos en esta pasada. */
  created: number;
  /** Trazos anteriores retirados para rehacerlos. */
  deleted: number;
  /**
   * Trazos que el usuario había editado y que NO se han pisado. Ver la cabecera:
   * dejan de ser derivados y pasan a ser suyos.
   */
  adopted: string[];
  /** Entidades del modelo que alimentan la vista. */
  contributors: string[];
  /**
   * `false` cuando la visibilidad NO se resolvió sobre la escena entera.
   *
   * Desde la ola del defecto (a), la vista se resuelve junta con el
   * solucionador analítico y lo normal es `true`. Un `false` significa que el
   * solucionador rechazó la escena y se cayó a la clasificación por cuerpo, que
   * no sabe qué tapa a qué entre cuerpos distintos.
   */
  exact: boolean;
  /** Por qué se saltó, cuando `status` es `skipped`. */
  reason?: string;
}

export interface CadSoldrawResult {
  commands: CadEntityCommand[];
  reports: CadSoldrawReport[];
}

export interface CadSoldrawInput {
  /** Sólo se leen entidades y láminas. Ver `CadSolviewCreateInput.document`. */
  document: Pick<CadDocument, "entities" | "paperSpaces">;
  /** Generador de ids inyectado: sin él las specs no serían deterministas. */
  newEntityId: () => string;
  /** Limita a una lámina. Sin ello, todas. */
  spaceId?: string;
  /** Limita a unas ventanas. Sin ello, todas las derivadas de la lámina. */
  viewportIds?: readonly string[];
}

/** Huella de UN trazo derivado, para saber si alguien lo ha tocado. */
export function cadSoldrawEntityDigest(entity: CadEntity): string {
  if (entity.type === "line")
    return `L${round(entity.start.x)},${round(entity.start.y)},${round(entity.end.x)},${round(entity.end.y)}|${entity.layer}`;
  if (entity.type === "hatch")
    return `H${entity.pattern}|${entity.boundaries
      .map((loop) => loop.map((point) => `${round(point.x)},${round(point.y)}`).join(";"))
      .join("/")}|${entity.layer}`;
  // Los rótulos, marcas y globos (defecto (d)) también son DERIVADOS: si no
  // tuvieran huella propia, cada uno se declararía «editado a mano» la primera
  // vez y no volvería a actualizarse nunca — un corte a 1:50 seguiría rotulado
  // 1:50 después de reescalar la ventana a 1:100.
  if (entity.type === "mtext")
    return `M${entity.text}|${round(entity.insertion.x)},${round(entity.insertion.y)}|${round(entity.height ?? 0)}|${entity.layer}`;
  if (entity.type === "circle")
    return `C${round(entity.center.x)},${round(entity.center.y)},${round(entity.radius)}|${entity.layer}`;
  // Cualquier otro tipo con la marca es geometría que alguien transformó: se
  // declara distinta de todo, que la convierte en «editada a mano» y la
  // protege.
  return `X${entity.id}:${entity.type}`;
}

/** ¿Este trazo lo escribió SOLDRAW para esta ventana? */
export function cadSoldrawIsGenerated(entity: CadEntity, viewportId: string): boolean {
  return entity.context?.metadata?.[CAD_SOLVIEW_METADATA] === viewportId;
}

/** Todos los trazos que SOLDRAW dejó para una ventana, aunque falte la derivación. */
export function cadSoldrawGeneratedEntities(
  document: Pick<CadDocument, "entities">,
  viewportId: string,
): CadEntity[] {
  return document.entities.filter((entity) => cadSoldrawIsGenerated(entity, viewportId));
}

/** Lleva un punto de la vista a su sitio dentro de la placa del espacio modelo. */
function toPlate(
  point: CadPoint2,
  window: { x: number; y: number },
  plate: { x: number; y: number },
): CadPoint2 {
  return { x: plate.x + (point.x - window.x), y: plate.y + (point.y - window.y) };
}

function drawContribution(
  contribution: CadSolviewContribution,
  viewport: CadPaperViewport,
  base: string,
  newEntityId: () => string,
): CadNativeEntity[] {
  const window = viewport.derivation!.window!;
  const plate = viewport.modelBounds;
  const place = (point: CadPoint2) => toPlate(point, window, plate);
  const mark = { metadata: { [CAD_SOLVIEW_METADATA]: viewport.id } };
  const entities: CadNativeEntity[] = [];

  const line = (a: CadPoint2, b: CadPoint2, layer: string) => {
    const from = place(a);
    const to = place(b);
    // Un segmento degenerado no es un trazo: sería un punto invisible que
    // engorda el documento y ensucia la huella con ruido.
    if (Math.hypot(to.x - from.x, to.y - from.y) < 1e-9) return;
    entities.push({
      id: newEntityId(),
      type: "line",
      start: { x: from.x, y: from.y, z: 0 },
      end: { x: to.x, y: to.y, z: 0 },
      layer,
      context: mark,
    });
  };

  for (const segment of contribution.visible)
    line(segment.a, segment.b, cadSolviewLayerName(base, "VIS"));
  for (const segment of contribution.hidden)
    line(segment.a, segment.b, cadSolviewLayerName(base, "HID"));
  for (const loop of contribution.sectionLoops) {
    if (loop.length < 3) continue;
    entities.push({
      id: newEntityId(),
      type: "hatch",
      pattern: CAD_SOLVIEW_HATCH_PATTERN,
      solid: false,
      boundaries: [loop.map((point) => ({ ...place(point), z: 0 }))],
      layer: cadSolviewLayerName(base, "HAT"),
      context: mark,
    });
  }
  return entities;
}

/**
 * Los rótulos de la vista, y la marca o el globo que deja en su vista PADRE.
 *
 * Es lo que cierra el defecto (d): sin esto, una lámina con cuatro ventanas no
 * dice cuál es cada una ni a qué escala, y un corte no dice por dónde pasa.
 *
 * Van con la MISMA marca de metadatos que el perfil, así que heredan gratis
 * toda la política de lo editado a mano: quien mueva el rótulo se lo queda, y
 * quien lo borre lo ve volver, exactamente igual que con una línea del alzado.
 */
function drawAnnotations(
  space: CadPaperSpace,
  viewport: CadPaperViewport,
  newEntityId: () => string,
): CadNativeEntity[] {
  const derivation = viewport.derivation!;
  const mark = { metadata: { [CAD_SOLVIEW_METADATA]: viewport.id } };
  const entities: CadNativeEntity[] = [
    ...cadSolviewLabelEntities({
      viewport,
      plate: viewport.modelBounds,
      layerBase: derivation.layerBase,
      mark,
      newEntityId,
    }),
  ];
  const parent = derivation.parentViewportId
    ? (space.viewports ?? []).find((other) => other.id === derivation.parentViewportId)
    : undefined;
  if (!parent?.derivation) return entities;
  const kind = viewport.view?.kind;
  if (kind === "section")
    entities.push(...cadSolviewSectionMark({ parent, child: viewport, mark, newEntityId }));
  else if (kind === "detail")
    entities.push(...cadSolviewDetailBubble({ parent, child: viewport, mark, newEntityId }));
  return entities;
}

function drawViewport(
  document: Pick<CadDocument, "entities">,
  space: CadPaperSpace,
  viewport: CadPaperViewport,
  newEntityId: () => string,
): { report: CadSoldrawReport; commands: CadEntityCommand[]; viewport: CadPaperViewport } {
  const derivation = viewport.derivation!;
  const skeleton = {
    spaceId: space.id,
    viewportId: viewport.id,
    layerBase: derivation.layerBase,
    created: 0,
    deleted: 0,
    adopted: [] as string[],
    contributors: [] as string[],
    exact: true,
  };
  const evaluation = cadSolviewEvaluate(document, viewport);
  if (!evaluation)
    return {
      report: {
        ...skeleton,
        status: "skipped",
        // Fallo cerrado: no se dibuja «lo que se pueda». Una vista que no se
        // sabe calcular se queda como estaba y lo dice, en vez de quedarse a
        // medias con aspecto de terminada.
        reason:
          "La vista no se puede evaluar: le falta la cámara o el encuadre, o la cámara está degenerada.",
      },
      commands: [],
      viewport,
    };

  const present = new Map(document.entities.map((entity) => [entity.id, entity]));
  const commands: CadEntityCommand[] = [];
  const adopted: string[] = [];
  let deleted = 0;
  for (const previous of derivation.generated ?? []) {
    const entity = present.get(previous.id);
    if (!entity) continue;
    if (cadSoldrawEntityDigest(entity) !== previous.digest) {
      // Editado a mano: se adopta. Ver la cabecera.
      adopted.push(previous.id);
      continue;
    }
    commands.push({ type: "delete", entityId: previous.id });
    deleted += 1;
  }

  const created: CadNativeEntity[] = [];
  for (const contribution of evaluation.contributions)
    created.push(
      ...drawContribution(contribution, viewport, derivation.layerBase, newEntityId),
    );
  created.push(...drawAnnotations(space, viewport, newEntityId));
  // La capa de rótulos se asegura AQUÍ y no sólo al crear la vista: las vistas
  // que ya existían en documentos guardados no la tienen, y un rótulo en una
  // capa inexistente es un rótulo que no se ve. Un `upsert` con un nombre que
  // ya está no cambia nada, así que repetirlo es gratis.
  commands.push({
    type: "layer",
    op: "upsert",
    layer: {
      id: cadSolviewLayerName(derivation.layerBase, "ROT"),
      name: cadSolviewLayerName(derivation.layerBase, "ROT"),
      color: "#ffff00",
      visible: true,
      locked: false,
      plot: true,
    },
  });
  for (const entity of created)
    // Al fondo del orden de dibujo: el perfil derivado es el soporte sobre el
    // que se acota, no lo que tapa las cotas.
    commands.push({ type: "insert", entity, drawOrder: "back" });

  const next: CadPaperViewport = {
    ...viewport,
    derivation: {
      ...derivation,
      sourceDigest: evaluation.digest,
      generated: created.map((entity) => ({
        id: entity.id,
        digest: cadSoldrawEntityDigest(entity as CadEntity),
      })),
      exactHiddenLines: evaluation.exact,
      status: "fresh",
    },
  };

  return {
    report: {
      ...skeleton,
      status: "drawn",
      created: created.length,
      deleted,
      adopted,
      contributors: evaluation.contributors,
      exact: evaluation.exact,
    },
    commands,
    viewport: next,
  };
}

/**
 * Órdenes que ponen al día las vistas derivadas pedidas.
 *
 * Devuelve UN lote para todas: redibujar tres vistas es una sola orden del
 * usuario y tiene que ser un solo paso de deshacer. Con un lote por vista, un
 * `Ctrl+Z` dejaría la lámina con dos vistas nuevas y una vieja — que es
 * exactamente el estado inconsistente que la asociatividad promete no producir.
 */
export function cadSoldrawCommands(input: CadSoldrawInput): CadSoldrawResult {
  const wanted = input.viewportIds ? new Set(input.viewportIds) : undefined;
  const commands: CadEntityCommand[] = [];
  const reports: CadSoldrawReport[] = [];
  for (const space of input.document.paperSpaces) {
    if (input.spaceId && space.id !== input.spaceId) continue;
    let nextSpace = space;
    let touched = false;
    for (const viewport of space.viewports ?? []) {
      if (!viewport.derivation) continue;
      if (wanted && !wanted.has(viewport.id)) continue;
      const drawn = drawViewport(input.document, space, viewport, input.newEntityId);
      reports.push(drawn.report);
      if (drawn.report.status !== "drawn") continue;
      commands.push(...drawn.commands);
      nextSpace = {
        ...nextSpace,
        viewports: (nextSpace.viewports ?? []).map((v) =>
          v.id === viewport.id ? drawn.viewport : v,
        ),
      };
      touched = true;
    }
    // La lámina se escribe UNA vez por lámina, con todas sus ventanas ya
    // actualizadas: dos `upsert` de la misma hoja en el mismo lote harían que
    // el segundo pisara al primero y se perdería la derivación de una vista.
    if (touched) commands.push({ type: "paper-space", op: "upsert", space: nextSpace });
  }
  return { commands, reports };
}

/** Resumen legible de una pasada de SOLDRAW, para la línea de comandos. */
export function describeCadSoldraw(result: CadSoldrawResult): string {
  if (result.reports.length === 0)
    return "SOLDRAW: no hay ninguna vista creada con SOLVIEW que dibujar.";
  const drawn = result.reports.filter((report) => report.status === "drawn");
  const skipped = result.reports.filter((report) => report.status === "skipped");
  const created = drawn.reduce((total, report) => total + report.created, 0);
  const adopted = drawn.reduce((total, report) => total + report.adopted.length, 0);
  const parts = [`SOLDRAW: ${drawn.length} vista(s) al día, ${created} trazo(s)`];
  if (adopted > 0)
    parts.push(`${adopted} trazo(s) editados a mano se han respetado y ya no se regeneran`);
  const aproximadas = drawn.filter((report) => !report.exact).map((report) => report.layerBase);
  if (aproximadas.length > 0)
    parts.push(
      `perfil oculto APROXIMADO en ${aproximadas.join(", ")}: el solucionador analítico rechazó la escena —una cara alabeada o una mirada degenerada— y se cayó a la clasificación por cuerpo, que no resuelve qué tapa a qué entre cuerpos distintos`,
    );
  for (const report of skipped) parts.push(`${report.layerBase} sin dibujar: ${report.reason}`);
  return `${parts.join(". ")}.`;
}
