/**
 * Transformada afín 2×3 del CAD canónico.
 *
 * ## Por qué existe
 *
 * Hoy cada adaptador de entidad aplica `{translation, rotationDeg, scale,
 * origin}` por su cuenta, y ese vocabulario **no puede expresar un espejo ni
 * una escala no uniforme**: por eso MIRROR no existe como operación canónica y
 * SCALE sólo es uniforme. Una afín sí los expresa, y además compone: espejar y
 * luego girar es una sola matriz, no dos pasadas con dos redondeos.
 *
 * ## Convención
 *
 * ```text
 * | a  c  e |   | x |     x' = a·x + c·y + e
 * | b  d  f | · | y |     y' = b·x + d·y + f
 * | 0  0  1 |   | 1 |
 * ```
 *
 * Es la convención de SVG/Canvas (`matrix(a b c d e f)`), elegida para que la
 * matriz se pueda pasar tal cual a un contexto 2D o a un atributo `transform`
 * sin reordenar nada.
 *
 * ## Invariantes que el resto del kernel puede asumir
 *
 * - `cadAffineDet(m) < 0` ⟺ la transformada **invierte la orientación**. Es la
 *   única señal fiable de "esto es un espejo", y de ella dependen reglas que si
 *   se olvidan producen dibujos corruptos en silencio: el `bulge` de una
 *   polilínea cambia de signo, un arco DXF —siempre antihorario— necesita
 *   intercambiar sus ángulos, y el ángulo de patrón de un sombreado pasa a
 *   `180° − ángulo`.
 * - `cadAffineIsConformal(m)` ⟺ conserva ángulos y por tanto la forma. Un
 *   círculo sólo sigue siendo círculo bajo una afín conforme; si no lo es, la
 *   entidad debe convertirse en elipse.
 *
 * Módulo puro: sin THREE, sin DOM, sin estado. Se prueba en Node.
 */
import type { CadPoint2 } from "./cad-document";

export interface CadAffine2 {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * Forma estructural de una transformada de entidad. Se declara aquí, y no se
 * importa `CadEntityTransform`, para no crear un ciclo
 * `entity-runtime → transform2d → entity-runtime`. `CadEntityTransform` es
 * asignable a este tipo, así que la conversión funciona sin adaptadores.
 */
export interface CadAffineTransformInput {
  translation?: CadPoint2;
  rotationDeg?: number;
  /** Escala uniforme. `scaleXY` gana cuando ambas están presentes. */
  scale?: number;
  scaleXY?: CadPoint2;
  /** Eje de reflexión: un punto y una dirección (no hace falta normalizarla). */
  mirror?: { point: CadPoint2; direction: CadPoint2 };
  origin?: CadPoint2;
  /** Escotilla de escape: si viene, gana sobre todo lo demás. */
  affine?: CadAffine2;
}

const EPSILON = 1e-9;

export function cadAffineIdentity(): CadAffine2 {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

export function cadAffineTranslation(translation: CadPoint2): CadAffine2 {
  return { a: 1, b: 0, c: 0, d: 1, e: translation.x, f: translation.y };
}

/**
 * Compone `outer ∘ inner`: se aplica **primero `inner`** y después `outer`,
 * igual que en la notación matemática.
 */
export function cadAffineCompose(outer: CadAffine2, inner: CadAffine2): CadAffine2 {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  };
}

/** Envuelve una transformada lineal para que actúe alrededor de `origin`. */
function aboutOrigin(linear: CadAffine2, origin: CadPoint2 | undefined): CadAffine2 {
  if (!origin || (origin.x === 0 && origin.y === 0)) return linear;
  return cadAffineCompose(
    cadAffineTranslation(origin),
    cadAffineCompose(linear, cadAffineTranslation({ x: -origin.x, y: -origin.y })),
  );
}

export function cadAffineRotation(degrees: number, origin?: CadPoint2): CadAffine2 {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return aboutOrigin({ a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }, origin);
}

export function cadAffineScaling(scaleX: number, scaleY: number, origin?: CadPoint2): CadAffine2 {
  return aboutOrigin({ a: scaleX, b: 0, c: 0, d: scaleY, e: 0, f: 0 }, origin);
}

/**
 * Reflexión respecto a la recta que pasa por `point` con dirección `direction`.
 * Una dirección degenerada (longitud cero) no define eje alguno; se devuelve la
 * identidad en vez de propagar `NaN` por todo el documento.
 */
export function cadAffineReflection(point: CadPoint2, direction: CadPoint2): CadAffine2 {
  const length = Math.hypot(direction.x, direction.y);
  if (!(length > EPSILON)) return cadAffineIdentity();
  const ux = direction.x / length;
  const uy = direction.y / length;
  const linear: CadAffine2 = {
    a: ux * ux - uy * uy,
    b: 2 * ux * uy,
    c: 2 * ux * uy,
    d: uy * uy - ux * ux,
    e: 0,
    f: 0,
  };
  return aboutOrigin(linear, point);
}

/**
 * Convierte una transformada declarativa en su afín equivalente.
 *
 * Orden: `p' = origen + R · S · Espejo · (p − origen) + traslación`. Cuando no
 * hay espejo ni escala no uniforme, esto reproduce **exactamente** la fórmula
 * que hoy aplica `transformPoint`, así que la conversión es compatible hacia
 * atrás y los adaptadores pueden migrar de uno en uno.
 */
export function cadAffineFromTransform(transform: CadAffineTransformInput): CadAffine2 {
  if (transform.affine) return { ...transform.affine };

  const origin = transform.origin;
  const scaleX = transform.scaleXY?.x ?? transform.scale ?? 1;
  const scaleY = transform.scaleXY?.y ?? transform.scale ?? 1;

  let linear = cadAffineIdentity();
  if (transform.mirror) {
    // El espejo se compone en el espacio local, así que su punto se expresa
    // relativo al origen del conjunto.
    const local = origin
      ? { x: transform.mirror.point.x - origin.x, y: transform.mirror.point.y - origin.y }
      : transform.mirror.point;
    linear = cadAffineReflection(local, transform.mirror.direction);
  }
  if (scaleX !== 1 || scaleY !== 1)
    linear = cadAffineCompose(cadAffineScaling(scaleX, scaleY), linear);
  if (transform.rotationDeg)
    linear = cadAffineCompose(cadAffineRotation(transform.rotationDeg), linear);

  const positioned = aboutOrigin(linear, origin);
  return transform.translation
    ? cadAffineCompose(cadAffineTranslation(transform.translation), positioned)
    : positioned;
}

export function cadAffineApply(matrix: CadAffine2, point: CadPoint2): CadPoint2 {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

/** Aplica sólo la parte lineal: para direcciones y ejes, que no se trasladan. */
export function cadAffineApplyVector(matrix: CadAffine2, vector: CadPoint2): CadPoint2 {
  return {
    x: matrix.a * vector.x + matrix.c * vector.y,
    y: matrix.b * vector.x + matrix.d * vector.y,
  };
}

export function cadAffineDet(matrix: CadAffine2): number {
  return matrix.a * matrix.d - matrix.b * matrix.c;
}

/** `true` cuando la transformada invierte la orientación (hay un espejo). */
export function cadAffineIsReflecting(matrix: CadAffine2): boolean {
  return cadAffineDet(matrix) < 0;
}

/** Inversa, o `null` si la matriz es singular (escala cero, geometría aplastada). */
export function cadAffineInvert(matrix: CadAffine2): CadAffine2 | null {
  const det = cadAffineDet(matrix);
  if (!Number.isFinite(det) || Math.abs(det) < EPSILON) return null;
  return {
    a: matrix.d / det,
    b: -matrix.b / det,
    c: -matrix.c / det,
    d: matrix.a / det,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / det,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / det,
  };
}

/** Giro de la imagen del eje +X, en grados dentro de `[0, 360)`. */
export function cadAffineAngle(matrix: CadAffine2): number {
  const degrees = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

/** Factores de escala de cada eje. Siempre positivos: el signo lo lleva `det`. */
export function cadAffineScaleXY(matrix: CadAffine2): CadPoint2 {
  return {
    x: Math.hypot(matrix.a, matrix.b),
    y: Math.hypot(matrix.c, matrix.d),
  };
}

/**
 * `true` cuando la transformada conserva ángulos: sus columnas son ortogonales
 * y de la misma longitud. Es la condición exacta para que un círculo siga
 * siendo un círculo y un arco siga siendo un arco.
 */
export function cadAffineIsConformal(matrix: CadAffine2, epsilon = 1e-9): boolean {
  const scale = cadAffineScaleXY(matrix);
  if (!(scale.x > epsilon) || !(scale.y > epsilon)) return false;
  const orthogonality = matrix.a * matrix.c + matrix.b * matrix.d;
  return (
    Math.abs(scale.x - scale.y) <= epsilon * Math.max(1, scale.x, scale.y) &&
    Math.abs(orthogonality) <= epsilon * Math.max(1, scale.x * scale.y)
  );
}

export function cadAffineEquals(left: CadAffine2, right: CadAffine2, epsilon = 1e-9): boolean {
  return (
    Math.abs(left.a - right.a) <= epsilon &&
    Math.abs(left.b - right.b) <= epsilon &&
    Math.abs(left.c - right.c) <= epsilon &&
    Math.abs(left.d - right.d) <= epsilon &&
    Math.abs(left.e - right.e) <= epsilon &&
    Math.abs(left.f - right.f) <= epsilon
  );
}

/**
 * Aplica una transformada a un punto CON elevación.
 *
 * Existe para que haya UNA sola implementación. Había dos, casi idénticas —una
 * en `entity-runtime.ts` y otra en `basic-native-adapters.ts`—, y diferían
 * exactamente en una línea: la de `entity-runtime` hacía `z: point.z * scale` y
 * la de `basic-native-adapters` hacía `z: point.z`. Consecuencia: escalar una
 * selección que contuviera una línea y una polilínea las dejaba en planos de
 * elevación DISTINTOS. En una escena 3D eso es z-fighting y orden de dibujo
 * equivocado entre un muro y su perfil, sin un solo error por ningún sitio.
 *
 * ## La decisión sobre `z`, explícita
 *
 * **La elevación no se escala.** Escalar una planta al doble no sube los
 * objetos al doble de altura; son cosas distintas y en AutoCAD también lo son.
 * Se elige la versión de `basic-native-adapters`, que además coincide con la
 * de `professional-blocks.ts`: dos de las tres implementaciones ya lo hacían
 * así. En la práctica el cambio es invisible porque las entidades nativas se
 * proyectan a una elevación fija de viewport, pero dejarlo sin decidir era
 * garantizar que reapareciera.
 *
 * Bajo una afín general no existe «el factor de escala» —hay dos, y pueden
 * diferir—, así que multiplicar `z` por uno de ellos no tendría ni siquiera un
 * significado que defender.
 */
export function cadTransformPoint3<P extends { x: number; y: number; z: number }>(
  point: P,
  transform: CadAffineTransformInput,
): { x: number; y: number; z: number } {
  // Camino heredado, BIT A BIT.
  //
  // Para el vocabulario clásico —traslación, giro y escala uniforme— se evalúa
  // la misma expresión que evaluaban las dos copias que esta función sustituye,
  // en el mismo orden. No es purismo: componer la matriz y aplicarla da el
  // mismo número real pero NO el mismo `double`. Se midió sobre 3.000 casos y
  // sólo 607 salían idénticos, con desviaciones de hasta 1,5e-11.
  //
  // Esa diferencia es invisible en el dibujo y perfectamente visible en el
  // producto: la versión de una entidad se calcula con `JSON.stringify`, así
  // que un último dígito distinto la marca como cambiada, dispara un guardado
  // extra y rompe seis goldens que afirman `version === 1`. Reproducir el
  // orden de evaluación es lo que hace que unificar las dos copias sea una
  // refactorización y no un cambio de comportamiento.
  //
  // Reflexión, escala no uniforme y afín cruda son capacidades NUEVAS: no
  // tienen comportamiento heredado que preservar y van por la matriz.
  if (!transform.affine && !transform.mirror && !transform.scaleXY) {
    const origin = transform.origin ?? { x: 0, y: 0 };
    const scale = transform.scale ?? 1;
    const radians = ((transform.rotationDeg ?? 0) * Math.PI) / 180;
    const dx = (point.x - origin.x) * scale;
    const dy = (point.y - origin.y) * scale;
    return {
      x:
        origin.x +
        dx * Math.cos(radians) -
        dy * Math.sin(radians) +
        (transform.translation?.x ?? 0),
      y:
        origin.y +
        dx * Math.sin(radians) +
        dy * Math.cos(radians) +
        (transform.translation?.y ?? 0),
      z: point.z,
    };
  }
  const moved = cadAffineApply(cadAffineFromTransform(transform), point);
  return { x: moved.x, y: moved.y, z: point.z };
}

/**
 * Aplica sólo la parte LINEAL a un vector (una dirección, no una posición).
 *
 * La distinción importa y es la fuente de un error clásico: el eje mayor de una
 * elipse es un vector desde su centro, no un punto del dibujo. Pasarlo por
 * `cadTransformPoint3` le sumaría la traslación y lo mandaría a la otra punta
 * del plano, alargando la elipse en proporción a lo lejos que estuviera del
 * origen. Aquí la traslación no participa, por construcción.
 *
 * `z` se conserva por el mismo motivo que en `cadTransformPoint3`.
 */
export function cadTransformVector3<P extends { x: number; y: number; z: number }>(
  vector: P,
  transform: CadAffineTransformInput,
): { x: number; y: number; z: number } {
  const moved = cadAffineApplyVector(cadAffineFromTransform(transform), vector);
  return { x: moved.x, y: moved.y, z: vector.z };
}

/**
 * ¿Esta transformada invierte la orientación del plano?
 *
 * La pregunta que **todos** los adaptadores tienen que hacerse, porque bajo
 * determinante negativo hay campos que no se transforman: se invierten. El
 * `bulge` de una polilínea cambia de signo, un arco DXF —siempre antihorario—
 * intercambia sus extremos, el ángulo de un patrón de sombreado pasa de α a
 * `2φ − α`. Olvidar cualquiera de ellos no da error: da un dibujo plausible y
 * equivocado.
 */
export function cadTransformIsReflecting(transform: CadAffineTransformInput): boolean {
  return cadAffineIsReflecting(cadAffineFromTransform(transform));
}

/**
 * Ángulo `φ` que gobierna la reflexión de todo campo angular almacenado.
 *
 * Bajo una reflexión de eje `φ/2`, una dirección de ángulo α acaba en
 * `φ − α`. `cadAffineAngle` devuelve `atan2(b, a)`, que para una reflexión pura
 * vale exactamente `2·(ángulo del eje)` — de ahí que la regla se escriba igual
 * para todos: `ángulo' = cadTransformAngleBase(t) − ángulo`.
 *
 * Bajo una transformada NO reflectante el mismo valor es el giro, y la regla es
 * la suma de siempre. Por eso conviene un único sitio del que sacarlo.
 */
export function cadTransformAngleBase(transform: CadAffineTransformInput): number {
  // `cadAffineAngle` YA devuelve grados en [0, 360). Convertirlos otra vez es
  // el error que esta línea tuvo una vez y que la spec cazó al instante: un
  // arco de 30° salía a 20.656°.
  return cadAffineAngle(cadAffineFromTransform(transform));
}

/**
 * Factor de escala de longitudes: la raíz del valor absoluto del determinante.
 *
 * Es la media geométrica de las dos escalas principales, así que para una
 * similitud —el único caso en que un radio sigue siendo un radio— es exacta.
 * Para una afín anisótropa no existe «el» factor: un círculo deja de ser un
 * círculo, y eso lo resuelve el adaptador cambiando de tipo, no este número.
 */
export function cadTransformScaleFactor(transform: CadAffineTransformInput): number {
  return Math.sqrt(Math.abs(cadAffineDet(cadAffineFromTransform(transform))));
}
