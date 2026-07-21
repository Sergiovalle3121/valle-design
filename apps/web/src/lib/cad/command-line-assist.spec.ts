import { suggestCadCommands } from "./command-line-assist";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected)
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function assertOk(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

function assertMatch(value: string, pattern: RegExp, message: string) {
  if (!pattern.test(value)) throw new Error(message);
}

const pairSuggestions = suggestCadCommands({
  selectedCount: 2,
  selectedObjectLabels: ["AOI", "Packing"],
  maxItems: 3,
});

assertEqual(
  pairSuggestions[0].commandId,
  "measure_distance",
  "two selected objects prioritize measurement",
);
assertOk(
  pairSuggestions.some((suggestion) =>
    suggestion.example.includes("AOI") && suggestion.example.includes("Packing"),
  ),
  "suggestions reuse selected object labels in examples",
);
assertEqual(
  pairSuggestions.every((suggestion) => suggestion.ready),
  true,
  "two-object suggestions are actionable",
);

const validateSuggestions = suggestCadCommands({
  query: "validar layout",
  selectedCount: 0,
});
assertEqual(
  validateSuggestions[0].commandId,
  "validate_layout",
  "query search ranks validation command",
);

const blockedMeasure = suggestCadCommands({
  query: "mide",
  selectedCount: 0,
});
assertEqual(
  blockedMeasure[0].commandId,
  "measure_distance",
  "query still exposes matching command when selection is missing",
);
assertEqual(blockedMeasure[0].ready, false, "missing selection is explicit");
assertMatch(blockedMeasure[0].reason, /Selecciona 2/, "reason names blocker");

console.log("cad command line assist specs passed");

// Kit diario: sin selección, mirror/rotate/scale piden 1 objeto.
{
  const items = suggestCadCommands({ query: "rota", selectedCount: 0, maxItems: 6 });
  const rotate = items.find((item) => item.commandId === "rotate_selection");
  assertOk(rotate, "sugiere rotate ante 'rota'");
  assertEqual(rotate?.ready, false, "sin seleccion no esta listo");
}
{
  const items = suggestCadCommands({ query: "espejo", selectedCount: 2, maxItems: 6 });
  const mirror = items.find((item) => item.commandId === "mirror_selection");
  assertOk(mirror, "sugiere espejo");
  assertEqual(mirror?.ready, true, "con seleccion queda listo");
}

// Palette vacío sin selección (AXOS-CAD-ASSIST-002): el kit universal
// primero — colocar y seleccionar por nombre arriba, no los comandos EMS.
{
  const items = suggestCadCommands({ selectedCount: 0, maxItems: 5 });
  assertEqual(
    items[0]?.commandId,
    "place_symbol",
    "sin seleccion, colocar simbolo encabeza",
  );
  assertOk(
    items.slice(0, 3).some((item) => item.commandId === "select_objects"),
    "seleccionar por nombre en el top 3",
  );
}

// AXOS-CAD-ASSIST-004: REDIMENSIONAR aparece al teclear 'tamaño'.
{
  const items = suggestCadCommands({
    query: "tamaño",
    selectedCount: 1,
    maxItems: 5,
  });
  assertEqual(
    items[0]?.commandId,
    "resize_object",
    "query 'tamaño' sugiere cambiar tamaño primero",
  );
  const resize = items.find((item) => item.commandId === "resize_object");
  assertEqual(resize?.ready, true, "con un objeto seleccionado queda listo");
}

// AXOS-CAD-ASSIST-005: sinónimos espaciales — palabras sin example ganan.
{
  const vacia = suggestCadCommands({ query: "vacia", maxItems: 5 });
  assertEqual(
    vacia[0]?.commandId,
    "delete_selection",
    "query 'vacia' sugiere borrar primero",
  );
  const mete = suggestCadCommands({ query: "mete", maxItems: 5 });
  assertEqual(
    mete[0]?.commandId,
    "move_selection",
    "query 'mete' sugiere mover primero",
  );
  const donde = suggestCadCommands({ query: "donde", maxItems: 5 });
  assertOk(
    donde.some((item) => item.commandId === "object_info"),
    "query 'donde' trae info de objeto",
  );
  const cerca = suggestCadCommands({ query: "cerca", maxItems: 5 });
  assertOk(
    cerca.some((item) => item.commandId === "select_objects"),
    "query 'cerca' trae seleccionar",
  );
}
