/**
 * El ZIP que escribe `buildZip` se lee de vuelta byte a byte.
 *
 * El lector de esta prueba NO comparte código con el escritor: recorre la
 * tabla central de forma independiente y reconstruye cada entrada desde su
 * cabecera local. Si el escritor produjese un desplazamiento equivocado o un
 * tamaño que no cuadra, un lector real (Explorador de Windows, `unzip`,
 * cualquier librería) fallaría igual que éste.
 */
import { strict as assert } from "node:assert";
// Namespace y no nombrado: `crc32` sólo existe desde Node 20.12/21.7, y el
// mínimo del repo es 20.9 — un `import { crc32 }` nombrado revienta al CARGAR
// el módulo en un Node más viejo, antes de que el spec pueda decidir nada.
import * as nodeZlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync as writeFile } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { buildZip, crc32, type CadZipEntry } from "./zip-writer";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

/** Lector independiente: sólo usa la tabla central, nunca los offsets que calculó el escritor por su cuenta. */
function readZip(zip: Uint8Array): Array<{ path: string; bytes: Uint8Array; crc: number }> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // El final de directorio central está en los últimos 22 bytes: este ZIP nunca lleva comentario.
  const endOffset = zip.length - 22;
  assert.equal(view.getUint32(endOffset, true), 0x06054b50, "firma EOCD");
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralOffset = view.getUint32(endOffset + 16, true);

  const entries: Array<{ path: string; bytes: Uint8Array; crc: number }> = [];
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(view.getUint32(cursor, true), 0x02014b50, `firma de directorio central #${index}`);
    const crc = view.getUint32(cursor + 16, true);
    const size = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(zip.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength;

    assert.equal(view.getUint32(localOffset, true), 0x04034b50, `firma local de «${name}»`);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const bytes = zip.slice(dataStart, dataStart + size);
    entries.push({ path: name, bytes, crc });
  }
  return entries;
}

// --- ida y vuelta, con rutas y contenidos variados ------------------------
const entries: CadZipEntry[] = [
  { path: "manifiesto.json", bytes: new TextEncoder().encode('{"ok":true}') },
  { path: "planos/A-101.json", bytes: new TextEncoder().encode("x".repeat(5_000)) },
  { path: "vacio.txt", bytes: new Uint8Array(0) },
];
const zip = buildZip(entries);
const read = readZip(zip);

ok(read.length === entries.length, `${read.length} entradas leídas, se esperaban ${entries.length}`);
entries.forEach((entry, index) => {
  const found = read[index];
  ok(found.path === entry.path, `ruta #${index}: «${found.path}» vs «${entry.path}»`);
  ok(
    found.bytes.length === entry.bytes.length &&
      found.bytes.every((byte, position) => byte === entry.bytes[position]),
    `contenido #${index} recuperado byte a byte`,
  );
  ok(found.crc === crc32(entry.bytes), `CRC-32 de «${entry.path}» cuadra con lo escrito`);
});

// --- Node conoce el mismo CRC-32: oráculo independiente cuando existe ------
const nodeCrc32 = (nodeZlib as { crc32?: (data: Uint8Array) => number }).crc32;
if (typeof nodeCrc32 === "function") {
  assert.equal(nodeCrc32(entries[1].bytes) >>> 0, crc32(entries[1].bytes), "el CRC-32 propio coincide con el de zlib de Node");
  checks += 1;
} else {
  console.log("zip-writer.spec: zlib.crc32 no está en este Node — se omite el oráculo independiente");
}

// --- oráculo EXTERNO: el `unzip` del sistema, si está instalado ------------
//
// No comparte una sola línea con `buildZip` ni con `readZip` de arriba: es el
// binario que trae Debian/Ubuntu, compilado en C hace décadas por gente que
// nunca vio este repositorio. Si algo estuviera mal en la tabla central o en
// los desplazamientos, éste es el que lo notaría de verdad — «best effort»
// porque no todos los entornos de CI lo traen instalado, y su ausencia no es
// una regresión del producto.
{
  const probe = spawnSync("unzip", ["-v"]);
  if (probe.error || probe.status !== 0) {
    console.log("zip-writer.spec: `unzip` no está instalado en este entorno — se omite el oráculo externo");
  } else {
    const dir = mkdtempSync(path.join(tmpdir(), "cad-zip-"));
    const zipPath = path.join(dir, "paquete.zip");
    writeFile(zipPath, zip);
    const test = spawnSync("unzip", ["-t", zipPath], { encoding: "utf8" });
    ok(test.status === 0, `unzip -t confirma el paquete: ${test.stdout}${test.stderr}`);
    const extract = spawnSync("unzip", ["-p", zipPath, entries[0].path], { encoding: "utf8" });
    assert.equal(extract.stdout, new TextDecoder().decode(entries[0].bytes), "unzip extrae el contenido exacto");
    checks += 1;
  }
}

// --- determinismo: mismas entradas, mismos bytes ---------------------------
const zipAgain = buildZip(entries);
ok(
  zip.length === zipAgain.length && zip.every((byte, index) => byte === zipAgain[index]),
  "dos construcciones del mismo paquete producen bytes idénticos",
);

console.log(`zip-writer.spec: ${checks} comprobaciones OK`);
