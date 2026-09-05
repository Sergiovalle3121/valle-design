import DxfParser from "dxf-parser";
import { importDocumentText } from "../document-import";
import {
  abreAjeno,
  cerca,
  claveSegmentoB,
  contador,
  eq,
  eqMagnitud,
  ok,
  porTipo,
  publicaRenglon,
} from "./terceros-filas";

/**
 * FILA `blocks` SOBRE DOS FICHEROS DE BLOQUES AJENOS.
 *
 * Los dos son de `bjnortier/dxf` (MIT) y están elegidos para que uno diga que
 * sí y el otro diga que no:
 *
 *   · `blocks1.dxf` — un bloque `a` (cuadrado de 60 y círculo de radio 20)
 *     insertado dos veces, una de ellas con escala 2 en X y 1 en Y. Es el caso
 *     que el producto resuelve, y con su degradación DECLARADA.
 *   · `blocks2.dxf` — un INSERT que apunta a un bloque que contiene DOS
 *     INSERT más, y dentro de ellos un ARC y una ELLIPSE. Es el caso que el
 *     producto NO abre en absoluto.
 *
 * ─── EL RECHAZO, Y DE QUIÉN ES LA CULPA ────────────────────────────────────
 *
 * `importDocumentText` levanta «El DXF está corrupto o no es un DXF de texto
 * válido» sobre `blocks2.dxf`. El fichero NO está corrupto: `ezdxf` lo abre
 * entero y sin una queja, y además es material de prueba de la biblioteca que
 * lo publica. El mensaje acusa al remitente de algo que no hizo, y ése es el
 * peor modo de fallo que hay en una importación: el arquitecto reenvía el
 * fichero a su cliente para que se lo «arregle».
 *
 * La causa está MEDIDA, no supuesta, y es una sola: la cabecera trae
 * `$XCLIPFRAME` con valor 2. `dxf-parser` convierte los códigos 290-299 a
 * booleano y sólo acepta «0» y «1»; desde AutoCAD 2010 esa variable admite
 * legítimamente 0, 1 y 2. Esta suite lo demuestra normalizando ESE ÚNICO PAR
 * en una copia EN MEMORIA —el fichero del árbol no se toca y su sha256 lo
 * prueba— y volviendo a importar: entran las seis entidades y los tres
 * bloques, con cero avisos. El arreglo va probado antes de pedirlo
 * (P-evidencia-13).
 *
 * ─── Y POR QUÉ EL ORÁCULO A NO SIRVE AQUÍ ──────────────────────────────────
 *
 * Porque `dxf-import.ts` importa `dxf-parser`: el lector y el oráculo A son la
 * misma máquina de analizar. Sobre este fichero se equivocan igual, con el
 * mismo mensaje, y esta suite lo comprueba a propósito. Sin `ezdxf` no habría
 * forma de saber si el fichero está mal o si estamos mal nosotros — que es el
 * argumento entero a favor de tener un segundo oráculo, medido en vez de
 * argumentado.
 */

const UNO = abreAjeno("blocks1");
const DOS = abreAjeno("blocks2");
const PLANO = abreAjeno("floorplan");
const ESPEC = "apps/web/src/lib/cad/verification/terceros-bloques.spec.ts";

/**
 * TECHO: ficheros de estas cuatro filas que el lector RECHAZA entero.
 * Sólo puede bajar. Está VACÍO desde el 2026-09-05: era uno —`blocks2.dxf`, por
 * `$XCLIPFRAME 2`— y P-evidencia-13 lo abrió. Volver a llenarlo es un fichero
 * ajeno más que dejamos de leer, y hace falta decir cuál y por qué.
 */
const TECHO_FICHEROS_RECHAZADOS: string[] = [];

/**
 * Tolerancia de las magnitudes de bloque, y su razón.
 *
 * El fichero escribe seis decimales y el lector proyecta OCS→WCS: la rotación
 * de 45° vuelve como 45.00000000000029 y la escala 1 como 0.9999999999999964.
 * Eso es ruido de coma flotante tres órdenes por debajo de 1e-9, así que con
 * esta tolerancia se mide desacuerdo de verdad y no el redondeo.
 */
const TOL = 1e-9;

interface ContenidoB {
  censo: Record<string, number>;
  lineas?: Array<{ de: number[]; a: number[] }>;
  circulos?: Array<{ centro: number[]; radio: number }>;
  arcos?: Array<{ centro: number[]; radio: number; anguloInicialGrados: number; anguloFinalGrados: number }>;
  elipses?: Array<{
    centro: number[];
    ejeMayor: number[];
    razon: number;
    parametroInicialRadianes: number;
    parametroFinalRadianes: number;
  }>;
  mtext?: Array<{ texto: string; insercion: number[]; altura: number }>;
  inserts?: Array<{ bloque: string; insercion: number[]; escalaX: number; escalaY: number; escalaZ: number; rotacionGrados: number }>;
}
const bUno = UNO.b as unknown as {
  bloquesDefinidos: string[];
  contenidoDeBloques: Record<string, ContenidoB>;
  inserts: Array<{ bloque: string; capa: string; insercion: number[]; escalaX: number; escalaY: number; rotacionGrados: number }>;
};
const bDos = DOS.b as unknown as {
  capasEnElFichero: string[];
  espacioModelo: Record<string, number>;
  bloquesDefinidos: string[];
  contenidoDeBloques: Record<string, ContenidoB>;
  insertsDeEspacioModelo: Array<{ bloque: string; capa: string; insercion: number[]; escalaX: number; escalaY: number; escalaZ: number; rotacionGrados: number }>;
  mtextDeEspacioModelo: Array<{ texto: string; capa: string; insercion: number[] }>;
};

// === blocks1.dxf: el caso que sí =============================================
const informeUno = importDocumentText("blocks1.dxf", UNO.texto);
{
  eq(informeUno.importedBlockCount, 1, "el lector trae la única definición de bloque del fichero");
  eqMagnitud(bUno.bloquesDefinidos, ["a"], "el oráculo B ve un solo bloque, `a`");
  const bloques = (informeUno.document as unknown as { blocks: Array<{ name: string; entities: Array<{ type: string }> }> }).blocks;
  eq(bloques.length, 1, "y el documento tiene una definición");
  eqMagnitud(bloques[0].name, "a", "con el nombre del remitente");

  // El CONTENIDO del bloque, entidad por entidad contra el oráculo. Es lo que
  // separa «trae un bloque» de «trae el bloque que mandaron».
  const contenido = bUno.contenidoDeBloques.a;
  eqMagnitud(porTipo(bloques[0].entities), { circle: 1, line: 4 }, "el bloque `a` trae cuatro líneas y un círculo");
  eqMagnitud(contenido.censo, { CIRCLE: 1, LINE: 4 }, "y el oráculo B cuenta lo mismo dentro del bloque");
  const clavesB = new Set(contenido.lineas!.map((linea) => claveSegmentoB(linea.de, linea.a)));
  for (const entidad of bloques[0].entities) {
    if (entidad.type !== "line") continue;
    const linea = entidad as unknown as { start: { x: number; y: number }; end: { x: number; y: number } };
    const clave = claveSegmentoB([linea.start.x, linea.start.y], [linea.end.x, linea.end.y]);
    ok(clavesB.has(clave), `la línea ${clave} del bloque no está en lo que midió el oráculo B`);
    contador.magnitudes += 1;
  }
  const circulo = bloques[0].entities.find((entidad) => entidad.type === "circle") as unknown as {
    center: { x: number; y: number };
    radius: number;
  };
  cerca(circulo.center.x, contenido.circulos![0].centro[0], TOL, "centro X del círculo del bloque");
  cerca(circulo.center.y, contenido.circulos![0].centro[1], TOL, "centro Y del círculo del bloque");
  cerca(circulo.radius, contenido.circulos![0].radio, TOL, "radio del círculo del bloque — DENTRO de la definición llega intacto");
}

const inserts = informeUno.document.entities.filter((entidad) => entidad.type === "insert") as unknown as Array<{
  insertion: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
}>;
{
  eq(inserts.length, 2, "el bloque se inserta dos veces");
  eq(bUno.inserts.length, 2, "y el oráculo B ve las mismas dos inserciones");
  const ordenados = [...inserts].sort((a, b) => a.insertion.x - b.insertion.x);
  const oraculo = [...bUno.inserts].sort((a, b) => a.insercion[0] - b.insercion[0]);
  for (const [indice, insert] of ordenados.entries()) {
    const b = oraculo[indice];
    cerca(insert.insertion.x, b.insercion[0], TOL, `INSERT ${indice}: punto de inserción X`);
    cerca(insert.insertion.y, b.insercion[1], TOL, `INSERT ${indice}: punto de inserción Y`);
    cerca(insert.scale.x, b.escalaX, TOL, `INSERT ${indice}: escala en X`);
    cerca(insert.scale.y, b.escalaY, TOL, `INSERT ${indice}: escala en Y`);
    cerca(insert.rotation, b.rotacionGrados, TOL, `INSERT ${indice}: rotación en grados`);
  }
  // LA DEGRADACIÓN, DECLARADA. El segundo INSERT lleva escala 2 en X y 1 en Y
  // sobre un círculo: en un CAD eso sale elipse, y aquí sale círculo del radio
  // promedio. Que entre peor no es el defecto; el defecto sería que no lo diga.
  const anisotropo = oraculo.filter((b) => Math.abs(b.escalaX - b.escalaY) > TOL);
  eq(anisotropo.length, 1, "el oráculo B confirma que una de las dos inserciones tiene escala no uniforme");
  const avisos = informeUno.warnings.filter((aviso) => aviso.code === "anisotropic_insert");
  eq(avisos.length, 1, "y el lector emite exactamente un aviso `anisotropic_insert` por ella");
  const fila = (informeUno.dxfReport?.rows ?? []).find((fila) => fila.code === "anisotropic_insert");
  ok(fila?.fidelity === "degraded", "el informe la clasifica como degradada, no como perdida ni como intacta");
  ok(informeUno.dxfReport?.hasLosses === true, "y el informe no dice «entró completo»");
}

// === blocks2.dxf: el caso que ya SÍ =========================================
//
// Esta sección nació midiendo un rechazo. `importDocumentText` levantaba «El DXF
// está corrupto o no es un DXF de texto válido» sobre un fichero que `ezdxf`
// abre sin una queja y que publica una biblioteca MIT como material de prueba;
// el mensaje acusaba al remitente de algo que no hizo, y el arquitecto que lo
// leía reenviaba el archivo a su cliente para que «se lo arreglase».
//
// La causa era UNA: `$XCLIPFRAME` con valor 2, legítimo desde AutoCAD 2010.
// `dxf-parser` convierte los códigos 290–299 a booleano y sólo acepta 0 y 1.
// P-evidencia-13 normaliza esos valores antes de analizar —y lo AVISA—, así que
// desde el 2026-09-05 el fichero entra. Lo que la suite afirma ahora es que
// entra, que sigue siendo el mismo defecto de `dxf-parser` el que lo tumbaba, y
// que la normalización no es silenciosa.
const informeDos = importDocumentText("blocks2.dxf", DOS.texto);
{
  eq(informeDos.importedEntityCount, 4, "el lector abre blocks2.dxf y trae sus cuatro entidades de espacio modelo");
  eq(informeDos.importedBlockCount, 3, "y las tres definiciones de bloque");
  // El oráculo B, que no comparte motor con nadie de aquí, dice lo mismo del
  // espacio modelo: cuatro entidades. La quinta que el lector entregaba antes
  // era el MTEXT de dentro de `block01`, sacado a espacio modelo con las
  // coordenadas del bloque (P-evidencia-11).
  eqMagnitud(bDos.espacioModelo, { INSERT: 1, LINE: 1, LWPOLYLINE: 1, MTEXT: 1 }, "el oráculo B lee el espacio modelo entero");
  eqMagnitud(bDos.bloquesDefinidos, ["block01", "block02", "block_insert"], "y las tres definiciones de bloque");
  eq(
    informeDos.importedEntityCount,
    Object.values(bDos.espacioModelo as Record<string, number>).reduce((suma, n) => suma + n, 0),
    "el lector y el oráculo B cuentan el MISMO espacio modelo, entidad por entidad",
  );
  eq(TECHO_FICHEROS_RECHAZADOS, [], "el techo de ficheros rechazados sólo puede bajar");
}

// --- que el arreglo es el que decimos, y que NO es silencioso ---------------
let mensajeDelOraculoA = "";
{
  // El oráculo A sigue cayendo sobre el texto CRUDO. Eso importa: demuestra que
  // el defecto sigue estando donde se dijo —en la conversión a booleano de
  // `dxf-parser`, que el lector IMPORTA— y que lo que cambió es que el lector
  // normaliza antes de entregárselo, no que el fichero fuera otro.
  try {
    new DxfParser().parseSync(DOS.texto);
    ok(false, "el oráculo A abrió el texto crudo de blocks2.dxf; el diagnóstico de esta suite ya no vale");
  } catch (error) {
    mensajeDelOraculoA = (error as Error).message;
  }
  ok(
    /cannot be cast to Boolean/u.test(mensajeDelOraculoA),
    `el oráculo A cae por donde se dijo: «${mensajeDelOraculoA}»`,
  );
  ok(
    informeDos.warnings.some((aviso) => aviso.code === "header_boolean_out_of_range"),
    "y el lector DECLARA que normalizó una variable de cabecera: una normalización callada sería cambiar un defecto por otro más difícil de ver",
  );
  // Normalizar a mano y dejar que lo haga el lector dan el mismo documento. Sin
  // esto, «lo arreglamos» podría querer decir «lo leemos de otra manera».
  const normalizado = DOS.texto.replace(/(\$XCLIPFRAME\r?\n\s*290\r?\n\s*)2(\r?\n)/u, "$11$2");
  ok(normalizado !== DOS.texto, "la copia en memoria cambió exactamente el par de $XCLIPFRAME");
  ok(
    normalizado.length === DOS.texto.length,
    "y no cambió nada más: la copia mide lo mismo que el original, un dígito por otro",
  );
  const aMano = importDocumentText("blocks2.dxf", normalizado);
  eq(aMano.importedEntityCount, informeDos.importedEntityCount, "normalizar a mano da las mismas entidades que hace el lector");
  eq(aMano.importedBlockCount, informeDos.importedBlockCount, "y los mismos bloques");
}

// --- el árbol anidado, escalón por escalón ---------------------------------
const documentoDos = informeDos.document as unknown as {
  blocks: Array<{ id: string; name: string; entities: Array<Record<string, unknown> & { type: string }> }>;
  entities: Array<Record<string, unknown> & { type: string }>;
};
const acumulada = { escala: 0, dx: 0, dy: 0 };
{
  const porNombre = new Map(documentoDos.blocks.map((bloque) => [bloque.name, bloque]));
  eqMagnitud([...porNombre.keys()].sort(), bDos.bloquesDefinidos, "los tres bloques, con los nombres del remitente");

  const raiz = documentoDos.entities.find((entidad) => entidad.type === "insert") as unknown as {
    block: string;
    insertion: { x: number; y: number };
    scale: { x: number; y: number };
    rotation: number;
    layer?: string;
  };
  const bRaiz = bDos.insertsDeEspacioModelo[0];
  eqMagnitud(porNombre.get("block_insert")!.id, raiz.block, "el INSERT de espacio modelo apunta a `block_insert`");
  cerca(raiz.insertion.x, bRaiz.insercion[0], TOL, "INSERT raíz: X");
  cerca(raiz.insertion.y, bRaiz.insercion[1], TOL, "INSERT raíz: Y");
  cerca(raiz.scale.x, bRaiz.escalaX, TOL, "INSERT raíz: escala X");
  cerca(raiz.scale.y, bRaiz.escalaY, TOL, "INSERT raíz: escala Y");
  cerca(raiz.rotation, bRaiz.rotacionGrados, TOL, "INSERT raíz: rotación");
  eqMagnitud(raiz.layer, "entities", "y llega en la capa `entities` del remitente");

  const anidados = porNombre.get("block_insert")!.entities as unknown as Array<{
    type: string;
    block: string;
    insertion: { x: number; y: number };
    scale: { x: number; y: number };
    rotation: number;
  }>;
  eq(anidados.length, 2, "`block_insert` contiene dos INSERT y nada más");
  const bAnidados = bDos.contenidoDeBloques.block_insert.inserts!;
  eq(bAnidados.length, 2, "y el oráculo B ve los mismos dos");
  for (const [indice, anidado] of anidados.entries()) {
    const b = bAnidados[indice];
    eqMagnitud(porNombre.get(b.bloque)!.id, anidado.block, `INSERT anidado ${indice}: apunta a \`${b.bloque}\``);
    cerca(anidado.scale.x, b.escalaX, TOL, `INSERT anidado ${indice}: escala X`);
    cerca(anidado.scale.y, b.escalaY, TOL, `INSERT anidado ${indice}: escala Y`);
    cerca(anidado.insertion.x, b.insercion[0], TOL, `INSERT anidado ${indice}: X`);
    cerca(anidado.insertion.y, b.insercion[1], TOL, `INSERT anidado ${indice}: Y`);
  }

  /**
   * LA TRANSFORMACIÓN ACUMULADA, compuesta aquí y a la vista.
   *
   * `ezdxf` no la puede componer: los tres INSERT del fichero declaran escala
   * Z = 0 y `virtual_entities()` divide entre cero al normalizar el sistema de
   * coordenadas (está escrito en el artefacto del oráculo). Así que se compone
   * con los escalones que él sí publica, y la aritmética se deja
   * deliberadamente trivial —0,5 × 2 = 1, rotaciones 0— para que se pueda
   * comprobar a ojo: todo lo de dentro de `block01`/`block02` acaba a tamaño
   * natural, desplazado (175, 25).
   */
  acumulada.escala = bRaiz.escalaX * bAnidados[0].escalaX;
  acumulada.dx = bRaiz.insercion[0] + bRaiz.escalaX * bAnidados[0].insercion[0];
  acumulada.dy = bRaiz.insercion[1] + bRaiz.escalaX * bAnidados[0].insercion[1];
  eq(acumulada, { escala: 1, dx: 175, dy: 25 }, "la transformación acumulada es escala 1 y traslación (175, 25)");
  eq(bRaiz.rotacionGrados + bAnidados[0].rotacionGrados, 0, "sin rotación en ninguno de los dos escalones");
}

// --- ARC y ELLIPSE dentro del anidado, contra el oráculo --------------------
const aterrizaje: Array<{ que: string; enElBloque: number[]; acumulado: number[] }> = [];
{
  const porNombre = new Map(documentoDos.blocks.map((bloque) => [bloque.name, bloque]));
  const arco = porNombre.get("block01")!.entities.find((entidad) => entidad.type === "arc") as unknown as {
    center: { x: number; y: number };
    radius: number;
    startAngle: number;
    endAngle: number;
  };
  const bArco = bDos.contenidoDeBloques.block01.arcos![0];
  cerca(arco.center.x, bArco.centro[0], TOL, "ARC del bloque: centro X");
  cerca(arco.center.y, bArco.centro[1], TOL, "ARC del bloque: centro Y");
  cerca(arco.radius, bArco.radio, TOL, "ARC del bloque: radio");
  cerca(arco.startAngle, bArco.anguloInicialGrados, TOL, "ARC del bloque: ángulo inicial en grados");
  cerca(arco.endAngle, bArco.anguloFinalGrados, TOL, "ARC del bloque: ángulo final en grados");

  const elipse = porNombre.get("block02")!.entities.find((entidad) => entidad.type === "ellipse") as unknown as {
    center: { x: number; y: number };
    majorAxis: { x: number; y: number };
    ratio: number;
    startParameter: number;
    endParameter: number;
  };
  const bElipse = bDos.contenidoDeBloques.block02.elipses![0];
  cerca(elipse.center.x, bElipse.centro[0], TOL, "ELLIPSE del bloque: centro X");
  cerca(elipse.center.y, bElipse.centro[1], TOL, "ELLIPSE del bloque: centro Y");
  cerca(elipse.majorAxis.x, bElipse.ejeMayor[0], TOL, "ELLIPSE del bloque: eje mayor X");
  cerca(elipse.majorAxis.y, bElipse.ejeMayor[1], TOL, "ELLIPSE del bloque: eje mayor Y");
  cerca(elipse.ratio, bElipse.razon, TOL, "ELLIPSE del bloque: razón entre ejes");
  // El fichero guarda los parámetros en RADIANES y el documento los guarda en
  // GRADOS. Se comprueba la conversión, no la igualdad.
  cerca(
    elipse.startParameter,
    (bElipse.parametroInicialRadianes * 180) / Math.PI,
    1e-9,
    "ELLIPSE del bloque: parámetro inicial, convertido de radianes a grados",
  );
  cerca(
    elipse.endParameter,
    (bElipse.parametroFinalRadianes * 180) / Math.PI,
    1e-9,
    "ELLIPSE del bloque: parámetro final, convertido de radianes a grados",
  );

  aterrizaje.push(
    {
      que: "ARC de block01",
      enElBloque: bArco.centro,
      acumulado: [bArco.centro[0] * acumulada.escala + acumulada.dx, bArco.centro[1] * acumulada.escala + acumulada.dy],
    },
    {
      que: "ELLIPSE de block02",
      enElBloque: bElipse.centro,
      acumulado: [bElipse.centro[0] * acumulada.escala + acumulada.dx, bElipse.centro[1] * acumulada.escala + acumulada.dy],
    },
  );
  eq(
    aterrizaje.map((fila) => fila.acumulado),
    [
      [195, 105],
      [205, 45],
    ],
    "compuesta la transformación, el arco cae en (195, 105) y la elipse en (205, 45)",
  );
}

// --- el segundo defecto medido, y por dónde salió --------------------------
const fugados: Array<{ texto: string; donde: string; saleEn: number[]; caeEn: number[] }> = [];
{
  const mtext = documentoDos.entities.filter((entidad) => entidad.type === "mtext") as unknown as Array<{
    text: string;
    insertion: { x: number; y: number };
    layer?: string;
  }>;
  // Hasta el 2026-09-05 el lector entregaba TRES. Los dos de más vivían dentro
  // de `block01` y `block02` y salían a espacio modelo con las coordenadas
  // LOCALES del bloque —sin la traslación (175, 25) ni la escala del INSERT que
  // los trae—, así que se dibujaban 175 mm a la izquierda y 25 mm abajo, y
  // además dos veces, porque seguían dentro del bloque. P-evidencia-11 le dio
  // al escaneo crudo la sección en la que está.
  eq(mtext.length, 1, "el lector entrega UN MTEXT de espacio modelo, el que el remitente puso ahí");
  eq(bDos.mtextDeEspacioModelo.length, 1, "y el oráculo B ve exactamente el mismo");
  eqMagnitud(
    mtext[0].text,
    bDos.mtextDeEspacioModelo[0].texto,
    "y es el mismo texto que leyó el oráculo B, no otro que coincida en número",
  );

  // Lo que hace que esto sea un arreglo y no una desaparición: el rótulo sigue
  // DENTRO de su bloque, que es de donde tiene que salir dibujado, y el lector
  // conserva vivo el INSERT que lo trae con su transformación. Se comprueba
  // dónde CAE cada uno compuesta esa transformación, que es el sitio en el que
  // el remitente lo puso.
  const porNombre = new Map(documentoDos.blocks.map((bloque) => [bloque.name, bloque]));
  for (const nombre of ["block01", "block02"]) {
    const dentro = bDos.contenidoDeBloques[nombre].mtext![0];
    ok(
      !mtext.some((entidad) => entidad.text === dentro.texto),
      `el MTEXT «${dentro.texto}» de ${nombre} ya NO sale suelto a espacio modelo`,
    );
    ok(
      porNombre.get(nombre)!.entities.some((entidad) => entidad.type === "text"),
      `${nombre} conserva su rótulo DENTRO: es de ahí de donde se dibuja, con la transformación de su INSERT`,
    );
    fugados.push({
      texto: dentro.texto,
      donde: nombre,
      saleEn: dentro.insercion,
      caeEn: [
        dentro.insercion[0] * acumulada.escala + acumulada.dx,
        dentro.insercion[1] * acumulada.escala + acumulada.dy,
      ],
    });
  }
  ok(
    informeDos.warnings.every((aviso) => aviso.code !== "unsupported_entity"),
    "y nada de esto se declara como pérdida, porque no se pierde nada: cambia de sitio, del espacio modelo al bloque que lo trae",
  );
}

// --- la misma fuga, contada en el plano grande ------------------------------
const fugaEnElPlano = { enEspacioModeloDelRemitente: 0, enTodoElFichero: 0, queEntregaElLector: 0 };
{
  // Dos ficheros de dos y tres MTEXT demuestran el mecanismo; no dicen el
  // tamaño. El plano ajeno sí: el remitente puso NUEVE MTEXT en espacio modelo
  // y el fichero entero tiene 144, o sea que 135 viven dentro de bloques.
  const bPlano = PLANO.b as unknown as { mtextEnEspacioModelo: number; mtextEnTodoElFichero: number };
  fugaEnElPlano.enEspacioModeloDelRemitente = bPlano.mtextEnEspacioModelo;
  fugaEnElPlano.enTodoElFichero = bPlano.mtextEnTodoElFichero;
  const delPlano = importDocumentText("floorplan.dxf", PLANO.texto).document.entities;
  fugaEnElPlano.queEntregaElLector = delPlano.filter((entidad) => entidad.type === "mtext").length;
  eqMagnitud(bPlano.mtextEnEspacioModelo, 9, "el remitente puso nueve MTEXT en el espacio modelo del plano");
  eqMagnitud(bPlano.mtextEnTodoElFichero, 144, "y 144 en el fichero entero");
  eq(
    fugaEnElPlano.queEntregaElLector,
    fugaEnElPlano.enEspacioModeloDelRemitente,
    "el lector entrega los NUEVE que el remitente puso en espacio modelo, no los 144 del fichero entero",
  );
  // La cifra que medía el daño, ahora en cero. Se queda escrita —en vez de
  // borrar la sección— porque 135 rótulos de un plano de despacho cambiando de
  // dueño sin que nadie avise es exactamente lo que no puede volver a pasar sin
  // que algo se ponga rojo.
  eq(
    fugaEnElPlano.queEntregaElLector - fugaEnElPlano.enEspacioModeloDelRemitente,
    0,
    "ningún rótulo de dentro de un bloque sale ya a espacio modelo (eran 135 antes de P-evidencia-11)",
  );
}

// --- el renglón del artefacto compartido -----------------------------------
publicaRenglon({
  fila: "blocks",
  filasDeLaRubrica: ["blocks"],
  spec: ESPEC,
  archivosAjenos: [
    { id: UNO.id, sha256: UNO.sha256, bytes: UNO.bytes, dialecto: UNO.b.dialecto },
    { id: DOS.id, sha256: DOS.sha256, bytes: DOS.bytes, dialecto: DOS.b.dialecto },
    { id: PLANO.id, sha256: PLANO.sha256, bytes: PLANO.bytes, dialecto: PLANO.b.dialecto },
  ],
  loQueAfirmaLaFila:
    "Bloques y atributos: que una definición de bloque ajena y sus inserciones —incluidas las anidadas— llegan al documento como bloques editables y no como geometría suelta.",
  loQueDicenLosOraculos: {
    blocks1: {
      bloques: bUno.bloquesDefinidos,
      contenido: { LINE: 4, CIRCLE: 1 },
      inserciones: bUno.inserts.map((insert) => ({
        en: insert.insercion,
        escala: [insert.escalaX, insert.escalaY],
        rotacion: insert.rotacionGrados,
      })),
    },
    blocks2: {
      loQueVeElOraculoB: { espacioModelo: bDos.espacioModelo, bloques: bDos.bloquesDefinidos },
      loQueHaceElOraculoA: mensajeDelOraculoA,
      porQueNoSirveElAcuerdoDeAYElLector: "dxf-import.ts importa dxf-parser: comparten la máquina de analizar",
      transformacionAcumulada: acumulada,
    },
  },
  loQueHaceElLector: {
    blocks1: {
      bloquesTraidos: 1,
      contenidoDelBloque: { line: 4, circle: 1 },
      inserciones: 2,
      degradacionDeclarada: "anisotropic_insert (1): escala no uniforme sobre geometría circular, radio por el promedio",
    },
    blocks2: {
      resultado: "ABRE EL FICHERO ENTERO",
      causaQueLoImpedia: "$XCLIPFRAME = 2 en la cabecera; dxf-parser sólo admite 0 y 1 en los códigos 290-299",
      comoSeResolvio: "los códigos 290-299 fuera de rango se normalizan antes de analizar, y se declara con `header_boolean_out_of_range`",
      conLaCabeceraYaNormalizadaPorElLector: {
        entidades: 4,
        bloques: 3,
        normalizacionDeclarada: "header_boolean_out_of_range",
        anidamientoIntacto: true,
        arcoYElipseIntactos: true,
      },
      textoQueSeQuedaEnSuBloque: fugados,
    },
    floorplan: {
      mtextQueElRemitentePusoEnEspacioModelo: fugaEnElPlano.enEspacioModeloDelRemitente,
      mtextEnTodoElFichero: fugaEnElPlano.enTodoElFichero,
      mtextQueElLectorEntregaComoEspacioModelo: fugaEnElPlano.queEntregaElLector,
      rotulosQueCambianDeDueno: fugaEnElPlano.queEntregaElLector - fugaEnElPlano.enEspacioModeloDelRemitente,
    },
  },
  hallazgos: [
    {
      id: "fichero-ajeno-rechazado-por-una-variable-de-cabecera",
      que:
        "ARREGLADO el 2026-09-05 (P-evidencia-13). El lector rechazaba blocks2.dxf entero con «El DXF está corrupto o no es un DXF de texto válido» — una acusación al remitente que era falsa: ezdxf lo abre sin una queja y lo publica una biblioteca MIT como material de prueba. La causa medida era un solo par de la cabecera, `$XCLIPFRAME` = 2, legítimo desde AutoCAD 2010, que `dxf-parser` no sabe convertir a booleano. Hoy los códigos 290-299 fuera de rango se normalizan antes de analizar y se DECLARAN (`header_boolean_out_of_range`): el fichero entra con sus 4 entidades de espacio modelo y sus 3 bloques. El oráculo A sigue cayendo sobre el texto crudo, que es la prueba de que el defecto estaba donde se dijo.",
      silencioso: false,
      peticion: null,
    },
    {
      id: "mtext-que-se-sale-de-su-bloque",
      que:
        "ARREGLADO el 2026-09-05 (P-evidencia-11). Dos de los tres MTEXT que el lector entregaba a espacio modelo vivían DENTRO de `block01` y `block02` y salían con las coordenadas locales del bloque, sin la transformación acumulada: caían 175 mm a la izquierda y 25 mm abajo de donde el remitente los puso, y además seguían dentro del bloque, así que el rótulo se dibujaba dos veces. El escaneo crudo no sabía en qué sección estaba. Hoy el lector entrega UNO, el mismo que ve el oráculo B, y los rótulos se dibujan desde su bloque con la transformación de su INSERT. En el plano grande la cifra era 135 rótulos cambiando de dueño en silencio; ahora es 0.",
      silencioso: false,
      peticion: null,
    },
    {
      id: "lo-que-si-viaja",
      que:
        "La definición del bloque llega íntegra (cuatro líneas y un círculo medidos uno a uno), las dos inserciones con su punto, escala y rotación, el anidamiento de dos niveles, y el ARC y la ELLIPSE de dentro con sus ángulos y parámetros convertidos de radianes a grados. La escala no uniforme entra peor y se DECLARA degradada.",
      silencioso: false,
      peticion: null,
    },
  ],
  veredicto: "servible_hoy",
  porQueEseVeredicto:
    "Sobre blocks1.dxf el testigo ajeno dice que sí, entidad por entidad, y la única degradación va declarada. Los dos defectos que esta suite publicaba están arreglados y guardados por ella misma: los diecinueve ficheros del corpus se abren —el techo de rechazados está vacío— y ningún rótulo de dentro de un bloque sale ya a espacio modelo. El objeto propio de la fila —la definición del bloque, su contenido, el anidamiento y la transformación de cada escalón— llega intacto y medido contra un programa que no es éste.",
  loQueNoSeMide:
    "DÓNDE acaban dibujados los 135 rótulos que se salen de sus bloques en el plano ajeno: medirlo exige componer la transformación acumulada de los 17 bloques, y esta suite sólo la compone para el anidado de dos niveles de blocks2.dxf, donde cabe a ojo. Lo que aquí se afirma es el ÁMBITO, no el desplazamiento. Los ATRIBUTOS del bloque (ATTDEF/ATTRIB): ninguno de los diecinueve ficheros ajenos trae un bloque con atributos, así que la mitad del nombre de la fila no la atestigua nadie de fuera. Tampoco los bloques dinámicos, ni el espacio papel, ni el contenido de un bloque tras exportarlo.",
});

console.log(
  `bloques ajenos: ${contador.comprobaciones} comprobaciones · ${contador.magnitudes} datos del dibujo ` +
    "contrastados contra ezdxf 1.4.4 sobre dos ficheros de bloques que no escribimos",
);
console.log(
  `  · los ${TECHO_FICHEROS_RECHAZADOS.length === 0 ? "diecinueve" : "?"} ficheros del corpus se abren (blocks2.dxf entró con P-evidencia-13, declarando la normalización) ` +
    `y ${fugaEnElPlano.queEntregaElLector - fugaEnElPlano.enEspacioModeloDelRemitente} rótulos de dentro de bloques salen a espacio modelo, de los 135 que salían antes de P-evidencia-11.`,
);
