/**
 * EL TUBO COMO CUERPO FACETADO: la ruta deja de ser una línea y ocupa sitio.
 *
 * ## Qué faltaba, medido
 *
 * `docs/competitive/rubric.json`, criterio `toolset-plant3d`, campo `gap`:
 * *«…sólido de tubería con su diámetro en el visor 3D…»*. Hasta aquí una ruta
 * era una polilínea con cota: se veía como un alambre, no tapaba nada, no salía
 * en un ortográfico y no se podía mirar en el visor 3D para ver si el trazado
 * cabe. Éste es el módulo que le pone volumen.
 *
 * ## Es FACETADO, y el polígono es de 16 lados
 *
 * El kernel de este producto es un B-rep de medias-aristas FACETADO
 * (`ADR-0016`): un cilindro es un prisma de N lados y un STEP exportado conserva
 * la faceta, no la superficie que la generó. Aquí N = 16, que es el compromiso
 * habitual entre verse redondo en pantalla y no llenar el documento de caras:
 * un tramo con tres vértices densificados son ya 9 secciones × 16 = 144
 * vértices. Nada de esto se insinúa como un cilindro exacto — se dice.
 *
 * ## El diámetro es el NOMINAL, y el polígono es de ÁREA EQUIVALENTE
 *
 * El radio de partida es `pulgadas × 25,4 / 2`, el mismo nominal que usa
 * `clash.ts` y por el mismo motivo: el exterior real y el aislamiento los da el
 * catálogo del proyecto, que este repositorio no transcribe.
 *
 * Sobre ese nominal hay una segunda decisión que conviene ver escrita. Un
 * 16-gono INSCRITO en el círculo nominal tiene un 2,55 % menos de sección
 * (`½·n·r²·sen(2π/n)` frente a `π r²`), y ese 2,55 % viaja al volumen, al peso
 * y a cualquier metrado que alguien saque del sólido. Así que el polígono se
 * dimensiona por **área equivalente**: el circunradio es
 * `r · √(2π / (n·sen(2π/n)))` = `1,013 · r`, de modo que la sección del prisma
 * es exactamente `π r²`. Consecuencia, dicha en voz alta: medido entre caras el
 * tubo sale 0,65 % más estrecho que el nominal y entre aristas 1,3 % más ancho.
 * Es una faceta, no un cilindro, y así se mide.
 *
 * ## El camino se DENSIFICA a ±100 mm de cada vértice, y no es cosmético
 *
 * `lib/brep/sweep.ts` coloca el perfil en el PLANO BISECTOR de cada vértice del
 * camino, y —lo dice su propia cabecera— no lo estira por `1/cos(θ/2)`. En un
 * codo de 90° eso estrecha la sección en ese punto por un factor `cos 45°`. Lo
 * caro no es el pellizco: es que sin puntos intermedios la sección de un
 * extremo del tramo y la del codo son las dos únicas del tramo, así que el
 * estrechamiento se INTERPOLA a lo largo de metros de tubo.
 *
 * Medido en este repositorio con `solid3dMassProperties`, ruta de 6" con un
 * montante de 90° (6 000 en planta + 3 000 de subida, `π r² L` = 164 173 223):
 *
 * | camino                | volumen     | error   |
 * | --------------------- | ----------- | ------- |
 * | crudo (3 puntos)      | 143 270 359 | −12,7 % |
 * | densificado a ±100 mm | 163 638 943 | −0,33 % |
 *
 * Con puntos a ±100 mm del vértice el pellizco se queda LOCAL —la pérdida es
 * fija, ≈ 0,29 · área · 100 mm por codo— y el resto del tramo mide lo que debe.
 * `pipe-solid.spec.ts` fija las dos cifras a propósito: quitar el densificado
 * es perder un 12 % del metrado, y nadie debería poder hacerlo sin verlo.
 *
 * ## El sólido se PERSISTE, y ésa es su deuda honesta
 *
 * `pipe-route.ts` deduce los accesorios de la geometría en vez de colocarlos
 * como objetos, precisamente para no mantener dos verdades sincronizadas. Este
 * módulo hace lo contrario: escribe un `solid3d` en el documento. No hay otra
 * salida —el visor 3D y `FLATSHOT` leen entidades, no derivaciones— pero la
 * consecuencia es real: mover un vértice de la ruta deja el sólido viejo.
 *
 * La deuda se paga declarándola, no escondiéndola. El sólido lleva una HUELLA
 * de la geometría de la ruta que lo generó (`pl:huella`), y
 * `cadPipeSolidsStale` la compara con la ruta de hoy. PIDMTO lo dice con todas
 * sus letras: «el sólido de 6"-P-1001 quedó viejo». Un sólido que miente en
 * silencio sería peor que no tenerlo.
 *
 * ## Lo que sale gratis
 *
 * `flatshot-solids.ts` ya recoge cualquier `solid3d` para proyectar ocultas, así
 * que emitir el tubo como sólido lo pone también en los ortográficos desde el
 * modelo sin tocar ese módulo ni una línea.
 */
import type { CadDocument, CadPoint2, CadPoint3 } from "../cad-document";
import type { CadSolid3dEntity, CadSolidNode, CadSolidProfile } from "../cad-entities-v5";
import { cadUnitToMillimetres } from "../layout/annotative-scale";
import { CAD_PL_LINE, cadPlantLineMetadata } from "./line-numbers";
import {
  cadPipeNominalMillimetres,
  cadPipeRoutesOf,
  type CadPipeRoute,
} from "./pipe-route";

/** Capa del sólido. Separada de `TU-RUTA`: una es el eje, otra el volumen. */
export const CAD_PL_SOLID_LAYER = "TU-SOLIDO";

/** Metadato con el id de la ruta que generó el sólido. */
export const CAD_PL_SOLID_OF = "pl:solido-de";

/** Metadato con la huella de la geometría de la ruta en el momento de barrerla. */
export const CAD_PL_SOLID_PRINT = "pl:huella";

/**
 * Lados del prisma. Dieciséis: por debajo se ve el polígono en pantalla, por
 * encima el documento engorda sin que nadie note la diferencia.
 */
export const CAD_PL_SOLID_SIDES = 16;

/**
 * A qué distancia del vértice se meten los puntos de densificado, en
 * MILÍMETROS. Cien: lo bastante cerca para que la distorsión del plano
 * bisector no se coma un tramo entero, lo bastante lejos para no fabricar
 * secciones degeneradas en un codo de tubo pequeño.
 */
export const CAD_PL_SOLID_DENSIFY_MM = 100;

/** Lo que este sólido NO es, entero y en un solo sitio. */
export const CAD_PL_SOLID_LIMITS =
  `Cuerpo FACETADO: prisma de ${CAD_PL_SOLID_SIDES} lados de área equivalente al círculo NOMINAL (pulgadas × 25,4), no un cilindro exacto — entre caras mide 0,65 % menos que el nominal y entre aristas 1,3 % más. Los codos son a inglete sobre el plano bisector, con el camino densificado a ±${CAD_PL_SOLID_DENSIFY_MM} mm de cada vértice; no hay radio de curvatura de codo, ni pared, ni aislamiento, ni bridas. El sólido se persiste: si la ruta se mueve, PIDMTO avisa de que quedó viejo`;

/**
 * Circunradio del polígono cuya SECCIÓN vale `π r²`.
 *
 * `r · √(2π / (n·sen(2π/n)))`. Ver la cabecera: inscribir el polígono restaría
 * un 2,55 % de sección con `n = 16`, y ese error no se queda en la pantalla,
 * se va al metrado.
 */
export function cadPipeSolidRingRadius(
  nominalRadius: number,
  sides: number = CAD_PL_SOLID_SIDES,
): number {
  const n = Math.max(3, Math.floor(sides));
  return nominalRadius * Math.sqrt((2 * Math.PI) / (n * Math.sin((2 * Math.PI) / n)));
}

/** Perfil poligonal cerrado, antihorario, centrado en el origen del marco. */
export function cadPipeSolidProfile(
  nominalRadius: number,
  sides: number = CAD_PL_SOLID_SIDES,
): CadSolidProfile {
  const n = Math.max(3, Math.floor(sides));
  const radio = cadPipeSolidRingRadius(nominalRadius, n);
  const outer: CadPoint2[] = [];
  for (let i = 0; i < n; i += 1) {
    const angulo = (2 * Math.PI * i) / n;
    outer.push({ x: radio * Math.cos(angulo), y: radio * Math.sin(angulo) });
  }
  return { outer };
}

/**
 * Radio NOMINAL del tubo en unidades de dibujo, o `null` si el tamaño rotulado
 * no es una medida en pulgadas.
 */
export function cadPipeSolidRadius(size: string, unit = "mm"): number | null {
  const mm = cadPipeNominalMillimetres(size);
  if (mm === null) return null;
  const porUnidad = cadUnitToMillimetres(unit);
  return mm / 2 / (porUnidad > 0 ? porUnidad : 1);
}

const largoTramo = (a: CadPoint3, b: CadPoint3): number =>
  Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);

/**
 * El camino con un punto añadido a `spacing` de cada punta de cada tramo.
 *
 * En un tramo más corto que `3 · spacing` los puntos se meten a un tercio de su
 * longitud: así nunca se cruzan ni se pisan, y un codo entre dos tramos cortos
 * sigue teniendo su ventana local en vez de perder el densificado justo donde
 * la ruta gira más veces. Un tramo de longitud nula se salta entero — el
 * barrido lo descartaría igual, y avisar de él es cosa de
 * `cadPipeRouteFindings`.
 */
export function cadPipeDensifyPath(
  points: readonly CadPoint3[],
  spacing: number,
): CadPoint3[] {
  const salida: CadPoint3[] = [];
  const push = (punto: CadPoint3) => {
    const ultimo = salida[salida.length - 1];
    if (ultimo && largoTramo(ultimo, punto) <= 1e-9) return;
    salida.push(punto);
  };
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const largo = largoTramo(a, b);
    if (!(largo > 1e-9)) continue;
    push(a);
    if (spacing > 0) {
      const dentro = Math.min(spacing, largo / 3);
      const u = { x: (b.x - a.x) / largo, y: (b.y - a.y) / largo, z: (b.z - a.z) / largo };
      push({ x: a.x + u.x * dentro, y: a.y + u.y * dentro, z: a.z + u.z * dentro });
      push({ x: b.x - u.x * dentro, y: b.y - u.y * dentro, z: b.z - u.z * dentro });
    }
    push(b);
  }
  return salida;
}

/** Cuantiza a milésimas de unidad de dibujo, sin el `-0` que rompería la huella. */
const cuantiza = (valor: number): string => {
  const redondo = Math.round(valor * 1000) / 1000;
  return (Object.is(redondo, -0) ? 0 : redondo).toFixed(3);
};

/**
 * Huella de la geometría de una ruta: diámetro, número de vértices y una firma
 * FNV-1a de sus coordenadas cuantizadas a milésimas.
 *
 * Cuantizada porque dos lecturas del mismo documento no devuelven bit a bit los
 * mismos flotantes —el mismo motivo por el que `CadSolidFaceRef` cuantiza la
 * suya— y con el diámetro dentro porque cambiar de 6" a 4" deja el sólido tan
 * viejo como moverle un vértice.
 */
export function cadPipeRouteFingerprint(
  route: Pick<CadPipeRoute, "size" | "points">,
): string {
  const texto = [
    route.size.trim(),
    ...route.points.map((punto) => `${cuantiza(punto.x)},${cuantiza(punto.y)},${cuantiza(punto.z)}`),
  ].join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${route.points.length}:${hash.toString(16).padStart(8, "0")}`;
}

export interface CadPipeSolidOptions {
  /** Unidad del documento. Decide cuántas unidades de dibujo mide un milímetro. */
  unit?: string;
  sides?: number;
  /** Distancia de densificado en MILÍMETROS. `0` lo desactiva (y se nota: −12 %). */
  densifyMm?: number;
  layer?: string;
}

export interface CadPipeSolidOutcome {
  solid: CadSolid3dEntity | null;
  /** Por qué no se pudo, cuando `solid` es `null`. Nunca se calla. */
  reason?: string;
}

/**
 * El `solid3d` de una ruta: un `sweep` del perfil poligonal por el camino
 * densificado, en la capa `TU-SOLIDO`, con `pl:linea`, el id de su ruta y la
 * huella de la geometría con que se barrió.
 *
 * No valida el cuerpo: quien lo escribe en el documento pasa por
 * `finishedSolid` (`engine/commands/solids-support.ts`), que evalúa el árbol y
 * comprueba los invariantes del kernel antes de emitir el lote. Duplicar aquí
 * esa evaluación sería pagarla dos veces por sólido.
 */
export function cadPipeSolidEntity(
  route: CadPipeRoute,
  id: string,
  options: CadPipeSolidOptions = {},
): CadPipeSolidOutcome {
  const radio = cadPipeSolidRadius(route.size, options.unit ?? "mm");
  if (radio === null || !(radio > 0))
    return {
      solid: null,
      reason: `«${route.size}» no es una medida en pulgadas: sin diámetro no hay tubo que barrer`,
    };

  const porUnidad = cadUnitToMillimetres(options.unit ?? "mm");
  const separacion =
    ((options.densifyMm ?? CAD_PL_SOLID_DENSIFY_MM) || 0) / (porUnidad > 0 ? porUnidad : 1);
  const camino = cadPipeDensifyPath(route.points, separacion);
  if (camino.length < 2)
    return {
      solid: null,
      reason: `${route.line} no tiene dos puntos distintos: no se barre un punto de tubería`,
    };

  const nodo: CadSolidNode = {
    id: "tubo",
    op: "sweep",
    profile: cadPipeSolidProfile(radio, options.sides ?? CAD_PL_SOLID_SIDES),
    path: camino,
    closed: false,
    // Con el tubo horizontal las facetas quedan orientadas igual en todo el
    // dibujo; con el tubo vertical `makeFrame` cae a su base propia, que es
    // determinista. En un perfil de revolución el giro dentro del plano no
    // cambia el volumen: esto es para que dos tubos paralelos se vean iguales.
    upHint: { x: 0, y: 0, z: 1 },
  };

  return {
    solid: {
      id,
      type: "solid3d",
      nodes: [nodo],
      root: nodo.id,
      name: route.line,
      layer: options.layer ?? CAD_PL_SOLID_LAYER,
      context: {
        metadata: {
          ...cadPlantLineMetadata({
            size: route.size,
            service: route.service,
            number: route.number,
            spec: route.spec,
          }),
          [CAD_PL_SOLID_OF]: route.entityId,
          [CAD_PL_SOLID_PRINT]: cadPipeRouteFingerprint(route),
        },
      },
    },
  };
}

export interface CadPipeSolid {
  solidId: string;
  /** La ruta que lo generó, tal como quedó escrita en el sólido. */
  routeId: string;
  line: string;
  print: string;
  layer: string;
}

const meta = (entity: { context?: { metadata?: Record<string, unknown> } }, key: string) => {
  const value = entity.context?.metadata?.[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
};

/** Los sólidos de tubería del dibujo: los `solid3d` que declaran su ruta. */
export function cadPipeSolidsOf(document: Pick<CadDocument, "entities">): CadPipeSolid[] {
  const solidos: CadPipeSolid[] = [];
  for (const entity of document.entities) {
    if (entity.type !== "solid3d") continue;
    const routeId = meta(entity, CAD_PL_SOLID_OF);
    if (!routeId) continue;
    solidos.push({
      solidId: entity.id,
      routeId,
      line: meta(entity, CAD_PL_LINE) ?? routeId,
      print: meta(entity, CAD_PL_SOLID_PRINT) ?? "",
      layer: entity.layer,
    });
  }
  return solidos;
}

export type CadPipeSolidStaleKind = "viejo" | "huerfano";

export interface CadPipeSolidStale {
  kind: CadPipeSolidStaleKind;
  solidId: string;
  routeId: string;
  line: string;
  detail: string;
}

/**
 * Los sólidos que ya no cuadran con su ruta.
 *
 * `viejo` cuando la huella escrita en el sólido no es la de la ruta de hoy
 * —alguien movió un vértice, cambió una cota o el diámetro— y `huerfano`
 * cuando la ruta que lo generó ya no está en el dibujo. Es el precio de
 * persistir un sólido en vez de derivarlo, y se cobra a la vista.
 */
export function cadPipeSolidsStale(
  document: Pick<CadDocument, "entities">,
): CadPipeSolidStale[] {
  const rutas = new Map(cadPipeRoutesOf(document).map((route) => [route.entityId, route]));
  const viejos: CadPipeSolidStale[] = [];
  for (const solido of cadPipeSolidsOf(document)) {
    const route = rutas.get(solido.routeId);
    if (!route) {
      viejos.push({
        kind: "huerfano",
        solidId: solido.solidId,
        routeId: solido.routeId,
        line: solido.line,
        detail: `el sólido de ${solido.line} ya no tiene ruta: se borró ${solido.routeId}`,
      });
      continue;
    }
    if (cadPipeRouteFingerprint(route) !== solido.print)
      viejos.push({
        kind: "viejo",
        solidId: solido.solidId,
        routeId: solido.routeId,
        line: route.line,
        detail: `el sólido de ${route.line} quedó viejo: la ruta cambió desde que se barrió`,
      });
  }
  return viejos;
}
