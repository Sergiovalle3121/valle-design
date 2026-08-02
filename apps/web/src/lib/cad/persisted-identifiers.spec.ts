import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  LEGACY_CAD_STUDIO_MODEL,
  LEGACY_CAD_STUDIO_REVISION,
  LEGACY_DXF_XDATA_APPS,
  LEGACY_ENGINEERING_PERMISSION_MAP,
} from "@valle-design/contracts";
import { cadCommandHistoryStorageKey } from "./command-session";
import { cadWorkspaceStorageKey } from "./cad-workspace";

assert.equal(LEGACY_CAD_STUDIO_MODEL, "AXOS-CAD-STUDIO");
assert.equal(LEGACY_CAD_STUDIO_REVISION, "UNIVERSAL");

const legacyStudioPage = readFileSync("src/app/legacy/studio/page.tsx", "utf8");
assert.ok(legacyStudioPage.includes(LEGACY_CAD_STUDIO_MODEL));
assert.ok(legacyStudioPage.includes(LEGACY_CAD_STUDIO_REVISION));

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

assert.equal(
  cadWorkspaceStorageKey({ tenantId: "t-1", userId: "u-1" }),
  "axos_cad_workspace:t-1:u-1",
);
assert.equal(
  cadWorkspaceStorageKey({ tenantId: null, userId: null }),
  "axos_cad_workspace:tenant:user",
);

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
);
assert.equal(
  cadCommandHistoryStorageKey({
    tenantId: null,
    userId: "u-1",
    model: "m",
    revision: "r",
  }),
  null,
);

const xdataGolden = readFileSync(
  "src/lib/cad/dxf-xdata-golden.spec.ts",
  "utf8",
);
for (const application of LEGACY_DXF_XDATA_APPS) {
  assert.ok(xdataGolden.includes(application));
}
assert.deepEqual(LEGACY_ENGINEERING_PERMISSION_MAP["engineering:read"], [
  "cad:view",
]);
assert.deepEqual(LEGACY_ENGINEERING_PERMISSION_MAP["engineering:write"], [
  "cad:edit",
  "cad:review",
  "cad:publish",
]);

const editorSource = readFileSync(
  "src/components/line-engineering/Layout3DEditor.tsx",
  "utf8",
);
assert.ok(editorSource.includes("axos:cad:viewport-bookmarks:"));

const themeSource = readFileSync("src/contexts/ThemeContext.tsx", "utf8");
assert.ok(
  themeSource.includes('"axos_theme"') || themeSource.includes("'axos_theme'"),
);

console.log(
  "persisted-identifiers: legacy boundaries and modern UUID/session invariants hold",
);
