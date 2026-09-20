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
  CAD_RIBBON_DENSE_BREAKPOINT,
  CAD_RIBBON_DENSE_METRICS,
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

// A una pantalla de escritorio ancha (por encima del corte denso) los
// paneles secundarios conservan sus botones grandes (reducidos) antes de que
// los principales pierdan una columna, y el botón pequeño vuelve a llevar
// rótulo (escalón disperso, `CAD_RIBBON_METRICS.small` de 112 px).
{
  const width = 2200;
  assert.ok(width >= CAD_RIBBON_DENSE_BREAKPOINT, "esta prueba necesita el escalón disperso");
  const plan = planCadRibbonLayout(inicio, width);
  ok(plan.get("Dibujo")!.dense === false, `a ${width} px el botón pequeño lleva rótulo (escalón disperso)`);
  ok(plan.get("Dibujo")!.columns === CAD_RIBBON_METRICS.maxColumns, `a ${width} px Dibujo conserva sus dos columnas`);
  ok(plan.get("Anotación")!.state !== "collapsed", `a ${width} px Anotación no llega a plegarse a un botón`);
}

// Muy estrecho (tableta): el plan es el mínimo y la tira se desplaza — no
// se esconde nada detrás de un borde sin que se pueda llegar a ello.
{
  const plan = planCadRibbonLayout(inicio, 600);
  ok(plan.get("Dibujo")!.state === "reduced", "a 600 px Dibujo queda con sus botones grandes");
  ok(cadRibbonTabWidth(inicio, plan) > 600, "a 600 px la tira mide más que la ventana: se desplaza, no se amputa");
}

// ── EL ESCALÓN DENSO CON RÓTULO (Ola 6 «cinta legible», 2026-09-20) ─────────
//
// La Ola 1 «cinta» (2026-09-19) midió aquí «cuántos comandos quedan A LA
// VISTA» y llegó a 71 a 1346 px encogiendo el botón pequeño a SÓLO ICONO (26
// px, ocho columnas). El dueño —que dibuja a diario y viene de AutoCAD— los
// vio y dijo que eran «iconos anónimos, imposibles de distinguir de un
// vistazo»: visible no es lo mismo que reconocible. El encargo de esta ola
// pide medir cuántos caben CON RÓTULO LEGIBLE y elegir eso, aunque el total
// baje — y baja: de 71 mudos a 25 con nombre a 1346 px. La tabla que decidió
// el ancho (64 a 112 px, con su cuenta de caracteres visibles) vive en el
// comentario de `CAD_RIBBON_DENSE_METRICS`, en `ribbon-layout.ts`.
{
  const totalVisible = (width: number) => {
    const plan = planCadRibbonLayout(inicio, width);
    return inicio.panels.reduce((total, panel) => {
      const split = cadRibbonPanelSplit(panel, plan.get(panel.label)!);
      return total + split.large.length + split.small.length;
    }, 0);
  };

  ok(1346 < CAD_RIBBON_DENSE_BREAKPOINT, "1366 px de ventana (portátil, con o sin barra) cae siempre en el escalón denso");
  // Corrección del golden 214 (2026-09-20): estos ≥20/≥24 de la Ola 6 salían de un
  // `cadRibbonPanelWidth` que NUNCA contaba el PIE del panel (el rótulo bajo los botones) — sólo
  // la fila de botones. Un panel "reduced" sin botón grande (Grupos, Utilidades, Portapapeles) no
  // pinta esa fila: el pie es lo ÚNICO que hay, y el modelo lo daba por 0 px. En un navegador real
  // la tira medía 1579 px de contenido en 1366 (213 px de más) y 1415 en 1280 (135 de más): el
  // golden 214 lo pescó por `scrollWidth > clientWidth`. Con el pie ya contado
  // (`cadRibbonLabelWidth`, en `ribbon-layout.ts`) el reparto real dispone de menos sitio del que
  // este archivo creía, así que menos comandos caben CON rótulo legible — siguen siendo muchos más
  // que los 71 MUDOS de la Ola 1, que es lo que este bloque afirma. «Propiedades» y «Portapapeles»
  // además dejan de poder PLEGARSE a un botón en este reparto: su rótulo (66 y 70 px reales) no
  // cabe en los 68 px del botón plegado sin recortarse con puntos suspensivos
  // (`cadRibbonLabelFitsCollapsed`), así que se quedan "reduced" —más caros en píxeles, pero con
  // el nombre completo— y eso resta todavía más columnas al resto.
  const visibles1272 = totalVisible(1272);
  ok(visibles1272 >= 14, `Inicio a 1272 px (ventana de 1280) enseña ${visibles1272} comandos CON rótulo; el objetivo tras la corrección del golden 214 es ≥14`);
  const visibles1346 = totalVisible(1346);
  ok(
    visibles1346 >= 17,
    `Inicio a 1346 px enseña ${visibles1346} comandos CON rótulo; el objetivo tras la corrección del golden 214 es ≥17 (con la Ola 1 eran 71 sin nombre)`,
  );
  ok(
    cadRibbonTabWidth(inicio, planCadRibbonLayout(inicio, 1346)) <= 1346,
    "a 1346 px la tira sigue sin desbordar: el golden 214 (scrollWidth <= clientWidth) se apoya en esto",
  );

  // 1908 px representa una ventana de escritorio ancha (una pantalla de
  // 1920, con el margen que le resta la barra/los rieles): sigue por debajo
  // del corte (ver `CAD_RIBBON_DENSE_BREAKPOINT`, más arriba, para la
  // desviación medida frente al corte de 1500 px del encargo original) y el
  // escalón denso tiene de sobra para enseñar todavía más, siempre con rótulo.
  ok(1908 < CAD_RIBBON_DENSE_BREAKPOINT, "1908 px (una ventana de escritorio ancha) también cae en el escalón denso");
  const visibles1908 = totalVisible(1908);
  ok(visibles1908 >= 38, `Inicio a 1908 px enseña ${visibles1908} comandos CON rótulo; el objetivo tras la corrección del golden 214 es ≥38`);

  // El botón pequeño denso mide `CAD_RIBBON_DENSE_METRICS.small` (80 px, con
  // presupuesto para ~8 caracteres de rótulo recortado), no los 26 px de
  // sólo-icono de la Ola 1 ni los 112 px sin recorte del escalón disperso —
  // y por debajo del corte `maxColumns` es 4, no 8: con el botón cuatro
  // veces más ancho, ocho columnas ya no cabían en ningún panel real.
  const denseMetricsChanged = CAD_RIBBON_DENSE_METRICS.small === 80 && CAD_RIBBON_DENSE_METRICS.maxColumns === 4;
  ok(denseMetricsChanged, "CAD_RIBBON_DENSE_METRICS: botón pequeño de 80 px (con rótulo recortado), hasta cuatro columnas");
  ok(CAD_RIBBON_DENSE_METRICS.rows === CAD_RIBBON_METRICS.rows, "las filas NO cambian: el cuerpo del panel sigue midiendo lo mismo de alto");
  ok(CAD_RIBBON_DENSE_METRICS.large === CAD_RIBBON_METRICS.large, "el botón grande no cambia de tamaño con el escalón denso");

  // Por debajo del corte, todo plan trae `dense: true`; por encima, `false`.
  const densePlan = planCadRibbonLayout(inicio, 1346);
  ok([...densePlan.values()].every((layout) => layout.dense === true), "a 1346 px todo el plan es denso");
  const sparsePlan = planCadRibbonLayout(inicio, 2200);
  ok([...sparsePlan.values()].every((layout) => layout.dense === false), "a 2200 px todo el plan es disperso");
}

console.log(`ribbon-layout: ${checks}/${checks} comprobaciones verdes`);
