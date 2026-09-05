/**
 * LO QUE EL IMPORTADOR DECLARA MÁS ALLÁ DEL MAPA DE ENTIDADES.
 *
 * El mapa de primitivas avisa de lo que no sabe convertir. Estos dos avisos son
 * de otra especie: hablan de cosas que el FICHERO trae y el DOCUMENTO no, sin
 * que ninguna entidad haya fallado en convertirse. Los dos nacieron de medir
 * contra material ajeno y los dos existen por la misma regla —«ninguna pérdida
 * es silenciosa»—, así que viven juntos y fuera de `dxf-import.ts`, que está en
 * su asignación de tamaño.
 *
 * Se emiten UNO POR ELEMENTO y no uno por fichero: el informe de importación
 * agrupa por código y CUENTA los avisos, así que un aviso único que dijera «7»
 * en su texto habría salido como «1 capa» en la tabla que lee el arquitecto.
 */
import { countDxfEntitiesOutsideEntitiesSection, rawDxfPairs } from "./dxf-read-core";
import type {
  CadDxfImportWarning,
  CadDxfSemanticBlock,
  CadDxfSemanticDimension,
  CadDxfSemanticInsert,
} from "./dxf-import";

export function declaraLoQueNoLlegaAlDocumento(
  text: string,
  blocks: readonly CadDxfSemanticBlock[],
  inserts: readonly CadDxfSemanticInsert[],
  semanticDimensions: readonly CadDxfSemanticDimension[],
  layerDefinitions: readonly { name: string }[],
  layers: ReadonlySet<string>,
): CadDxfImportWarning[] {
  const warnings: CadDxfImportWarning[] = [];
  // LO QUE VIVE DENTRO DE UNA DEFINICIÓN DE BLOQUE Y YA NO SALE SUELTO.
  //
  // Los escaneos crudos de MTEXT y HATCH tienen ámbito desde P-evidencia-11:
  // sólo recogen lo que está en `ENTITIES`. Eso corrigió un defecto real —lo de
  // dentro de un BLOCK salía a espacio modelo con las coordenadas locales del
  // bloque, sin la transformación del INSERT que lo trae— pero dejó de traer
  // entidades que el fichero SÍ tiene, y una entidad que está en el fichero y
  // no en el documento no puede quedarse sin que nadie lo diga. El techo de
  // pérdidas silenciosas del corpus ajeno es cero y cazó esto a la primera
  // corrida: cinco tipos en cuatro ficheros.
  //
  // Lo que el aviso dice es lo que se puede afirmar sin adivinar: están en una
  // definición de bloque, y de ahí se dibujan a través del INSERT que las trae.
  // Si ningún INSERT alcanza ese bloque no formaban parte del dibujo —medido
  // por alcanzabilidad transitiva en `verification/terceros-jornada.spec.ts`
  // sobre floorplan.dxf: 135 MTEXT y 13 HATCH en bloques que nadie inserta—,
  // pero siguen estando en el archivo del remitente y por eso se nombran.
  // ALCANZABILIDAD, transitiva desde espacio modelo. Un bloque que algún INSERT
  // trae dibuja su contenido, así que lo de dentro no falta y no se avisa; lo
  // que vive en una definición que NADIE inserta está en el archivo del
  // remitente y no en el documento, y eso sí hay que decirlo.
  const bloquePorNombre = new Map(blocks.map((bloque) => [bloque.name, bloque]));
  const alcanzables = new Set<string>();
  // Las raíces son los INSERT del dibujo Y los bloques de dibujo de las cotas
  // (`*D1`, `*D2`…), que no los trae ningún INSERT sino la propia DIMENSION.
  // Su rótulo llega al dibujo porque la cota lo recalcula, así que tampoco
  // falta: sin esta segunda raíz el aviso acusaría de pérdida a cada cota.
  const porVisitar = [
    ...inserts.map((insert) => insert.block),
    ...semanticDimensions.map((cota) => cota.blockName).filter((nombre) => nombre.length > 0),
  ];
  while (porVisitar.length > 0) {
    const nombre = porVisitar.pop()!;
    if (alcanzables.has(nombre)) continue;
    alcanzables.add(nombre);
    for (const anidado of bloquePorNombre.get(nombre)?.inserts ?? []) porVisitar.push(anidado.block);
  }
  const huerfanas = countDxfEntitiesOutsideEntitiesSection(
    rawDxfPairs(text),
    ["MTEXT", "HATCH"],
    alcanzables,
  );
  for (const [tipo, cuantas] of Object.entries(huerfanas))
    for (let i = 0; i < cuantas; i += 1)
      warnings.push({
        code: "entity_in_block_definition",
        entityType: tipo,
        message:
          `Un ${tipo} vive dentro de una definición de bloque que ningún INSERT del dibujo trae: ` +
          "está en el archivo y no llega al documento.",
      });

  // LAS CAPAS DECLARADAS QUE NADIE USA. La lista de capas se construye a partir
  // de las que las entidades USAN, así que una capa que el fichero declara y
  // ninguna entidad pisa no llega al documento. El dibujo no cambia —nada se
  // pinta en ellas— pero sí la paleta que ve el arquitecto y la tabla del
  // fichero que se le devuelve al remitente. Medido sobre floorplan.dxf: la
  // tabla LAYER declara 24, al documento llegan 17, y hasta hoy ningún aviso lo
  // mencionaba: el arquitecto no podía dibujar en `TEMP` sin volver a crearla y
  // no tenía dónde enterarse. Se avisa AQUÍ y no al construir el documento
  // porque de aquí salen los dos canales —el informe que se lee y el manifiesto
  // de pérdidas que se guarda—, y una pérdida que sólo llega a uno es media.
  const capasDeclaradasSinUsar = layerDefinitions
    .map((entry) => entry.name)
    .filter((name) => name !== "0" && !layers.has(name));
  // UNO POR CAPA, no uno por fichero: el informe agrupa por código y CUENTA los
  // avisos, así que un aviso único que dijera «7» en su texto habría salido
  // como «1 capa» en la tabla. Cada capa nombrada por su nombre, además, es lo
  // que deja al arquitecto volver a crear la suya.
  for (const nombre of capasDeclaradasSinUsar)
    warnings.push({
      code: "layer_table_pruned",
      entityType: "LAYER",
      layer: nombre,
      message: `La capa «${nombre}» está declarada en el archivo y no la usa ninguna entidad: no llega al documento.`,
    });
  return warnings;
}
