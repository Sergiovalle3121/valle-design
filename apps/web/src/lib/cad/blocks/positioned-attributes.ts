/**
 * Atributos POSICIONADOS de un INSERT: dónde se dibuja cada etiqueta.
 *
 * ## El defecto que este módulo cierra
 *
 * El esquema 4 añadió `insert.positionedAttributes`: los mismos atributos que
 * el `Record<string,string>` de siempre, pero CON geometría, en coordenadas de
 * MUNDO. Nadie los escribía y nadie los transformaba, así que la primera vez
 * que alguien los escribiera —este cambio, con INSERT y ATTEDIT— mover el
 * bloque habría dejado el texto de sus atributos exactamente donde estaba: el
 * cajetín se va y su número de plano se queda.
 *
 * Aquí viven las dos mitades:
 *
 * - `cadResolvePositionedAttributes` los CALCULA a partir de la definición del
 *   bloque y la matriz del INSERT.
 * - `cadTransformPositionedAttributes` los MUEVE cuando el INSERT se mueve, y
 *   lo llama el adaptador de INSERT desde la ruta canónica de mutación.
 *
 * ## Reflexión
 *
 * Un ángulo almacenado bajo una matriz REFLECTANTE no se suma: se RESTA de
 * `2φ`, el doble del ángulo del eje. Es la misma regla que aplican MTEXT y
 * `professional-blocks`, y aquí se copia en vez de reinventarse — de
 * `transform2d`, que es donde vive la afín canónica.
 *
 * Módulo HOJA respecto de `entity-runtime`: sólo le pide TIPOS, que se borran
 * al compilar. Si le pidiera un valor cerraría el ciclo que revienta al cargar.
 */
import type {
  CadBlockDefinition,
  CadEntity,
  CadPoint3,
  CadPositionedAttribute,
} from "../cad-document";
import {
  cadAffineApply,
  cadAffineCompose,
  cadAffineFromTransform,
  cadAffineRotation,
  cadAffineScaling,
  cadAffineTranslation,
  cadTransformAngleBase,
  cadTransformIsReflecting,
  cadTransformScaleFactor,
  type CadAffine2,
  type CadAffineTransformInput,
} from "../transform2d";

type CadInsertEntity = Extract<CadEntity, { type: "insert" }>;

/** Alto por defecto de un atributo sin altura propia; el mismo que resuelve el bloque. */
export const CAD_DEFAULT_ATTRIBUTE_HEIGHT = 120;

const normalizeAngleDeg = (value: number) => ((value % 360) + 360) % 360;
const finite = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? Number(value) : fallback;

/**
 * `T(insertion) · R(rotación) · S(escala) · T(−basePoint)`.
 *
 * Es la MISMA composición que `professional-blocks.insertMatrix`; se recompone
 * aquí porque aquella es privada y exportarla obligaría a importar un valor de
 * un módulo que ya está en el ciclo de carga de `entity-runtime`. La escala
 * entra CON SIGNO: `scale.x = −1` es un espejo, y perder ese signo es
 * exactamente el defecto que la ola 1 arregló en el resto del kernel.
 */
export function cadInsertMatrix(
  insert: Pick<CadInsertEntity, "insertion" | "rotation" | "scale">,
  basePoint: CadPoint3,
): CadAffine2 {
  return cadAffineCompose(
    cadAffineTranslation({ x: insert.insertion.x, y: insert.insertion.y }),
    cadAffineCompose(
      cadAffineRotation(finite(insert.rotation, 0)),
      cadAffineCompose(
        cadAffineScaling(finite(insert.scale?.x, 1), finite(insert.scale?.y, 1)),
        cadAffineTranslation({ x: -basePoint.x, y: -basePoint.y }),
      ),
    ),
  );
}

/** Ángulo ALMACENADO después de la transformada. Bajo reflexión se resta de `2φ`. */
function mappedAngle(input: CadAffineTransformInput, angle: number): number {
  const base = cadTransformAngleBase(input);
  return normalizeAngleDeg(cadTransformIsReflecting(input) ? base - angle : angle + base);
}

/**
 * Los atributos de un INSERT con su geometría de mundo ya resuelta.
 *
 * `values` gana a `block.attributes[tag].defaultValue`, salvo en los atributos
 * CONSTANTES, que por definición no admiten valor de instancia. Los invisibles
 * se conservan con su bandera en vez de descartarse: un atributo invisible sigue
 * existiendo para ATTEDIT y para la exportación, sólo no se dibuja.
 */
export function cadResolvePositionedAttributes(
  block: Pick<CadBlockDefinition, "attributes" | "basePoint">,
  insert: Pick<CadInsertEntity, "insertion" | "rotation" | "scale">,
  values: Record<string, string> = {},
): CadPositionedAttribute[] {
  const definitions = Object.entries(block.attributes ?? {});
  if (definitions.length === 0) return [];
  const matrix = cadInsertMatrix(insert, block.basePoint);
  const input: CadAffineTransformInput = { affine: matrix };
  const scale = cadTransformScaleFactor(input);
  return definitions
    // Un atributo SIN posición no tiene dónde dibujarse. Se queda fuera de esta
    // lista y sigue viviendo en `insert.attributes`, que es la vía por etiqueta.
    .filter(([, definition]) => !!definition.position)
    .map(([tag, definition]) => {
      const anchor = cadAffineApply(matrix, definition.position!);
      return {
        tag,
        value: definition.constant
          ? (definition.defaultValue ?? "")
          : (values[tag] ?? definition.defaultValue ?? ""),
        insertion: { x: anchor.x, y: anchor.y, z: definition.position!.z ?? 0 },
        height: (definition.height ?? CAD_DEFAULT_ATTRIBUTE_HEIGHT) * scale,
        rotation: mappedAngle(input, 0),
        ...(definition.style ? { style: definition.style } : {}),
        ...(definition.invisible ? { invisible: true } : {}),
      } satisfies CadPositionedAttribute;
    })
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

/**
 * Mueve los atributos posicionados con su INSERT.
 *
 * Lo llama el adaptador de INSERT dentro de `commands.transform`, que es por
 * donde pasan MOVE, ROTATE, SCALE y MIRROR. Sin esto, mover un cajetín deja su
 * texto atrás y el dibujo queda plausible y equivocado.
 */
export function cadTransformPositionedAttributes(
  attributes: readonly CadPositionedAttribute[],
  transform: CadAffineTransformInput,
): CadPositionedAttribute[] {
  const scale = cadTransformScaleFactor(transform);
  // La afín se resuelve UNA vez para toda la lista: `cadAffineFromTransform` ya
  // sabe leer el vocabulario histórico entero (`translation`, `rotationDeg`,
  // `scale`, `mirror`, `scaleXY`, `affine`), y recomponerla por atributo sería
  // repetir ese trabajo en cada etiqueta de cada cajetín del plano.
  const matrix = cadAffineFromTransform(transform);
  const base = cadTransformAngleBase(transform);
  const reflecting = cadTransformIsReflecting(transform);
  return attributes.map((attribute) => {
    const anchor = cadAffineApply(matrix, attribute.insertion);
    const rotation = attribute.rotation ?? 0;
    return {
      ...attribute,
      insertion: { x: anchor.x, y: anchor.y, z: attribute.insertion.z },
      ...(attribute.height === undefined ? {} : { height: attribute.height * scale }),
      rotation: normalizeAngleDeg(reflecting ? base - rotation : rotation + base),
    };
  });
}
