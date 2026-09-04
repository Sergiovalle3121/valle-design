#!/usr/bin/env node
/**
 * Sonda del CORPUS y del LOD para el trinquete del reparto por etapa.
 *
 * ## Por qué el trinquete necesita esto y no le basta con los relojes
 *
 * Un presupuesto por etapa sin saber sobre QUÉ se midió no protege nada: si el
 * corpus cambia, los milisegundos cambian con él y el techo pasa a juzgar otro
 * dibujo. Por eso la primera mitad de esta sonda es el sha256 del documento
 * contra el que `corpus-mixes-manifest.json` versiona la mezcla. Si no cuadra,
 * el reparto no es publicable: no está midiendo el corpus que dice medir.
 *
 * La segunda mitad responde a la pregunta que un reloj por etapa nunca
 * responde: **de dónde sale el coste**. `tessellate` puede subir porque el
 * teselador se volvió lento o porque le están pidiendo cien veces más
 * segmentos, y son dos averías distintas con dos dueños distintos. Esta sonda
 * mide, por tipo de entidad y por escalón de LOD, cuántos segmentos devuelve
 * `tessellateCadEntity` — el mismo camino que paga el pipeline. Con eso, una
 * regresión de reloj llega con su explicación al lado en vez de con una
 * hipótesis.
 *
 * No mide tiempo A PROPÓSITO. Los milisegundos los mide el perfilador de
 * etapas en su propio proceso; mezclarlos aquí metería el coste de esta sonda
 * en el reparto que el trinquete juzga.
 *
 * Uso (la invoca `scripts/perf/etapas-100k-medir.mjs`; a mano también vale):
 *   cd apps/web && npx tsx ../../scripts/perf/etapas-100k-lod-probe.mts \
 *     --mix architecture --entities 100000
 *
 * Escribe UN objeto JSON por stdout. Todo lo demás va a stderr.
 */
import { createHash } from "node:crypto";
import { serializeCadDocument } from "../../apps/web/src/lib/cad/cad-document";
import {
  CAD_CORPUS_MIX_IDS,
  createCadCorpusMix,
  findCadCorpusMixManifestEntry,
  type CadCorpusMixId,
} from "../../apps/web/src/lib/cad/benchmark/corpus-mixes";
import {
  cadDocumentBounds,
  createCadRenderScenario,
} from "../../apps/web/src/lib/cad/benchmark/scenario";
import { CAD_ENTITY_REGISTRY } from "../../apps/web/src/lib/cad/entity-runtime";
import {
  CAD_RENDER_LOD_COARSE_MAX_PX,
  CAD_RENDER_LOD_MEDIUM_MAX_PX,
  cadRenderLodTier,
  cadRenderSegmentBudget,
  tessellateCadEntity,
  type CadRenderLodTier,
} from "../../apps/web/src/lib/cad/render/tessellation-cache";

interface Opciones {
  mix: CadCorpusMixId;
  entities: number;
  /** Las mismas paradas de paneo que usa el perfilador: el escenario tiene que ser el mismo. */
  panStops: number;
  /**
   * Entidades por tipo que se tesela en los tres escalones. No es el corpus
   * entero porque un HATCH a tier 2 cuesta ~14.000 segmentos y teselar los
   * 14.000 sombreados tres veces tardaría más que la medición que esta sonda
   * viene a explicar. La media por tipo es estable mucho antes: el generador
   * de la mezcla reparte tamaños con un LCG de periodo 1000.
   */
  muestra: number;
}

function parseCli(argv: string[]): Opciones {
  const opciones: Opciones = { mix: "architecture", entities: 100_000, panStops: 12, muestra: 120 };
  for (let index = 0; index < argv.length; index += 1) {
    const argumento = argv[index];
    if (argumento === "--mix") {
      const mix = argv[++index] as CadCorpusMixId | undefined;
      if (!mix || !CAD_CORPUS_MIX_IDS.includes(mix))
        throw new Error(`--mix debe ser una de: ${CAD_CORPUS_MIX_IDS.join(", ")}.`);
      opciones.mix = mix;
    } else if (argumento === "--entities") {
      opciones.entities = Number.parseInt(argv[++index] ?? "", 10);
    } else if (argumento === "--pan-stops") {
      opciones.panStops = Number.parseInt(argv[++index] ?? "", 10);
    } else if (argumento === "--muestra") {
      opciones.muestra = Number.parseInt(argv[++index] ?? "", 10);
    } else {
      // Una bandera desconocida es un error, no algo que se ignora: una sonda
      // que acepta `--muestraa` en silencio publica una muestra distinta de la
      // que se le pidió.
      throw new Error(`Bandera desconocida: ${argumento}`);
    }
  }
  if (!Number.isSafeInteger(opciones.entities) || opciones.entities < 1)
    throw new Error("--entities tiene que ser un entero positivo.");
  if (!Number.isSafeInteger(opciones.muestra) || opciones.muestra < 1)
    throw new Error("--muestra tiene que ser un entero positivo.");
  return opciones;
}

const opciones = parseCli(process.argv.slice(2));
const corpus = createCadCorpusMix({ mix: opciones.mix, entities: opciones.entities });

// --- 1. El corpus, atado a su sha versionado -------------------------------
const documentSha256 = createHash("sha256")
  .update(serializeCadDocument(corpus.document))
  .digest("hex");
const entradaManifiesto = findCadCorpusMixManifestEntry(opciones.mix, opciones.entities);

// --- 2. Segmentos por tipo y por escalón -----------------------------------
const TIERS: readonly CadRenderLodTier[] = [0, 1, 2];
const acumulado = new Map<string, { entidades: number; segmentos: [number, number, number] }>();
const totalPorTipo = new Map<string, number>();

for (const entity of corpus.nativeEntities) {
  const tipo = (entity as { type: string }).type;
  totalPorTipo.set(tipo, (totalPorTipo.get(tipo) ?? 0) + 1);
  let acc = acumulado.get(tipo);
  if (!acc) {
    acc = { entidades: 0, segmentos: [0, 0, 0] };
    acumulado.set(tipo, acc);
  }
  if (acc.entidades >= opciones.muestra) continue;
  acc.entidades += 1;
  for (const tier of TIERS) {
    acc.segmentos[tier] += tessellateCadEntity(
      entity,
      cadRenderSegmentBudget(tier),
      corpus.document,
    ).segmentCount;
  }
}

const redondear = (valor: number) => Number(valor.toFixed(3));

const porTipo = [...acumulado]
  .map(([tipo, acc]) => ({
    tipo,
    entidadesEnElCorpus: totalPorTipo.get(tipo) ?? 0,
    entidadesMuestreadas: acc.entidades,
    segmentosMediosPorTier: acc.segmentos.map((suma) => redondear(suma / acc.entidades)) as [
      number,
      number,
      number,
    ],
  }))
  // De más caro a más barato en detalle completo: el primero de la lista es
  // quien manda en `tessellate` cuando la vista se acerca.
  .sort((a, b) => b.segmentosMediosPorTier[2] - a.segmentosMediosPorTier[2]);

/**
 * El salto que de verdad decide el coste: cuántas veces más caro es el primer
 * escalón por encima de tier 0. Un tipo con salto ×3.000 significa que basta
 * con que unas pocas de sus entidades pasen de 24 px para que se coman la
 * etapa entera, por muy barato que sea el resto del dibujo.
 */
// --- 3. En qué escalón cae cada tipo EN EL ESCENARIO QUE SE MIDE -----------
//
// Los segmentos por escalón de arriba dicen lo que CUESTA cada escalón; este
// censo dice cuál se paga de verdad. Sin él, un tipo carísimo a tier 1 se
// puede descartar diciendo «pero está en tier 0», que es exactamente el
// razonamiento que dejó pasar la fuga: cierto en la vista inicial y falso en
// la parada de zoom del mismo recorrido.
const bounds = cadDocumentBounds(corpus.nativeEntities, corpus.document);
const escenario = createCadRenderScenario(bounds, opciones.panStops);
const censo = new Map<string, [number, number, number]>();
let sinBounds = 0;
for (const entity of corpus.nativeEntities) {
  const tipo = (entity as { type: string }).type;
  const caja = CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(entity as never, corpus.document);
  if (!caja) {
    sinBounds += 1;
    continue;
  }
  // Mismo criterio que el pipeline: el lado mayor de la caja, en píxeles.
  const spanPx =
    Math.max(caja.maxX - caja.minX, caja.maxY - caja.minY) * escenario.zoom.pixelsPerUnit;
  const fila = censo.get(tipo) ?? [0, 0, 0];
  fila[cadRenderLodTier(spanPx)] += 1;
  censo.set(tipo, fila);
}

const saltos = porTipo.map((fila) => ({
  tipo: fila.tipo,
  saltoTier0aTier1: redondear(
    fila.segmentosMediosPorTier[0] > 0
      ? fila.segmentosMediosPorTier[1] / fila.segmentosMediosPorTier[0]
      : fila.segmentosMediosPorTier[1],
  ),
  tier1IgualQueTier2:
    Math.abs(fila.segmentosMediosPorTier[1] - fila.segmentosMediosPorTier[2]) < 1e-6,
}));

process.stdout.write(
  `${JSON.stringify(
    {
      mix: opciones.mix,
      entities: opciones.entities,
      muestraPorTipo: opciones.muestra,
      corpus: {
        documentSha256,
        manifestSha256: entradaManifiesto?.sha256 ?? null,
        matchesManifest: entradaManifiesto
          ? entradaManifiesto.sha256 === documentSha256
          : false,
      },
      lod: {
        umbralesPx: {
          tier0MaxPx: CAD_RENDER_LOD_COARSE_MAX_PX,
          tier1MaxPx: CAD_RENDER_LOD_MEDIUM_MAX_PX,
        },
        segmentosPorTier: TIERS.map((tier) => cadRenderSegmentBudget(tier)),
        porTipo,
        saltos,
        censoEnLaParadaDeZoom: {
          que:
            "Cuántas entidades de cada tipo caen en cada escalón en la parada de ZOOM del " +
            "mismo recorrido que mide el reparto — no en la vista inicial. Es el escalón que " +
            "de verdad se paga.",
          panStops: opciones.panStops,
          zoomPixelsPerUnit: escenario.zoom.pixelsPerUnit,
          unidadesPorTier0: redondear(CAD_RENDER_LOD_COARSE_MAX_PX / escenario.zoom.pixelsPerUnit),
          entidadesSinCaja: sinBounds,
          porTipo: [...censo]
            .map(([tipo, fila]) => ({ tipo, tier0: fila[0], tier1: fila[1], tier2: fila[2] }))
            .sort((a, b) => b.tier1 + b.tier2 - (a.tier1 + a.tier2)),
        },
      },
    },
    null,
    2,
  )}\n`,
);

process.stderr.write(
  [
    "",
    `Sonda de corpus y LOD · ${opciones.mix}@${opciones.entities}`,
    `  corpus sha256 ${documentSha256.slice(0, 16)}… · manifiesto: ${
      entradaManifiesto
        ? entradaManifiesto.sha256 === documentSha256
          ? "CUADRA"
          : "NO CUADRA"
        : "sin entrada"
    }`,
    "  segmentos medios que devuelve cada escalón:",
    "  tipo          en corpus     tier0     tier1     tier2",
    ...porTipo.map(
      (fila) =>
        `  ${fila.tipo.padEnd(12)}${String(fila.entidadesEnElCorpus).padStart(10)}` +
        fila.segmentosMediosPorTier
          .map((valor) => String(valor).padStart(10))
          .join(""),
    ),
    "",
    `  escalón que se paga en la parada de zoom (${escenario.zoom.pixelsPerUnit.toFixed(5)} px/unidad):`,
    "  tipo              tier0     tier1     tier2",
    ...[...censo].map(
      ([tipo, fila]) =>
        `  ${tipo.padEnd(12)}${fila.map((valor) => String(valor).padStart(10)).join("")}`,
    ),
    "",
  ].join("\n"),
);
