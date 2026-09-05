import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { importDocumentText } from "../document-import";
import { exportCadDocumentDxf } from "../dxf-document-export";
import { buildCadDimensionGeometry, type CadDimensionEntity } from "../associative-dimension";
import type { CadDocument, CadEntity } from "../cad-document";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
// Mismo motivo y misma línea que `prueba-de-despacho.spec.ts`.
import "@/lib/cad/engine/all-commands";
import {
  cerca,
  clavePunto,
  claveSegmento,
  comparaOrdenado,
  comparaPorClave,
  contador,
  cota,
  deTipo,
  eq,
  longitudDe,
  type Arco,
  type Circulo,
  type Linea,
  type Polilinea,
  ok,
  type ArtefactoMedidas,
} from "./terceros-jornada-medicion";
import {
  CENSO_RELEIDO_A,
  releerConOraculoA,
  releerConOraculoB,
} from "./terceros-jornada-relectura";
import { aplica, conduce, contexto, designa, intro, punto } from "./terceros-jornada-comandos";

/**
 * LA JORNADA COMPLETA SOBRE EL PLANO DE OTRO.
 *
 * `prueba-de-despacho.spec.ts` ya recorre una jornada entera —recibir, coser,
 * medir— pero sobre un DXF que este proyecto ESCRIBE en la propia suite. Lo
 * que aquí cambia es de quién es el plano: `bjnortier-dxf/floorplan.dxf` es el
 * único fichero del corpus que se parece a lo que manda un despacho (1,1 MB,
 * 624 LINE, 124 LWPOLYLINE, 63 DIMENSION, 24 capas en tabla, 16 estilos de
 * cota, dialecto R2004), lo publica la biblioteca MIT `bjnortier/dxf` y no lo
 * escribió nadie de aquí.
 *
 * La jornada son cinco actos, y cada uno usa el camino de PRODUCCIÓN:
 *
 *   1. ABRIR   — `importDocumentText`, la misma puerta que usa el estudio al
 *                soltar un fichero. No una función de laboratorio.
 *   2. MEDIR   — longitudes, radios, barridos, valores de cota y extensión,
 *                contra lo que `ezdxf` leyó de LOS MISMOS BYTES. Oráculo
 *                externo, no una corrida anterior del producto.
 *   3. MODIFICAR — MOVE, LINE y ERASE desde `CAD_COMMAND_REGISTRY_V2`,
 *                conducidos como los conduce el usuario.
 *   4. EXPORTAR — `exportCadDocumentDxf`, el mismo que entrega DXFOUT.
 *   5. RELEER  — con `dxf-parser` (oráculo A, corre en CI) y con `ezdxf`
 *                (oráculo B, congelado), para saber si lo que sale lo abre un
 *                programa que no es este.
 *
 * ─── Los dos oráculos, y por qué el segundo no se puede sustituir ──────────
 *
 * · **Oráculo A — `dxf-parser`** (MIT). Dependencia declarada de `apps/web`,
 *   así que corre en cada corrida sobre estos bytes. Su límite hay que
 *   repetirlo: `dxf-import.ts` lo importa, o sea que COMPARTE MOTOR DE
 *   ANÁLISIS con el lector. Contra él no se mide si el análisis del fichero
 *   ajeno es correcto — se mide la conversión, y sobre todo la ESCRITURA, que
 *   es donde su lectura sí es ajena a lo que la produjo.
 *
 * · **Oráculo B — `ezdxf` 1.4.4** (MIT, Manfred Moitzi). Otro autor, otra
 *   lengua, ni una línea en común. Es quien pone los números de la fase 2:
 *   `docs/cad/corpus/oraculos/medidas-floorplan-ezdxf.json`, generado por
 *   `medidas-floorplan.py` y ANCLADO al sha256 de los bytes medidos. No está
 *   en CI: cuando el hash no cuadra, esto se pone en rojo en vez de creerse
 *   una medida que ya no habla de este fichero.
 *
 * ─── Lo que la jornada destapó, y no se esconde ────────────────────────────
 *
 * `ezdxf` NO abre lo que exportamos. MTEXT y HATCH salen sin sus marcadores de
 * subclase (`100 AcDbEntity`, `100 AcDbMText` / `100 AcDbHatch`) aunque la
 * cabecera declare AC1015, dialecto donde son obligatorios. Los otros siete
 * tipos —LINE, POLYLINE, CIRCLE, ARC, TEXT, DIMENSION, INSERT— sí los abre, y
 * vuelve a medir en ellos las mismas longitudes. Está medido archivo por
 * archivo, y el arreglo está PROBADO en el script del oráculo antes de
 * pedirlo (P-evidencia-07).
 *
 * DÓNDE VIVE CADA PIEZA. Aquí quedan los cuatro primeros actos, que son el
 * producto trabajando; el instrumento de medida está en `-medicion.ts`, el
 * conductor de comandos en `-comandos.ts` y el quinto acto —los dos lectores
 * ajenos— en `-relectura.ts`. La separación la pidió el presupuesto de
 * monolito y se paga sola: obliga a escribir de qué depende cada acto.
 */

const RAIZ = path.resolve(process.cwd(), "../..");
const CORPUS = path.join(RAIZ, "docs/cad/corpus");
const PLANO = path.join(CORPUS, "terceros/bjnortier-dxf/floorplan.dxf");
const MEDIDAS = path.join(CORPUS, "oraculos/medidas-floorplan-ezdxf.json");
const ARTEFACTO = path.join(RAIZ, "docs/cad/evidence/jornada-plano-ajeno.json");

/* ══════════════════════════════════════════════════════════════════════════
   LAS TOLERANCIAS, CADA UNA CON SU RAZÓN
   Ninguna es global y ninguna se elige por conveniencia: las dos salen de una
   cuenta que se puede repetir con lápiz.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * PRODUCTO ↔ ORÁCULO B sobre los MISMOS bytes, sin escribir nada.
 *
 * Las dos lecturas parten del mismo texto ASCII, así que el mismo decimal se
 * convierte al mismo doble. Lo que queda es (a) el orden de las operaciones
 * —una hipotenusa, un arco por su barrido— y (b) que el artefacto publica DOCE
 * decimales, lo que añade como mucho 5e-13. Un micrómetro sobra: esto es mil
 * veces menos, y sigue siendo dos órdenes de magnitud por encima del ruido
 * medido (4,5e-13). Si esta tolerancia hiciera falta subirla, no sería un
 * ajuste: sería que una de las dos lecturas mide otra cosa.
 */
const TOL_ORACULO = 1e-9;

/**
 * NUESTRA ESCRITURA ↔ CUALQUIER LECTURA, por segmento.
 *
 * `fmt()` de `dxf-write-core.ts` escribe SEIS decimales. Una coordenada
 * trasladada cae fuera de la rejilla del fichero de origen, así que se redondea
 * a la millonésima: cada extremo se mueve hasta 5e-7 en X y en Y, o sea hasta
 * √2·5e-7 ≈ 7,1e-7 de sitio, y una longitud con DOS extremos redondeados se
 * mueve hasta 1,42e-6. Se toma 1,5e-6 POR SEGMENTO —una polilínea de N tramos
 * admite N veces eso— porque el error se acumula tramo a tramo y fingir que no
 * sería tolerar una pérdida real repartida.
 */
const TOL_ESCRITURA_POR_SEGMENTO = 1.5e-6;

/**
 * TECHO: tipos que el oráculo B NO consigue abrir en lo que escribimos.
 *
 * Medido, no elegido, y sólo puede BAJAR. Hoy son dos, y por la misma causa
 * (marcadores de subclase que no emitimos). El día que se emitan, esta lista
 * se queda vacía y este spec lo exige. Subirla sería declarar que escribimos
 * un tipo más que nadie más puede leer.
 */
const TECHO_TIPOS_QUE_EL_ORACULO_B_NO_ABRE = ["HATCH", "MTEXT"] as const;

/**
 * TECHO: entidades que el informe de importación declara PERDIDAS y que sí
 * entraron.
 *
 * Son las 63 DIMENSION: el mapa de primitivas emite `unsupported_entity` por
 * cada una mientras el camino semántico las importa, así que el informe le
 * dice al arquitecto «72 entidad(es) de tipo DIMENSION, LEADER, VIEWPORT no
 * entraron» y dos filas más abajo «63 cotas entran vivas». Las dos frases no
 * pueden ser verdad a la vez. Está pedido en P-evidencia-08; el techo sólo
 * puede bajar, y cuando llegue a cero esta constante se borra.
 */
const TECHO_DECLARADAS_PERDIDAS_PERO_ENTRARON = 63;

/* ══════════════════════════════════════════════════════════════════════════
   ENTRADAS: EL PLANO AJENO Y LA MEDICIÓN CONGELADA DEL ORÁCULO B
   ══════════════════════════════════════════════════════════════════════════ */

ok(fs.existsSync(MEDIDAS), `falta la medición del oráculo B en ${path.relative(RAIZ, MEDIDAS)}`);
const medidas = JSON.parse(fs.readFileSync(MEDIDAS, "utf8")) as ArtefactoMedidas;
const porEtiqueta = new Map(medidas.archivos.map((fila) => [fila.etiqueta, fila]));

const bytesPlano = fs.readFileSync(PLANO);
const shaPlano = createHash("sha256").update(bytesPlano).digest("hex");
const oraculoOrigen = porEtiqueta.get("origen/floorplan.dxf");
ok(oraculoOrigen !== undefined, "la medición congelada tiene que incluir el plano de origen");

{
  // El ancla. Sin esto, «ezdxf midió 18.120,08» sería una frase sobre unos
  // bytes que ya nadie sabe cuáles eran.
  eq(
    oraculoOrigen!.sha256,
    shaPlano,
    "el oráculo B midió OTROS bytes: vuelve a correr " +
      "`python3 docs/cad/corpus/oraculos/medidas-floorplan.py` sobre este fichero",
  );
  eq(oraculoOrigen!.bytes, bytesPlano.byteLength, "y el mismo tamaño");
  // Y que el fichero es el que el corpus declara, no una copia que se coló.
  const manifiesto = JSON.parse(
    fs.readFileSync(path.join(CORPUS, "manifest.json"), "utf8"),
  ) as { archivos: Array<{ id: string; sha256: string; fuente: string }> };
  const enManifiesto = manifiesto.archivos.find((fila) => fila.id === "bjnortier-dxf/floorplan");
  ok(enManifiesto !== undefined, "el plano tiene que estar en el manifiesto del corpus");
  eq(enManifiesto!.sha256, shaPlano, "y con el hash que el manifiesto declara");
}

/* ══════════════════════════════════════════════════════════════════════════
   ACTO 1 — ABRIR EL PLANO AJENO CON EL LECTOR DE PRODUCCIÓN
   ══════════════════════════════════════════════════════════════════════════ */

const abierto = importDocumentText("floorplan.dxf", bytesPlano.toString("utf8"));
const documentoAbierto = abierto.document;

const porTipo = (documento: CadDocument) => {
  const cuenta: Record<string, number> = {};
  for (const entidad of documento.entities) cuenta[entidad.type] = (cuenta[entidad.type] ?? 0) + 1;
  return cuenta;
};

const CENSO_AL_ABRIR = {
  arc: 20,
  circle: 9,
  dimension: 63,
  hatch: 26,
  insert: 10,
  line: 624,
  mtext: 144,
  polyline: 124,
  text: 89,
} as const;

{
  eq(porTipo(documentoAbierto), { ...CENSO_AL_ABRIR }, "el censo de lo que entró, tipo a tipo");
  eq(abierto.importedEntityCount, 1109, "1109 entidades en el documento");
  eq(abierto.importedBlockCount, 17, "y 17 bloques con su definición");
  eq(abierto.format, "dxf", "entró por el camino DXF");
  // El dialecto del fichero lo dice el oráculo, no nosotros.
  eq(oraculoOrigen!.dialecto, "AC1018", "el plano ajeno es R2004");
  eq(oraculoOrigen!.version, "R2004", "y así lo nombra ezdxf");
}

{
  // Las capas: 24 en la tabla del fichero, 17 en el documento. Las siete que
  // faltan no las usa ninguna entidad de espacio modelo (Defpoints, View Port,
  // TEMP y cuatro de xref), así que el lector se queda con las que dibujan.
  // Es defendible y NO está dicho en ninguna parte: ningún aviso lo menciona.
  // Se mide aquí para que la ausencia sea un número y no un descubrimiento.
  eq(oraculoOrigen!.capasDeclaradas, 24, "la tabla LAYER del fichero declara 24 capas");
  eq(documentoAbierto.layers.length, 17, "y al documento llegan 17: las que usa el espacio modelo");
  eq(
    documentoAbierto.lossManifest?.some((perdida) => /capa/i.test(perdida.code)),
    false,
    "y ningún aviso del lector nombra la tabla de capas: la ausencia es silenciosa (P-evidencia-09)",
  );
  // Los estilos de cota SÍ llegan enteros: es la tabla que gobierna cómo se
  // dibuja cada cota y perderla cambiaría el plano al reabrirlo.
  eq(oraculoOrigen!.estilosDeCota, 16, "el fichero trae 16 estilos de cota");
  eq(
    Object.keys(documentoAbierto.styles?.dimension ?? {}).length >= 16,
    true,
    "y el documento los conserva todos",
  );
}

const avisos: Record<string, number> = {};
for (const aviso of abierto.warnings) avisos[aviso.code] = (avisos[aviso.code] ?? 0) + 1;

/** Cotas que el informe declara perdidas y que sin embargo entraron. Ver abajo. */
let contradiccion = 0;

{
  eq(avisos, { linetype_complejo: 1, foreign_dimension_detached: 63, unsupported_entity: 72 }, "los avisos del lector, contados");
  // El informe que ve el arquitecto dice que 72 entidades «no entraron», y 63
  // de ellas son las cotas que sí entraron y que el mismo informe cuenta como
  // vivas dos filas más abajo. El techo sólo puede bajar.
  const declaradasPerdidas = abierto.dxfReport?.rows.find((fila) => fila.code === "unsupported_entity");
  ok(declaradasPerdidas !== undefined, "el informe tiene que traer la fila de lo no soportado");
  ok(
    /DIMENSION/u.test(declaradasPerdidas!.detail) && declaradasPerdidas!.fidelity === "lost",
    "y hoy nombra DIMENSION entre lo que se perdió",
  );
  // La contradicción, MEDIDA: cuántos avisos de «DIMENSION no soportada» hay al
  // mismo tiempo que cotas efectivamente importadas. No vale contar las cotas
  // que entraron —esas seguirán siendo 63 cuando el defecto se arregle—: lo que
  // tiene que caer a cero es la coincidencia de las dos cosas.
  const avisosDeCotaNoSoportada = abierto.warnings.filter(
    (aviso) => aviso.code === "unsupported_entity" && /DIMENSION/u.test(aviso.message),
  ).length;
  const cotasQueSiEntraron = documentoAbierto.entities.filter((e) => e.type === "dimension").length;
  contradiccion = Math.min(avisosDeCotaNoSoportada, cotasQueSiEntraron);
  ok(
    contradiccion <= TECHO_DECLARADAS_PERDIDAS_PERO_ENTRARON,
    `el informe declara perdidas ${contradiccion} cotas que SÍ entraron; el techo es ` +
      `${TECHO_DECLARADAS_PERDIDAS_PERO_ENTRARON} y sólo puede bajar (P-evidencia-08)`,
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ACTO 2 — MEDIR CONTRA EL ORÁCULO B
   ══════════════════════════════════════════════════════════════════════════ */

const peores = {
  lineas: 0,
  circulos: 0,
  arcosRadio: 0,
  arcosLongitud: 0,
  polilineas: 0,
  cotas: 0,
  extension: 0,
};

{
  const oraculo = oraculoOrigen!;

  // — LONGITUD DE LAS 624 LÍNEAS, una por una y por su geometría —
  peores.lineas = comparaPorClave(
    "longitud de línea",
    deTipo(documentoAbierto, "line").map(
      (linea: Linea) => [claveSegmento(linea.start, linea.end), longitudDe(linea, "línea")] as [string, number],
    ),
    oraculo.lineas!.porGeometria,
    TOL_ORACULO,
  );
  const totalProducto = deTipo(documentoAbierto, "line").reduce(
    (suma, linea) => suma + longitudDe(linea, "línea"),
    0,
  );
  cerca(
    totalProducto,
    oraculo.lineas!.longitudTotal,
    TOL_ORACULO * oraculo.lineas!.n,
    "longitud total de las líneas (la tolerancia se multiplica por 624: los errores se suman)",
  );

  // — RADIO DE LOS 9 CÍRCULOS —
  peores.circulos = comparaPorClave(
    "radio de círculo",
    deTipo(documentoAbierto, "circle").map(
      (circulo: Circulo) => [clavePunto(circulo.center.x, circulo.center.y), circulo.radius] as [string, number],
    ),
    oraculo.circulos!.porGeometria,
    TOL_ORACULO,
  );

  // — RADIO Y LONGITUD DE LOS 20 ARCOS —
  // El radio es un dato del fichero; la longitud de arco NO: sale de r·θ en
  // ezdxf y del recorrido de la curva en el producto. Que las dos coincidan es
  // lo que dice que el barrido se leyó igual, incluido el que cruza el cero.
  const arcos = deTipo(documentoAbierto, "arc");
  peores.arcosRadio = comparaPorClave(
    "radio de arco",
    arcos.map((arco: Arco) => [clavePunto(arco.center.x, arco.center.y), arco.radius] as [string, number]),
    oraculo.arcos!.porGeometria.map((fila) => [fila[0], fila[1]] as [string, number]),
    TOL_ORACULO,
  );
  peores.arcosLongitud = comparaPorClave(
    "longitud de arco",
    arcos.map((arco: Arco) => [clavePunto(arco.center.x, arco.center.y), longitudDe(arco, "arco")] as [string, number]),
    oraculo.arcos!.porGeometria.map((fila) => [fila[0], fila[3]] as [string, number]),
    TOL_ORACULO,
  );

  // — LONGITUD DE LAS 124 POLILÍNEAS, con sus cuatro bulges —
  const polilineas = deTipo(documentoAbierto, "polyline");
  peores.polilineas = comparaPorClave(
    "longitud de polilínea",
    polilineas.map(
      (poli: Polilinea) =>
        [clavePunto(poli.vertices[0].x, poli.vertices[0].y), longitudDe(poli, "polilínea")] as [string, number],
    ),
    oraculo.polilineas!.porGeometria.map((fila) => [fila[0], fila[4]] as [string, number]),
    TOL_ORACULO,
  );
  // Y el número de vértices, contra el NORMALIZADO del oráculo: dos polilíneas
  // del plano cierran repitiendo su primer vértice, y el lector colapsa esa
  // repetición. Comparar contra el crudo llamaría pérdida a una normalización
  // que no quita ni un milímetro (el tramo que elimina mide cero).
  comparaPorClave(
    "vértices de polilínea",
    polilineas.map(
      (poli: Polilinea) => [clavePunto(poli.vertices[0].x, poli.vertices[0].y), poli.vertices.length] as [string, number],
    ),
    oraculo.polilineas!.porGeometria.map((fila) => [fila[0], fila[2]] as [string, number]),
    0,
  );
  eq(
    polilineas.filter((poli) => poli.closed).length,
    oraculo.polilineas!.cerradas,
    "y las mismas 54 cerradas",
  );
  eq(oraculo.polilineas!.conVerticeDeCierreRepetido, 2, "dos de ellas repetían el vértice de cierre");

  // — EL NÚMERO QUE IMPRIME CADA UNA DE LAS 63 COTAS —
  // La medida no se lee del fichero: `buildCadDimensionGeometry` la recalcula
  // desde los dos puntos medidos, igual que `get_measurement()` de ezdxf.
  // Coincidir aquí es coincidir en lo único que el arquitecto lee.
  const cotas = deTipo(documentoAbierto, "dimension");
  peores.cotas = comparaPorClave(
    "medida de cota",
    cotas.map((cotaEntidad) => {
      const geometria = buildCadDimensionGeometry(cotaEntidad as CadDimensionEntity);
      assert.ok(geometria, "una cota del plano ajeno no produjo geometría");
      const entidad = cotaEntidad as CadDimensionEntity;
      return [claveSegmento(entidad.a, entidad.b), geometria.measurement] as [string, number];
    }),
    oraculo.cotas!.porGeometria.map((fila) => [fila[0], fila[2] as number] as [string, number]),
    TOL_ORACULO,
  );

  // — LA EXTENSIÓN DEL DIBUJO —
  const extensionDe = (documento: CadDocument) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const suma = (punto: { x: number; y: number }) => {
      minX = Math.min(minX, punto.x);
      minY = Math.min(minY, punto.y);
      maxX = Math.max(maxX, punto.x);
      maxY = Math.max(maxY, punto.y);
    };
    for (const linea of deTipo(documento, "line")) {
      suma(linea.start);
      suma(linea.end);
    }
    for (const poli of deTipo(documento, "polyline")) for (const vertice of poli.vertices) suma(vertice);
    return { minX, minY, maxX, maxY };
  };
  const extension = extensionDe(documentoAbierto);
  const suya = oraculo.extension!;
  for (const [nombre, mio, suyo] of [
    ["minX", extension.minX, suya.minX],
    ["minY", extension.minY, suya.minY],
    ["maxX", extension.maxX, suya.maxX],
    ["maxY", extension.maxY, suya.maxY],
  ] as Array<[string, number, number]>) {
    peores.extension = Math.max(peores.extension, Math.abs(mio - suyo));
    cerca(mio, suyo, TOL_ORACULO, `extensión · ${nombre}`);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   ACTO 3 — MODIFICAR EL PLANO AJENO CON LOS COMANDOS DEL PRODUCTO
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * El destino del movimiento lo dicta el ORÁCULO, no el producto: llevar la
 * esquina inferior izquierda del plano al origen es lo primero que hace quien
 * recibe un plano dibujado lejos del cero, y el vector sale de la extensión
 * que midió ezdxf. Si el producto se hubiera medido a sí mismo para decidir
 * cuánto mover, la comprobación de después no probaría nada.
 */
const DESPLAZAMIENTO = {
  x: -oraculoOrigen!.extension!.minX,
  y: -oraculoOrigen!.extension!.minY,
};
const ANCHO = oraculoOrigen!.extension!.maxX - oraculoOrigen!.extension!.minX;
const ALTO = oraculoOrigen!.extension!.maxY - oraculoOrigen!.extension!.minY;

/** La línea que el revisor añade. 3-4-5 en papel: mide 500 EXACTO. */
const NUEVA_LINEA = { desde: { x: 0, y: 0 }, hasta: { x: 300, y: 400 }, longitud: 500 };
const CAPA_REVISION = "VALLE-REVISION";

let documento = documentoAbierto;

{
  // — MOVE: las 1109 entidades, de una vez —
  const ids = documento.entities.map((entidad) => entidad.id);
  const movido = conduce(
    "MOVE",
    [designa(ids), punto(0, 0), punto(DESPLAZAMIENTO.x, DESPLAZAMIENTO.y)],
    contexto(documento, ids),
  );
  assert.ok(movido?.kind === "document", "MOVE tenía que escribir");
  contador.comprobaciones += 1;
  eq(movido.commands.length, 1109, "MOVE toca las 1109 entidades, no una selección parcial");
  eq(
    movido.commands.every((comando) => comando.type === "transform"),
    true,
    "y mover es transformar: ni borra ni recrea, que perdería los identificadores",
  );
  documento = aplica(documento, movido, "MOVE");
  eq(documento.entities.length, 1109, "tras mover siguen siendo 1109");
}

{
  // — LO QUE UNA TRASLACIÓN NO PUEDE CAMBIAR —
  // Las 624 longitudes vuelven a compararse contra el oráculo. Es la
  // comprobación que delata una transformación que «casi» es rígida.
  const longitudes = deTipo(documento, "line").map((linea) => longitudDe(linea, "línea movida"));
  const suyas = oraculoOrigen!.lineas!.porGeometria.map((fila) => fila[1]);
  const peor = comparaOrdenado("longitud de línea tras MOVE", longitudes, suyas, TOL_ORACULO);
  ok(peor <= TOL_ORACULO, `una traslación no cambia una longitud (peor desviación ${peor})`);
  // Y la esquina del plano queda EN el origen, con el ancho y el alto intactos.
  const xs = deTipo(documento, "line").flatMap((linea) => [linea.start.x, linea.end.x]);
  const ys = deTipo(documento, "line").flatMap((linea) => [linea.start.y, linea.end.y]);
  for (const poli of deTipo(documento, "polyline"))
    for (const vertice of poli.vertices) {
      xs.push(vertice.x);
      ys.push(vertice.y);
    }
  cerca(Math.min(...xs), 0, TOL_ORACULO, "la esquina izquierda del plano queda en x = 0");
  cerca(Math.min(...ys), 0, TOL_ORACULO, "y la inferior en y = 0");
  cerca(Math.max(...xs), ANCHO, TOL_ORACULO, "el ancho del plano no cambia al moverlo");
  cerca(Math.max(...ys), ALTO, TOL_ORACULO, "ni el alto");
}

{
  // — LINE: el trazo que añade quien revisa —
  // La capa nueva se añade al documento porque lo que esta jornada verifica es
  // el camino de la GEOMETRÍA; la orden CAPA tiene su propia suite.
  documento = {
    ...documento,
    layers: [
      ...documento.layers,
      { id: CAPA_REVISION, name: CAPA_REVISION, color: "#ff0000", visible: true, locked: false },
    ],
  };
  const dibujada = conduce(
    "LINE",
    [punto(NUEVA_LINEA.desde.x, NUEVA_LINEA.desde.y), punto(NUEVA_LINEA.hasta.x, NUEVA_LINEA.hasta.y), intro],
    contexto(documento, [], CAPA_REVISION),
  );
  documento = aplica(documento, dibujada, "LINE");
  const nueva = documento.entities.find((entidad) => entidad.id.startsWith("jornada"));
  assert.ok(nueva?.type === "line", "la línea nueva tiene que estar en el documento");
  contador.comprobaciones += 1;
  eq(nueva.layer, CAPA_REVISION, "en la capa del revisor, no en la del plano ajeno");
  cerca(longitudDe(nueva, "línea nueva"), NUEVA_LINEA.longitud, 1e-12, "y mide 500: el 3-4-5 de siempre");
  eq(documento.entities.length, 1110, "1109 del plano ajeno más la del revisor");
}

{
  // — ERASE: una modificación que se comprueba por AUSENCIA —
  const circulos = deTipo(documento, "circle").map((circulo) => circulo.id);
  eq(circulos.length, 9, "los nueve círculos del plano ajeno siguen ahí antes de borrarlos");
  documento = aplica(documento, conduce("ERASE", [designa(circulos), intro], contexto(documento, circulos)), "ERASE");
  eq(deTipo(documento, "circle").length, 0, "y ya no queda ninguno");
  eq(documento.entities.length, 1101, "1110 − 9");
}

/* ══════════════════════════════════════════════════════════════════════════
   ACTO 4 — EXPORTAR CON EL EXPORTADOR DE PRODUCCIÓN
   ══════════════════════════════════════════════════════════════════════════ */

const exportado = exportCadDocumentDxf(documento);
const shaExportado = createHash("sha256").update(exportado.content).digest("hex");

/**
 * Los cuatro ficheros que el oráculo B mide cuando está instalado. Se escriben
 * en el temporal del sistema —nunca en el árbol: son derivados, no fuentes— y
 * `medidas-floorplan.py` los busca justo ahí. Sin ellos, el artefacto no puede
 * decir si lo que escribimos lo abre otro programa.
 */
const ESCRITOS: Array<{ nombre: string; contenido: string; entidades: number }> = [];
const escribe = (nombre: string, filtro?: (entidad: CadEntity) => boolean) => {
  const salida = exportCadDocumentDxf(documento, filtro);
  const destino = path.join(os.tmpdir(), `valle-${nombre}.dxf`);
  fs.writeFileSync(destino, salida.content, "utf8");
  ESCRITOS.push({ nombre, contenido: salida.content, entidades: salida.entityCount });
  return salida;
};

{
  eq(exportado.losses.length, 0, "el exportador no declara ni una pérdida sobre este documento");
  eq(exportado.entityCount, 1101, "y escribe las 1101 entidades que tiene el documento");
  ok(exportado.content.startsWith("0\nSECTION"), "el fichero empieza por una sección DXF");
  ok(exportado.content.includes(CAPA_REVISION), "y la capa del revisor viaja en el fichero");

  escribe("jornada-completa");
  escribe("jornada-sin-mtext-ni-hatch", (entidad) => entidad.type !== "mtext" && entidad.type !== "hatch");
  escribe("jornada-solo-mtext", (entidad) => entidad.type === "mtext");
  escribe("jornada-solo-hatch", (entidad) => entidad.type === "hatch");
  eq(ESCRITOS[0].contenido, exportado.content, "el fichero escrito es el mismo que se acaba de medir");
  eq(
    createHash("sha256").update(ESCRITOS[0].contenido).digest("hex"),
    shaExportado,
    "y su hash es el que se compara contra la medición congelada",
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ACTO 5 — QUE LO LEA OTRO (los dos oráculos, en `terceros-jornada-relectura`)
   ══════════════════════════════════════════════════════════════════════════ */

// El acto entero vive en su módulo porque aquí el producto ya no hace nada:
// entrega un fichero y calla. Las entradas van explícitas —el vector, la capa
// del revisor, la tolerancia— justamente para que ninguno de los dos actos
// pueda mirar del plano nada que no se le haya dado.
const { peores: peoresReleido } = releerConOraculoA({
  textoExportado: exportado.content,
  documento,
  oraculoOrigen: oraculoOrigen!,
  capaRevision: CAPA_REVISION,
  longitudDeLaLineaNueva: NUEVA_LINEA.longitud,
  tolerancia: TOL_ESCRITURA_POR_SEGMENTO,
});

const { lecturas: lecturasB, tiposQueNoAbre } = releerConOraculoB({
  escritos: ESCRITOS,
  porEtiqueta,
  medidas,
  shaExportado,
  techoTiposQueNoAbre: TECHO_TIPOS_QUE_EL_ORACULO_B_NO_ABRE,
});

/* ══════════════════════════════════════════════════════════════════════════
   EL ARTEFACTO: SE RECALCULA Y SE COMPARA CON EL COMPROMETIDO
   ══════════════════════════════════════════════════════════════════════════ */

const jornada = {
  generadoPor:
    "cd apps/web && VALLE_ESCRIBIR_JORNADA=1 npx tsx src/lib/cad/verification/terceros-jornada.spec.ts",
  verificadoPor: "apps/web/src/lib/cad/verification/terceros-jornada.spec.ts",
  queEs:
    "La jornada entera sobre el plano de OTRO: abrir, medir contra un oráculo externo, modificar, " +
    "exportar y releer. No hay ni un número fijado por una corrida anterior del producto.",
  plano: {
    id: "bjnortier-dxf/floorplan",
    fuente: "bjnortier/dxf (MIT) — fichero de prueba de la biblioteca, no escrito por este proyecto",
    sha256: shaPlano,
    bytes: bytesPlano.byteLength,
    dialecto: oraculoOrigen!.dialecto,
    version: oraculoOrigen!.version,
    capasEnTabla: oraculoOrigen!.capasDeclaradas,
    estilosDeCota: oraculoOrigen!.estilosDeCota,
    tiposDeLinea: oraculoOrigen!.tiposDeLinea,
    espacioModeloSegunOraculoB: oraculoOrigen!.espacioModelo,
  },
  oraculos: {
    A: {
      herramienta: "dxf-parser (MIT)",
      corre: "en cada corrida de CI: es dependencia declarada de apps/web",
      limite:
        "COMPARTE MOTOR con el lector (dxf-import.ts lo importa). Sirve para juzgar lo que " +
        "ESCRIBIMOS, no para juzgar cómo leemos. Y no ve HATCH: no trae manejador.",
    },
    B: {
      herramienta: `${medidas.herramienta.nombre} ${medidas.herramienta.version} (MIT)`,
      corre: "fuera de CI; su medición se congela en docs/cad/corpus/oraculos/medidas-floorplan-ezdxf.json",
      limite: "No es AutoCAD. Acredita interoperabilidad con una segunda implementación, no compatibilidad.",
    },
  },
  actos: {
    abrir: {
      puerta: "importDocumentText — la misma que usa el estudio al soltar un fichero",
      entidades: 1109,
      bloques: 17,
      porTipo: { ...CENSO_AL_ABRIR },
      capasQueLlegan: documentoAbierto.layers.length,
      capasEnTabla: oraculoOrigen!.capasDeclaradas,
      avisos,
      cotasDeclaradasPerdidasQueSiEntraron: contradiccion,
    },
    medir: {
      contra: "ezdxf sobre LOS MISMOS BYTES, por clave geométrica y comparación por bolsa",
      familias: [
        { magnitud: "longitud de línea", entidades: 624, desviacionMenorQue: cota(peores.lineas) },
        { magnitud: "radio de círculo", entidades: 9, desviacionMenorQue: cota(peores.circulos) },
        { magnitud: "radio de arco", entidades: 20, desviacionMenorQue: cota(peores.arcosRadio) },
        { magnitud: "longitud de arco", entidades: 20, desviacionMenorQue: cota(peores.arcosLongitud) },
        { magnitud: "longitud de polilínea", entidades: 124, desviacionMenorQue: cota(peores.polilineas) },
        { magnitud: "medida de cota", entidades: 63, desviacionMenorQue: cota(peores.cotas) },
        { magnitud: "extensión del dibujo", entidades: 4, desviacionMenorQue: cota(peores.extension) },
      ],
      tolerancia: TOL_ORACULO,
      razonDeLaTolerancia:
        "Las dos lecturas parten del mismo ASCII, así que el mismo decimal da el mismo doble; lo que " +
        "queda es el orden de las operaciones y los doce decimales del artefacto (5e-13).",
      longitudTotalDeLineas: oraculoOrigen!.lineas!.longitudTotal,
      longitudTotalDePolilineas: oraculoOrigen!.polilineas!.longitudTotal,
    },
    modificar: {
      ordenes: ["MOVE", "LINE", "ERASE"],
      conducidasPor: "CAD_COMMAND_REGISTRY_V2 — los descriptores del producto, paso a paso",
      move: {
        vector: DESPLAZAMIENTO,
        loDictaElOraculo: "la esquina inferior izquierda que midió ezdxf, para no medirnos a nosotros mismos",
        entidadesTocadas: 1109,
        anchoTrasMover: ANCHO,
        altoTrasMover: ALTO,
      },
      line: { capa: CAPA_REVISION, longitud: NUEVA_LINEA.longitud },
      erase: { tipo: "circle", cuantas: 9 },
      entidadesAlFinal: 1101,
    },
    exportar: {
      puerta: "exportCadDocumentDxf — el mismo que entrega DXFOUT",
      entidades: exportado.entityCount,
      bytes: exportado.content.length,
      sha256: shaExportado,
      perdidasDeclaradas: exportado.losses.length,
      dialectoQueEscribimos: "AC1015 (R2000)",
      notaDelDialecto:
        "El plano ajeno es AC1018 (R2004) y sale como AC1015 (R2000). Es una versión ANTERIOR, " +
        "declarada en la cabecera: ningún lector se lleva una sorpresa, pero el fichero devuelto ya " +
        "no es del dialecto en el que llegó.",
      notaDeLaPolilinea:
        "Las 124 LWPOLYLINE del plano ajeno salen como POLYLINE (la pesada, con sus VERTEX). Es DXF " +
        "válido y los dos oráculos las leen con la misma longitud y los mismos vértices, pero no es " +
        "la misma entidad que llegó: ocupa más y es de un dialecto más viejo. El documento canónico " +
        "no distingue las dos, así que hoy no hay dónde recordar cuál era.",
    },
    releerConOraculoA: {
      abre: true,
      porTipo: { ...CENSO_RELEIDO_A },
      hatchInvisible: "el oráculo A no trae manejador de HATCH: sus 26 sombreados no los cuenta nadie en esta banda",
      tablaDeCapas: {
        enElPlanoAjeno: 24,
        enElDocumento: documentoAbierto.layers.length,
        enElFicheroQueDevolvemos: 23,
        queNoVuelven: ["Defpoints", "View Port"],
        porQue:
          "El documento se queda con las 17 capas que usa el espacio modelo, pero el exportador " +
          "escribe además las que usan las entidades dentro de los bloques: el plano que vuelve al " +
          "remitente conserva 22 de sus 24 capas más la del revisor. `Defpoints` no vuelve porque " +
          "sus 378 entidades viven dentro de bloques y no entraron; `View Port` porque sólo la usa " +
          "el espacio papel, que el lector excluye a propósito. Ninguna cambia el dibujo; lo que " +
          "falta es el aviso que lo diga (P-evidencia-09).",
      },
      desviacionContraElPlanoAjenoMenorQue: cota(peoresReleido.contraElOrigen),
      desviacionContraElDocumentoMenorQue: cota(peoresReleido.lineas),
      radiosDeArcoMenorQue: cota(peoresReleido.arcos),
      polilineasMenorQue: cota(peoresReleido.polilineas),
      cotasMenorQue: cota(peoresReleido.cotas),
      tolerancia: TOL_ESCRITURA_POR_SEGMENTO,
      razonDeLaTolerancia:
        "fmt() escribe seis decimales; una coordenada trasladada se redondea a la millonésima, así " +
        "que una longitud con dos extremos redondeados se mueve hasta 1,42e-6 por segmento.",
    },
    releerConOraculoB: {
      abreElFicheroCompleto: lecturasB.find((lectura) => lectura.etiqueta === "jornada-completa")!.abre,
      porQueNo:
        "MTEXT y HATCH salen sin sus marcadores de subclase (100 AcDbEntity, 100 AcDbMText / " +
        "100 AcDbHatch) aunque la cabecera declare AC1015, donde son obligatorios. ezdxf revienta al " +
        "cargarlos, incluso en modo `recover`.",
      tiposQueNoAbre: [...tiposQueNoAbre].sort(),
      loQueSiAbre: lecturasB.find((lectura) => lectura.etiqueta === "jornada-sin-mtext-ni-hatch")!.espacioModelo,
      erroresDeAuditoria: lecturasB.find((lectura) => lectura.etiqueta === "jornada-sin-mtext-ni-hatch")!.auditoria,
      conElParcheDeSubclases: {
        entidadesParcheadas: medidas.experimentoSubclases!.entidadesParcheadas,
        abre: medidas.experimentoSubclases!.leido,
        porTipo: medidas.experimentoSubclases!.espacioModelo,
        auditoria: medidas.experimentoSubclases!.auditoria,
        deQuienEsElArreglo: "P-evidencia-07 — pedido con este experimento como prueba, no a ciegas",
      },
    },
  },
  loQueLaJornadaDestapo: [
    "P-evidencia-07 · ezdxf no abre lo que exportamos: MTEXT y HATCH sin marcador de subclase. " +
      "Probado que con los marcadores insertados sí abre las 1101 entidades y audita cero errores.",
    `P-evidencia-08 · el informe de importación declara PERDIDAS ${TECHO_DECLARADAS_PERDIDAS_PERO_ENTRARON} ` +
      "cotas que SÍ entraron: el mapa de primitivas emite unsupported_entity por cada DIMENSION " +
      "mientras el camino semántico las importa.",
    "P-evidencia-09 · el documento se queda con 17 de las 24 capas del fichero y el que devolvemos " +
      "declara 23 (las de dentro de los bloques vuelven a escribirse): de las suyas no vuelven " +
      "`Defpoints` y `View Port`, y ningún aviso menciona nada de esto. No cambia el dibujo; el " +
      "silencio sí importa.",
  ],
  loQueNoSeMide: [
    "El espacio papel: el lector lo excluye a propósito y este plano tiene un Layout1 con 3 VIEWPORT.",
    "El contenido de los 17 bloques: se comparan las inserciones, no lo que hay dentro de cada uno.",
    "Los 6 LEADER y los 9 MTEXT de espacio modelo que el oráculo B cuenta: el lector devuelve MTEXT " +
      "sin dueño (144 en todo el archivo), así que no hay ámbito comparable para ellos.",
    "El aspecto: que un número sea correcto no dice que el plano se vea igual.",
  ],
  loQueNoAcredita:
    "Ni ezdxf ni dxf-parser son AutoCAD. Esta jornada acredita que un plano ajeno de 1,1 MB entra, se " +
    "mide igual que en una implementación independiente, se modifica, se exporta y lo vuelve a leer " +
    "otro programa. No acredita compatibilidad con AutoCAD, que sólo la acredita AutoCAD.",
  magnitudesComparadasContraUnOraculo: contador.magnitudes,
};

const recalculado = JSON.parse(JSON.stringify(jornada));

if (process.env.VALLE_ESCRIBIR_JORNADA === "1") {
  fs.writeFileSync(ARTEFACTO, `${JSON.stringify(recalculado, null, 2)}\n`, "utf8");
  console.log(`  · artefacto reescrito: ${path.relative(RAIZ, ARTEFACTO)}`);
}

{
  ok(fs.existsSync(ARTEFACTO), `falta el artefacto comprometido en ${path.relative(RAIZ, ARTEFACTO)}`);
  const comprometido = JSON.parse(fs.readFileSync(ARTEFACTO, "utf8"));
  assert.deepStrictEqual(
    recalculado,
    comprometido,
    "el artefacto comprometido ya no describe lo que pasa al recorrer la jornada. Regenera con " +
      "VALLE_ESCRIBIR_JORNADA=1 y MIRA el diff antes de comprometerlo: si algo empeoró, el artefacto " +
      "no es lo que hay que ajustar.",
  );
  contador.comprobaciones += 1;
}

console.log(
  `terceros-jornada: ${contador.comprobaciones} comprobaciones · el plano ajeno floorplan.dxf (R2004, 1,1 MB, ` +
    `1109 entidades) abierto por el lector de producción; 624 longitudes, 9+20 radios, 124 polilíneas ` +
    `y 63 medidas de cota idénticas a las de ezdxf sobre los mismos bytes (±${TOL_ORACULO}); movido, ` +
    `ampliado y recortado con MOVE/LINE/ERASE; exportado con el exportador de producción y releído`,
);
console.log(
  `  · de ellas, ${contador.magnitudes} son magnitudes del dibujo comparadas una a una contra un oráculo ` +
    "que no es este producto; el resto es la contabilidad que impide que esa comparación mienta",
);
console.log(
  `  · el oráculo A vuelve a medir en NUESTRO fichero las mismas longitudes del plano ajeno ` +
    `(±${TOL_ESCRITURA_POR_SEGMENTO} por segmento, que es lo que valen seis decimales)`,
);
console.log(
  "  · TODAVÍA NO (2026-09-04): ezdxf NO abre lo que exportamos — MTEXT y HATCH salen sin marcador " +
    "de subclase; sí abre los otros siete tipos con cero errores de auditoría, y con el parche " +
    "probado abre el fichero entero (P-evidencia-07).",
);
