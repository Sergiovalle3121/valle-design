/**
 * ASOCIATIVIDAD de las vistas derivadas: cómo sabe un corte que ya no dice la
 * verdad.
 *
 * Esto no es una comodidad del producto, es el producto. Un arquitecto dibuja
 * la planta y vuelve a dibujar a mano el alzado y el corte de lo mismo;
 * eliminar esa SEGUNDA vez es lo único que justifica que aquí haya 3D. Y un
 * corte que hay que redibujar a mano no ahorra nada: si mover un muro no
 * cambia el corte solo, lo construido es un adorno.
 *
 * ## La política, y por qué es ésta
 *
 * ### 1. La frescura se COMPRUEBA, no se anuncia
 *
 * La forma obvia es un `dirty: boolean` que las órdenes de edición ponen a
 * `true`. Falla ABIERTO, y falla en silencio. Las rutas por las que se mueve un
 * muro son decenas —MOVE, ROTATE, STRETCH, grips, deshacer, rehacer, una
 * fusión, un DXFIN, una restricción paramétrica que se resuelve— y basta que
 * UNA se olvide de marcar para que la vista siga diciendo «fresca» mientras
 * enseña el muro donde estaba. Nadie lo ve: el plano se traza y se entrega.
 *
 * Aquí se hace al revés. La vista guarda la HUELLA de lo que la alimentaba
 * cuando se dibujó, y la frescura se responde volviendo a calcular esa huella
 * AHORA. No hay nada que acordarse de llamar; si alguien editó por una ruta
 * que nadie previó, la huella cambia igual. Fallo cerrado: lo que no se puede
 * demostrar fresco se declara obsoleto.
 *
 * Se paga un recorrido del modelo por comprobación. Es el precio correcto: la
 * alternativa barata es la que miente.
 *
 * ### 2. La huella se calcula sobre lo que CONTRIBUYE, no sobre el documento
 *
 * Sobre el documento entero, cualquier edición en cualquier rincón ensuciaría
 * todos los cortes del juego, y una asociatividad que grita siempre se acaba
 * apagando. Sobre una lista CONGELADA de ids —los que salieron la última vez—
 * se falla abierto por la puerta de atrás: un muro NUEVO dentro del encuadre no
 * estaría en la lista y no ensuciaría nada.
 *
 * Así que se recalcula qué contribuye, cada vez, desde el modelo de hoy: lo que
 * la cámara proyecta dentro de la ventana de la vista. Con eso las dos mitades
 * del contrato se cumplen y son medibles: mover un muro que SALE cambia la
 * huella, y mover uno que NO sale no la cambia.
 *
 * ### 3. Lo que el usuario editó a mano NO se pisa
 *
 * SOLDRAW recuerda cada trazo que escribió y con qué huella lo dejó. Al
 * redibujar, un trazo que sigue igual se borra y se rehace sin preguntar —era
 * suyo—, pero uno que ha cambiado se ADOPTA: se deja donde está, deja de
 * contarse como generado, y se informa. Borrar trabajo humano para regenerar es
 * peor que dejar un plano con una línea de más, porque lo segundo se ve y lo
 * primero no.
 *
 * ### 4. Obsoleto se DECLARA
 *
 * `cadSolviewFreshness` devuelve el estado de cada vista con su motivo, y una
 * vista que no se puede evaluar —cámara degenerada, derivación incompleta— sale
 * `stale`, nunca `fresh`. Es preferible una vista marcada como obsoleta a una
 * vista silenciosamente mentirosa.
 */
import type { CadDocument, CadPaperSpace, CadPaperViewport } from "../cad-document";
import {
  cadSolviewContributions,
  cadSolviewSources,
  type CadSolviewContribution,
  type CadSolviewRect,
} from "./solview-model";
import { cadViewportViewFrame } from "./viewport-view";

export type CadSolviewFreshnessStatus = "fresh" | "stale" | "never-drawn" | "not-derived";

export interface CadSolviewFreshness {
  spaceId: string;
  viewportId: string;
  status: CadSolviewFreshnessStatus;
  /** Huella guardada la última vez que se dibujó, si la hay. */
  storedDigest?: string;
  /** Huella del modelo de AHORA. Ausente si la vista no se pudo evaluar. */
  currentDigest?: string;
  /** Ids del modelo que alimentan la vista hoy, ordenados. */
  contributors: string[];
  /** `false` si la visibilidad de aristas de algún cuerpo no es exacta. */
  exact: boolean;
  /** En castellano y para enseñar. Nunca vacío cuando el estado no es `fresh`. */
  reason: string;
}

/**
 * Cifras significativas de la huella.
 *
 * Seis decimales sobre unidades de dibujo son un micrón en un plano en
 * milímetros: por debajo de eso el trazado no cambia de píxel y marcar la vista
 * obsoleta sería ruido. Por encima, cualquier movimiento real se ve. El número
 * está aquí, con nombre, porque es una decisión de producto y no un detalle:
 * fija el tamaño del movimiento que la asociatividad se compromete a detectar.
 */
export const CAD_SOLVIEW_DIGEST_DECIMALS = 6;

const round = (value: number): string => value.toFixed(CAD_SOLVIEW_DIGEST_DECIMALS);

/**
 * Huella de 64 bits, en dos carriles FNV-1a de 32 con semillas distintas.
 *
 * No se usa SHA porque este módulo corre TAMBIÉN en el navegador, donde
 * `node:crypto` no existe y `crypto.subtle` es asíncrono — y una comprobación
 * de frescura que hay que esperar acaba no haciéndose. Dos carriles en vez de
 * uno porque con 32 bits la probabilidad de que dos modelos distintos den la
 * misma huella es una entre cuatro mil millones, y esa colisión se manifestaría
 * como una vista obsoleta que se declara fresca: exactamente el fallo abierto
 * que todo este archivo existe para impedir. Con 64 bits es una entre 1,8·10¹⁹.
 */
function digestOf(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ (code + i), 0x85ebca6b) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/**
 * Texto canónico de lo que una vista enseña.
 *
 * Se escribe todo lo que se DIBUJA —aristas vistas, ocultas y contornos de
 * corte—, no la receta de las entidades que lo produjeron. Es la diferencia
 * entre detectar «el muro cambió» y detectar «lo que se ve cambió»: cambiarle
 * la capa a un muro altera la entidad y no altera el corte, y marcar el corte
 * obsoleto por eso enseñaría a la gente a ignorar el aviso.
 */
export function cadSolviewContributionText(
  contributions: readonly CadSolviewContribution[],
): string {
  const parts: string[] = [];
  for (const contribution of [...contributions].sort((x, y) =>
    x.entityId.localeCompare(y.entityId),
  )) {
    parts.push(`#${contribution.entityId}:${contribution.entityType}`);
    for (const segment of contribution.visible)
      parts.push(`v${round(segment.a.x)},${round(segment.a.y)},${round(segment.b.x)},${round(segment.b.y)}`);
    for (const segment of contribution.hidden)
      parts.push(`h${round(segment.a.x)},${round(segment.a.y)},${round(segment.b.x)},${round(segment.b.y)}`);
    for (const loop of contribution.sectionLoops)
      parts.push(`s${loop.map((point) => `${round(point.x)},${round(point.y)}`).join(";")}`);
  }
  return parts.join("|");
}

export interface CadSolviewEvaluation {
  contributions: CadSolviewContribution[];
  digest: string;
  contributors: string[];
  exact: boolean;
  window: CadSolviewRect;
}

/**
 * Qué enseña esta ventana con el modelo de AHORA.
 *
 * Devuelve `null` cuando la ventana no es una vista derivada o su cámara no se
 * puede resolver. No devuelve «una vista vacía»: una vista vacía y una vista
 * que no se pudo calcular son estados distintos, y confundirlos declararía
 * fresca una lámina que nadie ha podido comprobar.
 */
export function cadSolviewEvaluate(
  document: Pick<CadDocument, "entities">,
  viewport: CadPaperViewport,
): CadSolviewEvaluation | null {
  const view = viewport.view;
  const window = viewport.derivation?.window;
  if (!view || !window) return null;
  const outcome = cadViewportViewFrame(view);
  if (!outcome.ok) return null;
  const sources = cadSolviewSources(document);
  const contributions = cadSolviewContributions(sources, outcome.frame, view, window);
  return {
    contributions,
    digest: digestOf(cadSolviewContributionText(contributions)),
    contributors: contributions.map((c) => c.entityId),
    exact: contributions.every((c) => c.exact),
    window,
  };
}

/** Estado de UNA ventana. Ver la cabecera para la política. */
export function cadSolviewViewportFreshness(
  document: Pick<CadDocument, "entities">,
  spaceId: string,
  viewport: CadPaperViewport,
): CadSolviewFreshness {
  const base = { spaceId, viewportId: viewport.id, contributors: [] as string[], exact: true };
  if (!viewport.derivation)
    return {
      ...base,
      status: "not-derived",
      reason: "La ventana no la creó SOLVIEW: no hay nada derivado que pueda quedar obsoleto.",
    };
  const evaluation = cadSolviewEvaluate(document, viewport);
  if (!evaluation)
    return {
      ...base,
      status: "stale",
      // Fallo CERRADO: no se ha podido comprobar, así que no se declara fresca.
      reason:
        "La vista no se puede evaluar: le falta la cámara o el encuadre, o la cámara está degenerada.",
    };
  const stored = viewport.derivation.sourceDigest;
  const shared = {
    ...base,
    contributors: evaluation.contributors,
    exact: evaluation.exact,
    currentDigest: evaluation.digest,
    ...(stored === undefined ? {} : { storedDigest: stored }),
  };
  if (stored === undefined)
    return {
      ...shared,
      status: "never-drawn",
      reason: "La vista existe pero SOLDRAW no la ha dibujado todavía.",
    };
  if (stored !== evaluation.digest)
    return {
      ...shared,
      status: "stale",
      reason: `El modelo que alimenta esta vista ha cambiado desde el último SOLDRAW (${stored} → ${evaluation.digest}).`,
    };
  return { ...shared, status: "fresh", reason: "" };
}

/** Estado de todas las vistas derivadas del documento, lámina a lámina. */
export function cadSolviewFreshness(
  document: Pick<CadDocument, "entities" | "paperSpaces">,
): CadSolviewFreshness[] {
  const report: CadSolviewFreshness[] = [];
  for (const space of document.paperSpaces)
    for (const viewport of space.viewports ?? [])
      report.push(cadSolviewViewportFreshness(document, space.id, viewport));
  return report;
}

/**
 * Las vistas que NO se pueden trazar sin mentir.
 *
 * `never-drawn` cuenta como obsoleta a propósito: una ventana de corte vacía en
 * una lámina firmada es tan falsa como una que enseña el muro donde estaba.
 */
export function cadStaleSolviews(
  document: Pick<CadDocument, "entities" | "paperSpaces">,
): CadSolviewFreshness[] {
  return cadSolviewFreshness(document).filter(
    (entry) => entry.status === "stale" || entry.status === "never-drawn",
  );
}

/**
 * Resumen para enseñar antes de trazar o de publicar un juego de planos.
 *
 * Devuelve una frase, no un booleano, porque lo que el usuario necesita saber
 * es CUÁLES están obsoletas: «hay algo mal» no se puede accionar.
 */
export function describeCadSolviewFreshness(
  document: Pick<CadDocument, "entities" | "paperSpaces">,
): string {
  const stale = cadStaleSolviews(document);
  if (stale.length === 0) return "Todas las vistas derivadas están al día.";
  const names = stale.map((entry) => `${entry.spaceId}/${entry.viewportId}`).join(", ");
  return `${stale.length} vista(s) derivada(s) sin actualizar: ${names}. Ejecuta SOLDRAW.`;
}

/** Ventanas de una lámina que fabricó SOLVIEW, en orden. */
export function cadDerivedViewports(space: CadPaperSpace): CadPaperViewport[] {
  return (space.viewports ?? []).filter((viewport) => !!viewport.derivation);
}
