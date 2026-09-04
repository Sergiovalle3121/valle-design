/**
 * `NORMAMX` sobre el REGISTRO REAL: la norma alcanza a los dibujos que ya
 * existen.
 *
 * Las cuatro afirmaciones:
 *
 *  1. **El comando existe para el usuario.** Se pide al registro que usa el
 *     producto, no a uno montado por la prueba: un comando que no llega al
 *     registro no existe por muy verde que esté su spec.
 *  2. **Añade lo que falta y NO toca lo que ya está.** Un arquitecto puede haber
 *     cambiado el grosor de MURO a conciencia; una orden que se lo pisara es una
 *     orden que nadie vuelve a ejecutar.
 *  3. **Se niega cuando no puede mirar.** Sin tabla de capas no añade nada: lo
 *     dice. Añadir a ciegas repintaría capas ajenas.
 *  4. **Los estilos de cota llegan con la costumbre mexicana dentro** —metros,
 *     dos decimales, garrapata— porque de nada sirve la capa COTA si la cota
 *     nace en milímetros con flecha.
 */
import { strict as assert } from "node:assert";
import type { CadLayerDef } from "../../cad-document";
import { CAD_MEXICAN_LAYERS } from "../../standards/mexican-layers";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandStep,
} from "../command-types";

let checks = 0;
const ok = (condition: boolean, what: string) => {
  checks += 1;
  assert.ok(condition, what);
};

const layer = (id: string, color = "#ffffff"): CadLayerDef => ({
  id,
  name: id,
  color,
  visible: true,
  locked: false,
});

function context(overrides: Partial<CadCommandContext> = {}): CadCommandContext {
  return {
    entityIds: [],
    entity: () => undefined,
    layers: () => [layer("0")],
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "nuevo",
    ...overrides,
  } as CadCommandContext;
}

function run(inputs: readonly CadCommandInput[], ctx: CadCommandContext): CadCommandStep<unknown> {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("NORMAMX");
  assert.ok(descriptor, "el registro del producto conoce NORMAMX");
  let step = descriptor.begin(ctx) as CadCommandStep<unknown>;
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state as never, input, ctx) as CadCommandStep<unknown>;
  }
  return step;
}

const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });

/** Las capas que un resultado de documento añadiría. */
function addedLayers(step: CadCommandStep<unknown>): CadLayerDef[] {
  if (step.result?.kind !== "document") return [];
  return step.result.commands
    .filter((command): command is Extract<typeof command, { type: "layer"; op: "upsert" }> =>
      command.type === "layer" && command.op === "upsert",
    )
    .map((command) => command.layer);
}

function addedStyles(step: CadCommandStep<unknown>) {
  if (step.result?.kind !== "document") return [];
  return step.result.commands.filter(
    (command): command is Extract<typeof command, { type: "style"; op: "upsert" }> =>
      command.type === "style" && command.op === "upsert",
  );
}

// --- EL COMANDO EXISTE PARA EL USUARIO --------------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("NORMAMX");
  ok(!!descriptor, "NORMAMX está en el registro del producto");
  assert.equal(CAD_COMMAND_REGISTRY_V2.get("CAPASMX")?.name, "NORMAMX");
  assert.equal(descriptor?.mutates, true, "escribe en el documento");
}

// --- AÑADE LAS QUE FALTAN, UNA A UNA ----------------------------------------
{
  const step = run([keyword("Arquitectura")], context());
  const layers = addedLayers(step);
  const ids = new Set(layers.map((item) => item.id));
  ok(ids.has("MURO"), "un dibujo vacío recibe MURO");
  ok(ids.has("COTA") && ids.has("TEXTO"), "y la acotación, que es de todos los planos");
  ok(!ids.has("INST-GAS"), "pero NO el gas: no se pidió instalaciones");
  // Las que llegan traen su grosor y su tipo de línea, que es lo que las hace
  // útiles: una capa sin grosor es un nombre.
  assert.equal(layers.find((item) => item.id === "MURO")?.lineweight, 0.35);
  assert.equal(layers.find((item) => item.id === "EJE")?.linetype, "CENTER");
  assert.equal(layers.find((item) => item.id === "AUXILIAR")?.plot, false);
  ok(
    (step.result as { label: string }).label.includes("capa(s)"),
    "la historia dice cuántas capas entraron",
  );
}

// --- NO TOCA LO QUE YA ESTÁ --------------------------------------------------
{
  // El arquitecto tiene su MURO en rojo. Se respeta: pisarlo cambiaría el
  // aspecto del plano sin que nadie lo hubiera pedido.
  const conMuro = context({ layers: () => [layer("0"), layer("MURO", "#ff0000")] });
  const ids = addedLayers(run([keyword("Arquitectura")], conMuro)).map((item) => item.id);
  ok(!ids.includes("MURO"), "MURO ya existe y no se reescribe");
  ok(ids.includes("VANO"), "pero lo que falta sí entra");

  // Y si ya está todo, se DICE en vez de emitir un lote vacío que subiría la
  // versión del documento y gastaría un paso de deshacer para nada.
  const completo = context({
    layers: () => CAD_MEXICAN_LAYERS.map((item) => layer(item.id)),
  });
  const step = run([keyword("Todo")], completo);
  // «Todo» pregunta la escala antes de aplicar, porque siembra estilos.
  const final = step.result
    ? step
    : run([keyword("Todo"), distance(50)], completo);
  ok(final.result?.kind === "document", "con estilos que faltan todavía hay trabajo");
  ok(addedLayers(final).length === 0, "ninguna capa se repite");
}

// --- SE NIEGA CUANDO NO PUEDE MIRAR -----------------------------------------
{
  const ciego = context({ layers: undefined });
  const step = run([keyword("Todo")], ciego);
  assert.equal(step.result?.kind, "message");
  ok(
    (step.result as { text: string }).text.includes("repintaría"),
    "dice POR QUÉ se niega, no sólo que se niega",
  );
}

// --- LOS ESTILOS TRAEN LA COSTUMBRE DENTRO ----------------------------------
{
  const step = run([keyword("estiLos"), distance(100)], context());
  const styles = addedStyles(step);
  const cota = styles.find((item) => item.name === "COTA 1:50");
  ok(!!cota, "siembra el estilo de cota de la escala por defecto");
  assert.equal(cota?.values.units, "m", "se acota en metros");
  assert.equal(cota?.values.precision, 2, "con dos decimales");
  assert.equal(cota?.values.arrowhead, "architectural-tick", "y con garrapata");
  // Los de cota llevan su escala en el nombre, así que se siembran los ocho y la
  // escala tecleada sólo decide la ALTURA DEL RÓTULO.
  const rotulo = styles.find((item) => item.name === "ROTULO");
  assert.equal(rotulo?.values.height, 250, "2,5 mm de papel a 1:100 son 250 unidades");
  ok(styles.some((item) => item.name === "COTA 1:75"), "incluida 1:75, que ISO 5455 no recoge");
  // Y ninguna capa: se pidieron estilos.
  assert.equal(addedLayers(step).length, 0);
}

// --- FALLO CERRADO EN LA ESCALA ---------------------------------------------
{
  const step = run([keyword("estiLos"), distance(0)], context());
  assert.equal(step.result?.kind, "message");
  ok(
    (step.result as { text: string }).text.includes("mayor que cero"),
    "una escala imposible se rechaza diciéndolo",
  );
}

// --- SE PUEDE ABANDONAR ------------------------------------------------------
{
  // Intro en el menú sale sin tocar nada. Una orden que sólo se abandona con
  // Escape es una orden que el usuario deja de usar.
  const conIntro = run([{ kind: "enter" }], context());
  assert.equal(conIntro.result?.kind, "none");
  const conEscape = run([{ kind: "cancel" }], context());
  assert.equal(conEscape.result?.kind, "none");
  checks += 2;
  // Y una opción que no existe repregunta en vez de aplicar algo al azar.
  const raro = run([keyword("Marte")], context());
  ok(!raro.result, "una opción inexistente vuelve al menú, no aplica nada");
}

console.log(`settings-mexican-standard.spec: ${checks} comprobaciones nombradas OK`);
