/**
 * EMPUJAR una cara: la operación que convierte un visor en un modelador.
 *
 * ## Qué hace, y por qué NO construye un prisma y lo une
 *
 * La forma obvia de empujar una cara es fabricar un prisma sobre su contorno y
 * unirlo (o restarlo) al cuerpo. Es obvia y es mala aquí: el prisma comparte una
 * cara ENTERA con el sólido, y una booleana entre dos cuerpos coplanares es
 * justo el caso donde un BSP produce astillas —caras de área casi nula que no
 * son ni de un lado ni del otro—. Nuestro `csg-bsp.ts` no es una excepción.
 *
 * Lo que hace un modelador directo de verdad es más simple y más exacto: NO
 * añade geometría, **mueve la cara**. Los vértices de la cara se desplazan a lo
 * largo de su normal y las caras vecinas se estiran solas. En un prisma —que es
 * el 90 % de lo que un arquitecto empuja: la tapa de un muro, la cara de una
 * losa, el lateral de una caja— eso da el resultado EXACTO, sin una sola
 * booleana, sin astillas y sin error de intersección.
 *
 * ## Por qué las caras vecinas siguen siendo planas (y cuándo no)
 *
 * Una pared lateral de prisma es un cuadrilátero con dos lados PARALELOS: la
 * arista de abajo y la de arriba. Desplazar sólo la de arriba, toda por el mismo
 * vector, deja los cuatro puntos sobre dos rectas paralelas — y dos rectas
 * paralelas definen un plano. La cara sigue siendo plana por construcción, no
 * por suerte.
 *
 * La condición exacta, escrita porque es la que decide si el guardián de abajo
 * salta: desplazar dos vértices de una cara por un vector `t` la mantiene plana
 * si y sólo si `(arista movida) × (arista opuesta) · t = 0`. Cuando las dos
 * aristas son PARALELAS el producto vectorial es nulo y la condición se cumple
 * sea cual sea `t` —el caso del prisma—; y una cara TRIANGULAR es plana siempre,
 * por tener sólo tres puntos.
 *
 * De ahí sale un hecho que conviene no exagerar: en un sólido cuyas caras son
 * todas polígonos planos —cajas, prismas de cualquier perfil, pirámides,
 * extrusiones con desmoldeo— empujar una cara por su normal **no comba a
 * ninguna vecina**. El guardián de abajo es una red de seguridad para cuerpos
 * exóticos o mal cosidos, no un rechazo que alguien vaya a encontrarse
 * dibujando. Se conserva porque cuesta poco y porque, el día que aparezca un
 * cuerpo así, dejarlo pasar significa una cara combada unos milímetros que no se
 * ven en pantalla y aparecen al fabricar.
 *
 * ## Empujar hacia dentro
 *
 * Una distancia negativa hunde la cara, y es la mitad del gesto: así se hace un
 * rebaje. Lo que no se permite es atravesar el sólido — el cuerpo se plegaría
 * sobre sí mismo y el volumen saldría negativo. Se comprueba con el volumen,
 * que es la única señal que no depende de adivinar la topología.
 */
import {
  bodyToFaceSpecs,
  buildBody,
  faceCentroid,
  faceGeometricNormal,
  facePlanarity,
  loopVertices,
  planarFaceArea,
  planarBodyVolume,
  v3Add,
  v3Length,
  v3Scale,
  validateBody,
  type BrepBody,
  type Vec3,
} from "@/lib/brep";
import { aabbDiagonal, bodyBounds } from "@/lib/brep";

export interface CadFacePushResult {
  body: BrepBody;
  /** Volumen antes del empujón. */
  volumeBefore: number;
  /** Volumen después. */
  volumeAfter: number;
  /**
   * Área de la cara empujada × distancia — el volumen que se habría añadido si
   * el barrido fuese un PRISMA, es decir si las paredes vecinas fuesen
   * paralelas al empujón.
   *
   * Coincide con `volumeAfter − volumeBefore` exactamente en ese caso, que es el
   * de una caja o un prisma de cualquier perfil, y sirve entonces como
   * comprobación independiente de la topología. **No coincide cuando el sólido
   * se estrecha**: en una pirámide, mover la base cambia también la sección de
   * todo lo que hay encima, y el volumen real crece un tercio de esta cifra. Se
   * publica con ese nombre y esta advertencia en vez de llamarlo «esperado»,
   * que sería mentira en cuanto la pieza deja de ser un prisma.
   */
  prismaticDelta: number;
}

export type CadFacePushOutcome =
  ({ ok: true } & CadFacePushResult) | { ok: false; reason: string };

/** Cuánto puede separarse una cara de su plano medio, relativo a su tamaño. */
const PLANARITY_RATIO = 1e-7;

function fail(reason: string): CadFacePushOutcome {
  return { ok: false, reason };
}

/**
 * Empuja la cara `face` del cuerpo `body` una distancia `distance` a lo largo de
 * su normal geométrica. Positivo saca material, negativo lo hunde.
 */
export function cadPushFace(
  body: BrepBody,
  face: number,
  distance: number,
): CadFacePushOutcome {
  if (face < 0 || face >= body.faces.length)
    return fail(
      `El sólido no tiene la cara ${face + 1}: tiene ${body.faces.length} cara(s), numeradas desde 1.`,
    );

  if (!Number.isFinite(distance))
    return fail("La distancia del empujón tiene que ser un número finito.");

  const scale = Math.max(aabbDiagonal(bodyBounds(body)), 1e-12);

  if (Math.abs(distance) <= scale * 1e-12)
    return fail(
      "Un empujón de distancia cero no cambia nada. Indique cuánto quiere mover la cara.",
    );

  const rawNormal = faceGeometricNormal(body, face);
  const normalLength = v3Length(rawNormal);
  if (normalLength < 0.5)
    return fail(
      `La cara ${face + 1} está degenerada: no tiene normal, así que no hay dirección en la que empujarla.`,
    );
  const normal: Vec3 = v3Scale(rawNormal, 1 / normalLength);

  const startPlanarity = facePlanarity(body, face);
  const faceScale = Math.max(
    Math.sqrt(Math.abs(planarFaceArea(body, face))),
    scale * 1e-6,
  );
  if (startPlanarity > faceScale * PLANARITY_RATIO)
    return fail(
      `La cara ${face + 1} no es plana: sus vértices se separan ${startPlanarity.toExponential(3)} ` +
        `unidades de su plano medio. Empujarla movería una superficie que no existe.`,
    );

  // --- Los vértices que se mueven: TODOS los lazos de la cara, contorno y agujeros.
  const moving = new Set<number>();
  for (const loop of body.faces[face].loops) {
    for (const vertex of loopVertices(body, loop)) moving.add(vertex);
  }
  if (moving.size < 3)
    return fail(
      `La cara ${face + 1} tiene menos de tres vértices: no es una cara que se pueda empujar.`,
    );

  // --- El cuerpo nuevo: los MISMOS lazos, con esos vértices desplazados.
  const points: Vec3[] = body.vertices.map((vertex, index) =>
    moving.has(index)
      ? v3Add(vertex.point, v3Scale(normal, distance))
      : { ...vertex.point },
  );
  const specs = bodyToFaceSpecs(body);
  const pushed = buildBody(points, specs);

  // --- ¿Alguna vecina se salió de su plano? Se nombra la primera.
  for (let other = 0; other < pushed.faces.length; other += 1) {
    if (other === face) continue;
    const deviation = facePlanarity(pushed, other);
    const otherScale = Math.max(
      Math.sqrt(Math.abs(planarFaceArea(pushed, other))),
      scale * 1e-6,
    );
    if (deviation > otherScale * PLANARITY_RATIO)
      return fail(
        `Este empujón dejaría la cara ${other + 1} combada: sus vértices se separarían ` +
          `${deviation.toExponential(3)} unidades de su plano. Estirar una cara vecina la mantiene ` +
          `plana cuando sus lados opuestos son paralelos —el caso de cualquier prisma— y ésta no lo ` +
          `cumple. Coser paredes nuevas en vez de estirar las viejas todavía no está implementado.`,
      );
  }

  // --- El volumen ANTES que los invariantes, a propósito.
  //
  // Hundir la cara más allá del propio sólido lo pliega sobre sí mismo, y
  // `validateBody` sí lo detecta —dice «las caras miran hacia DENTRO»—. Pero eso
  // es el síntoma visto desde el kernel, no la causa vista desde quien dibuja,
  // que simplemente tiró de más. Se comprueba primero para que gane el motivo
  // sobre el que se puede actuar.
  const volumeBefore = planarBodyVolume(body);
  const volumeAfter = planarBodyVolume(pushed);
  if (!(volumeAfter > 0))
    return fail(
      `Ese empujón atraviesa el sólido: lo dejaría con volumen ${volumeAfter.toExponential(3)}. ` +
        `Para perforar una pieza use una operación booleana, no un empujón.`,
    );

  // --- Invariantes del kernel. Es para lo que existen.
  const validation = validateBody(pushed, {
    requireClosed: true,
    requirePlanarFaces: true,
  });
  if (!validation.ok)
    return fail(
      `El empujón produciría un sólido inválido: ` +
        validation.violations.map((violation) => violation.message).join(" | "),
    );

  return {
    ok: true,
    body: pushed,
    volumeBefore,
    volumeAfter,
    prismaticDelta: Math.abs(planarFaceArea(body, face)) * distance,
  };
}

/**
 * El punto de la cara desde el que arrastrar, para que la banda elástica salga
 * de donde el usuario pinchó y no de un sitio arbitrario.
 */
export function cadFacePushAnchor(body: BrepBody, face: number): Vec3 {
  return faceCentroid(body, face);
}
