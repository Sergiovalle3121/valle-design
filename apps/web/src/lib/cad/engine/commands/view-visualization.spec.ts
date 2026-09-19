/**
 * Familia Visualización: 3DWALK, 3DFLY, 3DSWIVEL, VISUALSTYLES.
 *
 * Los comandos de navegación 3D declaran honestamente que requieren un
 * anfitrión con visor 3D. VISUALSTYLES ofrece opciones de estilo visual.
 */
import { strict as assert } from "node:assert";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput } from "../command-types";

import "@/lib/cad/engine/all-commands";

// --- Registro ----------------------------------------------------------------
for (const name of ["3DWALK", "3DFLY", "3DSWIVEL", "VISUALSTYLES"]) {
  assert.ok(CAD_COMMAND_REGISTRY_V2.get(name), `${name} está en el registro`);
}

const dummyContext: CadCommandContext = {
  entityIds: [],
  entity: () => undefined,
  selection: [],
  activeLayer: "0",
  view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
  newEntityId: () => "never",
};

const cancel: CadCommandInput = { kind: "cancel" };

// --- 3DWALK ------------------------------------------------------------------
{
  const desc = CAD_COMMAND_REGISTRY_V2.get("3DWALK")!;
  let step = desc.begin(dummyContext);
  assert.ok(step.prompt.message.includes("Caminar"), "3DWALK: prompt inicial menciona Caminar");
  step = desc.step(step.state, cancel, dummyContext);
  assert.ok(step.result?.kind === "message" && step.result.text.includes("cancelado"), "3DWALK se cancela");
}

// --- 3DWALK: acepta entrada --------------------------------------------------
{
  const desc = CAD_COMMAND_REGISTRY_V2.get("3DWALK")!;
  let step = desc.begin(dummyContext);
  step = desc.step(step.state, { kind: "enter" }, dummyContext);
  assert.ok(
    step.result?.kind === "message" && step.result.text.includes("navegación"),
    `3DWALK declara límite: ${step.result?.kind === "message" ? step.result.text : ""}`,
  );
}

// --- 3DFLY -------------------------------------------------------------------
{
  const desc = CAD_COMMAND_REGISTRY_V2.get("3DFLY")!;
  let step = desc.begin(dummyContext);
  assert.ok(step.prompt.message.includes("Volar"), "3DFLY: prompt inicial menciona Volar");
  step = desc.step(step.state, cancel, dummyContext);
  assert.ok(step.result?.kind === "message" && step.result.text.includes("cancelado"), "3DFLY se cancela");
}

// --- 3DFLY: acepta entrada ---------------------------------------------------
{
  const desc = CAD_COMMAND_REGISTRY_V2.get("3DFLY")!;
  let step = desc.begin(dummyContext);
  step = desc.step(step.state, { kind: "enter" }, dummyContext);
  assert.ok(
    step.result?.kind === "message" && step.result.text.includes("navegación"),
    `3DFLY declara límite: ${step.result?.kind === "message" ? step.result.text : ""}`,
  );
}

// --- 3DSWIVEL ----------------------------------------------------------------
{
  const desc = CAD_COMMAND_REGISTRY_V2.get("3DSWIVEL")!;
  let step = desc.begin(dummyContext);
  assert.ok(step.prompt.message.includes("Girar"), "3DSWIVEL: prompt inicial menciona Girar");
  step = desc.step(step.state, cancel, dummyContext);
  assert.ok(step.result?.kind === "message" && step.result.text.includes("cancelado"), "3DSWIVEL se cancela");
}

// --- 3DSWIVEL: acepta entrada ------------------------------------------------
{
  const desc = CAD_COMMAND_REGISTRY_V2.get("3DSWIVEL")!;
  let step = desc.begin(dummyContext);
  step = desc.step(step.state, { kind: "enter" }, dummyContext);
  assert.ok(
    step.result?.kind === "message" && step.result.text.includes("navegación"),
    `3DSWIVEL declara límite: ${step.result?.kind === "message" ? step.result.text : ""}`,
  );
}

// --- VISUALSTYLES: ofrece opciones de estilo ---------------------------------
{
  const desc = CAD_COMMAND_REGISTRY_V2.get("VISUALSTYLES")!;
  let step = desc.begin(dummyContext);
  assert.ok(step.prompt.options && step.prompt.options.length >= 5, "VISUALSTYLES: ofrece al menos 5 estilos");
  assert.ok(step.prompt.message.includes("estilo"), "VISUALSTYLES: prompt menciona estilo");
  step = desc.step(step.state, cancel, dummyContext);
  assert.ok(step.result?.kind === "message" && step.result.text.includes("cancelado"), "VISUALSTYLES se cancela");
}

// --- VISUALSTYLES: acepta keyword --------------------------------------------
{
  const desc = CAD_COMMAND_REGISTRY_V2.get("VISUALSTYLES")!;
  let step = desc.begin(dummyContext);
  step = desc.step(step.state, { kind: "keyword", keyword: "Alambre" }, dummyContext);
  assert.ok(
    step.result?.kind === "message" && step.result.text.includes("Alambre"),
    `VISUALSTYLES acepta keyword: ${step.result?.kind === "message" ? step.result.text : ""}`,
  );
}

// --- VISUALSTYLES: default a SombreadoConAristas -----------------------------
{
  const desc = CAD_COMMAND_REGISTRY_V2.get("VISUALSTYLES")!;
  let step = desc.begin(dummyContext);
  step = desc.step(step.state, { kind: "enter" }, dummyContext);
  assert.ok(
    step.result?.kind === "message" && step.result.text.includes("SombreadoConAristas"),
    `VISUALSTYLES default: ${step.result?.kind === "message" ? step.result.text : ""}`,
  );
}

console.log("✅ view-visualization.spec: 3DWALK (3) + 3DFLY (3) + 3DSWIVEL (3) + VISUALSTYLES (4) — 13 comprobaciones");
