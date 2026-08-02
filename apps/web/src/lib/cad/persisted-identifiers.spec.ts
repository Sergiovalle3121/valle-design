/**
 * RED DE SEGURIDAD de los IDENTIFICADORES PERSISTIDOS.
 *
 * Los valores que se afirman aquí NO son nombres de código: son DATOS que ya
 * viven en la base de datos de tenants reales (`model` / `revision` de los
 * documentos del CAD Studio universal) y en el `localStorage` de navegadores
 * reales (preferencias, historial de comandos, marcadores de vista, token de
 * sesión, tema). Renombrarlos sin una migración bidireccional pierde datos de
 * usuario en silencio.
 *
 * Por eso este spec existe ANTES de podar y renombrar `packages/contracts`:
 * el renombre del PAQUETE es libre; el renombre de estos LITERALES no lo es.
 *
 * Si un cambio rompe este spec, el cambio está mal — no el spec.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  LEGACY_CAD_STUDIO_MODEL,
  LEGACY_CAD_STUDIO_REVISION,
} from "@valle-design/contracts";
import { cadCommandHistoryStorageKey } from "./command-session";
import { cadWorkspaceStorageKey } from "./cad-workspace";
import { TOKEN_STORAGE_KEY } from "../session";

/* ── 1. Centinelas persistidos del CAD Studio universal ─────────────────── */

assert.equal(
  LEGACY_CAD_STUDIO_MODEL,
  "AXOS-CAD-STUDIO",
  "el modelo centinela persistido no puede cambiar de valor sin migración de datos",
);
assert.equal(
  LEGACY_CAD_STUDIO_REVISION,
  "UNIVERSAL",
  "la revisión centinela persistida no puede cambiar de valor sin migración de datos",
);

// El flujo del studio abre EXACTAMENTE ese par (model, revision): si la
// página deja de usarlos, los dibujos guardados bajo ese alias dejan de
// reabrirse.
const studioPage = readFileSync("src/app/studio/page.tsx", "utf8");
assert.ok(
  studioPage.includes(`"${LEGACY_CAD_STUDIO_MODEL}"`) ||
    studioPage.includes(`'${LEGACY_CAD_STUDIO_MODEL}'`),
  "/studio debe seguir abriendo el modelo AXOS-CAD-STUDIO",
);
assert.ok(
  studioPage.includes(`"${LEGACY_CAD_STUDIO_REVISION}"`) ||
    studioPage.includes(`'${LEGACY_CAD_STUDIO_REVISION}'`),
  "/studio debe seguir abriendo la revisión UNIVERSAL",
);

/* ── 2. Claves de localStorage ──────────────────────────────────────────── */

// Token de sesión de Platform: compartido con el arnés E2E y con cualquier
// despliegue junto a Platform.
assert.equal(TOKEN_STORAGE_KEY, "axos_access_token");

// Preferencias del workspace CAD, con ámbito tenant + usuario.
assert.equal(
  cadWorkspaceStorageKey({ tenantId: "t-1", userId: "u-1" }),
  "axos_cad_workspace:t-1:u-1",
);
assert.equal(
  cadWorkspaceStorageKey({ tenantId: null, userId: null }),
  "axos_cad_workspace:tenant:user",
);

// Historial de comandos: prefijo versionado + ámbito completo.
const historyKey = cadCommandHistoryStorageKey({
  tenantId: "t-1",
  userId: "u-1",
  buildingId: "b-1",
  projectId: "p-1",
  model: LEGACY_CAD_STUDIO_MODEL,
  revision: LEGACY_CAD_STUDIO_REVISION,
});
assert.equal(
  historyKey,
  "axos:cad:command-history:v1:t-1:u-1:b-1:p-1:AXOS-CAD-STUDIO:UNIVERSAL",
  "el historial de comandos ya persistido debe seguir encontrándose",
);
assert.equal(
  cadCommandHistoryStorageKey({
    tenantId: null,
    userId: "u-1",
    model: "m",
    revision: "r",
  }),
  null,
  "sin tenant autenticado no se persiste historial",
);

// Marcadores de vista: la clave se compone inline en el editor.
const editorSource = readFileSync(
  "src/components/line-engineering/Layout3DEditor.tsx",
  "utf8",
);
assert.ok(
  editorSource.includes("axos:cad:viewport-bookmarks:"),
  "los marcadores de vista ya guardados deben seguir encontrándose",
);

// Tema: clave heredada del origen, compartida con Platform.
const themeSource = readFileSync("src/contexts/ThemeContext.tsx", "utf8");
assert.ok(
  themeSource.includes('"axos_theme"') || themeSource.includes("'axos_theme'"),
  "la preferencia de tema ya guardada debe seguir encontrándose",
);

console.log("persisted-identifiers: identificadores persistidos intactos");
