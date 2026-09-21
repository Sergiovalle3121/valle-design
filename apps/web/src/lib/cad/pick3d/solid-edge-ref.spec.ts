/**
 * solid-edge-ref.ts: huellas de arista y resolución.
 *
 * Verifica que una arista se reconoce a sí misma tras re-evaluar el cuerpo,
 * y que una arista movida se cura o se rechaza correctamente.
 */
import { makeBox, vec3 } from "../../brep";
import { check, report } from "../../brep/spec-support";
import { cadEdgeRefFromBody, resolveCadEdgeRef } from "./solid-edge-ref";

{
  const body = makeBox({ min: vec3(0, 0, 0), max: vec3(100, 100, 100) });

  // 1. La arista 0 se reconoce a sí misma
  const ref = cadEdgeRefFromBody(body, 0);
  const resolved = resolveCadEdgeRef(ref, body);
  check("edge-ref: arista 0 se reconoce", resolved.ok === true, `ok=${resolved.ok}`);
  if (resolved.ok) {
    check("edge-ref: misma arista, no healed", resolved.edge === 0 && !resolved.healed, `edge=${resolved.edge}, healed=${resolved.healed}`);
  }

  // 2. Una referencia con edge=-1 (inválido) aún encuentra la arista por huella
  const refBadIndex = { ...ref, edge: -1 };
  const healed = resolveCadEdgeRef(refBadIndex, body);
  check("edge-ref: cura índice inválido", healed.ok === true, `ok=${healed.ok}`);
  if (healed.ok) {
    check("edge-ref: healed=true", healed.healed === true, `healed=${healed.healed}`);
  }

  // 3. Una referencia con coordenadas imposibles no encuentra nada
  const refBad = { ...ref, fromX: 99999, fromY: 99999, fromZ: 99999, toX: 99999, toY: 99999, toZ: 99999 };
  const failed = resolveCadEdgeRef(refBad, body);
  check("edge-ref: rechaza coordenadas imposibles", failed.ok === false, `ok=${failed.ok}`);
}

report("edge-ref");
