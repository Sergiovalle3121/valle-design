/**
 * Entrada dinámica del CAD, a prueba del re-montaje.
 *
 * EL PROBLEMA, QUE YA ESTABA DIAGNOSTICADO EN EL REPO. El panel de entrada
 * dinámica se REMONTA al cambiar de fase (`anchored|origin`, centro→radio,
 * ABS→REL→POLAR). Rellenar un campo justo en ese instante pierde el valor en
 * silencio: la herramienta recibe dos veces la misma coordenada, o un radio
 * vacío, y la figura se rechaza por degenerada. No falla el `fill` — falla que
 * el valor no llega a cuajar antes de «Aplicar».
 *
 * El golden 32 ya lo había resuelto en su helper `point()`, con un comentario
 * largo explicando exactamente esto, y envolvía relleno+comprobación en un
 * `toPass` para que el paso espere a su PROPIO estado. Pero esa solución no se
 * propagó: los goldens 26, 31 y 33 seguían con la versión ingenua
 * —`fill()` y directo a «Aplicar»—, y son justamente los specs que arrastran
 * historial de rojos intermitentes junto al 32.
 *
 * Este módulo es esa misma solución, una sola vez, para todos.
 *
 * POR QUÉ ESTO NO ES «SUBIR UN RETRY PARA QUE PASE». Lo que se reintenta es la
 * PRECONDICIÓN del paso —que el campo sostenga el valor que se acaba de
 * escribir—, nunca la aserción bajo prueba. El recuento de entidades, el
 * historial y la versión se siguen afirmando fuera, una sola vez y sin
 * reintento. Si el producto no acepta el valor, el `toPass` agota su plazo y la
 * prueba falla igual: no puede tapar un defecto, sólo deja de medir el
 * instante equivocado.
 */
import { expect, type ElementHandle, type Page } from "@playwright/test";

/** Plazo por intento de relleno. Corto a propósito: si no cuaja, se reintenta. */
const ATTEMPT_MS = 1_000;
/** Plazo total. Si en 15 s el campo nunca sostiene el valor, es del producto. */
const SETTLE_MS = 15_000;
/**
 * Ventana de QUIETUD antes de confirmar.
 *
 * El agujero que quedaba: el `toPass` garantiza que los campos sostienen su
 * valor, pero el click de «Aplicar» va DESPUÉS del reintento, así que un
 * re-montaje en ese hueco vaciaba el formulario y el botón confirmaba nada. No
 * se puede meter el click dentro del reintento —lo ejecutaría dos veces y
 * crearía la figura duplicada—, así que en su lugar se exige que el valor siga
 * ahí tras una pausa: si el panel se remontó en la ventana, el intento entero
 * se repite. El hueco pasa de "cualquier instante tras el relleno" a los pocos
 * milisegundos entre la última comprobación y el click.
 */
const QUIET_MS = 150;
/**
 * Ventana para que el commit ANTERIOR termine de re-montar el panel.
 *
 * EL HUECO QUE QUEDABA, y por el que `main` se quedó rojo. `applyDynamicInput`
 * pulsaba «Aplicar» y volvía EN EL ACTO, sin esperar a que React procesara el
 * commit. Así que el que corría el riesgo no era el paso que confirma, sino
 * EL SIGUIENTE: empezaba a rellenar mientras el re-montaje provocado por el
 * commit anterior seguía en vuelo.
 *
 * Y ahí el `toPass` no protege, porque el desenlace ocurre DESPUÉS de su
 * última comprobación:
 *
 *   1. se rellena el formulario viejo (todavía montado) y sostiene su valor;
 *   2. pasa la ventana de quietud y se vuelve a comprobar: sigue bien;
 *   3. **llega el re-montaje**: el panel nuevo nace con `values` vacío;
 *   4. se pulsa «Aplicar» —que es `disabled={!result.ok}`, o sea, ahora
 *      deshabilitado— y el navegador **se come el click sin ruido**.
 *
 * Playwright no falla: comprobó que estaba habilitado antes de despachar y
 * despachó un evento real. El producto no ejecuta nada. La prueba muere varios
 * pasos más tarde, en una aserción que ya no tiene que ver con lo que se rompió
 * — el `Native 0` en vez de `Native 1` del golden 33.
 *
 * La cura no es esperar más: es no dejar un re-montaje en vuelo al volver. Tras
 * confirmar se espera a que el panel que recibió el click DESAPAREZCA, que es
 * la señal observable de que el commit se procesó. Si no desaparece dentro de
 * la ventana es que este commit no cambia de fase (un punto encadenado de
 * PLINE, donde la `key` no varía): entonces no hay re-montaje que pueda
 * pillar al paso siguiente y se sigue sin más.
 */
const REMOUNT_MS = 250;

/**
 * Espera a que el panel que acaba de recibir «Aplicar» deje de existir.
 *
 * Devuelve sin error si sigue ahí: eso significa que no había cambio de fase,
 * que es un desenlace legítimo y no algo que esta función deba juzgar.
 */
async function settleAfterCommit(node: ElementHandle<SVGElement | HTMLElement> | null) {
  if (!node) return;
  try {
    await node.waitForElementState("hidden", { timeout: REMOUNT_MS });
  } catch {
    // Sin cambio de fase: no hay re-montaje en vuelo. Nada que esperar.
  } finally {
    await node.dispose();
  }
}

/** Plazo para que la postcondición de un click de confirmación se cumpla. */
const CONFIRM_MS = 8_000;
/** Intentos de rellenar-y-confirmar antes de rendirse. */
const CONFIRM_ATTEMPTS = 3;

export interface ConfirmOptions {
  /**
   * Postcondición OBSERVABLE de que el click de confirmación surtió efecto.
   *
   * Sin ella el helper se comporta como siempre: rellena, pulsa y vuelve. Con
   * ella, si el click se pierde —el botón quedó deshabilitado en el instante
   * del despacho— se repite el ciclo entero en vez de continuar como si nada
   * y morir tres pasos más allá.
   *
   * Lo que se reintenta sigue siendo la ACCIÓN, nunca la aserción bajo prueba:
   * el recuento de entidades, el historial y la versión se afirman fuera, una
   * sola vez y sin reintento.
   *
   * Y no puede tapar un defecto. Si la operación estuviera realmente rota, la
   * postcondición no se cumpliría nunca y el helper acabaría lanzando. Si por
   * el contrario se aplicara dos veces —porque el efecto llegó tardísimo, tras
   * los 8 s—, el documento tendría un objeto de más y las aserciones del propio
   * golden caerían con estruendo. Los dos desenlaces son un fallo visible; el
   * único que este mecanismo elimina es el silencioso.
   */
  confirmed?: () => Promise<boolean>;
}

/** Sondea una postcondición hasta que se cumple o se agota el plazo. */
async function holds(predicate: () => Promise<boolean>, timeout: number) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export interface DynamicInputOptions {
  /**
   * Botón de modo a pulsar ANTES de rellenar (`ABS`, `REL`, `POLAR`, `Ø`…).
   * Va dentro del reintento porque un re-montaje también resetea el modo, y
   * rellenar con el modo equivocado escribe el valor en otra coordenada.
   */
  mode?: string;
  /** Pulsar «Aplicar» al final. Falso para dejar el panel abierto. */
  apply?: boolean;
}

/**
 * Rellena los campos indicados y aplica cuando TODOS sostienen su valor.
 *
 * Las claves son el sufijo del testid: `x` → `cad-dynamic-field-x`.
 */
export async function applyDynamicInput(
  page: Page,
  fields: Record<string, string>,
  options: DynamicInputOptions = {},
): Promise<void> {
  const dynamic = page.getByTestId("cad-dynamic-input");
  const entries = Object.entries(fields);

  await expect(async () => {
    if (options.mode)
      await dynamic.getByRole("button", { name: options.mode, exact: true }).click();
    for (const [name, value] of entries) {
      const field = page.getByTestId(`cad-dynamic-field-${name}`);
      await expect(field).toBeVisible({ timeout: ATTEMPT_MS });
      await field.fill(value);
    }
    // Se comprueban DESPUÉS de escribirlos todos: rellenar el segundo campo
    // puede remontar el panel y vaciar el primero, y eso hay que verlo.
    for (const [name, value] of entries)
      await expect(page.getByTestId(`cad-dynamic-field-${name}`)).toHaveValue(value, {
        timeout: ATTEMPT_MS,
      });
    // Y siguen ahí tras la ventana de quietud: si el panel se remonta ahora,
    // este intento falla y se repite, en vez de que lo haga entre la
    // comprobación y el click.
    await page.waitForTimeout(QUIET_MS);
    for (const [name, value] of entries)
      await expect(page.getByTestId(`cad-dynamic-field-${name}`)).toHaveValue(value, {
        timeout: ATTEMPT_MS,
      });
  }).toPass({ timeout: SETTLE_MS });

  if (options.apply !== false) {
    // El nodo se captura ANTES del click: es el que hay que ver desaparecer.
    const committed = await dynamic.elementHandle();
    await dynamic.getByRole("button", { name: "Aplicar" }).click();
    await settleAfterCommit(committed);
  }
}

/** Un punto por coordenadas absolutas: el caso más común. */
export async function applyDynamicPoint(
  page: Page,
  x: string,
  y: string,
  options: DynamicInputOptions = {},
): Promise<void> {
  await applyDynamicInput(page, { x, y }, { mode: "ABS", ...options });
}

/**
 * Un grupo de `<select>` que se confirma con un botón, con la misma garantía.
 *
 * Es el tercer sitio donde aparece el mismo patrón vulnerable: se colocan N
 * controles y se pulsa «Aplicar». Si el panel se reconstruye entre medias —al
 * recalcular la selección nativa, por ejemplo— los `select` vuelven a su opción
 * por defecto y el botón ejecuta OTRA operación, o la misma sobre otro objetivo.
 * El síntoma es una propiedad que se queda en su valor de partida, sin error
 * ninguno: el golden 25 esperaba endX=6000 tras un EXTEND y recibía 4000, que es
 * exactamente la línea sin extender.
 *
 * Igual que arriba: se reintenta la PRECONDICIÓN —que los selects sostengan lo
 * elegido—, nunca la aserción bajo prueba, que sigue fuera y sin reintento.
 */
export async function applySelectGroup(
  page: Page,
  selections: Record<string, string>,
  applyTestId: string,
): Promise<void> {
  const entries = Object.entries(selections);
  await expect(async () => {
    for (const [testId, value] of entries) {
      const select = page.getByTestId(testId);
      await expect(select).toBeVisible({ timeout: ATTEMPT_MS });
      await select.selectOption(value);
    }
    // Se comprueban DESPUÉS de colocarlos todos: elegir el segundo puede
    // remontar el panel y resetear el primero, y eso hay que verlo.
    for (const [testId, value] of entries)
      await expect(page.getByTestId(testId)).toHaveValue(value, {
        timeout: ATTEMPT_MS,
      });
    await page.waitForTimeout(QUIET_MS);
    for (const [testId, value] of entries)
      await expect(page.getByTestId(testId)).toHaveValue(value, {
        timeout: ATTEMPT_MS,
      });
  }).toPass({ timeout: SETTLE_MS });

  await page.getByTestId(applyTestId).click();
}

/**
 * N campos de texto identificados por testid, confirmados con un botón.
 *
 * Cuarta forma del mismo patrón vulnerable, y la más común: se rellenan varios
 * campos y se pulsa el botón que los confirma. Si el panel se reconstruye entre
 * medias —al llegar la respuesta de una petición previa, por ejemplo— los
 * campos vuelven a su valor inicial y el botón confirma otra cosa. El síntoma
 * del golden 18 es que la instancia insertada no aparece, sin error ninguno.
 *
 * Igual que el resto: se reintenta la PRECONDICIÓN, nunca la aserción.
 */
export async function applyFieldGroup(
  page: Page,
  fields: Record<string, string>,
  applyTestId: string,
  options: ConfirmOptions = {},
): Promise<void> {
  const entries = Object.entries(fields);
  const fillAndConfirm = async () => {
    await expect(async () => {
      for (const [testId, value] of entries) {
        const field = page.getByTestId(testId);
        await expect(field).toBeVisible({ timeout: ATTEMPT_MS });
        await field.fill(value);
      }
      for (const [testId, value] of entries)
        await expect(page.getByTestId(testId)).toHaveValue(value, {
          timeout: ATTEMPT_MS,
        });
      await page.waitForTimeout(QUIET_MS);
      for (const [testId, value] of entries)
        await expect(page.getByTestId(testId)).toHaveValue(value, {
          timeout: ATTEMPT_MS,
        });
    }).toPass({ timeout: SETTLE_MS });

    await page.getByTestId(applyTestId).click();
  };

  if (!options.confirmed) {
    await fillAndConfirm();
    return;
  }

  for (let attempt = 1; ; attempt += 1) {
    await fillAndConfirm();
    if (await holds(options.confirmed, CONFIRM_MS)) return;
    if (attempt >= CONFIRM_ATTEMPTS)
      throw new Error(
        `«${applyTestId}» no surtió efecto en ${CONFIRM_ATTEMPTS} intentos: ` +
          `el click se despachó pero la postcondición nunca se cumplió en ` +
          `${CONFIRM_MS} ms. Si esto se ve de forma estable, NO es la carrera ` +
          `del re-montaje: es que la operación está rota.`,
      );
  }
}

/**
 * Un campo del panel de PROPIEDADES nativas, con la misma garantía.
 *
 * Aquí el patrón vulnerable es `fill()` + `blur()` y a continuación afirmar
 * sobre el documento. Si el panel se reconstruye entre el relleno y el blur
 * —cosa que pasa al recalcular la entidad seleccionada—, el valor no se aplica
 * y la prueba mide el estado ANTERIOR. Eso es lo que hacía intermitente al
 * golden 14: afirmaba que el borde regenerado del HATCH pasaba de x=8000 y
 * recibía 7804.97, que es exactamente la elipse SIN redimensionar.
 *
 * Igual que arriba: se reintenta la precondición —que el campo sostenga el
 * valor—, nunca la aserción bajo prueba.
 */
export async function applyNativeProperty(
  page: Page,
  name: string,
  value: string,
): Promise<void> {
  const field = page.getByTestId(`cad-native-property-${name}`);
  await expect(async () => {
    await expect(field).toBeVisible({ timeout: ATTEMPT_MS });
    await field.fill(value);
    await field.blur();
    await expect(field).toHaveValue(value, { timeout: ATTEMPT_MS });
  }).toPass({ timeout: SETTLE_MS });
}
