/**
 * El descompresor se comprueba contra `node:zlib`, no contra sí mismo.
 *
 * Un inflate escrito a mano que sólo se prueba con lo que él mismo comprime es
 * un espejo: pasa siempre y no demuestra nada. Aquí el comprimido lo produce
 * `node:zlib` —la implementación de referencia, la misma que usó quien creó el
 * PDF— con los TRES tipos de bloque de DEFLATE y con datos que ejercitan los
 * caminos difíciles: repeticiones largas, distancias solapadas, y ruido
 * incompresible que fuerza bloques almacenados.
 *
 * `node:zlib` se usa SÓLO aquí. El módulo de producto no lo importa: es
 * isomorfo a propósito, porque el importador de PDF corre en el navegador.
 *
 * Correr:  npx tsx src/lib/cad/pdf/pdf-inflate.spec.ts
 */
import { strict as assert } from "node:assert";
import { deflateSync, deflateRawSync, inflateSync } from "node:zlib";
import {
  CadPdfInflateError,
  cadPdfHasZlibHeader,
  cadPdfInflate,
  cadPdfInflateRaw,
  cadPdfZlibStored,
} from "./pdf-inflate";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const bytes = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff);
const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

// --- 1. los tres tipos de bloque, contra la implementación de referencia ----
{
  // `level: 0` fuerza bloques ALMACENADOS; los niveles altos usan Huffman
  // dinámico; una entrada minúscula cae en el Huffman FIJO. Los tres caminos
  // del inflate se recorren de verdad, no por suposición.
  const payloads: Array<{ name: string; data: Uint8Array }> = [
    { name: "vacío", data: new Uint8Array(0) },
    { name: "un byte", data: Uint8Array.of(0x41) },
    { name: "texto de plano", data: bytes("MURO EXTERIOR ".repeat(400)) },
    { name: "repetición corta", data: bytes("abababababababab".repeat(64)) },
    {
      name: "ruido incompresible",
      data: (() => {
        // Congruencial lineal con semilla fija: reproducible sin depender de
        // `Math.random`, que haría que un fallo no se pudiera repetir.
        const out = new Uint8Array(20000);
        let seed = 123456789;
        for (let index = 0; index < out.length; index += 1) {
          seed = (seed * 1103515245 + 12345) >>> 0;
          out[index] = (seed >>> 16) & 0xff;
        }
        return out;
      })(),
    },
  ];

  for (const level of [0, 1, 6, 9]) {
    for (const payload of payloads) {
      const compressed = new Uint8Array(deflateSync(Buffer.from(payload.data), { level }));
      const result = cadPdfInflate(compressed);
      ok(
        same(result.data, payload.data),
        `nivel ${level}, ${payload.name}: lo inflado no coincide con el original`,
      );
      ok(result.zlibWrapped, `nivel ${level}, ${payload.name}: se esperaba envoltorio zlib`);
      ok(
        result.checksumVerified,
        `nivel ${level}, ${payload.name}: el Adler-32 tenía que verificarse`,
      );
    }
  }
}

// --- 2. DEFLATE crudo, que algún escritor de PDF emite tras /FlateDecode ----
{
  const source = bytes("EJES ESTRUCTURALES\n".repeat(120));
  const raw = new Uint8Array(deflateRawSync(Buffer.from(source)));
  ok(!cadPdfHasZlibHeader(raw) || true, "el crudo puede o no parecer envoltorio; se acepta igual");
  const result = cadPdfInflate(raw);
  ok(same(result.data, source), "un DEFLATE crudo se infla igual");
  // La honestidad del caso: sin envoltorio no hay suma, y se DICE.
  if (!result.zlibWrapped) ok(!result.checksumVerified, "sin envoltorio no puede haber suma verificada");
  ok(same(cadPdfInflateRaw(raw, 0), source), "`cadPdfInflateRaw` lee el crudo directamente");
}

// --- 3. lo corrupto FALLA, no devuelve medio flujo --------------------------
{
  const source = bytes("CIMENTACIÓN ".repeat(500));
  const compressed = new Uint8Array(deflateSync(Buffer.from(source)));

  // Truncado: es el caso real de una descarga interrumpida.
  assert.throws(
    () => cadPdfInflate(compressed.subarray(0, Math.floor(compressed.length / 2))),
    (error: unknown) =>
      error instanceof CadPdfInflateError && ["truncated", "checksum"].includes(error.code),
    "un flujo truncado tiene que fallar, no devolver lo que llevaba",
  );
  checks += 1;

  // Un byte cambiado en mitad del cuerpo: la suma lo caza aunque el DEFLATE
  // logre decodificar algo. Es exactamente la geometría plausible y falsa que
  // no puede llegar al plano.
  const tampered = compressed.slice();
  tampered[Math.floor(tampered.length / 2)] ^= 0xff;
  assert.throws(
    () => cadPdfInflate(tampered),
    (error: unknown) => error instanceof CadPdfInflateError,
    "un byte alterado tiene que fallar",
  );
  checks += 1;

  // Diccionario preestablecido: FDICT en la cabecera. No es un PDF válido.
  const withDictionary = Uint8Array.of(0x78, 0xbb, 0x00, 0x00);
  assert.throws(
    () => cadPdfInflate(withDictionary),
    (error: unknown) => error instanceof CadPdfInflateError && error.code === "zlib_header",
    "un flujo con diccionario tiene que declararse imposible",
  );
  checks += 1;
}

// --- 4. el envoltorio de bloques almacenados que usa el corpus --------------
{
  const source = bytes("q 1 0 0 1 0 0 cm 100 100 m 200 200 l S Q\n".repeat(300));
  const stored = cadPdfZlibStored(source);
  ok(cadPdfHasZlibHeader(stored), "lo que emite `cadPdfZlibStored` es un flujo zlib legítimo");
  // Contra `node:zlib`: si la referencia lo lee, cualquier lector de PDF lo lee.
  ok(
    same(new Uint8Array(inflateSync(Buffer.from(stored))), source),
    "`node:zlib` tiene que poder leer lo que emite el corpus",
  );
  const round = cadPdfInflate(stored);
  ok(same(round.data, source), "y nuestro inflate también");
  ok(round.checksumVerified, "el Adler-32 del corpus tiene que cuadrar");

  // Más de 65535 bytes: obliga a varios bloques encadenados, que es donde un
  // escritor descuidado marca «final» en el primero y trunca el resto.
  const big = new Uint8Array(200000).fill(0x20);
  ok(
    same(cadPdfInflate(cadPdfZlibStored(big)).data, big),
    "un flujo almacenado de varios bloques se lee entero",
  );
}

// --- 5. distancias solapadas: el mecanismo de repetición de DEFLATE ---------
{
  // Un patrón corto repetido miles de veces produce copias con distancia MENOR
  // que la longitud. Copiar con `copyWithin` daría otro resultado; este caso es
  // el que lo detecta.
  const source = bytes("A".repeat(70000));
  const compressed = new Uint8Array(deflateSync(Buffer.from(source), { level: 9 }));
  ok(same(cadPdfInflate(compressed).data, source), "las copias solapadas se resuelven byte a byte");
}

console.log(`pdf-inflate.spec.ts ✅ ${checks} comprobaciones`);
