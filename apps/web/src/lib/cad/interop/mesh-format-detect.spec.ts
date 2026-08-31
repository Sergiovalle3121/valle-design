import assert from "node:assert/strict";
import { isMeshImportFileName, meshImportFormatOf } from "./mesh-format-detect";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

ok(meshImportFormatOf("modelo.obj") === "obj", "obj");
ok(meshImportFormatOf("modelo.STL") === "stl", "stl, sin distinguir mayúsculas");
ok(meshImportFormatOf("modelo.gltf") === "gltf", "gltf");
ok(meshImportFormatOf("modelo.glb") === "gltf", "glb también es gltf");
ok(meshImportFormatOf("modelo.dae") === "collada", "dae");
ok(meshImportFormatOf("modelo.skp") === null, ".skp no es un formato de MALLA — se rechaza aparte, no aquí");
ok(meshImportFormatOf("modelo.dxf") === null, "dxf no es un formato de malla");
ok(meshImportFormatOf("sin_extension") === null, "sin extensión");
ok(isMeshImportFileName("a.obj") && !isMeshImportFileName("a.dxf"), "isMeshImportFileName delega en el mismo mapa");

console.log(`✔ mesh-format-detect: ${checks} aserciones verdes`);
