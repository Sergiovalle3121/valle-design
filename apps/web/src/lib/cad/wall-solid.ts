/**
 * El VOLUMEN 3D del muro paramétrico: la pieza que faltaba.
 *
 * `wall-geometry.ts` deriva el contorno de PLANTA y dice, con toda intención,
 * que `height` no le pertenece. Éste es el módulo que sí usa `height`: el
 * cuerpo B-rep real del muro, con cada vano válido recortado como un agujero
 * pasante — no una caja decorativa encima de un muro intacto.
 *
 * ## Por qué es un cuerpo aparte y no un nodo más de `solid3d-build.ts`
 *
 * Un `SOLID3D` persiste su propio árbol de construcción (extrude/boolean/...)
 * como RECETA del documento. Un `wall` no: su receta es el eje, el grosor y
 * la altura, y el volumen se deriva cada vez —igual que su contorno de
 * planta—, nunca se persiste. Meter el muro en el árbol de `solid3d` habría
 * exigido que cada muro cargara con un árbol de operaciones que nadie edita
 * nunca, sólo para reusar el evaluador. Lo que SÍ se reusa es el kernel de
 * abajo (`makeBox`, `booleanDifference`): la frontera de propiedad está en el
 * ÁRBOL persistido, no en las primitivas del kernel.
 *
 * ## El marco LOCAL, y por qué evita una rotación 3D
 *
 * Un muro nunca se inclina: se extruye recto hacia arriba desde su eje de
 * planta. Eso hace que el marco local pueda ser:
 *
 *   X = a lo largo del eje, desde `start` (0 → longitud)
 *   Y = a través del grosor, centrado en el eje (−grosor/2 → +grosor/2)
 *   Z = altura desde el suelo (0 → `height`)
 *
 * y que llevarlo al mundo sea una rotación 2D en planta (`wallAxisPoint`, ya
 * existente y probada en `wall-openings.ts`) más un desplazamiento directo en
 * Z — nunca una rotación 3D completa. Los vanos cortan a través de Y (el
 * grosor), que es exactamente por dónde pasa una puerta o una ventana.
 */
import { booleanDifference, makeBox, vec3, type BrepBody } from "../brep";
import type { CadWallEntity } from "./cad-entities-v6";
import type { CadOpeningEntity } from "./cad-entities-v7";
import { wallLength } from "./wall-geometry";
import { wallOpeningFit, wallOpeningVerticalFit } from "./wall-openings";

export type CadWallSolidRecipe = Pick<
  CadWallEntity,
  "start" | "end" | "thickness" | "height"
>;
export type CadWallSolidOpening = Pick<
  CadOpeningEntity,
  "position" | "width" | "sill" | "height"
>;

/**
 * Cuerpo B-rep del muro en coordenadas LOCALES (ver cabecera del módulo).
 *
 * Cada vano se resta como agujero pasante SÓLO si encaja horizontal y
 * verticalmente en su anfitrión (`wallOpeningFit` + `wallOpeningVerticalFit`)
 * — el mismo criterio fail-closed que ya aplica la planta 2D: un vano
 * imposible no corta nada, no tumba el muro entero. Una booleana que resulta
 * degenerada (p. ej. dos vanos que rozan borde con borde tras redondeo) se
 * salta de la misma forma; el documento con vanos solapados ya lo rechaza
 * `assertOpeningHosts` en la frontera del servidor, así que llegar aquí con
 * ese defecto sólo puede pasar mientras el documento vive en memoria.
 *
 * `null` para una receta degenerada — eje de longitud nula, grosor o altura
 * no positivos — igual que `wallFootprint`.
 */
export function wallSolidBodyLocal(
  wall: CadWallSolidRecipe,
  openings: readonly CadWallSolidOpening[],
): BrepBody | null {
  const length = wallLength(wall);
  if (!(length > 1e-9) || !(wall.thickness > 0) || !(wall.height > 0))
    return null;
  const half = wall.thickness / 2;
  // Sobre-corte: evita caras EXACTAMENTE coincidentes entre la caja
  // recortadora y las caras del muro, la clase de degenerado con la que un
  // kernel de booleanas tropieza más a menudo.
  const overshoot = Math.max(half * 0.5, 1e-3);

  let body = makeBox({
    min: vec3(0, -half, 0),
    max: vec3(length, half, wall.height),
  });

  for (const opening of openings) {
    if (!(opening.width > 0) || !(opening.height > 0)) continue;
    if (
      !wallOpeningFit(wall, {
        position: opening.position,
        width: opening.width,
      }).ok
    )
      continue;
    if (
      !wallOpeningVerticalFit(wall, {
        sill: opening.sill,
        height: opening.height,
      }).ok
    )
      continue;
    const from = opening.position - opening.width / 2;
    const to = opening.position + opening.width / 2;
    const cutter = makeBox({
      min: vec3(from, -half - overshoot, opening.sill),
      max: vec3(to, half + overshoot, opening.sill + opening.height),
    });
    try {
      body = booleanDifference(body, cutter);
    } catch {
      continue;
    }
  }
  return body;
}

/** Volumen exacto del muro MACIZO (sin vanos), para contrastar la booleana. */
export function wallSolidVolume(wall: CadWallSolidRecipe): number | null {
  const length = wallLength(wall);
  if (!(length > 1e-9) || !(wall.thickness > 0) || !(wall.height > 0))
    return null;
  return length * wall.thickness * wall.height;
}
