import assert from "node:assert/strict";
import {
  CAD_TEXT_ATLAS_DEFAULT_SIZE,
  CadGlyphAtlas,
  buildCadTextQuads,
  cadLegacySpriteBytes,
  cadTextAtlasStats,
  type CadGlyphMetrics,
  type CadGlyphSource,
} from "./text-atlas";
import { unpackCadColor } from "./line-batch";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

/**
 * Fuente sintética monoespaciada: avance 0,6 em, recuadro de 0,5 × 0,7 em
 * rasterizado a 32 × 45 px. El espacio avanza sin recuadro.
 */
const monospace: CadGlyphSource = {
  key: (character, fontKey) => `${fontKey}:${character}`,
  metrics: (character): CadGlyphMetrics | null => {
    if (character === "\n") return null;
    if (character === " ")
      return {
        advance: 0.6,
        bearingX: 0,
        bearingY: 0,
        emWidth: 0,
        emHeight: 0,
        pixelWidth: 0,
        pixelHeight: 0,
      };
    return {
      advance: 0.6,
      bearingX: 0.05,
      bearingY: 0,
      emWidth: 0.5,
      emHeight: 0.7,
      pixelWidth: 32,
      pixelHeight: 45,
    };
  },
};

// ---------------------------------------------------------------------------
// Asignador por estanterías: coordenadas exactas, no «algo dentro del atlas».
// ---------------------------------------------------------------------------
const atlas = new CadGlyphAtlas(100, 1);
const first = atlas.allocate("f:A", 30, 40);
assert.deepEqual(
  { x: first?.x, y: first?.y, width: first?.width, height: first?.height },
  { x: 1, y: 1, width: 30, height: 40 },
  "el primer glifo entra con un píxel de padding en las dos direcciones",
);
assert.equal(first?.u0, 0.01);
assert.equal(first?.u1, 0.31);
const second = atlas.allocate("f:B", 30, 40);
assert.equal(second?.x, 33, "el segundo va a la derecha del primero, padding incluido");
assert.equal(second?.y, 1, "y en la misma estantería");
const third = atlas.allocate("f:C", 30, 40);
assert.equal(third?.x, 65);
// El cuarto ya no cabe a lo ancho (65+32+32 > 100): estantería nueva.
const fourth = atlas.allocate("f:D", 30, 40);
assert.equal(fourth?.x, 1, "el cuarto abre estantería");
assert.equal(fourth?.y, 43, "bajando la altura de la estantería anterior");
ok(true, "el empaquetado por estanterías coloca en (1,1), (33,1), (65,1) y salta a (1,43)");

// Reasignar la misma clave devuelve el MISMO hueco: un glifo se rasteriza una
// vez por documento, que es el punto entero del atlas.
assert.deepEqual(atlas.allocate("f:A", 30, 40), first);
assert.equal(atlas.glyphCount, 4, "reasignar no crea hueco nuevo");
ok(true, "un glifo repetido reutiliza su hueco");

// Atlas lleno: devuelve null en vez de escribir fuera o crecer en silencio.
const tiny = new CadGlyphAtlas(20, 0);
assert.ok(tiny.allocate("x", 10, 10) !== null);
assert.equal(tiny.allocate("y", 30, 10), null, "un glifo más ancho que el atlas no cabe");
tiny.allocate("z", 10, 10);
assert.equal(tiny.allocate("w", 10, 15), null, "y cuando se acaba la altura, tampoco");
ok(true, "el asignador dice que no cabe en vez de desbordar");

assert.throws(() => new CadGlyphAtlas(0), /size must be positive/);
assert.throws(() => new CadGlyphAtlas(64, -1), /padding cannot be negative/);
ok(true, "las guardas del atlas rechazan tamaño y padding inválidos");

// ---------------------------------------------------------------------------
// Quads: posiciones EXACTAS sin rotación, y rotación de 90° comprobada punto a
// punto. Una propiedad de ida y vuelta se cumpliría sola si nadie rotase nada.
// ---------------------------------------------------------------------------
const flat = new CadGlyphAtlas(CAD_TEXT_ATLAS_DEFAULT_SIZE);
const straight = buildCadTextQuads(
  [{ text: "AB", fontKey: "arial", fontSize: 10, x: 100, y: 50, color: 0xff8800, depth: 0.5 }],
  flat,
  monospace,
);
assert.equal(straight.instanceCount, 2);
assert.equal(straight.droppedGlyphs, 0);
// Primer glifo: bearingX 0,05 em × 10 = 0,5 de desplazamiento.
assert.deepEqual([...straight.instanceOrigin.slice(0, 2)], [100.5, 50]);
// Segundo: avance 0,6 em × 10 = 6, más el mismo bearing.
assert.deepEqual([...straight.instanceOrigin.slice(2, 4)], [106.5, 50]);
assert.deepEqual([...straight.instanceRight.slice(0, 2)], [5, 0], "0,5 em × 10 unidades de ancho");
assert.deepEqual([...straight.instanceUp.slice(0, 2)], [0, -7], "0,7 em × 10 unidades de alto, reflejado en Y");
assert.equal(straight.instanceStyle[0], 0xff8800);
assert.ok(Math.abs(straight.instanceStyle[1] - 0.5) < 1e-6, "la profundidad viaja por glifo");
assert.deepEqual(unpackCadColor(straight.instanceStyle[0]), { r: 0xff, g: 0x88, b: 0x00 });
ok(true, "sin rotación los quads salen en 100,5 y 106,5 con recuadro 5 × 7");

// La Y de PANTALLA va al revés que la del dibujo (`yScreenSign: 1`, la
// convención actual del producto), así que el marco local del glifo se refleja
// en Y: el vector de altura apunta a −Y del mundo, que en pantalla es ARRIBA.
// Con sprites esto no importaba porque miran siempre a la cámara; con quads en
// el plano del dibujo, sin reflejar, el texto saldría del revés.
assert.equal(straight.instanceUp[1], -7, "con Y de pantalla hacia abajo, el alto apunta a −Y del mundo");
const upright = buildCadTextQuads(
  [{ text: "A", fontKey: "arial", fontSize: 10, x: 0, y: 0, color: 0, depth: 0 }],
  flat,
  monospace,
  { yScreenSign: -1 },
);
assert.equal(upright.instanceUp[1], 7, "con la convención de AutoCAD el alto apunta a +Y");
// Con un glifo que baja de la línea base (bearingY negativo) el origen también
// se refleja: es lo que coloca la cola de la «p» al lado correcto.
const descender: CadGlyphSource = {
  key: (character, fontKey) => `desc:${fontKey}:${character}`,
  metrics: () => ({
    advance: 0.6,
    bearingX: 0,
    bearingY: -0.2,
    emWidth: 0.5,
    emHeight: 0.9,
    pixelWidth: 32,
    pixelHeight: 58,
  }),
};
const request = { text: "p", fontKey: "arial", fontSize: 10, x: 0, y: 0, color: 0, depth: 0 };
const down = buildCadTextQuads([request], flat, descender, { yScreenSign: 1 });
const up2 = buildCadTextQuads([request], flat, descender, { yScreenSign: -1 });
assert.equal(up2.instanceOrigin[1], -2, "con Y hacia arriba la cola baja a −2");
assert.equal(down.instanceOrigin[1], 2, "con Y hacia abajo se refleja a +2");
assert.equal(up2.instanceUp[1], 9);
assert.equal(down.instanceUp[1], -9);
ok(true, "el reflejo por yScreenSign invierte el vector de altura y el origen del glifo");

const rotated = buildCadTextQuads(
  [{ text: "A", fontKey: "arial", fontSize: 10, x: 0, y: 0, rotationDeg: 90, color: 0, depth: 0 }],
  flat,
  monospace,
);
const near = (value: number, expected: number) => Math.abs(value - expected) < 1e-6;
assert.ok(near(rotated.instanceOrigin[0], 0) && near(rotated.instanceOrigin[1], 0.5),
  `a 90° el bearing horizontal se convierte en vertical: ${rotated.instanceOrigin[0]}, ${rotated.instanceOrigin[1]}`);
assert.ok(near(rotated.instanceRight[0], 0) && near(rotated.instanceRight[1], 5),
  "el vector de anchura apunta a +Y");
assert.ok(near(rotated.instanceUp[0], 7) && near(rotated.instanceUp[1], 0),
  "y el de altura a +X, que es el reflejo en Y del marco ya girado");
ok(true, "una rotación de 90° gira los dos vectores del quad, no sólo el origen");

// Los ejes siguen siendo perpendiculares y con la longitud correcta a 37°.
const oblique = buildCadTextQuads(
  [{ text: "A", fontKey: "arial", fontSize: 4, x: 0, y: 0, rotationDeg: 37, color: 0, depth: 0 }],
  flat,
  monospace,
);
const dot =
  oblique.instanceRight[0] * oblique.instanceUp[0] +
  oblique.instanceRight[1] * oblique.instanceUp[1];
assert.ok(Math.abs(dot) < 1e-5, `los ejes del quad deben seguir siendo perpendiculares: ${dot}`);
assert.ok(near(Math.hypot(oblique.instanceRight[0], oblique.instanceRight[1]), 2));
assert.ok(near(Math.hypot(oblique.instanceUp[0], oblique.instanceUp[1]), 2.8));
ok(true, "a 37° el quad conserva ortogonalidad y longitudes de 2 × 2,8");

// El espacio avanza sin gastar atlas ni instancia.
const spaced = buildCadTextQuads(
  [{ text: "A B", fontKey: "arial", fontSize: 10, x: 0, y: 0, color: 0, depth: 0 }],
  flat,
  monospace,
);
assert.equal(spaced.instanceCount, 2, "el espacio no emite quad");
assert.deepEqual([...spaced.instanceOrigin.slice(2, 4)], [12.5, 0], "pero sí avanza dos posiciones");
ok(true, "el espacio avanza la pluma sin ocupar hueco de atlas");

// Un carácter sin métricas se ignora sin romper la cadena.
const withNewline = buildCadTextQuads(
  [{ text: "A\nB", fontKey: "arial", fontSize: 10, x: 0, y: 0, color: 0, depth: 0 }],
  flat,
  monospace,
);
assert.equal(withNewline.instanceCount, 2);
ok(true, "un carácter sin métricas se salta en vez de emitir un quad basura");

// ---------------------------------------------------------------------------
// LA RAZÓN DE SER: la memoria deja de escalar con el número de rótulos.
// ---------------------------------------------------------------------------
const shared = new CadGlyphAtlas(CAD_TEXT_ATLAS_DEFAULT_SIZE);
const labels = Array.from({ length: 2_000 }, (_, index) => ({
  text: `COTA ${index % 10}`,
  fontKey: "arial",
  fontSize: 12,
  x: index * 20,
  y: 0,
  color: 0xe2e8f0,
  depth: 0,
}));
const many = buildCadTextQuads(labels, shared, monospace);
const stats = cadTextAtlasStats(shared, many);
assert.equal(many.droppedGlyphs, 0, "ni un glifo se cae del atlas");
assert.equal(
  stats.glyphs,
  14,
  "2.000 rótulos usan 14 glifos distintos: C, O, T, A y los dígitos 0-9; el espacio no gasta hueco",
);
// El pipeline anterior: un canvas RGBA por rótulo, con la misma aritmética de
// `buildCadMTextSprite` (1.024 px de ancho lógico, alto proporcional).
const legacyBytes = cadLegacySpriteBytes(labels.map(() => ({ widthPx: 1_024, heightPx: 512 })));
const nextBytes = stats.atlasBytes + stats.attributeBytes;
assert.ok(
  nextBytes * 100 < legacyBytes,
  `el atlas debe ser dos órdenes de magnitud menor: ${nextBytes} frente a ${legacyBytes}`,
);
assert.ok(stats.atlasUsedRatio < 0.05, `15 glifos no llenan el atlas: ${stats.atlasUsedRatio}`);
ok(
  true,
  `2.000 rótulos: ${(legacyBytes / 1_048_576).toFixed(0)} MiB con un canvas por rótulo frente a ${(nextBytes / 1_048_576).toFixed(2)} MiB con atlas compartido`,
);

// Y añadir 20.000 rótulos MÁS con el mismo alfabeto no añade ni un glifo.
const before = shared.glyphCount;
buildCadTextQuads(
  Array.from({ length: 20_000 }, (_, index) => ({
    text: `COTA ${index % 10}`,
    fontKey: "arial",
    fontSize: 12,
    x: index,
    y: 0,
    color: 0,
    depth: 0,
  })),
  shared,
  monospace,
);
assert.equal(shared.glyphCount, before, "la memoria del atlas no crece con el número de rótulos");
ok(true, "20.000 rótulos más no añaden ni un glifo al atlas");

console.log(
  `text-atlas: ${checks} comprobaciones verdes — 22.000 rótulos caben en ${shared.glyphCount} glifos y ${(nextBytes / 1_048_576).toFixed(2)} MiB frente a los ${(legacyBytes / 1_048_576).toFixed(0)} MiB que gastaba un canvas por MTEXT. Sin campo de distancia: los glifos se magnifican con filtrado bilineal y se ablandan por encima de ~3× el tamaño rasterizado.`,
);
