/**
 * `.skp` (SketchUp nativo): se DETECTA y se RECHAZA con su motivo.
 *
 * SketchUp exporta a COLLADA y glTF de forma nativa — los otros tres lectores
 * de este directorio cubren la migración real sin abrir el formato propietario
 * en absoluto. Leer `.skp` directamente exigiría el mismo laboratorio
 * clean-room que ya existe para DWG (fuentes registradas, política de
 * procedencia, modelo de amenaza, umbral de capacidades) antes de escribir una
 * sola línea de parseo — y ESO es una campaña propia, con su propio ADR
 * firmado por quien asigna los números, no algo que quepa en esta.
 *
 * Fingir que `.skp` "casi funciona" sería peor que no tocarlo: un archivo que
 * parece importarse y en realidad perdió geometría sin decirlo es exactamente
 * el defecto que este subsistema existe para no repetir. Por eso el rechazo es
 * la entrega, no un pendiente a medias.
 */

/**
 * Cadena ASCII presente en la cabecera de un `.skp` (varias versiones del
 * formato la incluyen cerca del byte 0, junto a bytes de control que sí
 * cambian entre versiones). Es una detección de CONTENIDO best-effort, no una
 * firma verificada byte a byte contra la especificación — no hay ADR de
 * clean-room que la respalde todavía. La señal FIABLE es la extensión; esta
 * sólo ayuda a atrapar un `.skp` renombrado antes de que llegue más lejos.
 */
const SKP_MAGIC_HINT = "SketchUp Model";

export function looksLikeSkp(bytes: Uint8Array, fileName: string): boolean {
  if (fileName.toLowerCase().endsWith(".skp")) return true;
  const scanWindow = Math.min(bytes.byteLength, 64);
  let head = "";
  for (let i = 0; i < scanWindow; i += 1) head += String.fromCharCode(bytes[i]);
  return head.includes(SKP_MAGIC_HINT);
}

/** Lanza SIEMPRE, con el motivo completo. No hay ninguna llamada que "intente" leer un `.skp`. */
export function rejectSkp(fileName: string): never {
  throw new Error(
    `«${fileName}» es un archivo SketchUp nativo (.skp): este importador no lo lee, y no es un descuido. ` +
      "El formato es propietario y cerrado; leerlo exigiría un laboratorio de ingeniería inversa clean-room " +
      "propio (con su ADR, su registro de fuentes y su modelo de amenaza) que todavía no existe para SketchUp. " +
      "Exporta desde SketchUp a COLLADA (.dae) o glTF (.glb) — ambos son formatos que SketchUp genera de forma " +
      "nativa en Archivo → Exportar → Modelo 3D — y vuelve a importar ese archivo.",
  );
}
