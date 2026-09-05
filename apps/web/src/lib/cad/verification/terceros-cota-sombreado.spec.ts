import DxfParser from "dxf-parser";
import { importDocumentText } from "../document-import";
import { buildCadDimensionGeometry, type CadDimensionEntity } from "../associative-dimension";
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
 * FILAS `dimensions` Y `hatch` SOBRE DOS FICHEROS AJENOS.
 *
 * Van juntas porque las dos preguntan lo mismo: qué pasa cuando el remitente
 * manda un objeto que su programa YA DIBUJÓ por dentro. Una cota y un sombreado
 * no son geometría suelta: son un valor —la medida, el relleno— más una imagen
 * que el programa de origen generó para pintarlo. Quien importa tiene que
 * decidir a cuál de las dos cosas le hace caso, y las dos decisiones se pueden
 * medir sobre ficheros que no escribimos.
 *
 *   · `dimensions.dxf` — dos cotas de otro CAD, una lineal de 80 y una radial
 *     de 30, cada una con su BLOQUE DE DIBUJO anónimo (`*D1`, `*D2`) donde
 *     viven las líneas, las puntas de flecha y el rótulo con el número ya
 *     escrito.
 *   · `hatches.dxf` — un HATCH con patrón `gost_non-metal` sobre un contorno
 *     de cuatro aristas rectas, y las cuatro líneas que dibujan ese mismo
 *     cuadrado.
 *
 * ─── EL SOMBREADO QUE SÓLO VE UN ORÁCULO ───────────────────────────────────
 *
 * `dxf-parser` (oráculo A) es CIEGO al HATCH: sobre este fichero devuelve
 * cuatro LINE y nada más. Si el único testigo fuera él, «no hay sombreado» y
 * «el sombreado se perdió» serían la misma frase. `ezdxf` ve el HATCH, su
 * patrón y su contorno, y por eso se puede afirmar que el relleno se pierde —y
 * medir que se pierde DECLARADO, no en silencio, que es la diferencia que
 * importa.
 *
 * ─── LA COTA QUE LLEGA CON SU NÚMERO DOS VECES ─────────────────────────────
 *
 * El lector resuelve la cota por sus puntos y vuelve a dibujar el rótulo, que
 * es lo correcto: así la cota sigue midiendo. Pero además saca el MTEXT de
 * dentro del bloque de dibujo y lo entrega como entidad suelta de espacio
 * modelo, en el mismo punto. El número queda escrito dos veces, encima de sí
 * mismo, y ningún aviso lo dice. Es el mismo defecto de ámbito que
 * `terceros-bloques.spec.ts` mide en `blocks2.dxf` —el escaneo crudo de MTEXT
 * no sabe dónde acaba un bloque— con otro síntoma. P-evidencia-11.
 */

const COTAS = abreAjeno("dimensions");
const SOMBRA = abreAjeno("hatches");
const ESPEC = "apps/web/src/lib/cad/verification/terceros-cota-sombreado.spec.ts";

/**
 * TECHO: sombreados ajenos que no entran. Sólo puede bajar. Está en CERO desde
 * el 2026-09-05: era uno —el contorno de cuatro aristas rectas de hatches.dxf,
 * descartado por «no poligonal»— y P-evidencia-14 lo reconstruye.
 */
const TECHO_SOMBREADOS_PERDIDOS = 0;
/**
 * TECHO: rótulos de cota duplicados por fichero. Sólo puede bajar. Está en CERO
 * desde el 2026-09-05: eran dos —el MTEXT del bloque de dibujo de cada cota,
 * sacado a espacio modelo encima del número que la propia cota recalcula— y
 * P-evidencia-11 le dio al escaneo crudo la sección en la que está.
 */
const TECHO_ROTULOS_DUPLICADOS = 0;

const TOL = 1e-9;

interface CotaB {
  tipoBruto: number;
  medida: number;
  textoDelUsuario: string;
  puntoDeTexto: number[];
  estilo: string;
  capa: string;
  bloqueDeDibujo: string;
  defpoint: number[];
  defpoint2: number[] | null;
  defpoint3: number[] | null;
}
const bCotas = COTAS.b as unknown as {
  espacioModelo: Record<string, number>;
  cotas: CotaB[];
  bloquesDeDibujo: Record<string, { censo: Record<string, number>; mtext?: Array<{ texto: string; insercion: number[]; altura: number }> }>;
};
const bSombra = SOMBRA.b as unknown as {
  espacioModelo: Record<string, number>;
  sombreados: Array<{
    patron: string;
    relleneSolido: boolean;
    asociativo: boolean;
    capa: string;
    contornos: Array<{ clase: string; banderas: number; esPolilinea: boolean; aristas?: Array<{ clase: string; de: number[]; a: number[] }>; verticesEquivalentes?: number[][] }>;
  }>;
  lineas: Array<{ de: number[]; a: number[] }>;
};

// ============================ COTAS ==========================================
const informeCotas = importDocumentText("dimensions.dxf", COTAS.texto);
const medidas: Array<{ tipo: string; medidaDelOraculo: number; medidaNuestra: number }> = [];
{
  // El oráculo B pone dos números que este producto no calculó: 80 y 30.
  eqMagnitud(bCotas.espacioModelo, { CIRCLE: 1, DIMENSION: 2, LINE: 4 }, "el espacio modelo del remitente: siete entidades");
  eq(bCotas.cotas.length, 2, "y dos de ellas son cotas");
  eq(
    bCotas.cotas.map((cota) => cota.textoDelUsuario),
    ["", ""],
    "ninguna trae texto de usuario: el número es el MEDIDO, así que se puede comprobar",
  );

  const nuestras = informeCotas.document.entities.filter((entidad) => entidad.type === "dimension") as unknown as CadDimensionEntity[];
  eq(nuestras.length, 2, "el lector trae las dos cotas");

  // LINEAL. El oráculo la mide en 80 entre sus dos puntos de definición; la
  // geometría del producto la vuelve a medir por su cuenta desde los suyos.
  const lineal = nuestras.find((cota) => cota.dimensionKind === "linear")!;
  const bLineal = bCotas.cotas.find((cota) => cota.tipoBruto % 32 === 0)!;
  cerca(lineal.a.x, bLineal.defpoint2![0], TOL, "cota lineal: X del primer punto de definición");
  cerca(lineal.a.y, bLineal.defpoint2![1], TOL, "cota lineal: Y del primer punto de definición");
  cerca(lineal.b.x, bLineal.defpoint3![0], TOL, "cota lineal: X del segundo punto");
  cerca(lineal.b.y, bLineal.defpoint3![1], TOL, "cota lineal: Y del segundo punto");
  cerca(lineal.textPosition!.x, bLineal.puntoDeTexto[0], TOL, "cota lineal: X del punto de texto");
  cerca(lineal.textPosition!.y, bLineal.puntoDeTexto[1], TOL, "cota lineal: Y del punto de texto");
  // El desplazamiento de la línea de cota sale de restar la Y del punto de la
  // línea (defpoint) a la de los puntos medidos: 20 − 10 = 10.
  cerca(lineal.offset ?? 0, bLineal.defpoint[1] - bLineal.defpoint3![1], TOL, "cota lineal: desplazamiento de la línea de cota");
  const geoLineal = buildCadDimensionGeometry(lineal)!;
  ok(geoLineal !== null, "la cota lineal produce geometría");
  cerca(geoLineal.measurement, bLineal.medida, 1e-9, "cota lineal: la MEDIDA que el producto recalcula contra la del oráculo");
  medidas.push({ tipo: "lineal", medidaDelOraculo: bLineal.medida, medidaNuestra: geoLineal.measurement });

  // RADIAL. El oráculo la mide en 30; el círculo del fichero tiene radio 30.
  const radial = nuestras.find((cota) => cota.dimensionKind === "radius")!;
  const bRadial = bCotas.cotas.find((cota) => cota.tipoBruto % 32 === 4)!;
  cerca(radial.textPosition!.x, bRadial.puntoDeTexto[0], TOL, "cota radial: X del punto de texto");
  cerca(radial.textPosition!.y, bRadial.puntoDeTexto[1], TOL, "cota radial: Y del punto de texto");
  cerca(radial.b.x, bRadial.defpoint[0], TOL, "cota radial: X del centro que declara el fichero");
  cerca(radial.b.y, bRadial.defpoint[1], TOL, "cota radial: Y del centro");
  const geoRadial = buildCadDimensionGeometry(radial)!;
  cerca(geoRadial.measurement, bRadial.medida, 1e-9, "cota radial: la MEDIDA recalculada contra la del oráculo");
  medidas.push({ tipo: "radial", medidaDelOraculo: bRadial.medida, medidaNuestra: geoRadial.measurement });

  eqMagnitud(
    medidas.map((fila) => fila.medidaNuestra),
    bCotas.cotas.map((cota) => cota.medida),
    "las dos medidas del producto son las dos del oráculo",
  );

  // LA DEGRADACIÓN, DECLARADA. Entran vivas —vuelven a medir— pero desligadas,
  // porque el fichero asocia por identificadores que no existen aquí.
  const desligadas = informeCotas.warnings.filter((aviso) => aviso.code === "foreign_dimension_detached");
  eq(desligadas.length, 2, "el lector declara las dos cotas DESLIGADAS del dibujo");
  for (const cota of nuestras) {
    eq(cota.associative, false, "y la entidad lo lleva escrito: no es asociativa");
    eq((cota as unknown as { associationStatus?: string }).associationStatus, "detached", "con su estado `detached`");
  }
}

// --- el rótulo que se escribe dos veces ------------------------------------
const duplicados: Array<{ texto: string; bloqueDeDibujo: string; en: number[] }> = [];
{
  // El texto de la cota NO está en espacio modelo: vive dentro de `*D1` y `*D2`.
  eq(bCotas.espacioModelo.MTEXT, undefined, "el oráculo B no ve NINGÚN MTEXT en el espacio modelo del remitente");
  const bloques = Object.keys(bCotas.bloquesDeDibujo).sort();
  eqMagnitud(bloques, ["*D1", "*D2"], "los dos bloques de dibujo que el programa de origen generó");
  for (const nombre of bloques)
    eqMagnitud(bCotas.bloquesDeDibujo[nombre].censo.MTEXT, 1, `${nombre}: un rótulo dentro del bloque de dibujo`);

  // Y el lector ya no entrega ninguno suelto. Hasta el 2026-09-05 sacaba a
  // espacio modelo el MTEXT de dentro del bloque de dibujo de cada cota, en el
  // mismo punto y con la misma altura con que la propia cota recalcula y dibuja
  // su número: el rótulo quedaba escrito DOS VECES, uno encima del otro, y
  // ningún aviso lo mencionaba. Nueve entidades donde el oráculo contaba siete.
  const sueltos = informeCotas.document.entities.filter((entidad) => entidad.type === "mtext") as unknown as Array<{
    text: string;
    insertion: { x: number; y: number };
    height: number;
    width: number;
    alignment: string;
  }>;
  eq(sueltos.length, 0, "el lector no entrega ningún MTEXT de espacio modelo que el remitente no pusiera ahí");
  eq(informeCotas.importedEntityCount, 7, "siete entidades, las mismas que cuenta el oráculo");
  eqMagnitud(
    informeCotas.importedEntityCount,
    Object.values(bCotas.espacioModelo as Record<string, number>).reduce((suma, n) => suma + n, 0),
    "el lector y el oráculo B cuentan el mismo espacio modelo",
  );

  // La comprobación que impide que vuelva: para cada cota, el punto donde ELLA
  // dibuja su rótulo no puede tener además un MTEXT suelto con ese número.
  const nuestras = informeCotas.document.entities.filter((entidad) => entidad.type === "dimension") as unknown as CadDimensionEntity[];
  for (const cota of nuestras) {
    const geo = buildCadDimensionGeometry(cota)!;
    const encima = sueltos.find(
      (fila) => Math.abs(fila.insertion.x - geo.textAnchor.x) < 1e-6 && Math.abs(fila.insertion.y - geo.textAnchor.y) < 1e-6,
    );
    ok(
      encima === undefined,
      `la cota dibuja su rótulo en (${geo.textAnchor.x}, ${geo.textAnchor.y}) y ahí NO hay ningún MTEXT suelto repitiendo el número`,
    );
  }
  // Y el rótulo del remitente sigue existiendo donde tiene que existir: dentro
  // del bloque de dibujo que el oráculo B ve. No se ha borrado nada; ha dejado
  // de salir dos veces.
  for (const nombre of bloques) {
    const dentro = bCotas.bloquesDeDibujo[nombre].mtext![0];
    ok(
      !sueltos.some((entidad) => entidad.text === dentro.texto),
      `el rótulo «${dentro.texto}» de ${nombre} ya no sale suelto a espacio modelo`,
    );
    duplicados.push({ texto: dentro.texto, bloqueDeDibujo: nombre, en: dentro.insercion });
  }
  eq(sueltos.length, TECHO_ROTULOS_DUPLICADOS, "el techo de rótulos duplicados sólo puede bajar");
}

// ============================ SOMBREADO ======================================
const informeSombra = importDocumentText("hatches.dxf", SOMBRA.texto);
const sombreado = { patron: "", aristas: 0, todasRectas: false, verticesEquivalentes: 0 };
{
  // Los dos oráculos, y lo que los separa.
  eqMagnitud(bSombra.espacioModelo, { HATCH: 1, LINE: 4 }, "el oráculo B ve el HATCH y las cuatro líneas");
  const a = new DxfParser().parseSync(SOMBRA.texto) as { entities: Array<{ type: string }> } | null;
  eqMagnitud(
    porTipo(a?.entities ?? []),
    { LINE: 4 },
    "el oráculo A ve SÓLO las cuatro líneas: es ciego al HATCH, y con él solo «no hay» y «se perdió» serían lo mismo",
  );

  const h = bSombra.sombreados[0];
  sombreado.patron = h.patron;
  eqMagnitud(h.patron, "gost_non-metal", "el patrón que el remitente eligió");
  eqMagnitud(h.relleneSolido, false, "no es relleno sólido: es un patrón de rayado");
  const contorno = h.contornos[0];
  eqMagnitud(contorno.esPolilinea, false, "su contorno NO es una polilínea: es una ruta de aristas (bandera 2 apagada)");
  sombreado.aristas = contorno.aristas!.length;
  sombreado.todasRectas = contorno.aristas!.every((arista) => arista.clase === "LineEdge");
  sombreado.verticesEquivalentes = contorno.verticesEquivalentes!.length;
  eq(sombreado.aristas, 4, "cuatro aristas");
  ok(sombreado.todasRectas, "y las cuatro son RECTAS: un contorno así es un polígono, no una curva");
  eq(sombreado.verticesEquivalentes, 4, "cuyos vértices el oráculo publica ya calculados");

  // Lo que hace el lector. Hasta el 2026-09-05 veía el sombreado —lo lee por su
  // cuenta sobre los pares crudos, que es como no depende del oráculo A— y lo
  // DECLARABA perdido con `hatch_unsupported_boundary`, porque sólo sabía
  // reconstruir contornos escritos como polilínea. El detalle que lo hacía
  // incómodo: las cuatro LINE que el remitente dibujó ENCIMA sí entraban, y son
  // exactamente el mismo cuadrado, así que el documento tenía la forma y no
  // tenía el relleno. P-evidencia-14 reconstruye el contorno cuando todas sus
  // aristas son rectas, que es cuando es un polígono.
  eq(informeSombra.importedEntityCount, 5, "el lector trae las cuatro líneas Y el sombreado");
  eqMagnitud(porTipo(informeSombra.document.entities), { hatch: 1, line: 4 }, "el sombreado entra, con su patrón");
  const avisos = informeSombra.warnings.filter((aviso) => aviso.code === "hatch_unsupported_boundary");
  eq(avisos.length, TECHO_SOMBREADOS_PERDIDOS, "no declara ningún sombreado perdido; el techo sólo puede bajar");
  ok(informeSombra.dxfReport?.hasLosses === false, "y el informe puede decir «entró completo» sin mentir");
  ok(
    sombreado.todasRectas,
    "el contorno son cuatro segmentos rectos, o sea un polígono: por eso se puede reconstruir sin saber de curvas",
  );

  // La comprobación que ata el arreglo al testigo: el contorno que el lector
  // reconstruyó, las cuatro aristas que midió el oráculo B y las cuatro líneas
  // que el remitente dibujó encima tienen que ser el MISMO cuadrado, arista por
  // arista. Antes esta comparación se hacía contra el contorno DESCARTADO.
  const clavesB = new Set(bSombra.lineas.map((linea) => claveSegmentoB(linea.de, linea.a)));
  for (const entidad of informeSombra.document.entities) {
    if (entidad.type !== "line") continue;
    const linea = entidad as unknown as { start: { x: number; y: number }; end: { x: number; y: number } };
    const clave = claveSegmentoB([linea.start.x, linea.start.y], [linea.end.x, linea.end.y]);
    ok(clavesB.has(clave), `la línea ${clave} no está en lo que midió el oráculo B`);
    contador.magnitudes += 1;
  }
  const clavesContorno = new Set(
    contorno.aristas!.map((arista) => claveSegmentoB(arista.de, arista.a)),
  );
  eqMagnitud(
    [...clavesContorno].sort(),
    [...clavesB].sort(),
    "el contorno del oráculo y las cuatro líneas son el MISMO cuadrado",
  );
  const nuestroHatch = informeSombra.document.entities.find((entidad) => entidad.type === "hatch") as unknown as {
    boundaries: Array<Array<{ x: number; y: number }>>;
  };
  const anillo = nuestroHatch.boundaries[0];
  eq(anillo.length, 4, "el sombreado entra con sus cuatro vértices");
  const clavesNuestras = new Set(
    anillo.map((punto, indice) =>
      claveSegmentoB([punto.x, punto.y], [anillo[(indice + 1) % anillo.length].x, anillo[(indice + 1) % anillo.length].y]),
    ),
  );
  eqMagnitud(
    [...clavesNuestras].sort(),
    [...clavesB].sort(),
    "y el cuadrado que reconstruye el lector es, arista por arista, el que midió el oráculo B",
  );
}

// --- el renglón del artefacto compartido -----------------------------------
publicaRenglon({
  fila: "dimensions-hatch",
  filasDeLaRubrica: ["dimensions", "hatch"],
  spec: ESPEC,
  archivosAjenos: [
    { id: COTAS.id, sha256: COTAS.sha256, bytes: COTAS.bytes, dialecto: COTAS.b.dialecto },
    { id: SOMBRA.id, sha256: SOMBRA.sha256, bytes: SOMBRA.bytes, dialecto: SOMBRA.b.dialecto },
  ],
  loQueAfirmaLaFila:
    "Cotas asociativas y HATCH asociativo: que una cota de otro programa llega con su medida y que un sombreado ajeno llega con su relleno.",
  loQueDicenLosOraculos: {
    cotas: bCotas.cotas.map((cota) => ({
      medida: cota.medida,
      puntoDeTexto: cota.puntoDeTexto,
      bloqueDeDibujo: cota.bloqueDeDibujo,
      textoDelUsuario: cota.textoDelUsuario,
    })),
    dondeViveElRotuloDeLaCota: "dentro del bloque de dibujo (*D1, *D2), no en espacio modelo",
    sombreado: {
      patron: sombreado.patron,
      contorno: "ruta de aristas, no polilínea",
      aristas: sombreado.aristas,
      todasRectas: sombreado.todasRectas,
      verticesEquivalentes: sombreado.verticesEquivalentes,
    },
    elOraculoANoVeElHatch: true,
  },
  loQueHaceElLector: {
    cotas: {
      traidas: 2,
      medidasRecalculadas: medidas,
      degradacionDeclarada: "foreign_dimension_detached (2): entran vivas pero desligadas del dibujo",
      rotulosDuplicados: duplicados,
    },
    sombreado: {
      loVe: true,
      loImporta: false,
      codigo: "hatch_unsupported_boundary",
      fidelidad: "lost",
      motivo: "sólo se reconstruyen los contornos escritos como POLILÍNEA (bit 2 del código 92); éste viene como ruta de aristas",
      lineasDelContornoQueSiEntran: 4,
    },
  },
  hallazgos: [
    {
      id: "rotulo-de-cota-escrito-dos-veces",
      que:
        "ARREGLADO el 2026-09-05 (P-evidencia-11). El lector resuelve la cota por sus puntos y vuelve a dibujar su rótulo, que es lo correcto; pero además sacaba el MTEXT de dentro del bloque de dibujo (*D1, *D2) y lo entregaba como entidad suelta de espacio modelo, en el mismo punto y con la misma altura, así que el número quedaba escrito dos veces, uno encima del otro. Nueve entidades donde el remitente puso siete, y ningún aviso lo mencionaba. Hoy el escaneo crudo sabe en qué sección está: el lector entrega SIETE, las mismas que cuenta el oráculo, y ningún punto de rótulo tiene un MTEXT suelto encima.",
      silencioso: false,
      peticion: null,
    },
    {
      id: "contorno-de-aristas-rectas-descartado",
      que:
        "ARREGLADO el 2026-09-05 (P-evidencia-14). El sombreado se perdía porque su contorno viene como ruta de ARISTAS y sólo se reconstruían las polilíneas; la pérdida se declaraba —eso estaba bien— pero era evitable, porque las cuatro aristas son rectas y eso es un polígono. Las cuatro LINE que el remitente dibujó encima sí entraban, así que el documento tenía la forma y no el relleno. Hoy el sombreado entra con sus cuatro vértices, y son arista por arista el mismo cuadrado que midió el oráculo. Un contorno con arcos o splines sigue sin entrar, y se sigue declarando.",
      silencioso: false,
      peticion: null,
    },
    {
      id: "lo-que-si-viaja",
      que:
        "Las dos cotas ajenas llegan con sus puntos de definición, su punto de texto y su desplazamiento, y el producto RECALCULA sus dos medidas (80 y 30) dando los mismos números que ezdxf. La degradación de asociatividad va declarada con su código y su estado en la entidad.",
      silencioso: false,
      peticion: null,
    },
  ],
  veredicto: "servible_hoy",
  porQueEseVeredicto:
    "Las dos filas tenían testigo ajeno y las dos oían un no; los tres defectos que lo causaban están arreglados y guardados por esta misma suite. `hatch`: el sombreado ajeno entra con su contorno reconstruido y el que exportamos lo abre ya un lector estricto (P-evidencia-07: ezdxf lee el fichero entero con cero errores de auditoría). `dimensions`: la medida viajaba bien y ahora además cada cota llega con su número escrito UNA vez. Lo que sigue sin atestiguar nadie de fuera está en `loQueNoSeMide`, no en un defecto.",
  loQueNoSeMide:
    "La ASOCIATIVIDAD de verdad: ninguna de las dos cotas ajenas entra asociada, así que «cota que sigue midiendo al mover el muro» no lo atestigua este material. Del sombreado no se mide el patrón dibujado ni las islas: el único HATCH ajeno del corpus tiene un contorno y ninguna isla. Tampoco se mide el espacio papel.",
});

console.log(
  `cota y sombreado ajenos: ${contador.comprobaciones} comprobaciones · ${contador.magnitudes} datos del dibujo ` +
    "contrastados contra ezdxf 1.4.4 sobre una cota y un sombreado que no escribimos",
);
console.log(
  `  · la cota ajena llega con su número escrito UNA vez (${TECHO_ROTULOS_DUPLICADOS} rótulos duplicados, eran 2) ` +
    `y el sombreado de contorno por aristas entra con sus cuatro vértices (${TECHO_SOMBREADOS_PERDIDOS} sombreados perdidos, era 1).`,
);
