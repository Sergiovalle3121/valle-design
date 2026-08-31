import { strict as assert } from "node:assert";
import { buildCadPaletteEntries, searchCadPalette } from "./command-palette";
import { CAD_COMMAND_REGISTRY_V2 } from "./engine";

const entries = buildCadPaletteEntries();

// --- la unión: el motor entero está en la paleta ----------------------------------
{
  const engineEntries = entries.filter((entry) => entry.kind === "engine");
  assert.equal(
    engineEntries.length,
    CAD_COMMAND_REGISTRY_V2.all().length,
    "todos los comandos del motor aparecen en la paleta",
  );
  for (const entry of engineEntries) {
    assert.ok(entry.description.length > 0, `${entry.id} sin resumen`);
    assert.ok(!entry.description.startsWith("Frase"), "el motor no se etiqueta Frase");
  }
}

// --- buscar por nombre y por alias encuentra la entrada del motor -----------------
{
  const trim = searchCadPalette("TRIM", entries);
  assert.equal(trim[0]?.kind, "engine", "TRIM es una entrada del motor");
  assert.equal(trim[0]?.id, "TRIM");
  assert.equal(trim[0]?.shortcut, "TR", "el primer alias se enseña como atajo");

  const revcloud = searchCadPalette("revcloud", entries);
  assert.equal(revcloud[0]?.id, "REVCLOUD", "insensible a mayúsculas");

  // El alias es palabra clave: quien teclea la memoria muscular encuentra el
  // comando aunque no recuerde el nombre completo.
  const byAlias = searchCadPalette("REC", entries);
  assert.ok(
    byAlias.some((entry) => entry.id === "RECTANG" && entry.kind === "engine"),
    "REC encuentra RECTANG",
  );
}

// --- el registro heredado sigue: alimenta la barra de frases y se dice ----------
{
  const phrase = entries.find(
    (entry) => entry.kind === "command" && entry.id === "measure_distance",
  );
  assert.ok(phrase, "las entradas del registro de frases no se pierden en la unión");
  assert.ok(
    phrase.description.startsWith("Frase · "),
    "y quedan etiquetadas con lo que de verdad ejecutan",
  );
  // Si un id heredado coincidiera con un nombre del motor, ganaría el motor:
  // hoy no hay colisiones y el spec lo deja afirmado para cuando las haya.
  const engineNames = new Set(CAD_COMMAND_REGISTRY_V2.all().map((command) => command.name));
  for (const entry of entries)
    if (entry.kind === "command")
      assert.ok(!engineNames.has(entry.id.toUpperCase()), `${entry.id} duplicaría al motor`);
}

// --- lo de siempre sigue en su sitio ----------------------------------------------
assert.ok(
  entries.some((entry) => entry.kind === "tool" && entry.id === "measure"),
  "includes toolbar entries",
);
assert.ok(
  entries.some((entry) => entry.kind === "symbol" && entry.id === "aoi"),
  "includes symbol entries",
);
assert.equal(
  searchCadPalette("aoi", entries)[0].id,
  "aoi",
  "search ranks exact symbol match",
);

console.log("cad command palette specs passed");
