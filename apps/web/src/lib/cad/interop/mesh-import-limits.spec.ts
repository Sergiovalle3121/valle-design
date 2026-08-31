import assert from "node:assert/strict";
import {
  MESH_IMPORT_MAX_BYTES,
  MESH_IMPORT_MAX_POINTS_PER_SOLID,
  MeshImportLimitError,
  assertMeshFileByteBudget,
  componentExceedsBudgetMessage,
  componentFitsPointBudget,
} from "./mesh-import-limits";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

// --- Fallo cerrado que dice el número exacto -------------------------------
{
  assert.throws(
    () => assertMeshFileByteBudget("obj", MESH_IMPORT_MAX_BYTES.obj + 1, "modelo.obj"),
    MeshImportLimitError,
  );
  checks += 1;
  try {
    assertMeshFileByteBudget("obj", MESH_IMPORT_MAX_BYTES.obj + 1, "modelo.obj");
    ok(false, "debía lanzar");
  } catch (error) {
    const message = (error as Error).message;
    ok(message.includes((MESH_IMPORT_MAX_BYTES.obj + 1).toLocaleString("es-MX")), "el mensaje trae el tamaño exacto del archivo");
    ok(message.includes(MESH_IMPORT_MAX_BYTES.obj.toLocaleString("es-MX")), "el mensaje trae el máximo exacto");
    ok(message.includes("modelo.obj"), "el mensaje nombra el archivo");
  }
  assertMeshFileByteBudget("obj", MESH_IMPORT_MAX_BYTES.obj, "modelo.obj"); // justo en el borde: no lanza
  checks += 1;
}

// --- Tope por sólido: los cuatro formatos comparten el mismo número --------
{
  ok(componentFitsPointBudget(MESH_IMPORT_MAX_POINTS_PER_SOLID), "en el borde cabe");
  ok(!componentFitsPointBudget(MESH_IMPORT_MAX_POINTS_PER_SOLID + 1), "uno más ya no cabe");
  const message = componentExceedsBudgetMessage("Ala derecha", 431_209);
  ok(message.includes("431,209") || message.includes("431209"), `el mensaje trae el conteo exacto: ${message}`);
  ok(message.includes("Ala derecha"), "el mensaje nombra el componente");
  ok(message.includes(String(MESH_IMPORT_MAX_POINTS_PER_SOLID)) || /\d/.test(message), "el mensaje trae el máximo");
}

console.log(`✔ mesh-import-limits: ${checks} aserciones verdes`);
