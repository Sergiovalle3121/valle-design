import { strict as assert } from "node:assert";
import { CAD_DOCUMENT_SCHEMA } from "./cad-document-shared";
import {
  cadDimensionStyleBake,
  resolveCadDimensionStyle,
} from "./dimension-style";
import { readFileSync } from "node:fs";

/*
 * DIMSTYLE GOBIERNA EL DIBUJO, NO SÓLO LA TABLA.
 *
 * El núcleo de ~30 DIMVARs existía entero: se definían, se editaban, se
 * persistían y viajaban por DXF como tabla DIMSTYLE. Pero la ENTIDAD de cota no
 * llevaba encima la altura de texto, ni los colores, ni la posición del rótulo,
 * así que el render no tenía de dónde leerlos y el plano salía IGUAL con
 * cualquier norma de acotación. Para un despacho eso significa que puede fijar
 * su norma y el plano no le hace caso — que es no poder fijarla.
 *
 * Esta spec fija el camino completo: la definición se HORNEA en la entidad, la
 * entidad llega al render, y el DXF la lleva y la trae.
 */

/* ── 1. El horneado emite los siete campos del esquema 10 ─────────────────── */

const norma = resolveCadDimensionStyle(
  {
    text: {},
    dimension: {
      Standard: {},
      "NORMA-DESPACHO": {
        textHeight: 250,
        textStyle: "ROTULO",
        textColor: "#ff0000",
        dimLineColor: "#00ff00",
        extensionLineColor: "#0000ff",
        textVertical: "above",
        textJustification: "first",
        overallScale: 2,
      },
    },
    mleader: {},
    table: {},
  } as never,
  "NORMA-DESPACHO",
);

const baked = cadDimensionStyleBake(norma);

// La ALTURA escala con DIMSCALE, como los demás tamaños: 250 × 2.
assert.equal(baked.textHeight, 500, "DIMTXT se hornea y escala con DIMSCALE");
// Los colores y las posiciones NO son medidas: DIMSCALE no los toca.
assert.equal(baked.textStyle, "ROTULO", "DIMTXSTY se hornea");
assert.equal(baked.textColor, "#ff0000", "DIMCLRT se hornea");
assert.equal(baked.dimLineColor, "#00ff00", "DIMCLRD se hornea");
assert.equal(baked.extensionLineColor, "#0000ff", "DIMCLRE se hornea");
assert.equal(baked.textVertical, "above", "DIMTAD se hornea");
assert.equal(baked.textJustification, "first", "DIMJUST se hornea");

// Un estilo que no declara nada no hornea nada: ausente sigue ausente, y una
// cota que no trae override se sigue dibujando como se dibujaba.
const vacio = cadDimensionStyleBake({});
assert.equal(vacio.textColor, undefined);
assert.equal(vacio.textVertical, undefined);

/* ── 2. El render los CONSUME ─────────────────────────────────────────────── */

const three = readFileSync("src/lib/cad/entity-three.ts", "utf8");
assert.ok(
  three.includes("entity.textHeight ?? (entity.arrowSize ?? 180) * 0.55"),
  "la altura del rótulo sale de DIMTXT, con la fórmula vieja como respaldo",
);
assert.ok(
  !three.includes("height: Math.max(1, (entity.arrowSize ?? 180) * 0.55)"),
  "y ya no se DERIVA del tamaño de flecha, que era el defecto",
);
assert.ok(
  three.includes("cadDimensionTextContext(entity)"),
  "y el color del rótulo (DIMCLRT) llega por el contexto de presentación",
);

/* ── 3. El DXF lo lleva y lo trae ─────────────────────────────────────────── */

const write = readFileSync("src/lib/cad/dxf-write-dimensions.ts", "utf8");
const read = readFileSync("src/lib/cad/dxf-read-annotations.ts", "utf8");
for (const key of [
  "textHeight",
  "textStyle",
  "textColor",
  "dimLineColor",
  "extensionLineColor",
  "textVertical",
  "textJustification",
]) {
  assert.ok(write.includes(`${key}=`), `el DXF ESCRIBE ${key}`);
  assert.ok(read.includes(`"${key}"`), `y el DXF LEE ${key}`);
}

/*
 * La altura vuelve ESCALADA por la proyección, porque es una medida; los
 * colores y las posiciones vuelven tal cual, porque no lo son. Confundirlos
 * haría que importar un DXF en pulgadas cambiara el color del rótulo.
 */
const toEntities = readFileSync("src/lib/cad/dxf-cad-document.ts", "utf8");
assert.ok(
  toEntities.includes("cadSchema10ScaledFields(dimension, scaleFactor)"),
  "la altura importada pasa por el escalado del esquema 10",
);
/*
 * Y la REGLA de qué escala vive en `cad-entities-v10.ts`, no en el importador:
 * es una regla del esquema, no del formato. Quien añada un campo al v10 tiene
 * que decidirlo allí, y allí está la única multiplicación.
 */
const v10 = readFileSync("src/lib/cad/cad-entities-v10.ts", "utf8");
assert.ok(
  v10.includes("textHeight: source.textHeight * scaleFactor"),
  "la altura escala con la proyección",
);
for (const noEsMedida of [
  "textColor",
  "dimLineColor",
  "extensionLineColor",
  "textVertical",
  "textJustification",
  "textStyle",
]) {
  assert.ok(
    !v10.includes(`${noEsMedida} * scaleFactor`),
    `${noEsMedida} no es una medida y no puede multiplicarse por nada`,
  );
}

/* ── 4. La subida de esquema es ADITIVA y está declarada ──────────────────── */

assert.equal(CAD_DOCUMENT_SCHEMA, 10, "los DIMVARs de dibujo estrenan el v10");
const shared = readFileSync("src/lib/cad/cad-document-shared.ts", "utf8");
assert.ok(
  shared.includes("v10 estrena los DIMVARs"),
  "y la subida está explicada donde viven las demás",
);
assert.ok(
  shared.includes("Todo aditivo, en las siete subidas"),
  "declarada como aditiva, igual que las seis anteriores",
);

console.log(
  "dimension-style-governs-drawing.spec: OK — DIMTXT, DIMTXSTY, DIMCLRT/D/E, DIMTAD y DIMJUST horneados, renderizados y con ida y vuelta por DXF",
);
