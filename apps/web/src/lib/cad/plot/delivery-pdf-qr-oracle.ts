/** Oráculo de pruebas: reconstruye la retícula dibujada en el PDF, no la matriz del emisor. */
import { strict as assert } from "node:assert";
import { inflateSync } from "node:zlib";
import { decodeQrText } from "../../qr/qr-decode";

export function readPrintedQr(pdfBytes: Uint8Array): string {
  const bytes = Buffer.from(pdfBytes);
  const raw = bytes.toString("latin1");
  const streams: string[] = [];
  for (const match of raw.matchAll(/(?:^|\n)stream\r?\n/g)) {
    const dictionary = raw.slice(raw.lastIndexOf("<<", match.index), match.index);
    const length = /\/Length\s+(\d+)/.exec(dictionary);
    if (!length) continue;
    const start = match.index + match[0].length;
    const payload = bytes.subarray(start, start + Number(length[1]));
    streams.push(/\/FlateDecode\b/.test(dictionary)
      ? inflateSync(payload).toString("latin1")
      : payload.toString("latin1"));
  }
  const pdf = streams.join("\n");
  const number = "(-?(?:\\d+\\.?\\d*|\\.\\d+))";
  const rectangles = [...pdf.matchAll(new RegExp(`${number} ${number} ${number} ${number} re\\r?\\nf`, "g"))]
    .map((match) => ({
      x: Number(match[1]), y: Number(match[2]),
      width: Number(match[3]), height: Number(match[4]),
    }));
  const pointsPerMm = 72 / 25.4;
  const near = (actual: number, expected: number) => Math.abs(actual - expected) < 0.02;
  const qr = rectangles.find((rect) =>
    near(rect.x, 72 * pointsPerMm) &&
    near(rect.y, (297 - 82) * pointsPerMm) &&
    near(rect.width, 66 * pointsPerMm) &&
    near(rect.height, -66 * pointsPerMm));
  assert.ok(qr, "el archivo PDF debe contener el fondo blanco del QR en portada");
  const squares = rectangles.filter((rect) =>
    rect.width > 0 && rect.width < 8 && near(rect.height, -rect.width) &&
    rect.x > qr.x && rect.x < qr.x + qr.width &&
    rect.y < qr.y && rect.y > qr.y - qr.width);
  const pitch = Math.min(...squares.map((rect) => rect.width));
  assert.ok(Number.isFinite(pitch), "el PDF debe dibujar módulos oscuros del QR");
  const size = Math.round(qr.width / pitch) - 8; // cuatro módulos claros por lado
  assert.ok(size >= 21 && (size - 17) % 4 === 0, "retícula QR válida en el PDF");
  const modules = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  for (const rect of squares) {
    const col = (rect.x - qr.x) / pitch - 4;
    const row = (qr.y - rect.y) / pitch - 4;
    if (col < -0.02 || row < -0.02 || col > size - 0.98 || row > size - 0.98) continue;
    assert.ok(near(col, Math.round(col)) && near(row, Math.round(row)), "módulo fuera de la retícula");
    modules[Math.round(row)][Math.round(col)] = true;
  }
  assert.ok(modules.flat().filter(Boolean).length > 100, "el PDF contiene la retícula completa");
  return decodeQrText({ size, version: (size - 17) / 4, modules });
}
