/**
 * La preferencia de modo (Esencial/Pro), sin DOM.
 *
 * Lo que se afirma es lo que rompería el producto si fallara:
 *
 *  1. La clave es la publicada, con y sin usuario. Desde hoy es un
 *     identificador persistido: `persisted-identifiers.spec.ts` la congela.
 *  2. URL > clave > respaldo, y la URL NO toca el almacén: un golden que abre
 *     `/demo?cadUi=pro` no convierte al siguiente visitante en usuario Pro.
 *  3. Un valor corrupto en cualquier nivel cae al siguiente en vez de romper.
 *  4. La primera vez: /demo ⇒ Esencial; cuenta con espacio de trabajo en este
 *     navegador ⇒ Pro; sin él ⇒ Esencial.
 *  5. Guardar escribe el envoltorio JSON `{mode, v:1}` y nunca lanza.
 *
 * Correr: npx tsx src/lib/cad/ui-mode-preference.spec.ts
 */
import { strict as assert } from "node:assert";
import {
  CAD_UI_MODE_SEARCH_PARAM,
  CAD_UI_MODE_STORAGE_VERSION,
  cadUiModeStorageKey,
  decideInitialCadUiMode,
  normalizeCadUiMode,
  readCadUiModeSearchOverride,
  readStoredCadUiMode,
  resolveCadUiMode,
  storeCadUiMode,
} from "./ui-mode-preference";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

const KEY = cadUiModeStorageKey("u-1");
const guardado = (mode: string) => JSON.stringify({ mode, v: 1 });

// --- 1. LA CLAVE Y EL PARÁMETRO SON LOS PUBLICADOS ---------------------------
{
  ok(cadUiModeStorageKey() === "valle:cad:ui-mode:v1", "sin usuario: clave base");
  ok(cadUiModeStorageKey(null) === "valle:cad:ui-mode:v1", "null cuenta como sin usuario");
  ok(cadUiModeStorageKey("u-1") === "valle:cad:ui-mode:v1:u-1", "con usuario: sufijo");
  ok(cadUiModeStorageKey("u-1") !== cadUiModeStorageKey("u-2"), "dos usuarios, dos claves");
  ok(CAD_UI_MODE_SEARCH_PARAM === "cadUi", "el parámetro de URL es ?cadUi=");
  ok(CAD_UI_MODE_STORAGE_VERSION === 1, "la versión del envoltorio es 1");
}

// --- 2. NORMALIZAR ------------------------------------------------------------
{
  ok(normalizeCadUiMode("esencial") === "esencial", "esencial se normaliza");
  ok(normalizeCadUiMode("pro") === "pro", "pro se normaliza");
  ok(normalizeCadUiMode("PRO") === null, "no se admiten mayúsculas: no se inventa");
  ok(normalizeCadUiMode("") === null, "cadena vacía se rechaza");
  ok(normalizeCadUiMode(undefined) === null, "undefined se rechaza");
}

// --- 3. LA URL GANA Y NO PERSISTE -------------------------------------------
{
  const storage = memoryStorage({ [KEY]: guardado("esencial") });
  ok(
    resolveCadUiMode({ storage, search: "?cadUi=pro", key: KEY, fallback: "esencial" }) === "pro",
    "?cadUi=pro gana a una preferencia esencial guardada",
  );
  ok(storage.map.get(KEY) === guardado("esencial"), "…y el almacén queda intacto");
  ok(
    resolveCadUiMode({ storage: memoryStorage({ [KEY]: guardado("pro") }), search: "cadUi=esencial", key: KEY, fallback: "pro" }) === "esencial",
    "sin el interrogante inicial también fuerza esencial",
  );
  ok(readCadUiModeSearchOverride("?cadUi=nope") === null, "un override ilegible no cuenta");
  ok(readCadUiModeSearchOverride("?otro=1") === null, "otro parámetro no cuenta");
  ok(readCadUiModeSearchOverride(null) === null, "sin búsqueda no hay override");
  ok(
    resolveCadUiMode({ storage: memoryStorage({ [KEY]: guardado("esencial") }), search: "?cadUi=nope", key: KEY, fallback: "pro" }) === "esencial",
    "un override ilegible cae a lo guardado, no al respaldo",
  );
}

// --- 4. LA CLAVE GANA AL RESPALDO; LA BASURA CAE AL RESPALDO ------------------
{
  ok(
    resolveCadUiMode({ storage: memoryStorage({ [KEY]: guardado("esencial") }), key: KEY, fallback: "pro" }) === "esencial",
    "sin URL, {mode:'esencial'} guardado ⇒ esencial",
  );
  ok(
    resolveCadUiMode({ storage: memoryStorage(), key: KEY, fallback: "pro" }) === "pro",
    "almacén vacío ⇒ respaldo",
  );
  ok(
    resolveCadUiMode({ storage: memoryStorage({ [KEY]: "{{roto" }), key: KEY, fallback: "pro" }) === "pro",
    "JSON roto ⇒ respaldo",
  );
  ok(
    resolveCadUiMode({ storage: memoryStorage({ [KEY]: "esencial" }), key: KEY, fallback: "pro" }) === "pro",
    "una cadena suelta sin envoltorio no se acepta: cae al respaldo",
  );
  ok(
    resolveCadUiMode({ storage: memoryStorage({ [KEY]: guardado("turbo") }), key: KEY, fallback: "esencial" }) === "esencial",
    "un modo desconocido dentro del envoltorio ⇒ respaldo",
  );
  ok(
    readStoredCadUiMode(memoryStorage({ [KEY]: JSON.stringify({ mode: "pro", v: 7, presetApplied: true }) }), KEY) === "pro",
    "campos extra y versión futura no invalidan el modo: la clave admite crecer",
  );
  ok(
    resolveCadUiMode({ storage: memoryStorage({ [cadUiModeStorageKey("u-2")]: guardado("esencial") }), key: KEY, fallback: "pro" }) === "pro",
    "la clave de otro usuario no se lee",
  );
  ok(resolveCadUiMode({ key: KEY, fallback: "esencial" }) === "esencial", "sin almacén ⇒ respaldo");
}

// --- 5. LA PRIMERA VEZ --------------------------------------------------------
{
  const workspaceKey = "valle_cad_workspace:t-1:u-1";
  ok(
    decideInitialCadUiMode({ storage: memoryStorage({ [workspaceKey]: "{}" }), workspaceKey, forceEsencial: true }) === "esencial",
    "forceEsencial (/demo) ⇒ esencial aunque haya espacio de trabajo",
  );
  ok(
    decideInitialCadUiMode({ storage: memoryStorage({ [workspaceKey]: "{}" }), workspaceKey }) === "pro",
    "con espacio de trabajo en este navegador ⇒ pro",
  );
  ok(
    decideInitialCadUiMode({ storage: memoryStorage(), workspaceKey }) === "esencial",
    "sin espacio de trabajo ⇒ esencial (primera vez)",
  );
  ok(decideInitialCadUiMode({ storage: memoryStorage() }) === "esencial", "sin clave de espacio ⇒ esencial");
  ok(decideInitialCadUiMode({ workspaceKey }) === "esencial", "sin almacén ⇒ esencial");
}

// --- 6. GUARDAR ---------------------------------------------------------------
{
  const storage = memoryStorage();
  storeCadUiMode(storage, KEY, "pro");
  ok(storage.map.get(KEY) === guardado("pro"), "se guarda el envoltorio {mode, v:1} bajo la clave publicada");
  ok(readStoredCadUiMode(storage, KEY) === "pro", "lo guardado se relee tal cual");
  storeCadUiMode(null, KEY, "esencial");
  ok(true, "guardar sin almacén es un no-op");
  storeCadUiMode({ getItem: () => null }, KEY, "esencial");
  ok(true, "guardar en un almacén de sólo lectura es un no-op");
}

// --- 7. UN ALMACÉN QUE LANZA NO ROMPE NADA -----------------------------------
{
  const hostile = {
    getItem(): string | null {
      throw new Error("bloqueado");
    },
    setItem(): void {
      throw new Error("bloqueado");
    },
  };
  ok(
    resolveCadUiMode({ storage: hostile, key: KEY, fallback: "pro" }) === "pro",
    "un almacén que lanza al leer cae al respaldo",
  );
  ok(
    decideInitialCadUiMode({ storage: hostile, workspaceKey: "valle_cad_workspace:t:u" }) === "esencial",
    "sin poder leer el espacio de trabajo, la primera vez es esencial",
  );
  storeCadUiMode(hostile, KEY, "pro");
  ok(true, "guardar en un almacén que lanza no propaga la excepción");
}

console.log(`ui-mode-preference: ${checks}/${checks} comprobaciones verdes`);
