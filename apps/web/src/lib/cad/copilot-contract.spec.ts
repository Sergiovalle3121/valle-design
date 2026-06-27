import { strict as assert } from "node:assert";
import {
  buildCadCopilotSafeContext,
  cadCopilotToolSchemas,
  redactCadCopilotText,
  validateCadCopilotToolCall,
} from "./copilot-contract";

assert.equal(
  redactCadCopilotText("customer AOI").text,
  "[redacted] AOI",
  "redacts sensitive labels",
);
const context = buildCadCopilotSafeContext([
  {
    id: "1",
    label: "Cliente SMT",
    type: "station",
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  },
]);
assert.equal(context.redactions.length, 1, "tracks redacted objects");
const firstTool = cadCopilotToolSchemas()[0].function.name;
assert.equal(
  validateCadCopilotToolCall({ name: firstTool, arguments: {} }).ok,
  true,
  "accepts registered tool",
);
assert.equal(
  validateCadCopilotToolCall({ name: "unknown", arguments: {} }).ok,
  false,
  "rejects unknown tool",
);
console.log("cad copilot contract specs passed");
