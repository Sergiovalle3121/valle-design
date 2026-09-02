/**
 * AUDITORÍA — El delineante y su estándar de capas.
 *
 * Recorrido de un delineante que abre el plano del cliente y le impone SU
 * estándar: tres capas nuevas con su color, cada objeto en la suya, una capa
 * bloqueada para que nadie le toque los ejes, otra congelada para quitarse las
 * cotas de encima mientras dibuja. Y después la pregunta que decide si el
 * estándar sirve para algo: ¿sobrevive a guardar y recargar?
 *
 * Lo que se afirma es lo que VE el delineante:
 *   · la fila de la capa en el gestor (nombre, color, candado, copo),
 *   · la capa que la lista de entidades escribe al lado de cada objeto,
 *   · el contador de designación de la barra de estado (`N sel`) al barrer el
 *     lienzo con una ventana de CRUCE — que es como se comprueba de verdad si
 *     un objeto sigue estando en el dibujo o ya no,
 *   · y el documento persistido en el backend, que es lo único que sobrevive.
 *
 * No se afirma ningún detalle de implementación: ni el índice espacial, ni el
 * guardián de capas bloqueadas, ni el esquema.
 */
import { expect, test, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { fitFootprint } from "../fixtures/camera-preset";
import {
  migrateCadDocument,
  type CadDocument,
} from "../../src/lib/cad/cad-document";

function planoDelCliente(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 10, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    ],
    entities: [
      // Todo llega en la capa 0, como en cualquier plano que manda un cliente.
      {
        id: "muro-sur",
        type: "line",
        start: { x: 4_000, y: 4_000, z: 0 },
        end: { x: 8_000, y: 4_000, z: 0 },
        layer: "0",
      },
      {
        id: "eje-a",
        type: "line",
        start: { x: 4_000, y: 5_000, z: 0 },
        end: { x: 8_000, y: 5_000, z: 0 },
        layer: "0",
      },
      {
        id: "cota-1",
        type: "line",
        start: { x: 4_000, y: 6_000, z: 0 },
        end: { x: 8_000, y: 6_000, z: 0 },
        layer: "0",
      },
    ],
  }) as CadDocument;
}

const gestorDeCapas = (page: Page) => page.getByTitle(/Vista, capas/);

/** Abre el gestor de capas y espera a verlo. */
async function abrirCapas(page: Page) {
  await gestorDeCapas(page).click();
  await expect(page.getByTestId("cad-layer-properties")).toBeVisible();
}

async function cerrarCapas(page: Page) {
  await gestorDeCapas(page).click();
  await expect(page.getByTestId("cad-layer-properties")).toBeHidden();
}

/**
 * Barre el dibujo con una ventana de CRUCE y devuelve cuántos objetos designó.
 * Es la pregunta «¿qué sigue estando en el plano?» hecha con el ratón: lo
 * apagado, lo congelado y lo bloqueado no entran en la designación.
 *
 * No usa `worldPoint` a propósito: el dibujo de esta prueba cabe entero en el
 * centro del encuadre, así que un recuadro fijo alrededor del centro lo cubre
 * sin tener que invertir la transformación mundo↔pantalla.
 */
const MEDIO_BARRIDO_PX = 150;

async function designarTodoPorCruce(page: Page): Promise<string> {
  const caja = await page.getByTestId("cad-canvas").boundingBox();
  if (!caja) throw new Error("El lienzo CAD no tiene caja");
  const cx = caja.x + caja.width / 2;
  const cy = caja.y + caja.height / 2;
  // De DERECHA a IZQUIERDA: en cualquier CAD eso es ventana de CRUCE.
  //
  // El barrido se queda a ±150 px del centro EN VEZ de cubrir el lienzo
  // entero, y no es un capricho: la barra de estado del estudio está montada
  // ENCIMA del lienzo, pegada abajo a la derecha (`div.cad-status-bar
  // .absolute` dentro de `cad-canvas`). Un arrastre que empiece ahí no llega
  // nunca al lienzo y no designa nada. Medido: con la esquina de arranque a
  // 180 px del centro designa 3 objetos; a 200 px cae sobre
  // `cad-save-status` y designa 0. Por eso el dibujo de esta prueba vive en
  // el centro de la huella y el barrido no sale de la zona limpia.
  const desde = { x: cx + MEDIO_BARRIDO_PX, y: cy + MEDIO_BARRIDO_PX };
  const hasta = { x: cx - MEDIO_BARRIDO_PX, y: cy - MEDIO_BARRIDO_PX };
  const responde = await page.evaluate(
    ([px, py]) => {
      const arriba = document.elementFromPoint(px as number, py as number);
      return arriba ? arriba.tagName.toLowerCase() : "nada";
    },
    [desde.x, desde.y],
  );
  if (responde !== "canvas")
    throw new Error(
      `El barrido arranca sobre <${responde}>, no sobre el lienzo: ` +
        "hay una capa flotante encima y el arrastre no va a designar nada. " +
        "Esto es un problema del PUNTO ELEGIDO, no de las capas.",
    );
  await page.mouse.move(desde.x, desde.y);
  await page.mouse.down();
  await page.mouse.move(hasta.x, hasta.y, { steps: 12 });
  await page.mouse.up();
  // El contador tarda un instante en cuajar tras soltar el botón.
  await page.waitForTimeout(1_000);
  return (await page.getByTestId("cad-selection-status-count").textContent()) ?? "";
}

/** Pone el lienzo en modo «ventana de cruce» y encuadra la planta. */
async function prepararDesignacionPorCruce(page: Page) {
  const herramienta = page.getByTitle(/Selecci.n profesional/);
  await herramienta.click();
  const paleta = page.getByTestId("cad-selection-palette");
  await expect(paleta).toBeVisible();
  await page.getByTestId("cad-selection-mode-crossing").click();
  await herramienta.click();
  await expect(paleta).toBeHidden();
  // El estudio abre YA en 2D cenital: no hay «Vista superior» que pulsar en la
  // barra, sólo hace falta encuadrar la huella.
  await fitFootprint(page);
}

/** Limpia la designación anterior para que cada barrido cuente desde cero. */
async function limpiarDesignacion(page: Page) {
  const herramienta = page.getByTitle(/Selecci.n profesional/);
  await herramienta.click();
  const paleta = page.getByTestId("cad-selection-palette");
  await expect(paleta).toBeVisible();
  const limpiar = paleta.getByRole("button", { name: "Limpiar" });
  if (await limpiar.isEnabled()) await limpiar.click();
  await herramienta.click();
  await expect(paleta).toBeHidden();
}

/** Teclea una orden en la línea de comandos, como se hace de verdad. */
async function teclear(page: Page, valor: string) {
  const entrada = page.getByTestId("cad-command-input");
  await entrada.click();
  await entrada.fill(valor);
  await entrada.press("Enter");
}

test("el estándar de capas del delineante sobrevive a guardar y recargar", async ({
  context,
  page,
}) => {
  test.setTimeout(600_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(
    context,
    planoDelCliente(),
    { footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100 },
  );
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  if (await page.getByTestId("cad-guided-tour-skip").count())
    await page.getByTestId("cad-guided-tour-skip").click();
  await expect(page.getByTestId("cad-native-entity-muro-sur")).toBeVisible();

  await test.step("las tres capas del estándar, con su color", async () => {
    await abrirCapas(page);
    for (const [nombre, color] of [
      ["MUROS", "#e11d48"],
      ["EJES", "#22d3ee"],
      ["COTAS", "#facc15"],
    ] as const) {
      await page.getByTestId("cad-layer-new-name").fill(nombre);
      await page.getByTestId("cad-layer-new-color").fill(color);
      await page.getByTestId("cad-layer-create").click();
      await expect(page.getByTestId(`cad-layer-row-${nombre}`)).toBeVisible();
      await expect(page.getByTestId(`cad-layer-color-${nombre}`)).toHaveValue(
        color,
      );
    }
    await cerrarCapas(page);
  });

  await test.step("cada objeto a su capa", async () => {
    // Se designa PRIMERO y se abre el gestor DESPUÉS: el gestor es un panel
    // flotante que se cierra al hacer clic fuera, así que designar con él
    // abierto lo cierra y deja de haber botón «Asignar» que pulsar.
    for (const [entidad, capa] of [
      ["muro-sur", "MUROS"],
      ["eje-a", "EJES"],
      ["cota-1", "COTAS"],
    ] as const) {
      await expect(page.getByTestId("cad-native-entity-list")).toBeVisible();
      await page.getByTestId(`cad-native-entity-${entidad}`).click();
      await abrirCapas(page);
      await page
        .getByTestId(`cad-layer-row-${capa}`)
        .getByRole("button", { name: "Asignar" })
        .click();
      await cerrarCapas(page);
      // La propiedad «Capa» del objeto designado es donde el delineante lo
      // comprueba.
      await expect(page.getByTestId("cad-native-property-layer")).toHaveValue(
        capa,
      );
      // Deseleccionar devuelve la lista de entidades, de donde se coge el
      // siguiente objeto.
      await page.getByRole("button", { name: "Deseleccionar" }).click();
    }
  });

  await test.step("cambiar el color de una capa ya en uso", async () => {
    await abrirCapas(page);
    await page.getByTestId("cad-layer-color-MUROS").fill("#7c3aed");
    await expect(page.getByTestId("cad-layer-color-MUROS")).toHaveValue(
      "#7c3aed",
    );
    await cerrarCapas(page);
  });

  await test.step("con las tres capas sanas, el barrido designa los tres objetos", async () => {
    await prepararDesignacionPorCruce(page);
    expect(await designarTodoPorCruce(page)).toBe("3 sel");
  });

  await test.step("una capa bloqueada protege lo que ya está en ella", async () => {
    await limpiarDesignacion(page);
    await abrirCapas(page);
    await page.getByTestId("cad-layer-lock-EJES").click();
    await expect(page.getByTestId("cad-layer-lock-EJES")).toHaveText("Lock");
    await cerrarCapas(page);

    // 1) No se designa con el ratón: el barrido ya no lo captura.
    expect(await designarTodoPorCruce(page)).toBe("2 sel");

    // 2) Ni se edita desde el panel de propiedades.
    await limpiarDesignacion(page);
    await page.getByTestId("cad-native-entity-eje-a").click();
    await expect(page.getByTestId("cad-native-property-startX")).toHaveValue(
      "4000",
    );
    await page.getByTestId("cad-native-move-x").click();
    await expect(page.getByText(/EJES is locked/)).toBeVisible();
    await expect(page.getByTestId("cad-native-property-startX")).toHaveValue(
      "4000",
    );
  });

  await test.step("con la capa bloqueada activa, tampoco se dibuja encima", async () => {
    await abrirCapas(page);
    await page.getByTestId("cad-layer-active-EJES").click();
    await cerrarCapas(page);
    const contador = page.getByTestId("cad-native-document-count");
    await expect(contador).toHaveText("Native 3");
    // Se parte de pantalla LIMPIA: el aviso del paso anterior seguiría a la
    // vista y se colaría como evidencia de éste, que es exactamente cómo se
    // da por bueno un rechazo que en realidad no se dijo.
    await expect(page.getByText(/is locked/i)).toHaveCount(0, {
      timeout: 30_000,
    });
    await teclear(page, "L");
    await teclear(page, "3000,9000");
    await teclear(page, "@1000,0");
    const terminar = page.getByTestId("cad-engine-command-finish");
    if (await terminar.count()) await terminar.click();
    else await page.getByTestId("cad-command-input").press("Enter");
    // Ni una entidad nueva: el candado manda sobre la capa activa.
    await expect(contador).toHaveText("Native 3");
    // Y el rechazo se DICE. El hecho duro es el contador; que además se
    // explique es lo que separa un rechazo de un silencio.
    const aviso = page.getByText(/is locked/i).first();
    await expect(aviso).toBeVisible({ timeout: 10_000 });
    console.log(`AVISO FRESCO AL DIBUJAR SOBRE CAPA BLOQUEADA: ${await aviso.textContent()}`);
    await page.getByTestId("cad-command-input").press("Escape");
  });

  await test.step("una capa congelada desaparece del dibujo", async () => {
    await limpiarDesignacion(page);
    await abrirCapas(page);
    await page.getByTestId("cad-layer-frozen-COTAS").click();
    await expect(page.getByTestId("cad-layer-frozen-COTAS")).toHaveAttribute(
      "data-state",
      "frozen",
    );
    // La capa activa vuelve a una que se pueda usar, como haría cualquiera.
    await page.getByTestId("cad-layer-active-MUROS").click();
    await cerrarCapas(page);
    // Bloqueada + congelada: sólo queda el muro.
    expect(await designarTodoPorCruce(page)).toBe("1 sel");
  });

  await test.step("guardar", async () => {
    await limpiarDesignacion(page);
    await saveAndSettle(page, backend);
    const guardado = backend.snapshot().document;
    expect(guardado.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "MUROS", color: "#7c3aed" }),
        expect.objectContaining({ id: "EJES", locked: true }),
        expect.objectContaining({ id: "COTAS", frozen: true }),
      ]),
    );
    const capa = (id: string) =>
      guardado.entities.find((entidad) => entidad.id === id)?.layer;
    expect(capa("muro-sur")).toBe("MUROS");
    expect(capa("eje-a")).toBe("EJES");
    expect(capa("cota-1")).toBe("COTAS");
    expect(guardado.entities).toHaveLength(3);
  });

  await test.step("recargar: todo sigue igual", async () => {
    await page.reload();
    await expect(page.getByTestId("cad-canvas")).toBeVisible();
    if (await page.getByTestId("cad-guided-tour-skip").count())
      await page.getByTestId("cad-guided-tour-skip").click();
    await expect(page.getByTestId("cad-native-entity-muro-sur")).toContainText(
      "MUROS",
    );
    await expect(page.getByTestId("cad-native-entity-eje-a")).toContainText(
      "EJES",
    );
    await expect(page.getByTestId("cad-native-entity-cota-1")).toContainText(
      "COTAS",
    );

    await abrirCapas(page);
    await expect(page.getByTestId("cad-layer-color-MUROS")).toHaveValue(
      "#7c3aed",
    );
    await expect(page.getByTestId("cad-layer-color-EJES")).toHaveValue(
      "#22d3ee",
    );
    await expect(page.getByTestId("cad-layer-lock-EJES")).toHaveText("Lock");
    await expect(page.getByTestId("cad-layer-frozen-COTAS")).toHaveAttribute(
      "data-state",
      "frozen",
    );
    await cerrarCapas(page);

    // Y lo que importa de verdad: el estándar sigue MANDANDO, no sólo
    // pintándose. Tras recargar, congelada y bloqueada siguen fuera.
    await prepararDesignacionPorCruce(page);
    expect(await designarTodoPorCruce(page)).toBe("1 sel");
  });

  await test.step("control positivo: con una capa sana, esa misma secuencia SÍ dibuja", async () => {
    // Sin esto, «no pude dibujar sobre la capa bloqueada» no probaría nada:
    // podría ser que teclear no dibuje NUNCA en este entorno. Se repite la
    // secuencia exacta con la capa activa desbloqueada y tiene que crear.
    await limpiarDesignacion(page);
    await abrirCapas(page);
    await page.getByTestId("cad-layer-active-MUROS").click();
    await cerrarCapas(page);
    const contador = page.getByTestId("cad-native-document-count");
    await expect(contador).toHaveText("Native 3");
    await teclear(page, "L");
    await teclear(page, "3000,9000");
    await teclear(page, "@1000,0");
    const terminar = page.getByTestId("cad-engine-command-finish");
    if (await terminar.count()) await terminar.click();
    else await page.getByTestId("cad-command-input").press("Enter");
    await expect(contador).toHaveText("Native 4");
  });
});
