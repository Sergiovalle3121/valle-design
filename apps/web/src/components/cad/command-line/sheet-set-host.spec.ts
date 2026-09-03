/**
 * El puente que faltaba entre `PUBLISH`/`SHEETSET` y la API.
 *
 * Todo con un puerto de mentira: lo que se afirma es la POLÍTICA —qué se
 * cachea, qué se pide una sola vez, qué se dice cuando un dibujo no llega, y
 * qué pasa exactamente cuando el servidor contesta 409—, no que `fetch`
 * funcione.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "@/lib/cad/cad-document";
import { createCadSheetSet, addCadSheet, type CadSheetSet } from "@/lib/cad/sheet-set/sheet-set";
import {
  cadStudioSheetSetBridge,
  type CadStudioSheetSetPort,
} from "./sheet-set-host";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

const dibujo = (id: string) => ({ meta: { version: 1, schema: 5, unit: "mm" }, entities: [], layers: [], paperSpaces: [], id } as unknown as CadDocument);

function conjunto(): CadSheetSet {
  let set = createCadSheetSet({ id: "set:nave", name: "Nave industrial" });
  set = addCadSheet(set, { id: "s1", documentId: "doc-a", layoutId: "l1", title: "Planta" });
  set = addCadSheet(set, { id: "s2", documentId: "doc-b", layoutId: "l1", title: "Alzado" });
  // Dos hojas del MISMO dibujo: no puede pedirse dos veces.
  set = addCadSheet(set, { id: "s3", documentId: "doc-a", layoutId: "l2", title: "Cortes" });
  return set;
}

interface Cuenta {
  sets: number;
  documentos: string[];
  guardados: CadSheetSet[];
}

function puerto(
  overrides: Partial<CadStudioSheetSetPort> = {},
): { port: CadStudioSheetSetPort; cuenta: Cuenta } {
  const cuenta: Cuenta = { sets: 0, documentos: [], guardados: [] };
  const port: CadStudioSheetSetPort = {
    sheetSet: async (id) => {
      cuenta.sets += 1;
      const set = conjunto();
      return { ...set, id };
    },
    document: async (documentId) => {
      cuenta.documentos.push(documentId);
      return dibujo(documentId);
    },
    save: async (set) => {
      cuenta.guardados.push(set);
      return { ...set, version: set.version + 1 };
    },
    ...overrides,
  };
  return { port, cuenta };
}

async function correr(): Promise<void> {
  // --- 1 · nada en la mano al empezar; traer lo deja en la mano ------------
  {
    const { port, cuenta } = puerto();
    const notas: string[] = [];
    const bridge = cadStudioSheetSetBridge(port);
    eq(bridge.sheetSet("set:nave"), null, "sin traerlo, el puente no finge tenerlo");
    const traido = await bridge.loadSheetSet("set:nave", (t) => notas.push(t));
    ok(traido, "traerlo devuelve el conjunto");
    eq(traido!.set.name, "Nave industrial", "con su nombre");
    eq(traido!.documents.size, 2, "y los DOS dibujos distintos que sus tres hojas necesitan");
    eq(cuenta.documentos.length, 2, "el dibujo repetido se pide una sola vez");
    ok(bridge.sheetSet("set:nave"), "y a partir de ahí ya está en la mano");
    eq(notas.length, 0, "sin nada que contar cuando todo llegó");

    await bridge.loadSheetSet("set:nave", (t) => notas.push(t));
    eq(cuenta.sets, 1, "traerlo dos veces no vuelve a pedirlo: la caché sirve");
  }

  // --- 2 · dos peticiones a la vez comparten una sola carga ---------------
  {
    const { port, cuenta } = puerto({
      sheetSet: async (id) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { ...conjunto(), id };
      },
    });
    const bridge = cadStudioSheetSetBridge(port);
    const [a, b] = await Promise.all([
      bridge.loadSheetSet("set:nave", () => {}),
      bridge.loadSheetSet("set:nave", () => {}),
    ]);
    ok(a && b, "las dos reciben el conjunto");
    eq(cuenta.documentos.length, 2, "y sólo hubo UNA carga de dibujos");
  }

  // --- 3 · un dibujo que no llega SE DICE, y el resto sigue ---------------
  {
    const { port } = puerto({
      document: async (documentId) => {
        if (documentId === "doc-b") throw new Error("404");
        return dibujo(documentId);
      },
    });
    const notas: Array<{ text: string; level: string }> = [];
    const bridge = cadStudioSheetSetBridge(port);
    const traido = await bridge.loadSheetSet("set:nave", (text, level) => notas.push({ text, level }));
    ok(traido, "el conjunto llega igual");
    eq(traido!.documents.size, 1, "con el dibujo que sí se pudo traer");
    eq(notas.length, 1, "y UNA nota");
    ok(/doc-b/.test(notas[0].text), "que nombra el dibujo que falta");
    ok(/omitir/.test(notas[0].text), "y dice qué va a pasar con sus hojas");
    eq(notas[0].level, "error", "en el nivel que hace que se lea");
  }

  // --- 4 · el conjunto que no existe no se inventa -------------------------
  {
    const { port } = puerto({ sheetSet: async () => { throw new Error("no existe"); } });
    const notas: string[] = [];
    const bridge = cadStudioSheetSetBridge(port);
    eq(await bridge.loadSheetSet("set:fantasma", (t) => notas.push(t)), null, "devuelve null, no un conjunto vacío");
    eq(notas.length, 1, "y lo cuenta");
    ok(/set:fantasma/.test(notas[0]) && /no existe/.test(notas[0]), "con el id y el motivo");
    // Y se puede volver a intentar: el fallo no envenena la caché.
    const { port: bueno } = puerto();
    const otro = cadStudioSheetSetBridge(bueno);
    ok(await otro.loadSheetSet("set:nave", () => {}), "un puente nuevo sigue funcionando");
  }

  // --- 5 · guardar refleja YA lo calculado, y confirma con lo guardado ----
  {
    const { port, cuenta } = puerto();
    const bridge = cadStudioSheetSetBridge(port);
    const traido = (await bridge.loadSheetSet("set:nave", () => {}))!;
    const renombrado = { ...traido.set, name: "Nave industrial (rev B)" };
    bridge.saveSheetSet(renombrado, () => {});
    eq(
      bridge.sheetSet("set:nave")!.set.name,
      "Nave industrial (rev B)",
      "la orden siguiente ve el cambio sin esperar al servidor",
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    eq(cuenta.guardados.length, 1, "y se mandó una vez");
    eq(
      bridge.sheetSet("set:nave")!.set.version,
      traido.set.version + 1,
      "cuando el servidor contesta, la versión es la suya",
    );
  }

  // --- 6 · un 409 NO se reintenta: se dice y se olvida lo que había -------
  {
    const conflicto = new Error("409");
    const { port } = puerto({
      save: async () => { throw conflicto; },
      versionConflict: (error) => error === conflicto,
    });
    const notas: Array<{ text: string; level: string }> = [];
    const bridge = cadStudioSheetSetBridge(port);
    const traido = (await bridge.loadSheetSet("set:nave", () => {}))!;
    bridge.saveSheetSet({ ...traido.set, name: "Otro" }, (text, level) => notas.push({ text, level }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    eq(notas.length, 1, "el conflicto se cuenta");
    ok(/cambió mientras se editaba/.test(notas[0].text), "diciendo qué pasó de verdad");
    ok(/no se guardó nada/.test(notas[0].text), "y que no se guardó nada");
    eq(notas[0].level, "error", "como error");
    eq(bridge.sheetSet("set:nave"), null, "y la copia vieja se olvida: la próxima orden lee del servidor");
  }

  // --- 7 · un fallo de guardado que NO es conflicto se cuenta distinto ----
  {
    const { port } = puerto({ save: async () => { throw new Error("500 la base está caída"); } });
    const notas: string[] = [];
    const bridge = cadStudioSheetSetBridge(port);
    const traido = (await bridge.loadSheetSet("set:nave", () => {}))!;
    bridge.saveSheetSet({ ...traido.set }, (t) => notas.push(t));
    await new Promise((resolve) => setTimeout(resolve, 5));
    ok(/No se pudo guardar/.test(notas[0]), "se dice que no se guardó");
    ok(/la base está caída/.test(notas[0]), "con el motivo que dio el servidor");
    ok(!/cambió mientras se editaba/.test(notas[0]), "y NO se le llama conflicto a lo que no lo es");
  }

  console.log(`sheet-set-host: ${verdes} comprobaciones verdes`);
}

void correr();
