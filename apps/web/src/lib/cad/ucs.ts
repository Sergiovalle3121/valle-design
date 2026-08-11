/**
 * Sistemas de coordenadas personales (SCU/UCS) y su catálogo.
 *
 * ## Por qué esto no es una preferencia cosmética
 *
 * Un edificio girado 23,5 grados respecto del norte se dibuja girando el
 * SISTEMA, no la geometría. A partir de ahí, todo lo que el CAD dice de un
 * punto —lo que imprime ID, los deltas de DIST, las coordenadas de LIST— tiene
 * que estar en ESE sistema, porque es en el que el dibujante piensa y en el que
 * están acotados sus planos. Un CAD que sabe girar la vista pero sigue
 * informando en coordenadas del mundo obliga a hacer la conversión a mano cada
 * vez, que es cuando aparecen los errores caros.
 *
 * Este módulo es la parte pura: un SCU es un origen y un giro, y dos funciones
 * llevan un punto de un sistema al otro. UCSMAN lo guarda y lo restaura; las
 * consultas lo leen. No dibuja nada y no toca la vista.
 *
 * ## Lo que NO hace todavía, dicho en voz alta
 *
 * El SCU activo NO reorienta el cursor, ni la rejilla, ni el modo orto: eso
 * vive en el viewport, que en esta ola pertenece a otra sesión. Lo que sí hace
 * de punta a punta es la INFORMACIÓN: fija un SCU y ID, DIST, AREA y LIST
 * responden en él. Es la mitad que se puede entregar entera, y se entrega
 * entera en vez de dejar las dos a medias.
 */
import type { CadPoint2, CadPoint3 } from "./cad-document";

export interface CadNamedUcs {
  name: string;
  origin: CadPoint2;
  /** Giro del eje X del SCU respecto del eje X del mundo, en grados. */
  rotationDeg: number;
}

export const CAD_WORLD_UCS: CadNamedUcs = {
  name: "*MUNDO*",
  origin: { x: 0, y: 0 },
  rotationDeg: 0,
};

export function isCadWorldUcs(ucs: CadNamedUcs): boolean {
  return (
    Math.abs(ucs.origin.x) < 1e-12 &&
    Math.abs(ucs.origin.y) < 1e-12 &&
    Math.abs(ucs.rotationDeg % 360) < 1e-12
  );
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Punto del mundo → punto en el SCU. */
export function worldToUcs(point: CadPoint2 | CadPoint3, ucs: CadNamedUcs): CadPoint2 {
  const dx = point.x - ucs.origin.x;
  const dy = point.y - ucs.origin.y;
  const angle = radians(-ucs.rotationDeg);
  return {
    x: dx * Math.cos(angle) - dy * Math.sin(angle),
    y: dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

/** Punto en el SCU → punto del mundo. */
export function ucsToWorld(point: CadPoint2, ucs: CadNamedUcs): CadPoint2 {
  const angle = radians(ucs.rotationDeg);
  return {
    x: ucs.origin.x + point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: ucs.origin.y + point.x * Math.sin(angle) + point.y * Math.cos(angle),
  };
}

/**
 * Un DESPLAZAMIENTO del mundo al SCU. No es lo mismo que convertir un punto: un
 * delta no se traslada, sólo se gira. Convertir un delta como si fuera un punto
 * le sumaría el origen y daría un `Delta X` desplazado — el error clásico.
 */
export function worldVectorToUcs(vector: CadPoint2, ucs: CadNamedUcs): CadPoint2 {
  return worldToUcs(
    { x: vector.x + ucs.origin.x, y: vector.y + ucs.origin.y },
    ucs,
  );
}

/** Ángulo del mundo → ángulo en el SCU. */
export function worldAngleToUcs(degrees: number, ucs: CadNamedUcs): number {
  return degrees - ucs.rotationDeg;
}

export class CadUcsCatalog {
  private items: CadNamedUcs[] = [];

  list = (): readonly CadNamedUcs[] => this.items;

  get = (name: string): CadNamedUcs | undefined =>
    this.items.find((item) => item.name.toUpperCase() === name.trim().toUpperCase());

  save = (item: CadNamedUcs): void => {
    const key = item.name.trim().toUpperCase();
    const index = this.items.findIndex((entry) => entry.name.toUpperCase() === key);
    if (index >= 0) this.items = this.items.map((entry, at) => (at === index ? item : entry));
    else this.items = [...this.items, item].sort((a, b) => a.name.localeCompare(b.name));
  };

  remove = (name: string): boolean => {
    const key = name.trim().toUpperCase();
    const next = this.items.filter((entry) => entry.name.toUpperCase() !== key);
    if (next.length === this.items.length) return false;
    this.items = next;
    return true;
  };
}
