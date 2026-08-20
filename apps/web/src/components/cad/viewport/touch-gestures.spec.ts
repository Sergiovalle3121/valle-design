/**
 * Spec del reconocedor de gestos táctiles.
 *
 * Lo que se cierra aquí son las tres reglas que la sonda demostró que faltaban,
 * y se cierran en Node porque no hacen falta píxeles para decidirlas: son una
 * máquina de estados sobre contactos, un reloj y una pregunta al motor.
 *
 *  1. Deslizar con un comando abierto APUNTA y al soltar fija el punto; sin
 *     comando abierto, el mismo deslizamiento es un arrastre y no fija nada.
 *  2. El segundo dedo apaga la designación: encuadrar no puede ensuciar el
 *     dibujo ni hacer saltar el cursor entre las dos manos.
 *  3. Mantener pulsado emite el menú contextual, y el `pointerup` que viene
 *     detrás NO fija un punto — si lo fijara, cerraría el menú que el propio
 *     gesto acaba de abrir, que es el defecto que ya documenta el enrutador
 *     para el botón derecho del ratón.
 */
import assert from "node:assert/strict";
import {
  CAD_TOUCH_LONG_PRESS_MS,
  CAD_TOUCH_LONG_PRESS_SLOP_PX,
  CAD_TOUCH_TAP_SLOP_PX,
  CadTouchGestures,
  type CadTouchPointerLike,
} from "./touch-gestures";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

/** Reloj de mentira: el tiempo avanza cuando el test lo dice. */
class FakeClock {
  private pending: Array<{ at: number; callback: () => void; cancelled: boolean }> = [];
  now = 0;
  schedule = (callback: () => void, ms: number): (() => void) => {
    const entry = { at: this.now + ms, callback, cancelled: false };
    this.pending.push(entry);
    return () => {
      entry.cancelled = true;
    };
  };
  advance(ms: number): void {
    this.now += ms;
    const due = this.pending.filter((entry) => !entry.cancelled && entry.at <= this.now);
    this.pending = this.pending.filter((entry) => !due.includes(entry));
    for (const entry of due) entry.callback();
  }
}

interface Harness {
  gestures: CadTouchGestures;
  clock: FakeClock;
  menus: CadTouchPointerLike[];
  retracted: number;
  setEngine(active: boolean): void;
}

function harness(engineActive = false): Harness {
  const clock = new FakeClock();
  const menus: CadTouchPointerLike[] = [];
  let active = engineActive;
  const state = { retracted: 0 };
  const gestures = new CadTouchGestures({
    openContextMenu: (event) => menus.push(event),
    closeContextMenu: () => {
      state.retracted += 1;
      menus.pop();
    },
    engineActive: () => active,
    schedule: clock.schedule,
  });
  return {
    gestures,
    clock,
    menus,
    get retracted() {
      return state.retracted;
    },
    setEngine: (value: boolean) => {
      active = value;
    },
  };
}

/**
 * Doble de evento con los datos en el PROTOTIPO, como un `PointerEvent` de
 * verdad.
 *
 * No es una floritura: con dobles planos, un `{...event}` dentro del
 * reconocedor parece funcionar y en el navegador produce un objeto VACÍO. Pasó
 * —la pulsación larga no abría nada y la spec seguía verde—, y se arregló
 * haciendo que el doble mienta lo mismo que el original.
 */
class PointerLike implements CadTouchPointerLike {
  constructor(
    private readonly id: number,
    private readonly kind: string,
    private readonly cx: number,
    private readonly cy: number,
    private readonly at: number,
  ) {}
  get pointerId() {
    return this.id;
  }
  get pointerType() {
    return this.kind;
  }
  get clientX() {
    return this.cx;
  }
  get clientY() {
    return this.cy;
  }
  get timeStamp() {
    return this.at;
  }
}

const finger = (id: number, x: number, y: number, at = 0): CadTouchPointerLike =>
  new PointerLike(id, "touch", x, y, at);

const mouse = (x: number, y: number): CadTouchPointerLike => new PointerLike(99, "mouse", x, y, 0);

// ---- 1. EL RATÓN NO SE TOCA ------------------------------------------------
{
  const { gestures } = harness();
  assert.equal(gestures.pointerDown(mouse(10, 10)), false);
  assert.equal(gestures.pointerMove(mouse(200, 200)), false);
  assert.equal(gestures.pointerUp(mouse(200, 200)), null, "el ratón no recibe veredicto táctil");
  ok(true, "un puntero de ratón atraviesa el reconocedor sin que éste opine");
}

// ---- 2. UN TOQUE LIMPIO DESIGNA -------------------------------------------
{
  const { gestures } = harness();
  gestures.pointerDown(finger(1, 100, 100));
  gestures.pointerMove(finger(1, 104, 103));
  const release = gestures.pointerUp(finger(1, 104, 103));
  assert.deepEqual(release, { kind: "toque", commits: true });
  ok(true, "un toque con temblor por debajo del umbral sigue siendo un toque");
}

// ---- 3. EL TEMBLOR DEL DEDO ------------------------------------------------
{
  const { gestures } = harness();
  gestures.pointerDown(finger(1, 100, 100));
  const jitter = CAD_TOUCH_TAP_SLOP_PX - 2;
  gestures.pointerMove(finger(1, 100 + jitter, 100));
  const release = gestures.pointerUp(finger(1, 100 + jitter, 100));
  assert.equal(release?.commits, true, `${jitter} px de temblor NO pueden anular un toque`);
  ok(
    CAD_TOUCH_TAP_SLOP_PX > 16,
    "la tolerancia del toque supera los 16 px con los que la sonda medía fallos reales",
  );
}

// ---- 4. DESLIZAR ES APUNTAR, PERO SÓLO CON EL MOTOR ABIERTO ---------------
{
  const conMotor = harness(true);
  conMotor.gestures.pointerDown(finger(1, 100, 100));
  conMotor.gestures.pointerMove(finger(1, 160, 130));
  assert.deepEqual(conMotor.gestures.pointerUp(finger(1, 160, 130)), {
    kind: "apuntado",
    commits: true,
  });

  const sinMotor = harness(false);
  sinMotor.gestures.pointerDown(finger(1, 100, 100));
  sinMotor.gestures.pointerMove(finger(1, 160, 130));
  assert.deepEqual(sinMotor.gestures.pointerUp(finger(1, 160, 130)), {
    kind: "arrastre",
    commits: false,
  });
  ok(true, "el mismo deslizamiento fija punto con comando abierto y no designa sin él");
}

// ---- 5. EL SEGUNDO DEDO APAGA LA DESIGNACIÓN ------------------------------
{
  const { gestures } = harness(true);
  assert.equal(gestures.pointerDown(finger(1, 100, 100)), false, "el primer dedo sí llega al editor");
  assert.equal(gestures.pointerDown(finger(2, 300, 100)), true, "el segundo dedo se ignora");
  assert.equal(gestures.pointerMove(finger(2, 340, 100)), true, "y su movimiento también");
  assert.equal(gestures.pointerMove(finger(1, 90, 100)), false, "el principal sigue mandando el cursor");
  assert.deepEqual(gestures.pointerUp(finger(1, 60, 100)), { kind: "multitactil", commits: false });
  assert.deepEqual(gestures.pointerUp(finger(2, 400, 100)), { kind: "secundario", commits: false });
  ok(true, "encuadrar con dos dedos no fija ningún punto ni mueve el cursor vivo");
}

// ---- 6. EL SEGUNDO DEDO CANCELA LA PULSACIÓN LARGA ------------------------
{
  const { gestures, clock, menus } = harness(true);
  gestures.pointerDown(finger(1, 100, 100));
  clock.advance(CAD_TOUCH_LONG_PRESS_MS - 50);
  gestures.pointerDown(finger(2, 300, 100));
  clock.advance(200);
  assert.equal(menus.length, 0, "un pellizco lento no puede abrir el menú contextual");
  ok(true, "el segundo contacto cancela la pulsación larga en curso");
}

// ---- 7. MANTENER PULSADO ES EL BOTÓN DERECHO ------------------------------
{
  const { gestures, clock, menus } = harness(true);
  gestures.pointerDown(finger(1, 220, 180));
  gestures.pointerMove(finger(1, 220 + CAD_TOUCH_LONG_PRESS_SLOP_PX - 2, 180));
  clock.advance(CAD_TOUCH_LONG_PRESS_MS);
  assert.equal(menus.length, 1, "la deriva de un dedo apoyado no cancela la pulsación larga");
  assert.equal(menus[0]!.clientX, 220, "el menú se abre donde el dedo se posó, no donde derivó");
  const release = gestures.pointerUp(finger(1, 232, 180, CAD_TOUCH_LONG_PRESS_MS + 40));
  assert.deepEqual(
    release,
    { kind: "pulsacion-larga", commits: false },
    "soltar tras la pulsación larga NO fija un punto: cerraría el menú recién abierto",
  );
  ok(true, "mantener pulsado emite el menú contextual y el soltar posterior no designa");
}

// ---- 8. MOVERSE DE VERDAD SÍ CANCELA LA PULSACIÓN LARGA -------------------
{
  const { gestures, clock, menus } = harness(true);
  gestures.pointerDown(finger(1, 220, 180));
  gestures.pointerMove(finger(1, 220 + CAD_TOUCH_LONG_PRESS_SLOP_PX + 6, 180));
  clock.advance(CAD_TOUCH_LONG_PRESS_MS + 100);
  assert.equal(menus.length, 0, "apuntar deslizando no puede abrir un menú a media maniobra");
  assert.equal(gestures.pointerUp(finger(1, 260, 180))?.kind, "apuntado");
  ok(true, "un deslizamiento por encima de la deriva cancela la pulsación larga");
}

// ---- 7b. APOYAR, MIRAR Y ENTONCES APUNTAR ---------------------------------
// El gesto de quien precisa con el dedo: posarlo, mirar el plano un segundo y
// sólo entonces deslizar hasta el punto. Si esa pausa dejara el menú abierto,
// el apuntado no fijaría nada — y es lo que medía la sonda.
{
  const bench = harness(true);
  bench.gestures.pointerDown(finger(1, 300, 300, 0));
  bench.clock.advance(CAD_TOUCH_LONG_PRESS_MS + 100);
  assert.equal(bench.menus.length, 1, "la pausa abre el menú, como en cualquier tableta");
  bench.gestures.pointerMove(finger(1, 340, 320, 900));
  assert.equal(bench.menus.length, 0, "y deslizar lo retira: el gesto pasa a ser un apuntado");
  assert.deepEqual(bench.gestures.pointerUp(finger(1, 344, 322, 1_100)), {
    kind: "apuntado",
    commits: true,
  });
  ok(true, "apoyar, mirar y deslizar acaba fijando el punto, no abriendo un menú");
}

// ---- 8b. EL HILO SE ATASCA Y EL MENÚ SE RETIRA ----------------------------
// Medido en la sonda: con el hilo del navegador bloqueado 1,6 s, el
// temporizador corre TARDE y abre el menú sobre un dedo que ya se había
// levantado. El desempate son los sellos del navegador, que no se atascan.
{
  const bench = harness(true);
  bench.gestures.pointerDown(finger(1, 140, 140, 1_000));
  // El hilo estuvo bloqueado: cuando el reloj de este código llega al umbral,
  // el dedo lleva rato fuera. El menú se abre igualmente…
  bench.clock.advance(CAD_TOUCH_LONG_PRESS_MS + 1_200);
  assert.equal(bench.menus.length, 1, "el temporizador abre el menú aunque corra tarde");
  // …y el `pointerup`, con su sello de HARDWARE, demuestra que fueron 90 ms.
  const release = bench.gestures.pointerUp(finger(1, 142, 141, 1_090));
  assert.deepEqual(release, { kind: "toque", commits: true }, "fue un toque, y designa");
  assert.equal(bench.retracted, 1, "y el menú abierto por error se retira");
  ok(true, "un hilo atascado no convierte un toque en pulsación larga");
}

// ---- 9. EL SISTEMA SE LLEVA EL DEDO ---------------------------------------
{
  const { gestures, clock, menus } = harness(true);
  gestures.pointerDown(finger(1, 100, 100));
  gestures.pointerCancel(finger(1, 100, 100));
  clock.advance(CAD_TOUCH_LONG_PRESS_MS + 100);
  assert.equal(menus.length, 0, "un contacto cancelado no abre menús más tarde");
  assert.equal(gestures.active, false, "y el reconocedor queda limpio para el gesto siguiente");
  ok(true, "una cancelación del sistema no deja temporizadores vivos");
}

// ---- 10. EL GESTO SIGUIENTE ARRANCA LIMPIO --------------------------------
{
  const { gestures, clock, menus } = harness(true);
  gestures.pointerDown(finger(1, 100, 100));
  gestures.pointerDown(finger(2, 300, 100));
  gestures.pointerUp(finger(1, 100, 100));
  gestures.pointerUp(finger(2, 300, 100));
  gestures.pointerDown(finger(3, 150, 150, 2_000));
  clock.advance(CAD_TOUCH_LONG_PRESS_MS);
  assert.equal(menus.length, 1, "tras un pellizco, la pulsación larga vuelve a funcionar");
  assert.deepEqual(gestures.pointerUp(finger(3, 150, 150, 2_000 + CAD_TOUCH_LONG_PRESS_MS)), {
    kind: "pulsacion-larga",
    commits: false,
  });
  ok(true, "el estado multitáctil no sobrevive al gesto que lo produjo");
}

console.log(
  `touch-gestures: ${checks} comprobaciones — un dedo designa y apunta, dos dedos son cámara y no ` +
    `ensucian el dibujo, mantener pulsado emite el menú contextual sin que el soltar posterior lo cierre, ` +
    `y el ratón atraviesa el reconocedor intacto.`,
);
