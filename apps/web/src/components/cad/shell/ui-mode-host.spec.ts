/**
 * El anfitrión del modo Esencial/Pro: se ata a la sesión, persiste y falla
 * ABIERTO.
 *
 * Lo que se afirma es lo que rompería el producto si fallara:
 *
 *  1. Sin atar, es Pro: los specs que pintan la cinta aislada siguen viendo
 *     la cinta entera.
 *  2. La primera vez decide y GUARDA: sin espacio de trabajo en este
 *     navegador ⇒ Esencial; con él ⇒ Pro; /demo ⇒ Esencial siempre.
 *  3. `?cadUi=` manda y NO se persiste, ni al atar ni al cambiar después.
 *  4. Cambiar de modo publica y persiste bajo la clave del usuario.
 *  5. Atar dos veces al mismo usuario no relee ni publica; otro usuario sí.
 *  6. Sin `localStorage` —pestaña privada— el estudio sigue funcionando.
 *  7. El interruptor pinta lo que el anfitrión dice y con los atributos que
 *     los goldens localizan.
 *
 * Correr: npx tsx src/components/cad/shell/ui-mode-host.spec.ts
 */
import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

/** `localStorage` de mentira, para poder probar el anfitrión en Node. */
class MemoryStorage {
  readonly map = new Map<string, string>();
  /** Cuando está en `true`, leer y escribir LANZAN — como en una pestaña privada. */
  sealed = false;
  getItem = (key: string): string | null => {
    if (this.sealed) throw new Error("acceso denegado");
    return this.map.get(key) ?? null;
  };
  setItem = (key: string, value: string): void => {
    if (this.sealed) throw new Error("acceso denegado");
    this.map.set(key, value);
  };
}

const storage = new MemoryStorage();
(globalThis as unknown as { window: unknown }).window = { localStorage: storage };

const guardado = (mode: string) => JSON.stringify({ mode, v: 1 });

/**
 * Los módulos se cargan DESPUÉS de plantar el `window` de mentira, y por eso
 * entran por `import()` dentro de la función: un import estático se izaría por
 * encima y el anfitrión leería un `window` que todavía no existe.
 */
async function specs(): Promise<void> {
  const { cadUiModeHost } = await import("./ui-mode-host");
  const { CadUiModeSwitch } = await import("./CadUiModeSwitch");
  const KEY_U1 = "valle:cad:ui-mode:v1:u-1";

  // --- 1. SIN ATAR, PRO ------------------------------------------------------
  {
    ok(cadUiModeHost.getSnapshot() === "pro", "sin atar, la instantánea es pro");
    ok(cadUiModeHost.getServerSnapshot() === "pro", "en servidor, pro");
    ok(storage.map.size === 0, "y no se ha escrito nada");
  }

  // --- 2. LA PRIMERA VEZ DECIDE Y GUARDA -------------------------------------
  {
    cadUiModeHost.reset();
    let notified = 0;
    const off = cadUiModeHost.subscribe(() => {
      notified += 1;
    });
    const mode = cadUiModeHost.attach({ userId: "u-1", tenantId: "t-1" });
    ok(mode === "esencial", "sin espacio de trabajo en este navegador ⇒ esencial");
    ok(cadUiModeHost.getSnapshot() === "esencial", "la instantánea cambia");
    ok(notified === 1, "y se publica una vez");
    ok(storage.map.get(KEY_U1) === guardado("esencial"), "la decisión se guarda bajo la clave del usuario");
    off();

    // Quien ya abrió el estudio aquí (existe su espacio de trabajo) entra en Pro.
    cadUiModeHost.reset();
    storage.map.set("valle_cad_workspace:t-1:u-2", "{}");
    ok(cadUiModeHost.attach({ userId: "u-2", tenantId: "t-1" }) === "pro", "con espacio de trabajo ⇒ pro");
    ok(storage.map.get("valle:cad:ui-mode:v1:u-2") === guardado("pro"), "…y también se persiste");

    // /demo: sin sesión y forzado a Esencial, aunque hubiera espacio de trabajo.
    cadUiModeHost.reset();
    storage.map.set("valle_cad_workspace:tenant:user", "{}");
    ok(cadUiModeHost.attach({ defaultMode: "esencial" }) === "esencial", "/demo arranca en esencial");
    ok(storage.map.get("valle:cad:ui-mode:v1") === guardado("esencial"), "la clave sin usuario es la base");
  }

  // --- 3. LA URL MANDA Y NO PERSISTE ----------------------------------------
  {
    cadUiModeHost.reset();
    storage.map.clear();
    storage.map.set(KEY_U1, guardado("pro"));
    ok(
      cadUiModeHost.attach({ userId: "u-1", tenantId: "t-1", search: "?cadUi=esencial" }) === "esencial",
      "?cadUi=esencial gana a la preferencia pro guardada",
    );
    ok(storage.map.get(KEY_U1) === guardado("pro"), "la URL no toca lo guardado");

    // Cambiar en una sesión forzada se ve, pero no se guarda.
    cadUiModeHost.set("pro");
    ok(cadUiModeHost.getSnapshot() === "pro", "set publica en sesión forzada");
    cadUiModeHost.set("esencial");
    ok(storage.map.get(KEY_U1) === guardado("pro"), "…sin persistir: el experimento muere con la pestaña");

    // Contexto limpio + ?cadUi=pro: nada escrito (golden 226, último paso).
    cadUiModeHost.reset();
    storage.map.clear();
    ok(cadUiModeHost.attach({ defaultMode: "esencial", search: "cadUi=pro" }) === "pro", "?cadUi=pro fuerza pro en /demo");
    ok(storage.map.size === 0, "y no deja rastro en el almacén");
  }

  // --- 4. CAMBIAR PUBLICA Y PERSISTE -----------------------------------------
  {
    cadUiModeHost.reset();
    storage.map.clear();
    cadUiModeHost.attach({ userId: "u-1", tenantId: "t-1" });
    let notified = 0;
    const off = cadUiModeHost.subscribe(() => {
      notified += 1;
    });
    cadUiModeHost.set("pro");
    ok(cadUiModeHost.getSnapshot() === "pro", "set('pro') cambia la instantánea");
    ok(notified === 1, "y notifica");
    ok(storage.map.get(KEY_U1) === guardado("pro"), "y persiste");
    // Repetir el mismo modo no publica: un render por cada latido sería ruido.
    cadUiModeHost.set("pro");
    ok(notified === 1, "set con el mismo modo no publica");
    cadUiModeHost.toggle();
    ok(cadUiModeHost.getSnapshot() === "esencial" && notified === 2, "toggle alterna y publica");
    ok(storage.map.get(KEY_U1) === guardado("esencial"), "toggle también persiste");
    off();

    // Simula reabrir el estudio: lo guardado es lo que se relee.
    cadUiModeHost.reset();
    ok(cadUiModeHost.attach({ userId: "u-1", tenantId: "t-1" }) === "esencial", "al volver, se relee lo guardado");
  }

  // --- 5. IDEMPOTENTE POR CLAVE ----------------------------------------------
  {
    cadUiModeHost.reset();
    storage.map.clear();
    cadUiModeHost.attach({ userId: "u-1", tenantId: "t-1" });
    cadUiModeHost.set("pro");
    let notified = 0;
    const off = cadUiModeHost.subscribe(() => {
      notified += 1;
    });
    // Alguien cambia el almacén por detrás: un segundo attach del mismo
    // usuario NO relee (es lo que pasa en cada render de CadStudioHost).
    storage.map.set(KEY_U1, guardado("esencial"));
    ok(cadUiModeHost.attach({ userId: "u-1", tenantId: "t-1" }) === "pro", "el segundo attach del mismo usuario no relee");
    ok(notified === 0, "ni publica");
    // Otro usuario en la misma máquina sí resuelve de nuevo.
    ok(cadUiModeHost.attach({ userId: "u-9", tenantId: "t-1" }) === "esencial", "otro usuario resuelve su propia clave");
    ok(notified === 1, "y ese cambio sí se publica");
    off();
  }

  // --- 6. SIN ALMACENAMIENTO, EL ESTUDIO SIGUE -------------------------------
  {
    cadUiModeHost.reset();
    storage.sealed = true;
    // Ni leer ni escribir pueden lanzar hacia fuera.
    ok(cadUiModeHost.attach({ userId: "u-3", tenantId: "t-1" }) === "esencial", "con el almacén bloqueado, la primera vez es esencial");
    cadUiModeHost.set("pro");
    ok(cadUiModeHost.getSnapshot() === "pro", "y cambiar de modo funciona en la sesión");
    storage.sealed = false;
  }

  // --- 7. EL INTERRUPTOR ------------------------------------------------------
  {
    // `renderToStaticMarkup` usa la instantánea de SERVIDOR: pro, atado o no.
    cadUiModeHost.reset();
    cadUiModeHost.attach({ defaultMode: "esencial" });
    const html = renderToStaticMarkup(createElement(CadUiModeSwitch));
    ok(html.includes('data-testid="cad-ui-mode-switch"'), "lleva el testid que localizan los goldens");
    ok(html.includes('role="switch"'), "es un switch");
    ok(html.includes('aria-checked="true"'), "en servidor está encendido: pro");
    ok(html.includes('data-mode="pro"'), "y lo dice también en data-mode");
    ok(html.includes('aria-label="Cambiar a modo Esencial"'), "el nombre accesible es la acción");
    ok(/>Pro<\/span>/.test(html), "el rótulo visible es «Pro»");
    ok(html.includes('type="button"'), "es un botón, no un envío de formulario");
    ok(!/\babsolute\b|\bfixed\b/.test(html), "sin absolute ni fixed: no puede salirse de su fila");
    ok(!/#[0-9a-fA-F]{3,8}\b/.test(html), "sin hex sueltos: todo color sale de un token");
    ok(!/text-\[[0-9.]+(?:px|rem)\]/.test(html), "sin tamaños de letra fuera de la escala");
    cadUiModeHost.reset();
  }

  console.log(`ui-mode-host: ${checks}/${checks} comprobaciones verdes`);
}

void specs();
