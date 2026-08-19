/**
 * UNITS, LTSCALE, LWEIGHT, COLOR, SETVAR, GETVAR, -LAYER, LAYERSTATE, -OSNAP,
 * -UCSMAN, -LINETYPE y las puertas a las paletas.
 *
 * ## Las dos afirmaciones estructurales
 *
 * **`LAYER` y `-LAYER` son comandos DISTINTOS.** El primero abre el gestor y el
 * segundo trabaja por la línea. Si el registro colapsara el guion —que es lo
 * que hacía antes de esta ola—, un `.scr` con `-LAYER` abriría un cuadro y se
 * quedaría esperando un clic que nadie va a dar. Se comprueba con el registro
 * en la mano.
 *
 * **Una paleta que no está montada NO se traga la orden.** El comando devuelve
 * una petición de interfaz con el texto de lo que el usuario se pierde y con la
 * variante que sí funciona. Se comprueba que ese texto existe y nombra la
 * alternativa.
 */
import { strict as assert } from "node:assert";
import type { CadLayerDef } from "../../cad-document";
import { CadLayerStateCatalog } from "../../layer-states";
import { CadLinetypeCatalog } from "../../linetype-lin";
import { CadSystemVariableStore } from "../../system-variables";
import { CadToolPaletteCatalog } from "../../tool-palettes";
import { CadUcsCatalog } from "../../ucs";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandStep,
} from "../command-types";

let checks = 0;
function ok(condition: boolean, what: string) {
  checks += 1;
  assert.ok(condition, what);
}
function equal(actual: unknown, expected: unknown, what: string) {
  checks += 1;
  assert.equal(actual, expected, `${what}: se esperaba ${String(expected)}, salió ${String(actual)}`);
}

const LAYERS: CadLayerDef[] = [
  { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
  { id: "muros", name: "MUROS", color: "#ff0000", visible: true, locked: false },
];

interface Session {
  variables: CadSystemVariableStore;
  layerStates: CadLayerStateCatalog;
  linetypes: CadLinetypeCatalog;
  coordinateSystems: CadUcsCatalog;
  toolPalettes: CadToolPaletteCatalog;
}

function session(): Session {
  return {
    variables: new CadSystemVariableStore(),
    layerStates: new CadLayerStateCatalog(),
    linetypes: new CadLinetypeCatalog(),
    coordinateSystems: new CadUcsCatalog(),
    toolPalettes: new CadToolPaletteCatalog(),
  };
}

function context(store: Session, overrides: Partial<CadCommandContext> = {}): CadCommandContext {
  return {
    entityIds: [],
    entity: () => undefined,
    layers: () => LAYERS,
    selection: [],
    activeLayer: "0",
    variables: store.variables,
    catalogs: {
      layerStates: store.layerStates,
      linetypes: store.linetypes,
      coordinateSystems: store.coordinateSystems,
      toolPalettes: store.toolPalettes,
    },
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "nuevo",
    ...overrides,
  };
}

function run(
  name: string,
  inputs: readonly CadCommandInput[],
  ctx: CadCommandContext,
): CadCommandStep<unknown> {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `el registro conoce ${name}`);
  let step = descriptor.begin(ctx) as CadCommandStep<unknown>;
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state as never, input, ctx) as CadCommandStep<unknown>;
  }
  return step;
}

const text = (value: string): CadCommandInput => ({ kind: "text", value });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });

// ---------------------------------------------------------------------------
// Con guion y sin guion son comandos DISTINTOS
// ---------------------------------------------------------------------------

for (const [dialog, cli] of [
  ["LAYER", "-LAYER"],
  ["OSNAP", "-OSNAP"],
  ["LINETYPE", "-LINETYPE"],
  ["UCSMAN", "-UCSMAN"],
  ["TOOLPALETTES", "-TOOLPALETTES"],
]) {
  equal(CAD_COMMAND_REGISTRY_V2.get(dialog)?.name, dialog, `${dialog} resuelve a sí mismo`);
  equal(
    CAD_COMMAND_REGISTRY_V2.get(cli)?.name,
    cli,
    `${cli} NO colapsa en ${dialog}: un .scr se colgaría esperando un clic`,
  );
}
// El prefijo internacional `_` sigue siendo decorativo, como siempre.
equal(CAD_COMMAND_REGISTRY_V2.get("_LINE")?.name, "LINE", "`_LINE` sigue siendo LINE");

// ---------------------------------------------------------------------------
// Las puertas a las paletas
// ---------------------------------------------------------------------------

for (const [name, target, alternative] of [
  ["LAYER", "layer-manager", "-LAYER"],
  ["PROPERTIES", "properties", "LIST"],
  ["DSETTINGS", "draft-settings", "-OSNAP"],
  ["OSNAP", "osnap", "-OSNAP"],
  ["OPTIONS", "options", "SETVAR"],
  ["TOOLPALETTES", "tool-palettes", "-TOOLPALETTES"],
  ["UCSMAN", "ucs-manager", "-UCSMAN"],
]) {
  const step = run(name, [], context(session()));
  ok(step.result?.kind === "ui", `${name} pide abrir algo, no dibuja`);
  if (step.result?.kind === "ui") {
    equal(step.result.request.target, target, `${name} pide "${target}"`);
    ok(
      step.result.request.unavailable.includes(alternative),
      `y si no está montada, ${name} nombra la alternativa ${alternative}: ` +
        step.result.request.unavailable,
    );
  }
}

// ---------------------------------------------------------------------------
// UNITS
// ---------------------------------------------------------------------------

{
  const store = session();
  const step = run(
    "UNITS",
    [keyword("Arquitectónico"), distance(4), keyword("gradosMinutos"), distance(0), distance(0)],
    context(store),
  );
  ok(step.result?.kind === "variables", "UNITS escribe variables");
  if (step.result?.kind === "variables") {
    equal(step.result.patch.LUNITS, 4, "LUNITS 4 es arquitectónico");
    equal(step.result.patch.LUPREC, 4, "y la precisión pedida");
    equal(step.result.patch.AUNITS, 1, "AUNITS 1 son grados/minutos/segundos");
    // El ejemplo enseña a qué se parece: es lo que hace la configuración legible.
    ok(step.result.text!.includes(`3'-6 1/2"`), `el ejemplo sale escrito: ${step.result.text}`);
  }
}
{
  // La precisión se recorta al rango en vez de rechazarse: 99 significa «todos».
  const step = run(
    "UNITS",
    [keyword("Decimal"), distance(99), keyword("Grados"), distance(0), distance(0)],
    context(session()),
  );
  if (step.result?.kind === "variables") equal(step.result.patch.LUPREC, 8, "99 se recorta a 8");
}

// ---------------------------------------------------------------------------
// LTSCALE, LWEIGHT, COLOR
// ---------------------------------------------------------------------------

{
  const step = run("LTSCALE", [distance(2.5)], context(session()));
  ok(step.result?.kind === "variables" && step.result.patch.LTSCALE === 2.5, "LTSCALE escribe su variable");
}
{
  const step = run("LTSCALE", [distance(-1)], context(session()));
  ok(step.result?.kind === "message", "una escala negativa no escribe");
  ok(
    step.result?.kind === "message" && step.result.text.includes("LTSCALE"),
    `y el rechazo nombra la variable: ${step.result?.kind === "message" ? step.result.text : ""}`,
  );
}
{
  // El grosor se guarda en CENTÉSIMAS de milímetro, como DXF 370.
  const step = run("LWEIGHT", [distance(0.3)], context(session()));
  ok(step.result?.kind === "variables" && step.result.patch.CELWEIGHT === 30, "0,30 mm son 30");
  ok(step.result?.kind === "variables" && step.result.text!.includes("0.30 mm"), "y se escribe en mm");
}
{
  const step = run("LWEIGHT", [keyword("porCapa")], context(session()));
  ok(step.result?.kind === "variables" && step.result.patch.CELWEIGHT === -1, "PorCapa es −1");
}
{
  const step = run("LWEIGHT", [distance(5)], context(session()));
  ok(
    step.result?.kind === "message" && step.result.text.includes("2,11 mm"),
    "5 mm pasa del máximo de DXF y se dice cuál es",
  );
}
for (const [typed, expected] of [
  ["bylayer", "BYLAYER"],
  ["PorCapa", "BYLAYER"],
  ["1", "1"],
  ["#FF8800", "#ff8800"],
]) {
  const step = run("COLOR", [text(typed)], context(session()));
  ok(
    step.result?.kind === "variables" && step.result.patch.CECOLOR === expected,
    `COLOR "${typed}" → ${expected}`,
  );
}
for (const bad of ["verde", "0", "256", "#GG0000"]) {
  const step = run("COLOR", [text(bad)], context(session()));
  ok(
    step.result?.kind === "message" && step.result.text.includes("no es un color"),
    `COLOR rechaza "${bad}" diciendo por qué`,
  );
}

// ---------------------------------------------------------------------------
// SETVAR y GETVAR
// ---------------------------------------------------------------------------

{
  const store = session();
  const step = run("SETVAR", [text("LTSCALE"), text("3")], context(store));
  ok(step.result?.kind === "variables" && step.result.patch.LTSCALE === 3, "SETVAR escribe");

  const unknown = run("SETVAR", [text("NOEXISTE")], context(store));
  ok(
    unknown.result?.kind === "message" && unknown.result.text.includes("No existe"),
    "una variable inventada se rechaza",
  );

  const readOnly = run("SETVAR", [text("AREA")], context(store));
  ok(
    readOnly.result?.kind === "message" && readOnly.result.text.includes("sólo lectura"),
    "y una de sólo lectura se lee pero no se pide valor",
  );

  const bad = run("SETVAR", [text("LUNITS"), text("9")], context(store));
  ok(
    bad.result?.kind === "message" && bad.result.text.includes("1, 2, 3, 4, 5"),
    "un valor fuera del enumerado enumera los válidos",
  );

  const listed = run("SETVAR", [text("?")], context(store));
  ok(
    listed.result?.kind === "message" && listed.result.text.includes("LTSCALE"),
    "`?` lista la tabla entera",
  );

  const got = run("GETVAR", [text("ltscale")], context(store));
  ok(
    got.result?.kind === "message" && got.result.text.startsWith("LTSCALE = 1"),
    `GETVAR lee (el almacén de esta spec no comparte estado con la escritura): ${
      got.result?.kind === "message" ? got.result.text : ""
    }`,
  );
}

// ---------------------------------------------------------------------------
// -LAYER
// ---------------------------------------------------------------------------

{
  const store = session();
  const created = run("-LAYER", [keyword("Nueva"), text("PILARES")], context(store));
  ok(created.result?.kind === "document", "crear una capa toca el documento");
  if (created.result?.kind === "document") {
    equal(created.result.commands.length, 1, "una sola orden");
    const command = created.result.commands[0];
    ok(
      command.type === "layer" && command.op === "upsert" && command.layer.name === "PILARES",
      "y es un alta de capa",
    );
  }

  const duplicate = run("-LAYER", [keyword("Nueva"), text("muros")], context(store));
  ok(
    duplicate.result?.kind === "message" && duplicate.result.text.includes("ya existe"),
    "crear una que ya existe se rechaza (y sin distinguir mayúsculas)",
  );

  const missing = run("-LAYER", [keyword("desactivar"), text("FANTASMA")], context(store));
  ok(
    missing.result?.kind === "message" && missing.result.text.includes("No existe la capa"),
    "apagar una que no existe, también",
  );

  const off = run("-LAYER", [keyword("desactivar"), text("MUROS")], context(store));
  if (off.result?.kind === "document") {
    const command = off.result.commands[0];
    ok(
      command.type === "layer" && command.op === "upsert" && command.layer.visible === false,
      "desactivar apaga la capa",
    );
  }

  const set = run("-LAYER", [keyword("definir"), text("MUROS")], context(store));
  ok(
    set.result?.kind === "variables" && set.result.patch.CLAYER === "MUROS",
    "definir la capa actual escribe CLAYER, que es lo que un .scr necesita",
  );

  const coloured = run("-LAYER", [keyword("Color"), text("#00ff00"), text("MUROS")], context(store));
  if (coloured.result?.kind === "document") {
    const command = coloured.result.commands[0];
    ok(
      command.type === "layer" && command.op === "upsert" && command.layer.color === "#00ff00",
      "el color se pide primero y la capa después, como en AutoCAD",
    );
  }

  const listed = run("-LAYER", [keyword("?")], context(store));
  ok(
    listed.result?.kind === "message" && listed.result.text.includes("MUROS"),
    "`?` lista las capas del dibujo",
  );
}

// ---------------------------------------------------------------------------
// LAYERSTATE
// ---------------------------------------------------------------------------

{
  const store = session();
  const saved = run("LAYERSTATE", [keyword("Guardar"), text("Impresión")], context(store));
  ok(
    saved.result?.kind === "message" && saved.result.text.includes("2 capa(s)"),
    "guardar fotografía las capas del dibujo",
  );
  // Y lo DICE: vive en la sesión, no en el documento.
  ok(
    saved.result?.kind === "message" && saved.result.text.includes("SESIÓN"),
    "y avisa de que no sobrevive a una recarga, en vez de dejar que se descubra",
  );
  equal(store.layerStates.list().length, 1, "queda en el catálogo");

  const same = run("LAYERSTATE", [keyword("Restituir"), text("Impresión")], context(store));
  ok(
    same.result?.kind === "message" && same.result.text.includes("ya está puesto"),
    "restituir el estado actual no emite ningún cambio",
  );

  const changed = LAYERS.map((layer) =>
    layer.name === "MUROS" ? { ...layer, visible: false } : layer,
  );
  const restored = run(
    "LAYERSTATE",
    [keyword("Restituir"), text("Impresión")],
    context(store, { layers: () => changed }),
  );
  ok(restored.result?.kind === "document", "con algo cambiado, sí toca el documento");
  if (restored.result?.kind === "document")
    equal(restored.result.commands.length, 1, "y en UN lote, aunque fueran cuarenta capas");

  const absent = run("LAYERSTATE", [keyword("Restituir"), text("NoExiste")], context(store));
  ok(
    absent.result?.kind === "message" && absent.result.text.includes("No hay ningún estado"),
    "restituir uno inexistente se dice",
  );

  const removed = run("LAYERSTATE", [keyword("Suprimir"), text("Impresión")], context(store));
  ok(removed.result?.kind === "message" && removed.result.text.includes("suprimido"), "y se suprime");
}
{
  // Sin catálogo, LAYERSTATE no finge.
  const step = run("LAYERSTATE", [keyword("Guardar")], {
    ...context(session()),
    catalogs: {},
  });
  ok(
    step.result?.kind === "message" && step.result.text.includes("catálogo de estados de capa"),
    "lo dice en vez de callarse",
  );
}

// ---------------------------------------------------------------------------
// -OSNAP
// ---------------------------------------------------------------------------

{
  const step = run("-OSNAP", [text("PUNfin, CENtro")], context(session()));
  ok(
    step.result?.kind === "variables" && step.result.patch.OSMODE === 5,
    "final (1) más centro (4) son 5",
  );
}
{
  const step = run("-OSNAP", [text("NINGUNO")], context(session()));
  ok(step.result?.kind === "variables" && step.result.patch.OSMODE === 0, "NINGUNO los apaga");
}
{
  const step = run("-OSNAP", [distance(35)], context(session()));
  ok(
    step.result?.kind === "variables" && step.result.patch.OSMODE === 35,
    "también se puede dar el número, que es lo que trae un .scr heredado",
  );
}
{
  const step = run("-OSNAP", [text("PUNfin, INVENTADO")], context(session()));
  ok(
    step.result?.kind === "message" && step.result.text.includes("INVENTADO"),
    "un modo inventado se rechaza NOMBRÁNDOLO, no en bloque",
  );
}

// ---------------------------------------------------------------------------
// -UCSMAN
// ---------------------------------------------------------------------------

{
  const store = session();
  store.variables.set("UCSORGX", 100);
  store.variables.set("UCSORGY", 50);
  store.variables.set("UCSANGLE", 23.5);
  const saved = run("-UCSMAN", [keyword("Guardar"), text("PLANTA")], context(store));
  ok(
    saved.result?.kind === "variables" && saved.result.patch.UCSNAME === "PLANTA",
    "guardar un SCU lo nombra",
  );
  equal(store.coordinateSystems.list().length, 1, "y queda en el catálogo");

  const restored = run("-UCSMAN", [keyword("Restituir"), text("planta")], context(store));
  ok(
    restored.result?.kind === "variables" && restored.result.patch.UCSORGX === 100,
    "restituirlo devuelve el origen",
  );
  // El giro ya no viaja como número suelto: viaja DENTRO del marco, y el marco
  // es lo que se restituye. `UCSANGLE` vuelve a cero justamente para que el
  // giro que ya está en los ejes no se aplique dos veces.
  ok(
    restored.result?.kind === "variables" &&
      restored.result.patch.UCSANGLE === 0 &&
      Math.abs(Number(restored.result.patch.UCSXDIRX) - Math.cos((23.5 * Math.PI) / 180)) < 1e-12 &&
      Math.abs(Number(restored.result.patch.UCSXDIRY) - Math.sin((23.5 * Math.PI) / 180)) < 1e-12,
    "y el giro, ahora dentro del eje X del marco",
  );

  const world = run("-UCSMAN", [keyword("Universal")], context(store));
  ok(
    world.result?.kind === "variables" &&
      world.result.patch.UCSANGLE === 0 &&
      world.result.patch.UCSXDIRX === 1 &&
      world.result.patch.UCSYDIRY === 1 &&
      world.result.patch.UCSORGZ === 0,
    "y volver al universal devuelve el marco del mundo entero",
  );
}

// ---------------------------------------------------------------------------
// -LINETYPE y -TOOLPALETTES
// ---------------------------------------------------------------------------

{
  const store = session();
  const listed = run("-LINETYPE", [keyword("?")], context(store));
  ok(
    listed.result?.kind === "message" && listed.result.text.includes("Dashed"),
    "lista los tipos cargados",
  );

  const set = run("-LINETYPE", [keyword("definir"), text("Dashed")], context(store));
  ok(
    set.result?.kind === "variables" && set.result.patch.CELTYPE === "Dashed",
    "y define el actual",
  );

  const unknown = run("-LINETYPE", [keyword("definir"), text("NoCargado")], context(store));
  ok(
    unknown.result?.kind === "message" && unknown.result.text.includes("no está cargado"),
    "uno que no está cargado se rechaza y se dice cómo traerlo",
  );

  const load = run("-LINETYPE", [keyword("Cargar")], context(store));
  ok(
    load.result?.kind === "ui" && load.result.request.target === "linetype-file",
    "cargar pide el archivo a la interfaz",
  );
}
{
  const store = session();
  const step = run("-TOOLPALETTES", [text("Consulta")], context(store));
  ok(
    step.result?.kind === "message" && step.result.text.includes("DIST"),
    "la paleta de consulta enseña sus herramientas y a qué orden llaman",
  );
  const missing = run("-TOOLPALETTES", [text("NoExiste")], context(store));
  ok(
    missing.result?.kind === "message" && missing.result.text.includes("No hay ninguna paleta"),
    "y una que no existe se dice",
  );
}

console.log(`settings-commands.spec: ${checks} comprobaciones verdes.`);
