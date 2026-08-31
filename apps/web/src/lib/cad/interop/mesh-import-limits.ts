/**
 * Topes de la importación de malla: bytes de entrada, puntos por sólido y
 * componentes por documento. Fallo CERRADO que dice el número exacto — nunca
 * una importación a medias que parece completa.
 *
 * ## El tope que muerde primero no es el que uno espera
 *
 * `apps/api/.../cad-solid-invariants.ts` declara `MAX_BREP_POINTS = 200_000`
 * por sólido. Pero 200 000 puntos `{x,y,z}` serializados en JSON pesan entre
 * 10 y 15 MB — por encima de `CAD_DOCUMENT_LIMITS.maxInlineBytes` (8 MB,
 * `packages/contracts/src/design-contracts.ts`). `apps/web` no puede importar
 * el número del API (son procesos y despliegues distintos: el mismo patrón
 * que ya usa `dwg-import-limits.ts` para no acoplar el bundle del navegador al
 * código del servidor), así que aquí se declara un tope PROPIO y más
 * conservador — `MESH_IMPORT_MAX_POINTS_PER_SOLID`, más abajo — pensado para
 * el JSON inline, no para el techo del validador del servidor. Si algún día
 * ambos números deben coincidir exactamente, la prueba cruzada vive en
 * `mesh-import-limits.spec.ts`, con el mismo criterio que ya usa
 * `dwg-import-limits.ts` para el suyo.
 *
 * ## Aritmética del tope de puntos, para que no sea un número inventado
 *
 * Un punto de `CadPoint3` serializa como `{"x":-123.456789,"y":...,"z":...}`:
 * en el peor caso (coordenadas de importación con muchos decimales) ronda 70
 * bytes. `maxInlineBytes` es 8 000 000 y un documento nunca es SÓLO el sólido
 * importado — hay metadatos, capas, otras entidades — así que se reserva la
 * mitad del presupuesto para el resto del documento: 4 000 000 bytes / 70
 * bytes·punto ≈ 57 000 puntos. Se redondea a la baja a un número redondo.
 */
export const MESH_IMPORT_MAX_POINTS_PER_SOLID = 50_000;

/** Componentes (objetos/mallas nombrados) que se procesan de un solo archivo. */
export const MESH_IMPORT_MAX_COMPONENTS = 256;

/**
 * Tope de bytes de archivo por formato.
 *
 * OBJ y COLLADA son texto: la misma geometría pesa varias veces más que en
 * binario (coordenadas en ASCII, cada índice repetido por cara). STL y glTF
 * binarios son densos. Los cuatro comparten orden de magnitud porque todos
 * están acotados, en última instancia, por el mismo techo de puntos por
 * sólido — un archivo mucho mayor que esto no puede contener SÓLO geometría
 * importable, así que cortar antes de leer nada es correcto, no sólo barato.
 */
export const MESH_IMPORT_MAX_BYTES: Record<"obj" | "stl" | "gltf" | "collada", number> = {
  obj: 64_000_000,
  stl: 32_000_000,
  gltf: 64_000_000,
  collada: 64_000_000,
};

export class MeshImportLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeshImportLimitError";
  }
}

/** Fallo cerrado con el número exacto — nunca "el archivo es muy grande" a secas. */
export function assertMeshFileByteBudget(format: keyof typeof MESH_IMPORT_MAX_BYTES, byteLength: number, fileName: string): void {
  const limit = MESH_IMPORT_MAX_BYTES[format];
  if (byteLength > limit) {
    throw new MeshImportLimitError(
      `«${fileName}» pesa ${byteLength.toLocaleString("es-MX")} bytes; el máximo para ${format.toUpperCase()} es ${limit.toLocaleString("es-MX")} bytes.`,
    );
  }
}

/**
 * ¿Este componente cabe en un sólido? Nunca lanza: el llamante decide si
 * excluir el componente (importación parcial DECLARADA) o abortar todo.
 */
export function componentFitsPointBudget(pointCount: number): boolean {
  return pointCount <= MESH_IMPORT_MAX_POINTS_PER_SOLID;
}

export function componentExceedsBudgetMessage(name: string, pointCount: number): string {
  return `El componente «${name}» tiene ${pointCount.toLocaleString("es-MX")} puntos; el máximo por sólido es ${MESH_IMPORT_MAX_POINTS_PER_SOLID.toLocaleString("es-MX")}.`;
}
