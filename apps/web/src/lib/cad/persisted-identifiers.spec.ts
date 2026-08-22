import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  LEGACY_CAD_STUDIO_MODEL,
  LEGACY_CAD_STUDIO_REVISION,
  LEGACY_DXF_XDATA_APPS,
} from "@valle-design/contracts";
import {
  cadCommandHistoryStorageKey,
  legacyCadCommandHistoryStorageKey,
  readCadCommandHistory,
  serializeCadCommandHistory,
} from "./command-session";
import {
  cadWorkspaceStorageKey,
  legacyCadWorkspaceStorageKey,
  loadCadWorkspacePreferences,
} from "./cad-workspace";

assert.equal(LEGACY_CAD_STUDIO_MODEL, "AXOS-CAD-STUDIO");
assert.equal(LEGACY_CAD_STUDIO_REVISION, "UNIVERSAL");

const legacyStudioPage = readFileSync("src/app/legacy/studio/page.tsx", "utf8");
assert.ok(legacyStudioPage.includes(LEGACY_CAD_STUDIO_MODEL));
assert.ok(legacyStudioPage.includes(LEGACY_CAD_STUDIO_REVISION));
assert.match(
  legacyStudioPage,
  /designClient\.documents\s*\.list\(\{ model, revision, limit: 1 \}\)/,
);
assert.match(
  legacyStudioPage,
  /item\.model === model && item\.revision === revision/,
);
assert.doesNotMatch(
  legacyStudioPage,
  /rawApiFetch|URLSearchParams|limit:\s*(?:[2-9]|\d{2,})|\.create\(/,
);
assert.doesNotMatch(legacyStudioPage, /method:\s*["']POST["']/);

const studioIndex = readFileSync("src/app/studio/page.tsx", "utf8");
assert.match(studioIndex, /redirect\(["']\/dashboard["']\)/);
assert.doesNotMatch(studioIndex, /AXOS-CAD-STUDIO|UNIVERSAL/);

const documentStudio = readFileSync(
  "src/app/studio/[documentId]/page.tsx",
  "utf8",
);
assert.match(documentStudio, /isDocumentId\(documentId\)/);
assert.doesNotMatch(documentStudio, /AXOS-CAD-STUDIO|UNIVERSAL/);

const sessionSource = readFileSync("src/lib/session.ts", "utf8");
assert.doesNotMatch(
  sessionSource,
  /axos_access_token|Authorization:\s*Bearer|localStorage/,
);

// Preferencias locales: la clave viva lleva el nombre del producto actual…
assert.equal(
  cadWorkspaceStorageKey({ tenantId: "t-1", userId: "u-1" }),
  "valle_cad_workspace:t-1:u-1",
);
assert.equal(
  cadWorkspaceStorageKey({ tenantId: null, userId: null }),
  "valle_cad_workspace:tenant:user",
);
// …y la del nombre anterior sólo sobrevive como lectura de migración.
assert.equal(
  legacyCadWorkspaceStorageKey({ tenantId: "t-1", userId: "u-1" }),
  "axos_cad_workspace:t-1:u-1",
);

{
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  const scope = { tenantId: "t-1", userId: "u-1" };
  store.set(
    legacyCadWorkspaceStorageKey(scope),
    JSON.stringify({ schema: 1, profile: "review", pickBoxPx: 11 }),
  );
  const migrated = loadCadWorkspacePreferences(storage, scope);
  assert.equal(migrated.profile, "review");
  assert.equal(migrated.pickBoxPx, 11);
  // Migrada a la clave nueva y retirada la anterior: se lee una sola vez.
  assert.equal(store.has(legacyCadWorkspaceStorageKey(scope)), false);
  assert.equal(loadCadWorkspacePreferences(storage, scope).profile, "review");
  assert.ok(store.get(cadWorkspaceStorageKey(scope))?.includes('"review"'));
}

const historyScope = {
  tenantId: "t-1",
  userId: "u-1",
  buildingId: "b-1",
  projectId: "p-1",
  model: LEGACY_CAD_STUDIO_MODEL,
  revision: LEGACY_CAD_STUDIO_REVISION,
};
assert.equal(
  cadCommandHistoryStorageKey(historyScope),
  "valle:cad:command-history:v1:t-1:u-1:b-1:p-1:AXOS-CAD-STUDIO:UNIVERSAL",
);
assert.equal(
  legacyCadCommandHistoryStorageKey(historyScope),
  "axos:cad:command-history:v1:t-1:u-1:b-1:p-1:AXOS-CAD-STUDIO:UNIVERSAL",
);
// El aislamiento por tenant/usuario NO se relaja con el renombre: sin ambos,
// no hay clave y el historial no se persiste ni se lee.
for (const build of [
  cadCommandHistoryStorageKey,
  legacyCadCommandHistoryStorageKey,
]) {
  assert.equal(
    build({ tenantId: null, userId: "u-1", model: "m", revision: "r" }),
    null,
  );
}

{
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  const entry = {
    id: "c-1",
    commandId: "align_selection" as const,
    input: { id: "align_selection" as const, mode: "center" as const },
    label: "Alinear selección",
    status: "applied" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  store.set(
    legacyCadCommandHistoryStorageKey(historyScope)!,
    serializeCadCommandHistory([entry]),
  );
  const restored = readCadCommandHistory(storage, historyScope);
  assert.equal(
    restored.length,
    1,
    "el historial anterior sobrevive al renombre",
  );
  assert.equal(restored[0].commandId, "align_selection");
  assert.equal(
    store.has(legacyCadCommandHistoryStorageKey(historyScope)!),
    false,
  );
  assert.ok(store.has(cadCommandHistoryStorageKey(historyScope)!));
}

const xdataGolden = readFileSync(
  "src/lib/cad/dxf-xdata-golden.spec.ts",
  "utf8",
);
for (const application of LEGACY_DXF_XDATA_APPS) {
  assert.ok(xdataGolden.includes(application));
}
const editorSource = readFileSync(
  "src/components/cad/editor/Layout3DEditor.tsx",
  "utf8",
);
// Vistas guardadas: prefijo nuevo al escribir, anterior sólo como migración.
assert.ok(editorSource.includes("valle:cad:viewport-bookmarks:"));
assert.ok(editorSource.includes("axos:cad:viewport-bookmarks:"));
assert.match(
  editorSource,
  /readRenamedStorageKey\(\s*window\.localStorage,\s*viewportBookmarkStorageKey,\s*legacyViewportBookmarkStorageKey,/,
);

// Tema: clave viva `valle_theme`, con la anterior conservada SÓLO como lectura
// de migración (aquí y en el script anti-parpadeo del layout, que corre antes
// de que React monte y decide la clase `.dark` inicial).
const themeSource = readFileSync("src/contexts/ThemeContext.tsx", "utf8");
assert.ok(themeSource.includes('"valle_theme"'));
assert.ok(themeSource.includes('"axos_theme"'));
assert.match(themeSource, /removeItem\(LEGACY_THEME_STORAGE_KEY\)/);

const layoutSource = readFileSync("src/app/layout.tsx", "utf8");
assert.ok(layoutSource.includes("valle_theme"));
assert.ok(layoutSource.includes("axos_theme"));

// Idioma: cookie viva `valle_locale`, respaldo legible a la anterior.
const localeConfig = readFileSync("src/i18n/config.ts", "utf8");
assert.match(localeConfig, /LOCALE_COOKIE = "valle_locale"/);
assert.match(localeConfig, /LEGACY_LOCALE_COOKIE = "axos_locale"/);
const localeActions = readFileSync("src/i18n/locale.ts", "utf8");
assert.match(localeActions, /store\.get\(LEGACY_LOCALE_COOKIE\)/);

console.log(
  "persisted-identifiers: legacy boundaries and modern UUID/session invariants hold",
);
