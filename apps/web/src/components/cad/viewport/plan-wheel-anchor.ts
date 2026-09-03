/**
 * LA RUEDA ACERCA AL PUNTO QUE HAY BAJO EL CURSOR, EXACTAMENTE.
 *
 * ## Por qué no basta con `zoomToCursor`
 *
 * En modo plano el viewport DIBUJA con una cámara ortográfica
 * (`view-controller.ts`) y quien recibe el ratón es la cámara en PERSPECTIVA de
 * OrbitControls; la vista 2D se DERIVA de ella. `controls.zoomToCursor = true`
 * ancla el punto en la perspectiva, que es lo correcto en 3D, pero la
 * derivación de en medio no conserva ese anclaje.
 *
 * Medido con una sonda de diagnóstico sobre el golden 85, una muesca de rueda a
 * 216 px del centro con la huella de 8×6 m: sin `zoomToCursor` el punto de
 * mundo bajo el cursor se iba 381 unidades de dibujo; con él, 150. El módulo
 * del desplazamiento del centro era el correcto (1,445 unidades de escena
 * contra las 1,431 que pedía el anclaje perfecto) pero la DIRECCIÓN no.
 *
 * ## Qué hace este módulo
 *
 * Deja que OrbitControls haga el zoom —su paso, sus topes, su suavizado— y
 * corrige DESPUÉS el encuadre en el espacio donde el anclaje es aritmética
 * exacta: la vista 2D derivada. `cadViewScreenToWorld` ya sabe qué punto de
 * dibujo hay bajo un píxel; se mira antes y después y se corre el encuadre por
 * la diferencia. Cero suposiciones sobre la base de pantalla de la cámara en
 * perspectiva, que es justo lo que estaba fallando.
 *
 * ## Y se aplica por EVENTO, no por reloj
 *
 * La primera versión corregía justo después de que OrbitControls atendiera la
 * misma rueda, y no funcionaba: medido en el navegador, al volver del oyente
 * —y también en el `requestAnimationFrame` siguiente— la vista derivada
 * todavía tenía el zoom ANTERIOR. El cambio llega más tarde, por el camino de
 * OrbitControls → evento `change` → `adoptPerspectiveFraming`.
 *
 * Así que la rueda sólo ANOTA el punto que hay que anclar, y quien corrige es
 * el primer cambio de vista que traiga un zoom distinto. No hay reloj, no hay
 * número de cuadros que adivinar, y cuatro muescas seguidas se anclan a la
 * primera de ellas —que es lo que el usuario tiene bajo el dedo— en vez de
 * pelearse entre sí.
 */
import { cadViewScreenToWorld, type CadView } from "@/lib/cad/view/cad-view";

export interface CadPlanWheelAnchorPort {
  /** La vista 2D derivada AHORA, o `null` si el viewport no está en plano. */
  planView(): CadView | null;
  /** Corre el encuadre por un vector en unidades de DIBUJO. */
  panDrawing(dx: number, dy: number): void;
  /** Avisa cada vez que la vista cambia. Devuelve cómo dejar de escuchar. */
  onViewChange(listener: () => void): () => void;
}

/**
 * Cuánto hay que correr el encuadre para que el punto que estaba bajo el píxel
 * siga estando bajo el píxel. Puro: se prueba en Node sin lienzo ni cámara.
 */
export function cadPlanWheelAnchorCorrection(
  before: CadView,
  after: CadView,
  screenX: number,
  screenY: number,
): { dx: number; dy: number } {
  const anchor = cadViewScreenToWorld(before, screenX, screenY);
  const drifted = cadViewScreenToWorld(after, screenX, screenY);
  return { dx: anchor.x - drifted.x, dy: anchor.y - drifted.y };
}

/** Cuánto tiene que cambiar el zoom para considerar que la rueda hizo algo. */
const CAMBIO_MINIMO = 1e-9;

export function attachCadPlanWheelAnchorPort(
  element: HTMLElement,
  port: CadPlanWheelAnchorPort,
): () => void {
  /** Lo anotado por la última rueda que todavía no ha sido anclada. */
  let pendiente: { view: CadView; screenX: number; screenY: number } | null = null;

  const onWheel = (event: WheelEvent) => {
    const before = port.planView();
    if (!before) return;
    const rect = element.getBoundingClientRect();
    // Se conserva la PRIMERA anotación sin anclar: con varias muescas seguidas,
    // el punto que el usuario quiere fijo es aquel sobre el que empezó a rodar.
    if (pendiente) return;
    pendiente = {
      view: before,
      screenX: event.clientX - rect.left,
      screenY: event.clientY - rect.top,
    };
  };

  const onChange = () => {
    if (!pendiente) return;
    const after = port.planView();
    if (!after) {
      pendiente = null;
      return;
    }
    if (Math.abs(after.pixelsPerUnit - pendiente.view.pixelsPerUnit) <= CAMBIO_MINIMO) return;
    const { view, screenX, screenY } = pendiente;
    // Se limpia ANTES de corregir: `panDrawing` provoca otro cambio de vista y
    // sin esto se re-entraría con el anclaje ya gastado.
    pendiente = null;
    const { dx, dy } = cadPlanWheelAnchorCorrection(view, after, screenX, screenY);
    if (dx !== 0 || dy !== 0) port.panDrawing(dx, dy);
  };

  // `passive`: no se llama a `preventDefault` — el zoom lo sigue haciendo
  // OrbitControls y este oyente sólo anota.
  element.addEventListener("wheel", onWheel, { passive: true });
  const soltarCambios = port.onViewChange(onChange);
  return () => {
    element.removeEventListener("wheel", onWheel);
    soltarCambios();
  };
}

/**
 * El enganche del ESTUDIO: la vista 2D derivada y el encuadre por el objetivo
 * de OrbitControls.
 *
 * Vive aquí y no en el monolito por el presupuesto de líneas, y porque es
 * exactamente la clase de pegamento que no debería estar en un archivo de
 * 18.000 líneas: dos accesores y una conversión de unidades de dibujo a
 * unidades de escena.
 *
 * Correr el OBJETIVO y no la cámara es lo que hace que la corrección sobreviva:
 * `controls.update()` recoloca la cámara conservando el desplazamiento, así que
 * mover el objetivo mueve el encuadre entero, que es de donde la vista 2D saca
 * su centro.
 */
export function attachCadPlanWheelAnchor(
  element: HTMLElement,
  viewController: {
    readonly view: CadView;
    readonly mode: "2d" | "3d";
    onChange(listener: () => void): () => void;
  },
  controls: { target: { x: number; z: number }; update(): void },
  drawingScale: number,
): () => void {
  return attachCadPlanWheelAnchorPort(element, {
    planView: () => (viewController.mode === "2d" ? viewController.view : null),
    panDrawing: (dx, dy) => {
      controls.target.x += dx * drawingScale;
      controls.target.z += dy * drawingScale;
      controls.update();
    },
    onViewChange: (listener) => viewController.onChange(listener),
  });
}
