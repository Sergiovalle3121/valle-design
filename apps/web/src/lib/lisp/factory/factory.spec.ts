/**
 * Las rutinas de FÁBRICA: que sean las del disco, y que hagan su trabajo.
 *
 * Dos afirmaciones, y las dos son necesarias:
 *
 *  1. **`factory-library.ts` es una copia FIEL de los `.lsp`.** El módulo está
 *     generado porque el navegador no lee ficheros del disco, y una copia
 *     generada es una copia que puede envejecer. Aquí se vuelven a leer los
 *     `.lsp` y se comparan byte a byte; el día que alguien edite el `.lsp` y no
 *     regenere, esta spec lo dice con el nombre del fichero.
 *  2. **Las cuatro corren y dibujan lo que dicen.** Una rutina de fábrica que
 *     falla es peor que no traer ninguna: es lo primero que prueba quien evalúa
 *     el producto.
 *
 * `cuadro-areas` y `numera-ejes` se ejercitan además por el camino completo
 * —fichero elegido en la interfaz, biblioteca, motor de comandos— en
 * `components/cad/lisp/appload.spec.ts`. Aquí se completan las otras dos y se
 * fija la geometría concreta.
 */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CadDocument, CadEntity } from "../../cad/cad-document";
import { CAD_LISP_BUILTINS } from "../cad-builtins";
import { CadDocumentLispHost } from "../document-host";
import { validateLispSource } from "../library";
import { printLisp } from "../printer";
import { LispSession, ScriptedResponder } from "../session";
import { ename, list, real, type LispResponse } from "../values";
import { CAD_LISP_FACTORY_ROUTINES } from "./factory-library";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}
function eq<T>(actual: T, expected: T, message: string): void {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

const here = path.dirname(fileURLToPath(import.meta.url));

// --- 1. el módulo generado ES el disco ---------------------------------------
{
  const onDisk = fs
    .readdirSync(here)
    .filter((name) => name.endsWith(".lsp"))
    .sort();
  eq(
    CAD_LISP_FACTORY_ROUTINES.map((routine) => routine.name),
    onDisk,
    "el módulo empaqueta EXACTAMENTE los .lsp de la carpeta, en orden alfabético",
  );
  for (const routine of CAD_LISP_FACTORY_ROUTINES) {
    // Normalizado a LF: en Windows el checkout puede traer CRLF y eso no es una
    // divergencia de contenido.
    const source = fs.readFileSync(path.join(here, routine.name), "utf8").replaceAll("\r\n", "\n");
    ok(
      routine.source === source,
      `${routine.name} difiere del fichero del disco: regenera con ` +
        `\`node scripts/generate-lisp-factory.mjs\``,
    );
  }
}

// --- 2. las cuatro son sintácticamente válidas y declaran su comando ----------
{
  const expected = new Map([
    ["cuadro-areas.lsp", "CUADROAREAS"],
    ["cuenta-bloques.lsp", "CUENTABLOQUES"],
    ["numera-ejes.lsp", "NUMEJES"],
    ["tabla-carpinteria.lsp", "TABLACARP"],
  ]);
  for (const routine of CAD_LISP_FACTORY_ROUTINES) {
    const validation = validateLispSource(routine.source);
    ok(validation.ok, `${routine.name} no se lee: ${validation.problem ?? ""}`);
    eq(
      validation.commands,
      [expected.get(routine.name)!],
      `${routine.name} declara exactamente el comando que anuncia`,
    );
  }
}

// --- utilidades de ejecución --------------------------------------------------

function seed(entities: CadEntity[] = []): CadDocument {
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
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
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

function sourceOf(name: string): string {
  return CAD_LISP_FACTORY_ROUTINES.find((routine) => routine.name === name)!.source;
}

function run(
  file: string,
  invocation: string,
  entities: CadEntity[] = [],
  answers: LispResponse[] = [],
): { ok: boolean; text: string; document: CadDocument } {
  let serial = 0;
  const host = new CadDocumentLispHost(seed(entities), {
    activeLayer: "0",
    newEntityId: () => `e${String((serial += 1)).padStart(3, "0")}`,
  });
  const session = new LispSession({ builtins: CAD_LISP_BUILTINS, host });
  const responder = new ScriptedResponder(answers);
  const loaded = session.run(sourceOf(file), responder);
  assert.ok(loaded.ok, `${file} debería cargarse: ${loaded.ok ? "" : loaded.failure.message}`);
  checks += 1;
  const result = session.run(invocation, responder);
  return {
    ok: result.ok,
    text: result.ok ? printLisp(result.value) : result.failure.message,
    document: host.document(),
  };
}

const point = (x: number, y: number) => list([real(x), real(y), real(0)]);
const texts = (document: CadDocument): string[] =>
  document.entities.filter((entity) => entity.type === "mtext").map((entity) => entity.text);

// --- 3. TABLACARP: la tabla de puertas y ventanas del modelo ------------------
{
  const wall = (id: string, x2: number): CadEntity => ({
    id,
    type: "wall",
    start: { x: 0, y: id === "m2" ? 3_000 : 0, z: 0 },
    end: { x: x2, y: id === "m2" ? 3_000 : 0, z: 0 },
    thickness: 250,
    height: 2_400,
    layer: "MUROS",
  });
  const hueco = (id: string, hostId: string, kind: "door" | "window", width: number): CadEntity => ({
    id,
    type: "opening",
    kind,
    hostId,
    position: 2_000,
    width,
    height: kind === "door" ? 2_100 : 1_200,
    sill: kind === "door" ? 0 : 900,
    swing: "left",
    hinge: "start",
    layer: "MUROS",
  });

  const outcome = run(
    "tabla-carpinteria.lsp",
    "(c:tablacarp)",
    [
      wall("m1", 6_000),
      wall("m2", 6_000),
      hueco("p1", "m1", "door", 900),
      hueco("v1", "m2", "window", 1_200),
    ],
    [{ kind: "value", value: point(10_000, 0) }],
  );
  ok(outcome.ok, `la tabla debería dibujarse: ${outcome.text}`);
  eq(outcome.text, "2", "y devolver el total de unidades");

  const written = texts(outcome.document);
  ok(written.includes("MARCA"), "trae su encabezado");
  ok(written.includes("P-090x210"), "la marca de la puerta, sacada del modelo");
  ok(written.includes("V-120x120"), "y la de la ventana");
  ok(written.includes("TOTAL"), "con su renglón de total");
  eq(
    written.filter((text) => text === "1").length,
    2,
    "una unidad de cada tipo, contada del modelo y no tecleada",
  );
}

// --- 4. TABLACARP se niega si no hay carpintería, en vez de dibujar una vacía --
{
  const outcome = run("tabla-carpinteria.lsp", "(c:tablacarp)", [], [
    { kind: "value", value: point(0, 0) },
  ]);
  ok(outcome.ok, "la rutina termina bien…");
  eq(outcome.text, "nil", "…devolviendo nil…");
  eq(outcome.document.entities.length, 0, "…y sin dejar una tabla vacía en el plano");
}

// --- 5. CUENTABLOQUES: el recuento clásico, con ssget y assoc -----------------
{
  const insert = (id: string, block: string, x: number): CadEntity => ({
    id,
    type: "insert",
    block,
    insertion: { x, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    layer: "0",
  });
  const entities = [
    insert("i1", "WC", 0),
    insert("i2", "WC", 1_000),
    insert("i3", "LAVABO", 2_000),
    { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" } as CadEntity,
  ];
  const outcome = run("cuenta-bloques.lsp", "(c:cuentabloques)", entities, [
    // `ssget` se contesta con la LISTA de nombres de entidad designados —los
    // cuatro, la línea incluida: la rutina tiene que saber descartarla— y
    // después `getpoint` recibe la esquina del recuento.
    { kind: "value", value: list(entities.map((entity) => ename(entity.id))) },
    { kind: "value", value: point(0, 5_000) },
  ]);
  ok(outcome.ok, `el recuento debería dibujarse: ${outcome.text}`);
  eq(outcome.text, "3", "tres inserciones contadas; la línea designada no se cuenta");

  const written = texts(outcome.document);
  ok(written.includes("BLOQUE"), "el recuento trae su encabezado…");
  ok(written.includes("LAVABO"), "…y sale ORDENADO por nombre de bloque…");
  ok(written.indexOf("LAVABO") < written.indexOf("WC"), "…LAVABO antes que WC, no por orden de clic");
  eq(
    written.filter((text) => text === "2").length,
    1,
    "los dos WC salen como una fila con dos unidades",
  );
  ok(written.includes("TOTAL"), "con su total al pie");
}

console.log(
  `factory: ${checks} aserciones verdes. Las cuatro rutinas de fábrica son copia fiel de sus ` +
    `ficheros .lsp del disco, se leen sin errores, declaran exactamente el comando que anuncian, ` +
    `la tabla de carpintería saca del modelo sus marcas P-090x210 y V-120x120 —negándose a ` +
    `dibujar una tabla vacía cuando no hay carpintería—, y el recuento de bloques agrupa los dos ` +
    `WC en una fila, ordena por nombre y descarta la línea que también se designó.`,
);
