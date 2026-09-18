import { strict as assert } from "node:assert";
import { documentImportAcceptAttribute } from "./document-import-client";

async function main(): Promise<void> {
  let checks = 0;

  const withDwg = documentImportAcceptAttribute(true);
  assert.equal(
    withDwg,
    ".dxf,.json,.shp,.shx,.dbf,.prj,.cpg,.dwg,.obj,.stl,.gltf,.glb,.dae",
    "P07: con bandera DWG activa, .dwg aparece en accept",
  );
  checks += 1;

  const withoutDwg = documentImportAcceptAttribute(false);
  assert.equal(
    withoutDwg,
    ".dxf,.json,.shp,.shx,.dbf,.prj,.cpg,.obj,.stl,.gltf,.glb,.dae",
    "P07: sin bandera DWG, .dwg NO aparece en accept",
  );
  checks += 1;

  assert.ok(
    withDwg.includes(".dwg") && !withoutDwg.includes(".dwg"),
    "P07: la bandera controla .dwg y nada más",
  );
  checks += 1;

  console.log(`document-import-client.spec: OK — ${checks} comprobaciones`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
