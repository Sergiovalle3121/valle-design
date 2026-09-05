import DxfParser from "dxf-parser";
import { importDocumentText } from "../document-import";
import { exportCadDocumentDxf } from "../dxf-document-export";
import {
  abreAjeno,
  cerca,
  claveSegmentoB,
  contador,
  eq,
  eqMagnitud,
  ok,
  publicaRenglon,
} from "./terceros-filas";

/**
 * FILA `layers` SOBRE UNA TABLA DE CAPAS AJENA.
 *
 * `bjnortier-dxf/layers.dxf` es un dibujo de nueve entidades: dos cuadrados y
 * un círculo, repartidos en tres capas con tres tipos de línea y tres grosores
 * distintos. Cabe entero en una pantalla, y por eso lo que le pase se puede
 * discutir sin creerle a nadie.
 *
 * ─── CAPA DECLARADA Y CAPA VISTA NO SON LO MISMO ───────────────────────────
 *
 * La distinción es el corazón de esta suite y hay que dejarla escrita porque
 * los tres testigos dan TRES cifras distintas y ninguno miente:
 *
 *   · El FICHERO escribe 3 registros LAYER en su tabla.
 *   · El ORÁCULO B (`ezdxf`) dice 4, porque añade `Defpoints` al construir su
 *     documento. Esa cuarta capa no la mandó nadie: acusar al lector de
 *     perderla sería inventarle un defecto.
 *   · Las ENTIDADES usan 3 capas —`0`, `dashedred` y `solidblue1mm`—, y aquí
 *     coinciden con las declaradas porque este fichero no trae capas vacías.
 *     `floorplan.dxf` es el caso contrario (24 declaradas, 17 vistas) y lo
 *     cubre P-evidencia-09.
 *
 * El lector de Valle construye su lista de capas a partir de las que las
 * entidades USAN, con lo que la tabla declare de cada una. En este fichero eso
 * da la respuesta correcta; el caso donde no la da ya está medido y pedido.
 *
 * ─── LO QUE ESTA SUITE DESTAPÓ, Y NO SE ESCONDE ────────────────────────────
 *
 * El COLOR de la capa del remitente no llega, y nadie lo dice. `document-import`
 * asigna el color por POSICIÓN ALFABÉTICA sobre una paleta de cinco
 * (`#ffffff`, `#ff5252`, `#4fc3f7`, `#ffd54f`, `#81c784`) y descarta el código
 * 62 del fichero; el exportador, a su vez, escribe `62 7` para todas. En
 * `layers.dxf` la rotación cae de forma que el resultado PARECE bien —rojo
 * donde había rojo—, y ése es justo el peligro. En `floorplan.dxf`, con
 * veinticuatro capas, se ve el error en las dos direcciones a la vez: tres
 * capas que el remitente pintó IGUAL (ACI 4) salen de tres colores, y cuatro
 * que pintó DISTINTO salen del mismo. El informe de importación dice «Entró
 * completo, sin pérdidas».
 *
 * Es una pérdida SILENCIOSA de propiedad. No contradice el techo de cero
 * pérdidas silenciosas de `dxf-corpus-terceros-matrix.json`: aquel cuenta
 * ENTIDADES y esto es una PROPIEDAD, un ámbito que aquella matriz no mira. Va
 * como P-evidencia-12, con el diseño completo escrito.
 */

const AJENO = abreAjeno("layers");
const PLANO = abreAjeno("floorplan");
const ESPEC = "apps/web/src/lib/cad/verification/terceros-capas.spec.ts";

/**
 * TECHO: capas del fichero cuyo color sobrevive el viaje. Sólo puede SUBIR.
 *
 * Es el único techo de esta suite que se declara al revés que los demás, y por
 * una razón: hoy vale cero, y un techo que sólo puede bajar desde cero no dice
 * nada. Cuando P-evidencia-12 entre, esta cifra sube a 3 y el spec lo exige.
 */
const PISO_COLORES_QUE_SOBREVIVEN = 0;

/** La paleta de cinco que el importador reparte por posición alfabética. */
const PALETA = ["#ffffff", "#ff5252", "#4fc3f7", "#ffd54f", "#81c784"] as const;

/**
 * El color verdadero de los índices ACI que este corpus usa.
 *
 * No es una tabla que inventemos: son los siete primeros colores del índice de
 * AutoCAD, los mismos que publica cualquier lector. Están aquí sólo los que
 * aparecen en los dos ficheros medidos, porque afirmar los 256 sin material que
 * los atestigüe sería exactamente lo que esta campaña no hace.
 */
const ACI_REAL: Record<number, string> = { 1: "#ff0000", 4: "#00ffff", 5: "#0000ff", 7: "#ffffff" };

interface CapaB {
  nombre: string;
  color: number;
  tipoDeLinea: string;
  grosor: number;
  apagada: boolean;
  congelada: boolean;
  bloqueada: boolean;
}
const medidaB = AJENO.b as unknown as {
  capasEnElFichero: string[];
  capasSegunElOraculo: CapaB[];
  tiposDeLineaSegunElOraculo: string[];
  capasVistasPorEntidad: Record<string, number>;
  lineas: Array<{ capa: string; de: number[]; a: number[] }>;
  circulos: Array<{ capa: string; centro: number[]; radio: number }>;
};

// --- 1. las tres cifras de «capa», separadas -------------------------------
{
  // El recuento crudo se rehace AQUÍ, sin pasar por ninguno de los dos
  // oráculos: dos escaneos independientes que coinciden valen más que uno.
  const lineas = AJENO.texto.split(/\r?\n/u).map((linea) => linea.trim());
  let dentroDeLaTabla = false;
  const declaradasAqui: string[] = [];
  for (let i = 0; i + 1 < lineas.length; i += 2) {
    const [codigo, valor] = [lineas[i], lineas[i + 1]];
    if (codigo === "0" && valor === "TABLE") dentroDeLaTabla = lineas[i + 3] === "LAYER";
    else if (codigo === "0" && valor === "ENDTAB") dentroDeLaTabla = false;
    else if (dentroDeLaTabla && codigo === "0" && valor === "LAYER") {
      for (let j = i + 2; j + 1 < lineas.length && lineas[j] !== "0"; j += 2)
        if (lineas[j] === "2") {
          declaradasAqui.push(lineas[j + 1]);
          break;
        }
    }
  }
  eqMagnitud(
    declaradasAqui.sort(),
    medidaB.capasEnElFichero,
    "el recuento crudo de registros LAYER de esta suite y el del oráculo B no coinciden",
  );
  eq(declaradasAqui.length, 3, "layers.dxf declara tres capas en su tabla");

  const delOraculo = medidaB.capasSegunElOraculo.map((capa) => capa.nombre);
  eq(delOraculo.length, 4, "el oráculo B termina con cuatro capas");
  eq(
    delOraculo.filter((nombre) => !declaradasAqui.includes(nombre)),
    ["Defpoints"],
    "la única capa que el oráculo B tiene de más es `Defpoints`, que él mismo añade. No es una capa perdida: es una capa inventada por el testigo.",
  );

  const vistas = Object.keys(medidaB.capasVistasPorEntidad).sort();
  eqMagnitud(vistas, declaradasAqui, "en este fichero toda capa declarada se usa y toda capa usada está declarada");
  eqMagnitud(
    medidaB.capasVistasPorEntidad,
    { "0": 4, dashedred: 4, solidblue1mm: 1 },
    "el reparto de las nueve entidades entre las tres capas",
  );
}

// --- 2. lo que trae el lector, contra lo que dicen los dos oráculos --------
const informe = importDocumentText("layers.dxf", AJENO.texto);
const documento = informe.document;
const capasDelLector = [...documento.layers].sort((a, b) => a.name.localeCompare(b.name));

{
  eqMagnitud(
    capasDelLector.map((capa) => capa.name),
    medidaB.capasEnElFichero,
    "el lector trae exactamente las capas del FICHERO, no las del oráculo: no se inventa `Defpoints`",
  );
  eq(informe.importedEntityCount, 9, "el lector trae las nueve entidades");
  eq(informe.dxfReport?.layerCount, 3, "el informe declara tres capas");

  // El oráculo A también corre, y aquí sí es un testigo útil: dice qué ve un
  // lector tolerante en la TABLA, que es lo que el lector de Valle no usa.
  const a = new DxfParser().parseSync(AJENO.texto) as {
    tables?: { layer?: { layers?: Record<string, unknown> }; lineType?: { lineTypes?: Record<string, unknown> } };
  } | null;
  eqMagnitud(
    Object.keys(a?.tables?.layer?.layers ?? {}).sort(),
    medidaB.capasEnElFichero,
    "el oráculo A lee la misma tabla LAYER de tres entradas",
  );
  eqMagnitud(
    Object.keys(a?.tables?.lineType?.lineTypes ?? {}).length,
    medidaB.tiposDeLineaSegunElOraculo.length,
    "los dos oráculos cuentan los mismos tipos de línea en la tabla LTYPE",
  );
  eq(medidaB.tiposDeLineaSegunElOraculo.length, 27, "la tabla LTYPE del fichero trae 27 tipos");
}

// --- 3. propiedad a propiedad, contra el oráculo B --------------------------
const colores: Array<{ capa: string; aciDelFichero: number; realDeEseAci: string; queDaElLector: string; sobrevive: boolean }> = [];
{
  for (const capa of capasDelLector) {
    const b = medidaB.capasSegunElOraculo.find((otra) => otra.nombre === capa.name)!;
    // TIPO DE LÍNEA: viaja intacto, y hay que decirlo tan claro como lo que no.
    eqMagnitud(capa.linetype, b.tipoDeLinea, `${capa.name}: el tipo de línea del remitente`);
    // GROSOR: cruza una frontera de unidades declarada en `document-import.ts`
    // —centésimas de milímetro en el fichero, milímetros en el documento, y −3
    // («por defecto» del fichero) guardado como −1—. Se comprueba la
    // conversión, no la igualdad.
    const esperado = b.grosor < 0 ? -1 : b.grosor / 100;
    eqMagnitud(capa.lineweight, esperado, `${capa.name}: el grosor convertido de centésimas a milímetros`);
    // VISIBILIDAD Y BLOQUEO: el fichero no apaga ni congela ni bloquea nada.
    eqMagnitud(capa.visible, !b.apagada, `${capa.name}: encendida como en el fichero`);
    eqMagnitud(capa.locked, b.bloqueada, `${capa.name}: sin bloquear, como en el fichero`);
    eqMagnitud(capa.frozen ?? false, b.congelada, `${capa.name}: sin congelar, como en el fichero`);
    // COLOR: aquí es donde se rompe.
    const real = ACI_REAL[b.color];
    ok(real !== undefined, `${capa.name}: el índice ACI ${b.color} no está en la tabla declarada de esta suite`);
    colores.push({
      capa: capa.name,
      aciDelFichero: b.color,
      realDeEseAci: real,
      queDaElLector: capa.color,
      sobrevive: capa.color.toLowerCase() === real,
    });
  }
  // La afirmación se hace por posición en la paleta, que es lo que demuestra
  // que el color NO se lee: sale del orden alfabético del nombre.
  for (const [indice, capa] of capasDelLector.entries())
    eq(
      capa.color,
      PALETA[indice % PALETA.length],
      `${capa.name}: el color que da el lector es el ${indice}º de la paleta, no el del fichero`,
    );
  const sobreviven = colores.filter((fila) => fila.sobrevive).length;
  // Sólo `0` (ACI 7 → blanco) coincide, y por casualidad: es el primero de la
  // paleta y el blanco del índice a la vez.
  eq(sobreviven, 1, "de las tres capas sólo el color de `0` coincide, y coincide por casualidad");
  eq(
    colores.filter((fila) => fila.capa !== "0" && fila.sobrevive).length,
    PISO_COLORES_QUE_SOBREVIVEN,
    "ninguna capa con color propio conserva su color. Este piso sólo puede SUBIR: cuando entre P-evidencia-12 vale 3.",
  );
}

// --- 4. las dos direcciones del error, sobre veinticuatro capas ------------
const colision = { igualesQueSeSeparan: 0, distintasQueSeJuntan: 0, capasDelPlano: 0 };
{
  // Con tres capas el error se puede confundir con una elección de estilo. Con
  // veinticuatro no: el remitente pintó capas del mismo color y otras de
  // colores distintos, y las dos cosas se rompen a la vez.
  const bPlano = PLANO.b as unknown as { capasSegunElOraculo: CapaB[] };
  const delPlano = importDocumentText("floorplan.dxf", PLANO.texto).document.layers;
  colision.capasDelPlano = delPlano.length;
  const aciDe = new Map(bPlano.capasSegunElOraculo.map((capa) => [capa.nombre, capa.color]));
  const porAci = new Map<number, Set<string>>();
  const porColorNuestro = new Map<string, Set<number>>();
  for (const capa of delPlano) {
    const aci = aciDe.get(capa.name);
    if (aci === undefined) continue;
    if (!porAci.has(aci)) porAci.set(aci, new Set());
    porAci.get(aci)!.add(capa.color);
    if (!porColorNuestro.has(capa.color)) porColorNuestro.set(capa.color, new Set());
    porColorNuestro.get(capa.color)!.add(aci);
  }
  for (const nuestros of porAci.values()) if (nuestros.size > 1) colision.igualesQueSeSeparan += 1;
  for (const acis of porColorNuestro.values()) if (acis.size > 1) colision.distintasQueSeJuntan += 1;
  ok(
    colision.igualesQueSeSeparan > 0,
    "hay índices ACI que el remitente usó en varias capas y que salen de colores distintos",
  );
  ok(
    colision.distintasQueSeJuntan > 0,
    "hay colores nuestros que juntan capas que el remitente pintó de índices distintos",
  );
  eq(colision.capasDelPlano, 17, "el plano ajeno llega con diecisiete capas (la poda de la tabla es P-evidencia-09)");
  eq(colision.igualesQueSeSeparan, 4, "cuatro índices ACI del plano se abren en varios colores nuestros");
  eq(colision.distintasQueSeJuntan, 5, "los cinco colores de la paleta juntan cada uno capas de índices distintos");
}

// --- 5. y el informe no lo menciona ----------------------------------------
{
  eq(informe.warnings, [], "el lector no emite ni un aviso sobre layers.dxf");
  eq(informe.dxfReport?.hasLosses, false, "el informe declara que no hubo pérdidas");
  ok(
    /sin pérdidas/u.test(informe.dxfReport?.headline ?? ""),
    "el titular del informe dice literalmente «sin pérdidas» mientras el color de las tres capas se quedó por el camino",
  );
  const codigos = (informe.dxfReport?.rows ?? []).map((fila) => fila.code);
  ok(
    !codigos.some((codigo) => /color/u.test(codigo)),
    "no hay ninguna fila del informe que hable del color: la pérdida es silenciosa, que es la categoría peor",
  );
}

// --- 6. y la vuelta tampoco lo arregla -------------------------------------
const escritos: Array<{ capa: string; aciEscrito: number }> = [];
{
  const salida = exportCadDocumentDxf(documento).content;
  const lineas = salida.split(/\r?\n/u).map((linea) => linea.trim());
  for (let i = 0; i + 1 < lineas.length; i += 1) {
    if (!(lineas[i] === "0" && lineas[i + 1] === "LAYER")) continue;
    let nombre = "";
    let aci = Number.NaN;
    for (let j = i + 2; j + 1 < lineas.length && !(lineas[j] === "0" && /^[A-Z]/u.test(lineas[j + 1])); j += 2) {
      if (lineas[j] === "2") nombre = lineas[j + 1];
      if (lineas[j] === "62") aci = Number(lineas[j + 1]);
    }
    if (nombre) escritos.push({ capa: nombre, aciEscrito: aci });
  }
  eq(escritos.length, 3, "el fichero que devolvemos trae las tres capas");
  eqMagnitud(
    escritos.map((fila) => fila.capa).sort(),
    medidaB.capasEnElFichero,
    "y con los nombres del remitente",
  );
  for (const fila of escritos)
    eq(fila.aciEscrito, 7, `${fila.capa}: sale escrita con color 7 (blanco), sea cual fuera el que llegó`);
  ok(
    new Set(escritos.map((fila) => fila.aciEscrito)).size === 1,
    "el dibujo que devolvemos es MONOCROMO por tabla de capas, y el remitente lo mandó en tres colores",
  );
  // El resto de la tabla sí vuelve bien, y decirlo importa tanto como lo otro.
  ok(salida.includes("DASHED2"), "el tipo de línea del remitente sí vuelve en la tabla LAYER");
}

// --- 7. la geometría, para que la fila no se afirme sobre una tabla sola ----
{
  const porClave = new Map<string, { capa: string }>();
  for (const linea of medidaB.lineas) porClave.set(claveSegmentoB(linea.de, linea.a), { capa: linea.capa });
  let comparadas = 0;
  for (const entidad of documento.entities) {
    if (entidad.type !== "line") continue;
    const linea = entidad as unknown as { start: { x: number; y: number }; end: { x: number; y: number }; layer?: string };
    const clave = claveSegmentoB([linea.start.x, linea.start.y], [linea.end.x, linea.end.y]);
    const delOraculo = porClave.get(clave);
    ok(delOraculo !== undefined, `la línea ${clave} no está en lo que midió el oráculo B`);
    eqMagnitud(linea.layer, delOraculo!.capa, `la línea ${clave} llega en la capa que el remitente le puso`);
    comparadas += 1;
  }
  eq(comparadas, 8, "las ocho líneas se compararon una a una contra el oráculo");
  const circulo = documento.entities.find((entidad) => entidad.type === "circle") as unknown as {
    center: { x: number; y: number };
    radius: number;
    layer?: string;
  };
  cerca(circulo.center.x, medidaB.circulos[0].centro[0], 1e-9, "centro X del círculo");
  cerca(circulo.center.y, medidaB.circulos[0].centro[1], 1e-9, "centro Y del círculo");
  cerca(circulo.radius, medidaB.circulos[0].radio, 1e-9, "radio del círculo");
  eqMagnitud(circulo.layer, medidaB.circulos[0].capa, "y el círculo llega en `solidblue1mm`");
}

// --- 8. el renglón del artefacto compartido --------------------------------
publicaRenglon({
  fila: "layers",
  filasDeLaRubrica: ["layers"],
  spec: ESPEC,
  archivosAjenos: [
    { id: AJENO.id, sha256: AJENO.sha256, bytes: AJENO.bytes, dialecto: AJENO.b.dialecto },
    { id: PLANO.id, sha256: PLANO.sha256, bytes: PLANO.bytes, dialecto: PLANO.b.dialecto },
  ],
  loQueAfirmaLaFila:
    "Capas y propiedades: que el mapa de capas de un DXF ajeno —nombre, color, tipo de línea, grosor, apagada, congelada— llega al documento y vuelve al fichero.",
  loQueDicenLosOraculos: {
    capasEnElFichero: 3,
    capasSegunElOraculoB: 4,
    porQueCuatro: "ezdxf añade `Defpoints` al construir su documento; esa capa no la escribió el remitente",
    capasVistasPorLasEntidades: medidaB.capasVistasPorEntidad,
    tiposDeLineaEnLaTablaLTYPE: 27,
    losDosOraculosCoincidenEnLaTabla: true,
    coloresDeclarados: colores.map((fila) => ({ capa: fila.capa, aci: fila.aciDelFichero, color: fila.realDeEseAci })),
  },
  loQueHaceElLector: {
    capasQueTrae: capasDelLector.map((capa) => capa.name),
    tipoDeLinea: "intacto en las tres",
    grosor: "convertido de centésimas de milímetro a milímetros, con −3 → −1 («por defecto»); correcto en las tres",
    encendidoYBloqueo: "como en el fichero",
    color: colores.map((fila) => ({
      capa: fila.capa,
      loQueMandaron: fila.realDeEseAci,
      loQueSale: fila.queDaElLector,
      sobrevive: fila.sobrevive,
    })),
    colorEnElFicheroQueDevolvemos: escritos.map((fila) => ({ capa: fila.capa, aci: fila.aciEscrito })),
    avisosEmitidos: 0,
    titularDelInforme: informe.dxfReport?.headline ?? "",
  },
  hallazgos: [
    {
      id: "color-de-capa-descartado",
      que:
        "El color de la capa del remitente no se lee (el importador reparte una paleta de cinco por posición alfabética y descarta el código 62) y no se escribe (el exportador pone `62 7` en todas). El informe dice «Entró completo, sin pérdidas». En floorplan.dxf, con 24 capas, se ve en las dos direcciones: " +
        `${colision.igualesQueSeSeparan} índices ACI que el remitente usó en varias capas salen de colores distintos, y los ${colision.distintasQueSeJuntan} colores de la paleta juntan cada uno capas de índices distintos.`,
      silencioso: true,
      peticion: "P-evidencia-12",
    },
    {
      id: "lo-que-si-viaja",
      que: "Tipo de línea, grosor (con su conversión de unidades), encendido, bloqueo y congelado llegan intactos en las tres capas, y el tipo de línea vuelve al fichero. La fila no está rota entera: está rota en una propiedad.",
      silencioso: false,
      peticion: null,
    },
  ],
  veredicto: "bloqueado_por_defecto_medido",
  porQueEseVeredicto:
    "Un testigo ajeno mide que el color de la capa se pierde en los dos sentidos sin un solo aviso. Conceder el tope de «Capas y propiedades» encima de una pérdida silenciosa medida es el caso exacto que la regla del corte inventó para impedir. Sale de aquí con P-evidencia-12, no antes.",
  loQueNoSeMide:
    "Los 256 índices ACI: sólo se afirman los cuatro que estos dos ficheros usan (1, 4, 5 y 7). Tampoco se mide el color por ENTIDAD (código 62 en la entidad, no en la capa), ni la transparencia, ni el estilo de trazado; ningún fichero del corpus los trae con variedad suficiente.",
});

console.log(
  `capas ajenas: ${contador.comprobaciones} comprobaciones · ${contador.magnitudes} datos del dibujo ` +
    `contrastados contra ezdxf 1.4.4 sobre ${AJENO.bytes} y ${PLANO.bytes} bytes que no escribimos`,
);
console.log(
  "  · TODAVÍA NO (2026-09-05): el color de la capa del remitente se pierde en los dos sentidos y en silencio " +
    `(${colision.igualesQueSeSeparan} índices que se abren y ${colision.distintasQueSeJuntan} colores que se juntan en floorplan.dxf). P-evidencia-12.`,
);
