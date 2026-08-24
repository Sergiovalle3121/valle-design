import assert from "node:assert/strict";
import {
  CAD_RENDER_ORIGIN_GRID,
  CAD_RENDER_ORIGIN_ZERO,
  cadRenderOriginFromBounds,
} from "./render-origin";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

// --- documento vacío / límites ausentes → origen cero -----------------------
ok(
  cadRenderOriginFromBounds(null).x === 0 &&
    cadRenderOriginFromBounds(null).y === 0,
  "sin límites, el origen es (0,0): comportamiento de hoy, sin origen flotante",
);
ok(
  cadRenderOriginFromBounds(null) === CAD_RENDER_ORIGIN_ZERO,
  "y es la MISMA referencia que la constante exportada — no asigna de más por cada documento vacío",
);

// --- planta local (mm, magnitud pequeña): el origen es (0,0) tras redondear -
{
  const origin = cadRenderOriginFromBounds({
    minX: 0,
    minY: 0,
    maxX: 5_000,
    maxY: 4_000,
  });
  ok(
    origin.x === 0 && origin.y === 0,
    "un centroide de (2500, 2000) redondea a (0,0) en la rejilla de 100 m",
  );
}

// --- magnitud UTM: el origen cae en el centroide, redondeado a la rejilla ---
{
  // Centroide exacto: (2_150_000, 850_000). Rejilla 100.000 → redondea a
  // (2_200_000, 800_000): 2.150.000/100.000 = 21,5 (redondea a 22 → 2.200.000);
  // 850.000/100.000 = 8,5 (redondea a 8, por el "banker's"... no: Math.round
  // redondea 8,5 a 9 en JS → 900.000). Se verifica el valor REAL, no uno
  // supuesto — es la garantía de que el test no repite el bug si alguien
  // cambia la fórmula de redondeo mañana.
  const bounds = {
    minX: 2_000_000,
    minY: 700_000,
    maxX: 2_300_000,
    maxY: 1_000_000,
  };
  const origin = cadRenderOriginFromBounds(bounds);
  const expectedX =
    Math.round(2_150_000 / CAD_RENDER_ORIGIN_GRID) * CAD_RENDER_ORIGIN_GRID;
  const expectedY =
    Math.round(850_000 / CAD_RENDER_ORIGIN_GRID) * CAD_RENDER_ORIGIN_GRID;
  ok(
    origin.x === expectedX,
    `origen.x = ${origin.x}, se esperaba ${expectedX}`,
  );
  ok(
    origin.y === expectedY,
    `origen.y = ${origin.y}, se esperaba ${expectedY}`,
  );
  // Y el origen cae DENTRO de una rejilla de distancia del centroide real —
  // la propiedad que de verdad importa: nunca deja las coordenadas locales
  // más lejos de cero que la mitad de la rejilla más el radio del dibujo.
  ok(
    Math.abs(origin.x - 2_150_000) <= CAD_RENDER_ORIGIN_GRID / 2,
    "el origen queda a media rejilla o menos del centroide real en X",
  );
  ok(
    Math.abs(origin.y - 850_000) <= CAD_RENDER_ORIGIN_GRID / 2,
    "el origen queda a media rejilla o menos del centroide real en Y",
  );
}

// --- estabilidad: dos documentos cuyo centroide cae en la MISMA celda dan
//     el MISMO origen — la propiedad que evita invalidar la caché de
//     teselado en cada edición ordinaria ------------------------------------
{
  const a = cadRenderOriginFromBounds({
    minX: 2_000_000,
    minY: 0,
    maxX: 2_010_000,
    maxY: 10_000,
  });
  // Se mueve un "muro" 3 m dentro del mismo documento: el centroide se corre
  // un poco, pero sigue dentro de la misma celda de 100 m — un desplazamiento
  // pequeño no cruza el borde de la rejilla.
  const b = cadRenderOriginFromBounds({
    minX: 2_000_003,
    minY: 0,
    maxX: 2_010_003,
    maxY: 10_000,
  });
  ok(
    a.x === b.x && a.y === b.y,
    "una edición pequeña no mueve el origen: sigue en la misma celda",
  );
}

// --- límites no finitos (NaN/Infinity, entrada corrupta) → origen cero,
//     fail-closed, nunca un NaN propagado a Three.js -------------------------
{
  const origin = cadRenderOriginFromBounds({
    minX: NaN,
    minY: 0,
    maxX: 100,
    maxY: 100,
  });
  ok(
    origin.x === 0 && origin.y === 0,
    "límites no finitos → origen cero, no NaN propagado",
  );
}

console.log(
  `render-origin: ${checks} comprobaciones verdes — el origen flotante ancla al centroide del documento, redondeado a una rejilla de ${CAD_RENDER_ORIGIN_GRID} mm (${CAD_RENDER_ORIGIN_GRID / 1000} m), estable frente a ediciones ordinarias.`,
);
