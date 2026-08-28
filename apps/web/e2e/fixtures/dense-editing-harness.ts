/**
 * Arnés del estrés de edición densa: el corpus de trazos y el reloj que vive
 * DENTRO de la página.
 *
 * ## Por qué está aquí y no dentro del spec
 *
 * Dos motivos, y el segundo es el que decide. El primero es de tamaño: el spec
 * completo pasaba de las 800 líneas que el repositorio admite en un archivo
 * nuevo. El segundo es de naturaleza: el corpus y el cronómetro son
 * INSTRUMENTOS, y un instrumento que vive dentro del experimento que mide
 * termina cambiando con él. Separarlos obliga a que cualquier retoque del
 * escenario deje el instrumento intacto — y a que si algún día hay un segundo
 * escenario denso, mida con la misma regla.
 *
 * ## El corpus: densidad y agrupamiento, no cobertura
 *
 * El corpus de 100.000 que ya existía son arcos en malla regular: perfecto para
 * medir cuánto tarda el pipeline en dibujarlos, inútil para medir SELECCIÓN.
 * Lo que encarece encerrar una habitación en una ventana es cuántos trazos
 * cortos comparten celda del índice espacial, y eso sólo se reproduce con
 * habitaciones. Aquí son 5.000 de 600 × 900 mm sobre una planta de 60 × 45 m,
 * con veinte trazos cada una: cuatro caras de muro y dieciséis de acabado.
 *
 * ## El reloj: por qué no vale `Date.now()` alrededor de un `expect`
 *
 * Porque eso mide el intervalo de sondeo de Playwright —decenas de
 * milisegundos, y cada sondeo va y vuelve por CDP—, no el producto. Aquí se
 * arma un `MutationObserver` dentro de la página que fecha con
 * `performance.now()` cada cambio del HUD, y el reloj arranca en la página
 * justo antes de que Playwright despache el gesto. El número resultante INCLUYE
 * el viaje del comando por CDP, unos pocos milisegundos, y eso se declara en el
 * artefacto en vez de restarlo: restar una latencia que no se ha medido es
 * inventarse precisión.
 */
import { expect, type Page } from "@playwright/test";
import { enter3DView } from './view-mode';

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

export const ROOM_COLUMNS = 100;
export const ROOM_ROWS = 50;
export const ROOM_WIDTH = 600;
export const ROOM_HEIGHT = 900;
/**
 * Retranqueo del muro dentro de su celda.
 *
 * No es decoración: deja 200 mm de pasillo vacío a cada lado del límite de la
 * habitación. A este encuadre —una planta de 60 × 45 m en un lienzo de
 * 1280 × 720— un píxel son unos 65 mm de dibujo, y el mapeador mundo→pantalla
 * se da por bueno con un error de hasta píxel y medio. Sin ese pasillo, un
 * error de colocación de 100 mm podría meter el borde de la ventana DENTRO de
 * una habitación y sacar sus veinte trazos del recuento. Con 200 mm, no puede.
 */
export const WALL_INSET = 200;
export const STROKES_PER_ROOM = 20;
export const WALL_STROKES_PER_ROOM = 4;
export const ROOM_COUNT = ROOM_COLUMNS * ROOM_ROWS;
export const ENTITY_COUNT = ROOM_COUNT * STROKES_PER_ROOM;
export const WALL_ENTITY_COUNT = ROOM_COUNT * WALL_STROKES_PER_ROOM;
export const DENSE_FOOTPRINT = {
  footprintW: ROOM_COLUMNS * ROOM_WIDTH,
  footprintH: ROOM_ROWS * ROOM_HEIGHT,
  unit: "mm",
  gridSize: 100,
};

interface Point {
  x: number;
  y: number;
  z: number;
}

function line(id: string, a: Point, b: Point, layer: string) {
  return { id, type: "line" as const, start: a, end: b, layer };
}

/**
 * Una habitación: cuatro caras de muro y dieciséis trazos de acabado.
 *
 * Los acabados van en una retícula 4 × 4 de segmentos cortos e inclinados. Son
 * lo que hace que el índice espacial tenga que devolver muchos candidatos por
 * celda, que es exactamente el trabajo que la selección por ventana paga. La
 * inclinación ALTERNA para que dos trazos de la misma celda no sean paralelos:
 * con todos paralelos, el hit-test podría resolverlos con la misma caja y el
 * corpus mediría menos trabajo del que un plano real impone.
 */
function roomStrokes(room: number): ReturnType<typeof line>[] {
  const column = room % ROOM_COLUMNS;
  const row = Math.floor(room / ROOM_COLUMNS);
  const x0 = column * ROOM_WIDTH + WALL_INSET;
  const y0 = row * ROOM_HEIGHT + WALL_INSET;
  const x1 = (column + 1) * ROOM_WIDTH - WALL_INSET;
  const y1 = (row + 1) * ROOM_HEIGHT - WALL_INSET;
  const at = (x: number, y: number): Point => ({ x, y, z: 0 });
  const prefix = `d${String(room).padStart(5, "0")}`;
  const strokes = [
    line(`${prefix}-m0`, at(x0, y0), at(x1, y0), "MURO"),
    line(`${prefix}-m1`, at(x1, y0), at(x1, y1), "MURO"),
    line(`${prefix}-m2`, at(x1, y1), at(x0, y1), "MURO"),
    line(`${prefix}-m3`, at(x0, y1), at(x0, y0), "MURO"),
  ];
  const stepX = (x1 - x0) / 5;
  const stepY = (y1 - y0) / 5;
  for (let index = 0; index < STROKES_PER_ROOM - WALL_STROKES_PER_ROOM; index += 1) {
    const cx = x0 + stepX * (1 + (index % 4));
    const cy = y0 + stepY * (1 + Math.floor(index / 4));
    const tilt = index % 2 === 0 ? 1 : -1;
    strokes.push(
      line(
        `${prefix}-a${String(index).padStart(2, "0")}`,
        at(cx - stepX * 0.35, cy - stepY * 0.35 * tilt),
        at(cx + stepX * 0.35, cy + stepY * 0.35 * tilt),
        "ACABADO",
      ),
    );
  }
  return strokes;
}

export function denseCadDocument() {
  const entities: ReturnType<typeof line>[] = [];
  for (let room = 0; room < ROOM_COUNT; room += 1) entities.push(...roomStrokes(room));
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "MURO", name: "MURO", color: "#f8fafc", visible: true, locked: false },
      { id: "ACABADO", name: "ACABADO", color: "#60a5fa", visible: true, locked: false },
    ],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
  };
}

export interface RoomBlock {
  min: { x: number; y: number };
  max: { x: number; y: number };
  /** Trazos que el rectángulo encierra POR COMPLETO. */
  expectedEntities: number;
}

/**
 * Rectángulo de mundo que encierra por completo un bloque de habitaciones.
 *
 * Los bordes caen EXACTAMENTE en el límite entre habitaciones, que es el punto
 * equidistante de los trazos de las dos vecinas: 200 mm de holgura a cada lado.
 * Cualquier otro sitio dejaría el margen asimétrico y un error de colocación
 * pequeño cambiaría el recuento por un lado antes que por el otro.
 */
export function roomBlockWindow(
  column: number,
  row: number,
  columns: number,
  rows: number,
): RoomBlock {
  return {
    min: { x: column * ROOM_WIDTH, y: row * ROOM_HEIGHT },
    max: { x: (column + columns) * ROOM_WIDTH, y: (row + rows) * ROOM_HEIGHT },
    expectedEntities: columns * rows * STROKES_PER_ROOM,
  };
}

// ---------------------------------------------------------------------------
// El reloj, dentro de la página
// ---------------------------------------------------------------------------

export interface DenseSnapshot {
  total: number | null;
  visible: number | null;
  rendered: number | null;
  settled: string | null;
  documentCount: number | null;
  selection: number | null;
  undo: number | null;
  redo: number | null;
}

export interface DenseSample {
  t: number;
  snapshot: DenseSnapshot;
}

/**
 * Se inyecta como TEXTO y no como función tipada porque tiene que ejecutarse
 * en la página, donde no existen ni los tipos ni el `import`. Se mantiene en
 * una constante para que el spec no la reescriba por accidente.
 */
const PROBE_SOURCE = String.raw`(() => {
  const w = window;
  if (w.__denseObserver) w.__denseObserver.disconnect();
  const number = (value) => (value === null || value === undefined || value === '' ? null : Number(value));
  const digits = (node) => {
    if (!node) return null;
    const match = /(-?\d+)/.exec(node.textContent || '');
    return match ? Number(match[1]) : null;
  };
  const read = () => {
    const stats = document.querySelector('[data-testid="cad-render-pipeline"]');
    const selection = document.querySelector('[data-testid="cad-selection-status-count"]');
    const documentCount = document.querySelector('[data-testid="cad-native-document-count"]');
    const history = document.querySelector('[data-testid="cad-history-depth"]');
    return {
      total: number(stats && stats.getAttribute('data-total')),
      visible: number(stats && stats.getAttribute('data-visible')),
      rendered: number(stats && stats.getAttribute('data-rendered')),
      settled: stats ? stats.getAttribute('data-settled') : null,
      documentCount: digits(documentCount),
      selection: digits(selection),
      undo: number(history && history.getAttribute('data-undo')),
      redo: number(history && history.getAttribute('data-redo')),
    };
  };
  const t0 = performance.now();
  const first = read();
  let last = JSON.stringify(first);
  w.__denseProbe = { samples: [{ t: 0, snapshot: first }] };
  const observer = new MutationObserver(() => {
    const snapshot = read();
    const serialized = JSON.stringify(snapshot);
    if (serialized === last) return;
    last = serialized;
    // Tope de muestras: el HUD cambia mucho durante una reconstrucción, y sin
    // tope una sola medición dejaría decenas de miles de entradas que hay que
    // serializar en CADA sondeo. Se conservan las primeras, que son las que
    // fechan la transición buscada.
    if (w.__denseProbe.samples.length < 600)
      w.__denseProbe.samples.push({ t: performance.now() - t0, snapshot: snapshot });
  });
  observer.observe(document.body, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });
  w.__denseObserver = observer;
})()`;

export async function armDenseProbe(page: Page): Promise<void> {
  await page.evaluate(PROBE_SOURCE);
}

async function readDenseProbe(page: Page): Promise<DenseSample[]> {
  return (await page.evaluate(
    "window.__denseProbe ? window.__denseProbe.samples : []",
  )) as DenseSample[];
}

/** Lectura instantánea del HUD. Rearma el reloj como efecto secundario. */
export async function denseSnapshot(page: Page): Promise<DenseSnapshot> {
  await armDenseProbe(page);
  const samples = await readDenseProbe(page);
  return samples[0].snapshot;
}

/**
 * Cronometra un gesto: arma el reloj, lo despacha y busca la PRIMERA muestra
 * que cumple el criterio.
 *
 * Devolver la primera y no la última es deliberado. «Ya puedo trabajar» es el
 * instante en que el HUD dice lo que tiene que decir; lo que venga después son
 * repintados que el usuario ya no está esperando.
 */
export async function measureDenseGesture(
  page: Page,
  label: string,
  action: () => Promise<void>,
  matches: (snapshot: DenseSnapshot) => boolean,
  timeout = 600_000,
): Promise<{ elapsedMs: number; snapshot: DenseSnapshot }> {
  await armDenseProbe(page);
  // El DESPACHO del gesto también lleva techo, y no es una precaución teórica.
  // Medido: con las 100.000 designadas de golpe, el hilo principal se queda
  // ocupado tanto rato que el propio `click()` de Playwright no vuelve — no es
  // que el sondeo posterior caduque, es que el gesto nunca termina de
  // despacharse. Sin este techo, «el producto se bloquea» se convierte en «la
  // corrida caducó a los sesenta minutos», que dice mucho menos y además tira
  // todas las fases siguientes.
  let dispatchTimer: NodeJS.Timeout | undefined;
  await Promise.race([
    // Si el gesto acaba fallando más tarde, su rechazo no debe tumbar el
    // proceso: ya se ha registrado como caducado y el guion sigue.
    action().catch(() => undefined),
    new Promise<never>((_, reject) => {
      dispatchTimer = setTimeout(
        () =>
          reject(
            new Error(
              `${label}: el navegador no devolvió el control en ${timeout} ms — el gesto ni siquiera ` +
                "terminó de despacharse, el hilo principal seguía ocupado",
            ),
          ),
        timeout,
      );
    }),
  ]).finally(() => clearTimeout(dispatchTimer));
  let hit: DenseSample | null = null;
  await expect
    .poll(
      async () => {
        const samples = await readDenseProbe(page);
        hit = samples.find((sample) => matches(sample.snapshot)) ?? null;
        return hit !== null;
      },
      { timeout, intervals: [50, 100, 200, 400, 800, 1_600], message: label },
    )
    .toBe(true);
  const found = hit as unknown as DenseSample;
  return { elapsedMs: Number(found.t.toFixed(3)), snapshot: found.snapshot };
}

export interface DenseSeries {
  label: string;
  samplesMs: number[];
  medianMs: number;
  minMs: number;
  maxMs: number;
  spreadPercentOfMedian: number;
  observed: unknown;
}

export function denseSeries(label: string, samplesMs: number[], observed: unknown): DenseSeries {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const min = sorted[0] ?? 0;
  const max = sorted.at(-1) ?? 0;
  return {
    label,
    samplesMs,
    medianMs: Number(median.toFixed(3)),
    minMs: Number(min.toFixed(3)),
    maxMs: Number(max.toFixed(3)),
    spreadPercentOfMedian: median > 0 ? Number((((max - min) / median) * 100).toFixed(1)) : 0,
    observed,
  };
}

// ---------------------------------------------------------------------------
// Mundo → pantalla, medido UNA vez
// ---------------------------------------------------------------------------

/**
 * Lee la coordenada de mundo bajo un píxel, con frescura garantizada.
 *
 * Es la misma técnica que `world-point.ts`: moverse primero a un vecino
 * diagonal fuerza que la lectura del destino DIFIERA de la del vecino, y si
 * difiere es del destino. Un sondeo de «no vacío» aceptaría el valor de la
 * posición anterior.
 */
async function sampleWorld(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  const coordinate = page.getByTestId("cad-cursor-coordinate");
  const read = async () =>
    `${await coordinate.getAttribute("data-x")}|${await coordinate.getAttribute("data-y")}`;
  await page.mouse.move(x - 6, y - 6);
  await expect.poll(read, { timeout: 120_000 }).not.toBe("|");
  const neighbor = await read();
  await page.mouse.move(x, y);
  await expect
    .poll(read, { timeout: 120_000, message: "el HUD del cursor no se refrescó" })
    .not.toBe(neighbor);
  const [rawX, rawY] = (await read()).split("|");
  return { x: Number(rawX), y: Number(rawY) };
}

export interface WorldMapper {
  toScreen: (world: { x: number; y: number }) => { x: number; y: number };
  /** Error del lazo cerrado, en unidades de dibujo. */
  errorUnits: number;
  unitsPerPixel: number;
  /** Muestras del HUD que costó construirlo. Se publica: no es gratis. */
  samples: number;
  buildMs: number;
}

/**
 * Construye el mapa mundo→pantalla UNA sola vez y lo reutiliza.
 *
 * ## Por qué no se usa `worldPoint` en cada gesto
 *
 * Porque a 100.000 entidades no se puede pagar. `worldPoint` vuelve a derivar
 * la transformación en CADA llamada: nueve muestras del HUD para la afín más
 * hasta seis correcciones en lazo cerrado, y cada muestra son dos movimientos
 * de ratón que el editor atiende con un manejador que hace pruebas de impacto
 * sobre el documento entero. Medido en este mismo corpus: la primera corrida de
 * este spec se quedó SIN TERMINAR el primer gesto en más de media hora, y el
 * rastro de Playwright señalaba exactamente ahí. A escala pequeña `worldPoint`
 * es lo correcto y sigue siéndolo; a escala densa es el propio instrumento el
 * que impide medir.
 *
 * ## Por qué es legítimo cachear
 *
 * Porque la cámara NO se mueve durante el guion: el arrastre de marquesina
 * desactiva los controles de órbita, la designación con pickbox no encuadra, y
 * mover o borrar cambia las ENTIDADES, no la vista. La transformación derivada
 * al principio sigue siendo válida al final, y el error del lazo cerrado se
 * publica para que se pueda comprobar en vez de creer.
 */
export async function createWorldMapper(page: Page): Promise<WorldMapper> {
  const started = Date.now();
  const box = await page.getByTestId("cad-canvas").boundingBox();
  if (!box) throw new Error("el lienzo CAD no tiene caja");
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const span = Math.round(Math.min(box.width, box.height) * 0.3);
  const origin = await sampleWorld(page, centerX, centerY);
  const horizontal = await sampleWorld(page, centerX + span, centerY);
  const vertical = await sampleWorld(page, centerX, centerY + span);
  const a = (horizontal.x - origin.x) / span;
  const b = (vertical.x - origin.x) / span;
  const c = (horizontal.y - origin.y) / span;
  const d = (vertical.y - origin.y) / span;
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12)
    throw new Error("la transformación mundo↔pantalla es singular: la vista no está en planta");
  const toScreen = (world: { x: number; y: number }) => {
    const wx = world.x - origin.x;
    const wy = world.y - origin.y;
    return {
      x: Math.round(centerX + (d * wx - b * wy) / determinant),
      y: Math.round(centerY + (-c * wx + a * wy) / determinant),
    };
  };
  // Lazo cerrado sobre un punto que NO se usó para construir la afín: si el
  // mapa se hubiera ajustado a sus propias muestras, esto no lo delataría.
  const probeWorld = { x: origin.x + a * span * 0.7, y: origin.y + d * span * 0.7 };
  const probeScreen = toScreen(probeWorld);
  const measured = await sampleWorld(page, probeScreen.x, probeScreen.y);
  const errorUnits = Math.max(
    Math.abs(measured.x - probeWorld.x),
    Math.abs(measured.y - probeWorld.y),
  );
  return {
    toScreen,
    errorUnits: Number(errorUnits.toFixed(3)),
    unitsPerPixel: Number(Math.max(Math.abs(a), Math.abs(d)).toFixed(3)),
    samples: 4,
    buildMs: Date.now() - started,
  };
}

// ---------------------------------------------------------------------------
// Gestos sobre el lienzo
// ---------------------------------------------------------------------------

export async function dragWorld(
  page: Page,
  mapper: WorldMapper,
  corners: { x: number; y: number }[],
): Promise<void> {
  const screen = corners.map((corner) => mapper.toScreen(corner));
  await page.mouse.move(screen[0].x, screen[0].y);
  await page.mouse.down();
  for (const point of screen.slice(1)) await page.mouse.move(point.x, point.y, { steps: 6 });
  await page.mouse.up();
}

/** Reencuadra en planta cenital, que es donde la afín se puede invertir. */
export async function frameTopDown(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await enter3DView(page);
  await page.getByTitle(/Vista superior/).click();
  await page.getByTitle(/Ajustar a la planta/).click();
}

/**
 * Pone el modo de selección. NO reencuadra.
 *
 * Los goldens reencuadran en cada cambio de modo porque cada uno abre su propia
 * escena. Aquí la vista se fija una vez al principio y no se vuelve a tocar:
 * cada «Ajustar a la planta» sobre 100.000 entidades es una replanificación
 * completa del pipeline, y meter una entre gesto y gesto mediría el encuadre en
 * vez de la selección — además de invalidar el mapa mundo→pantalla cacheado.
 *
 * La paleta se cierra siempre después, y por una razón medida: mientras está
 * abierta, el editor reconstruye el universo de selección —una pasada sobre las
 * 100.000 entidades— en CADA render, y el editor renderiza al mover el ratón.
 */
export async function setSelectionMode(
  page: Page,
  mode: "pick" | "window" | "crossing" | "lasso",
  clear = true,
): Promise<void> {
  const tool = page.getByTitle(/Selecci.n profesional/);
  await tool.click();
  const palette = page.getByTestId("cad-selection-palette");
  await expect(palette).toBeVisible();
  const clearButton = palette.getByRole("button", { name: "Limpiar" });
  if (clear && (await clearButton.isEnabled())) await clearButton.click();
  await page.getByTestId(`cad-selection-mode-${mode}`).click();
  await tool.click();
  await expect(palette).toBeHidden();
}
