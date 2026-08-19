/**
 * APPLOAD DE VERDAD: un fichero `.lsp` elegido en la interfaz, ejecutándose.
 *
 * Esta spec es la que sostiene la afirmación comercial entera. «Tenemos
 * AutoLISP» no vale nada si el veterano que trae veinte años de rutinas no
 * puede SUBIR la suya; así que el camino que se recorre aquí es el del usuario,
 * entero y sin atajos:
 *
 *   el navegador entrega un File → `loadPickedLispFiles` (lo que llama el
 *   componente al soltar el diálogo) → la biblioteca de la ORGANIZACIÓN →
 *   el registro compuesto del motor de comandos → se teclea el nombre →
 *   la geometría acaba en el documento canónico, en UN paso de deshacer.
 *
 * En ningún punto se llama al intérprete a mano. Y los ficheros que se «suben»
 * son los `.lsp` DE VERDAD del árbol, leídos del disco: si alguien rompe uno
 * editándolo, esta spec se entera.
 *
 * Se comprueban además las tres cosas que un despacho pregunta antes de mudarse:
 * que sus rutinas no las ve otra organización, que un fichero roto no se lleva
 * por delante a los demás, y que el primer día ya hay algo cargado que sirve.
 */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CadDocument } from "@/lib/cad/cad-document";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandAction,
  type CadCommandEffect,
  type CadCommandEngineState,
} from "@/lib/cad/engine/command-engine";
import type { CadCommandContext } from "@/lib/cad/engine/command-types";
import { executeCadEntityCommandBatch } from "@/lib/cad/entity-commands";
import { InMemoryLispLibraryStore } from "@/lib/lisp/library";
import { loadPickedLispFiles, type PickedLispFile } from "./appload";
import { createCadLispAttachment } from "./use-lisp";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}
function eq<T>(actual: T, expected: T, message: string): void {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

// `fileURLToPath` y no `.pathname`: en Windows el pathname de un file URL es
// `/D:/…`, y unirlo con `path.join` fabrica rutas imposibles (`D:\D:\…`).
const here = path.dirname(fileURLToPath(import.meta.url));
const factoryDir = path.resolve(here, "../../../lib/lisp/factory");

/**
 * Un `File` como el que entrega el navegador: un nombre y un `text()`. Es
 * literalmente lo que el componente recibe del `<input type="file">`.
 */
function pickedFromDisk(name: string): PickedLispFile {
  const source = fs.readFileSync(path.join(factoryDir, name), "utf8");
  return { name, text: async () => source };
}

function picked(name: string, source: string): PickedLispFile {
  return { name, text: async () => source };
}

function seed(): CadDocument {
  const layers = ["0", "TEXTOS", "EJES", "MUROS"].map((id) => ({
    id,
    name: id,
    color: "#ffffff",
    visible: true,
    locked: false,
  }));
  return {
    meta: { version: 1, schema: 7, unit: "mm" },
    layers,
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

/** El editor mínimo que hace que el enchufe sea el de verdad. */
class FakeStudio {
  document = seed();
  readonly undoSteps: string[] = [];
  private serial = 0;
  readonly lisp;
  private state: CadCommandEngineState = EMPTY_CAD_COMMAND_ENGINE;

  constructor(tenantId: string, store = new InMemoryLispLibraryStore()) {
    this.lisp = createCadLispAttachment({
      identity: () => ({ tenantId, userId: "sergio" }),
      store,
    });
    this.lisp.runtime.bind({
      document: () => this.document,
      activeLayer: () => "0",
      newEntityId: () => `e${(this.serial += 1)}`,
    });
  }

  context(): CadCommandContext {
    const byId = new Map(this.document.entities.map((entity) => [entity.id, entity]));
    return {
      entityIds: this.document.entities.map((entity) => entity.id),
      entity: (entityId) => byId.get(entityId),
      blocks: () => this.document.blocks,
      selection: [],
      activeLayer: "0",
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `e${(this.serial += 1)}`,
    };
  }

  type(value: string): readonly CadCommandEffect[] {
    this.lisp.registry.remember(value);
    return this.dispatch({ kind: "token", value });
  }

  point(x: number, y: number): readonly CadCommandEffect[] {
    return this.dispatch({
      kind: "input",
      input: { kind: "point", point: { x, y }, source: "typed" },
    });
  }

  select(entityIds: readonly string[]): readonly CadCommandEffect[] {
    return this.dispatch({ kind: "input", input: { kind: "selection", entityIds } });
  }

  private dispatch(action: CadCommandAction): readonly CadCommandEffect[] {
    const reduction = cadCommandEngineReduce(this.state, action, this.context(), this.lisp.registry);
    this.state = reduction.state;
    for (const effect of reduction.effects) {
      if (effect.kind !== "execute") continue;
      this.document = executeCadEntityCommandBatch(
        this.document,
        effect.commands,
        effect.label,
      ).document;
      this.undoSteps.push(effect.label);
    }
    return reduction.effects;
  }
}

function executes(effects: readonly CadCommandEffect[]): number {
  return effects.filter((effect) => effect.kind === "execute").length;
}
function messages(effects: readonly CadCommandEffect[]): string[] {
  return effects.filter((effect) => effect.kind === "message").map((effect) => effect.text);
}

/** La rutina que trae el despacho. Corta, y hace trabajo de verdad. */
const DEL_ESTUDIO = `
;; Sello de revisión del estudio: recuadro y fecha, en su capa de siempre.
(defun c:SELLO ( / x y)
  (setq x 100.0)
  (setq y 50.0)
  (entmake (list (cons 0 "LWPOLYLINE") (cons 90 4) (cons 70 1) (cons 8 "TEXTOS")
                 (list 10 x y) (list 10 (+ x 600.0) y)
                 (list 10 (+ x 600.0) (+ y 200.0)) (list 10 x (+ y 200.0))))
  (entmake (list (cons 0 "MTEXT") (cons 8 "TEXTOS") (list 10 (+ x 20.0) (+ y 60.0) 0.0)
                 (cons 1 "REVISION A") (cons 40 80.0)))
  (princ "sello colocado"))
`;

/**
 * Todo el cuerpo va dentro de un `async`: leer un fichero es asíncrono —lo es en
 * el navegador y lo es aquí— y el `await` de nivel superior no sobrevive a la
 * compilación a CommonJS del runner de specs. El `catch` final existe para que
 * un fallo salga con código distinto de cero: una promesa rechazada en silencio
 * dejaría el spec en VERDE sin haber comprobado nada.
 */
async function main(): Promise<void> {
  // --- 1. el fichero del despacho, subido y ejecutado ---------------------------
  {
    const studio = new FakeStudio("estudio-valle");
    const outcome = await loadPickedLispFiles(studio.lisp.runtime, [picked("sello.lsp", DEL_ESTUDIO)]);

    eq(outcome.failed, [], "el .lsp del estudio se acepta sin problemas");
    eq(outcome.loaded.length, 1, "y queda UNO cargado");
    eq(outcome.loaded[0].commands, ["SELLO"], "declarando el comando que aporta");
    ok(
      studio.lisp.runtime.getSnapshot().files.some((file) => file.name === "sello.lsp"),
      "la consola lo enseña en la biblioteca de la organización",
    );
    ok(studio.lisp.registry.names().has("SELLO"), "y el registro del motor lo conoce");

    // Y ahora lo que decide todo: se TECLEA, como LINE.
    const effects = studio.type("SELLO");
    eq(executes(effects), 1, "teclearlo produce UN efecto de escritura");
    eq(studio.undoSteps, ["LISP SELLO"], "UN paso de deshacer, etiquetado con el comando");
    eq(studio.document.entities.length, 2, "el recuadro y su texto están en el documento");
    const polyline = studio.document.entities.find((entity) => entity.type === "polyline");
    ok(polyline?.type === "polyline" && polyline.closed, "la polilínea salió cerrada…");
    if (polyline?.type === "polyline") {
      eq(polyline.vertices.length, 4, "…con sus cuatro vértices…");
      eq(polyline.vertices[0].x, 100, "…en las coordenadas que pidió la rutina…");
      eq(polyline.vertices[2].y, 250, "…las cuatro");
      eq(polyline.layer, "TEXTOS", "y en la capa que pidió, no en la activa");
    }
  }

  // --- 2. las rutinas de FÁBRICA están el primer día, sin subir nada -------------
  {
    const studio = new FakeStudio("despacho-nuevo");
    const factory = studio.lisp.runtime.getSnapshot().factory;
    eq(factory.length, 4, "vienen cuatro rutinas de fábrica");
    eq(
      factory.map((file) => file.name),
      ["cuadro-areas.lsp", "cuenta-bloques.lsp", "numera-ejes.lsp", "tabla-carpinteria.lsp"],
      "en orden alfabético, que es el de carga",
    );
    eq(
      studio.lisp.runtime.commandNames(),
      ["CUADROAREAS", "CUENTABLOQUES", "NUMEJES", "TABLACARP"],
      "y sus cuatro comandos se pueden teclear sin haber cargado nada",
    );
    ok(
      studio.lisp.runtime.getSnapshot().files.length === 0,
      "sin ocupar la biblioteca de la organización: no son suyas",
    );
    eq(
      studio.lisp.runtime.unload("cuadro-areas.lsp"),
      false,
      "y no se pueden descargar…",
    );
    ok(
      studio.lisp.runtime
        .getSnapshot()
        .transcript.some((entry) => /rutina de fábrica y no se descarga/.test(entry.text)),
      "…diciendo por qué, en vez de fingir que se descargó",
    );
  }

  // --- 3. una rutina de fábrica REAL, leída del disco y ejecutada ---------------
  {
    const studio = new FakeStudio("estudio-valle");
    // Dos ejes verticales y uno horizontal, para numerar.
    studio.document = {
      ...seed(),
      entities: [
        { id: "ejeA", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 5_000, z: 0 }, layer: "EJES" },
        { id: "ejeB", type: "line", start: { x: 4_000, y: 0, z: 0 }, end: { x: 4_000, y: 5_000, z: 0 }, layer: "EJES" },
        { id: "eje1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 4_000, y: 0, z: 0 }, layer: "EJES" },
      ],
      modelSpace: { entityIds: ["ejeA", "ejeB", "eje1"] },
    };

    // Se «sube» el MISMO fichero del árbol: si alguien lo rompe, esto falla.
    const outcome = await loadPickedLispFiles(studio.lisp.runtime, [pickedFromDisk("numera-ejes.lsp")]);
    eq(outcome.failed, [], "el .lsp de fábrica, leído del disco, se carga sin problemas");

    studio.type("NUMEJES");
    const effects = studio.select(["ejeA", "ejeB", "eje1"]);
    eq(executes(effects), 1, "la rutina designa, numera y escribe en UN lote");

    const circles = studio.document.entities.filter((entity) => entity.type === "circle");
    eq(circles.length, 3, "tres burbujas: dos de eje vertical y una de horizontal");
    const labels = studio.document.entities
      .filter((entity) => entity.type === "mtext")
      .map((entity) => (entity.type === "mtext" ? entity.text : ""))
      .sort();
    eq(labels, ["1", "A", "B"], "los verticales con letra y el horizontal con número");
    const bubbleA = circles.find((entity) => entity.type === "circle" && entity.center.x === 0);
    ok(bubbleA, "la burbuja A está sobre el eje de x=0…");
    if (bubbleA?.type === "circle") {
      eq(bubbleA.center.y, 5_600, "…por encima de su extremo superior, a la separación fijada");
      eq(bubbleA.layer, "EJES", "y en la capa de ejes");
    }
  }

  // --- 4. el cuadro de áreas de fábrica sale del MODELO -------------------------
  {
    const studio = new FakeStudio("estudio-valle");
    const wall = (id: string, a: [number, number], b: [number, number]) => ({
      id,
      type: "wall" as const,
      start: { x: a[0], y: a[1], z: 0 },
      end: { x: b[0], y: b[1], z: 0 },
      thickness: 250,
      height: 2_400,
      layer: "MUROS",
    });
    const walls = [
      wall("s", [0, 0], [5_000, 0]),
      wall("e", [5_000, 0], [5_000, 4_000]),
      wall("n", [5_000, 4_000], [0, 4_000]),
      wall("o", [0, 4_000], [0, 0]),
    ];
    studio.document = {
      ...seed(),
      entities: walls,
      modelSpace: { entityIds: walls.map((entity) => entity.id) },
    };

    await loadPickedLispFiles(studio.lisp.runtime, [pickedFromDisk("cuadro-areas.lsp")]);
    studio.type("CUADROAREAS");
    const effects = studio.point(10_000, 4_000);
    eq(executes(effects), 1, "el cuadro se dibuja en UN lote");

    const textos = studio.document.entities
      .filter((entity) => entity.type === "mtext")
      .map((entity) => (entity.type === "mtext" ? entity.text : ""));
    ok(textos.includes("LOCAL"), "el cuadro trae su encabezado…");
    ok(textos.includes("L-01"), "…el local que los cuatro muros cierran…");
    // 5.000 × 4.000 mm = 20 m² a ejes; 4.750 × 3.750 = 17,81 m² útiles. Los dos
    // números salen del modelo: nadie los tecleó en ninguna parte.
    ok(textos.includes("20.00"), "…su área a ejes en m², calculada del modelo…");
    ok(textos.includes("17.81"), "…y su área útil, que NO es la misma");
  }

  // --- 5. dos organizaciones no se ven -----------------------------------------
  {
    // El MISMO almacén para las dos, que es el caso peligroso: si el aislamiento
    // dependiera de tener almacenes distintos, no sería aislamiento.
    const store = new InMemoryLispLibraryStore();
    const uno = new FakeStudio("estudio-norte", store);
    const otro = new FakeStudio("estudio-sur", store);

    await loadPickedLispFiles(uno.lisp.runtime, [picked("sello.lsp", DEL_ESTUDIO)]);
    ok(uno.lisp.registry.names().has("SELLO"), "quien la subió la tiene");
    ok(!otro.lisp.registry.names().has("SELLO"), "y la otra organización NO la ve");
    eq(otro.lisp.runtime.getSnapshot().files.length, 0, "su biblioteca sigue vacía");
    ok(
      messages(otro.type("SELLO")).every((text) => /Comando desconocido/.test(text)),
      "y teclear su comando no ejecuta nada: es un comando que allí no existe",
    );
    // Las de fábrica, en cambio, las tienen las dos: son del producto.
    ok(otro.lisp.registry.names().has("CUADROAREAS"), "las de fábrica sí están en las dos");
  }

  // --- 6. un fichero roto no se lleva por delante a los demás -------------------
  {
    const studio = new FakeStudio("estudio-valle");
    const outcome = await loadPickedLispFiles(studio.lisp.runtime, [
      picked("bueno.lsp", DEL_ESTUDIO),
      picked("roto.lsp", "(defun c:ROTA () (entmake (list (cons 0 \"LINE\")"),
      picked("otro.lsp", "(defun c:OTRA () (princ \"ok\"))"),
    ]);
    eq(
      outcome.loaded.map((file) => file.name),
      ["bueno.lsp", "otro.lsp"],
      "los dos buenos entran…",
    );
    eq(outcome.failed.length, 1, "…y sólo falla el roto…");
    eq(outcome.failed[0].name, "roto.lsp", "…nombrado, para no tener que adivinar cuál era");
    ok(studio.lisp.registry.names().has("SELLO"), "el primero sigue tecleable");
    ok(studio.lisp.registry.names().has("OTRA"), "y el tercero también: no se abortó el lote");
    ok(!studio.lisp.registry.names().has("ROTA"), "el roto no dejó medio comando registrado");
  }

  // --- 7. un fichero que no se puede leer del disco se dice distinto ------------
  {
    const studio = new FakeStudio("estudio-valle");
    const outcome = await loadPickedLispFiles(studio.lisp.runtime, [
      {
        name: "arrancado.lsp",
        text: async () => {
          throw new Error("NotReadableError");
        },
      },
    ]);
    eq(outcome.loaded, [], "no se carga nada");
    ok(
      /no se pudo leer del disco/.test(outcome.failed[0].problem),
      "y el motivo distingue «no se pudo leer» de «el contenido está mal»",
    );
  }

  console.log(
    `appload: ${checks} aserciones verdes. Un .lsp elegido en la interfaz llega a la biblioteca de ` +
      `su organización, entra en el registro del motor y se teclea como un nativo, dejando su ` +
      `geometría en el documento en UN paso de deshacer; las cuatro rutinas de fábrica están el ` +
      `primer día y no se descargan; el cuadro de áreas de fábrica saca sus 20,00 y 17,81 m² del ` +
      `modelo; dos organizaciones que comparten almacén no se ven; y un fichero roto ni detiene el ` +
      `lote ni deja medio comando registrado.`,
  );

}

main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
