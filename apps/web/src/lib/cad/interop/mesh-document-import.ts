/**
 * Orquesta los cuatro lectores de malla hacia un `CadDocument` canónico.
 *
 * Es la única pieza de `lib/cad/interop/` que sabe de `CadDocument`: decide
 * cuántos componentes caben, cose cada uno con `stitchMeshToBody`, y arma el
 * manifiesto de pérdidas del documento — nunca una importación silenciosa que
 * parece completa cuando no lo es. Regla 6 del repositorio: un cosedor que
 * nadie llama no cuenta como implementado, y este archivo es el que lo llama.
 */
import { layoutToCadDocument, migrateCadDocument, type CadDocument, type CadEntity, type CadLossManifestEntry } from "../cad-document";
import { stitchMeshToBody } from "../../brep";
import { bodyToSolidNode } from "../solid3d-build";
import type { CadSolid3dEntity, CadSolidNode } from "../cad-entities-v5";
import { readObjMesh } from "./obj-mesh-reader";
import { readStlMesh } from "./stl-mesh-reader";
import { readGltfMesh } from "./gltf-mesh-reader";
import { readColladaMesh } from "./collada-mesh-reader";
import { looksLikeSkp, rejectSkp } from "./skp-reject";
import { MESH_IMPORT_MAX_COMPONENTS, componentExceedsBudgetMessage, componentFitsPointBudget } from "./mesh-import-limits";
import type { MeshImportFormat, MeshReader, RawMeshComponent } from "./mesh-import-types";

export interface MeshDocumentImportReport {
  format: MeshImportFormat;
  document: CadDocument;
  importedEntityCount: number;
  importedBlockCount: number;
  warnings: Array<{ code: string; message: string }>;
  /** Cuántos componentes traía el archivo contra cuántos entraron al documento. */
  componentsFound: number;
  componentsImported: number;
}

const READERS: Record<MeshImportFormat, MeshReader> = {
  obj: readObjMesh,
  stl: readStlMesh,
  gltf: readGltfMesh,
  collada: readColladaMesh,
};

/** glTF y COLLADA declaran metro; OBJ y STL no declaran nada y viajan tal cual. */
const METER_TO_MM = 1000;

function scaleComponent(component: RawMeshComponent, factor: number): RawMeshComponent {
  if (factor === 1) return component;
  return { ...component, points: component.points.map((p) => ({ x: p.x * factor, y: p.y * factor, z: p.z * factor })) };
}

/**
 * Lee un archivo de malla y devuelve el documento canónico con un `solid3d`
 * por componente que quepa en el presupuesto. Lanza si el archivo es `.skp`,
 * si el formato no lo reconoce ningún lector, o si NINGÚN componente produjo
 * un sólido — una importación vacía que se reporta como éxito es peor que un
 * error.
 */
export async function importMeshDocument(
  fileName: string,
  bytes: Uint8Array,
  format: MeshImportFormat,
): Promise<MeshDocumentImportReport> {
  if (looksLikeSkp(bytes, fileName)) rejectSkp(fileName);

  const raw = await READERS[format](bytes, fileName);
  const unitFactor = raw.unit === "meter" ? METER_TO_MM : 1;

  const lossManifest: CadLossManifestEntry[] = raw.warnings.map((detail) => ({
    code: "mesh_reader_warning",
    severity: "info",
    detail,
  }));
  if (raw.unit === "unknown") {
    lossManifest.push({
      code: "mesh_unit_unknown",
      severity: "warning",
      detail: `El formato ${format.toUpperCase()} no declara una unidad: se importaron los números del archivo tal cual, sin convertir. Verifica la escala del modelo contra una medida conocida.`,
    });
  }

  const total = raw.components.length;
  const attempted = raw.components.slice(0, MESH_IMPORT_MAX_COMPONENTS);
  if (total > attempted.length) {
    lossManifest.push({
      code: "mesh_component_limit",
      severity: "error",
      detail: `El archivo trae ${total} componentes; sólo se procesaron los primeros ${attempted.length} (máximo por importación).`,
    });
  }

  const entities: CadEntity[] = [];
  let imported = 0;
  for (let index = 0; index < attempted.length; index += 1) {
    const component = scaleComponent(attempted[index], unitFactor);
    const label = component.name ?? `componente ${index + 1}`;

    let stitched: ReturnType<typeof stitchMeshToBody>;
    try {
      stitched = stitchMeshToBody({ points: component.points, faces: component.faces });
    } catch (error) {
      lossManifest.push({
        code: "mesh_component_rejected",
        severity: "error",
        detail: `«${label}» no se importó: ${(error as Error).message}`,
      });
      continue;
    }
    if (!componentFitsPointBudget(stitched.stats.weldedVertices)) {
      lossManifest.push({
        code: "mesh_component_too_large",
        severity: "error",
        detail: `«${label}» no se importó: ${componentExceedsBudgetMessage(label, stitched.stats.weldedVertices)}`,
      });
      continue;
    }
    for (const entry of stitched.loss) {
      lossManifest.push({ code: entry.code, severity: entry.severity, detail: `«${label}»: ${entry.detail}` });
    }

    const id = `mesh-${index}`;
    // `bodyToSolidNode` siempre devuelve el nodo hoja `op:"brep"`, pero su tipo
    // declarado es la unión completa `CadSolidNode`: TypeScript comprueba las
    // propiedades EXTRA de un spread contra la unión entera (el primer
    // miembro que no trae `source`), no contra el miembro real. El `as`
    // documenta lo que ya sabemos por cómo está escrita esa función.
    const node = {
      ...bodyToSolidNode(stitched.body, id),
      source: { format, ...(component.name ? { name: component.name } : {}) },
    } as CadSolidNode;
    const entity: CadSolid3dEntity = {
      id,
      type: "solid3d",
      nodes: [node],
      root: id,
      layer: "0",
      name: component.name ?? `${format.toUpperCase()} ${index + 1}`,
    };
    entities.push(entity);
    imported += 1;
  }

  if (imported === 0) {
    throw new Error(
      `«${fileName}» se leyó pero ninguno de sus ${total} componente(s) produjo un sólido importable. ` +
        `Revisa el manifiesto: ${lossManifest.map((entry) => entry.detail).join(" · ")}`,
    );
  }
  if (imported < total) {
    lossManifest.push({
      code: "mesh_partial_import",
      severity: "warning",
      detail: `Se importaron ${imported} de ${total} componente(s) del archivo. El resto está declarado arriba con su motivo — no es una importación completa.`,
    });
  }

  const empty = layoutToCadDocument({}, { unit: "mm" });
  const document = migrateCadDocument({
    ...empty,
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    lossManifest,
  });

  return {
    format,
    document,
    importedEntityCount: document.entities.length,
    importedBlockCount: document.blocks.length,
    warnings: lossManifest.map((entry) => ({ code: entry.code, message: entry.detail })),
    componentsFound: total,
    componentsImported: imported,
  };
}
