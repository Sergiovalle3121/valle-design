/**
 * GUARDIÁN: el producto no se anuncia como BIM, y esta ola es la que lo tienta.
 *
 * ## Por qué hace falta justo ahora
 *
 * El repositorio ya tiene guardias contra dos frases —«compatible con DWG» y
 * «reemplaza a AutoCAD»— porque son las dos que un producto CAD joven se siente
 * tentado de decir antes de tiempo. Falta la tercera, y esta ola la estrena: el
 * rescate trae un módulo que se llama `bim-schedule.ts` y otro `builtins/bim.ts`.
 *
 * La regla de la casa es que no se dice «BIM» mientras no lo sea. Un cuadro de
 * áreas y una tabla de carpintería derivados de muros y huecos son cantidades
 * sacadas del modelo, que es una cosa buena y honesta; NO son un modelo de
 * información de construcción, que trae consigo IFC, disciplinas coordinadas,
 * detección de interferencias y un ciclo de vida. Prometer la palabra entera
 * por tener la primera rebanada es exactamente el claim falso que aquí se veta.
 *
 * ## La frontera que se dibuja, y por qué está donde está
 *
 * Los NOMBRES DE ARCHIVO y los COMENTARIOS pueden decir «BIM»: son para quien
 * escribe el código, describen a qué familia pertenece el módulo y nadie los
 * lee como una promesa comercial. Lo que no puede decirlo es nada que el
 * usuario vea o teclee: nombres de orden, alias, funciones de LISP y el texto
 * de las rutinas que se le entregan. Ahí la palabra sí sería una afirmación
 * sobre el producto.
 *
 * Este spec vigila esa segunda lista.
 */
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CAD_COMMAND_DESCRIPTORS } from "./engine";
import { CAD_COMMAND_ALIASES } from "./engine/alias-table";

/**
 * Dos expresiones, y la diferencia entre ellas es deliberada.
 *
 * En un IDENTIFICADOR que se teclea —`BIMSCHEDULE`, `vd-bim-areas`— la palabra
 * no necesita bordes para ser un anuncio, así que se busca como subcadena. El
 * riesgo de pasarse es teórico: son tokens cortos y en mayúsculas.
 *
 * En PROSA sí hacen falta bordes, porque el español tiene palabras que la
 * contienen sin decir nada («bimestre», «bimensual») y un guardián que grita
 * por «bimestral» se acaba desactivando, que es la peor forma de fallar.
 */
const RECLAMA_EN_IDENTIFICADOR = /bim/iu;
const RECLAMA_EN_PROSA = /\bBIM\b/iu;

const aqui = path.dirname(fileURLToPath(import.meta.url));

// --- 1. lo que se teclea: órdenes y alias -----------------------------------
{
  const tecleable: string[] = [];
  for (const d of CAD_COMMAND_DESCRIPTORS) {
    tecleable.push(d.name, ...(d.aliases ?? []));
  }
  tecleable.push(...Object.keys(CAD_COMMAND_ALIASES));

  const culpables = tecleable.filter((n) => RECLAMA_EN_IDENTIFICADOR.test(n));
  assert.deepEqual(
    culpables,
    [],
    `hay órdenes o alias que anuncian BIM: ${culpables.join(", ")}`,
  );

  // Controles: un guardián que no puede fallar no defiende nada, y uno que
  // falla siempre se acaba borrando. Se comprueban los dos extremos.
  assert.ok(RECLAMA_EN_IDENTIFICADOR.test("BIMSCHEDULE"), "no detectaría una orden llamada BIMSCHEDULE");
  assert.ok(!RECLAMA_EN_IDENTIFICADOR.test("WALL"), "detecta de más en identificadores");
  assert.ok(RECLAMA_EN_PROSA.test("un flujo BIM completo"), "no detectaría el claim en prosa");
  assert.ok(!RECLAMA_EN_PROSA.test("revisión bimestral"), "el guardián gritaría por «bimestral»");
}

// --- 2. lo que se lee: las rutinas .lsp que se entregan al despacho ----------
{
  const dirRutinas = path.join(aqui, "..", "lisp", "factory");
  const rutinas = readdirSync(dirRutinas).filter((f) => f.endsWith(".lsp"));
  assert.ok(rutinas.length > 0, "no se encontró ninguna rutina de fábrica que vigilar");

  for (const archivo of rutinas) {
    const texto = readFileSync(path.join(dirRutinas, archivo), "utf8");
    assert.ok(
      !RECLAMA_EN_PROSA.test(texto),
      `la rutina ${archivo} se anuncia como BIM y el producto todavía no lo es`,
    );
  }
}

// --- 3. lo que se invoca: las funciones LISP del subsistema de cantidades ----
{
  // Los nombres se leen del fuente porque instalarlos exigiría un intérprete
  // entero; lo que importa es el literal que el usuario acaba escribiendo.
  const fuente = readFileSync(path.join(aqui, "..", "lisp", "builtins", "bim.ts"), "utf8");
  const nombres = [...fuente.matchAll(/"(vd-[a-z0-9-]+)"/gu)].map((m) => m[1]);

  assert.ok(nombres.length >= 3, `se esperaban al menos 3 funciones vd-*, se vieron ${nombres.length}`);
  const culpables = nombres.filter((n) => RECLAMA_EN_IDENTIFICADOR.test(n));
  assert.deepEqual(
    culpables,
    [],
    `hay funciones LISP que anuncian BIM: ${culpables.join(", ")}`,
  );
}

console.log("OK frontera BIM: ninguna orden, alias, función LISP ni rutina entregada reclama ser BIM");
