/**
 * T-10a · `visualStyle` llega a los DOS visores, no sólo al de sólidos.
 *
 * Antes de esta ficha, `cadStudioEngineBridges().visualStyle` sólo llamaba a
 * `solidShadeHost` (el visor de `SOLID3D`): `VSCURRENT` confirmaba un cambio
 * de estilo por la línea de comandos que sobre muros, pisos, cielorrasos y
 * cubiertas NO ocurría — el éxito falso que la auditoría midió como el más
 * grave del catálogo (`integrity.commands`). Este spec afirma que el puente
 * llama a los DOS anfitriones con el MISMO estilo, y que uno sin montar
 * (`current: null`) no revienta el otro.
 */
import { strict as assert } from "node:assert";
import { cadStudioEngineBridges, type CadStudioEngineBridgeInputs } from "./studio-engine-bridges";

let checks = 0;
const eq = (actual: unknown, expected: unknown, message: string) => {
  assert.equal(actual, expected, message);
  checks += 1;
};

function baseInputs(overrides: Partial<CadStudioEngineBridgeInputs> = {}): CadStudioEngineBridgeInputs {
  return {
    document: () => null,
    activePaperSpaceId: null,
    setActivePaperSpaceId: () => {},
    selectNative: () => {},
    history: { current: null },
    undo: () => {},
    redo: () => {},
    osnapOverrideRef: { current: null },
    solidShadeHost: { current: null },
    setLinetypeScale: () => {},
    startedByPointer: () => false,
    commit: () => {},
    syncRedefinedBlock: () => {},
    cursor: { current: null },
    drawPreview: () => {},
    ...overrides,
  };
}

// --- 1 · los DOS anfitriones reciben el MISMO estilo ------------------------
{
  const calledSolid: string[] = [];
  const calledMass: string[] = [];
  const bridges = cadStudioEngineBridges(
    baseInputs({
      solidShadeHost: {
        current: {
          applyVisualStyle: (styleId) => {
            calledSolid.push(styleId);
            return "Alámbrico";
          },
          visualStyle: "wireframe",
        },
      },
      nativeMassHosts: {
        current: {
          applyVisualStyle: (styleId) => {
            calledMass.push(styleId);
            return "Alámbrico";
          },
          visualStyle: "wireframe",
        },
      },
    }),
  );
  const label = bridges.visualStyle!("wireframe");
  eq(label, "Alámbrico", "devuelve la etiqueta del visor de sólidos");
  eq(calledSolid.length, 1, "solidShadeHost recibió la orden");
  eq(calledSolid[0], "wireframe", "con el estilo pedido");
  eq(calledMass.length, 1, "nativeMassHosts TAMBIÉN recibió la orden — antes no ocurría");
  eq(calledMass[0], "wireframe", "con el MISMO estilo, nunca uno distinto");
}

// --- 2 · sin uno de los dos montado, el otro sigue funcionando --------------
{
  const bridgesSinMasas = cadStudioEngineBridges(
    baseInputs({
      solidShadeHost: { current: { applyVisualStyle: () => "Oculto", visualStyle: "hidden" } },
      // nativeMassHosts ausente: un anfitrión sin montar, como en una
      // previsualización de trazado o una prueba en Node.
    }),
  );
  eq(bridgesSinMasas.visualStyle!("hidden"), "Oculto", "sin nativeMassHosts, el visor de sólidos sigue respondiendo");

  const calledMass: string[] = [];
  const bridgesSinSolidos = cadStudioEngineBridges(
    baseInputs({
      solidShadeHost: { current: null },
      nativeMassHosts: {
        current: {
          applyVisualStyle: (styleId) => { calledMass.push(styleId); return "Sombreado"; },
          visualStyle: "shaded",
        },
      },
    }),
  );
  eq(bridgesSinSolidos.visualStyle!("shaded"), null, "sin solidShadeHost la etiqueta es null (nadie la sabe decir)");
  eq(calledMass[0], "shaded", "pero nativeMassHosts se llamó igual: el estilo no se pierde");
}

// --- 3 · currentVisualStyle: VSCURRENT + Intro puede CONSULTAR -------------
{
  const conVisorDeSolidos = cadStudioEngineBridges(
    baseInputs({
      solidShadeHost: { current: { applyVisualStyle: () => "", visualStyle: "hidden" } },
      nativeMassHosts: { current: { applyVisualStyle: () => "", visualStyle: "shaded" } },
    }),
  );
  eq(
    conVisorDeSolidos.currentVisualStyle!(),
    "hidden",
    "el visor de sólidos manda cuando los dos están montados",
  );

  const soloMasas = cadStudioEngineBridges(
    baseInputs({
      solidShadeHost: { current: null },
      nativeMassHosts: { current: { applyVisualStyle: () => "", visualStyle: "wireframe" } },
    }),
  );
  eq(soloMasas.currentVisualStyle!(), "wireframe", "sin visor de sólidos, se lee del de muros/losas");

  const ninguno = cadStudioEngineBridges(baseInputs());
  eq(ninguno.currentVisualStyle!(), undefined, "sin ninguno de los dos montado, no hay estilo que consultar");
}

console.log(`studio-engine-bridges.spec: ${checks} comprobaciones verdes`);
