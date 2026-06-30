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
