/**
 * El puntero entra en el motor de comandos.
 *
 * ## Qué estaba roto
 *
 * Los 63 comandos del motor eran SÓLO de teclado. Con el ratón mandaba
 * `cad-command.ts`, 162 líneas con siete comandos cableados. Un CAD en el que
 * dibujar con el ratón y dibujar con el teclado son dos motores distintos se
 * siente roto aunque los dos funcionen: la orden que se teclea acepta `Cerrar`
 * y la que se hace con el ratón no, el arco previsualiza un arco por un lado y
 * una recta por el otro, y deshacer no significa lo mismo en los dos caminos.
 *
 * ## La regla dura
 *
 * **Cuando el motor tiene un comando activo, la máquina heredada no recibe
 * nada.** No hay dos máquinas escuchando el mismo clic. Y lo que sigue yendo al
 * camino viejo va por una LISTA BLANCA legible —`CAD_LEGACY_POINTER_TOOLS`—, no
 * por omisión: si mañana `MEASURE` existe en el motor, se borra una línea de esa
 * lista y el enrutado cambia en un sitio.
 *
 * ## Lo que aporta, y que no existía
 *
 * - **Banda elástica** con la geometría real del paso (`CadEnginePreview`).
 * - **Cursor vivo**: insignia del modo OSNAP resuelto, siguiendo al ratón sin
 *   pasar por React (`CadLiveCursorOverlay`).
 * - **Entrada dinámica**: distancia y ángulo junto al cursor, con Tab entre
 *   campos y entrada directa de distancia al pulsar Enter.
 * - **Menú contextual** con las palabras clave del paso, que el motor ya expone
 *   en su `prompt` y que hasta ahora sólo se veían en la línea de comandos.
 */
import type { CadPoint2 } from "@/lib/cad/cad-document";
import type { SnapType } from "@/lib/cad/snap-engine";
import type { CadCommandEngineHost } from "@/components/cad/command-line/command-engine-host";
import type { CadKeyword } from "@/lib/cad/engine/command-types";
import type { CadPreviewPath } from "@/lib/cad/engine/command-types";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_POINT,
} from "@/lib/cad/engine/command-types";
import type { CadLiveCursorField } from "./live-cursor";

/**
 * Lo que el enrutador necesita de la banda elástica y del cursor vivo, y nada
 * más. `CadEnginePreview` y `CadLiveCursorOverlay` lo cumplen por estructura;
 * declararlo así permite además probar el enrutado en Node, donde no hay DOM
 * y por tanto no puede haber cursor de verdad.
 */
export interface CadPointerPreviewSurface {
  draw(paths: readonly CadPreviewPath[]): void;
  clear(): void;
}

export interface CadPointerCursorSurface {
  moveTo(x: number, y: number): void;
  setSnap(snap: SnapType | null): void;
  setMeasurements(distance: number, angleDeg: number): void;
  setDynamicVisible(visible: boolean): void;
  readonly dynamicVisible: boolean;
  focusField(field: CadLiveCursorField): void;
  readonly focusedField: CadLiveCursorField | null;
  readonly owns: boolean;
  openMenu(x: number, y: number, keywords: readonly CadKeyword[]): boolean;
  closeMenu(): void;
  readonly menuOpen: boolean;
  hide(): void;
}

/**
 * Herramientas del editor cuyo puntero SIGUE en la máquina heredada, con el
 * motivo de cada una. Es una lista blanca a propósito: enrutar «lo que no
 * conozco» al camino viejo por omisión es cómo se acaba con dos máquinas
 * escuchando el mismo clic sin que nadie lo haya decidido.
 */
export const CAD_LEGACY_POINTER_TOOLS = {
  /** Designar no es un comando: es la ausencia de comando. */
  select: "designación y arrastre de grips",
  /** MEASURE/DIST todavía no existe como comando del motor. */
  measure: "medición ad-hoc, sin equivalente en el motor",
  /** Los muros son activos del editor, no entidades canónicas. */
  wall: "cadena de muros, que produce activos y no geometría CAD",
  /**
   * LAS TRES DE MODIFICACIÓN SIGUEN EN EL CAMINO VIEJO, Y ESTO ES DEUDA.
   *
   * MOVE, COPY y OFFSET SÍ existen en el motor, así que no están aquí por
   * falta de comando: están porque su máquina de pasos NO es la misma que la
   * de `cad-command.ts`. El motor pide designar objetos, punto base y destino
   * como pasos con sus prompts; la máquina vieja los resolvía con dos puntos
   * sobre la selección que ya hubiera, y OFFSET con una sola distancia. Migrar
   * el ratón a los pasos del motor cambia la secuencia que el usuario teclea y
   * la que fijan los goldens 33 y 40, y eso merece su propio cambio en vez de
   * colarse dentro del que enciende el dibujo.
   *
   * Lo que sí se gana ya: dibujar —LINE, PLINE, RECTANG, CIRCLE— es el mismo
   * motor con el ratón y con el teclado.
   */
  move: "PENDIENTE: MOVE existe en el motor pero con otra secuencia de pasos",
  copy: "PENDIENTE: COPY existe en el motor pero con otra secuencia de pasos",
  offset: "PENDIENTE: OFFSET existe en el motor pero pide objeto y lado",
} as const;

export type CadLegacyPointerTool = keyof typeof CAD_LEGACY_POINTER_TOOLS;

/**
 * Herramienta de dibujo del editor → comando canónico del motor.
 *
 * Las cuatro de DIBUJO. Todas existen en `CAD_COMMAND_REGISTRY_V2` con más
 * opciones de las que la máquina vieja podía ofrecer: LINE acepta `Cerrar` y
 * `desHacer`, PLINE acepta arcos, CIRCLE acepta `3P`/`2P`/`Ttr`, RECTANG acepta
 * chaflán y empalme. Enrutarlas aquí es lo que hace que el ratón herede todo
 * eso — y que dibujar con el ratón y dibujar tecleando dejen de ser dos
 * productos distintos.
 *
 * Las tres de modificación se quedan fuera a propósito: ver
 * `CAD_LEGACY_POINTER_TOOLS`, donde está escrito por qué y qué falta.
 */
export const CAD_ENGINE_POINTER_COMMANDS = {
  line: "LINE",
  polyline: "PLINE",
  rect: "RECTANG",
  circle: "CIRCLE",
} as const;

export type CadEnginePointerTool = keyof typeof CAD_ENGINE_POINTER_COMMANDS;

export function cadEngineCommandForTool(tool: string): string | null {
  return (
    CAD_ENGINE_POINTER_COMMANDS[tool as CadEnginePointerTool] ?? null
  );
}

export interface CadEnginePointerBridge {
  host: CadCommandEngineHost;
  preview: CadPointerPreviewSurface;
  cursor: CadPointerCursorSurface;
  /** Punto de DIBUJO bajo el evento, o null si no cae sobre el plano. */
  worldPoint(event: PointerEvent | MouseEvent): CadPoint2 | null;
  /** Captura a objeto, honrando los modos forzados por el paso actual. */
  snap(
    point: CadPoint2,
    override: readonly SnapType[] | null,
  ): { point: CadPoint2; snap?: SnapType };
  /**
   * Entidad canónica bajo el punto, con la apertura del pickbox del editor.
   * `null` si no hay ninguna. Sólo se consulta cuando el paso activo acepta
   * ENTITY_PICK: designar objetos es del paso, no un modo del enrutador.
   */
  hitEntity(point: CadPoint2): string | null;
  /** Publica el cursor vivo; es lo que el contexto del motor devuelve. */
  setCursor(point: CadPoint2 | null): void;
  /** Coordenadas del evento relativas al lienzo, para colocar el DOM. */
  localPoint(event: PointerEvent | MouseEvent): { x: number; y: number };
  /**
   * Estado del comando EN CURSO, guardado fuera del enrutador.
   *
   * FUERA, y es importante. El anfitrión del motor se crea una vez y sobrevive
   * a todo; el enrutador nace y muere con el lienzo THREE, que se vuelve a
   * montar cuando cambia el documento o la planta. Con esto dentro, un
   * remontaje a mitad de un comando dejaba al motor con su comando abierto y al
   * enrutador con la memoria en blanco: la entrada dinámica volvía a «origen» y
   * perdía lo escrito, y el dibujo dejaba de quedar designado al terminar.
   */
  session: { current: CadPointerSession };
}

/** Lo que dura lo que dura un comando, no lo que dura el lienzo. */
export interface CadPointerSession {
  /** Último punto confirmado. */
  anchor: CadPoint2 | null;
  /** El comando arrancó desde la barra o el puntero, no tecleado. */
  pointerStarted: boolean;
}

export const EMPTY_CAD_POINTER_SESSION: CadPointerSession = {
  anchor: null,
  pointerStarted: false,
};

export class CadEnginePointerRouter {
  private lastSnap: SnapType | null = null;
  private lastPoint: CadPoint2 | null = null;

  constructor(private readonly bridge: CadEnginePointerBridge) {}

  /**
   * ¿Arrancó ESTE comando desde la barra o el puntero, y no tecleado?
   *
   * Distingue qué comportamiento heredado se está sustituyendo, y no es una
   * sutileza: la barra reemplaza a `cad-command.ts`, que al dibujar dejaba lo
   * dibujado DESIGNADO; la línea de comandos nunca designó nada. Designar
   * también en el camino tecleado cambia lo que ve la orden SIGUIENTE —HATCH
   * con algo designado sombrea esos objetos en vez de pedir un punto interior—,
   * y eso rompía el recorrido de anotación tecleada. Cada camino conserva el
   * suyo.
   */
  get startedByPointer(): boolean {
    return this.bridge.session.current.pointerStarted;
  }

  /**
   * Último punto CONFIRMADO. El motor no lo expone —es estado interno del
   * comando— y hace falta para medir la banda elástica, para resolver la
   * entrada directa de distancia y para que la entrada dinámica sepa que ya hay
   * un punto fijado. Se conoce porque es este enrutador quien lo envió, y se
   * guarda fuera (ver `bridge.anchor`) para sobrevivir a un remontaje.
   */
  private get anchorPoint(): CadPoint2 | null {
    return this.bridge.session.current.anchor;
  }

  private set anchorPoint(point: CadPoint2 | null) {
    this.bridge.session.current = {
      ...this.bridge.session.current,
      anchor: point,
    };
  }

  /** true cuando el motor manda: la máquina heredada no debe recibir nada. */
  get active(): boolean {
    return this.bridge.host.busy;
  }

  get anchor(): CadPoint2 | null {
    return this.anchorPoint;
  }

  /** Punto resuelto con captura bajo el último movimiento. Para los goldens. */
  get resolved(): { point: CadPoint2; snap: SnapType | null } | null {
    return this.lastPoint ? { point: this.lastPoint, snap: this.lastSnap } : null;
  }

  /**
   * Arranca un comando del motor por su nombre canónico. Devuelve false si el
   * nombre no está en el registro, para que quien llama pueda caer al camino
   * viejo EN VOZ ALTA en vez de quedarse sin hacer nada.
   */
  invoke(command: string): boolean {
    this.reset();
    this.bridge.host.invoke(command);
    if (!this.bridge.host.busy) return false;
    this.bridge.session.current = { anchor: null, pointerStarted: true };
    this.bridge.cursor.setDynamicVisible(true);
    return true;
  }

  move(event: PointerEvent): boolean {
    if (!this.active) return false;
    const raw = this.bridge.worldPoint(event);
    if (!raw) return true;
    // En un paso que sólo designa objetos no hay captura que enseñar: la
    // insignia de OSNAP mentiría sobre un punto que el clic no va a usar.
    const resolved = picksEntityOnly(this.bridge.host.accepts)
      ? { point: raw, snap: undefined }
      : this.bridge.snap(raw, this.bridge.host.osnapOverride);
    this.lastPoint = resolved.point;
    this.lastSnap = resolved.snap ?? null;
    // Cursor vivo: DOM directo, sin React. Es lo único que corre por muestra.
    const local = this.bridge.localPoint(event);
    this.bridge.cursor.moveTo(local.x, local.y);
    this.bridge.cursor.setSnap(this.lastSnap);
    this.bridge.setCursor(resolved.point);
    if (this.anchorPoint) {
      const dx = resolved.point.x - this.anchorPoint.x;
      const dy = resolved.point.y - this.anchorPoint.y;
      this.bridge.cursor.setMeasurements(
        Math.hypot(dx, dy),
        normalizeDegrees((Math.atan2(dy, dx) * 180) / Math.PI),
      );
    }
    // La banda elástica la recalcula el propio comando con el cursor nuevo: es
    // puro, así que volver a pedirle el paso no tiene efectos secundarios.
    this.bridge.host.refreshPreview();
    return true;
  }

  /**
   * Un CLIC, no un `pointerdown`. El editor distingue clic de arrastre por el
   * desplazamiento entre pulsar y soltar, y conservar esa distinción es lo que
   * permite que arrastrar siga orbitando la cámara mientras un comando está
   * abierto. Designar en `pointerdown` habría convertido cada intento de
   * orbitar en un punto no deseado en mitad del dibujo.
   */
  click(event: PointerEvent): boolean {
    if (!this.active) return false;
    // El botón derecho abre el menú de palabras clave; nunca designa un punto.
    // Va PRIMERO: el `contextmenu` llega antes que el `pointerup` del mismo
    // gesto, así que con el orden contrario ese `pointerup` cerraba el menú que
    // el propio botón derecho acababa de abrir y no daba tiempo ni a verlo.
    if (event.button === 2) return true;
    if (this.bridge.cursor.menuOpen) {
      this.bridge.cursor.closeMenu();
      return true;
    }
    if (event.button !== 0) return false;
    const raw = this.bridge.worldPoint(event);
    if (!raw) return true;
    // El PASO decide qué es un clic. Si acepta designar un OBJETO y hay una
    // entidad bajo el cursor, el clic es esa entidad, no el punto de debajo.
    // Sin entidad, cae a punto sólo si el paso también acepta puntos; si sólo
    // acepta objetos, el clic al vacío no designa nada — como en AutoCAD, y
    // como exige MOVE, cuyo paso de designación se tragaría el punto como
    // punto base si llegara hasta él.
    const accepts = this.bridge.host.accepts;
    if (accepts & CAD_ACCEPT_ENTITY_PICK) {
      const hit = this.bridge.hitEntity(raw);
      if (hit) {
        this.bridge.host.pickEntity(hit, raw);
        this.afterDispatch();
        return true;
      }
      if (!(accepts & CAD_ACCEPT_POINT)) return true;
    }
    const resolved = this.bridge.snap(raw, this.bridge.host.osnapOverride);
    this.commitPoint(resolved.point, resolved.snap);
    return true;
  }

  /** Menú contextual con las palabras clave del paso. Devuelve true si lo abrió. */
  contextMenu(event: MouseEvent): boolean {
    if (!this.active) return false;
    const prompt = this.bridge.host.getSnapshot().prompt;
    const local = this.bridge.localPoint(event);
    if (!prompt || prompt.options.length === 0) {
      // Sin opciones que ofrecer, el botón derecho vale por Enter, como en
      // AutoCAD: cerrar un LINE con el derecho es un gesto que la gente ya tiene
      // en los dedos. Abrir un menú vacío sería peor que no abrir ninguno.
      this.accept();
      return true;
    }
    this.bridge.cursor.openMenu(local.x, local.y, prompt.options);
    return true;
  }

  /** Enter/Esc/Tab mientras el motor manda. Devuelve true si consumió la tecla. */
  keyDown(event: KeyboardEvent): boolean {
    if (!this.active) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      this.cancel();
      return true;
    }
    if (event.key === "Tab" && this.bridge.cursor.dynamicVisible) {
      event.preventDefault();
      this.bridge.cursor.focusField(
        this.bridge.cursor.focusedField === "distance" ? "angle" : "distance",
      );
      return true;
    }
    if (event.key === "Enter" && !this.bridge.cursor.owns) {
      event.preventDefault();
      this.accept();
      return true;
    }
    return false;
  }

  /**
   * Distancia y/o ángulo tecleados en la entrada dinámica.
   *
   * - Los dos → coordenada polar desde el último punto: el gesto clásico.
   * - Sólo la distancia → ENTRADA DIRECTA DE DISTANCIA: se conserva la
   *   dirección que marca el cursor y se fija la longitud. Sin cursor no hay
   *   dirección, así que no se inventa: no pasa nada.
   * - Sólo el ángulo → se ignora aquí; restringir la dirección sin fijar
   *   longitud es trabajo del rastreo polar, no de esta caja.
   */
  commitMeasurements(values: {
    distance: number | null;
    angle: number | null;
  }): boolean {
    if (!this.active) return false;
    const anchor = this.anchorPoint;
    if (!anchor || values.distance === null) return false;
    const angle =
      values.angle ??
      (this.lastPoint
        ? (Math.atan2(
            this.lastPoint.y - anchor.y,
            this.lastPoint.x - anchor.x,
          ) *
            180) /
          Math.PI
        : null);
    if (angle === null) return false;
    const radians = (angle * Math.PI) / 180;
    this.commitPoint({
      x: anchor.x + Math.cos(radians) * values.distance,
      y: anchor.y + Math.sin(radians) * values.distance,
    });
    return true;
  }

  /**
   * Designa un punto ya resuelto que NO viene del ratón: la entrada dinámica,
   * la línea de precisión, una coordenada tecleada.
   *
   * Entra por la misma puerta que el clic, y eso importa por dos motivos: el
   * lote y el paso de deshacer son los mismos, y el ANCLA queda registrada.
   * Sin el ancla, la entrada dinámica no sabe que ya hay un punto fijado y
   * seguiría pidiendo un centro cuando toca pedir un radio.
   */
  pick(point: CadPoint2, snap?: SnapType): boolean {
    if (!this.active) return false;
    this.commitPoint(point, snap);
    return true;
  }

  keyword(shortcut: string): void {
    if (!this.active) return;
    this.bridge.host.submit(shortcut);
    this.afterDispatch();
  }

  accept(): void {
    if (!this.active) return;
    this.bridge.host.accept();
    this.afterDispatch();
  }

  cancel(): void {
    if (!this.active) return;
    this.bridge.host.cancel();
    this.afterDispatch();
  }

  /** El puntero salió del lienzo, o el editor cambió de herramienta. */
  end(): void {
    this.reset();
    this.bridge.preview.clear();
    this.bridge.cursor.hide();
    this.bridge.setCursor(null);
  }

  private commitPoint(point: CadPoint2, snap?: SnapType): void {
    // El ancla se fija ANTES de despachar, y el orden no es cosmético.
    //
    // Despachar publica la instantánea del motor, y `useSyncExternalStore`
    // puede forzar un render SÍNCRONO desde ahí. Ese render lee el ancla para
    // decidir la clave de la entrada dinámica (`origin` vs `anchored`), y con
    // el ancla puesta después leía la de ANTES: el panel no se remontaba
    // cuando debía y lo hacía más tarde, en un render cualquiera, vaciando los
    // campos que el usuario —o el golden— acababa de rellenar.
    this.anchorPoint = point;
    this.lastPoint = point;
    this.bridge.host.pickPoint(point, snap);
    this.afterDispatch();
  }

  /**
   * Lo que hay que hacer SIEMPRE después de despachar: si el comando terminó,
   * la banda elástica y el cursor vivo tienen que apagarse. Dejarlos encendidos
   * es lo que hace que un editor parezca que sigue dibujando cuando ya no.
   */
  private afterDispatch(): void {
    if (this.bridge.host.busy) return;
    this.end();
  }

  private reset(): void {
    this.bridge.session.current = EMPTY_CAD_POINTER_SESSION;
    this.lastPoint = null;
    this.lastSnap = null;
  }
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/** El paso sólo designa OBJETOS: un clic al vacío no puede ser un punto. */
function picksEntityOnly(accepts: number): boolean {
  return (
    (accepts & CAD_ACCEPT_ENTITY_PICK) !== 0 && (accepts & CAD_ACCEPT_POINT) === 0
  );
}
