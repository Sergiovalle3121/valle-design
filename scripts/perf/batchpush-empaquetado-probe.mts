#!/usr/bin/env node
/**
 * Sonda PAREADA del empaquetado de `batchPush`: el bucle de antes contra el de
 * ahora, sobre el corpus del producto, en la misma vuelta y con la salida
 * comparada BIT A BIT.
 *
 * ## Por qué existe, si ya hay un perfilador por etapa
 *
 * `scripts/perf/etapas-100k-medir.mjs` mide la etapa entera dentro del pipeline
 * y es lo que el trinquete juzga. Pero para decidir si UN CAMBIO en el bucle de
 * empaquetado gana o pierde, ese instrumento no sirve en esta máquina: sus tres
 * corridas de `batchPush` sobre el mismo árbol se reparten entre 541 y 693 ms
 * —una dispersión del 13 %— porque el contenedor tiene cuatro hilos y hasta dos
 * agentes trabajando a la vez. Una mejora del 10 % no se distingue del vecino.
 *
 * Aquí las dos versiones corren ALTERNADAS en el mismo proceso, sobre los
 * MISMOS teselados y contra arrays ya reservados, y se publica el SUELO de N
 * pasadas: el mínimo es la única estadística que no mide al vecino. La etapa
 * completa sigue midiéndose donde se medía; esto responde otra pregunta —«¿el
 * bucle nuevo escribe los mismos bytes y tarda menos en escribirlos?»— y la
 * responde con la dispersión bajo control.
 *
 * ## Lo que compara, y por qué el «antes» está escrito aquí a mano
 *
 * El bucle anterior vive copiado en este archivo. No se importa de ningún sitio
 * a propósito: si se importara del módulo de producción, reescribir el módulo
 * reescribiría también la referencia y la comparación se volvería una
 * tautología. La misma razón por la que `line-batch.spec.ts` lleva su propia
 * copia; ésa es la guarda permanente sobre un corpus de formas, ésta es la
 * medida sobre el corpus del producto.
 *
 * ## Lo que NO mide, dicho para que nadie lo deduzca al revés
 *
 * No mide `tessellate`, ni el índice espacial, ni la reserva por duplicación
 * del pipeline (los dos carriles reciben el lote ya reservado, justo para que
 * la diferencia sea el bucle y nada más). No mide GPU ni navegador: aquí no hay
 * ninguno de los dos. Y no reproduce el ORDEN de empaquetado del pipeline —que
 * va por tile— sino el orden del documento; el coste del bucle no depende de
 * él, la paridad tampoco.
 *
 * ## Uso
 *
 *   cd apps/web && npx tsx ../../scripts/perf/batchpush-empaquetado-probe.mts \
 *     --mix architecture --entities 100000 --pasadas 7
 *
 * Sale 1 si hay UN SOLO descuadre: un empaquetado que mueve un valor no es una
 * optimización, y publicar su reloj sería publicar el reloj de otra geometría.
 */
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
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
import {
  CAD_ENTITY_REGISTRY,
  type CadNativeEntity,
} from "../../apps/web/src/lib/cad/entity-runtime";
import {
  CAD_LINETYPE_SLOTS,
  CadLineBatchBuilder,
  cadDrawOrderDepth,
  cadLineStyleKey,
  packCadColor,
  type CadLineBatchItem,
} from "../../apps/web/src/lib/cad/render/line-batch";
import { defaultCadRenderStyle } from "../../apps/web/src/lib/cad/render/render-style";
import { cadEntityIsTextOnly } from "../../apps/web/src/lib/cad/render/text-requests";
import {
  cadRenderLodTier,
  cadRenderSegmentBudget,
  tessellateCadEntity,
  type CadTessellation,
} from "../../apps/web/src/lib/cad/render/tessellation-cache";

interface Opciones {
  mix: CadCorpusMixId;
  entities: number;
  panStops: number;
  /** Pasadas alternadas antes/después. El suelo se toma sobre todas ellas. */
  pasadas: number;
  json: boolean;
  /** Dónde publicar la evidencia, o `null` para no publicarla. */
  output: string | null;
}

const AYUDA = `
Sonda pareada del empaquetado de batchPush: bucle de antes contra bucle de ahora.

  npx tsx scripts/perf/batchpush-empaquetado-probe.mts [opciones]

  --mix <id>         Mezcla del corpus (por defecto architecture).
  --entities <n>     Entidades (por defecto 100000).
  --pan-stops <n>    Paradas de paneo del escenario (por defecto 12).
  --pasadas <n>      Pasadas alternadas (por defecto 7).
  --json             Escribe el resultado como JSON por stdout.
  --output <ruta>    Publica la evidencia en esa ruta.
  --help             Esto.

Sale 1 si la salida del bucle nuevo difiere en un solo bit de la del anterior.
`;

function parseCli(argv: string[]): Opciones | null {
  const opciones: Opciones = {
    mix: "architecture",
    entities: 100_000,
    panStops: 12,
    pasadas: 7,
    json: false,
    output: null,
  };
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
    } else if (argumento === "--pasadas") {
      opciones.pasadas = Number.parseInt(argv[++index] ?? "", 10);
    } else if (argumento === "--json") {
      opciones.json = true;
    } else if (argumento === "--output") {
      opciones.output = path.resolve(argv[++index] ?? "");
    } else if (argumento === "--help" || argumento === "-h") {
      return null;
    } else {
      // Una bandera desconocida es un error y no algo que se ignora: una sonda
      // que acepta `--pasadaS` en silencio publica el suelo de otra medida.
      throw new Error(`Bandera desconocida: ${argumento}`);
    }
  }
  if (!Number.isSafeInteger(opciones.entities) || opciones.entities < 1)
    throw new Error("--entities tiene que ser un entero positivo.");
  if (!Number.isSafeInteger(opciones.pasadas) || opciones.pasadas < 1)
    throw new Error("--pasadas tiene que ser un entero positivo.");
  return opciones;
}

const opciones = parseCli(process.argv.slice(2));
if (opciones === null) {
  process.stdout.write(`${AYUDA}\n`);
  process.exit(0);
}

const registro = (mensaje: string): void => {
  // Todo lo legible va a stderr para que `--json` deje stdout limpio.
  process.stderr.write(`${mensaje}\n`);
};

const corpus = createCadCorpusMix({ mix: opciones.mix, entities: opciones.entities });
const documentSha256 = createHash("sha256")
  .update(serializeCadDocument(corpus.document))
  .digest("hex");
const entradaManifiesto = findCadCorpusMixManifestEntry(opciones.mix, opciones.entities);
const cuadraElCorpus = entradaManifiesto?.sha256 === documentSha256;

const bounds = cadDocumentBounds(corpus.nativeEntities, corpus.document);
const escenario = createCadRenderScenario(bounds, opciones.panStops);

/** ¿Se solapa la caja de la entidad con el rectángulo visible de una parada? */
function visible(
  caja: { minX: number; minY: number; maxX: number; maxY: number },
  vista: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return (
    caja.maxX >= vista.minX &&
    caja.minX <= vista.maxX &&
    caja.maxY >= vista.minY &&
    caja.minY <= vista.maxY
  );
}

/**
 * Reconstruye el FLUJO de empaquetado del recorrido medido: cada entidad que el
 * pipeline mete en un lote, teselada en el escalón que le toca en la vista
 * INICIAL, más las que la parada de ZOOM vuelve a detallar en su escalón nuevo.
 *
 * No es una simulación del planificador —no hay tiles, ni trozos, ni relevo de
 * octava— sino la reproducción de lo que `batchPush` acaba recibiendo: las
 * mismas entidades, los mismos escalones y por tanto los mismos caminos y los
 * mismos segmentos. Los rótulos puros se omiten aquí igual que allí: viajan
 * como quads al atlas y no pasan por el empaquetado.
 */
const items: CadLineBatchItem[] = [];
const drawOrder = new Map<string, number>();
corpus.document.modelSpace.entityIds.forEach((id, indice) => drawOrder.set(id, indice));
const orderCount = corpus.document.modelSpace.entityIds.length;

let entidadesVistaInicial = 0;
let entidadesParadaDeZoom = 0;
let caminos = 0;
let caminosDeDosPuntos = 0;
let segmentos = 0;

const acumular = (entity: CadNativeEntity, tessellation: CadTessellation): void => {
  if (tessellation.segmentCount === 0) return;
  for (const path of tessellation.paths) {
    caminos += 1;
    if (path.xy.length === 4 && !path.closed) caminosDeDosPuntos += 1;
  }
  segmentos += tessellation.segmentCount;
  items.push({
    tessellation,
    style: defaultCadRenderStyle(entity, corpus.document),
    depth: cadDrawOrderDepth(drawOrder.get(entity.id) ?? 0, orderCount),
  });
};

for (const entity of corpus.nativeEntities) {
  if (cadEntityIsTextOnly(entity)) continue;
  const caja = CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(
    entity as never,
    corpus.document,
  );
  if (!caja) continue;
  const lado = Math.max(caja.maxX - caja.minX, caja.maxY - caja.minY);
  const tierInicial = cadRenderLodTier(lado * escenario.initial.pixelsPerUnit);
  if (visible(caja, escenario.initial.bounds)) {
    entidadesVistaInicial += 1;
    acumular(
      entity,
      tessellateCadEntity(entity, cadRenderSegmentBudget(tierInicial), corpus.document),
    );
  }
  if (!visible(caja, escenario.zoom.bounds)) continue;
  const tierZoom = cadRenderLodTier(lado * escenario.zoom.pixelsPerUnit);
  // El relevo de octava sólo reconstruye lo que CAMBIA de escalón; si el
  // escalón es el mismo, el tile residente sigue sirviendo y no se reempaqueta.
  if (tierZoom === tierInicial) continue;
  entidadesParadaDeZoom += 1;
  acumular(entity, tessellateCadEntity(entity, cadRenderSegmentBudget(tierZoom), corpus.document));
}

registro(
  `Sonda pareada del empaquetado · ${opciones.mix}@${opciones.entities}\n` +
    `  corpus sha256 ${documentSha256.slice(0, 16)}… · manifiesto: ${cuadraElCorpus ? "CUADRA" : "NO CUADRA"}\n` +
    `  empaquetados ${items.length} (vista inicial ${entidadesVistaInicial}, parada de zoom ${entidadesParadaDeZoom})\n` +
    `  caminos ${caminos} · de dos puntos ${caminosDeDosPuntos} (${((100 * caminosDeDosPuntos) / Math.max(1, caminos)).toFixed(1)} %) · segmentos ${segmentos}`,
);

// ---------------------------------------------------------------------------
// EL BUCLE DE ANTES, copiado verbatim de `line-batch.ts` en f5dd4bd. Escribe en
// arrays que se le pasan ya reservados, para que la comparación sea el bucle y
// no la política de crecimiento.
// ---------------------------------------------------------------------------
interface Salida {
  start: Float32Array;
  end: Float32Array;
  style: Float32Array;
  arc: Float32Array;
  count: number;
}

function reservar(total: number): Salida {
  return {
    start: new Float32Array(total * 2),
    end: new Float32Array(total * 2),
    style: new Float32Array(total * 4),
    arc: new Float32Array(total * 2),
    count: 0,
  };
}

function empaquetarComoAntes(destino: Salida, items: readonly CadLineBatchItem[]): void {
  destino.count = 0;
  for (const item of items) {
    const { tessellation, style, depth } = item;
    const packedColor = packCadColor(style.color);
    const halfWidthPx = Math.max(0, style.halfWidthPx);
    const linetypeIndex = Math.max(
      0,
      Math.min(CAD_LINETYPE_SLOTS - 1, Math.floor(style.linetypeIndex)),
    );
    for (const path of tessellation.paths) {
      const points = path.xy.length / 2;
      if (points < 2) continue;
      const segments = points - 1 + (path.closed ? 1 : 0);
      let phase = 0;
      for (let index = 0; index < segments; index += 1) {
        const from = index * 2;
        const to = ((index + 1) % points) * 2;
        const x0 = path.xy[from];
        const y0 = path.xy[from + 1];
        const x1 = path.xy[to];
        const y1 = path.xy[to + 1];
        const length = Math.hypot(x1 - x0, y1 - y0);
        const slot = destino.count;
        destino.start[slot * 2] = x0;
        destino.start[slot * 2 + 1] = y0;
        destino.end[slot * 2] = x1;
        destino.end[slot * 2 + 1] = y1;
        destino.style[slot * 4] = packedColor;
        destino.style[slot * 4 + 1] = halfWidthPx;
        destino.style[slot * 4 + 2] = linetypeIndex;
        destino.style[slot * 4 + 3] = depth;
        destino.arc[slot * 2] = phase;
        destino.arc[slot * 2 + 1] = length;
        phase += length;
        destino.count += 1;
      }
    }
  }
}

const antes = reservar(segmentos);
const ahora = new CadLineBatchBuilder(Math.max(1, segmentos));

/**
 * Tercer carril: el mismo bucle nuevo, pero con la POLÍTICA DE RESERVA del
 * pipeline —un cubo por clave de estilo que arranca en `max(256, segmentos de
 * la primera entidad)` y crece por duplicación—. Existe para separar dos costes
 * que la etapa suma en un solo número: escribir los flotantes y pagar la cadena
 * de duplicaciones. Sobre architecture@100k esa cadena copia 120,8 MB y reserva
 * 274,7 MB para 104 MB de contenido; aquí se ve cuánto reloj es eso.
 */
function empaquetarCreciendoPorCubo(items: readonly CadLineBatchItem[]): number {
  const cubos = new Map<string, CadLineBatchBuilder>();
  for (const item of items) {
    if (item.tessellation.segmentCount === 0) continue;
    const clave = cadLineStyleKey(item.style);
    let cubo = cubos.get(clave);
    if (!cubo) {
      cubo = new CadLineBatchBuilder(Math.max(256, item.tessellation.segmentCount));
      cubos.set(clave, cubo);
    }
    cubo.push(item);
  }
  let total = 0;
  for (const cubo of cubos.values()) total += cubo.instanceCount;
  return total;
}

const relojAntes: number[] = [];
const relojAhora: number[] = [];
const relojCreciendo: number[] = [];
for (let pasada = 0; pasada < opciones.pasadas + 1; pasada += 1) {
  const inicioAntes = performance.now();
  empaquetarComoAntes(antes, items);
  const msAntes = performance.now() - inicioAntes;
  ahora.reset();
  const inicioAhora = performance.now();
  for (const item of items) ahora.push(item);
  const msAhora = performance.now() - inicioAhora;
  const inicioCreciendo = performance.now();
  const instanciasCreciendo = empaquetarCreciendoPorCubo(items);
  const msCreciendo = performance.now() - inicioCreciendo;
  if (instanciasCreciendo !== ahora.instanceCount)
    throw new Error(
      `el carril que crece empaquetó ${instanciasCreciendo} instancias y el reservado ${ahora.instanceCount}`,
    );
  // La pasada 0 es de calentamiento: V8 todavía está compilando los bucles y
  // medirla mezclaría el compilador con el código compilado.
  if (pasada === 0) continue;
  relojAntes.push(msAntes);
  relojAhora.push(msAhora);
  relojCreciendo.push(msCreciendo);
}

const suelo = (valores: readonly number[]) => Math.min(...valores);
const mediana = (valores: readonly number[]) => {
  const orden = [...valores].sort((a, b) => a - b);
  return orden.length % 2 === 1
    ? orden[(orden.length - 1) / 2]
    : (orden[orden.length / 2 - 1] + orden[orden.length / 2]) / 2;
};
const redondear = (valor: number) => Number(valor.toFixed(3));

// --- Paridad BIT A BIT sobre el corpus del producto ------------------------
const empaquetado = ahora.build();
let descuadres = 0;
const primeros: string[] = [];
const comparar = (nombre: string, medido: Float32Array, esperado: Float32Array): void => {
  if (medido.length !== esperado.length) {
    descuadres += 1;
    primeros.push(`${nombre}: longitud ${medido.length} contra ${esperado.length}`);
    return;
  }
  for (let index = 0; index < medido.length; index += 1) {
    if (Object.is(medido[index], esperado[index])) continue;
    descuadres += 1;
    if (primeros.length < 5)
      primeros.push(`${nombre}[${index}]: ${medido[index]} contra ${esperado[index]}`);
  }
};
comparar("instanceStart", empaquetado.instanceStart, antes.start.subarray(0, antes.count * 2));
comparar("instanceEnd", empaquetado.instanceEnd, antes.end.subarray(0, antes.count * 2));
comparar("instanceStyle", empaquetado.instanceStyle, antes.style.subarray(0, antes.count * 4));
comparar("instanceArc", empaquetado.instanceArc, antes.arc.subarray(0, antes.count * 2));
if (empaquetado.instanceCount !== antes.count) {
  descuadres += 1;
  primeros.push(`instancias ${empaquetado.instanceCount} contra ${antes.count}`);
}

/** Huella FNV-1a de 32 bits sobre los BYTES de las cuatro salidas juntas. */
function huella(...arrays: readonly Float32Array[]): string {
  let hash = 0x811c_9dc5;
  for (const array of arrays) {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    for (let index = 0; index < bytes.length; index += 1) {
      hash ^= bytes[index];
      hash = Math.imul(hash, 0x0100_0193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, "0");
}
const huellaAhora = huella(
  empaquetado.instanceStart,
  empaquetado.instanceEnd,
  empaquetado.instanceStyle,
  empaquetado.instanceArc,
);
const huellaAntes = huella(
  antes.start.subarray(0, antes.count * 2),
  antes.end.subarray(0, antes.count * 2),
  antes.style.subarray(0, antes.count * 4),
  antes.arc.subarray(0, antes.count * 2),
);

const cpus = os.cpus();
const environment = {
  node: process.version,
  v8: process.versions.v8,
  platform: process.platform,
  architecture: process.arch,
  cpuModel: cpus[0]?.model ?? "unknown",
  logicalCpuCount: os.availableParallelism(),
  totalMemoryBytes: os.totalmem(),
  loadavg1mAlEmpezar: Number(os.loadavg()[0].toFixed(2)),
  gpu: false,
  browser: false,
  measurementKind: "cpu-node",
  declaredMachine:
    `${cpus[0]?.model ?? "unknown"} (${os.availableParallelism()} hilos lógicos), ` +
    `${(os.totalmem() / 1024 ** 3).toFixed(1).replace(".", ",")} GB de RAM, ` +
    `${os.type()} ${os.release()} (${os.arch()}), Node ${process.version}. ` +
    "SIN GPU y SIN navegador: esto es CPU de Node y mide UN BUCLE, no fotogramas. " +
    "Contenedor cloud compartido: por eso se publica el SUELO de las pasadas y no su media.",
};

const resultado = {
  $schema: "urn:valle-design:schema:cad-batchpush-packing-evidence:v1",
  schemaVersion: 1,
  benchmarkId: "valle-design-cad-batchpush-empaquetado-v1",
  publication: {
    publicationId: `${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}Z-${randomUUID().slice(0, 8)}`,
    publishedAt: new Date().toISOString(),
    publisher: "scripts/perf/batchpush-empaquetado-probe.mts",
    invocation: `npx tsx ../../scripts/perf/batchpush-empaquetado-probe.mts ${process.argv.slice(2).join(" ")}`,
  },
  note:
    "Mide SÓLO el bucle de empaquetado de line-batch.ts sobre el flujo del corpus del producto, " +
    "con las dos versiones alternadas en el mismo proceso y contra arrays ya reservados. NO es la " +
    "etapa batchPush completa —esa la mide scripts/perf/etapas-100k-medir.mjs dentro del pipeline, " +
    "con su teselado, su clave de cubo y su política de reserva— ni GPU, ni navegador, ni fotogramas.",
  environment,
  mix: opciones.mix,
  entities: opciones.entities,
  pasadas: opciones.pasadas,
  corpus: {
    documentSha256,
    manifestSha256: entradaManifiesto?.sha256 ?? null,
    matchesManifest: cuadraElCorpus,
  },
  flujo: {
    empaquetados: items.length,
    entidadesVistaInicial,
    entidadesParadaDeZoom,
    caminos,
    caminosDeDosPuntos,
    segmentos,
    instancias: empaquetado.instanceCount,
  },
  msAntes: {
    suelo: redondear(suelo(relojAntes)),
    mediana: redondear(mediana(relojAntes)),
    max: redondear(Math.max(...relojAntes)),
  },
  msAhora: {
    suelo: redondear(suelo(relojAhora)),
    mediana: redondear(mediana(relojAhora)),
    max: redondear(Math.max(...relojAhora)),
  },
  msCreciendoPorCubo: {
    suelo: redondear(suelo(relojCreciendo)),
    mediana: redondear(mediana(relojCreciendo)),
    max: redondear(Math.max(...relojCreciendo)),
  },
  gananciaEnElSuelo: redondear(suelo(relojAntes) / suelo(relojAhora)),
  costeDeLaReservaPorTrazo: redondear(suelo(relojCreciendo) - suelo(relojAhora)),
  nsPorSegmentoAntes: redondear((suelo(relojAntes) * 1e6) / Math.max(1, segmentos)),
  nsPorSegmentoAhora: redondear((suelo(relojAhora) * 1e6) / Math.max(1, segmentos)),
  paridad: {
    descuadres,
    huellaAntes,
    huellaAhora,
    coinciden: descuadres === 0 && huellaAntes === huellaAhora,
  },
  medicion: {
    gpu: false,
    browser: false,
    measurementKind: "cpu-node",
    node: process.version,
  },
};

registro(
  `  antes  suelo ${resultado.msAntes.suelo} ms · mediana ${resultado.msAntes.mediana} ms · ${resultado.nsPorSegmentoAntes} ns/segmento\n` +
    `  ahora  suelo ${resultado.msAhora.suelo} ms · mediana ${resultado.msAhora.mediana} ms · ${resultado.nsPorSegmentoAhora} ns/segmento\n` +
    `  creciendo por cubo (política del pipeline) suelo ${resultado.msCreciendoPorCubo.suelo} ms — la cadena de duplicaciones cuesta ${resultado.costeDeLaReservaPorTrazo} ms\n` +
    `  ganancia en el suelo de ${opciones.pasadas} pasadas: ×${resultado.gananciaEnElSuelo}\n` +
    `  paridad: ${descuadres} descuadres sobre ${empaquetado.instanceCount} instancias · huella ${huellaAhora}`,
);
for (const linea of primeros) registro(`    ${linea}`);

if (opciones.json) process.stdout.write(`${JSON.stringify(resultado, null, 2)}\n`);
if (opciones.output !== null && resultado.paridad.coinciden) {
  fs.mkdirSync(path.dirname(opciones.output), { recursive: true });
  fs.writeFileSync(opciones.output, `${JSON.stringify(resultado, null, 2)}\n`);
  registro(`  publicado en ${opciones.output}`);
} else if (opciones.output !== null) {
  // Un artefacto con descuadres publicaría el reloj de OTRA geometría.
  registro(`  NO se publica en ${opciones.output}: hay descuadres.`);
}

if (!resultado.paridad.coinciden) {
  registro("DESCUADRE: el bucle nuevo NO escribe los mismos bytes. No se publica reloj ninguno.");
  process.exit(1);
}
