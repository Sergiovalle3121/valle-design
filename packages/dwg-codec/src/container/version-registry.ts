export const DWG_VERSION_CODES = [
  "AC1009",
  "AC1012",
  "AC1014",
  "AC1015",
  "AC1018",
  "AC1021",
  "AC1024",
  "AC1027",
  "AC1032",
] as const;

export type DwgVersionCode = (typeof DWG_VERSION_CODES)[number];
export type DwgVersionLabel =
  "R12" | "R13" | "R14" | "2000" | "2004" | "2007" | "2010" | "2013" | "2018";

/**
 * Estado REAL del decodificador de cada versión. "experimental-lab" declara
 * que el laboratorio decodifica esa versión con evidencia de corpus propio
 * (CAPABILITIES.md manda); no declara disponibilidad en el producto.
 */
export type DwgDecoderStatus = "unsupported" | "experimental-lab";

export interface DwgVersion {
  readonly code: DwgVersionCode;
  readonly label: DwgVersionLabel;
  readonly decoderStatus: DwgDecoderStatus;
}

const AC1009: DwgVersion = Object.freeze({
  code: "AC1009",
  label: "R12",
  decoderStatus: "unsupported",
});
const AC1012: DwgVersion = Object.freeze({
  code: "AC1012",
  label: "R13",
  decoderStatus: "unsupported",
});
const AC1014: DwgVersion = Object.freeze({
  code: "AC1014",
  label: "R14",
  decoderStatus: "unsupported",
});
const AC1015: DwgVersion = Object.freeze({
  code: "AC1015",
  label: "2000",
  decoderStatus: "experimental-lab",
});
const AC1018: DwgVersion = Object.freeze({
  code: "AC1018",
  label: "2004",
  decoderStatus: "experimental-lab",
});
const AC1021: DwgVersion = Object.freeze({
  code: "AC1021",
  label: "2007",
  decoderStatus: "unsupported",
});
const AC1024: DwgVersion = Object.freeze({
  code: "AC1024",
  label: "2010",
  decoderStatus: "unsupported",
});
const AC1027: DwgVersion = Object.freeze({
  code: "AC1027",
  label: "2013",
  decoderStatus: "unsupported",
});
const AC1032: DwgVersion = Object.freeze({
  code: "AC1032",
  label: "2018",
  decoderStatus: "unsupported",
});

export const DWG_VERSION_REGISTRY: readonly DwgVersion[] = Object.freeze([
  AC1009,
  AC1012,
  AC1014,
  AC1015,
  AC1018,
  AC1021,
  AC1024,
  AC1027,
  AC1032,
]);

export function lookupDwgVersion(code: string): DwgVersion | null {
  switch (code) {
    case "AC1009":
      return AC1009;
    case "AC1012":
      return AC1012;
    case "AC1014":
      return AC1014;
    case "AC1015":
      return AC1015;
    case "AC1018":
      return AC1018;
    case "AC1021":
      return AC1021;
    case "AC1024":
      return AC1024;
    case "AC1027":
      return AC1027;
    case "AC1032":
      return AC1032;
    default:
      return null;
  }
}
