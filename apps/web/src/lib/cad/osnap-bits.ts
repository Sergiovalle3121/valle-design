/**
 * `OSMODE`: los modos de referencia a objetos como suma de bits.
 *
 * Es la codificación de AutoCAD, y se copia bit a bit por una razón práctica:
 * `SETVAR OSMODE 35` es una línea que aparece en miles de `.scr`, de rutinas
 * LISP y de plantillas de estudio. Si aquí 35 significara otra cosa, todo ese
 * material heredado configuraría el dibujo mal y en silencio.
 *
 * El puente con `snap-engine.ts` vive aquí y no allí: aquel módulo resuelve
 * geometría y no tiene por qué saber que existe una variable de sistema.
 */
import type { SnapType } from "./snap-engine";

export interface CadOsnapBit {
  bit: number;
  /** Modo del motor de captura, o `null` si `OSMODE` lo nombra y aquí no existe. */
  snap: SnapType | null;
  keyword: string;
  shortcut: string;
}

/** Los dieciséis bits de `OSMODE`, con el valor que les da AutoCAD. */
export const CAD_OSNAP_BITS: readonly CadOsnapBit[] = [
  { bit: 1, snap: "endpoint", keyword: "PUNfin", shortcut: "FIN" },
  { bit: 2, snap: "midpoint", keyword: "PUNmedio", shortcut: "MED" },
  { bit: 4, snap: "center", keyword: "CENtro", shortcut: "CEN" },
  { bit: 8, snap: "node", keyword: "PUNto", shortcut: "NOD" },
  { bit: 16, snap: "quadrant", keyword: "CUAdrante", shortcut: "CUA" },
  { bit: 32, snap: "intersection", keyword: "INTersección", shortcut: "INT" },
  { bit: 64, snap: "insertion", keyword: "INSerción", shortcut: "INS" },
  { bit: 128, snap: "perpendicular", keyword: "PERpendicular", shortcut: "PER" },
  { bit: 256, snap: "tangent", keyword: "TANgente", shortcut: "TAN" },
  { bit: 512, snap: "nearest", keyword: "CERcano", shortcut: "CER" },
  // 1024 es «ninguno» en AutoCAD: apaga los demás en vez de añadirse.
  { bit: 2048, snap: "apparent-intersection", keyword: "INTAParente", shortcut: "APA" },
  { bit: 4096, snap: "extension", keyword: "EXTensión", shortcut: "EXT" },
  { bit: 8192, snap: "geometric-center", keyword: "CENGeométrico", shortcut: "GCE" },
];

/** Bit de «ninguno». No es un modo: es la orden de apagarlos todos. */
export const CAD_OSNAP_NONE_BIT = 1024;

export function cadOsmodeToSnaps(osmode: number): SnapType[] {
  if ((osmode & CAD_OSNAP_NONE_BIT) !== 0) return [];
  return CAD_OSNAP_BITS.filter((entry) => entry.snap !== null && (osmode & entry.bit) !== 0).map(
    (entry) => entry.snap as SnapType,
  );
}

export function cadSnapsToOsmode(snaps: readonly SnapType[]): number {
  let mask = 0;
  for (const snap of snaps) {
    const entry = CAD_OSNAP_BITS.find((candidate) => candidate.snap === snap);
    if (entry) mask |= entry.bit;
  }
  return mask;
}

/** Los modos activos en castellano, para que el prompt diga algo legible. */
export function describeCadOsmode(osmode: number): string {
  if (osmode === 0) return "ninguno";
  if ((osmode & CAD_OSNAP_NONE_BIT) !== 0) return "ninguno (bit 1024)";
  const active = CAD_OSNAP_BITS.filter((entry) => (osmode & entry.bit) !== 0);
  return active.length === 0 ? "ninguno" : active.map((entry) => entry.keyword).join(", ");
}
