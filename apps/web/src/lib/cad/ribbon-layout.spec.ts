/**
 * El plan de plegado de la cinta, afirmado SIN navegador a los anchos que
 * importan: 1280 (viewport de los goldens) y 1366 (el portátil del oficio).
 *
 * Lo que se exige no es un dibujo concreto sino lo que los goldens 61 y 86
 * pulsan por `data-testid` sin abrir nada: LINE, CIRCLE, ARC, MOVE, COPY,
 * ROTATE, TRIM, ERASE y LAYER a la vista en Inicio, DIMLINEAR en Anotar; y
 * que a esos anchos NINGUNA pestaña necesite desplazarse.
 *
 * Correr: npx tsx src/lib/cad/ribbon-layout.spec.ts
 */
import { strict as assert } from "node:assert";
import { CAD_RIBBON_DATA } from "./ribbon";
import {
  CAD_RIBBON_METRICS,
  cadRibbonPanelSplit,
  cadRibbonTabWidth,
  cadRibbonVisibleNames,
  planCadRibbonLayout,
} from "./ribbon-layout";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const inicio = CAD_RIBBON_DATA.find((tab) => tab.id === "inicio")!;
const anotar = CAD_RIBBON_DATA.find((tab) => tab.id === "anotar")!;

// La tira lleva `px-1` (8 px) dentro de la ventana; a 1280 y 1366 quedan
// 1272 y 1358 para los paneles.
for (const width of [1272, 1358]) {
  for (const tab of CAD_RIBBON_DATA) {
    const plan = planCadRibbonLayout(tab, width);
    const total = cadRibbonTabWidth(tab, plan);
    ok(total <= width, `${tab.id} a ${width} px mide ${total} px y no cabe: se desplazaría`);
  }
  const visibles = cadRibbonVisibleNames(inicio, planCadRibbonLayout(inicio, width));
  for (const name of ["LINE", "PLINE", "CIRCLE", "ARC", "MOVE", "COPY", "ROTATE", "TRIM", "ERASE", "LAYER"]) {
    ok(visibles.has(name), `${name} no está a la vista en Inicio a ${width} px (los goldens 61/86 lo pulsan sin abrir nada)`);
  }
  ok(
    cadRibbonVisibleNames(anotar, planCadRibbonLayout(anotar, width)).has("DIMLINEAR"),
    `DIMLINEAR no está a la vista en Anotar a ${width} px`,
  );
}

// Con todo el ancho del mundo, todo se despliega y nada va al desplegable
// salvo lo que no cabe en las columnas máximas.
{
  const plan = planCadRibbonLayout(inicio, 100_000);
  for (const panel of inicio.panels) {
    const layout = plan.get(panel.label)!;
    ok(layout.state === "expanded", `${panel.label} debería estar desplegado con ancho infinito`);
    const split = cadRibbonPanelSplit(panel, layout);
    ok(
      split.large.length + split.small.length + split.flyout.length === panel.commands.length,
      `${panel.label}: el reparto pierde o duplica comandos`,
    );
    ok(
      split.small.length <= CAD_RIBBON_METRICS.maxColumns * CAD_RIBBON_METRICS.rows,
      `${panel.label}: más botones pequeños a la vista que columnas × filas`,
    );
  }
}

// Plegado a mano: el panel arranca plegado y todo su contenido va al desplegable.
{
  const plan = planCadRibbonLayout(inicio, 100_000, new Set(["Dibujo"]));
  ok(plan.get("Dibujo")!.state === "collapsed", "un panel plegado a mano queda plegado aunque sobre sitio");
  const split = cadRibbonPanelSplit(inicio.panels[0], plan.get("Dibujo")!);
  ok(split.flyout.length === inicio.panels[0].commands.length && split.large.length === 0, "plegado: todo al desplegable");
}

// A un ancho grande los paneles secundarios conservan sus botones grandes
// (reducidos) antes de que los principales pierdan una columna.
{
  const plan = planCadRibbonLayout(inicio, 1900);
  ok(plan.get("Dibujo")!.columns === CAD_RIBBON_METRICS.maxColumns, "a 1900 px Dibujo conserva sus dos columnas");
  ok(plan.get("Anotación")!.state !== "collapsed", "a 1900 px Anotación no llega a plegarse a un botón");
}

// Muy estrecho (tableta): el plan es el mínimo y la tira se desplaza — no
// se esconde nada detrás de un borde sin que se pueda llegar a ello.
{
  const plan = planCadRibbonLayout(inicio, 600);
  ok(plan.get("Dibujo")!.state === "reduced", "a 600 px Dibujo queda con sus botones grandes");
  ok(cadRibbonTabWidth(inicio, plan) > 600, "a 600 px la tira mide más que la ventana: se desplaza, no se amputa");
}

console.log(`ribbon-layout: ${checks}/${checks} comprobaciones verdes`);
