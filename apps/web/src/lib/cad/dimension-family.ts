/**
 * SUBESTILOS DE COTA POR FAMILIA (Ola I, 2026-09-02).
 *
 * Medido antes de tocar nada: `dimension-style.ts` no tenía la noción —cero
 * apariciones de «family» o «subestilo»—, así que una cota radial no podía
 * llevar flecha propia sin crear otro estilo entero y asignárselo a mano, y el
 * informe de distancia (§4 5º) lo señalaba como la dependencia más larga del
 * toolset Mechanical.
 *
 * El modelo es el de AutoCAD, con SUS nombres: un subestilo es una entrada más
 * de `styles.dimension` llamada `PADRE$n`, donde n es el código de familia
 * (0 lineal, 2 angular, 3 diámetro, 4 radio, 6 coordenada, 7 directriz). No
 * hay campo nuevo ni tabla nueva —es un NOMBRE—, y el DXF ya escribe la tabla
 * DIMSTYLE por nombre, así que «ISO-25$4» sale del fichero exactamente como
 * AutoCAD llama a su propio subestilo radial. Tocar el formato persistido es
 * decisión del titular; esto no lo toca.
 *
 * La resolución es: defaults ← Standard ← padre ← padre$n. Una cota de radio
 * con estilo «ISO-25» lee ISO-25 y, si existe, ISO-25$4 encima. La cota de
 * longitud de arco no tiene familia propia en esta tabla y hereda sólo el
 * padre: decirlo es más barato que inventarle un código.
 */
import type { CadEntity, CadStyleTable } from "./cad-document";
import type { CadDimensionStyleDefinition } from "./dimension-style";

export type CadDimensionFamilyKind = NonNullable<Extract<CadEntity, { type: "dimension" }>["dimensionKind"]>;

export interface CadDimensionFamily {
  /** El sufijo `$n` de AutoCAD. Persistido como parte del nombre del estilo. */
  code: 0 | 2 | 3 | 4 | 6 | 7;
  keyword: { keyword: string; shortcut: string };
  /** Adjetivo para los mensajes: «subestilo radial». */
  label: string;
  /** Tipos de cota que leen este subestilo. Vacío = ninguna cota (directriz). */
  kinds: readonly CadDimensionFamilyKind[];
}

export const CAD_DIMENSION_FAMILIES: readonly CadDimensionFamily[] = [
  { code: 0, keyword: { keyword: "Lineal", shortcut: "L" }, label: "lineal", kinds: ["linear", "aligned"] },
  { code: 2, keyword: { keyword: "Angular", shortcut: "A" }, label: "angular", kinds: ["angular"] },
  { code: 3, keyword: { keyword: "Diámetro", shortcut: "D" }, label: "de diámetro", kinds: ["diameter"] },
  { code: 4, keyword: { keyword: "Radio", shortcut: "R" }, label: "radial", kinds: ["radius"] },
  { code: 6, keyword: { keyword: "Coordenada", shortcut: "C" }, label: "de coordenada", kinds: ["ordinate"] },
  { code: 7, keyword: { keyword: "dIrectriz", shortcut: "I" }, label: "de directriz", kinds: [] },
];

const SUFFIX = /\$([0-9])$/u;

/** La familia que lee una cota de ese tipo, o `undefined` si no tiene (arco). */
export function cadDimensionFamilyFor(kind: CadDimensionFamilyKind | undefined): CadDimensionFamily | undefined {
  if (!kind) return undefined;
  return CAD_DIMENSION_FAMILIES.find((family) => family.kinds.includes(kind));
}

/** La familia por su palabra clave (`Radio`) o por su código (`4`). */
export function cadDimensionFamilyByKeyword(keyword: string | undefined): CadDimensionFamily | undefined {
  if (!keyword) return undefined;
  const wanted = keyword.trim().toUpperCase();
  return CAD_DIMENSION_FAMILIES.find(
    (family) => family.keyword.keyword.toUpperCase() === wanted || String(family.code) === wanted,
  );
}

/** `ISO-25` + radial → `ISO-25$4`. */
export function cadDimensionSubStyleName(parent: string, family: CadDimensionFamily): string {
  return `${parent}$${family.code}`;
}

/** La familia que declara el nombre `PADRE$n`, o `undefined` si no es subestilo. */
export function cadDimensionSubStyleFamily(name: string): CadDimensionFamily | undefined {
  const match = SUFFIX.exec(name);
  if (!match) return undefined;
  const code = Number(match[1]);
  return CAD_DIMENSION_FAMILIES.find((family) => family.code === code);
}

/** El padre de un nombre de subestilo; un nombre sin `$n` de familia es su propio padre. */
export function cadDimensionStyleParentName(name: string): string {
  return cadDimensionSubStyleFamily(name) ? name.replace(SUFFIX, "") : name;
}

/**
 * Lo que el ESTILO declara para una cota de ese tipo: el padre y, encima, su
 * subestilo de familia si existe. SIN defaults de fábrica: es la forma que
 * consume `cadDimensionStyleOverrides` («manda el estilo, sólo en lo que
 * declara»), donde mezclar los defaults haría que la norma pisara el borrador
 * en campos que nadie fijó.
 */
export function cadDimensionFamilyStyle(
  styles: Pick<CadStyleTable, "dimension"> | undefined,
  name: string | undefined,
  kind: CadDimensionFamilyKind | undefined,
): CadDimensionStyleDefinition {
  if (!name) return {};
  const table = styles?.dimension ?? {};
  const family = cadDimensionFamilyFor(kind);
  const sub = family ? table[cadDimensionSubStyleName(name, family)] : undefined;
  return { ...(table[name] ?? {}), ...(sub ?? {}) };
}

/** Las familias con subestilo definido bajo ese padre, en el orden de la tabla. */
export function cadDimensionSubStyles(
  styles: Pick<CadStyleTable, "dimension"> | undefined,
  parent: string,
): CadDimensionFamily[] {
  const table = styles?.dimension ?? {};
  return CAD_DIMENSION_FAMILIES.filter((family) => cadDimensionSubStyleName(parent, family) in table);
}
