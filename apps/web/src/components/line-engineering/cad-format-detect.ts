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
 * Correr tests:  npx tsx src/components/line-engineering/cad-format-detect.spec.ts
 */

/** Código de versión AutoCAD → nombre comercial. */
export const ACAD_VERSION_NAMES: Record<string, string> = {
  AC1009: 'R12',
  AC1012: 'R13',
  AC1014: 'R14',
  AC1015: '2000',
  AC1018: '2004',
  AC1021: '2007',
  AC1024: '2010',
  AC1027: '2013',
  AC1032: '2018',
};

export type CadFormat = 'dwg' | 'dxf' | 'unknown';

export interface CadFormatInfo {
  format: CadFormat;
  /** Código crudo de versión (AC10xx) si se detectó. */
  version?: string;
  /** Nombre comercial (R12, 2018…) si se reconoció. */
  versionName?: string;
  /** ¿Lo parseamos nativamente? (DXF sí; DWG no, por ahora.) */
  nativeSupport: boolean;
  /** Mensaje accionable para mostrar al usuario. */
  message: string;
}

/** Lee los primeros `n` bytes/caracteres como ASCII. */
function head(input: Uint8Array | string, n: number): string {
  if (typeof input === 'string') return input.slice(0, n);
  let s = '';
  for (let i = 0; i < Math.min(n, input.length); i++) s += String.fromCharCode(input[i]);
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
      format: 'dwg',
      version: first6,
      ...(versionName ? { versionName } : {}),
      nativeSupport: false,
      message: `Archivo DWG${versionName ? ` (AutoCAD ${versionName})` : ''}. Aún no leemos DWG nativamente: expórtalo a DXF (R12+) desde tu CAD e impórtalo de nuevo.`,
    };
  }

  // DXF de texto: busca el marcador $ACADVER / SECTION en el encabezado.
  const header = head(input, 512);
  if (/\bSECTION\b/.test(header) || /\$ACADVER/.test(header) || /^\s*0\s*[\r\n]+\s*SECTION/.test(header)) {
    const m = header.match(/AC10\d\d/);
    const version = m?.[0];
    const versionName = version ? ACAD_VERSION_NAMES[version] : undefined;
    return {
      format: 'dxf',
      ...(version ? { version } : {}),
      ...(versionName ? { versionName } : {}),
      nativeSupport: true,
      message: `Archivo DXF${versionName ? ` (AutoCAD ${versionName})` : ''} válido para importar.`,
    };
  }

  return {
    format: 'unknown',
    nativeSupport: false,
    message: 'Formato no reconocido. Sube un DXF (texto) exportado desde tu CAD.',
  };
}

/** ¿El contenido parece un DWG binario? (atajo conveniente.) */
export function isDwg(input: Uint8Array | string): boolean {
  return detectCadFormat(input).format === 'dwg';
}
