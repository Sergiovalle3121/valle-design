/**
 * EL SENTIDO DEL GIRO DE UN RÓTULO, MEDIDO CONTRA EL ARCHIVO.
 *
 * ## Qué estaba mal
 *
 * Un rótulo vertical —el nombre de una fachada, la cota de un muro de
 * carga— se guarda con `rotation: 90`, que en DXF (y en el dibujo) es
 * antihorario con la Y hacia arriba: se lee HACIA ARRIBA. El plan de
 * publicación conserva ese número tal cual y voltea la geometría al pasar al
 * papel (`viewportTransform`, `d: -factor`). El emisor de PDF negaba además el
 * ángulo, así que el mismo rótulo salía leyéndose HACIA ABAJO, y la previa SVG
 * hacía lo mismo — mientras el PDF del conjunto de planos (`sheet-set-pdf.ts`)
 * usaba el signo correcto. Dos caminos, dos resultados, para el mismo dibujo.
 *
 * ## Cómo se mide aquí
 *
 * No se mira el código: se emite el PDF sin comprimir y se lee la matriz `Tm`
 * que el archivo lleva escrita. Un rótulo que se lee hacia arriba tiene `b > 0`
 * en esa matriz (el avance sube por la página), y uno que se lee hacia abajo la
 * tiene negativa. Y para que no quede duda de que el papel y el dibujo miran
 * igual, se comprueba a la vez que un segmento que en el plan sube (Y menor)
 * sube también en el archivo (Y mayor, que el PDF mide al revés).
 */
import { strict as assert } from "node:assert";
import type { CadPublishSheet } from "../paper-space";
import { renderCadPlotPdf } from "./plot-pdf";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};

function hoja(rotation: number): CadPublishSheet {
  return {
    id: "s1",
    name: "Hoja",
    width: 297,
    height: 210,
    orientation: "landscape",
    colorMode: "color",
    lineweightScale: 1,
    titleBlock: {},
    viewports: [
      {
        id: "vp",
        name: "Ventana",
        clip: { x: 0, y: 0, width: 297, height: 210 },
        scale: 100,
        locked: false,
        commands: [
          {
            kind: "text",
            entityId: "rotulo",
            viewportId: "vp",
            point: { x: 100, y: 150 },
            text: "FACHADA",
            size: 4,
            rotation,
            color: "#000000",
          },
          {
            // En el plan la Y va hacia ABAJO: este segmento SUBE por el papel.
            kind: "path",
            entityId: "muro",
            viewportId: "vp",
            points: [
              { x: 40, y: 150 },
              { x: 40, y: 100 },
            ],
            closed: false,
            style: { stroke: "#000000", lineWidth: 0.25 },
          },
        ],
      },
    ],
  };
}

/** La matriz `Tm` del primer rótulo del archivo. */
function textMatrix(bytes: Uint8Array): number[] | null {
  const flujo = Buffer.from(bytes).toString("latin1");
  const encontrado = /BT[\s\S]{0,400}?\n([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) Tm/.exec(flujo);
  return encontrado ? encontrado.slice(1, 7).map(Number) : null;
}

/** El primer segmento vertical del archivo, como par de ordenadas. */
function segmentoVertical(bytes: Uint8Array): { desde: number; hasta: number } | null {
  const flujo = Buffer.from(bytes).toString("latin1");
  const encontrado = /([-\d.]+) ([-\d.]+) m\s+([-\d.]+) ([-\d.]+) l/.exec(flujo);
  if (!encontrado) return null;
  return { desde: Number(encontrado[2]), hasta: Number(encontrado[4]) };
}

async function correr(): Promise<void> {
  const vertical = await renderCadPlotPdf([hoja(90)], { compress: false });
  const matriz = textMatrix(vertical.bytes);
  ok(matriz, "el PDF lleva un rótulo con su matriz de texto");
  ok(
    matriz![1] > 0.99,
    `un rótulo a 90° se lee HACIA ARRIBA de la página (b = ${matriz?.[1]})`,
  );
  ok(Math.abs(matriz![0]) < 1e-6, "y perfectamente vertical, sin componente horizontal");

  const segmento = segmentoVertical(vertical.bytes);
  ok(segmento, "y el archivo lleva el muro");
  ok(
    segmento!.hasta > segmento!.desde,
    "el segmento que sube en el plan sube también en la página: papel y dibujo miran igual",
  );

  // El giro contrario tiene el signo contrario. Sin esta pareja, un emisor que
  // ignorase el ángulo pasaría la comprobación de arriba por casualidad.
  const alReves = await renderCadPlotPdf([hoja(-90)], { compress: false });
  ok((textMatrix(alReves.bytes) ?? [0, 0])[1] < -0.99, "y a −90° se lee hacia abajo");

  // Sin giro no se escribe matriz de rotación: el rótulo va derecho.
  const derecho = await renderCadPlotPdf([hoja(0)], { compress: false });
  const sinGiro = textMatrix(derecho.bytes);
  ok(!sinGiro || (Math.abs(sinGiro[0] - 1) < 1e-6 && Math.abs(sinGiro[1]) < 1e-6), "sin giro, el rótulo sale derecho");

  console.log(`plot-text-rotation: ${verdes} comprobaciones verdes`);
}

void correr();
