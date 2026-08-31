/**
 * Detección de formato CAD: DWG vs DXF (Fase 74 — interop).
 *
 * Helper PURO para identificar qué subió el usuario antes de intentar parsearlo:
 * un **DWG** binario (formato nativo de AutoCAD, que aún no parseamos en casa) o
 * un **DXF** de texto (que sí leemos). Lee la cabecera de versión (`AC10xx`,
 * igual que `$ACADVER`) y devuelve formato + versión legible + si lo soportamos
 * nativamente + un mensaje accionable para el usuario.
 *
 * Cero dependencias: solo inspecciona los primeros bytes. El parseo real de DWG
 * (LibreDWG/ODA) es una decisión de dependencia aparte.
 *
 * Correr tests:  npx tsx src/components/cad/interop/cad-format-detect.spec.ts
 */

/** Código de versión AutoCAD → nombre comercial. */
export const ACAD_VERSION_NAMES: Record<string, string> = {
  AC1009: "R12",
  AC1012: "R13",
  AC1014: "R14",
  AC1015: "2000",
  AC1018: "2004",
  AC1021: "2007",
  AC1024: "2010",
  AC1027: "2013",
  AC1032: "2018",
};

/**
 * `gltf`, `collada`, `obj` y `stl` son los cuatro formatos de MALLA que
 * `lib/cad/interop/` sabe coser en un `solid3d`; `skp` se reconoce para
 * RECHAZARLO con su motivo (SketchUp nativo, formato propietario — ver
 * `lib/cad/interop/skp-reject.ts`), nunca para leerlo.
 */
export type CadFormat = "dwg" | "dxf" | "gltf" | "collada" | "obj" | "stl" | "skp" | "unknown";

export interface CadFormatInfo {
  format: CadFormat;
  /** Código crudo de versión (AC10xx) si se detectó — sólo aplica a DWG/DXF. */
  version?: string;
  /** Nombre comercial (R12, 2018…) si se reconoció — sólo aplica a DWG/DXF. */
  versionName?: string;
  /** ¿Lo parseamos nativamente? (DXF y los cuatro formatos de malla sí; DWG y SKP no.) */
  nativeSupport: boolean;
  /** Mensaje accionable para mostrar al usuario. */
  message: string;
}

/** Lee los primeros `n` bytes/caracteres como ASCII. */
function head(input: Uint8Array | string, n: number): string {
  if (typeof input === "string") return input.slice(0, n);
  let s = "";
  for (let i = 0; i < Math.min(n, input.length); i++)
    s += String.fromCharCode(input[i]);
  return s;
}

const VERSION_RE = /^AC10\d\d$/;

/**
 * Detecta el formato de un archivo CAD por su cabecera. DWG = `AC10xx` en el
 * byte 0 (binario). DXF = texto con código de grupo / `SECTION` (el `AC10xx` del
 * DXF vive más adentro, tras `$ACADVER`, no al inicio).
 */
export function detectCadFormat(input: Uint8Array | string): CadFormatInfo {
  const first6 = head(input, 6);

  // DWG binario: el código de versión está en el byte 0.
  if (VERSION_RE.test(first6)) {
    const versionName = ACAD_VERSION_NAMES[first6];
    return {
      format: "dwg",
      version: first6,
      ...(versionName ? { versionName } : {}),
      nativeSupport: false,
      message: `Archivo DWG${versionName ? ` (AutoCAD ${versionName})` : ""}. Aún no leemos DWG nativamente: expórtalo a DXF (R12+) desde tu CAD e impórtalo de nuevo.`,
    };
  }

  // DXF de texto: busca el marcador $ACADVER / SECTION en el encabezado.
  const header = head(input, 512);
  if (
    /\bSECTION\b/.test(header) ||
    /\$ACADVER/.test(header) ||
    /^\s*0\s*[\r\n]+\s*SECTION/.test(header)
  ) {
    const m = header.match(/AC10\d\d/);
    const version = m?.[0];
    const versionName = version ? ACAD_VERSION_NAMES[version] : undefined;
    return {
      format: "dxf",
      ...(version ? { version } : {}),
      ...(versionName ? { versionName } : {}),
      nativeSupport: true,
      message: `Archivo DXF${versionName ? ` (AutoCAD ${versionName})` : ""} válido para importar.`,
    };
  }

  // glTF binario (.glb): los 4 primeros bytes son la firma ASCII "glTF".
  if (
    input instanceof Uint8Array &&
    input.length >= 4 &&
    input[0] === 0x67 &&
    input[1] === 0x6c &&
    input[2] === 0x54 &&
    input[3] === 0x46
  ) {
    return { format: "gltf", nativeSupport: true, message: "Archivo glTF binario (.glb) válido para importar como sólido." };
  }
  // glTF de texto (.gltf): JSON con la sección "asset" que exige el estándar.
  if (/^\s*\{/.test(header) && /"asset"\s*:\s*\{[^}]*"version"/.test(header)) {
    return { format: "gltf", nativeSupport: true, message: "Archivo glTF de texto válido para importar como sólido." };
  }
  // COLLADA (.dae): XML con la raíz <COLLADA>.
  if (/<COLLADA[\s>]/.test(header)) {
    return { format: "collada", nativeSupport: true, message: "Archivo COLLADA (.dae) válido para importar como sólido." };
  }
  // STL ASCII: empieza literalmente por "solid" y trae "facet normal" cerca —
  // "solid" a secas no basta, porque también es una palabra común en DXF/JSON.
  if (/^solid\b/.test(header) && /facet\s+normal/.test(header)) {
    return { format: "stl", nativeSupport: true, message: "Archivo STL de texto válido para importar como sólido." };
  }
  // STL binario: NO tiene firma — la cabecera de 80 bytes es arbitraria. La
  // única comprobación fiable es aritmética: 80 bytes de cabecera + 4 de
  // conteo + 50 bytes por triángulo tiene que cuadrar EXACTO con el tamaño
  // del archivo. Sólo se puede hacer con el archivo COMPLETO en la mano.
  if (input instanceof Uint8Array && input.byteLength >= 84) {
    const triangleCount = new DataView(input.buffer, input.byteOffset, input.byteLength).getUint32(80, true);
    if (input.byteLength === 84 + triangleCount * 50) {
      return { format: "stl", nativeSupport: true, message: "Archivo STL binario válido para importar como sólido." };
    }
  }
  // OBJ: sin firma tampoco, pero su vocabulario de línea (v/vn/vt/f/o/g) es
  // reconocible por muestreo de las primeras líneas no vacías.
  if (looksLikeObj(header)) {
    return { format: "obj", nativeSupport: true, message: "Archivo OBJ válido para importar como sólido." };
  }
  // .skp: se reconoce para RECHAZARLO, nunca para leerlo (ver skp-reject.ts).
  if (/SketchUp Model/.test(head(input, 64))) {
    return {
      format: "skp",
      nativeSupport: false,
      message: "Archivo SketchUp nativo (.skp): formato propietario, no se lee. Exporta a COLLADA (.dae) o glTF (.glb) desde SketchUp.",
    };
  }

  return {
    format: "unknown",
    nativeSupport: false,
    message:
      "Formato no reconocido. Sube un DXF (texto), un JSON canónico o un modelo 3D (OBJ, STL, glTF/GLB o COLLADA).",
  };
}

/** Heurística de línea: al menos dos palabras clave de OBJ entre las primeras líneas no vacías. */
function looksLikeObj(header: string): boolean {
  const lines = header.split(/\r?\n/).filter((line) => line.trim().length > 0).slice(0, 20);
  if (lines.length === 0) return false;
  const objLine = /^(v|vt|vn|f|o|g|usemtl|mtllib)\s/;
  const matches = lines.filter((line) => objLine.test(line) || line.trim().startsWith("#"));
  return matches.length >= Math.min(2, lines.length) && lines.every((line) => objLine.test(line) || line.trim().startsWith("#"));
}

/** ¿El contenido parece un DWG binario? (atajo conveniente.) */
export function isDwg(input: Uint8Array | string): boolean {
  return detectCadFormat(input).format === "dwg";
}
