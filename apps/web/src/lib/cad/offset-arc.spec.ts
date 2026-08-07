/**
 * OFFSET rechazaba los ARCOS, y el arco es la curva que más se desfasa en 2D.
 *
 * EL HUECO. `offsetCanonicalEntity` admitía línea, polilínea sin arcos y
 * círculo, y devolvía `unsupported-entity` para todo lo demás — incluido `arc`,
 * que en este CAD es entidad de primera clase: se dibuja, se selecciona, tiene
 * grips y snaps propios, y va y viene por DXF. Desfasar un arco es elemental en
 * cualquier CAD 2D serio (un muro curvo, un carril, un radio de giro), y aquí
 * el usuario recibía "OFFSET sólo admite líneas, polilíneas y círculos".
 *
 * POR QUÉ ES EXACTO Y NO UNA APROXIMACIÓN. El offset de un arco de circunferencia
 * ES otro arco de circunferencia: mismo centro, mismos ángulos, radio ± la
 * distancia. No hay tesela, ni polilínea que lo sustituya, ni pérdida de forma.
 * Es el mismo caso que el círculo, que ya estaba implementado — un círculo es
 * exactamente un arco de 360°.
 *
 * LO QUE SIGUE RECHAZÁNDOSE, y con razón: la ELIPSE. El offset de una elipse NO
 * es una elipse —es una curva paralela que el esquema no sabe representar— así
 * que devolverla como elipse cambiaría la forma en silencio. Y la polilínea con
 * `bulge`, cuyo offset exige resolver esquinas arco-recta y arco-arco: sigue
 * siendo un rechazo declarado, no un arreglo a medias.
 */
import { strict as assert } from "node:assert";
import {
  offsetCanonicalEntity,
  OFFSET_REJECTION_MESSAGE,
} from "./draw-action-entities";
import type { CadEntity } from "./cad-document";

type CadArc = Extract<CadEntity, { type: "arc" }>;

const ARC: CadArc = {
  id: "arco-1",
  type: "arc",
  center: { x: 1_000, y: 2_000, z: 0 },
  radius: 500,
  startAngle: 30,
  endAngle: 150,
  layer: "MUROS",
};

let counter = 0;
const nextId = () => `nuevo-${++counter}`;

function offsetArc(entity: CadArc, distance: number) {
  const result = offsetCanonicalEntity(entity, distance, nextId);
  assert.ok(result.ok, `se esperaba éxito, llegó ${result.ok ? "" : result.reason}`);
  assert.equal(result.entity.type, "arc", "el offset de un arco ES un arco");
  return result.entity as CadArc;
}

// ---------------------------------------------------------------------------
// El offset de un arco es un arco CONCÉNTRICO, exacto
// ---------------------------------------------------------------------------

{
  const wider = offsetArc(ARC, 120);
  assert.equal(wider.radius, 620, "radio + distancia, sin más");
  assert.deepEqual(
    wider.center,
    ARC.center,
    "el centro NO se mueve: por eso es exacto y no una aproximación",
  );
  assert.equal(wider.startAngle, 30, "y los ángulos son los mismos arcos");
  assert.equal(wider.endAngle, 150);
  assert.equal(wider.layer, "MUROS", "conserva su capa");
  assert.notEqual(wider.id, ARC.id, "es una entidad NUEVA, como el resto de OFFSET");
}

{
  // Hacia dentro: distancia negativa, igual que el círculo.
  const tighter = offsetArc(ARC, -200);
  assert.equal(tighter.radius, 300);
  assert.deepEqual(tighter.center, ARC.center);
  assert.equal(tighter.startAngle, 30);
  assert.equal(tighter.endAngle, 150);
}

{
  // Un arco que cruza el origen de ángulos no es un caso especial: los
  // ángulos viajan tal cual, así que no hay normalización que pueda torcerlo.
  const crossing: CadArc = { ...ARC, startAngle: 300, endAngle: 60 };
  const moved = offsetArc(crossing, 50);
  assert.equal(moved.startAngle, 300);
  assert.equal(moved.endAngle, 60);
  assert.equal(moved.radius, 550);
}

// ---------------------------------------------------------------------------
// Lo que NO puede pasar
// ---------------------------------------------------------------------------

{
  // Un radio que se anula o se vuelve negativo no es un arco. Mismo criterio
  // que el círculo: rechazo explícito, no geometría inventada.
  const collapsed = offsetCanonicalEntity(ARC, -500, nextId);
  assert.equal(collapsed.ok, false);
  assert.equal(
    collapsed.ok === false && collapsed.reason,
    "impossible-result",
    "colapsar al centro se rechaza con el motivo del colapso",
  );

  const inverted = offsetCanonicalEntity(ARC, -700, nextId);
  assert.equal(inverted.ok, false);
  assert.equal(inverted.ok === false && inverted.reason, "impossible-result");
}

{
  // Geometría degenerada: radio no finito o centro no finito.
  const broken = offsetCanonicalEntity(
    { ...ARC, radius: Number.NaN },
    100,
    nextId,
  );
  assert.equal(broken.ok, false);
  assert.equal(broken.ok === false && broken.reason, "degenerate-geometry");
}

{
  // Distancia cero o no finita: sigue siendo el rechazo de siempre.
  assert.equal(offsetCanonicalEntity(ARC, 0, nextId).ok, false);
  const zero = offsetCanonicalEntity(ARC, 0, nextId);
  assert.equal(zero.ok === false && zero.reason, "invalid-distance");
}

// ---------------------------------------------------------------------------
// La ELIPSE sigue rechazada, y eso es correcto
// ---------------------------------------------------------------------------

{
  const ellipse: CadEntity = {
    id: "elipse-1",
    type: "ellipse",
    center: { x: 0, y: 0, z: 0 },
    majorAxis: { x: 400, y: 0, z: 0 },
    ratio: 0.5,
    startParameter: 0,
    endParameter: 360,
    layer: "0",
  };
  const rejected = offsetCanonicalEntity(ellipse, 50, nextId);
  assert.equal(
    rejected.ok,
    false,
    "el offset de una elipse NO es una elipse: devolverla como tal cambiaría la forma en silencio",
  );
  assert.equal(rejected.ok === false && rejected.reason, "unsupported-entity");
}

// El mensaje al usuario tiene que nombrar lo que SÍ admite, o miente.
assert.match(
  OFFSET_REJECTION_MESSAGE["unsupported-entity"],
  /arco/i,
  "si OFFSET ya admite arcos, el mensaje de rechazo tiene que decirlo",
);

console.log(
  "offset: un arco se desfasa a un arco concéntrico exacto; la elipse y los bulges siguen rechazados a propósito",
);
