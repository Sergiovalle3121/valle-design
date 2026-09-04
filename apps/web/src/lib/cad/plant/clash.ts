/**
 * CHOQUES DE LA TUBERÍA CONTRA LO QUE EL DIBUJO YA TIENE CONSTRUIDO.
 *
 * ## Qué faltaba, medido
 *
 * `docs/competitive/rubric.json`, criterio `toolset-plant3d`, campo `gap`:
 * *«…detección de choques contra estructura…»*. Es la mitad del valor de rutear
 * en 3D: una ruta con cota que nadie contrasta contra los muros es una
 * polilínea bonita, y el choque se descubre en obra.
 *
 * ## Esto NO es INTERFERE, y la diferencia importa
 *
 * `INTERFERE` (`engine/commands/solids-inquiry.ts`) hace la booleana de verdad
 * —intersección B-rep, volumen común— entre los sólidos que el usuario
 * **designa**. Es exacto y es caro, y por eso se le designa.
 *
 * Esto es lo contrario y sirve para otra cosa: lee el **modelo entero** sin
 * que nadie designe nada y contesta con **distancia**, no con un booleano. La
 * diferencia se paga en las dos direcciones y hay que decirla:
 *
 *  · A favor: contesta *cuánto* falta —una tubería a 5 mm de la cara de un muro
 *    no interfiere y sin embargo no se puede montar—, contesta sobre muros y
 *    huecos, que no son `solid3d` y por tanto `INTERFERE` no los ve, y no
 *    obliga a designar N×N piezas.
 *  · En contra: los `solid3d` se miden por su **caja envolvente**, no por sus
 *    caras. Una caja envolvente acusa de más en una pieza con forma de L
 *    —nunca de menos—, y para saber si el choque es real de verdad está
 *    `INTERFERE`, que sí corta el sólido.
 *
 * ## Y también las instalaciones, no sólo la planta de proceso
 *
 * Lo que se mide son las CONDUCCIONES del dibujo: las rutas 3D de tubería y —
 * desde la Ola G— las corridas MEP (tubería, ducto y charola), que entran por
 * el lector del cuadro de instalaciones (`mep-runs.ts`) con su diámetro o su
 * ancho ya resuelto. La pregunta del que resuelve la hidráulica de una casa es
 * la misma que la del tubero de una planta —«¿esta bajante atraviesa la
 * trabe?»— y tenerla contestada sólo en las órdenes PID era tenerla en el
 * sitio equivocado.
 *
 * ## El diámetro es el NOMINAL, y eso también hay que decirlo
 *
 * El radio con el que se mide la holgura es `pulgadas × 25,4 / 2`. En las
 * medidas comerciales el diámetro EXTERIOR real es MAYOR que el nominal —una
 * `6"` mide más de 152,4 mm por fuera— y cuánto más lo dice el catálogo del
 * proyecto, que este repositorio no transcribe (misma razón que en
 * `line-numbers.ts`: la especificación es del cliente). Consecuencia práctica y
 * declarada: **la holgura que sale aquí es optimista por el grosor de pared y
 * por el aislamiento**, y el margen exacto lo pone quien tiene el catálogo.
 *
 * ## Un vano NO es un choque
 *
 * El muro no se mide como una caja maciza: se descompone en las cajas que
 * quedan tras RESTAR los huecos válidos (`wallOpeningFit` +
 * `wallOpeningVerticalFit`, los mismos que usan la planta 2D y
 * `wall-solid.ts`). Una tubería que cruza por el vano de una puerta no choca
 * con nada, y además se INFORMA de que cruza —«paso por hueco»—, porque un
 * proyectista quiere saber por dónde pasa aunque quepa. Un hueco que no encaja
 * en su anfitrión no resta: mismo criterio fallo-cerrado que el sólido del
 * muro, y por el mismo motivo.
 *
 * ## Distancia exacta segmento-caja, no un muestreo
 *
 * La función de distancia con signo a una caja es convexa, y a lo largo de un
 * segmento es convexa a trozos con los quiebres EXACTAMENTE en los cruces del
 * segmento con los seis planos de cara y con los tres planos medios. Entre dos
 * quiebres consecutivos el conjunto activo no cambia: fuera es una cuadrática
 * en `t` —su vértice se resuelve— y dentro es el máximo de tres funciones
 * lineales —su mínimo está en un extremo o en un cruce de dos de ellas—. Con
 * esos candidatos el mínimo es el verdadero, sin muestrear.
 */
import type { CadDocument, CadPoint2, CadPoint3 } from "../cad-document";
import type { CadOpeningEntity } from "../cad-entities-v7";
import type { CadWallEntity } from "../cad-entities-v6";
import { cadUnitToMillimetres } from "../layout/annotative-scale";
import { solid3dBody } from "../solid3d-build";
import { bodyBounds } from "../../brep";
import { cadMepRunsAsRoutes } from "../mep-runs";
import { wallOpeningFit, wallOpeningVerticalFit } from "../wall-openings";
import {
  CAD_PL_JOIN_TOLERANCE,
  cadPipeNominalMillimetres,
  cadPipeRoutesOf,
  type CadPipeRoute,
} from "./pipe-route";
import { CAD_PL_SOLID_OF } from "./pipe-solid";

/**
 * El diámetro nominal vive en `pipe-route.ts` —es propiedad de la ruta, no de
 * este análisis— y se reexporta aquí porque nació en este módulo y sus
 * consumidores lo importan por este nombre. Mover la definición sin dejar la
 * reexportación habría roto llamadas ajenas por una cuestión de orden interno.
 */
export { cadPipeNominalMillimetres } from "./pipe-route";

/**
 * Holgura exigida por defecto, en MILÍMETROS.
 *
 * Cincuenta milímetros no salen de ninguna norma —transcribirla sería traer
 * material ajeno, y además la holgura de montaje la fija el proyecto—: son la
 * distancia por debajo de la cual dos piezas de una planta dejan de poder
 * montarse, aislarse y mantenerse, y está aquí para que la orden tenga una
 * respuesta cuando nadie declara la suya. Quien tenga la de su proyecto la pasa
 * en `clearance` y esta constante no interviene.
 */
export const CAD_PL_CLASH_CLEARANCE_MM = 50;

/** Lo que este análisis NO comprueba, entero y en un solo sitio. */
export const CAD_PL_CLASH_LIMITS =
  "Distancia medida con el diámetro NOMINAL (pulgadas × 25,4); el exterior real y el aislamiento los da el catálogo del proyecto, así que la holgura es optimista. Los muros se miden como caja con su altura y sus vanos restados; los sólidos, por su caja envolvente —para el corte exacto de dos sólidos designados está INTERFERE—. No se comprueban losas, cubiertas, escaleras ni objetos sin volumen. Una corrida MEP se mide como un cilindro de su diámetro, y un ducto o una charola como un cilindro de su ANCHO: el canto no lo guarda el dibujo";

/** Holgura por defecto en unidades de dibujo, según la unidad del documento. */
export function cadPipeClashClearance(unit = "mm"): number {
  const mm = cadUnitToMillimetres(unit);
  return mm > 0 ? CAD_PL_CLASH_CLEARANCE_MM / mm : CAD_PL_CLASH_CLEARANCE_MM;
}

// ---------------------------------------------------------------------------
// Geometría: distancia exacta de un segmento a una caja
// ---------------------------------------------------------------------------

/** Caja alineada a ejes en el marco donde se mide. Exportada para poder medirla. */
export interface CadClashBox {
  min: CadPoint3;
  max: CadPoint3;
}

const EPS = 1e-9;

/**
 * Distancia con signo de un punto a la caja: positiva fuera —y es la euclídea
 * exacta—, negativa dentro —y es la distancia a la cara más próxima—.
 */
function distanciaCaja(p: CadPoint3, caja: CadClashBox): number {
  const qx = Math.max(caja.min.x - p.x, p.x - caja.max.x);
  const qy = Math.max(caja.min.y - p.y, p.y - caja.max.y);
  const qz = Math.max(caja.min.z - p.z, p.z - caja.max.z);
  const fuera = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  return fuera + Math.min(Math.max(qx, qy, qz), 0);
}

/** El coeficiente lineal de `q` en un eje, con el conjunto activo ya fijado. */
function coeficientes(
  origen: number,
  direccion: number,
  min: number,
  max: number,
  arriba: boolean,
): { alfa: number; beta: number } {
  return arriba
    ? { alfa: origen - max, beta: direccion }
    : { alfa: min - origen, beta: -direccion };
}

/**
 * Mínimo de la distancia con signo a lo largo del segmento `a→b`, con el punto
 * donde se alcanza. Exacto: ver la cabecera del módulo.
 *
 * Se exporta porque la palabra «exacto» de esa cabecera tiene que poder
 * comprobarse contra un muestreo denso, y no se puede comprobar lo que no se
 * puede llamar. Su marco es el de la caja: quien la use contra un muro tiene
 * que llevar el segmento al marco del muro primero.
 */
export function cadSegmentBoxDistance(
  a: CadPoint3,
  b: CadPoint3,
  caja: CadClashBox,
): { distance: number; at: CadPoint3 } {
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const en = (t: number): CadPoint3 => ({
    x: a.x + d.x * t,
    y: a.y + d.y * t,
    z: a.z + d.z * t,
  });

  const ejes = ["x", "y", "z"] as const;
  const quiebres = new Set<number>([0, 1]);
  for (const eje of ejes) {
    const dir = d[eje];
    if (Math.abs(dir) <= EPS) continue;
    const centro = (caja.min[eje] + caja.max[eje]) / 2;
    for (const valor of [caja.min[eje], caja.max[eje], centro]) {
      const t = (valor - a[eje]) / dir;
      if (t > 0 && t < 1) quiebres.add(t);
    }
  }

  const ordenados = [...quiebres].sort((x, y) => x - y);
  const candidatos = [...ordenados];
  for (let i = 0; i + 1 < ordenados.length; i += 1) {
    const t0 = ordenados[i];
    const t1 = ordenados[i + 1];
    if (!(t1 - t0 > EPS)) continue;
    const medio = en((t0 + t1) / 2);
    // Conjunto activo del tramo: qué ejes están fuera y por qué lado. Constante
    // aquí dentro, porque los cambios de signo son quiebres.
    const lineales = ejes.map((eje) => {
      const arriba = medio[eje] >= (caja.min[eje] + caja.max[eje]) / 2;
      const { alfa, beta } = coeficientes(
        a[eje],
        d[eje],
        caja.min[eje],
        caja.max[eje],
        arriba,
      );
      return { alfa, beta, q: arriba ? medio[eje] - caja.max[eje] : caja.min[eje] - medio[eje] };
    });
    const fuera = lineales.filter((linea) => linea.q > 0);
    if (fuera.length > 0) {
      // Fuera: Σ (α + βt)² es cuadrática; su vértice es el candidato.
      let A = 0;
      let B = 0;
      for (const linea of fuera) {
        A += linea.beta * linea.beta;
        B += 2 * linea.alfa * linea.beta;
      }
      if (A > EPS) {
        const t = -B / (2 * A);
        if (t > t0 && t < t1) candidatos.push(t);
      }
      continue;
    }
    // Dentro: máx de tres lineales; su mínimo está en un extremo o donde dos
    // de ellas se cruzan.
    for (let p = 0; p < lineales.length; p += 1)
      for (let q = p + 1; q < lineales.length; q += 1) {
        const denominador = lineales[p].beta - lineales[q].beta;
        if (Math.abs(denominador) <= EPS) continue;
        const t = (lineales[q].alfa - lineales[p].alfa) / denominador;
        if (t > t0 && t < t1) candidatos.push(t);
      }
  }

  let mejor = Infinity;
  let dondeT = 0;
  for (const t of candidatos) {
    const valor = distanciaCaja(en(t), caja);
    if (valor < mejor) {
      mejor = valor;
      dondeT = t;
    }
  }
  return { distance: mejor, at: en(dondeT) };
}

/** Distancia mínima entre dos segmentos, con el punto del primero donde ocurre. */
function distanciaSegmentoSegmento(
  p1: CadPoint3,
  q1: CadPoint3,
  p2: CadPoint3,
  q2: CadPoint3,
): { distance: number; at: CadPoint3 } {
  const d1 = { x: q1.x - p1.x, y: q1.y - p1.y, z: q1.z - p1.z };
  const d2 = { x: q2.x - p2.x, y: q2.y - p2.y, z: q2.z - p2.z };
  const r = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };
  const a = d1.x * d1.x + d1.y * d1.y + d1.z * d1.z;
  const e = d2.x * d2.x + d2.y * d2.y + d2.z * d2.z;
  const f = d2.x * r.x + d2.y * r.y + d2.z * r.z;
  let s = 0;
  let t = 0;
  if (a <= EPS && e <= EPS) {
    s = 0;
    t = 0;
  } else if (a <= EPS) {
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = d1.x * r.x + d1.y * r.y + d1.z * r.z;
    if (e <= EPS) {
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = d1.x * d2.x + d1.y * d2.y + d1.z * d2.z;
      const denominador = a * e - b * b;
      s = denominador > EPS ? Math.min(1, Math.max(0, (b * f - c * e) / denominador)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  const c1 = { x: p1.x + d1.x * s, y: p1.y + d1.y * s, z: p1.z + d1.z * s };
  const c2 = { x: p2.x + d2.x * t, y: p2.y + d2.y * t, z: p2.z + d2.z * t };
  return {
    distance: Math.hypot(c1.x - c2.x, c1.y - c2.y, c1.z - c2.z),
    at: c1,
  };
}

// ---------------------------------------------------------------------------
// Los obstáculos que el dibujo tiene construidos
// ---------------------------------------------------------------------------

/**
 * Un obstáculo, en su propio marco.
 *
 * El muro es una caja ORIENTADA: girarla es cambiar de marco, no rotar la
 * caja, y así la distancia se mide contra cajas alineadas a ejes —que es donde
 * la fórmula es exacta— sin perder nada, porque el cambio de marco es rígido.
 */
export interface CadPipeClashObstacle {
  entityId: string;
  kind: "muro" | "solido";
  /** Descripción legible: «muro w1», «sólido s3». */
  label: string;
  /** Origen del marco local en el mundo. */
  origin: CadPoint3;
  /** Eje X local, en planta. Unitario. */
  u: CadPoint2;
  /** Eje Y local: la normal izquierda de `u`. Unitario. */
  n: CadPoint2;
  /** Las cajas MACIZAS, en el marco local. Los vanos ya están restados. */
  pieces: CadClashBox[];
  /** La envolvente sin restar vanos; sólo el muro la trae. */
  envelope?: CadClashBox;
  /** Los vanos válidos, para poder decir por cuál se pasa. */
  openings?: { entityId: string; kind: string; from: number; to: number; sill: number; top: number }[];
}

function aLocal(obstaculo: CadPipeClashObstacle, p: CadPoint3): CadPoint3 {
  const dx = p.x - obstaculo.origin.x;
  const dy = p.y - obstaculo.origin.y;
  return {
    x: dx * obstaculo.u.x + dy * obstaculo.u.y,
    y: dx * obstaculo.n.x + dy * obstaculo.n.y,
    z: p.z - obstaculo.origin.z,
  };
}

function alMundo(obstaculo: CadPipeClashObstacle, p: CadPoint3): CadPoint3 {
  return {
    x: obstaculo.origin.x + obstaculo.u.x * p.x + obstaculo.n.x * p.y,
    y: obstaculo.origin.y + obstaculo.u.y * p.x + obstaculo.n.y * p.y,
    z: obstaculo.origin.z + p.z,
  };
}

/**
 * Las cajas macizas de un muro: `[0,L] × [−t/2, t/2] × [0,H]` menos los vanos.
 *
 * Se descompone por FRANJAS verticales cuyos límites son los cantos de todos
 * los vanos: dentro de una franja, el juego de vanos que la tapan es el mismo,
 * así que lo que queda de muro son los tramos de altura que sus antepechos y
 * dinteles dejan libres. Es exacto y no depende del orden en que vengan los
 * huecos — dos vanos solapados producen la misma respuesta que uno.
 */
function cajasMacizasDeMuro(
  length: number,
  half: number,
  height: number,
  vanos: readonly { from: number; to: number; sill: number; top: number }[],
): CadClashBox[] {
  const cortes = new Set<number>([0, length]);
  for (const vano of vanos) {
    if (vano.from > 0 && vano.from < length) cortes.add(vano.from);
    if (vano.to > 0 && vano.to < length) cortes.add(vano.to);
  }
  const xs = [...cortes].sort((a, b) => a - b);
  const cajas: CadClashBox[] = [];
  for (let i = 0; i + 1 < xs.length; i += 1) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    if (!(x1 - x0 > EPS)) continue;
    const centro = (x0 + x1) / 2;
    const tapan = vanos
      .filter((vano) => vano.from <= centro && centro <= vano.to)
      .map((vano) => ({
        from: Math.max(0, Math.min(height, vano.sill)),
        to: Math.max(0, Math.min(height, vano.top)),
      }))
      .filter((rango) => rango.to - rango.from > EPS)
      .sort((a, b) => a.from - b.from);
    let cursor = 0;
    for (const rango of tapan) {
      if (rango.from > cursor + EPS)
        cajas.push({
          min: { x: x0, y: -half, z: cursor },
          max: { x: x1, y: half, z: rango.from },
        });
      cursor = Math.max(cursor, rango.to);
    }
    if (height - cursor > EPS)
      cajas.push({
        min: { x: x0, y: -half, z: cursor },
        max: { x: x1, y: half, z: height },
      });
  }
  return cajas;
}

function obstaculoDeMuro(
  wall: CadWallEntity,
  openings: readonly CadOpeningEntity[],
): CadPipeClashObstacle | null {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const length = Math.hypot(dx, dy);
  if (!(length > EPS) || !(wall.thickness > 0) || !(wall.height > 0)) return null;
  const half = wall.thickness / 2;
  const validos = openings
    .filter(
      (opening) =>
        opening.width > 0 &&
        opening.height > 0 &&
        wallOpeningFit(wall, { position: opening.position, width: opening.width }).ok &&
        wallOpeningVerticalFit(wall, { sill: opening.sill, height: opening.height }).ok,
    )
    .map((opening) => ({
      entityId: opening.id,
      kind: opening.kind,
      from: opening.position - opening.width / 2,
      to: opening.position + opening.width / 2,
      sill: opening.sill,
      top: opening.sill + opening.height,
    }));
  return {
    entityId: wall.id,
    kind: "muro",
    label: `muro ${wall.id}`,
    origin: { x: wall.start.x, y: wall.start.y, z: wall.start.z },
    u: { x: dx / length, y: dy / length },
    n: { x: -dy / length, y: dx / length },
    pieces: cajasMacizasDeMuro(length, half, wall.height, validos),
    envelope: {
      min: { x: 0, y: -half, z: 0 },
      max: { x: length, y: half, z: wall.height },
    },
    openings: validos,
  };
}

/**
 * Los obstáculos del dibujo. Un `solid3d` que el kernel no logra evaluar se
 * SALTA con su motivo en vez de tumbar el análisis entero: un choque que no se
 * puede calcular no es «no hay choque», pero tampoco puede impedir que se
 * calculen los demás.
 */
export function cadPipeClashObstacles(
  document: Pick<CadDocument, "entities">,
): { obstacles: CadPipeClashObstacle[]; skipped: { entityId: string; reason: string }[] } {
  const obstacles: CadPipeClashObstacle[] = [];
  const skipped: { entityId: string; reason: string }[] = [];
  const openingsByHost = new Map<string, CadOpeningEntity[]>();
  for (const entity of document.entities)
    if (entity.type === "opening")
      openingsByHost.set(entity.hostId, [...(openingsByHost.get(entity.hostId) ?? []), entity]);

  for (const entity of document.entities) {
    if (entity.type === "wall") {
      const obstaculo = obstaculoDeMuro(entity, openingsByHost.get(entity.id) ?? []);
      if (obstaculo) obstacles.push(obstaculo);
      else
        skipped.push({
          entityId: entity.id,
          reason: "receta degenerada: sin longitud, grosor o altura no hay volumen contra el que chocar",
        });
      continue;
    }
    if (entity.type !== "solid3d") continue;
    // El sólido de una tubería NO es un obstáculo: es la misma tubería vista
    // con volumen. Contarlo acusaría a cada ruta de chocar contra su propio
    // cuerpo —y con el radio entero de calado—, y el choque entre dos tuberías
    // ya lo mide la pasada de ruta contra ruta, que además sabe perdonar los
    // empalmes. Ver `pipe-solid.ts`.
    if (typeof entity.context?.metadata?.[CAD_PL_SOLID_OF] === "string") continue;
    try {
      const bounds = bodyBounds(solid3dBody(entity));
      if (!Number.isFinite(bounds.min.x) || !Number.isFinite(bounds.max.x)) {
        skipped.push({ entityId: entity.id, reason: "el sólido no tiene envolvente" });
        continue;
      }
      obstacles.push({
        entityId: entity.id,
        kind: "solido",
        label: `sólido ${entity.name ?? entity.id}`,
        origin: { x: 0, y: 0, z: 0 },
        u: { x: 1, y: 0 },
        n: { x: 0, y: 1 },
        pieces: [{ min: { ...bounds.min }, max: { ...bounds.max } }],
      });
    } catch (error) {
      skipped.push({
        entityId: entity.id,
        reason: `el árbol del sólido no se pudo evaluar — ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  return { obstacles, skipped };
}

// ---------------------------------------------------------------------------
// El análisis
// ---------------------------------------------------------------------------

export type CadPipeClashKind = "choque-duro" | "holgura-insuficiente" | "paso-por-hueco";

export interface CadPipeClash {
  kind: CadPipeClashKind;
  /** La ruta que choca. */
  routeId: string;
  line: string;
  /** Contra qué: id del muro, del sólido o de la otra ruta. */
  againstId: string;
  againstKind: "muro" | "solido" | "ruta";
  /**
   * Separación entre las dos SUPERFICIES, en unidades de dibujo. Negativa en un
   * choque duro; es lo que hay que apartar la tubería para que deje de tocar.
   */
  gap: number;
  /** Profundidad de la interpenetración: `−gap`. Sólo en un choque duro. */
  depth?: number;
  /** Dónde, en el mundo: el punto del EJE de la ruta donde la cosa está peor. */
  at: CadPoint3;
  detail: string;
}

export interface CadPipeClashOptions {
  /** Holgura exigida, en unidades de dibujo. Por defecto, la de `unit`. */
  clearance?: number;
  /** Unidad del documento, para la holgura por defecto y el diámetro nominal. */
  unit?: string;
  /** Sólo los choques de estas rutas. Ausente: todas. */
  routeIds?: readonly string[];
}

export interface CadPipeClashReport {
  clashes: CadPipeClash[];
  /** Holgura con la que se midió, en unidades de dibujo. */
  clearance: number;
  /** Cuántas rutas y cuántos obstáculos se leyeron; el denominador del informe. */
  routes: number;
  obstacles: number;
  /** Lo que no se pudo medir, con su motivo. Nunca se calla. */
  skipped: { entityId: string; reason: string }[];
}

const redondo = (valor: number): number => Math.round(valor * 100) / 100;

/** Radio del tubo en unidades de dibujo, o `null` si el diámetro no se lee. */
function radioDe(route: CadPipeRoute, unit: string): number | null {
  // El nominal ya resuelto manda: una corrida MEP lo trae en milímetros porque
  // no rotula pulgadas, y leer su `size` daría `null` para todas.
  const mm = route.nominalMm ?? cadPipeNominalMillimetres(route.size);
  if (mm === null || mm === undefined || !(mm > 0)) return null;
  const porUnidad = cadUnitToMillimetres(unit);
  return mm / 2 / (porUnidad > 0 ? porUnidad : 1);
}

/**
 * ¿Se EMPALMAN estas dos rutas?
 *
 * Dos tramos que se tocan punta con punta, o una punta que muere sobre el
 * cuerpo de otra, se tocan a propósito: ahí hay una reducción o una te, y
 * quien las cuenta es `cadPipeFittings`. Acusarlas de choque sería llenar el
 * informe de falsos justo en los sitios donde el proyecto está bien.
 */
function seEmpalman(a: CadPipeRoute, b: CadPipeRoute): boolean {
  const puntas = (route: CadPipeRoute) =>
    [route.points[0], route.points[route.points.length - 1]].filter(
      (punto): punto is CadPoint3 => !!punto,
    );
  const tocaCuerpo = (punta: CadPoint3, route: CadPipeRoute) => {
    for (let i = 1; i < route.points.length; i += 1) {
      const { distance } = distanciaSegmentoSegmento(
        punta,
        punta,
        route.points[i - 1],
        route.points[i],
      );
      if (distance <= CAD_PL_JOIN_TOLERANCE) return true;
    }
    return false;
  };
  return (
    puntas(a).some((punta) => tocaCuerpo(punta, b)) ||
    puntas(b).some((punta) => tocaCuerpo(punta, a))
  );
}

function severidad(gap: number, clearance: number): CadPipeClashKind | null {
  if (gap < -EPS) return "choque-duro";
  if (gap < clearance) return "holgura-insuficiente";
  return null;
}

const PESO: Record<CadPipeClashKind, number> = {
  "choque-duro": 0,
  "holgura-insuficiente": 1,
  "paso-por-hueco": 2,
};

/**
 * Los choques de las rutas 3D contra lo que el dibujo tiene construido.
 *
 * Un resultado por PAR —ruta y obstáculo—, con el sitio donde la cosa está
 * peor. Una ruta larga puede rozar el mismo muro en dos sitios y lo que hay
 * que arreglar es el peor de los dos; multiplicar el renglón por cada tramo
 * convertiría el informe en ruido.
 */
export function cadPipeClashReport(
  document: Pick<CadDocument, "entities">,
  options: CadPipeClashOptions = {},
): CadPipeClashReport {
  const unit = options.unit ?? "mm";
  const clearance = options.clearance ?? cadPipeClashClearance(unit);
  // Las conducciones del dibujo son las rutas de proceso Y las corridas MEP:
  // una bajante de agua fría atraviesa la misma trabe que un tubo de vapor, y
  // hasta la Ola G sólo se avisaba de una de las dos. Entran por el lector del
  // cuadro de instalaciones (`mep-runs.ts`), no por una segunda lectura propia.
  const todas = [...cadPipeRoutesOf(document), ...cadMepRunsAsRoutes(document, unit)];
  const { obstacles, skipped } = cadPipeClashObstacles(document);
  const mias = options.routeIds
    ? todas.filter((route) => options.routeIds!.includes(route.entityId))
    : todas;
  const clashes: CadPipeClash[] = [];
  const sinDiametro = [...skipped];

  for (const route of mias) {
    const radio = radioDe(route, unit);
    if (radio === null) {
      sinDiametro.push({
        entityId: route.entityId,
        reason:
          route.size.trim() === ""
            ? `${route.line} no dice su tamaño: sin diámetro no hay holgura que medir`
            : `«${route.size}» no es una medida en pulgadas: sin diámetro no hay holgura que medir`,
      });
      continue;
    }

    for (const obstaculo of obstacles) {
      const locales = route.points.map((punto) => aLocal(obstaculo, punto));
      let peor: { gap: number; at: CadPoint3 } | null = null;
      for (const caja of obstaculo.pieces)
        for (let i = 1; i < locales.length; i += 1) {
          const { distance, at } = cadSegmentBoxDistance(locales[i - 1], locales[i], caja);
          const gap = distance - radio;
          if (!peor || gap < peor.gap) peor = { gap, at };
        }
      if (peor) {
        const kind = severidad(peor.gap, clearance);
        if (kind) {
          const donde = alMundo(obstaculo, peor.at);
          clashes.push({
            kind,
            routeId: route.entityId,
            line: route.line,
            againstId: obstaculo.entityId,
            againstKind: obstaculo.kind,
            gap: redondo(peor.gap),
            ...(kind === "choque-duro" ? { depth: redondo(-peor.gap) } : {}),
            at: donde,
            detail:
              kind === "choque-duro"
                ? `${route.line} atraviesa el ${obstaculo.label}: se meten ${redondo(-peor.gap)} unidades una dentro de otra`
                : `${route.line} pasa a ${redondo(peor.gap)} unidades del ${obstaculo.label}: la holgura exigida es ${redondo(clearance)}`,
          });
          continue;
        }
      }
      // Sin choque contra lo macizo. Si aun así la tubería entra en la
      // envolvente del muro, es que cruza por un vano: se INFORMA, no se acusa.
      if (!obstaculo.envelope || (obstaculo.openings ?? []).length === 0) continue;
      let dentro: { gap: number; at: CadPoint3 } | null = null;
      for (let i = 1; i < locales.length; i += 1) {
        const { distance, at } = cadSegmentBoxDistance(
          locales[i - 1],
          locales[i],
          obstaculo.envelope,
        );
        const gap = distance - radio;
        if (!dentro || gap < dentro.gap) dentro = { gap, at };
      }
      if (!dentro || dentro.gap >= 0) continue;
      const cruce = dentro.at;
      const vano = (obstaculo.openings ?? []).find(
        (hueco) =>
          cruce.x >= hueco.from &&
          cruce.x <= hueco.to &&
          cruce.z >= hueco.sill &&
          cruce.z <= hueco.top,
      );
      clashes.push({
        kind: "paso-por-hueco",
        routeId: route.entityId,
        line: route.line,
        againstId: vano?.entityId ?? obstaculo.entityId,
        againstKind: "muro",
        gap: redondo(dentro.gap),
        at: alMundo(obstaculo, dentro.at),
        detail: vano
          ? `${route.line} cruza el ${obstaculo.label} por el vano de ${vano.kind === "door" ? "la puerta" : "la ventana"} ${vano.entityId}: no choca, se informa`
          : `${route.line} cruza el ${obstaculo.label} por un vano: no choca, se informa`,
      });
    }
  }

  // Ruta contra ruta. Cada par una sola vez, y sólo si las dos entran en el
  // filtro o al menos una de ellas: un choque es de las dos.
  for (let i = 0; i < todas.length; i += 1)
    for (let j = i + 1; j < todas.length; j += 1) {
      const a = todas[i];
      const b = todas[j];
      if (options.routeIds && !options.routeIds.includes(a.entityId) && !options.routeIds.includes(b.entityId))
        continue;
      const ra = radioDe(a, unit);
      const rb = radioDe(b, unit);
      if (ra === null || rb === null) continue;
      if (seEmpalman(a, b)) continue;
      let peor: { gap: number; at: CadPoint3 } | null = null;
      for (let m = 1; m < a.points.length; m += 1)
        for (let n = 1; n < b.points.length; n += 1) {
          const { distance, at } = distanciaSegmentoSegmento(
            a.points[m - 1],
            a.points[m],
            b.points[n - 1],
            b.points[n],
          );
          const gap = distance - ra - rb;
          if (!peor || gap < peor.gap) peor = { gap, at };
        }
      if (!peor) continue;
      const kind = severidad(peor.gap, clearance);
      if (!kind) continue;
      clashes.push({
        kind,
        routeId: a.entityId,
        line: a.line,
        againstId: b.entityId,
        againstKind: "ruta",
        gap: redondo(peor.gap),
        ...(kind === "choque-duro" ? { depth: redondo(-peor.gap) } : {}),
        at: peor.at,
        detail:
          kind === "choque-duro"
            ? `${a.line} y ${b.line} se solapan ${redondo(-peor.gap)} unidades`
            : `${a.line} pasa a ${redondo(peor.gap)} unidades de ${b.line}: la holgura exigida es ${redondo(clearance)}`,
      });
    }

  clashes.sort(
    (x, y) =>
      PESO[x.kind] - PESO[y.kind] ||
      x.gap - y.gap ||
      x.routeId.localeCompare(y.routeId) ||
      x.againstId.localeCompare(y.againstId),
  );
  return {
    clashes,
    clearance,
    routes: mias.length,
    obstacles: obstacles.length,
    skipped: sinDiametro,
  };
}

/** Cómo se nombra una severidad en la línea de órdenes. */
export const CAD_PL_CLASH_WORD: Record<CadPipeClashKind, string> = {
  "choque-duro": "CHOQUE",
  "holgura-insuficiente": "HOLGURA INSUFICIENTE",
  "paso-por-hueco": "PASO POR HUECO",
};

/** El informe en una línea, para el renglón de una orden. */
export function cadPipeClashSummary(report: CadPipeClashReport): string {
  if (report.obstacles === 0)
    return "sin estructura contra la que chocar: el dibujo no tiene muros ni sólidos";
  const duros = report.clashes.filter((choque) => choque.kind === "choque-duro").length;
  const holguras = report.clashes.filter(
    (choque) => choque.kind === "holgura-insuficiente",
  ).length;
  const pasos = report.clashes.filter((choque) => choque.kind === "paso-por-hueco").length;
  if (duros === 0 && holguras === 0 && pasos === 0)
    return `sin choques contra ${report.obstacles} elemento(s) construido(s), con holgura de ${redondo(report.clearance)}`;
  return `${duros} choque(s), ${holguras} holgura(s) insuficiente(s) y ${pasos} paso(s) por hueco contra ${report.obstacles} elemento(s) construido(s)`;
}
