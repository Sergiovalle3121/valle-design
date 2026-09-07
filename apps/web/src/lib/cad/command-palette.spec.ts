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

// --- las entradas «Frase» se retiraron (2026-09-06) y no vuelven por aquí -------
{
  // Prometían «Preview listo en el Copiloto CAD», un panel retirado con la IA y
  // sin «Aplicar» en el editor: cuarenta entradas visibles que terminaban en un
  // estado que nadie pintaba. Fix-or-hide: OCULTA hasta que el circuito se
  // cierre bajo un nombre honesto. El parser sigue en commands/registry.ts.
  assert.equal(
    entries.filter((entry) => entry.kind === "command").length,
    0,
    "la paleta no ofrece entradas de frase",
  );
  for (const entry of entries)
    assert.ok(!entry.description.startsWith("Frase"), `${entry.id} anuncia una frase`);
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
