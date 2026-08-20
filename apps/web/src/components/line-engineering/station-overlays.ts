/**
 * Capas de estado en vivo: qué color lleva cada estación y de dónde sale.
 *
 * ## Qué es esto
 *
 * Cinco capas que tiñen los bloques de estación con un valor por estación que
 * llega de su propia ruta: el MES (paro / alerta / OK / inactivo), el calor de
 * ciclo contra el takt, la completitud documental, la bahía que surte y la
 * calidad acumulada. Vienen del visor 2D, y el 3D las unificó tal cual: el
 * color que se pinta es el trazo sólido de la leyenda.
 *
 * ## Por qué vive fuera del monolito
 *
 * Es una TABLA, no una vista: ni un `useState`, ni una referencia a THREE, ni
 * una llamada a React. Dentro de `Layout3DEditor.tsx` no había forma de mirarla
 * sin montar el editor entero, y por eso nadie la había mirado — a pesar de que
 * es exactamente el tipo de código que se rompe en silencio. Un estado que el
 * servidor renombra deja de tener color y la estación se pinta con el color
 * heredado del bloque: no falla nada, no chilla nadie, y el plano MIENTE sobre
 * el estado de la línea. Aquí eso lo cierra un spec.
 *
 * ## La leyenda y el mapa tienen que decir lo mismo
 *
 * `OVERLAY_DEFS` es lo que LEE el usuario en la esquina de la pantalla, y los
 * mapas de abajo son lo que PINTA el visor. Son dos listas del mismo hecho, así
 * que pueden contradecirse: basta con que alguien retoque un ámbar en un sitio.
 * El spec exige que cada color de la leyenda sea un color que el mapa pinta de
 * verdad; una leyenda que nombra un color que nadie pinta es peor que no tener
 * leyenda, porque se cree.
 */

/** Las cinco capas. Cada una tiene su ruta y su leyenda. */
export type OverlayKind = "mes" | "heat" | "completeness" | "bays" | "quality";

/**
 * `#rrggbb` → entero, que es lo que come el material de THREE.
 *
 * Los colores se escriben en hexadecimal de CSS porque la leyenda de la interfaz
 * los usa tal cual; convertir aquí evita mantener las dos formas del mismo color.
 */
export const hexToInt = (h: string): number => parseInt(h.replace("#", ""), 16);

export interface CadOverlayDef {
  key: OverlayKind;
  label: string;
  /** Ruta relativa bajo `layout/`, no una URL: la elige el adaptador legacy. */
  endpoint: string;
  legend: { label: string; hex: string }[];
}

export const OVERLAY_DEFS: CadOverlayDef[] = [
  {
    key: "mes",
    label: "MES en vivo",
    endpoint: "status",
    legend: [
      { label: "Paro", hex: "#ef4444" },
      { label: "Alerta", hex: "#f59e0b" },
      { label: "OK", hex: "#10b981" },
      { label: "Inactivo", hex: "#94a3b8" },
    ],
  },
  {
    key: "heat",
    label: "Calor de ciclo / utilización",
    endpoint: "heatmap",
    legend: [
      { label: "Holgado", hex: "#3b82f6" },
      { label: "Ligero", hex: "#06b6d4" },
      { label: "Medio", hex: "#f59e0b" },
      { label: "Alto", hex: "#f97316" },
      { label: "Sobre takt", hex: "#ef4444" },
    ],
  },
  {
    key: "completeness",
    label: "Completitud documental",
    endpoint: "completeness",
    legend: [
      { label: "Completa", hex: "#10b981" },
      { label: "Incompleta", hex: "#f59e0b" },
    ],
  },
  {
    key: "bays",
    label: "Bahía que surte",
    endpoint: "bays",
    legend: [
      { label: "B1", hex: "#3b82f6" },
      { label: "B2", hex: "#8b5cf6" },
      { label: "B3", hex: "#ec4899" },
      { label: "B4", hex: "#f59e0b" },
      { label: "B5", hex: "#10b981" },
      { label: "B6", hex: "#06b6d4" },
    ],
  },
  {
    key: "quality",
    label: "Calidad acumulada",
    endpoint: "quality",
    legend: [
      { label: "OK", hex: "#10b981" },
      { label: "Menor", hex: "#f59e0b" },
      { label: "Mayor", hex: "#ef4444" },
    ],
  },
];

export const MES_HEX: Record<string, string> = {
  down: "#ef4444",
  warn: "#f59e0b",
  ok: "#10b981",
  idle: "#94a3b8",
  /**
   * Un estado que el servidor no supo dar. Se pinta GRIS CLARO, distinto del
   * gris de «inactivo»: una estación sin dato y una estación parada de verdad
   * no pueden verse igual sobre el plano.
   */
  unknown: "#cbd5e1",
};

export const HEAT_HEX: Record<string, string> = {
  cold: "#3b82f6",
  cool: "#06b6d4",
  warm: "#f59e0b",
  hot: "#f97316",
  over: "#ef4444",
};

export const BAY_HEX: Record<number, string> = {
  1: "#3b82f6",
  2: "#8b5cf6",
  3: "#ec4899",
  4: "#f59e0b",
  5: "#10b981",
  6: "#06b6d4",
};

export const QUAL_HEX: Record<string, string> = {
  ok: "#10b981",
  minor: "#f59e0b",
  major: "#ef4444",
};

/**
 * Estación SIN bahía asignada. Gris, y a propósito: no es una bahía más.
 */
export const BAY_UNASSIGNED_HEX = "#94a3b8";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Construye el mapa nombreDeEstación → color a partir de la respuesta de la
 * capa. Las formas son las del visor 2D, y por eso llegan sin tipar.
 *
 * ## Por qué omitir es la respuesta correcta a un dato que no se entiende
 *
 * Una fila sin nombre de estación, o con un estado que este código no conoce,
 * NO entra en el mapa. No se inventa un color por defecto: quien lea el plano
 * vería un bloque teñido y creería que el servidor dijo algo. Fuera del mapa,
 * el bloque conserva su color de siempre, que es lo que significa «de esta
 * estación no sé nada».
 */
export function overlayColorMap(kind: OverlayKind, d: any): Map<string, string> {
  const m = new Map<string, string>();
  const rows: any[] = Array.isArray(d?.stations) ? d.stations : [];
  for (const s of rows) {
    if (!s || typeof s.station !== "string") continue;
    let hex: string | undefined;
    if (kind === "mes") hex = MES_HEX[s.status];
    else if (kind === "heat") hex = HEAT_HEX[s.level];
    else if (kind === "completeness") hex = s.complete ? "#10b981" : "#f59e0b";
    else if (kind === "bays")
      hex = s.bahia != null ? BAY_HEX[s.bahia as number] : BAY_UNASSIGNED_HEX;
    else if (kind === "quality") hex = QUAL_HEX[s.level];
    if (hex) m.set(s.station, hex);
  }
  return m;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
