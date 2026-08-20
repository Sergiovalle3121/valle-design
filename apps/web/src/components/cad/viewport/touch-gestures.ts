/**
 * Gestos de un dedo, dos dedos y pulsación larga sobre el lienzo CAD.
 *
 * ## Qué estaba roto, medido antes de escribir una línea
 *
 * `docs/cad/evidence/touch-support.json` lo publica con cifras. El visor
 * escuchaba `pointerdown`, `pointermove` y `click`, que en teoría cubren el
 * táctil, y por eso nadie lo había mirado. Con puntos de contacto de verdad
 * salieron tres agujeros:
 *
 *  1. **Un dedo sobre el fondo PANEABA la cámara** (89-95 px medidos de un
 *     gesto de 96). El paneo con un dedo no es sólo redundante con el de dos:
 *     hace imposible designar por ventana y, peor, arrastra el plano justo
 *     mientras se intenta apuntar.
 *  2. **Deslizar descalificaba el toque.** El editor aceptaba un `pointerup`
 *     como clic sólo si el puntero se había movido menos de 5 px — tolerancia
 *     de RATÓN. Con el dedo eso es fatal: un dedo no tiene hover, así que la
 *     única forma de ver a dónde va a caer un punto es posarlo, deslizar
 *     mirando la insignia de captura y soltar. Ese deslizamiento anulaba el
 *     punto: en la sonda, dos gestos de apuntado seguidos dejaban el documento
 *     EXACTAMENTE igual.
 *  3. **No había botón derecho.** La pulsación larga no abría nada, y el
 *     navegador emulado ni siquiera emite `contextmenu` (medido). Sin él, las
 *     palabras clave del paso —`Cerrar`, `desHacer`, `3P`, `Ttr`…— y el menú
 *     del grip caliente son INALCANZABLES desde una tableta.
 *
 * ## Las tres reglas que impone este reconocedor
 *
 * · **Un dedo designa y arrastra; dos dedos manejan la cámara.** Es el reparto
 *   universal, y el único que deja sitio a la designación por ventana.
 * · **Deslizar es APUNTAR.** Con un comando del motor abierto, soltar el dedo
 *   fija el punto donde quedó, se haya movido lo que se haya movido. Sin
 *   comando abierto, deslizar sigue siendo un arrastre y no designa nada — que
 *   es lo que espera quien mueve un grip.
 * · **Mantener pulsado es el botón derecho.** No se reinventa ningún menú: se
 *   emite un `contextmenu` de verdad sobre el lienzo, y lo recogen los mismos
 *   dos oyentes que ya atendían al ratón — el del motor, que ofrece las
 *   palabras clave del paso, y el del editor, que ofrece el menú general.
 *
 * ## Por qué vive fuera del monolito
 *
 * Igual que `pointer-router.ts` y `native-grip-controller.ts`: el estado nace y
 * muere con el lienzo THREE, no aporta ni un `useState`, y así se puede probar
 * en Node —sin DOM— con un reloj inyectado.
 */

/** Lo mínimo de un `PointerEvent` que este reconocedor necesita. */
export interface CadTouchPointerLike {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  /**
   * Instante que el NAVEGADOR le puso al evento, no el instante en que este
   * código llegó a ejecutarse. La diferencia es la que decide si un gesto fue
   * un toque o una pulsación larga cuando el hilo principal se atasca.
   */
  timeStamp: number;
}

/**
 * Cuánto hay que mantener el dedo para que valga por botón derecho.
 *
 * 500 ms es el umbral que usan iOS y Android para su propio menú contextual.
 * Copiarlo no es pereza: es la memoria muscular que el usuario ya trae puesta,
 * y desviarse hace que el gesto se sienta roto aunque funcione.
 */
export const CAD_TOUCH_LONG_PRESS_MS = 500;

/**
 * Cuánto puede derivar el dedo sin dejar de ser una pulsación larga.
 *
 * Un dedo apoyado NUNCA está quieto: la huella se deforma y el punto que
 * reporta el sistema pasea. 12 px es la deriva típica de un dedo apoyado que
 * su dueño cree inmóvil.
 */
export const CAD_TOUCH_LONG_PRESS_SLOP_PX = 12;

/**
 * Cuánto puede moverse un dedo y seguir siendo un TOQUE.
 *
 * Los 5 px del camino del ratón son la tolerancia de un aparato que apoya en
 * una mesa. Medido en la sonda: con 16 px de temblor sobre un muro, el editor
 * ya no lo designaba en una tableta vertical. 18 px cubre el temblor real sin
 * llegar a confundir un toque con un arrastre corto.
 */
export const CAD_TOUCH_TAP_SLOP_PX = 18;

/**
 * Valor de `OrbitControls.touches.ONE` que significa «un dedo no maneja la
 * cámara». THREE no publica un `TOUCH.NONE`; su `switch` manda al estado
 * NONE cualquier valor que no reconoce, y ésa es exactamente la intención.
 * Se nombra aquí para que el lector no tenga que deducirla de un `-1` suelto.
 */
export const CAD_TOUCH_ONE_FINGER_IDLE = -1;

/** Qué fue el gesto que acaba de soltarse, y si debe fijar un punto. */
export type CadTouchRelease =
  | { kind: "toque"; commits: true }
  | { kind: "apuntado"; commits: true }
  | { kind: "arrastre"; commits: false }
  | { kind: "multitactil"; commits: false }
  | { kind: "pulsacion-larga"; commits: false }
  | { kind: "secundario"; commits: false };

export interface CadTouchGestureDeps {
  /**
   * Abre el menú contextual en el punto del gesto. En el producto es un
   * `contextmenu` emitido sobre el lienzo (ver `cadDispatchContextMenu`); en
   * la spec es un doble que apunta la llamada.
   */
  openContextMenu(event: CadTouchPointerLike): void;
  /**
   * Retira el menú que la pulsación larga abrió sin que la hubiera.
   *
   * Hace falta porque el temporizador puede dispararse TARDE: si el hilo del
   * navegador se atasca —un `rebuildAll` sobre un plano grande basta—, el dedo
   * ya se levantó cuando el temporizador llega a correr, y el menú aparece
   * sobre un gesto que fue un toque. Medido en la sonda con el hilo bloqueado
   * 1,6 s. El desempate lo dan los SELLOS DE TIEMPO del navegador, que no se
   * atascan; si dicen que el dedo estuvo abajo menos de lo debido, el menú se
   * retira y el gesto vuelve a ser lo que fue.
   */
  closeContextMenu(): void;
  /**
   * ¿Manda el motor de comandos? Es lo que distingue APUNTAR de ARRASTRAR:
   * con un comando abierto, soltar fija el punto; sin él, un arrastre es un
   * arrastre y no designa nada.
   */
  engineActive(): boolean;
  /** Reloj inyectable. Devuelve el cancelador. En Node no hay `window`. */
  schedule?(callback: () => void, ms: number): () => void;
  longPressMs?: number;
}

interface Contact {
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** Sello del navegador en el `pointerdown`. El juez de la pulsación larga. */
  downAt: number;
}

function defaultSchedule(callback: () => void, ms: number): () => void {
  const handle = setTimeout(callback, ms);
  return () => clearTimeout(handle);
}

/**
 * Emite un `contextmenu` de verdad sobre el lienzo, en el punto del dedo.
 *
 * Es deliberado no llamar directamente a ningún menú: el editor ya tiene DOS
 * oyentes de `contextmenu` sobre el mismo lienzo —el del motor, que ofrece las
 * palabras clave del paso, y el de React, que ofrece el menú general y se
 * aparta cuando el motor manda—. Emitiendo el evento, la pulsación larga hereda
 * ese reparto tal cual, sin duplicarlo y sin poder desincronizarse de él.
 */
export function cadDispatchContextMenu(target: EventTarget, event: CadTouchPointerLike): void {
  target.dispatchEvent(
    // `PointerEvent` y no `MouseEvent`: así el evento DECLARA que viene de un
    // dedo. Quien lo recibe necesita saberlo, porque con el ratón un
    // `contextmenu` sobre un paso sin palabras clave vale por Enter —gesto de
    // AutoCAD— y con el dedo eso terminaría el comando de quien sólo apoyó la
    // mano para mirar el plano.
    new PointerEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: event.clientX,
      clientY: event.clientY,
      button: 2,
      buttons: 2,
      pointerId: event.pointerId,
      pointerType: "touch",
    }),
  );
}

/**
 * Lo que el editor le presta al reconocedor: su lienzo, sus dos menús y su
 * motor.
 *
 * ## Por qué esto es una interfaz y no cuatro variables del monolito
 *
 * El cableado nació dentro del `useEffect` del visor, y allí no se podía probar:
 * hace falta un lienzo THREE para llegar a él. El reparto que describe —quién
 * abre el menú, quién lo retira y a quién se le pregunta si el motor manda— es
 * exactamente lo que puede desincronizarse en la siguiente ola sin que nada
 * chille, porque son cuatro devoluciones de llamada sueltas en mitad de mil
 * líneas de oyentes de puntero.
 */
export interface CadTouchGestureWiring {
  /**
   * Lienzo del visor. Sobre ÉL se emite el `contextmenu`, no sobre el documento:
   * los dos oyentes que atienden al botón derecho están puestos ahí.
   */
  canvas: EventTarget;
  /** Retira el menú general del editor (el de React). */
  closeMenu(): void;
  /** Retira el menú de palabras clave del paso, que vive en el cursor vivo. */
  closeEngineMenu(): void;
  /**
   * ¿Manda el motor de comandos? Es lo que distingue APUNTAR de ARRASTRAR.
   */
  engineActive(): boolean;
  /**
   * Reloj inyectable, el mismo que documenta `CadTouchGestureDeps`. El producto
   * no lo pasa —se queda con `setTimeout`—; existe para que la spec pueda
   * mantener el dedo pulsado sin esperar medio segundo de reloj de pared.
   */
  schedule?(callback: () => void, ms: number): () => void;
  longPressMs?: number;
}

/**
 * Cablea el reconocedor a un visor concreto.
 *
 * El editor sólo dice CUÁLES son su lienzo, sus menús y su motor; cómo se
 * traduce eso a gestos es decisión de este módulo, que es donde está escrito el
 * porqué y donde hay una spec que lo vigila.
 */
export function createCadTouchGestures(wiring: CadTouchGestureWiring): CadTouchGestures {
  return new CadTouchGestures({
    openContextMenu: (origin) => cadDispatchContextMenu(wiring.canvas, origin),
    // Retirar el menú es retirar LOS DOS. Suelto en el monolito, nada impedía
    // que alguien cerrara sólo el general y dejara colgadas sobre el plano las
    // palabras clave del paso, que es justo lo que se ve tras una pulsación
    // larga cancelada.
    closeContextMenu: () => {
      wiring.closeMenu();
      wiring.closeEngineMenu();
    },
    engineActive: () => wiring.engineActive(),
    schedule: wiring.schedule,
    longPressMs: wiring.longPressMs,
  });
}

export class CadTouchGestures {
  private readonly contacts = new Map<number, Contact>();
  private primary: number | null = null;
  private multiTouch = false;
  private longPressFired = false;
  private cancelLongPress: (() => void) | null = null;

  constructor(private readonly deps: CadTouchGestureDeps) {}

  private get schedule() {
    return this.deps.schedule ?? defaultSchedule;
  }

  /**
   * ¿Hay un gesto táctil en curso? El editor lo usa para no dejar que el
   * teclado o la barra cambien de herramienta a mitad de un apuntado.
   */
  get active(): boolean {
    return this.contacts.size > 0;
  }

  /** El contacto que MANDA. Los demás son cámara, no designación. */
  get primaryPointerId(): number | null {
    return this.primary;
  }

  /**
   * Registra un contacto. Devuelve `true` cuando la máquina heredada debe
   * IGNORAR este `pointerdown`.
   *
   * Ignorar el segundo dedo no es un detalle: sin esto, cada contacto extra
   * de un pellizco vuelve a recorrer entero el `pointerdown` del editor —
   * limpiando la selección, arrancando un segundo arrastre de grip o abriendo
   * otra ventana de designación— mientras el usuario sólo quería encuadrar.
   */
  pointerDown(event: CadTouchPointerLike): boolean {
    if (event.pointerType !== "touch") return false;
    this.contacts.set(event.pointerId, {
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      downAt: event.timeStamp,
    });
    if (this.contacts.size > 1) {
      this.multiTouch = true;
      this.stopLongPress();
      return true;
    }
    this.primary = event.pointerId;
    this.multiTouch = false;
    this.longPressFired = false;
    // Copia CAMPO A CAMPO, no `{...event}`. Un `PointerEvent` del navegador
    // expone sus datos en el PROTOTIPO, así que esparcirlo produce un objeto
    // VACÍO: el temporizador buscaba el contacto por un `pointerId` undefined y
    // la pulsación larga no abría nada. En Node no se nota —los dobles son
    // objetos planos—, y por eso la spec construye ahora sus contactos con
    // getters de prototipo, para que el mismo error vuelva a fallar allí.
    const origin: CadTouchPointerLike = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      clientX: event.clientX,
      clientY: event.clientY,
      timeStamp: event.timeStamp,
    };
    this.cancelLongPress = this.schedule(() => {
      this.cancelLongPress = null;
      const contact = this.contacts.get(origin.pointerId);
      if (!contact || this.contacts.size !== 1 || this.multiTouch) return;
      this.longPressFired = true;
      this.deps.openContextMenu(origin);
    }, this.deps.longPressMs ?? CAD_TOUCH_LONG_PRESS_MS);
    return false;
  }

  /**
   * Actualiza el contacto. Devuelve `true` cuando la máquina heredada debe
   * IGNORAR este `pointermove` — el de un dedo que no es el principal, que si
   * llegara haría saltar el cursor vivo entre las dos manos durante un
   * pellizco.
   */
  pointerMove(event: CadTouchPointerLike): boolean {
    if (event.pointerType !== "touch") return false;
    const contact = this.contacts.get(event.pointerId);
    if (!contact) return false;
    contact.x = event.clientX;
    contact.y = event.clientY;
    if (
      Math.hypot(contact.x - contact.startX, contact.y - contact.startY) >
      CAD_TOUCH_LONG_PRESS_SLOP_PX
    ) {
      this.stopLongPress();
      // Si el menú ya se había abierto, ARRASTRAR LO RETIRA y el gesto vuelve a
      // ser un apuntado. Apoyar el dedo, mirar el plano un segundo y sólo
      // entonces deslizar hasta el punto es exactamente lo que hace quien
      // precisa con el dedo; sin esto, esa pausa abría un menú que se comía el
      // gesto y el punto no se fijaba nunca.
      if (this.longPressFired) {
        this.longPressFired = false;
        this.deps.closeContextMenu();
      }
    }
    return event.pointerId !== this.primary;
  }

  /**
   * Cierra el gesto de un contacto y dictamina qué fue.
   *
   * Devuelve `null` para un puntero que no es táctil: ese camino lo sigue
   * decidiendo la regla del ratón, que no se toca.
   */
  pointerUp(event: CadTouchPointerLike): CadTouchRelease | null {
    if (event.pointerType !== "touch") return null;
    const contact = this.contacts.get(event.pointerId);
    this.contacts.delete(event.pointerId);
    this.stopLongPress();
    const isPrimary = event.pointerId === this.primary;
    const wasMultiTouch = this.multiTouch;
    const longPressed = this.longPressFired;
    if (this.contacts.size === 0) this.reset();
    if (!contact || !isPrimary) return { kind: "secundario", commits: false };
    const travelled = Math.hypot(event.clientX - contact.startX, event.clientY - contact.startY);
    if (longPressed) {
      // ¿De verdad estuvo el dedo abajo lo que hace falta? Lo dicen los SELLOS
      // DEL NAVEGADOR, no el reloj de este código: con el hilo atascado el
      // temporizador corre tarde y abre el menú sobre un gesto que ya terminó.
      if (event.timeStamp - contact.downAt >= (this.deps.longPressMs ?? CAD_TOUCH_LONG_PRESS_MS))
        return { kind: "pulsacion-larga", commits: false };
      this.deps.closeContextMenu();
    }
    if (wasMultiTouch) return { kind: "multitactil", commits: false };
    if (travelled <= CAD_TOUCH_TAP_SLOP_PX) return { kind: "toque", commits: true };
    // Deslizar es APUNTAR, pero sólo mientras el motor espera un punto. Sin
    // comando abierto un arrastre es un arrastre: mover un grip, tirar de una
    // ventana de designación o —con dos dedos— encuadrar.
    if (this.deps.engineActive()) return { kind: "apuntado", commits: true };
    return { kind: "arrastre", commits: false };
  }

  /** El sistema se llevó el contacto (llamada entrante, gesto del sistema). */
  pointerCancel(event: CadTouchPointerLike): void {
    if (event.pointerType !== "touch") return;
    this.contacts.delete(event.pointerId);
    if (this.contacts.size === 0) this.reset();
    else this.stopLongPress();
  }

  dispose(): void {
    this.reset();
  }

  private stopLongPress(): void {
    this.cancelLongPress?.();
    this.cancelLongPress = null;
  }

  private reset(): void {
    this.stopLongPress();
    this.contacts.clear();
    this.primary = null;
    this.multiTouch = false;
    this.longPressFired = false;
  }
}
