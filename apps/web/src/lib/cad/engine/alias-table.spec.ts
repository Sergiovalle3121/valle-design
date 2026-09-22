/**
 * La otra mitad del contrato de los alias: que lo DECLARADO se pueda TECLEAR.
 *
 * `index.spec.ts` ya guarda una dirección —ningún alias de la tabla apunta a un
 * comando que no existe—. Faltaba la contraria, y por ahí se colaba un fallo
 * silencioso que ya se pagó tres veces: `DX` en la Ola E, `IM` en la H y los
 * alias de topografía en la I.
 *
 * El motivo es que hay DOS caminos y sólo uno consulta el descriptor:
 *
 * ```text
 *   registry.get("SET")            → mira descriptor.aliases  → SETVAR ✅
 *   teclear «SET» en la línea      → mira CAD_COMMAND_ALIASES → null   ❌
 * ```
 *
 * `resolveCadCommandAlias` —lo que usa `input-pipeline.ts`, o sea el teclado de
 * verdad— NO conoce el registro: resuelve contra la tabla estática de
 * `alias-table.ts`. Así que un alias que sólo vive en su descriptor pasa todas
 * las specs que montan su propio registro, aparece en la paleta, y al teclearlo
 * el usuario lee «Comando desconocido». Es el peor tipo de fallo: verde en CI y
 * roto en las manos.
 *
 * Por eso esta spec no se conforma con `registry.get()`. Ejercita el camino
 * COMPLETO del teclado —`cadCommandEngineReduce` con una acción `token`, que
 * por dentro llama a `resolveCadToken`— y exige que teclear el alias haga
 * EXACTAMENTE lo mismo que invocar el comando por su nombre largo. Un alias
 * nuevo en un descriptor sin su entrada en la tabla falla aquí, con su nombre.
 */
import { strict as assert } from "node:assert";
import { CAD_COMMAND_ALIASES, resolveCadCommandAlias } from "./alias-table";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandEffect,
  type CadCommandEngineReduction,
} from "./command-engine";
import { resolveCadToken } from "./input-pipeline";
import type { CadCommandContext } from "./command-types";
import { CAD_COMMAND_DESCRIPTORS, CAD_COMMAND_REGISTRY_V2 } from "./index";
// Trae las 370 implementaciones estáticas: sin esto el motor entra en el
// comando pero su `begin` no está cargado y responde el renglón de "no terminó
// de cargar", que no es lo que se quiere medir aquí.
import "./all-commands";

const registry = CAD_COMMAND_REGISTRY_V2;
const names = registry.names();

/**
 * Contexto mínimo, con el contador de ids REINICIADO en cada llamada: las dos
 * reducciones que se comparan tienen que poder generar los mismos ids, o la
 * comparación fallaría por el contador y no por el alias.
 */
function context(): CadCommandContext {
  let nextId = 0;
  return {
    entityIds: [],
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `e${++nextId}`,
  };
}

const typed = (text: string): CadCommandEngineReduction =>
  cadCommandEngineReduce(EMPTY_CAD_COMMAND_ENGINE, { kind: "token", value: text }, context(), registry);
const invoked = (name: string): CadCommandEngineReduction =>
  cadCommandEngineReduce(EMPTY_CAD_COMMAND_ENGINE, { kind: "invoke", command: name }, context(), registry);

const unknownCommand = (effects: readonly CadCommandEffect[]) =>
  effects.some((effect) => effect.kind === "message" && effect.text.startsWith("Comando desconocido"));

// --- todo alias declarado se puede TECLEAR -----------------------------------
//
// Las tres capas, de la más barata a la que de verdad importa: la tabla, el
// pipeline de entrada, y el motor entero.
{
  const sinEntrada: string[] = [];
  let comprobados = 0;

  for (const descriptor of CAD_COMMAND_DESCRIPTORS) {
    const name = descriptor.name.toUpperCase();
    for (const raw of descriptor.aliases) {
      const alias = raw.toUpperCase();
      comprobados += 1;

      // 1. La tabla. Se anota en vez de reventar en el primero para que el
      //    fallo liste TODOS los alias mudos de una vez: quien añada una
      //    familia entera de comandos quiere la lista completa, no el primero.
      if (resolveCadCommandAlias(alias, names) !== name) {
        sinEntrada.push(`${alias}→${name}`);
        continue;
      }

      // 2. El pipeline de entrada, que es lo que corre al pulsar Enter en la
      //    línea de comandos sin comando activo.
      assert.deepEqual(
        resolveCadToken(alias, { knownCommands: names }),
        { kind: "invoke", command: name, transparent: false },
        `el pipeline de entrada no invoca ${name} al teclear "${alias}"`,
      );
      // Mayúsculas y el prefijo internacional `_` de AutoCAD no cambian a qué
      // comando se refiere quien escribe.
      assert.equal(resolveCadCommandAlias(alias.toLowerCase(), names), name, `"${alias}" en minúsculas`);
      assert.equal(resolveCadCommandAlias(`_${alias}`, names), name, `"_${alias}" con prefijo internacional`);

      // 3. El motor. Teclear el alias tiene que hacer EXACTAMENTE lo mismo que
      //    invocar el comando por su nombre largo — mismo estado, mismos
      //    efectos, mismo prompt—, que es la definición operativa de "el alias
      //    funciona". Comparar contra la invocación directa, en vez de contra
      //    una forma esperada, deja que cada comando sea como sea: los que
      //    exigen designación previa contestan lo suyo por las dos vías.
      const porTeclado = typed(alias);
      assert.ok(!unknownCommand(porTeclado.effects), `teclear "${alias}" respondió «Comando desconocido»`);
      assert.deepEqual(
        porTeclado,
        invoked(name),
        `teclear "${alias}" no hace lo mismo que invocar ${name}`,
      );
    }
  }

  assert.deepEqual(
    sinEntrada,
    [],
    "alias declarados en su descriptor que NO tienen entrada en CAD_COMMAND_ALIASES: " +
      `tecleados responden «Comando desconocido». Añádelos a alias-table.ts. → ${sinEntrada.join(", ")}`,
  );
  console.log(`alias de descriptor comprobados por el motor: ${comprobados}`);
}

// --- el caso que destapó la auditoría: SET → SETVAR --------------------------
//
// SETVAR declara `aliases: ["SET"]` desde que existe, y `SET` no estaba en la
// tabla. `registry.get("SET")` devolvía SETVAR —por eso la paleta lo
// encontraba— mientras que teclear `SET` en la línea moría en el pipeline.
{
  assert.equal(CAD_COMMAND_ALIASES.SET, "SETVAR", "SET vive ya en la tabla, no sólo en el descriptor");
  assert.equal(resolveCadCommandAlias("SET", names), "SETVAR");

  const reduccion = typed("SET");
  assert.ok(!unknownCommand(reduccion.effects), "teclear SET ya no responde «Comando desconocido»");
  assert.equal(reduccion.state.active?.name, "SETVAR", "teclear SET arranca SETVAR de verdad");
  const prompt = reduccion.effects.find((effect) => effect.kind === "prompt");
  assert.ok(
    prompt?.kind === "prompt" && prompt.prompt.message.includes("variable de sistema"),
    "y el prompt que sale es el de SETVAR, no un renglón de carga",
  );
}

// --- las variantes con guion son comandos DISTINTOS --------------------------
//
// `-LA` tiene que llegar a `-LAYER` —el que pide sus opciones por la línea— y
// no a `LAYER`, que abre el gestor. Sin su entrada propia en la tabla, `-LA`
// caía al alias `LA` y abría el cuadro de diálogo: un `.scr` se quedaba
// esperando un clic, que es justo lo que el guion existe para evitar.
{
  for (const [tecleado, esperado] of [
    ["-LA", "-LAYER"],
    ["-LT", "-LINETYPE"],
    ["-DS", "-DSETTINGS"],
    ["-SE", "-DSETTINGS"],
    ["-RM", "-DSETTINGS"],
    ["-OS", "-OSNAP"],
    ["-UC", "-UCSMAN"],
    ["-TP", "-TOOLPALETTES"],
  ] as const) {
    assert.equal(resolveCadCommandAlias(tecleado, names), esperado, `"${tecleado}" es ${esperado}`);
    assert.equal(
      typed(tecleado).state.active?.name,
      esperado,
      `teclear "${tecleado}" arranca ${esperado}, no su variante con cuadro de diálogo`,
    );
  }
  // Y el alias sin guion sigue abriendo el cuadro, que es su trabajo.
  assert.equal(resolveCadCommandAlias("LA", names), "LAYER");
  assert.equal(resolveCadCommandAlias("DS", names), "DSETTINGS");
}

// --- ningún alias de la tabla queda ensombrecido por un nombre de comando ----
//
// `resolveCadCommandAlias` mira el nombre LITERAL antes que la tabla. Una
// entrada cuya clave sea a la vez el nombre de otro comando nunca se leería, y
// el alias quedaría mudo sin que nada lo dijese.
{
  const ensombrecidos = Object.entries(CAD_COMMAND_ALIASES)
    .filter(([alias, destino]) => names.has(alias.toUpperCase()) && alias.toUpperCase() !== destino.toUpperCase())
    .map(([alias, destino]) => `${alias}→${destino}`);
  assert.deepEqual(
    ensombrecidos,
    [],
    `alias de la tabla que son el nombre de otro comando y nunca se leen: ${ensombrecidos.join(", ")}`,
  );
}

console.log(
  `tabla de alias: ${Object.keys(CAD_COMMAND_ALIASES).length} entradas · ` +
    `los alias de los ${CAD_COMMAND_DESCRIPTORS.length} descriptores se pueden teclear todos`,
);
