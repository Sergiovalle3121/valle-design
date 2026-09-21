/**
 * resolveDraftPoint: ORTHO manda sobre OTRACK.
 *
 * Bug medido: con ORTHO encendido y un punto de rastreo en (2000, 37),
 * la línea salía a 1,06° en vez de 0°. La causa era que OTRACK se comprobaba
 * antes que ORTHO. Ahora ORTHO/POLAR es primero.
 */
import { strict as assert } from "node:assert";
import { resolveDraftPoint, type DraftPointInput } from "./draft-point-resolver";

const snapWorld = (v: number) => Math.round(v);

function base(overrides: Partial<DraftPointInput> = {}): DraftPointInput {
  return {
    cursor: { x: 100, y: 100 },
    anchor: { x: 0, y: 0 },
    tolerance: 5,
    ortho: false,
    polar: false,
    polarIncrement: 90,
    objectSnapTracking: false,
    trackingPoints: [],
    snapWorld,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ORTHO tiene prioridad sobre OTRACK
// ---------------------------------------------------------------------------

{
  // El bug original: cursor en (2005, 37), punto de rastreo en x=2000,
  // ORTHO encendido. El resultado debe ser (2005, 0) — la Y se fuerza a 0
  // porque ORTHO impone 0°.
  const r = resolveDraftPoint(base({
    cursor: { x: 2005, y: 37 },
    anchor: { x: 0, y: 0 },
    ortho: true,
    objectSnapTracking: true,
    trackingPoints: [{ x: 2000, y: 0 }],
  }));
  assert.ok(Math.abs(r.y) < 0.01, "ORTHO fuerza Y≈0 aunque OTRACK ofrezca x=2000");
  assert.equal(r.tracking, "ortho", "el tracking reporta ortho");
}

{
  // Con ORTHO apagado, OTRACK sí se aplica.
  const r = resolveDraftPoint(base({
    cursor: { x: 2010, y: 60 },
    anchor: { x: 0, y: 0 },
    tolerance: 20,
    ortho: false,
    objectSnapTracking: true,
    trackingPoints: [{ x: 2000, y: 50 }],
  }));
  assert.equal(r.x, 2000, "OTRACK fija X=2000 sin ORTHO");
  assert.equal(r.tracking, "object", "el tracking reporta object");
}

// ---------------------------------------------------------------------------
// ORTHO a 90°
// ---------------------------------------------------------------------------

{
  // Cursor en (37, 2005), ORTHO encendido → X se fuerza a 0.
  const r = resolveDraftPoint(base({
    cursor: { x: 37, y: 2005 },
    anchor: { x: 0, y: 0 },
    ortho: true,
  }));
  assert.ok(Math.abs(r.x) < 0.01, "ORTHO 90° fuerza X≈0");
  assert.equal(r.tracking, "ortho");
}

// ---------------------------------------------------------------------------
// POLAR a 45°
// ---------------------------------------------------------------------------

{
  // Cursor cerca de45° desde el ancla.
  const r = resolveDraftPoint(base({
    cursor: { x: 100, y: 105 },
    anchor: { x: 0, y: 0 },
    polar: true,
    polarIncrement: 45,
  }));
  assert.equal(r.tracking, "polar", "POLAR fija el punto");
  assert.ok(r.trackingAngle !== undefined, "ángulo reportado");
}

// ---------------------------------------------------------------------------
// Sin ORTHO ni POLAR ni OTRACK: punto crudo
// ---------------------------------------------------------------------------

{
  const r = resolveDraftPoint(base({
    cursor: { x: 123.7, y: 456.3 },
    anchor: { x: 0, y: 0 },
    ortho: false,
    polar: false,
    objectSnapTracking: false,
  }));
  assert.equal(r.x, 124, "snap de rejilla X");
  assert.equal(r.y, 456, "snap de rejilla Y");
  assert.equal(r.tracking, undefined, "sin tracking");
}

// ---------------------------------------------------------------------------
// Sin ancla: ni ORTHO ni POLAR se aplican
// ---------------------------------------------------------------------------

{
  const r = resolveDraftPoint(base({
    cursor: { x: 2010, y: 60 },
    anchor: null,
    tolerance: 20,
    ortho: true,
    objectSnapTracking: true,
    trackingPoints: [{ x: 2000, y: 50 }],
  }));
  assert.equal(r.x, 2000, "sin ancla, OTRACK funciona aunque ORTHO esté encendido");
  assert.equal(r.tracking, "object");
}

console.log("draft-point-resolver.spec: 9 comprobaciones pasaron.");