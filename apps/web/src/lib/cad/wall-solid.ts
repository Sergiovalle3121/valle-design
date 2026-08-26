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
import {
  booleanDifference,
  extrudeProfile,
  makeBox,
  vec3,
  type BrepBody,
} from "../brep";
import type { CadWallEntity } from "./cad-entities-v6";
import type { CadOpeningEntity } from "./cad-entities-v7";
import { wallLength } from "./wall-geometry";
import type { CadWallJoins } from "./wall-joins";
import { wallOpeningFit, wallOpeningVerticalFit } from "./wall-openings";
import type { CadWallOpeningCutDiagnostic } from "./wall-solid-diagnostics";

export type CadWallSolidRecipe = Pick<
  CadWallEntity,
  "start" | "end" | "thickness" | "height"
>;
export type CadWallSolidOpening = Pick<
  CadOpeningEntity,
  "position" | "width" | "sill" | "height"
>;

/**
 * Contorno LOCAL del muro con sus uniones aplicadas, o `null` cuando la caja
 * de siempre es la respuesta correcta (sin uniones, o uniones sin ajuste).
 *
 * Es `wallJoinedFootprint` en el marco local: cada esquina se desliza POR SU
 * CARA la extensión firmada de su extremo — X negativa extiende el arranque,
 * X > longitud extiende el remate. El anillo resultante siempre es simple:
 * las dos caras largas viven en las rectas paralelas y = ±grosor/2, y con
 * cada cara conservando longitud positiva los testeros no pueden cruzarse
 * (la separación entre ambos es lineal en y, positiva en las dos caras).
 * Si un recorte CONSUME una cara entera, se devuelve `null` y el cuerpo cae
 * a la caja base — exactamente el mismo `?? footprint` con el que la planta
 * 2D degrada un anillo invertido, nunca un sólido del revés.
 */
function wallJoinedLocalOutline(
  length: number,
  half: number,
  joins: CadWallJoins | null | undefined,
): { x: number; y: number }[] | null {
  if (!joins) return null;
  const { start, end } = joins;
  if (
    start.leftExtension === 0 &&
    start.rightExtension === 0 &&
    end.leftExtension === 0 &&
    end.rightExtension === 0
  )
    return null;
  const startLeft = -start.leftExtension;
  const startRight = -start.rightExtension;
  const endLeft = length + end.leftExtension;
  const endRight = length + end.rightExtension;
  if (!(endLeft - startLeft > 1e-9) || !(endRight - startRight > 1e-9))
    return null;
  // Antihorario, mismo orden que `wallFootprint`: [SL, SR, ER, EL].
  return [
    { x: startLeft, y: half },
    { x: startRight, y: -half },
    { x: endRight, y: -half },
    { x: endLeft, y: half },
  ];
}

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
 * `joins` (opcional) son las uniones L/T del muro contra sus vecinos, las
 * MISMAS que la planta 2D deriva con `wallJoins`: con ellas el volumen se
 * extruye del contorno ajustado — el inglete de la L y el empalme de la T se
 * ven en 3D igual que en planta, y la masa que un recorte cede al vecino no
 * se cuenta dos veces. Sin `joins`, la caja de siempre: el muro solitario no
 * paga las uniones ni en vértices ni en tiempo.
 *
 * `null` para una receta degenerada — eje de longitud nula, grosor o altura
 * no positivos — igual que `wallFootprint`.
 */
export function wallSolidBodyLocal(
  wall: CadWallSolidRecipe,
  openings: readonly CadWallSolidOpening[],
  joins?: CadWallJoins | null,
): BrepBody | null {
  return wallSolidBodyLocalWithDiagnostics(wall, openings, joins).body;
}

export interface CadWallSolidBodyResult {
  body: BrepBody | null;
  /** Un elemento por vano que NO se recortó, con su motivo tipado. */
  diagnostics: CadWallOpeningCutDiagnostic[];
}

/**
 * Igual que `wallSolidBodyLocal`, pero cada vano que NO se recorta deja un
 * diagnóstico tipado con su índice y su causa (`wall-solid-diagnostics.ts`)
 * en vez de desaparecer en silencio. La geometría resultante es idéntica a la
 * de la variante sin diagnósticos — este contrato no cambia qué se corta,
 * cambia qué se CALLA.
 */
export function wallSolidBodyLocalWithDiagnostics(
  wall: CadWallSolidRecipe,
  openings: readonly CadWallSolidOpening[],
  joins?: CadWallJoins | null,
): CadWallSolidBodyResult {
  const diagnostics: CadWallOpeningCutDiagnostic[] = [];
  const length = wallLength(wall);
  if (!(length > 1e-9) || !(wall.thickness > 0) || !(wall.height > 0))
    return { body: null, diagnostics };
  const half = wall.thickness / 2;
  // Sobre-corte: evita caras EXACTAMENTE coincidentes entre la caja
  // recortadora y las caras del muro, la clase de degenerado con la que un
  // kernel de booleanas tropieza más a menudo.
  const overshoot = Math.max(half * 0.5, 1e-3);

  const outline = wallJoinedLocalOutline(length, half, joins);
  let body = outline
    ? extrudeProfile({ profile: { outer: outline }, height: wall.height })
    : makeBox({
        min: vec3(0, -half, 0),
        max: vec3(length, half, wall.height),
      });

  openings.forEach((opening, openingIndex) => {
    if (!(opening.width > 0) || !(opening.height > 0)) {
      diagnostics.push({
        openingIndex,
        kind: "degenerate-size",
        cause: `width=${opening.width}, height=${opening.height}`,
      });
      return;
    }
    const horizontal = wallOpeningFit(wall, {
      position: opening.position,
      width: opening.width,
    });
    if (!horizontal.ok) {
      diagnostics.push({
        openingIndex,
        kind: "horizontal-misfit",
        cause: horizontal.problem,
      });
      return;
    }
    const vertical = wallOpeningVerticalFit(wall, {
      sill: opening.sill,
      height: opening.height,
    });
    if (!vertical.ok) {
      diagnostics.push({
        openingIndex,
        kind: "vertical-misfit",
        cause: vertical.problem,
      });
      return;
    }
    const from = opening.position - opening.width / 2;
    const to = opening.position + opening.width / 2;
    const cutter = makeBox({
      min: vec3(from, -half - overshoot, opening.sill),
      max: vec3(to, half + overshoot, opening.sill + opening.height),
    });
    try {
      body = booleanDifference(body, cutter);
    } catch (error) {
      // La causa del kernel se CONSERVA: es la diferencia entre «el muro
      // salió macizo, quién sabe por qué» y un defecto accionable.
      diagnostics.push({
        openingIndex,
        kind: "boolean-failed",
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  });
  return { body, diagnostics };
}

/** Volumen exacto del muro MACIZO (sin vanos), para contrastar la booleana. */
export function wallSolidVolume(wall: CadWallSolidRecipe): number | null {
  const length = wallLength(wall);
  if (!(length > 1e-9) || !(wall.thickness > 0) || !(wall.height > 0))
    return null;
  return length * wall.thickness * wall.height;
}
