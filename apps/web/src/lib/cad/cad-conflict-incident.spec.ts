/**
 * Un conflicto CAS pertenece a UN documento.
 *
 * El enclavamiento se guardaba en un único `saveConflictRef` y se comparaba
 * sólo por número de versión. Los números de versión no son únicos entre
 * documentos: son contadores que arrancan en 0 en cada uno. Así que un
 * conflicto en el plano A, con base v3, detenía el autosave del plano B en
 * cuanto B pasaba también por su v3 — un documento que nadie había tocado desde
 * otra sesión y que no tenía ningún conflicto.
 *
 * El efecto es el peor posible para un editor: el trabajo en B deja de subir al
 * servidor y la única señal es una etiqueta que habla de un conflicto de otro
 * dibujo.
 *
 * Aquí se describe el registro de incidentes: uno por documento, con identidad
 * propia, y las reglas que impiden que una respuesta tardía o un tercer
 * escritor pisen la decisión de alguien.
 */
import { strict as assert } from "node:assert";
import {
  archiveCadConflictsExcept,
  cadAutosaveBlockedForDocument,
  cadConflictIncidentFor,
  cadConflictIncidentLabel,
  closeCadConflictIncident,
  openCadConflictIncident,
  type CadConflictRegistry,
} from "./cad-conflict-incident";

const empty: CadConflictRegistry = {};

// ---------------------------------------------------------------------------
// 1. EL DEFECTO: un conflicto en A no puede detener el autosave de B
// ---------------------------------------------------------------------------

{
  // El plano A choca con base v3.
  const registry = openCadConflictIncident(empty, {
    documentId: "doc-A",
    baseVersion: 3,
    serverVersion: 7,
  });

  assert.equal(
    cadAutosaveBlockedForDocument(registry, "doc-A", 3),
    true,
    "el documento que chocó sí deja de reintentar la versión que el servidor rechazó",
  );
  assert.equal(
    cadAutosaveBlockedForDocument(registry, "doc-B", 3),
    false,
    "otro documento con el MISMO número de versión no tiene nada que ver: los contadores no son únicos entre dibujos",
  );
  assert.equal(
    cadAutosaveBlockedForDocument(registry, "doc-A", 4),
    false,
    "y en cuanto la base propia se mueve, el enclavamiento deja de aplicar solo",
  );
}

// ---------------------------------------------------------------------------
// 2. Cambiar de documento archiva el incidente anterior
// ---------------------------------------------------------------------------

{
  let registry = openCadConflictIncident(empty, {
    documentId: "doc-A",
    baseVersion: 3,
    serverVersion: 7,
  });
  registry = openCadConflictIncident(registry, {
    documentId: "doc-B",
    baseVersion: 1,
    serverVersion: 2,
  });
  assert.equal(Object.keys(registry).length, 2, "dos documentos pueden tener conflicto a la vez");

  const only = archiveCadConflictsExcept(registry, "doc-B");
  assert.equal(cadConflictIncidentFor(only, "doc-A"), null, "el panel del anterior no se queda colgado");
  assert.equal(cadConflictIncidentFor(only, "doc-B")?.documentId, "doc-B");

  const none = archiveCadConflictsExcept(registry, null);
  assert.deepEqual(none, {}, "cerrar el editor no deja incidentes vivos");
}

// ---------------------------------------------------------------------------
// 3. Cerrar un incidente no toca a los demás
// ---------------------------------------------------------------------------

{
  let registry = openCadConflictIncident(empty, {
    documentId: "doc-A",
    baseVersion: 3,
    serverVersion: 7,
  });
  registry = openCadConflictIncident(registry, {
    documentId: "doc-B",
    baseVersion: 1,
    serverVersion: 2,
  });
  const closed = closeCadConflictIncident(registry, "doc-A");
  assert.equal(cadConflictIncidentFor(closed, "doc-A"), null);
  assert.equal(
    cadConflictIncidentFor(closed, "doc-B")?.documentId,
    "doc-B",
    "resolver un dibujo no puede desenclavar otro que sigue en conflicto",
  );
  assert.equal(
    cadAutosaveBlockedForDocument(closed, "doc-B", 1),
    true,
    "y B sigue sin reintentar su versión rechazada",
  );
}

// ---------------------------------------------------------------------------
// 4. La etiqueta dice que el autosave está DETENIDO
// ---------------------------------------------------------------------------

{
  const registry = openCadConflictIncident(empty, {
    documentId: "doc-A",
    baseVersion: 3,
    serverVersion: 7,
  });
  const incident = cadConflictIncidentFor(registry, "doc-A")!;
  const label = cadConflictIncidentLabel(incident);
  assert.match(label, /servidor v7/, "la etiqueta dice qué versión tiene el servidor");
  assert.match(
    label,
    /autosave detenido/,
    "y que el autosave está PARADO: dejarlo en «conflicto» a secas insinúa que algo sigue trabajando de fondo, y no es verdad",
  );

  const sinVersion = cadConflictIncidentLabel({
    ...incident,
    serverVersion: null,
  });
  assert.doesNotMatch(sinVersion, /servidor v/, "sin versión informada no se inventa una");
  assert.match(sinVersion, /autosave detenido/);
}

console.log(
  "cad-conflict-incident: el enclavamiento es por documento, así que un conflicto en un plano no detiene el autosave de otro",
);
