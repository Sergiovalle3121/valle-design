/**
 * El sobre de PDFATTACH, con un PDF de verdad dentro.
 *
 * Lo que se comprueba, con números y no con adjetivos:
 *
 *   - un archivo del corpus va y vuelve por el sobre BYTE A BYTE, y los bytes
 *     que salen los lee el motor: `readCadPdfPageList` sobre lo recuperado da
 *     las mismas tres páginas que sobre el original;
 *   - el sobre NO declara páginas ni tamaños: eso lo deduce el motor, y por eso
 *     el anfitrión no puede mentir sobre ello;
 *   - la extensión, el tope y el archivo vacío salen como sobre de ERROR con su
 *     motivo, nunca como una excepción que el comando no sabría contar;
 *   - el id que sale del nombre y de la huella distingue dos archivos que se
 *     llaman igual y sobrevive al saneado de `pdf-underlay.ts`.
 *
 * Correr:  npx tsx src/lib/cad/pdf/pdf-attach-payload.spec.ts
 */
import assert from "node:assert/strict";
import { cadPdfCorpus } from "./pdf-corpus";
import { readCadPdfPageList } from "./pdf-import";
import { cadPdfUnderlayEntityId } from "./pdf-underlay";
import {
  CAD_PDF_ATTACH_ACCEPT,
  CAD_PDF_ATTACH_MAX_BYTES,
  CAD_PDF_PAYLOAD_ERROR_KIND,
  CAD_PDF_PAYLOAD_KIND,
  cadPdfAttachPayloadFor,
  cadPdfBytesFromDataUri,
  cadPdfDataUri,
  cadPdfLooksLikePdfName,
  cadPdfUnderlayIdFor,
  decodeCadPdfPayload,
  encodeCadPdfPayload,
} from "./pdf-attach-payload";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

const bytesOf = (id: string) => {
  const entry = cadPdfCorpus().find((file) => file.id === id);
  assert.ok(entry, `falta ${id} en el corpus`);
  return entry.bytes;
};

/* ── El sobre con un PDF real, ida y vuelta ─────────────────────────────── */
{
  const original = bytesOf("multipage-three");
  const text = cadPdfAttachPayloadFor({ name: "conjunto.pdf", bytes: original });
  const payload = decodeCadPdfPayload(text);
  assert.ok(payload && payload.kind === CAD_PDF_PAYLOAD_KIND, "el sobre de un .pdf válido es de contenido");
  checks += 1;
  eq(payload.name, "conjunto.pdf", "el nombre viaja tal cual");
  ok(payload.dataUri.startsWith("data:application/pdf;base64,"), "los bytes viajan como data: de PDF");

  const recovered = cadPdfBytesFromDataUri(payload.dataUri);
  assert.ok(recovered, "los bytes se recuperan del data:");
  checks += 1;
  eq(recovered.length, original.length, "el archivo vuelve con su tamaño exacto");
  ok(
    recovered.every((byte, index) => byte === original[index]),
    "y byte a byte: un sobre que altera un solo byte rompe la tabla de referencias del PDF",
  );

  // Lo que de verdad importa: el MOTOR lee lo recuperado igual que el original.
  const pagesFromEnvelope = readCadPdfPageList(recovered);
  eq(pagesFromEnvelope, readCadPdfPageList(original), "el motor ve las mismas páginas antes y después del sobre");
  eq(pagesFromEnvelope.length, 3, "y son tres");
}

/* ── El sobre NO declara páginas: eso lo deduce el motor ────────────────── */
{
  const text = cadPdfAttachPayloadFor({ name: "carta.pdf", bytes: bytesOf("scanned-image-only") });
  const raw = JSON.parse(text) as Record<string, unknown>;
  eq(Object.keys(raw).sort(), ["dataUri", "kind", "name"], "tres campos y ninguno más: ni páginas ni tamaños");
  // Un sobre con `pageCount` sería una segunda verdad sobre el archivo, y la
  // que el usuario vería primero.
  ok(!("pageCount" in raw) && !("width" in raw), "el anfitrión no puede declarar cuántas páginas hay");
}

/* ── Lo que no se adjunta lo dice, y no lanza ───────────────────────────── */
{
  const renamed = decodeCadPdfPayload(cadPdfAttachPayloadFor({ name: "plano.dwg", bytes: bytesOf("cad-vector-compressed") }));
  assert.ok(renamed && renamed.kind === CAD_PDF_PAYLOAD_ERROR_KIND, "un .dwg vuelve como sobre de error");
  checks += 1;
  eq(renamed.reason, "no es un archivo .pdf.", "con su motivo en español");

  const empty = decodeCadPdfPayload(cadPdfAttachPayloadFor({ name: "vacio.pdf", bytes: new Uint8Array(0) }));
  assert.ok(empty && empty.kind === CAD_PDF_PAYLOAD_ERROR_KIND && empty.reason === "el archivo está vacío.", "un archivo vacío también");
  checks += 1;

  const huge = decodeCadPdfPayload(
    cadPdfAttachPayloadFor({ name: "escaneo.pdf", bytes: new Uint8Array(CAD_PDF_ATTACH_MAX_BYTES + 1) }),
  );
  assert.ok(huge && huge.kind === CAD_PDF_PAYLOAD_ERROR_KIND, "pasado el tope, sobre de error");
  checks += 1;
  ok(huge.reason.startsWith("pesa 8.0 MB y el tope es 8 MB"), `el tope se dice con su cifra: ${huge.reason}`);

  ok(cadPdfLooksLikePdfName("Levantamiento 1980.PDF"), "la extensión no distingue mayúsculas");
  ok(!cadPdfLooksLikePdfName("plano.pdf.zip"), "y un .zip con .pdf dentro del nombre no cuela");
  ok(CAD_PDF_ATTACH_ACCEPT.includes(".pdf") && CAD_PDF_ATTACH_ACCEPT.includes("application/pdf"), "el selector ofrece .pdf");
}

/* ── El sobre y lo que no es un sobre ───────────────────────────────────── */
{
  eq(decodeCadPdfPayload("0\nSECTION"), null, "un DXF no es un sobre de PDF");
  eq(decodeCadPdfPayload('{"kind":"valle-image","name":"x.png"}'), null, "ni el sobre de una imagen");
  assert.throws(
    () => decodeCadPdfPayload('{"kind":"valle-pdf","name":"x.pdf"}'),
    /malformado/,
    "un sobre de PDF sin bytes lanza en vez de colarse vacío",
  );
  checks += 1;
  assert.throws(
    () => decodeCadPdfPayload('{"kind":"valle-pdf","name":"x.pdf","dataUri":"data:image/png;base64,AA=="}'),
    /malformado/,
    "un data: que no es PDF tampoco",
  );
  checks += 1;
  eq(
    decodeCadPdfPayload(encodeCadPdfPayload({ kind: CAD_PDF_PAYLOAD_ERROR_KIND, name: "x.pdf", reason: "pesa demasiado." })),
    { kind: CAD_PDF_PAYLOAD_ERROR_KIND, name: "x.pdf", reason: "pesa demasiado." },
    "el sobre de error va y vuelve",
  );
  eq(cadPdfBytesFromDataUri("tenant-asset://levantamientos/topo.pdf"), null, "una ruta que no es data: devuelve null, no lanza");
}

/* ── El identificador del sustrato ──────────────────────────────────────── */
{
  const a = { name: "plano.pdf", dataUri: cadPdfDataUri(bytesOf("cad-vector-compressed")) };
  const b = { name: "plano.pdf", dataUri: cadPdfDataUri(bytesOf("multipage-three")) };
  ok(cadPdfUnderlayIdFor(a) !== cadPdfUnderlayIdFor(b), "dos archivos distintos que se llaman igual no comparten id");
  eq(cadPdfUnderlayIdFor(a), cadPdfUnderlayIdFor({ ...a }), "el mismo archivo da siempre el mismo id");
  ok(cadPdfUnderlayIdFor(a).startsWith("plano.pdf:"), `el id empieza por el nombre: ${cadPdfUnderlayIdFor(a)}`);

  // El id sobrevive al saneado de `pdf-underlay.ts`: si `safe()` lo cambiase,
  // `cadFindPdfUnderlay(document, id)` no encontraría lo que acaba de adjuntar.
  const raro = cadPdfUnderlayIdFor({ name: "Levantamiento «El Roble» 1980.pdf", dataUri: a.dataUri });
  eq(
    cadPdfUnderlayEntityId(raro),
    `pdfunderlay:${raro}:entity`,
    "el id ya viene saneado: el saneado de pdf-underlay lo deja igual",
  );
}

console.log(
  `pdf-attach-payload: ${checks} comprobaciones · el PDF de tres páginas va y vuelve byte a byte y el motor le sigue viendo 3 páginas; sin páginas declaradas en el sobre; extensión, vacío y tope de 8 MB salen como error con su motivo`,
);
