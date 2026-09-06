/**
 * DESDE, M2P y TT — los auxiliares de captura de AutoCAD que no son un modo de
 * OSNAP ni un comando: MODIFICAN de dónde sale el PRÓXIMO punto (T-22).
 *
 * - `DESDE` (FROM): ancla en un punto, y lo que se teclee DESPUÉS —típicamente
 *   `@dx,dy`— se mide desde esa ancla, no desde el último punto fijado. Es
 *   como se coloca una puerta a 900 mm de una esquina sin dibujar una línea
 *   auxiliar para medirla.
 * - `M2P` (medio entre dos puntos): dos puntos, y el resultado es SU medio.
 *   No hay geometría que crear para partir un tramo por la mitad a ojo.
 * - `TT` (rastreo temporal): un punto que sólo vive para ESTA captura; se
 *   comporta como los puntos que `OTRACK` ya adquiere
 *   (`draft-settings-host.ts`), y por eso no necesita un cálculo propio: basta
 *   con dárselo a la misma lista de `trackingPoints` del anfitrión de ajustes.
 *
 * `PAR` (paralelo) no vive aquí: necesita una ARISTA de referencia —un
 * `entityPick`, no un token de teclado— y por tanto un tipo de entrada que
 * `resolveCadToken` no puede producir por sí solo. Queda declarado en
 * `CAD_POINT_MODIFIER_TOKENS` para que se reconozca por teclado, pero su
 * resolución de ángulo es responsabilidad de quien enrute el puntero — ver la
 * petición al buzón de F3.
 *
 * ## Por qué esto es puro y no sabe de `command-engine-host`
 *
 * Igual que `snap-engine.ts`: la aritmética de «qué punto sale» no necesita
 * saber CÓMO se le pide al usuario el punto siguiente ni DÓNDE se sustituye
 * `lastPoint` para la captura que sigue. Eso es una sub-captura con estado
 * que vive en el anfitrión (T-22, «Cómo se construye»); aquí sólo está la
 * mitad que se puede probar sin montar un editor.
 */
import type { Point } from "./precision-input";

export type CadPointModifierKind = "from" | "m2p" | "tt" | "par";

/** Los tokens que reconoce cada modificador, en mayúsculas. */
export const CAD_POINT_MODIFIER_TOKENS: Readonly<Record<string, CadPointModifierKind>> = {
  DESDE: "from",
  FROM: "from",
  M2P: "m2p",
  MTP: "m2p",
  TT: "tt",
  PAR: "par",
};

/** Cuántos puntos necesita reunir cada modificador antes de resolver. */
const POINTS_NEEDED: Record<"from" | "m2p" | "tt", number> = {
  from: 1,
  tt: 1,
  m2p: 2,
};

/** El prompt de la sub-captura, uno por punto que falte. */
export const CAD_POINT_MODIFIER_PROMPT: Record<"from" | "m2p" | "tt", readonly string[]> = {
  from: ["Precise el punto base (DESDE)"],
  tt: ["Precise el punto de rastreo temporal (TT)"],
  m2p: ["Precise el primer punto (M2P)", "Precise el segundo punto (M2P)"],
};

export interface CadPointModifierSession {
  kind: "from" | "m2p" | "tt";
  points: readonly Point[];
}

export function cadPointModifierStart(kind: "from" | "m2p" | "tt"): CadPointModifierSession {
  return { kind, points: [] };
}

export type CadPointModifierOutcome =
  | { done: false; session: CadPointModifierSession }
  | { done: true; point: Point };

/**
 * Añade un punto a la sesión. Cuando reúne lo que su modificador necesita,
 * resuelve: `from`/`tt` con uno solo, `m2p` con el medio de los dos.
 */
export function cadPointModifierAddPoint(
  session: CadPointModifierSession,
  point: Point,
): CadPointModifierOutcome {
  const points = [...session.points, point];
  if (points.length < POINTS_NEEDED[session.kind]) {
    return { done: false, session: { ...session, points } };
  }
  if (session.kind === "m2p") {
    return {
      done: true,
      point: { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 },
    };
  }
  return { done: true, point: points[0] };
}

/** El prompt a mostrar AHORA, dado cuántos puntos ya reunió la sesión. */
export function cadPointModifierPrompt(session: CadPointModifierSession): string {
  const prompts = CAD_POINT_MODIFIER_PROMPT[session.kind];
  return prompts[Math.min(session.points.length, prompts.length - 1)];
}
