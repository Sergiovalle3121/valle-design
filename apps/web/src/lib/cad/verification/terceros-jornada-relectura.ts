import { createHash } from "node:crypto";
import DxfParser from "dxf-parser";
import type { CadDocument } from "../cad-document";
import {
  cerca,
  claveSegmento,
  comparaOrdenado,
  comparaPorClave,
  deTipo,
  eq,
  longitudDe,
  longitudPolilinea,
  ok,
  type ArtefactoMedidas,
  type EntidadOraculoA,
  type MedidaOraculoB,
} from "./terceros-jornada-medicion";

/**
 * ACTO 5 DE LA JORNADA: QUE LO LEA OTRO.
 *
 * Los cuatro primeros actos los conduce el spec porque son el producto
 * trabajando —abrir, medir, modificar, exportar—. El quinto es distinto: aquí
 * el producto ya no hace nada, sólo entrega un fichero y calla. Quien habla son
 * los dos lectores ajenos, y por eso vive aparte: es la mitad de la jornada
 * donde la afirmación no la firmamos nosotros.
 *
 * Los dos son distintos a propósito y hay que decir en qué:
 *
 *  · **Oráculo A — `dxf-parser`** (MIT). Corre EN CI, sobre nuestro fichero, en
 *    cada corrida. Es TOLERANTE: lee lo que le echen, y por eso no destapó lo
 *    que destapó el otro. Contra él se mide que las magnitudes del plano ajeno
 *    siguen ahí después del viaje entero.
 *  · **Oráculo B — `ezdxf` 1.4.4** (MIT, Manfred Moitzi). No está en CI: su
 *    lectura viene CONGELADA en `medidas-floorplan-ezdxf.json` y anclada al
 *    sha256 de los bytes que la produjeron. Es ESTRICTO, y por eso dice que no.
 *
 * El módulo está separado también por el presupuesto de monolito (800 líneas
 * por archivo no presupuestado). El cuerpo de los dos actos no se tocó al
 * moverlo: lo que era un bloque de nivel superior es ahora el cuerpo de una
 * función con sus entradas explícitas, que además obliga a escribir de qué
 * depende cada acto en vez de dejarlo en el alcance del script.
 */

/**
 * Lo que el oráculo A tiene que contar en NUESTRO fichero, tipo a tipo.
 *
 * Vive fuera de la función porque el artefacto lo publica: es la banda que un
 * lector ajeno ve, y publicarla desde otro sitio la volvería a escribir a mano.
 */
export const CENSO_RELEIDO_A = {
  ARC: 20,
  DIMENSION: 63,
  INSERT: 10,
  LINE: 625,
  MTEXT: 144,
  POLYLINE: 124,
  TEXT: 89,
} as const;

/** Lo que el oráculo B dice de cada fichero que la jornada exportó. */
export interface LecturaDelExportado {
  etiqueta: string;
  medido: boolean;
  hashCuadra: boolean;
  abre: boolean;
  error?: string;
  espacioModelo?: Record<string, number>;
  auditoria?: { errores: number; correcciones: number };
}

/**
 * ACTO 5a — releer con el oráculo A, que corre en CI.
 *
 * Las entradas son explícitas a propósito: el vector del movimiento, la capa
 * del revisor y la tolerancia entran por parámetro, así que este acto no puede
 * mirar por su cuenta nada del plano que no se le haya dado.
 */
export function releerConOraculoA(entrada: {
  textoExportado: string;
  documento: CadDocument;
  oraculoOrigen: MedidaOraculoB;
  capaRevision: string;
  longitudDeLaLineaNueva: number;
  tolerancia: number;
}): {
  peores: { lineas: number; arcos: number; polilineas: number; cotas: number; contraElOrigen: number };
} {
  const {
    documento,
    oraculoOrigen,
    capaRevision: CAPA_REVISION,
    tolerancia: TOL_ESCRITURA_POR_SEGMENTO,
  } = entrada;


const releidoA = new DxfParser().parseSync(entrada.textoExportado) as unknown as {
  entities?: EntidadOraculoA[];
  tables?: { layer?: { layers?: Record<string, unknown> } };
  blocks?: Record<string, unknown>;
  header?: Record<string, unknown>;
} | null;

ok(releidoA !== null && Array.isArray(releidoA.entities), "el oráculo A abre lo que escribimos");

const censoA: Record<string, number> = {};
for (const entidad of releidoA!.entities ?? []) censoA[entidad.type] = (censoA[entidad.type] ?? 0) + 1;




const peoresReleido = { lineas: 0, arcos: 0, polilineas: 0, cotas: 0, contraElOrigen: 0 };

{
  eq(censoA, { ...CENSO_RELEIDO_A }, "lo que el oráculo A cuenta en nuestro fichero, tipo a tipo");
  eq(
    censoA.CIRCLE ?? 0,
    0,
    "los nueve círculos borrados no están: la modificación viajó, y se comprueba por ausencia",
  );
  eq(
    censoA.HATCH ?? 0,
    0,
    "y HATCH sale cero porque el oráculo A no trae manejador de HATCH: es su punto ciego, " +
      "no una pérdida (los 26 sombreados están escritos y el oráculo B los cuenta)",
  );
  // — LA TABLA DE CAPAS DEL FICHERO QUE DEVOLVEMOS —
  // Se lee con el oráculo A a propósito: devuelve SÓLO lo que está escrito.
  // `ezdxf` añade por su cuenta las capas estándar que falten al cargar, así
  // que para juzgar lo que escribimos ese oráculo diría de más.
  const capasQueDevolvemos = Object.keys(releidoA!.tables?.layer?.layers ?? {}).sort();
  eq(
    capasQueDevolvemos.includes(CAPA_REVISION),
    true,
    "la capa del revisor llegó a la tabla LAYER del fichero, no sólo al código 8 de la entidad",
  );
  {
    // El documento sólo se queda con las 17 capas que usa el espacio modelo,
    // pero el fichero que devolvemos declara 23: el exportador escribe también
    // las que usan las entidades DENTRO de los bloques. O sea que el plano que
    // vuelve al remitente conserva 22 de sus 24 capas más la del revisor, y no
    // 17. Las dos que no vuelven, medidas y con causa:
    //
    //   · `Defpoints` — sus 378 entidades viven dentro de definiciones de
    //     bloque y no entraron; sin entidad que la use, no hay capa que
    //     escribir.
    //   · `View Port` — la usa UNA entidad de espacio papel, y el espacio papel
    //     el lector lo excluye a propósito (`dxf-model-space-scope.ts`).
    //
    // Ninguna de las dos cambia el dibujo. Lo que no hay es un aviso que lo
    // diga (P-evidencia-09), y por eso se mide aquí.
    const capasDelPlanoAjeno = new Set(oraculoOrigen!.capas ?? []);
    eq(capasDelPlanoAjeno.size, 24, "el fichero ajeno declara 24 capas");
    eq(capasQueDevolvemos.length, 23, "y el que devolvemos declara 23");
    eq(
      capasQueDevolvemos.filter((capa) => !capasDelPlanoAjeno.has(capa)),
      [CAPA_REVISION],
      "lo único que añadimos a su tabla de capas es la del revisor",
    );
    eq(
      [...capasDelPlanoAjeno].filter((capa) => !capasQueDevolvemos.includes(capa)).sort(),
      ["Defpoints", "View Port"],
      "y las únicas dos que no vuelven son la de los puntos de definición y la del espacio papel",
    );
  }

  // — LAS LONGITUDES QUE ESCRIBIMOS, LEÍDAS POR OTRO, CONTRA LO QUE MIDIÓ EL
  //   ORÁCULO B EN EL PLANO AJENO. Es la frase entera de esta jornada.
  const lineasA = (releidoA!.entities ?? []).filter((entidad) => entidad.type === "LINE");
  const longitudesA = lineasA.map((linea) =>
    Math.hypot(
      linea.vertices![1].x - linea.vertices![0].x,
      linea.vertices![1].y - linea.vertices![0].y,
    ),
  );
  const esperadas = [...oraculoOrigen!.lineas!.porGeometria.map((fila) => fila[1]), entrada.longitudDeLaLineaNueva];
  peoresReleido.contraElOrigen = comparaOrdenado(
    "longitud de línea releída contra el plano ajeno",
    longitudesA,
    esperadas,
    TOL_ESCRITURA_POR_SEGMENTO,
  );

  // — Y CONTRA EL DOCUMENTO QUE LAS ESCRIBIÓ, POR CLAVE GEOMÉTRICA —
  // Aquí la clave sí vale: el oráculo A lee los seis decimales que escribió
  // `fmt()`, y redondear a seis el valor en memoria da exactamente eso.
  peoresReleido.lineas = comparaPorClave(
    "longitud de línea escrita",
    deTipo(documento, "line").map(
      (linea) => [claveSegmento(linea.start, linea.end), longitudDe(linea, "línea escrita")] as [string, number],
    ),
    lineasA.map(
      (linea) =>
        [
          claveSegmento(linea.vertices![0], linea.vertices![1]),
          Math.hypot(
            linea.vertices![1].x - linea.vertices![0].x,
            linea.vertices![1].y - linea.vertices![0].y,
          ),
        ] as [string, number],
    ),
    TOL_ESCRITURA_POR_SEGMENTO,
  );

  // — LOS 20 RADIOS DE ARCO, QUE SOBREVIVEN AL VIAJE ENTERO —
  const arcosA = (releidoA!.entities ?? []).filter((entidad) => entidad.type === "ARC");
  peoresReleido.arcos = comparaOrdenado(
    "radio de arco releído",
    arcosA.map((arco) => arco.radius!),
    oraculoOrigen!.arcos!.porGeometria.map((fila) => fila[1]),
    TOL_ESCRITURA_POR_SEGMENTO,
  );

  // — LAS 124 POLILÍNEAS, CON SUS BULGES —
  const polisA = (releidoA!.entities ?? []).filter((entidad) => entidad.type === "POLYLINE");
  peoresReleido.polilineas = comparaOrdenado(
    "longitud de polilínea releída",
    polisA.map((poli) => longitudPolilinea(poli.vertices ?? [], poli.shape === true)),
    oraculoOrigen!.polilineas!.porGeometria.map((fila) => fila[4]),
    // Una polilínea de N tramos acumula el redondeo N veces. La más larga del
    // plano manda sobre la tolerancia de todas, que es lo prudente.
    TOL_ESCRITURA_POR_SEGMENTO *
      Math.max(...oraculoOrigen!.polilineas!.porGeometria.map((fila) => fila[2])),
  );

  // — EL NÚMERO QUE NUESTRO FICHERO DECLARA PARA CADA UNA DE LAS 63 COTAS —
  // El código 42 de un DIMENSION es «la medida real». Que coincida con lo que
  // ezdxf midió en el plano ajeno cierra el círculo: el valor que el arquitecto
  // ve impreso es el que el plano de origen tenía.
  const cotasA = (releidoA!.entities ?? []).filter((entidad) => entidad.type === "DIMENSION");
  eq(
    cotasA.every((cotaA) => typeof cotaA.actualMeasurement === "number"),
    true,
    "las 63 cotas escritas llevan su medida real (código 42)",
  );
  peoresReleido.cotas = comparaOrdenado(
    "medida de cota releída",
    cotasA.map((cotaA) => cotaA.actualMeasurement!),
    oraculoOrigen!.cotas!.porGeometria.map((fila) => fila[2] as number),
    TOL_ESCRITURA_POR_SEGMENTO,
  );

  // — LA LÍNEA DEL REVISOR ESTÁ, Y MIDE LO QUE MEDÍA —
  const revisor = lineasA.filter((linea) => linea.layer === CAPA_REVISION);
  eq(revisor.length, 1, "la línea del revisor viajó, una sola vez");
  cerca(
    Math.hypot(
      revisor[0].vertices![1].x - revisor[0].vertices![0].x,
      revisor[0].vertices![1].y - revisor[0].vertices![0].y,
    ),
    entrada.longitudDeLaLineaNueva,
    TOL_ESCRITURA_POR_SEGMENTO,
    "y sigue midiendo 500",
  );
}

  return { peores: peoresReleido };
}

/**
 * ACTO 5b — releer con el oráculo B, congelado y anclado al hash.
 *
 * No lee nada: LEE LO QUE OTRO LEYÓ. `ezdxf` no está en CI, así que su dictamen
 * viaja en un artefacto atado por sha256 a los bytes exactos que lo produjeron.
 * Si esos bytes cambian, esto se pone rojo — que es lo correcto: la alternativa
 * era citar la lectura de unos bytes que ya no producimos.
 */
export function releerConOraculoB(entrada: {
  escritos: ReadonlyArray<{ nombre: string; contenido: string; entidades: number }>;
  porEtiqueta: Map<string, MedidaOraculoB>;
  medidas: ArtefactoMedidas;
  shaExportado: string;
  techoTiposQueNoAbre: readonly string[];
}): { lecturas: LecturaDelExportado[]; tiposQueNoAbre: string[] } {
  const {
    escritos: ESCRITOS,
    porEtiqueta,
    medidas,
    shaExportado,
    techoTiposQueNoAbre: TECHO_TIPOS_QUE_EL_ORACULO_B_NO_ABRE,
  } = entrada;


const lecturasB: LecturaDelExportado[] = ESCRITOS.map((escrito) => {
  const sha = createHash("sha256").update(escrito.contenido).digest("hex");
  const fila = porEtiqueta.get(`exportado/${escrito.nombre}`);
  if (!fila) return { etiqueta: escrito.nombre, medido: false, hashCuadra: false, abre: false };
  return {
    etiqueta: escrito.nombre,
    medido: true,
    hashCuadra: fila.sha256 === sha,
    abre: fila.leido,
    ...(fila.error ? { error: fila.error } : {}),
    ...(fila.espacioModelo ? { espacioModelo: fila.espacioModelo } : {}),
    ...(fila.auditoria ? { auditoria: fila.auditoria } : {}),
  };
});

const tiposQueNoAbre: string[] = [];

{
  const medidas0 = lecturasB.filter((lectura) => lectura.medido);
  ok(
    medidas0.length === ESCRITOS.length,
    `el oráculo B no midió ${ESCRITOS.length - medidas0.length} de los ${ESCRITOS.length} ficheros ` +
      "exportados: corre el spec y después `python3 docs/cad/corpus/oraculos/medidas-floorplan.py`",
  );
  for (const lectura of lecturasB)
    ok(
      lectura.hashCuadra,
      `${lectura.etiqueta}: la medición congelada del oráculo B es de otros bytes — algo del camino ` +
        "importar→modificar→exportar cambió. Se refresca en dos pasos, en una máquina con " +
        "`pip install ezdxf==1.4.4`: primero este mismo spec (deja los ficheros en el temporal) y " +
        "después `python3 docs/cad/corpus/oraculos/medidas-floorplan.py`. Nunca a mano: el artefacto " +
        "es lo que dijo otro programa, no lo que nos venga bien que hubiera dicho",
    );

  const soloMtext = lecturasB.find((lectura) => lectura.etiqueta === "jornada-solo-mtext")!;
  const soloHatch = lecturasB.find((lectura) => lectura.etiqueta === "jornada-solo-hatch")!;
  if (!soloMtext.abre) tiposQueNoAbre.push("MTEXT");
  if (!soloHatch.abre) tiposQueNoAbre.push("HATCH");
  ok(
    tiposQueNoAbre.every((tipo) => (TECHO_TIPOS_QUE_EL_ORACULO_B_NO_ABRE as readonly string[]).includes(tipo)),
    `el oráculo B dejó de abrir un tipo nuevo (${tiposQueNoAbre.join(", ")}): el techo es ` +
      `${TECHO_TIPOS_QUE_EL_ORACULO_B_NO_ABRE.join(", ")} y sólo puede bajar`,
  );

  // Y LO QUE SÍ ABRE, LO ABRE ENTERO. Ésta es la mitad afirmativa de la
  // jornada, y es la que se puede citar: siete de los nueve tipos del plano
  // ajeno vuelven a salir de nuestro fichero leídos por un programa que no es
  // este, con cero errores de auditoría.
  const sinLosDos = lecturasB.find((lectura) => lectura.etiqueta === "jornada-sin-mtext-ni-hatch")!;
  ok(
    sinLosDos.abre,
    `el oráculo B tampoco abre el fichero SIN mtext ni hatch (${sinLosDos.error ?? "sin error"}): ` +
      "entonces el problema no son esos dos tipos y este spec estaba contando otra cosa",
  );
  eq(
    sinLosDos.espacioModelo,
    { ARC: 20, DIMENSION: 63, INSERT: 10, LINE: 625, POLYLINE: 124, TEXT: 89 },
    "y cuenta en él exactamente lo que escribimos",
  );
  eq(sinLosDos.auditoria?.errores, 0, "sin un solo error de auditoría");

  // El experimento del parche: la petición P-evidencia-07 no propone a ciegas.
  const experimento = medidas.experimentoSubclases;
  ok(experimento !== null, "el artefacto del oráculo B tiene que traer el experimento del parche");
  eq(
    experimento!.sha256Origen,
    shaExportado,
    "el parche se probó sobre ESTOS bytes exportados, no sobre otros",
  );
  eq(experimento!.leido, true, "con los marcadores de subclase insertados, el oráculo B SÍ abre el fichero");
  eq(experimento!.entidadesParcheadas, 170, "y hubo que tocar 170 entidades: los 144 MTEXT y los 26 HATCH");
  eq(
    experimento!.espacioModelo,
    { ARC: 20, DIMENSION: 63, HATCH: 26, INSERT: 10, LINE: 625, MTEXT: 144, POLYLINE: 124, TEXT: 89 },
    "y entonces cuenta las 1101 entidades del documento, sombreados incluidos",
  );
  eq(experimento!.auditoria?.errores, 0, "y las audita sin un error");
}

  return { lecturas: lecturasB, tiposQueNoAbre };
}
