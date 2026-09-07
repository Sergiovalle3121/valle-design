/**
 * T-16: el mismo archivo recibe el MISMO veredicto por las dos puertas.
 *
 * El tablero pregunta a `validateImportFile`; el estudio, a
 * `admitStudioBackdropFile`, que pregunta a la misma función. Aquí se
 * enfrentan las dos sobre los mismos nombres y tamaños —con la beta DWG
 * apagada y encendida, cosa que un navegador de CI no puede hacer porque la
 * bandera es de build— y se exige que, cuando el tablero rechaza, el estudio
 * rechace con la MISMA frase; y que, cuando el tablero admite algo que el
 * fondo no puede pintar, el estudio lo diga en vez de fingir que no existe.
 * La puerta del navegador (mismo `.dwg`, mismas palabras en las dos
 * pantallas) vive en el golden 192.
 */
import assert from "node:assert/strict";
import { admitStudioBackdropFile, backdropDocumentOnlyMessage } from "./document-import-door";
import { MAX_DXF_IMPORT_BYTES, validateImportFile } from "./document-import-validation";
import { DWG_UNAVAILABLE_REASON } from "./dwg-unavailable-reason";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

/** Lo que diría el tablero: la frase que lanza, o `null` si admite. */
function veredictoDelTablero(name: string, size: number, beta: boolean): string | null {
  try {
    validateImportFile(name, size, beta);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

// --- la tabla: cada fila se pasa por las dos puertas ----------------------
const casos: Array<{ name: string; size: number; beta: boolean; fondo: boolean }> = [
  { name: "planta.dwg", size: 4_096, beta: false, fondo: false },
  { name: "planta.dwg", size: 4_096, beta: true, fondo: false },
  { name: "PLANTA.DWG", size: 4_096, beta: false, fondo: false },
  { name: "planta.dxf", size: 4_096, beta: false, fondo: true },
  { name: "planta.dxf", size: MAX_DXF_IMPORT_BYTES, beta: false, fondo: true },
  { name: "planta.dxf", size: MAX_DXF_IMPORT_BYTES + 1, beta: false, fondo: false },
  { name: "planta.dxf", size: 0, beta: false, fondo: false },
  { name: "modelo.skp", size: 10, beta: false, fondo: false },
  { name: "catastro.shp", size: 10, beta: false, fondo: false },
  { name: "modelo.glb", size: 10, beta: false, fondo: false },
  { name: "plano.json", size: 10, beta: false, fondo: false },
  { name: "sin-extension", size: 10, beta: false, fondo: false },
];
for (const caso of casos) {
  const tablero = veredictoDelTablero(caso.name, caso.size, caso.beta);
  const estudio = admitStudioBackdropFile({ name: caso.name, size: caso.size }, caso.beta);
  const etiqueta = `${caso.name} (${caso.size} B, beta ${caso.beta ? "encendida" : "apagada"})`;
  if (tablero !== null) {
    ok(
      !estudio.ok && estudio.reason === "rechazado" && estudio.message === tablero,
      `${etiqueta}: el tablero rechaza y el estudio rechaza con la MISMA frase`,
    );
  } else if (caso.fondo) {
    ok(estudio.ok, `${etiqueta}: el tablero admite y el fondo del estudio lo pinta`);
  } else {
    ok(
      !estudio.ok && estudio.reason === "entra-como-documento",
      `${etiqueta}: el tablero admite; el estudio no lo pinta de fondo y dice por dónde entra`,
    );
  }
}

// --- el .dwg con la beta apagada dice SU motivo, no «formato no soportado» --
{
  const cerrado = admitStudioBackdropFile({ name: "planta.dwg", size: 4_096 }, false);
  ok(!cerrado.ok && cerrado.message === DWG_UNAVAILABLE_REASON, "la razón DWG del contrato, palabra por palabra");
  ok(
    veredictoDelTablero("planta.dwg", 4_096, false) === DWG_UNAVAILABLE_REASON,
    "y el tablero dice esa misma razón, no la lista de formatos",
  );
  assert.throws(() => validateImportFile("planta.dwg", 4_096, false), (error: Error) => error.message === DWG_UNAVAILABLE_REASON);
  checks += 1;
}

// --- el .dwg con la beta encendida: admitido, y el estudio dice por dónde ---
{
  const abierto = admitStudioBackdropFile({ name: "planta.dwg", size: 4_096 }, true);
  ok(!abierto.ok && abierto.reason === "entra-como-documento", "con la beta, el estudio ya no dice que el editor no lee DWG");
  ok(
    !abierto.ok && abierto.message.includes("«Importar como documento»") && abierto.message.includes("DXF"),
    "el mensaje nombra la puerta por la que entra y lo que el fondo sí lee",
  );
  assert.equal(abierto.ok ? "" : abierto.message, backdropDocumentOnlyMessage("planta.dwg"));
  ok(backdropDocumentOnlyMessage("planta.dwg").startsWith("Este DWG "), "el formato se nombra en mayúsculas");
  ok(backdropDocumentOnlyMessage("sin-extension").startsWith("Este archivo "), "sin extensión no se inventa un formato");
}

// --- el tope se mide en BYTES declarados, sin leer: la firma no admite `text()`
{
  const grande = admitStudioBackdropFile({ name: "planta.dxf", size: MAX_DXF_IMPORT_BYTES + 1 }, false);
  ok(!grande.ok && /supera el límite de \d+ MB/.test(grande.message), "el tope lo dice la puerta compartida, con su cifra");
  ok(
    !grande.ok && grande.message === veredictoDelTablero("planta.dxf", MAX_DXF_IMPORT_BYTES + 1, false),
    "y es la misma frase que en el tablero",
  );
  // La beta abierta no cambia el tope del DXF ni el veredicto de un DXF.
  const conBeta = admitStudioBackdropFile({ name: "planta.dxf", size: 4_096 }, true);
  ok(conBeta.ok, "un DXF entra igual con la beta encendida");
}

// --- el .dwg se decide por extensión, antes de mirar bytes: da igual el tamaño
{
  const enorme = admitStudioBackdropFile({ name: "planta.dwg", size: 999_999_999 }, false);
  ok(!enorme.ok && enorme.message === DWG_UNAVAILABLE_REASON, "con la beta apagada, un .dwg enorme recibe la razón DWG, no la del tamaño");
}

console.log(
  `document-import-door: ${checks} comprobaciones — el estudio y el tablero contestan lo mismo al mismo archivo (T-16)`,
);
