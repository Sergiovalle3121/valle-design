/**
 * La CÁMARA de una ventana, medida.
 *
 * Tres cosas se comprueban aquí, y las tres se descubren tarde y caras si no se
 * comprueban pronto:
 *
 *  1. **La planta es la identidad.** Es lo que hace segura la migración 7→8: si
 *     proyectar en planta no devolviera `(x, y)`, escribirle la cámara a una
 *     ventana antigua movería lo que enseña. El censo del esquema 8 lo afirma
 *     sobre el documento; aquí se mide sobre el marco, que es donde se decide.
 *  2. **Los alzados no salen espejados.** Un alzado espejado no se nota
 *     mirándolo: se nota cuando el cliente pregunta por qué la puerta está al
 *     otro lado. Se ancla el `right` de cada una de las seis vistas ortogonales
 *     a un vector ABSOLUTO, no a «lo que salga».
 *  3. **Lo que no define una vista se rechaza.** Fallo cerrado: una cámara
 *     degenerada no se arregla eligiendo una vertical cualquiera, porque el
 *     alzado saldría girado un ángulo distinto en cada corrida.
 */
import { strict as assert } from "node:assert";
import type { CadPoint3 } from "../cad-document";
import { CAD_VIEWPORT_PLAN_VIEW } from "../cad-paper-viewport";
import {
  CAD_VIEWPORT_ORTHO_NAMES,
  cadViewportOrthoView,
  cadViewportProjectPoint,
  cadViewportSectionView,
  cadViewportUnprojectPoint,
  cadViewportViewDepth,
  cadViewportViewFrame,
  cadViewportViewIsPlan,
  cadViewportViewProblem,
} from "./viewport-view";

const P = (x: number, y: number, z: number): CadPoint3 => ({ x, y, z });
const ORIGEN = P(0, 0, 0);

function marco(view: Parameters<typeof cadViewportViewFrame>[0]) {
  const outcome = cadViewportViewFrame(view);
  assert.ok(outcome.ok, `la vista no produjo marco: ${outcome.ok ? "" : outcome.message}`);
  return outcome.frame;
}

// --- 1. la planta es la identidad -------------------------------------------
{
  const frame = marco(CAD_VIEWPORT_PLAN_VIEW);
  assert.deepEqual(frame.right, P(1, 0, 0), "la planta debe llevar la X del mundo a la derecha");
  assert.deepEqual(frame.up, P(0, 1, 0), "la planta debe llevar la Y del mundo hacia arriba");
  assert.deepEqual(frame.back, P(0, 0, 1), "la planta mira hacia −Z, así que el ojo está en +Z");

  let peor = 0;
  for (const punto of [P(0, 0, 0), P(1_234.5, -987.25, 4_000), P(-1e6, 1e6, -50)]) {
    const p = cadViewportProjectPoint(punto, frame);
    peor = Math.max(peor, Math.abs(p.x - punto.x), Math.abs(p.y - punto.y));
  }
  assert.equal(peor, 0, `proyectar en planta se desvió ${peor} de la identidad`);
  assert.ok(cadViewportViewIsPlan(CAD_VIEWPORT_PLAN_VIEW));
  // Y se reconoce como planta aunque la dirección venga sin normalizar: se mide
  // el marco, no se comparan campos.
  assert.ok(
    cadViewportViewIsPlan({ ...CAD_VIEWPORT_PLAN_VIEW, direction: P(0, 0, -7) }),
    "una planta escrita con otra escala sigue siendo la misma planta",
  );
  assert.ok(!cadViewportViewIsPlan(cadViewportOrthoView("frontal", ORIGEN)));
}

// --- 2. las seis ortogonales, ancladas a vectores absolutos ------------------
{
  // Si esto se pudiera «arreglar» cambiando un signo, no estaría midiendo nada.
  // Cada fila dice dónde cae la derecha del papel MIRANDO desde ese sitio.
  const ESPERADO: Record<string, { right: CadPoint3; up: CadPoint3 }> = {
    planta: { right: P(1, 0, 0), up: P(0, 1, 0) },
    inferior: { right: P(-1, 0, 0), up: P(0, 1, 0) },
    // De pie al sur mirando al norte: el este queda a la derecha.
    frontal: { right: P(1, 0, 0), up: P(0, 0, 1) },
    // Al norte mirando al sur: el este queda a la izquierda.
    posterior: { right: P(-1, 0, 0), up: P(0, 0, 1) },
    // Al oeste mirando al este: el norte queda a la izquierda.
    izquierda: { right: P(0, -1, 0), up: P(0, 0, 1) },
    derecha: { right: P(0, 1, 0), up: P(0, 0, 1) },
  };
  for (const nombre of CAD_VIEWPORT_ORTHO_NAMES) {
    const frame = marco(cadViewportOrthoView(nombre, ORIGEN));
    assert.deepEqual(frame.right, ESPERADO[nombre].right, `la vista ${nombre} sale espejada`);
    assert.deepEqual(frame.up, ESPERADO[nombre].up, `la vista ${nombre} sale tumbada`);
  }

  // Un alzado frontal enseña la X del mundo en horizontal y la Z en vertical:
  // es lo que hace que un muro de 2800 de alto mida 2800 en el papel.
  const frontal = marco(cadViewportOrthoView("frontal", ORIGEN));
  const punto = cadViewportProjectPoint(P(3_000, 999, 2_800), frontal);
  assert.equal(punto.x, 3_000);
  assert.equal(punto.y, 2_800);
  // Y la cota que se descarta al proyectar es la PROFUNDIDAD, que sigue ahí.
  assert.equal(cadViewportViewDepth(P(3_000, 999, 2_800), frontal), -999);
}

// --- 3. proyectar y deshacer vuelve al mismo punto ---------------------------
{
  for (const nombre of CAD_VIEWPORT_ORTHO_NAMES) {
    const frame = marco(cadViewportOrthoView(nombre, P(100, -200, 300)));
    const original = P(1_500, 2_500, 900);
    const plano = cadViewportProjectPoint(original, frame);
    const profundidad = cadViewportViewDepth(original, frame);
    const vuelta = cadViewportUnprojectPoint(plano, frame, profundidad);
    const error = Math.hypot(
      vuelta.x - original.x,
      vuelta.y - original.y,
      vuelta.z - original.z,
    );
    assert.ok(error < 1e-9, `la vista ${nombre} pierde ${error} u al ir y volver`);
  }
}

// --- 4. la sección: hacia dónde mira y qué descarta --------------------------
{
  // Línea de corte de oeste a este; sin `lookLeft` se mira hacia la DERECHA de
  // ese recorrido, que caminando al este es el sur.
  const corte = cadViewportSectionView({ from: { x: 0, y: 1_000 }, to: { x: 5_000, y: 1_000 } });
  assert.ok(!("ok" in corte), "la sección no se pudo construir");
  assert.deepEqual(corte.direction, P(0, -1, 0), "el corte debería mirar al sur");
  assert.deepEqual(corte.target, P(2_500, 1_000, 0));
  // La normal del plano apunta al OJO: lo positivo está delante y se descarta.
  assert.deepEqual(corte.sectionPlane?.normal, P(0, 1, 0));
  // Y sin ceros negativos: `-0` y `0` son el mismo número y no el mismo texto,
  // y un `-0` dentro de la cámara la haría distinta de sí misma al guardar.
  const json = JSON.stringify(corte);
  assert.equal(json, JSON.stringify(JSON.parse(json)), "la cámara no sobrevive al JSON");
  assert.ok(!json.includes("-0,") && !json.includes("-0}"), `hay ceros negativos en ${json}`);

  const espejo = cadViewportSectionView({
    from: { x: 0, y: 1_000 },
    to: { x: 5_000, y: 1_000 },
    lookLeft: true,
  });
  assert.ok(!("ok" in espejo));
  assert.deepEqual(espejo.direction, P(0, 1, 0), "`lookLeft` debería invertir la mirada");

  const degenerado = cadViewportSectionView({ from: { x: 0, y: 0 }, to: { x: 0, y: 0 } });
  assert.ok("ok" in degenerado && degenerado.code === "corte-invalido");
}

// --- 5. FALLO CERRADO: lo que no define una vista se rechaza ------------------
{
  const nula = cadViewportViewFrame({ ...CAD_VIEWPORT_PLAN_VIEW, direction: P(0, 0, 0) });
  assert.ok(!nula.ok && nula.code === "direccion-nula", "una mirada nula debería rechazarse");

  const paralela = cadViewportViewFrame({
    ...CAD_VIEWPORT_PLAN_VIEW,
    up: P(0, 0, 5),
  });
  assert.ok(
    !paralela.ok && paralela.code === "vertical-paralela",
    "una vertical paralela a la mirada debería rechazarse",
  );

  const sinPlano = cadViewportViewFrame({
    ...cadViewportOrthoView("frontal", ORIGEN),
    kind: "section",
  });
  assert.ok(
    !sinPlano.ok && sinPlano.code === "corte-invalido",
    "una sección sin plano de corte no es una sección",
  );

  // El gemelo VÁLIDO: una vertical casi paralela SÍ define una vista. Sin esto,
  // un rechazo que rechazara todo también pasaría las tres pruebas de arriba.
  assert.ok(
    cadViewportViewFrame({ ...CAD_VIEWPORT_PLAN_VIEW, up: P(0, 0.001, 1) }).ok,
    "una vertical inclinada pero no paralela define una vista perfectamente",
  );
  // Y se ortogonaliza en vez de exigirla perpendicular: quien compone una vista
  // girando la cámara da un «arriba» aproximado.
  const inclinada = marco({ ...CAD_VIEWPORT_PLAN_VIEW, up: P(0, 1, 0.5) });
  assert.deepEqual(inclinada.up, P(0, 1, 0), "la vertical no se ortogonalizó contra la mirada");
}

// --- 6. el motivo se puede ENSEÑAR, que es de lo que sirve --------------------
{
  assert.equal(cadViewportViewProblem(CAD_VIEWPORT_PLAN_VIEW), null);
  assert.equal(cadViewportViewProblem(null), "la vista no es un objeto");
  assert.equal(
    cadViewportViewProblem({ ...CAD_VIEWPORT_PLAN_VIEW, projection: "perspective" }),
    "sólo se admite proyección paralela",
  );
  assert.ok(
    cadViewportViewProblem({ ...CAD_VIEWPORT_PLAN_VIEW, kind: "isometrica" })?.includes(
      "clase de vista desconocida",
    ),
  );
  assert.ok(
    cadViewportViewProblem({ ...CAD_VIEWPORT_PLAN_VIEW, up: { x: 0, y: Number.NaN, z: 0 } })
      ?.includes("punto 3D finito"),
  );
  // Un booleano no se puede enseñar en un mensaje; una frase sí.
  const mensaje = cadViewportViewProblem({ ...CAD_VIEWPORT_PLAN_VIEW, direction: P(0, 0, 0) });
  assert.ok(mensaje && mensaje.length > 10, `el motivo no sirve para enseñar: ${mensaje}`);
}

console.log(
  "OK cámara de la ventana: planta = identidad (desviación 0), 6 ortogonales sin espejo, " +
    "ida y vuelta < 1e-9 u, sección con su plano y sin ceros negativos, 3 rechazos con código",
);
