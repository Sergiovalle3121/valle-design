/**
 * La CÁMARA de una ventana gráfica, convertida en números con los que dibujar.
 *
 * `cad-paper-viewport.ts` DECLARA la vista —hacia dónde se mira y con qué
 * vertical—; aquí se resuelve el marco ortonormal que hace falta para proyectar
 * un punto del mundo sobre el papel de esa ventana. Están separados por la
 * misma razón que `ucs.ts` y `ucs-view.ts`: el esquema tiene que ser una hoja
 * del grafo de carga, y la aritmética no.
 *
 * ## La propiedad que sostiene toda la migración
 *
 * Para la vista de planta —mirar hacia −Z con la Y del mundo arriba— este
 * módulo devuelve el marco `right = +X`, `up = +Y`, y proyectar es entonces
 * `(x, y, z) ↦ (x, y)`: la identidad sobre el plano de dibujo. Eso significa
 * que una ventana del esquema 7, que sólo podía mirar en planta, enseña
 * EXACTAMENTE lo mismo después de recibir su `view` explícita. No es una
 * coincidencia afortunada: es el criterio con el que se eligió el convenio de
 * ejes, y su spec lo mide proyectando puntos, no leyendo este comentario.
 *
 * ## Handedness, o de dónde salen los alzados espejados
 *
 * El marco se construye como una CÁMARA: `back = −direction`, y
 * `right = up × back`. Con `(right, up, back)` directo, mirar un alzado desde
 * el oeste pone el norte a la izquierda, que es lo que ve una persona de pie
 * allí. La tentación es usar `right = direction × up`, que también da un
 * triedro y sale ESPEJADO — y un alzado espejado no se nota mirándolo, se nota
 * cuando el cliente pregunta por qué la puerta está al otro lado.
 *
 * ## Fallo cerrado
 *
 * Una dirección nula o una vertical paralela a ella no definen ninguna vista.
 * No se «arregla» eligiendo otra vertical: se devuelve un fallo con código,
 * igual que hace `ucs.ts`. Una cámara mal construida no rompe nada al
 * construirse; rompe cuando el alzado sale girado y nadie sabe por qué.
 */
import type { CadPoint2, CadPoint3 } from "../cad-document";
import {
  CAD_VIEWPORT_PLAN_VIEW,
  type CadPaperViewport,
  type CadViewportView,
  type CadViewportViewKind,
} from "../cad-paper-viewport";

/** Por debajo de esto, normalizar un vector deja de tener sentido numérico. */
export const CAD_VIEWPORT_VIEW_EPSILON = 1e-12;

export type CadViewportViewErrorCode =
  /** La dirección de mirada tiene longitud prácticamente nula. */
  | "direccion-nula"
  /** La vertical del papel es paralela a la mirada: no define un «arriba». */
  | "vertical-paralela"
  /** Una sección sin plano de corte, o con una normal degenerada. */
  | "corte-invalido";

export interface CadViewportViewFailure {
  ok: false;
  code: CadViewportViewErrorCode;
  message: string;
}

/**
 * Marco ortonormal de la vista, en coordenadas del MUNDO.
 *
 * `right` y `up` son los ejes del PAPEL; `back` apunta del objetivo hacia el
 * ojo. Proyectar es medir sobre los dos primeros, y la profundidad —lo que
 * decide qué tapa a qué y de qué lado de un corte cae algo— se mide sobre el
 * tercero.
 */
export interface CadViewportViewFrame {
  origin: CadPoint3;
  right: CadPoint3;
  up: CadPoint3;
  back: CadPoint3;
  kind: CadViewportViewKind;
}

export type CadViewportFrameOutcome =
  | { ok: true; frame: CadViewportViewFrame }
  | CadViewportViewFailure;

const v = (x: number, y: number, z: number): CadPoint3 => ({ x, y, z });
const sub = (a: CadPoint3, b: CadPoint3): CadPoint3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
const dot = (a: CadPoint3, b: CadPoint3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const scale = (a: CadPoint3, k: number): CadPoint3 => v(a.x * k, a.y * k, a.z * k);
/**
 * Producto vectorial, SIN ceros negativos.
 *
 * El `+ 0` de cada componente no cambia ningún valor —sólo colapsa `-0` a `0`—
 * y evita que el marco de una vista salga con un `-0` dentro. Es la misma
 * razón que en `negate`: `-0` y `0` son el mismo número y no el mismo texto, y
 * dos marcos que representan la misma cámara tienen que compararse iguales.
 */
const cross = (a: CadPoint3, b: CadPoint3): CadPoint3 =>
  v(
    a.y * b.z - a.z * b.y + 0,
    a.z * b.x - a.x * b.z + 0,
    a.x * b.y - a.y * b.x + 0,
  );

/**
 * Niega un vector SIN fabricar `-0`.
 *
 * `-0` y `0` son el mismo número para toda la aritmética y no son el mismo
 * TEXTO: `JSON.stringify(-0)` da `"0"`. Una cámara con un `-0` dentro deja de
 * ser igual a sí misma en cuanto el documento pasa por el disco, y eso rompe
 * exactamente lo que el serializado determinista promete —mismo contenido,
 * mismo texto, mismo hash—. Sumar cero colapsa el cero negativo al positivo y
 * no toca ningún otro valor.
 */
const negate = (a: CadPoint3): CadPoint3 => v(-a.x + 0, -a.y + 0, -a.z + 0);

function normalize(a: CadPoint3): CadPoint3 | null {
  const length = Math.hypot(a.x, a.y, a.z);
  if (!(length > CAD_VIEWPORT_VIEW_EPSILON)) return null;
  return scale(a, 1 / length);
}

function fail(code: CadViewportViewErrorCode, message: string): CadViewportViewFailure {
  return { ok: false, code, message };
}

/** Marco de la vista, o el motivo por el que no hay ninguno. */
export function cadViewportViewFrame(view: CadViewportView): CadViewportFrameOutcome {
  const back = normalize(negate(view.direction));
  if (!back)
    return fail("direccion-nula", "La dirección de mirada de la ventana tiene longitud cero.");
  const upHint = view.up;
  // Se ortogonaliza la vertical contra la mirada en vez de exigir que llegue
  // perpendicular: quien compone una vista girando la cámara da un «arriba»
  // aproximado, y rechazarlo obligaría a que el llamante hiciera esta misma
  // cuenta antes de llamar.
  const up = normalize(sub(upHint, scale(back, dot(upHint, back))));
  if (!up)
    return fail(
      "vertical-paralela",
      "La vertical del papel es paralela a la mirada: la vista no tiene «arriba».",
    );
  if (view.kind === "section") {
    const plane = view.sectionPlane;
    if (!plane || !normalize(plane.normal))
      return fail(
        "corte-invalido",
        "Una vista de sección necesita un plano de corte con normal no nula.",
      );
  }
  return {
    ok: true,
    frame: { origin: view.target, right: cross(up, back), up, back, kind: view.kind },
  };
}

/**
 * Dónde cae un punto del mundo sobre el PAPEL de esta vista, en unidades de
 * dibujo y relativo al objetivo de la cámara.
 *
 * Para una vista de planta con objetivo en el origen esto devuelve `(x, y)`
 * tal cual. Es la comprobación que hace medible la migración 7→8.
 */
export function cadViewportProjectPoint(
  point: CadPoint2 | CadPoint3,
  frame: CadViewportViewFrame,
): CadPoint2 {
  const p = v(point.x, point.y, "z" in point ? point.z : 0);
  const local = sub(p, frame.origin);
  return { x: dot(local, frame.right), y: dot(local, frame.up) };
}

/**
 * Profundidad del punto: positiva hacia el OJO.
 *
 * Es lo que decide qué lado de un plano de corte queda delante del observador,
 * y lo que ordena dos trazos que se pisan en el papel.
 */
export function cadViewportViewDepth(
  point: CadPoint2 | CadPoint3,
  frame: CadViewportViewFrame,
): number {
  const p = v(point.x, point.y, "z" in point ? point.z : 0);
  return dot(sub(p, frame.origin), frame.back);
}

/** El punto del mundo que se proyecta en `papel` a la profundidad dada. */
export function cadViewportUnprojectPoint(
  paper: CadPoint2,
  frame: CadViewportViewFrame,
  depth = 0,
): CadPoint3 {
  return v(
    frame.origin.x + frame.right.x * paper.x + frame.up.x * paper.y + frame.back.x * depth,
    frame.origin.y + frame.right.y * paper.x + frame.up.y * paper.y + frame.back.y * depth,
    frame.origin.z + frame.right.z * paper.x + frame.up.z * paper.y + frame.back.z * depth,
  );
}

/**
 * La vista de una ventana, con el default ESCRITO.
 *
 * Después de `migrateCadDocument` ninguna ventana llega sin `view`, así que
 * este respaldo sólo cubre el objeto construido a mano en una spec o en una
 * interfaz. Devuelve planta —lo que la ventana significaba en el esquema 7—
 * porque el único default correcto es el que no cambia lo que ya se veía.
 */
export function cadViewportViewOf(viewport: CadPaperViewport): CadViewportView {
  return viewport.view ?? CAD_VIEWPORT_PLAN_VIEW;
}

/**
 * Direcciones normalizadas de las seis vistas ortogonales, con el nombre que
 * un despacho teclea.
 *
 * Los alzados llevan la Z del mundo como vertical del papel porque un muro
 * extruye hacia +Z: un alzado con otra vertical enseñaría el edificio tumbado.
 * Las claves son las que acepta SOLVIEW y las que salen en el nombre de la
 * ventana, así que cambiarlas cambia lo que el usuario teclea.
 */
export const CAD_VIEWPORT_ORTHO_VIEWS = {
  planta: { direction: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 }, kind: "plan" },
  inferior: { direction: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, kind: "plan" },
  frontal: { direction: { x: 0, y: 1, z: 0 }, up: { x: 0, y: 0, z: 1 }, kind: "elevation" },
  posterior: { direction: { x: 0, y: -1, z: 0 }, up: { x: 0, y: 0, z: 1 }, kind: "elevation" },
  izquierda: { direction: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, kind: "elevation" },
  derecha: { direction: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, kind: "elevation" },
} as const satisfies Record<
  string,
  { direction: CadPoint3; up: CadPoint3; kind: CadViewportViewKind }
>;

export type CadViewportOrthoName = keyof typeof CAD_VIEWPORT_ORTHO_VIEWS;

export const CAD_VIEWPORT_ORTHO_NAMES = Object.keys(
  CAD_VIEWPORT_ORTHO_VIEWS,
) as CadViewportOrthoName[];

/** Una de las seis vistas ortogonales, apuntando a `target`. */
export function cadViewportOrthoView(
  name: CadViewportOrthoName,
  target: CadPoint3,
): CadViewportView {
  const preset = CAD_VIEWPORT_ORTHO_VIEWS[name];
  return {
    projection: "parallel",
    kind: preset.kind,
    target: { ...target },
    direction: { ...preset.direction },
    up: { ...preset.up },
  };
}

/**
 * Vista de SECCIÓN por un plano vertical que pasa por dos puntos en planta.
 *
 * Es la forma en que un arquitecto define un corte: traza la línea de corte
 * sobre la planta y dice hacia dónde mira. La cámara mira perpendicular a esa
 * línea, la vertical es la del mundo, y el plano de corte es el vertical que
 * la contiene. La normal apunta hacia el OBSERVADOR, es decir, hacia lo que se
 * descarta: lo que queda delante del corte estorba y no se dibuja.
 */
export function cadViewportSectionView(input: {
  from: CadPoint2;
  to: CadPoint2;
  /** Cota del objetivo. Sin ella, el corte se ancla al nivel del suelo. */
  elevation?: number;
  /** `true` mira hacia el lado izquierdo de la línea from→to. */
  lookLeft?: boolean;
}): CadViewportView | CadViewportViewFailure {
  const axis = normalize(v(input.to.x - input.from.x, input.to.y - input.from.y, 0));
  if (!axis)
    return fail("corte-invalido", "La línea de corte necesita dos puntos distintos.");
  const worldUp = v(0, 0, 1);
  // Perpendicular a la línea, en planta. El signo decide de qué lado se mira.
  const normal = cross(axis, worldUp);
  const direction = input.lookLeft ? negate(normal) : normal;
  const elevation = input.elevation ?? 0;
  const target = v(
    (input.from.x + input.to.x) / 2,
    (input.from.y + input.to.y) / 2,
    elevation,
  );
  return {
    projection: "parallel",
    kind: "section",
    target,
    direction,
    up: worldUp,
    // La normal apunta hacia el ojo: lo positivo respecto de este plano está
    // entre el observador y el corte, y es lo que se retira.
    sectionPlane: { origin: { ...target }, normal: negate(direction) },
  };
}

/**
 * ¿Es esta vista la de planta de toda la vida?
 *
 * Lo pregunta quien puede tomar un atajo 2D —el trazado, la vista previa— y
 * necesita saber si proyectar es la identidad. Se responde midiendo el marco,
 * no comparando el objeto: una planta escrita con `direction: (0,0,-2)` es la
 * misma planta y una comparación de campos diría que no.
 */
export function cadViewportViewIsPlan(view: CadViewportView, tolerance = 1e-9): boolean {
  const outcome = cadViewportViewFrame(view);
  if (!outcome.ok) return false;
  const { right, up } = outcome.frame;
  return (
    Math.abs(right.x - 1) < tolerance &&
    Math.abs(right.y) < tolerance &&
    Math.abs(right.z) < tolerance &&
    Math.abs(up.x) < tolerance &&
    Math.abs(up.y - 1) < tolerance &&
    Math.abs(up.z) < tolerance
  );
}

/**
 * Comprobación de forma para lo que llega del disco o de la red.
 *
 * El servidor tiene su propia validación —no se fía de esta, que corre en el
 * navegador—, pero el cliente necesita poder decir «esta ventana trae una
 * cámara que no significa nada» antes de dibujar con ella. Devuelve el motivo,
 * no un booleano: un `false` no se puede enseñar en un mensaje.
 */
export function cadViewportViewProblem(value: unknown): string | null {
  if (!value || typeof value !== "object") return "la vista no es un objeto";
  const view = value as Partial<CadViewportView>;
  if (view.projection !== "parallel") return "sólo se admite proyección paralela";
  if (!view.kind || !["plan", "elevation", "section", "detail"].includes(view.kind))
    return `clase de vista desconocida: ${String(view.kind)}`;
  for (const field of ["target", "direction", "up"] as const) {
    const point = view[field] as CadPoint3 | undefined;
    if (
      !point ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      !Number.isFinite(point.z)
    )
      return `${field} debe ser un punto 3D finito`;
  }
  const outcome = cadViewportViewFrame(view as CadViewportView);
  return outcome.ok ? null : outcome.message;
}

/**
 * Cuántas ventanas de cada CLASE tiene el documento.
 *
 * Es el equivalente de `cadDocumentStats` para las láminas, y existe por la
 * misma razón que aquél: el censo del esquema 8 tiene que comprobar que
 * guardar y abrir no pierde una vista, y un TOTAL que cuadra puede esconder un
 * alzado perdido y una planta duplicada. Contar por clase es lo único que ve
 * ese caso.
 *
 * También es lo que un panel de láminas necesita para decir «1 planta, 2
 * alzados, 1 corte» sin recorrer el documento por su cuenta.
 */
export function cadViewportViewCensus(document: {
  paperSpaces: readonly { viewports?: readonly CadPaperViewport[] }[];
}): Record<CadViewportViewKind, number> & { sinVista: number } {
  const census = { plan: 0, elevation: 0, section: 0, detail: 0, sinVista: 0 };
  for (const space of document.paperSpaces) {
    for (const viewport of space.viewports ?? []) {
      if (!viewport.view) census.sinVista += 1;
      else census[viewport.view.kind] += 1;
    }
  }
  return census;
}

/** Vuelca la vista a lo que espera el clasificador de aristas ocultas. */
export function cadViewportParallelView(view: CadViewportView): {
  kind: "parallel";
  direction: CadPoint3;
} {
  return { kind: "parallel", direction: { ...view.direction } };
}

export { CAD_VIEWPORT_PLAN_VIEW };
