/** Tests de precision-input (Fase 66). npx tsx src/lib/cad/precision-input.spec.ts */
import {
  parseCoordinate,
  constrainPoint,
  polarPoint,
  angleDeg,
  distance,
  normalizeDeg,
  Point,
} from "./precision-input";

let passed = 0;
const fails: string[] = [];
const ok = (cond: boolean, m: string) => {
  if (cond) passed++;
  else fails.push(m);
};
const near = (a: number, b: number, t = 1e-6) => Math.abs(a - b) < t;
const nearP = (p: Point, x: number, y: number, t = 1e-6) =>
  near(p.x, x, t) && near(p.y, y, t);

// ── helpers geométricos ──
ok(normalizeDeg(-45) === 315, "normalizeDeg(-45) = 315");
ok(normalizeDeg(450) === 90, "normalizeDeg(450) = 90");
ok(near(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5), "distance 3-4-5");
ok(near(angleDeg({ x: 0, y: 0 }, { x: 1, y: 1 }), 45), "angleDeg 45°");
ok(near(angleDeg({ x: 0, y: 0 }, { x: -1, y: 0 }), 180), "angleDeg 180°");
ok(
  nearP(polarPoint({ x: 0, y: 0 }, 10, 90), 0, 10),
  "polarPoint 10<90 = (0,10)",
);

// ── parseCoordinate: absoluto ──
{
  const r = parseCoordinate("10,20");
  ok(r.ok && r.mode === "absolute" && nearP(r.point, 10, 20), "absoluto 10,20");
}
{
  const r = parseCoordinate("  10 , 20 ");
  ok(r.ok && nearP(r.point, 10, 20), "absoluto tolera espacios");
}

// ── x,y,z: la cota tecleada (Ola C, 2026-09-02) ──
{
  const r = parseCoordinate("0,0,3000");
  ok(r.ok && r.mode === "absolute" && nearP(r.point, 0, 0) && (r.point as { z?: number }).z === 3000, "absoluto 0,0,3000 lleva la cota");
}
{
  const r = parseCoordinate("10,20");
  ok(r.ok && !("z" in r.point), "sin tercera componente no se inventa una z");
}
{
  const r = parseCoordinate("@0,0,3000", { last: { x: 10, y: 10 } });
  ok(r.ok && r.mode === "relative" && nearP(r.point, 10, 10) && (r.point as { z?: number }).z === 3000, "relativo @0,0,3000 sube 3000 desde el último punto");
}
{
  const r = parseCoordinate("@5,5", { last: { x: 10, y: 10, z: 3000 } as Point });
  ok(r.ok && nearP(r.point, 15, 15) && (r.point as { z?: number }).z === 3000, "relativo sin z conserva la cota del último punto");
}
ok(!parseCoordinate("1,2,x").ok, "una z que no es número se rechaza");
ok(!parseCoordinate("1,2,3,4").ok, "cuatro componentes se rechazan");

// ── relativo @dx,dy ──
{
  const r = parseCoordinate("@5,-3", { last: { x: 10, y: 10 } });
  ok(
    r.ok && r.mode === "relative" && nearP(r.point, 15, 7),
    "relativo @5,-3 desde (10,10)",
  );
}
{
  const r = parseCoordinate("@5,3");
  ok(!r.ok, "relativo sin last → error");
}

// ── polar ──
{
  const r = parseCoordinate("30<45");
  ok(
    r.ok &&
      r.mode === "polar-absolute" &&
      nearP(r.point, 30 * Math.cos(Math.PI / 4), 30 * Math.sin(Math.PI / 4)),
    "polar absoluto 30<45",
  );
}
{
  const r = parseCoordinate("@10<90", { last: { x: 5, y: 5 } });
  ok(
    r.ok && r.mode === "polar-relative" && nearP(r.point, 5, 15),
    "polar relativo @10<90 desde (5,5)",
  );
}
{
  const r = parseCoordinate("abc<def");
  ok(!r.ok, "polar inválido → error");
}

// ── entrada directa de distancia ──
{
  const r = parseCoordinate("25", { last: { x: 0, y: 0 }, lockedAngleDeg: 0 });
  ok(
    r.ok && r.mode === "direct" && nearP(r.point, 25, 0),
    "directa 25 por ángulo 0",
  );
}
{
  const r = parseCoordinate("25", { last: { x: 0, y: 0 } });
  ok(!r.ok, "directa sin ángulo bloqueado ni cursor → error");
}
// F4 (T-Ola3): sin ORTHO/POLAR ni `<ángulo`, el CURSOR da la dirección — como
// AutoCAD, que no exige ortho para la entrada directa de distancia.
{
  const r = parseCoordinate("25", { last: { x: 0, y: 0 }, cursor: { x: 10, y: 0 } });
  ok(r.ok && r.mode === "direct" && nearP(r.point, 25, 0), "directa 25 por el cursor, sin ortho");
}
{
  const r = parseCoordinate("10", { last: { x: 5, y: 5 }, cursor: { x: 5, y: 15 } });
  ok(r.ok && r.mode === "direct" && nearP(r.point, 5, 15), "directa 10 hacia el cursor en (5,15): cae en (5,15)");
}
{
  // El ángulo BLOQUEADO manda sobre el cursor, aunque el cursor apunte a otro lado.
  const r = parseCoordinate("10", { last: { x: 0, y: 0 }, lockedAngleDeg: 90, cursor: { x: 10, y: 0 } });
  ok(r.ok && r.mode === "direct" && nearP(r.point, 0, 10), "el ángulo bloqueado gana al cursor");
}
{
  // El cursor EN el punto previo no da dirección: no se inventa un ángulo.
  const r = parseCoordinate("10", { last: { x: 3, y: 3 }, cursor: { x: 3, y: 3 } });
  ok(!r.ok, "cursor pegado al punto previo → sin dirección, error");
}
{
  const r = parseCoordinate("");
  ok(!r.ok, "vacío → error");
}

// ── constrainPoint: ortho ──
{
  const c = constrainPoint({ x: 0, y: 0 }, { x: 10, y: 2 }, { ortho: true });
  ok(
    c.snapped && c.angleDeg === 0 && nearP(c.point, Math.hypot(10, 2), 0),
    "ortho fuerza al eje X manteniendo distancia",
  );
}
{
  const c = constrainPoint({ x: 0, y: 0 }, { x: 2, y: 10 }, { ortho: true });
  ok(c.angleDeg === 90, "ortho elige eje Y cuando domina");
}

// ── constrainPoint: polar 45° ──
{
  const c = constrainPoint(
    { x: 0, y: 0 },
    { x: 10, y: 9 },
    { polarIncrementDeg: 45 },
  );
  ok(c.snapped && c.angleDeg === 45, "polar 45° ajusta ~45");
}
{
  const c = constrainPoint({ x: 0, y: 0 }, { x: 10, y: 1 }, {});
  ok(!c.snapped, "sin restricción no ajusta");
}

// ── La coma separa coordenadas, como en AutoCAD (nunca es decimal) ──
{
  const r = parseCoordinate("4,325");
  ok(r.ok && r.mode === "absolute" && nearP(r.point, 4, 325), "4,325 es el punto (4, 325)");
}
{
  const r = parseCoordinate("5,300");
  ok(r.ok && nearP(r.point, 5, 300), "5,300 es el punto (5, 300)");
}
{
  const r = parseCoordinate("4,325.5");
  ok(r.ok && r.mode === "absolute" && nearP(r.point, 4, 325.5), "4,325.5 sigue siendo coordenada (la coma separa)");
}
{
  const r = parseCoordinate("10,20");
  ok(r.ok && nearP(r.point, 10, 20), "10,20 sigue siendo coordenada (segunda parte <3 dígitos)");
}
{
  const r = parseCoordinate("@1,500", { last: { x: 10, y: 10 } });
  ok(r.ok && nearP(r.point, 11, 510), "@1,500 es relativo al último punto");
}

if (fails.length) {
  console.log(`❌ ${passed}/${passed + fails.length}`);
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
console.log(`✅ ${passed}/${passed} precision-input`);
