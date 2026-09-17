/**
 * La PROBETA de sólidos y lámina de la sonda de integridad.
 *
 * ## Por qué existe
 *
 * El documento de prueba de `command-integrity-probe.mts` era plano: siete
 * entidades 2D, ninguna lámina y ningún sólido. Con ese documento, 18 de los 26
 * comandos de la familia `solids-*` y los 9 de la familia de lámina no llegaban
 * nunca a ejecutar nada: respondían «Esta orden necesita SOLID3D designados» o
 * «No hay ninguna presentación abierta», la sonda los contaba como
 * `honesto-limitado` y el gate los dejaba pasar. Decir la verdad sobre una
 * precondición que la sonda NUNCA cumple no cuesta nada: es un verde gratis
 * disfrazado de honestidad. Esta probeta les quita la excusa.
 *
 * ## Qué añade, y con qué
 *
 * DOS SÓLIDOS que se solapan (`s1`, `s2`), una REGIÓN (`r1`) y una LÁMINA
 * con su ventana y una vista derivada de SOLVIEW. Nada escrito a mano: los
 * sólidos salen de `boxNode` + `makeSolidEntity` —las MISMAS funciones que usa
 * BOX—, la lámina de `createCadLayout` —la misma puerta que usa LAYOUT Nueva— y
 * la vista derivada de `createCadSolView` —la misma que usa SOLVIEW—. Un brep
 * literal escrito aquí a mano sería exactamente la trampa que R2 cazó en MESH y
 * PLANESURF: geometría que cambia la serialización y no se puede evaluar.
 *
 * Tampoco se CONDUCE ningún comando para fabricarla. Si el fixture lo
 * construyera BOX, el día que BOX se rompiera el sólido dejaría de existir y
 * dieciocho comandos volverían a su límite honesto sin que nada lo denunciara.
 *
 * ## Por qué no puede regalar verdes
 *
 * `muta` se concede en cuanto un lote se aplica y la serialización cambia, así
 * que un fixture que se moviera solo podría ascender comandos sin que nadie lo
 * viera. Contra eso, `comprobarProbeta` mide la probeta con los evaluadores del
 * propio producto (`solid3dMesh`, `solid3dMassProperties`, `regionArea`, y el
 * `sinGeometria` del gate) y exige los números de `PROBETA_INVARIANTES`, más
 * que `serializeCadDocument` dé el MISMO texto en dos construcciones y tras una
 * vuelta `migrate`/`serialize`. Si algo se mueve, la corrida MUERE antes de
 * medir un solo comando. Y esos mismos números viajan al artefacto de
 * evidencia, así que una deriva también sale como diff en un PR.
 */
import { migrateCadDocument, serializeCadDocument, type CadDocument } from "../src/lib/cad/cad-document";
import type { CadRegionEntity, CadSolid3dEntity } from "../src/lib/cad/cad-entities-v5";
import { CAD_VIEWPORT_PLAN_VIEW, type CadPaperSpace } from "../src/lib/cad/cad-paper-viewport";
import { executeCadEntityCommandBatch } from "../src/lib/cad/entity-commands";
import { boxNode } from "../src/lib/cad/engine/commands/solids-primitive-shapes";
import { makeSolidEntity } from "../src/lib/cad/engine/commands/solids-support";
import { createCadLayout, upsertCadLayoutCommand } from "../src/lib/cad/layout/layout-operations";
import { createCadSolView } from "../src/lib/cad/layout/solview";
import { regionArea } from "../src/lib/cad/solid3d-adapter";
import { solid3dMassProperties, solid3dMesh } from "../src/lib/cad/solid3d-build";
import { cadDocumentExtents } from "../src/lib/cad/view/document-extents";
import { sinGeometria } from "../../../scripts/cad/command-integrity-rules.mjs";

/**
 * Lo que la probeta MIDE. No son constantes de configuración: son el resultado
 * de evaluar el fixture con los evaluadores del producto, clavado aquí para que
 * moverlo sea un cambio explícito y no un efecto secundario.
 */
export const PROBETA_INVARIANTES = {
  solidos: 2,
  triangulosPorSolido: 12,
  volumenPorSolido: 240_000,
  areaPorSolido: 24_800,
  region: 4_800,
  /**
   * A1, no A3: el papel no se elige, lo decide `createCadPaperSpace` a partir
   * de la envolvente del modelo (320×310 mm con los sólidos dentro). Está aquí
   * porque es lo MEDIDO, no porque se pida.
   */
  lamina: "A1",
  viewports: 2,
  vistasDerivadas: 1,
} as const;

/** Los ids que la probeta añade, en el orden en que se designan. */
export const PROBETA_IDS = ["r1", "s1", "s2"] as const;

/** Nombre de la lámina que la probeta deja abierta (`context.activeLayout`). */
export const PROBETA_LAYOUT = "PLANO";

/** Una caja de 100×60×40 con la esquina en `(x, y)`: volumen 240 000 mm³. */
function caja(id: string, x: number, y: number): CadSolid3dEntity {
  const nodo = boxNode({ first: { x, y }, opposite: { x: x + 100, y: y + 60 }, centered: false }, 40);
  return makeSolidEntity(id, [{ ...nodo, id: `${id}-caja` }], `${id}-caja`, "0", id);
}

/** Un rectángulo 80×60 como REGIÓN real: área 4 800 mm². */
function region(): CadRegionEntity {
  return {
    id: "r1",
    type: "region",
    layer: "0",
    outer: [
      { x: 0, y: 100, z: 0 },
      { x: 80, y: 100, z: 0 },
      { x: 80, y: 160, z: 0 },
      { x: 0, y: 160, z: 0 },
    ],
  };
}

const METADATOS_DE_HOJA = {
  project: "PROBETA",
  drawingNumber: "PROBETA-01",
  title: PROBETA_LAYOUT,
  sheetNumber: "1",
  revision: "-",
  discipline: "General",
};

/**
 * La probeta: el documento base MÁS los dos sólidos, la región y la lámina.
 *
 * `base` llega como fábrica y no como objeto para que NADA se comparta entre
 * comandos: la sonda reconstruye el documento entero en cada uno, y un objeto
 * de módulo compartido sería precisamente la vía por la que el efecto de un
 * comando se arrastraría hasta el siguiente.
 *
 * Los sólidos se COLOCAN SOLAPADOS a propósito: `(0,200)-(100,260)` y
 * `(60,230)-(160,290)` comparten 40×30×40 mm³. Sin solape, UNION daría dos
 * cuerpos sueltos, INTERSECT nada e INTERFERE «no interfieren»: tres comandos
 * que seguirían sin medirse.
 */
export function probetaDocument(base: () => CadDocument): CadDocument {
  const semilla = base();
  const conSolidos: CadDocument = {
    ...semilla,
    entities: [...semilla.entities, region() as never, caja("s1", 0, 200) as never, caja("s2", 60, 230) as never],
  };

  const extents = cadDocumentExtents(conSolidos);
  // Un documento con siete entidades 2D y dos sólidos SIEMPRE tiene envolvente.
  // Si no la tiene, el fixture no es el que dice ser y la probeta muere aquí en
  // vez de inventarse un papel.
  if (!extents) throw new Error("la probeta no tiene envolvente: cadDocumentExtents devolvió null");
  const lamina = createCadLayout([], {
    id: "lam1",
    name: PROBETA_LAYOUT,
    modelBounds: {
      x: extents.minX,
      y: extents.minY,
      width: Math.max(1, extents.maxX - extents.minX),
      height: Math.max(1, extents.maxY - extents.minY),
    },
    ...(conSolidos.meta?.unit ? { unit: conSolidos.meta.unit } : {}),
    metadata: METADATOS_DE_HOJA,
  });

  // La lámina entra por el EJECUTOR REAL de lotes, el mismo con el que la sonda
  // aplica los efectos de un comando. Si el ejecutor rechazara la lámina, la
  // probeta tiene que morir aquí y no medir nada.
  const conLamina = executeCadEntityCommandBatch(
    conSolidos,
    [upsertCadLayoutCommand(lamina)],
    "probeta:lámina",
  ).document;

  const derivada = createCadSolView({
    document: conLamina,
    space: (conLamina.paperSpaces ?? [])[0] as CadPaperSpace,
    viewportId: "vp-probeta",
    name: "PROBETA",
    view: CAD_VIEWPORT_PLAN_VIEW,
    paperBounds: hueco(lamina),
  });
  if (!("ok" in derivada) || derivada.ok !== true) {
    // ABORTA en vez de seguir: una lámina sin vista derivada mediría SOLDRAW
    // contra una precondición que la probeta prometió cumplir, que es el mismo
    // verde gratis que esto viene a cerrar.
    const motivo = "message" in derivada ? derivada.message : "createCadSolView no devolvió una vista";
    throw new Error(`la probeta no pudo derivar la vista de SOLVIEW: ${motivo}`);
  }

  return executeCadEntityCommandBatch(conLamina, derivada.commands, "probeta:vista-derivada").document;
}

/** El rectángulo útil del papel, dentro de los márgenes y sobre el cajetín. */
function hueco(space: CadPaperSpace): { x: number; y: number; width: number; height: number } {
  const margins = space.pageSetup?.margins ?? { top: 10, right: 10, bottom: 10, left: 20 };
  return {
    x: margins.left,
    y: margins.bottom + 30,
    width: Math.max(10, space.page.width - margins.left - margins.right),
    height: Math.max(10, space.page.height - margins.top - margins.bottom - 30),
  };
}

const EVALUADORES = { solid3dMesh, solid3dMassProperties, regionArea };

/**
 * Comprueba la probeta contra sus invariantes. Devuelve los motivos del
 * rechazo; vacío si el fixture es el que dice ser.
 *
 * Se mide con los evaluadores del PRODUCTO y con el `sinGeometria` del GATE,
 * no con una lectura del literal: un fixture que se declarara a sí mismo
 * correcto no probaría nada.
 */
export function comprobarProbeta(base: () => CadDocument): string[] {
  const fallos: string[] = [];
  let documento: CadDocument;
  try {
    documento = probetaDocument(base);
  } catch (error) {
    return [`la probeta no se pudo construir: ${error instanceof Error ? error.message : String(error)}`];
  }

  const solidos = documento.entities.filter((entity) => entity.type === "solid3d");
  if (solidos.length !== PROBETA_INVARIANTES.solidos)
    fallos.push(`sólidos: ${solidos.length} en vez de ${PROBETA_INVARIANTES.solidos}`);
  for (const solido of solidos) {
    const triangulos = solid3dMesh(solido as never).indices.length / 3;
    if (triangulos !== PROBETA_INVARIANTES.triangulosPorSolido)
      fallos.push(`${solido.id}: ${triangulos} triángulos en vez de ${PROBETA_INVARIANTES.triangulosPorSolido}`);
    const masa = solid3dMassProperties(solido as never);
    if (masa.volume !== PROBETA_INVARIANTES.volumenPorSolido)
      fallos.push(`${solido.id}: volumen ${masa.volume} en vez de ${PROBETA_INVARIANTES.volumenPorSolido}`);
    if (masa.area !== PROBETA_INVARIANTES.areaPorSolido)
      fallos.push(`${solido.id}: área ${masa.area} en vez de ${PROBETA_INVARIANTES.areaPorSolido}`);
  }

  const reg = documento.entities.find((entity) => entity.id === "r1");
  if (!reg || reg.type !== "region") fallos.push("la región r1 no está en el documento");
  else if (regionArea(reg as never) !== PROBETA_INVARIANTES.region)
    fallos.push(`r1: área ${regionArea(reg as never)} en vez de ${PROBETA_INVARIANTES.region}`);

  for (const id of PROBETA_IDS) {
    const entidad = documento.entities.find((entity) => entity.id === id);
    if (!entidad) {
      fallos.push(`${id} no llegó al documento`);
      continue;
    }
    const motivo = sinGeometria(entidad, EVALUADORES);
    if (motivo) fallos.push(`${id}: el gate lo daría por vacío — ${motivo}`);
  }

  const espacios = documento.paperSpaces ?? [];
  if (espacios.length !== 1) fallos.push(`presentaciones: ${espacios.length} en vez de 1`);
  const lamina = espacios[0];
  if (lamina) {
    if (lamina.name !== PROBETA_LAYOUT) fallos.push(`la lámina se llama «${lamina.name}», no «${PROBETA_LAYOUT}»`);
    if (lamina.pageSetup?.paper !== PROBETA_INVARIANTES.lamina)
      fallos.push(`el papel es «${lamina.pageSetup?.paper}», no «${PROBETA_INVARIANTES.lamina}»`);
    const ventanas = lamina.viewports ?? [];
    if (ventanas.length !== PROBETA_INVARIANTES.viewports)
      fallos.push(`ventanas: ${ventanas.length} en vez de ${PROBETA_INVARIANTES.viewports}`);
    const derivadas = ventanas.filter((viewport) => viewport.derivation).length;
    if (derivadas !== PROBETA_INVARIANTES.vistasDerivadas)
      fallos.push(`vistas derivadas: ${derivadas} en vez de ${PROBETA_INVARIANTES.vistasDerivadas}`);
  }

  // El fixture no puede moverse por su cuenta: dos construcciones tienen que
  // dar el MISMO texto canónico, y pasarlo por el migrador tampoco puede
  // cambiarlo. Sin esto, «muta» —que se concede comparando serializaciones—
  // podría concederse por una deriva del documento inicial.
  const primera = serializeCadDocument(documento);
  const segunda = serializeCadDocument(probetaDocument(base));
  if (primera !== segunda) fallos.push("dos construcciones de la probeta NO serializan igual");
  const ida = serializeCadDocument(migrateCadDocument(JSON.parse(primera) as never));
  if (ida !== primera) fallos.push("la probeta no sobrevive a la vuelta migrate/serialize");

  return fallos;
}

/** Los invariantes medidos, tal como viajan al artefacto de evidencia. */
export function probetaEvidencia(base: () => CadDocument) {
  const documento = probetaDocument(base);
  const solidos = documento.entities.filter((entity) => entity.type === "solid3d");
  const reg = documento.entities.find((entity) => entity.id === "r1");
  const lamina = (documento.paperSpaces ?? [])[0];
  return {
    solidos: solidos.length,
    triangulos: solidos.length > 0 ? solid3dMesh(solidos[0] as never).indices.length / 3 : 0,
    volumen: solidos.length > 0 ? solid3dMassProperties(solidos[0] as never).volume : 0,
    area: solidos.length > 0 ? solid3dMassProperties(solidos[0] as never).area : 0,
    region: reg && reg.type === "region" ? regionArea(reg as never) : 0,
    lamina: lamina?.pageSetup?.paper ?? "?",
    viewports: (lamina?.viewports ?? []).length,
    vistasDerivadas: (lamina?.viewports ?? []).filter((viewport) => viewport.derivation).length,
  };
}
