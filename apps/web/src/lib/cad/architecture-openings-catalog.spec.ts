/**
 * El catálogo de puertas y ventanas contra la orden que lo coloca (2026-09-04).
 *
 * Lo que se prueba no es que la tabla exista —eso lo diría cualquier `length`—
 * sino las cuatro propiedades de las que depende que sirva para algo:
 *
 *  1. **Una sola marca.** Cada entrada declara su marca con `openingMark`, y
 *     esa marca es CARÁCTER A CARÁCTER la que `bim-schedule.ts` calcula desde
 *     la entidad `opening` que la orden coloca de verdad. Si el catálogo
 *     dijera `P-090x210` y el cuadro imprimiera otra cosa, el catálogo sería
 *     un segundo vocabulario para la misma puerta, que es exactamente lo que
 *     vino a evitar.
 *  2. **Elegir y teclear son el mismo camino.** `Tipo P-090` y `Anchura 900 ·
 *     alTura 2100` producen la MISMA entidad, campo por campo; y el hueco que
 *     sale sin tocar nada es una entrada del catálogo, no un tamaño paralelo.
 *  3. **La unidad del documento no cambia la pieza.** Las medidas del catálogo
 *     colocadas en mm, cm, m, in y ft vuelven al mismo milimetraje. En pies el
 *     ida y vuelta deja el último bit del doble (1.800 mm vuelven como
 *     1.800,0000000000002), y la deriva máxima medida se IMPRIME al terminar en
 *     vez de esconderse tras una tolerancia generosa.
 *  4. **Lo que no está se niega con la lista delante.** Un `Tipo` inventado no
 *     coloca el hueco por defecto ni se aproxima al más parecido: se queda en
 *     el prompt del tipo nombrando las claves válidas, y ni siquiera un clic
 *     sobre el muro coloca nada mientras tanto.
 *
 * El límite que NO se prueba porque no es cierto, y se dice: `openingMark` lee
 * sus números como milímetros, así que la marca literal sólo coincide en un
 * documento en mm. En metros o en pies la marca del cuadro es P-000x000 para
 * todo — un defecto viejo de `bim-schedule.ts`, anterior a este catálogo. Lo
 * que sí se garantiza en las cinco unidades es que catálogo y medida a mano
 * dan la misma entidad y, por tanto, la misma fila, sea cual sea esa fila.
 */
// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

import { strict as assert } from "node:assert";
import {
  CAD_OPENING_DEFAULT_TYPE,
  CAD_OPENING_TYPES,
  cadOpeningType,
  cadOpeningTypeKeys,
  cadOpeningTypeLabel,
  cadOpeningTypeMark,
  cadOpeningTypeRefusal,
  cadOpeningTypeSize,
  cadOpeningTypes,
  type CadOpeningType,
} from "./architecture-openings-catalog";
import { openingMark } from "./bim-schedule";
import type { CadOpeningEntity, CadOpeningKind } from "./cad-entities-v7";
import type { CadEntity } from "./cad-document";
import { CAD_COMMAND_REGISTRY_V2 } from "./engine";
import type { CadCommandContext, CadCommandInput } from "./engine/command-types";
import { cadFromMillimetres, cadToMillimetres } from "./engine/commands/architecture-support";
import { defaultOpeningSize } from "./engine/commands/draw-opening";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

const UNITS = ["mm", "cm", "m", "in", "ft"] as const;
/** La peor deriva del ida y vuelta a milímetros, medida y no supuesta. */
let worst = 0;
let worstCase = "";
const COMMAND: Readonly<Record<CadOpeningKind, string>> = { door: "DOOR", window: "WINDOW" };

/* ── El muro donde se aloja todo lo que sigue ───────────────────────────── */

/** Muro de 6.000 × 150 y 2.400 de alto, en la unidad que se le pida. */
function makeContext(unit: string): CadCommandContext {
  const mm = (value: number) => cadFromMillimetres(value, unit);
  const wall = {
    id: "muro-1",
    type: "wall",
    start: { x: 0, y: 0, z: 0 },
    end: { x: mm(6_000), y: 0, z: 0 },
    thickness: mm(150),
    height: mm(2_400),
    layer: "MUROS",
  } as unknown as CadEntity;
  let ids = 0;
  return {
    entityIds: ["muro-1"],
    entity: (entityId) => (entityId === "muro-1" ? wall : undefined),
    selection: [],
    activeLayer: "MUROS",
    unit,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `hueco-${(ids += 1)}`,
  };
}

const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const text = (value: string): CadCommandInput => ({ kind: "text", value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
/** El clic sobre el muro, a la mitad de su eje. */
const pickWall = (unit: string): CadCommandInput => ({
  kind: "entityPick",
  entityId: "muro-1",
  point: { x: cadFromMillimetres(3_000, unit), y: 0 },
});

function drive(kind: CadOpeningKind, inputs: readonly CadCommandInput[], context: CadCommandContext) {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(COMMAND[kind]);
  assert.ok(descriptor, `${COMMAND[kind]} está en el registro del producto`);
  let step = descriptor.begin(context);
  const prompts = [step.prompt.message];
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
    prompts.push(step.prompt.message);
  }
  return {
    step,
    result: step.result,
    prompts,
    prompt: step.prompt.message,
    options: step.prompt.options.map((option) => option.keyword),
  };
}

/** El hueco que la orden escribió de verdad, o falla con lo que dijo en su lugar. */
function placed(driven: ReturnType<typeof drive>): CadOpeningEntity {
  const result = driven.result;
  assert.ok(
    result && result.kind === "document",
    `debía colocar un hueco; dio ${result?.kind ?? "nada"}${
      result?.kind === "message" ? `: ${result.text}` : ""
    } · prompt: ${driven.prompt}`,
  );
  const [command] = result.commands;
  assert.ok(command && command.type === "insert", "el lote da de alta el hueco");
  const entity = command.entity as unknown as CadOpeningEntity;
  assert.equal(entity.type, "opening", "y lo que da de alta es un hueco");
  return entity;
}

/** Coloca una entrada del catálogo por su clave. */
const placeType = (type: CadOpeningType, unit: string) =>
  placed(drive(type.kind, [keyword("TIpo"), keyword(type.key), pickWall(unit)], makeContext(unit)));

/* ── 1. La tabla es cerrada, sin claves ni marcas repetidas ─────────────── */
{
  ok(CAD_OPENING_TYPES.length === 9, "nueve entradas: cinco puertas y cuatro ventanas");
  const keys = CAD_OPENING_TYPES.map((type) => type.key);
  eq(new Set(keys).size, keys.length, "ninguna clave se repite");
  const marks = CAD_OPENING_TYPES.map(cadOpeningTypeMark);
  eq(
    new Set(marks).size,
    marks.length,
    "ninguna marca se repite: dos entradas con la misma marca serían UNA fila del cuadro",
  );
  for (const type of CAD_OPENING_TYPES) {
    ok(type.widthMm > 0 && type.heightMm > 0, `${type.key} mide algo`);
    ok(type.sillMm >= 0, `${type.key} no tiene antepecho negativo`);
    ok(type.use.trim().length > 0, `${type.key} dice para qué es`);
    ok(/^[PV]-\d{3}x\d{3}$/.test(cadOpeningTypeMark(type)), `${type.key} marca con la forma del cuadro`);
    ok(cadOpeningType(type.key) === type, `${type.key} se resuelve a SU entrada, por referencia`);
    ok(cadOpeningType(type.key.toLowerCase(), type.kind) === type, `${type.key} se resuelve en minúsculas`);
    ok(cadOpeningType(`  ${type.key} `, type.kind) === type, `${type.key} tolera los espacios de más`);
    ok(
      cadOpeningType(cadOpeningTypeMark(type), type.kind) === type,
      `la marca ${cadOpeningTypeMark(type)} que imprime el cuadro se puede volver a teclear`,
    );
  }
  eq(cadOpeningTypeKeys("door").length, 5, "cinco puertas");
  eq(cadOpeningTypeKeys("window").length, 4, "cuatro ventanas");
  eq(
    cadOpeningTypeKeys("door").length + cadOpeningTypeKeys("window").length,
    CAD_OPENING_TYPES.length,
    "y no hay ninguna entrada de una tercera clase",
  );
  ok(cadOpeningType("P-095", "door") === null, "una puerta que no está no se aproxima a la de al lado");
  ok(cadOpeningType("V-120x120", "door") === null, "y una ventana no cuela por puerta");
  ok(cadOpeningType("", "door") === null, "la cadena vacía no resuelve");
  ok(cadOpeningTypeLabel(cadOpeningType("P-090", "door")!).startsWith("P-090 (acceso)"), "la etiqueta dice clave y uso");
}

/* ── 2. La marca del catálogo la reproduce openingMark desde lo colocado ── */
{
  for (const type of CAD_OPENING_TYPES) {
    const entity = placeType(type, "mm");
    eq(entity.kind, type.kind, `${type.key} coloca un hueco de su clase`);
    eq(entity.width, type.widthMm, `${type.key} coloca su anchura`);
    eq(entity.height, type.heightMm, `${type.key} coloca su altura`);
    eq(entity.sill, type.sillMm, `${type.key} coloca su antepecho`);
    eq(entity.hostId, "muro-1", `${type.key} se aloja en el muro señalado`);
    // Carácter a carácter: `assert.equal` sobre dos cadenas es exactamente eso.
    eq(
      openingMark(entity),
      cadOpeningTypeMark(type),
      `${type.key} produce en el cuadro la marca que el catálogo declara`,
    );
  }
  eq(cadOpeningTypeMark(cadOpeningType("P-090", "door")!), "P-090x210", "la P-090 se llama P-090x210 en el cuadro");
  eq(cadOpeningTypeMark(cadOpeningType("V-060x040", "window")!), "V-060x040", "y la ventana de baño, V-060x040");
}

/* ── 3. Las cinco unidades vuelven al mismo milimetraje ─────────────────── */
{
  for (const unit of UNITS) {
    for (const type of CAD_OPENING_TYPES) {
      const entity = placeType(type, unit);
      const measured: Array<[string, number, number]> = [
        ["anchura", entity.width, type.widthMm],
        ["altura", entity.height, type.heightMm],
        ["antepecho", entity.sill, type.sillMm],
      ];
      for (const [label, value, expected] of measured) {
        const back = cadToMillimetres(value, unit);
        const drift = Math.abs(back - expected);
        if (drift > worst) {
          worst = drift;
          worstCase = `${type.key} ${label} en ${unit}: ${expected} → ${back}`;
        }
        // Una parte en 10¹² es el último bit de un doble a esta escala, no una
        // tolerancia de dibujo: 1 × 10⁻¹³ mm sobre 900 mm.
        ok(
          drift <= Math.max(1, expected) * 1e-12,
          `${type.key} en ${unit}: la ${label} vuelve a ${expected} mm (dio ${back})`,
        );
      }
    }
  }
  ok(worst > 0, "en alguna unidad el ida y vuelta no es exacto, y por eso se mide");
  ok(worst < 1e-12, `la deriva máxima es despreciable: ${worstCase}`);
  // La P-090 en metros mide 0,9. Es la frase del entregable, comprobada.
  eq(placeType(cadOpeningType("P-090", "door")!, "m").width, 0.9, "una P-090 en un plano en metros mide 0,9");
  eq(placeType(cadOpeningType("P-090", "door")!, "cm").width, 90, "y en centímetros, 90");
}

/* ── 4. Elegir del catálogo y teclear a mano dan la MISMA fila ──────────── */
{
  for (const unit of UNITS) {
    const mm = (value: number) => cadFromMillimetres(value, unit);
    const fromCatalog = placeType(cadOpeningType("P-090", "door")!, unit);
    const byHand = placed(
      drive(
        "door",
        [
          keyword("Anchura"),
          distance(mm(900)),
          keyword("alTura"),
          distance(mm(2_100)),
          pickWall(unit),
        ],
        makeContext(unit),
      ),
    );
    eq(byHand, fromCatalog, `en ${unit}, la P-090 del catálogo y la tecleada a mano son la misma entidad`);
  }
  eq(openingMark(placeType(cadOpeningType("P-090", "door")!, "mm")), "P-090x210", "y la fila del cuadro es una sola");

  // El default de la orden ES una entrada del catálogo, no un tamaño paralelo.
  for (const kind of ["door", "window"] as const) {
    const type = CAD_OPENING_DEFAULT_TYPE[kind];
    ok(CAD_OPENING_TYPES.includes(type), `el default de ${COMMAND[kind]} es una entrada del catálogo`);
    for (const unit of UNITS) {
      const bare = placed(drive(kind, [pickWall(unit)], makeContext(unit)));
      const chosen = placeType(type, unit);
      eq(bare, chosen, `en ${unit}, ${COMMAND[kind]} sin tocar nada coloca su ${type.key}`);
      eq(
        defaultOpeningSize(kind, unit),
        cadOpeningTypeSize(type, unit),
        `y defaultOpeningSize(${kind}, ${unit}) son las medidas de ${type.key}`,
      );
    }
  }
}

/* ── 5. Un Tipo que no existe se niega nombrando las claves válidas ─────── */
{
  const refusal = cadOpeningTypeRefusal("P-095", "door");
  for (const key of cadOpeningTypeKeys("door")) ok(refusal.includes(key), `el rechazo nombra ${key}`);
  for (const key of cadOpeningTypeKeys("window"))
    ok(!refusal.includes(key), `y no ofrece ${key}, que es de la otra clase`);
  ok(refusal.includes("P-095"), "el rechazo repite lo que se pidió, para que se vea el dedazo");

  // Lo tecleado llega como TEXTO (no encaja con ninguna opción del prompt) y
  // muere ahí: el paso sigue siendo el del tipo, así que el clic sobre el muro
  // NO coloca nada.
  const rejected = drive("door", [keyword("TIpo"), text("P-095"), pickWall("mm")], makeContext("mm"));
  ok(rejected.result === undefined, "un tipo inventado no coloca ningún hueco, ni siquiera el de por defecto");
  ok(rejected.prompt.includes(refusal), "y el prompt lleva el rechazo del catálogo, con la lista delante");
  ok(rejected.prompt.includes("Precise el tipo"), "sin salir del paso del tipo");
  eq(rejected.options, [...cadOpeningTypeKeys("door")], "las opciones ofrecidas son las cinco puertas");

  const crossed = drive("door", [keyword("TIpo"), text("V-120x120"), pickWall("mm")], makeContext("mm"));
  ok(crossed.result === undefined, "pedirle a DOOR una ventana tampoco coloca nada");
  ok(crossed.prompt.includes("V-120x120"), "el rechazo dice qué se pidió");

  // Y después del rechazo la orden sigue viva: se teclea un tipo bueno y coloca.
  const recovered = drive(
    "door",
    [keyword("TIpo"), text("P-095"), keyword("P-080"), pickWall("mm")],
    makeContext("mm"),
  );
  eq(placed(recovered).width, 800, "tras el rechazo, un tipo válido coloca su puerta");
}

/* ── 6. Teclear una medida a mano retira la etiqueta del tipo ───────────── */
{
  const chosen = drive("door", [keyword("TIpo"), keyword("P-090")], makeContext("mm"));
  ok(chosen.prompt.endsWith("la puerta P-090"), `el prompt dice qué se coloca: «${chosen.prompt}»`);
  ok(chosen.prompt.includes(cadOpeningTypeLabel(cadOpeningType("P-090", "door")!)), "y confirma la elección con sus medidas");

  const edited = drive(
    "door",
    [keyword("TIpo"), keyword("P-090"), keyword("Anchura"), distance(850), pickWall("mm")],
    makeContext("mm"),
  );
  const entity = placed(edited);
  eq(entity.width, 850, "la anchura tecleada manda sobre la del tipo");
  eq(openingMark(entity), "P-085x210", "y el cuadro la llama por lo que mide, no por el tipo del que vino");
  const relabelled = drive(
    "door",
    [keyword("TIpo"), keyword("P-090"), keyword("Anchura"), distance(850)],
    makeContext("mm"),
  );
  ok(
    relabelled.prompt.endsWith("alojar la puerta") && !relabelled.prompt.includes("P-090"),
    `el prompt deja de llamarla P-090 en cuanto deja de medir 900: «${relabelled.prompt}»`,
  );
}

/* ── 7. Cada orden ofrece SOLO su clase, y `Tipo` está en su renglón ────── */
{
  for (const kind of ["door", "window"] as const) {
    const opened = drive(kind, [keyword("TIpo")], makeContext("mm"));
    eq(opened.options, [...cadOpeningTypeKeys(kind)], `${COMMAND[kind]} ofrece sólo los tipos de su clase`);
    const first = drive(kind, [], makeContext("mm"));
    ok(first.options.includes("TIpo"), `${COMMAND[kind]} ofrece TIpo desde el primer renglón`);
    ok(first.options.includes("Anchura"), "sin quitar la medida a mano, que sigue siendo la salida del catálogo");
    // El atajo de `Tipo` es la I porque la T ya es la de `alTura`: dos atajos
    // iguales dejan de servir para los DOS.
    const shortcuts = drive(kind, [], makeContext("mm")).step.prompt.options.map((option) => option.shortcut);
    eq(new Set(shortcuts).size, shortcuts.length, `${COMMAND[kind]} no tiene dos opciones con el mismo atajo`);
  }
  eq(
    cadOpeningTypes("window").map((type) => type.key),
    ["V-060x040", "V-120x120", "V-150x120", "V-180x120"],
    "las ventanas se ofrecen de menor a mayor",
  );
}

console.log(
  `architecture-openings-catalog: ${checks} comprobaciones verdes. Nueve tipos ` +
    `(P-060…P-100 × 2.100 y V-060x040/V-120x120/V-150x120/V-180x120) sin clave ni marca ` +
    `repetida; cada uno colocado por DOOR/WINDOW produce en el cuadro la marca que el ` +
    `catálogo declara, carácter a carácter; las medidas van y vuelven de mm/cm/m/in/ft ` +
    `con una deriva máxima de ${worst.toExponential(1)} mm (${worstCase}); catálogo y medida a mano dan ` +
    `la misma entidad en las cinco unidades y el default de cada orden es una entrada del ` +
    `catálogo; un tipo inventado se niega nombrando las cinco puertas y no coloca nada.`,
);
