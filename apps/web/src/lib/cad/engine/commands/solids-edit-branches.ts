/**
 * SOLIDEDIT: las tres ramas que el kernel SÍ sostiene hoy (2026-09-04).
 *
 * `solids-edit.ts` es el diálogo —qué se pregunta y en qué orden—. Aquí viven
 * las tres operaciones que entran en esta ventana, separadas por dos motivos:
 * el diálogo ya gastaba sus líneas en la máquina de estados, y cada una de
 * estas tres tiene un porqué largo que merece leerse junto al código que lo
 * cumple.
 *
 * ## Cara · Desfasar
 *
 * Desplaza la cara designada a lo largo de SU normal, con el signo de AutoCAD:
 * positivo hacia fuera —el sólido crece—, negativo hacia dentro. No hay
 * geometría nueva que inventar: es exactamente el nodo `push` de PRESSPULL, y
 * se reutiliza `withPushedFace` ENTERO en vez de escribir una segunda versión
 * que se desincronizaría con la primera.
 *
 * Entonces, ¿en qué se diferencia de Cara · Extruir, si las dos acaban en el
 * mismo nodo? En lo que cada una PROMETE. La Extruir de AutoCAD admite además
 * una trayectoria y un ángulo de inclinación, y ninguno de los dos existe en
 * este nodo: la rama Extruir es honesta pero incompleta. Desfasar, en cambio,
 * es en AutoCAD exactamente esto —una distancia a lo largo de la normal— y
 * aquí está COMPLETA. Ofrecerla por su nombre es lo que permite que quien la
 * busca la encuentre, en lugar de descubrir por casualidad que Extruir hacía
 * también su trabajo.
 *
 * ## Cara · Copiar
 *
 * Los lazos de la cara designada salen del documento como una entidad REGION
 * en coordenadas del MUNDO, con su `z` real. No se inventa transporte: es el
 * mismo camino que SECTION ya usa (`solids-modify.ts`, la rama que emite una
 * `region` por contorno cortado), y la propia REGION del esquema 5 declara que
 * sus contornos van en coordenadas del mundo y que la elevación viaja en la
 * `z` de sus puntos.
 *
 * El sentido de recorrido se emite TAL CUAL sale del kernel —exterior
 * antihorario visto desde fuera del sólido, agujeros al revés—, que es
 * justamente el convenio que distingue un contorno de un hueco. Quien consume
 * la región (`solid3d-profiles.ts`) la renormaliza en planta, así que no hay
 * que adivinar aquí.
 *
 * El límite, dicho: una región es una entidad del PLANO del dibujo. Copiar una
 * cara horizontal da una región que EXTRUDE y REVOLVE pueden volver a usar;
 * copiar una cara inclinada o vertical da una región cuya geometría 3D es
 * correcta y completa —los puntos llevan su `z`— pero que esos dos comandos
 * leerían en planta. La orden lo DICE al copiarla en vez de dejarlo para que
 * se descubra midiendo.
 *
 * ## Arista · Copiar
 *
 * Las aristas del sólido designado salen como entidades `line` con `start` y
 * `end` en `CadPoint3`. Un cuerpo B-rep guarda cada arista UNA vez —dos
 * medias-aristas, un `BrepEdge`—, así que la caja da doce y no veinticuatro;
 * aun así se normaliza el par de vértices y se descarta el duplicado, porque
 * tras una booleana dos aristas coincidentes son un resultado posible y doce
 * líneas superpuestas de dos en dos es un dibujo que miente sobre su contenido.
 *
 * **Todavía no**: designar UNA arista suelta. `CAD_ACCEPT_EDGE_PICK` no existe
 * —cero apariciones en el árbol— y crearlo obliga a tocar
 * `engine/command-types.ts`, que está fuera del territorio de este frente. La
 * rama copia por tanto TODAS las aristas del sólido designado, y lo anuncia en
 * su prompt en vez de dejar creer que hubo una designación fina.
 */
import type { CadPoint3 } from "../../cad-document";
import type { CadSolid3dEntity, CadSolidFaceRef } from "../../cad-entities-v5";
import type { CadEntityCommand } from "../../entity-commands";
import {
  BREP_TOLERANCE,
  NO_INDEX,
  aabbDiagonal,
  bodyBounds,
  faceGeometricNormal,
  faceInnerLoops,
  faceOuterLoop,
  halfEdgeSegment,
  loopPoints,
  meshVolume,
  tessellateBody,
  type BrepBody,
  type Vec3,
} from "../../../brep";
import { cadResolveFaceRef } from "../../pick3d/solid-face-ref";
import { solid3dBody } from "../../solid3d-build";
import type { CadCommandContext, CadCommandStep } from "../command-types";
import { withPushedFace } from "./solids-push-face";
import { finishedSolid, formatMagnitude, solidBatch, solidMessage } from "./solids-support";

/** La cara designada, tal como la deja el rayo de cámara del visor 3D. */
export interface SolidEditFacePick {
  entityId: string;
  ref: CadSolidFaceRef;
}

/** El SOLID3D vivo detrás de una designación, o el motivo por el que ya no está. */
function solidBehind(
  context: CadCommandContext,
  entityId: string,
): { ok: true; entity: CadSolid3dEntity } | { ok: false; reason: string } {
  const entity = context.entity?.(entityId);
  if (!entity || entity.type !== "solid3d")
    return { ok: false, reason: "La cara designada ya no pertenece a ningún sólido." };
  return { ok: true, entity: entity as CadSolid3dEntity };
}

/** Volumen del sólido, o `null` si el árbol no evalúa (quien llama ya lo dirá). */
function volumeOrNull(entity: CadSolid3dEntity): number | null {
  try {
    return Math.abs(meshVolume(tessellateBody(solid3dBody(entity))));
  } catch {
    return null;
  }
}

/**
 * Cara · Desfasar: el nodo `push`, con el signo de AutoCAD y su cuenta.
 *
 * El aviso no es adorno. `solidBatch` ya dejó escrito por qué una orden que
 * escribe y no dice nada es una orden muda: el dibujante ve moverse una cara y
 * no sabe cuánto ganó el sólido. Aquí el número es barato —el cuerpo está
 * memoizado— y es exactamente el que justifica la operación.
 */
export function offsetFace<S>(
  state: S,
  pick: SolidEditFacePick | null,
  distance: number,
  context: CadCommandContext,
): CadCommandStep<S> {
  if (!pick) return solidMessage(state, "SOLIDEDIT Cara Desfasar necesita una cara designada.");
  if (!(Math.abs(distance) > 1e-9))
    return solidMessage(state, "Un desfase de distancia cero no cambia el sólido.");
  const solid = solidBehind(context, pick.entityId);
  if (!solid.ok) return solidMessage(state, solid.reason);

  const before = volumeOrNull(solid.entity);
  const pushed = withPushedFace(solid.entity, pick.ref, distance);
  const after = volumeOrNull(pushed);
  const notice =
    before !== null && after !== null
      ? `Cara desfasada ${formatMagnitude(distance)}; el volumen pasa de ${formatMagnitude(before)} a ${formatMagnitude(after)}.`
      : undefined;

  return finishedSolid(pushed, {
    state,
    label: "SOLIDEDIT Cara Desfasar",
    before: [{ type: "delete", entityId: solid.entity.id }],
    ...(notice ? { notice } : {}),
  });
}

/** Un punto del kernel, copiado a un punto del documento (nunca aliasado). */
function point3(point: Vec3): CadPoint3 {
  return { x: point.x, y: point.y, z: point.z };
}

/**
 * Cara · Copiar: los lazos de la cara, como una REGION del mundo.
 *
 * La huella se RESUELVE contra el cuerpo vivo en vez de creerse su índice —es
 * la razón de ser de `cadResolveFaceRef`, y la tercera de sus tres respuestas,
 * «no sé cuál de éstas», se dice en vez de caer a la cara 0—.
 */
export function copyFace<S>(
  state: S,
  pick: SolidEditFacePick | null,
  context: CadCommandContext,
): CadCommandStep<S> {
  if (!pick) return solidMessage(state, "SOLIDEDIT Cara Copiar necesita una cara designada.");
  const solid = solidBehind(context, pick.entityId);
  if (!solid.ok) return solidMessage(state, solid.reason);

  let body: BrepBody;
  try {
    body = solid3dBody(solid.entity);
  } catch (error) {
    return solidMessage(
      state,
      `SOLIDEDIT Cara Copiar no pudo evaluar ${solid.entity.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const resolved = cadResolveFaceRef(body, pick.ref);
  if (!resolved.ok) return solidMessage(state, `No pude fijar esa cara: ${resolved.reason}`);

  const outer = loopPoints(body, faceOuterLoop(body, resolved.face)).map(point3);
  if (outer.length < 3)
    return solidMessage(state, "La cara designada no tiene un contorno cerrado que copiar.");
  const inners = faceInnerLoops(body, resolved.face)
    .map((loop) => loopPoints(body, loop).map(point3))
    .filter((loop) => loop.length >= 3);

  const commands: CadEntityCommand[] = [
    {
      type: "insert",
      entity: {
        id: context.newEntityId(),
        type: "region",
        outer,
        ...(inners.length > 0 ? { inners } : {}),
        layer: solid.entity.layer,
      },
    },
  ];

  // Horizontal o no: la región es correcta en 3D en los dos casos, pero sólo la
  // horizontal vuelve a EXTRUDE sin sorpresa. Se dice al copiarla.
  const normal = faceGeometricNormal(body, resolved.face);
  const horizontal = Math.abs(Math.abs(normal.z) - 1) < 1e-6;
  const holes = inners.length > 0 ? ` y ${inners.length} agujero(s)` : "";
  const flat = horizontal
    ? ""
    : " La cara no es horizontal: la REGION conserva la z real de sus puntos, pero EXTRUDE y REVOLVE leen las regiones en planta.";
  const notice =
    `Cara copiada como REGION de ${outer.length} puntos${holes}, en la capa ${solid.entity.layer}.` +
    ` El sólido ${solid.entity.id} no se toca.${flat}`;

  return solidBatch(state, commands, "SOLIDEDIT Cara Copiar", notice);
}

/** Paso de cuantización con el que dos aristas coincidentes se reconocen iguales. */
function linearStep(body: BrepBody): number {
  const diagonal = aabbDiagonal(bodyBounds(body));
  return Math.max(BREP_TOLERANCE.linear, (diagonal > 1e-12 ? diagonal : 1) * 1e-9);
}

/** Etiqueta de un punto, cuantizada: dos evaluaciones no dan los mismos bits. */
function pointTag(point: Vec3, step: number): string {
  const q = (value: number) => Math.round(value / step) * step + 0;
  return `${q(point.x)},${q(point.y)},${q(point.z)}`;
}

/**
 * Arista · Copiar: TODAS las aristas del sólido, como líneas del dibujo.
 *
 * El par de vértices se normaliza —se ordenan las dos etiquetas— porque la
 * misma arista recorrida al revés es la misma arista, y tras una booleana el
 * cuerpo puede traer dos coincidentes. Doce líneas superpuestas de dos en dos
 * es un dibujo que miente sobre lo que contiene, y la mentira sólo se ve al
 * intentar acotarlo.
 */
export function copyEdges<S>(
  state: S,
  solids: readonly CadSolid3dEntity[],
  context: CadCommandContext,
): CadCommandStep<S> {
  if (solids.length === 0)
    return solidMessage(
      state,
      "SOLIDEDIT Arista Copiar necesita un sólido designado; no hay ningún SOLID3D entre lo designado.",
    );

  const commands: CadEntityCommand[] = [];
  const notes: string[] = [];
  for (const solid of solids) {
    let body: BrepBody;
    try {
      body = solid3dBody(solid);
    } catch (error) {
      notes.push(
        `${solid.id}: no se pudo evaluar — ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    const step = linearStep(body);
    const seen = new Set<string>();
    let emitted = 0;
    let repeated = 0;
    let degenerate = 0;
    for (const edge of body.edges) {
      const halfEdge = edge.a !== NO_INDEX ? edge.a : edge.b;
      if (halfEdge === NO_INDEX) continue;
      const { from, to } = halfEdgeSegment(body, halfEdge);
      const tags = [pointTag(from, step), pointTag(to, step)].sort();
      if (tags[0] === tags[1]) {
        degenerate += 1;
        continue;
      }
      const key = `${tags[0]}|${tags[1]}`;
      if (seen.has(key)) {
        repeated += 1;
        continue;
      }
      seen.add(key);
      commands.push({
        type: "insert",
        entity: {
          id: context.newEntityId(),
          type: "line",
          start: point3(from),
          end: point3(to),
          layer: solid.layer,
        },
      });
      emitted += 1;
    }
    const discarded =
      repeated > 0 || degenerate > 0
        ? ` (${repeated} repetida(s) y ${degenerate} degenerada(s) descartadas)`
        : "";
    notes.push(`${solid.id}: ${emitted} arista(s) copiadas como líneas${discarded}.`);
  }

  if (commands.length === 0) return solidMessage(state, notes.join("\n"));
  return solidBatch(state, commands, "SOLIDEDIT Arista Copiar", notes.join("\n"));
}

/** Para la spec: las piezas que no pasan por el diálogo. */
export const __branchTestables = { pointTag, linearStep };
