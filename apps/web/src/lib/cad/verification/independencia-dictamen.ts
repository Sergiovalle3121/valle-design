/**
 * EL DICTAMEN DEL CENSO DE INDEPENDENCIA: la parte que no se calcula.
 *
 * `independencia-rubrica.spec.ts` genera el censo entero desde
 * `scripts/cad/rubric.mjs` —qué filas retienen 1 pt, cuánto valen, qué
 * criterios tienen concedidos— porque eso es aritmética y la regla 4 de la
 * campaña de cimientos prohíbe copiarla a mano. Lo que no se puede calcular es
 * el JUICIO: cuál de los criterios ya concedidos es el candidato natural a
 * cargar la evidencia independiente, qué dice el testigo ajeno sobre él, y si
 * el material de terceros que hay en el árbol puede servirlo o hace falta otra
 * cosa. Eso vive aquí, escrito a mano y con nombre.
 *
 * Está en un módulo aparte por el presupuesto de monolito (800 líneas por
 * archivo no presupuestado), y la costura es la correcta: al otro lado queda
 * el motor, que no sabe nada de estas filas en concreto.
 *
 * El spec lo ata por los dos lados: una fila con tope sin dictamen falla, y un
 * dictamen de una fila que ya no tiene tope, también. Y rechaza cualquier
 * parche que marque `independent: true` sobre una ruta que no esté en
 * `FUENTES_INDEPENDIENTES`.
 */

export const FUENTES_INDEPENDIENTES: Record<string, string> = {
  "docs/cad/corpus/manifest.json":
    "Diecinueve DXF de dos bibliotecas MIT (bjnortier/dxf y gdsestimating/dxf-parser) con sus licencias descargadas y hasheadas. Material que este proyecto NO escribió.",
  "docs/cad/evidence/dxf-corpus-terceros-matrix.json":
    "Cuarenta filas por entidad sobre esos diecinueve archivos, con el veredicto de DOS oráculos ajenos (dxf-parser y ezdxf 1.4.4). Los números los ponen ellos; nosotros ponemos la tabla.",
  "apps/web/src/lib/cad/verification/terceros-jornada.spec.ts":
    "La jornada entera sobre bjnortier-dxf/floorplan.dxf: 3.065 magnitudes comparadas una a una contra ezdxf sobre los mismos bytes, y la relectura de lo exportado con dxf-parser. Sin los dos lectores ajenos, este spec no afirma nada.",
  "apps/web/src/lib/cad/verification/z-frontiers.spec.ts":
    "Cada frontera de la cota se cierra leyendo el DXF con dxf-parser, un lector de terceros que no conoce las convenciones del producto. El propio texto del criterio ya lo dice: «lector de terceros como oráculo».",
  "apps/web/src/lib/cad/verification/oraculos-externos.spec.ts":
    "524 magnitudes del sólido —163 vértices con sus coordenadas, 311 longitudes de arista y los recuentos de la parte 21— comparadas contra lo que steputils 0.1 (MIT) leyó en el STEP que exportamos. Sin ese lector ajeno, este spec no afirma nada del 3D.",
  "docs/cad/corpus/oraculos/steputils-0.1.json":
    "La lectura congelada de steputils 0.1 sobre los cinco sólidos exportados, anclada al sha256 de esos bytes. Los números los pone él; nosotros ponemos el ancla que impide que sigan pareciendo evidencia cuando el exportador cambie.",
};

/**
 * Lo que NO entra en la lista, escrito para que se vea la frontera.
 *
 * No es decorativo: el spec comprueba abajo que ninguna de estas rutas se cuela
 * en un parche. La primera es la importante — el oráculo por fuerza bruta de
 * `verification/oracle.ts` verifica de verdad y lo escribimos nosotros.
 */
export const NO_SON_INDEPENDIENTES: Record<string, string> = {
  "apps/web/src/lib/cad/verification/oracle.ts":
    "Oráculo por fuerza bruta escrito por este proyecto. Verifica de verdad (fórmula cerrada contra muestreo), y por eso mismo es la tentación: marcarlo independiente convertiría «lo comprobamos aparte» en «lo comprobó otro».",
  "docs/cad/evidence/dxf-external-corpus-matrix.json":
    "Su primera línea dice `corpusSintetico: true`: los archivos los genera `dxf-external-corpus.ts` para IMITAR dialectos ajenos. Imitar un dialecto no es haberlo recibido. Hoy está marcado `independent: true` en `dxf.corpus-external` y es la única marca de independencia del lado DXF; P-evidencia-04 la sustituye por el corpus real.",
  "apps/web/src/lib/cad/verification/prueba-de-despacho.spec.ts":
    "El «plano ajeno» de esa prueba lo siembra la propia prueba (`planta-mal-empatada.ts`). Es una buena prueba y no es material de terceros.",
};

/** Vocabulario de veredictos. Cuatro, y ninguno significa «ya veremos». */
export const VEREDICTOS = [
  // Hay un testigo ajeno en el árbol, ya verifica, y DICE QUE SÍ sobre el
  // criterio candidato. El parche exacto va escrito y su efecto está medido.
  "servible_hoy",
  // Hay un testigo ajeno en el árbol y DICE QUE NO. El punto vuelve cuando el
  // defecto que midió se arregle, no antes; la petición que lo arregla va con
  // nombre.
  "bloqueado_por_defecto_medido",
  // El material ajeno del árbol no llega hasta aquí. Lo que sí llegaría está
  // nombrado, y es alcanzable: el reconocimiento comprobó que PyPI, npm y
  // crates.io responden.
  "el_corpus_de_hoy_no_lo_alcanza",
  // Ningún fichero de terceros puede atestiguar esto. La pata que falta de la
  // regla del corte es la tercera: un usuario real.
  "no_lo_sirve_material_ajeno",
] as const;
export type Veredicto = (typeof VEREDICTOS)[number];

export type EntradaDeEvidencia = {
  kind: string;
  path: string;
  independent?: true;
};

export type Parche = {
  /** El criterio al que se le añade o se le marca la evidencia. */
  criterio: string;
  /** `anadir` mete entradas nuevas; `marcar` pone la bandera en una que YA está. */
  operacion: "anadir" | "marcar";
  evidencia: EntradaDeEvidencia[];
};

export type Dictamen = {
  candidato: string;
  porQueEseCandidato: string;
  veredicto: Veredicto;
  /** Qué vio el testigo ajeno. Con números, o no es un testimonio. */
  loQueDiceElTestigo: string;
  /** Obligatorio en `servible_hoy`: hasta dónde llega el parche y hasta dónde no. */
  limiteDelParche?: string;
  /** Obligatorio en los otros tres: qué haría falta, en concreto. */
  loQueFaltaria?: string;
  parche?: Parche;
  peticion?: string;
};

/* ══════════════════════════════════════════════════════════════════════════
 * EL DICTAMEN, FILA POR FILA
 *
 * Esto es lo único escrito a mano del censo, porque es juicio. Todo lo demás
 * —puntos, criterios concedidos, clases de evidencia, cuántas filas hay— sale
 * de `scoreRubric` sobre el árbol de hoy.
 * ══════════════════════════════════════════════════════════════════════════ */
export const DICTAMENES: Record<string, Dictamen> = {
  /* ── CINCO DICTÁMENES RETIRADOS EL 2026-09-05, POR SERVIDOS ─────────────
   * `draw-2d`, `foreign-work`, `blocks`, `modeling3d` y `growth` tenían aquí su
   * dictamen «servible_hoy» con su parche escrito y medido. El coordinador los
   * APLICÓ a `docs/competitive/rubric.json` en la ventana 3 y sus cinco filas
   * dejaron de retener el punto: 233/271 → 238/271, y de 5 a 15 puntos con
   * evidencia INDEPENDIENTE. Cinco filas llegan a su tope por primera vez.
   *
   * Salen de aquí porque este censo describe las filas que TODAVÍA lo retienen,
   * y el propio spec lo exige por los dos lados: un dictamen de una fila sin
   * tope hace fallar el censo con «está describiendo un árbol que no es éste».
   * Tenía razón, y por eso se retiran en vez de relajar la aserción.
   *
   * El razonamiento no se pierde: vive entero en
   * `docs/execution/frentes/evidencia-peticiones.md` (P-evidencia-05, con el
   * testigo y el límite de cada parche) y en las entradas `independent: true`
   * que ahora lleva la rúbrica.
   */
  /* ── Las seis que se pueden servir hoy ───────────────────────────────── */

  dimensions: {
    candidato: "dimensions.dxf",
    porQueEseCandidato:
      "Es el criterio de ida y vuelta por DXF, y la ida y vuelta de las 63 cotas del plano ajeno está medida a los dos lados con lectores que no son nuestros.",
    // CAMBIÓ EL 2026-09-05, y el cambio va explicado porque baja el total que
    // este mismo censo publicó ayer. La jornada midió que las 63 medidas de
    // cota sobreviven el viaje, y eso sigue siendo verdad. Lo que no sabía es
    // lo que destapó `terceros-cota-sombreado.spec.ts` sobre un fichero de dos
    // cotas: cada cota ajena llega con su rótulo escrito DOS VECES —el que la
    // cota dibuja sola y el MTEXT que el lector saca del bloque de dibujo, en
    // el mismo punto y con la misma altura— y ningún aviso lo menciona.
    //
    // Conceder el tope de «Cotas asociativas» encima de un defecto silencioso
    // medido sobre el objeto propio de la fila es exactamente lo que este censo
    // le negó a `layers` y a `integrity`. Aplicárselo a unas filas y no a otras
    // sería peor que no tener regla.
    veredicto: "bloqueado_por_defecto_medido",
    loQueDiceElTestigo:
      "La MEDIDA viaja bien y está medida dos veces: ezdxf lee 63 DIMENSION en el plano ajeno y da sus 63 medidas, nuestro lector trae las 63, el exportador las escribe y dxf-parser las reencuentra en el código 42 dentro de 1,5e-6 por segmento; sobre dimensions.dxf, ezdxf mide 80 y 30 y el producto recalcula 80 y 30. Pero el mismo testigo dice que cada cota ajena llega con su número escrito dos veces: nueve entidades donde ezdxf cuenta siete, porque el MTEXT del bloque de dibujo (*D1, *D2) sale además como entidad suelta en el punto del rótulo. Sin un aviso.",
    loQueFaltaria:
      "Aplicar P-evidencia-11 (dar sección al escaneo crudo de MTEXT, para que un MTEXT de dentro de un BLOCK deje de salir a espacio modelo). Cuando eso entre, el parche vuelve a ser el de ayer —`terceros-jornada.spec.ts` como evidencia `independent: true` en `dimensions.dxf`— y hay que sumarle `terceros-cota-sombreado.spec.ts`. La otra mitad del límite sigue en pie y no la arregla nadie: la XDATA propietaria (AXOS_DIM) que el criterio nombra no la atestigua ningún fichero ajeno, porque no puede traerla.",
    peticion: "P-evidencia-11",
  },

  hatch: {
    candidato: "hatch.dxf",
    porQueEseCandidato:
      "Es el criterio de ida y vuelta de HATCH, y es justo el que el segundo oráculo destapó roto.",
    veredicto: "bloqueado_por_defecto_medido",
    loQueDiceElTestigo:
      "La ida está bien: los 26 sombreados de floorplan.dxf entran intactos y ezdxf cuenta los mismos 26. La vuelta NO: `ezdxf` 1.4.4 revienta al abrir lo que exportamos (`IndexError` en `polygon.py:81`) porque nuestros HATCH salen sin `100 AcDbEntity` ni `100 AcDbHatch` aunque la cabecera declare AC1015, dialecto donde esos marcadores son obligatorios. Ni en modo `recover` lo abre.",
    loQueFaltaria:
      "Aplicar P-evidencia-07 (dos pares de códigos en `dxf-export-hatch.ts`). El arreglo está PROBADO antes de pedirlo: parcheando 170 entidades sobre el texto ya exportado, ezdxf abre el fichero entero y audita cero errores. Cuando eso entre, este parche pasa a `servible_hoy` con `terceros-jornada.spec.ts`.",
    peticion: "P-evidencia-07",
  },

  mtext: {
    candidato: "mtext.dxf",
    porQueEseCandidato:
      "Su texto dice «en los dos sentidos», y hoy un lector estricto sólo puede recorrer uno.",
    veredicto: "bloqueado_por_defecto_medido",
    loQueDiceElTestigo:
      "Los 144 MTEXT de floorplan.dxf entran intactos y los dos oráculos cuentan 144; MTEXT es además el tipo mejor cubierto del corpus, intacto en siete archivos de las dos fuentes. Pero `ezdxf` rechaza nuestro fichero exportado con «missing 'AcDbMText' subclass in MTEXT(#None)». El oráculo A no lo veía porque es tolerante: hizo falta el segundo.",
    loQueFaltaria:
      "Aplicar P-evidencia-07 (los mismos dos pares de códigos, en `dxf-export.ts`). Marcar hoy este criterio independiente sería cobrar «viaja en los dos sentidos» con un lector ajeno diciendo que no viaja de vuelta.",
    peticion: "P-evidencia-07",
  },

  layers: {
    candidato: "layers.canonical",
    porQueEseCandidato:
      "Es el criterio del mapa DXF de capas, y la jornada midió ese mapa sobre una tabla LAYER ajena de 24 entradas.",
    veredicto: "bloqueado_por_defecto_medido",
    loQueDiceElTestigo:
      "Son DOS defectos, y el segundo se midió el 2026-09-05 y es peor. (1) La poda: 24 capas declaradas en el plano ajeno, 17 en el documento, 23 en el fichero que devolvemos; no vuelven `Defpoints` ni `View Port`, las dos con causa conocida y daño cero al dibujo, pero ningún aviso lo menciona. (2) EL COLOR: el importador reparte una paleta de cinco por posición alfabética y descarta el código 62 —que ya viene leído en `colorIndex`—, y el exportador escribe `62 7` en todas, así que el dibujo del remitente vuelve MONOCROMO. Sobre las 24 capas de floorplan.dxf, 4 índices ACI que el remitente usó en varias capas salen de colores distintos y los 5 colores de la paleta juntan cada uno capas de índices distintos. El informe dice «Entró completo, sin pérdidas».",
    loQueFaltaria:
      "Aplicar P-evidencia-12 (usar `colorIndex` con `aciToHex`, que ya está en el árbol, y rellenar `color` al exportar; el viaje ACI→hex→ACI está PROBADO sobre los doce índices que este corpus usa) y P-evidencia-09 (el aviso `layer_table_pruned`). Conceder hoy el tope de «Capas y propiedades» con dos pérdidas silenciosas medidas encima —una de ellas el color entero del dibujo— sería el caso exacto que la regla del corte inventó para impedir.",
    peticion: "P-evidencia-12",
  },

  integrity: {
    candidato: "integrity.no-silent-loss",
    porQueEseCandidato:
      "«Ninguna pérdida es silenciosa» es la afirmación que la matriz mide de frente: `perdidosEnSilencio` es su cifra de cabecera.",
    veredicto: "bloqueado_por_defecto_medido",
    loQueDiceElTestigo:
      "La matriz mide 0 pérdidas en silencio en 40 filas de 19 archivos ajenos con dos oráculos: todo lo que no llega, se avisa. Pero su ámbito son los TIPOS DE ENTIDAD, y fuera de ese ámbito ya van TRES pérdidas silenciosas medidas sobre material ajeno: siete capas declaradas de la tabla LAYER que no llegan al documento (P-evidencia-09), el COLOR de todas las capas del remitente, que ni se lee ni se escribe (P-evidencia-12), y el MTEXT de dentro de un bloque, que sale a espacio modelo sin la transformación acumulada y duplica el rótulo de cada cota ajena (P-evidencia-11). Ninguna la nombra un aviso.",
    loQueFaltaria:
      "Aplicar P-evidencia-09. La cifra de cabecera de la matriz es buena y este frente la firma; conceder con ella el tope de la fila que se llama «Integridad: el producto hace lo que dice», mientras el propio frente publica una pérdida silenciosa medida, sería la contradicción más cara del censo.",
    peticion: "P-evidencia-09",
  },

  layouts: {
    candidato: "layouts.fidelity",
    porQueEseCandidato:
      "Es el único criterio de la fila cuya verdad vive en BYTES que otro programa puede leer: los del PDF publicado.",
    veredicto: "el_corpus_de_hoy_no_lo_alcanza",
    loQueDiceElTestigo:
      "Del lado DXF el corpus dice que no: las 3 VIEWPORT de floorplan.dxf constan como pérdida declarada, porque el lector excluye el espacio papel a propósito. La fidelidad de ploteo, en cambio, la mide hoy `plot-fidelity-slo.json`, que escribimos nosotros leyendo un PDF que también escribimos nosotros.",
    loQueFaltaria:
      "Un lector de PDF de terceros (`pypdf` o `pdfminer.six` en PyPI, o `mutool` de MuPDF) que abra los bytes publicados y mida la escala por su cuenta. Es alcanzable —el reconocimiento comprobó que PyPI responde y bajó ezdxf por ese camino— y el patrón ya existe en este frente: oráculo congelado con su sha256, como el censo de ezdxf.",
  },

  "annotation-extras": {
    candidato: "annotation-extras.mleader",
    porQueEseCandidato:
      "Es el criterio con entidad y asociatividad; el resto de la fila son comandos tecleables, que ningún fichero ajeno puede atestiguar.",
    veredicto: "el_corpus_de_hoy_no_lo_alcanza",
    loQueDiceElTestigo:
      "Lo que el corpus dice de las directrices es lo contrario de lo que haría falta: las 6 LEADER de floorplan.dxf constan como pérdida DECLARADA —el lector no las trae— y ninguno de los diecinueve archivos trae MLEADER ni ACAD_TABLE.",
    loQueFaltaria:
      "Primero la capacidad (importar LEADER), y sólo después el testigo. Un corpus ajeno con MLEADER exige ficheros guardados por un programa que los escriba, y las dos bibliotecas MIT del corpus no los tienen entre sus ficheros de prueba.",
  },

  /* ── Las que el material ajeno del árbol no alcanza ──────────────────── */

  "command-line": {
    candidato: "command-line.alias-table",
    porQueEseCandidato:
      "Es el único criterio de la fila cuya verdad la fija un documento de fuera: la tabla acad.pgp.",
    veredicto: "el_corpus_de_hoy_no_lo_alcanza",
    loQueDiceElTestigo:
      "Nada: el corpus es de dibujos, no de configuración. La tabla de alias se compara hoy contra una copia que vive en el propio repositorio.",
    loQueFaltaria:
      "La autoridad de acad.pgp es Autodesk y el fichero viaja con AutoCAD: redistribuirlo es una decisión de derechos que no es de este frente. El camino limpio es un tercero libre que publique la misma tabla (LibreCAD y BricsCAD documentan sus equivalencias) y citarlo con su licencia, igual que se hizo con las dos MIT del corpus DXF.",
  },

  xrefs: {
    candidato: "xrefs.resolution",
    porQueEseCandidato:
      "Resolver una referencia externa exige el fichero que la contiene Y el fichero al que apunta; eso es lo que un corpus ajeno tendría que traer.",
    veredicto: "el_corpus_de_hoy_no_lo_alcanza",
    loQueDiceElTestigo:
      "floorplan.dxf declara cuatro capas con prefijo de xref, así que el plano ajeno SÍ nació con referencias externas — pero llegó solo. Sin los dibujos referenciados no hay nada que resolver.",
    loQueFaltaria:
      "Un conjunto ajeno completo: el dibujo y sus referencias. Ninguna de las dos bibliotecas MIT publica uno; el procedimiento de donación existe (`docs/DONACIONES.md` del repositorio de conformidad) y el donante no.",
  },

  "json-import": {
    candidato: "json-import.fuzzing",
    porQueEseCandidato:
      "Es el único criterio de la fila donde un tercero puede aportar algo: el formato canónico JSON lo definimos nosotros, así que por construcción nadie ajeno escribe uno.",
    veredicto: "el_corpus_de_hoy_no_lo_alcanza",
    loQueDiceElTestigo:
      "Nada, y no por descuido: un documento canónico de terceros no puede existir mientras el esquema sea nuestro. El corpus hostil de hoy lo genera la propia suite.",
    loQueFaltaria:
      "Un fuzzer de terceros (radamsa, o `atheris`/`hypothesis` en PyPI) que mute los documentos y decida él qué entradas probar. La independencia posible aquí no es del MATERIAL sino del generador.",
  },

  "api-sdk": {
    candidato: "api-sdk.contract",
    porQueEseCandidato:
      "Un contrato OpenAPI es exactamente la clase de cosa que un tercero puede juzgar sin saber nada del producto.",
    veredicto: "el_corpus_de_hoy_no_lo_alcanza",
    loQueDiceElTestigo:
      "Nada: hoy el contrato lo valida `scripts/cad/check-design-contract.mjs`, que es nuestro, contra el SDK que generamos nosotros desde el mismo YAML.",
    loQueFaltaria:
      "Un validador de OpenAPI de terceros sobre `design-api.v1.yaml` (`openapi-spec-validator` en PyPI, o Redocly/Spectral en npm), congelando su dictamen como artefacto igual que el censo de ezdxf. Alcanzable hoy: los tres registros responden.",
  },

  events: {
    candidato: "events.operational",
    porQueEseCandidato:
      "Es el criterio que habla de un receptor, y un receptor ajeno es precisamente lo que lo haría independiente.",
    veredicto: "el_corpus_de_hoy_no_lo_alcanza",
    loQueDiceElTestigo:
      "Nada: `webhook-replay-audit.json` lo produce este proyecto, con el emisor y el receptor de este proyecto a los dos lados del cable.",
    loQueFaltaria:
      "Verificar la firma `X-Valle-Signature` con una implementación de HMAC ajena (la de la librería estándar de Python, por ejemplo) sobre `timestamp + \".\" + rawBody` capturado, y congelar ese dictamen. Es el mismo patrón del oráculo B y cuesta poco.",
  },

  "object-storage": {
    candidato: "object-storage.s3",
    porQueEseCandidato:
      "El adaptador S3 habla con un servidor que no es nuestro; ése es el testigo.",
    veredicto: "el_corpus_de_hoy_no_lo_alcanza",
    loQueDiceElTestigo:
      "Nada: hoy el criterio se sostiene en que el fichero del adaptador existe.",
    loQueFaltaria:
      "Correr el adaptador contra un MinIO real (AGPL, imagen pública) y publicar qué guardó y qué devolvió. MinIO es software ajeno juzgando nuestro cliente, que es la definición del oráculo externo.",
  },

  brep: {
    candidato: "brep.interop",
    porQueEseCandidato:
      "STEP e IGES son formatos normalizados con lectores ajenos maduros; es el único criterio de la fila que sale del proyecto.",
    veredicto: "servible_hoy",
    loQueDiceElTestigo:
      "El 2026-09-05 apareció el testigo que esta misma entrada pedía por su nombre. `steputils` 0.1 (MIT, PyPI) —un analizador de la parte 21 que no comparte una línea con `step-export.ts`— lee los cinco sólidos que exportamos y CUENTA lo mismo que el kernel: 163 vértices uno a uno con sus coordenadas, 311 longitudes de arista, y los VERTEX_POINT / EDGE_CURVE / ORIENTED_EDGE / ADVANCED_FACE / CLOSED_SHELL / MANIFOLD_SOLID_BREP de cada fichero. Y con SUS números, no con los nuestros, sale la característica de Euler-Poincaré de los cinco: género 0 en la caja y el tetraedro, género 1 en la caja con agujero pasante, en el tubo de revolución y en la placa nacida de una booleana. Hasta ese día el único lector que había leído nuestro STEP era el nuestro.",
    limiteDelParche:
      "Tres límites, y ninguno se tapa. (1) El criterio se llama «STEP e IGES en los dos sentidos» y el oráculo sólo cubre STEP: para IGES no se encontró lector ajeno con licencia admisible, así que esa mitad sigue sin testigo. (2) `steputils` es un ANALIZADOR, no un kernel: confirma que el fichero es parte 21 válida y que su topología cierra, no que un CAD mecánico comercial reconstruya el sólido — el que lo haría, `pythonocc-core`, es LGPL y CORPUS_POLICY.md lo prohíbe. (3) ADR-0016 sigue en pie: el sólido es FACETADO, así que lo que el lector ajeno confirma es la faceta, no la superficie que la generó.",
    parche: {
      criterio: "brep.interop",
      operacion: "anadir",
      evidencia: [
        {
          kind: "spec",
          path: "apps/web/src/lib/cad/verification/oraculos-externos.spec.ts",
          independent: true,
        },
        {
          kind: "file",
          path: "docs/cad/corpus/oraculos/steputils-0.1.json",
          independent: true,
        },
      ],
    },
  },

  wasm: {
    candidato: "wasm.toolchain",
    porQueEseCandidato:
      "La paridad numérica es una comparación de números; un tercero puede emitir los de referencia.",
    veredicto: "el_corpus_de_hoy_no_lo_alcanza",
    loQueDiceElTestigo:
      "Nada de fuera. Y la lección de fondo ya está aprendida dentro: `curve-kernel-parity.spec.ts` dice con todas sus letras que comparar los dos motores entre sí «dice si se parecen, nunca cuál tiene razón», y por eso los hace caer a los dos sobre una referencia analítica cerrada. Lo que queda es que esa referencia también la escribimos aquí.",
    loQueFaltaria:
      "Un tercero de precisión arbitraria (`mpmath` en PyPI) que emita los valores de referencia de las mismas operaciones. No falta el método —está bien resuelto—: falta que el que calcule sea otro.",
  },

  geo: {
    candidato: "geo.crs",
    porQueEseCandidato:
      "La reproyección tiene una autoridad externa incontestable —PROJ y el registro EPSG— y es la fila donde más barato sale usarla.",
    veredicto: "el_corpus_de_hoy_no_lo_alcanza",
    loQueDiceElTestigo:
      "Nada de fuera, y conviene ser justo con lo que hay: `crs.spec.ts` NO se compara consigo misma. Contrasta la serie de Krüger contra dos caminos que no la usan —cuadratura de Gauss-Legendre de 24 nodos sobre el arco de meridiano, y la transversa de Mercator de Snyder (USGS Professional Paper 1395)—. Es la misma clase de honestidad que `verification/oracle.ts`, y tiene el mismo límite: quien calcula las dos veces somos nosotros.",
    loQueFaltaria:
      "`pyproj` (que envuelve PROJ, la implementación de referencia del mundo GIS) transformando el mismo juego de puntos, congelado como artefacto con su versión. Es el candidato más barato y más sólido de las veinticinco filas que no se sirven hoy: la fórmula ya está contrastada por dentro, sólo falta que el que la ejecute sea otro.",
  },

  /* ── Las que ningún fichero ajeno puede atestiguar ───────────────────── */

  persistence: {
    candidato: "persistence.real-e2e",
    porQueEseCandidato:
      "Es el criterio que ya sale del laboratorio (API y PostgreSQL de verdad); si algo de esta fila puede volverse independiente, empieza ahí.",
    veredicto: "no_lo_sirve_material_ajeno",
    loQueDiceElTestigo:
      "Nada, y no hay fichero que pueda decir algo: un DXF de terceros no atestigua una cola de un solo escritor ni un 409 resuelto.",
    loQueFaltaria:
      "La tercera pata de la regla del corte: un usuario real. Un documento de un despacho, guardado por una persona en una sesión que no montamos nosotros, con su historia de versiones. PostgreSQL es software ajeno pero no es un oráculo: no opina sobre si el CAS hizo lo correcto.",
  },

  review: {
    candidato: "review.concurrency",
    porQueEseCandidato:
      "Es el criterio que mide carga concurrente, lo más cercano a varias personas de verdad.",
    veredicto: "no_lo_sirve_material_ajeno",
    loQueDiceElTestigo:
      "Nada: los concurrentes de `review-concurrency.json` los simulamos nosotros.",
    loQueFaltaria:
      "Personas. Dos revisores ajenos sobre un enlace real, con su rastro. Es la fila donde el «usuario real» de la regla no tiene sustituto técnico.",
  },

  recognition: {
    candidato: "recognition.ribbon-order",
    porQueEseCandidato:
      "«Reconocimiento» es, literalmente, que alguien de fuera reconozca la herramienta; el orden de la cinta es su afirmación más comprobable.",
    veredicto: "no_lo_sirve_material_ajeno",
    loQueDiceElTestigo:
      "Nada: los goldens comprueban que la cinta es la que decidimos, no que a un dibujante venido de AutoCAD le resulte reconocible.",
    loQueFaltaria:
      "Un dibujante que no sea de aquí, sentado delante, con lo que encontró y lo que no. Ningún fichero sustituye eso, y es la fila más grande del censo (14 pt) que lo necesita.",
  },

  "toolset-architecture": {
    candidato: "toolset-architecture.envolvente",
    porQueEseCandidato:
      "WALL, DOOR y WINDOW son entidades paramétricas nuestras; el testigo tendría que ser alguien que dibuje con ellas.",
    veredicto: "no_lo_sirve_material_ajeno",
    loQueDiceElTestigo:
      "floorplan.dxf es una planta arquitectónica ajena de verdad, y precisamente por eso sirve para lo que sirve y no para esto: sus muros son líneas, no muros. Un DXF no puede traer un muro paramétrico.",
    loQueFaltaria:
      "Un arquitecto levantando una planta con WALL/DOOR/WINDOW y su cuadro de superficies, y el cuadro contrastado contra la medición de otro. Sin persona, no hay testigo.",
  },

  "toolset-mep": {
    candidato: "toolset-mep.trazado",
    porQueEseCandidato: "Mismo caso que Architecture: las entidades son nuestras.",
    veredicto: "no_lo_sirve_material_ajeno",
    loQueDiceElTestigo:
      "Nada. Ninguno de los diecinueve archivos ajenos trae instalaciones, y aunque las trajera llegarían como líneas y bloques.",
    loQueFaltaria:
      "Un proyectista de instalaciones y su plano, con las longitudes de la tabla contrastadas contra su presupuesto.",
  },

  "toolset-map3d": {
    candidato: "toolset-map3d.georreferencia",
    porQueEseCandidato:
      "Es la fila de toolsets con la autoridad externa más clara: EPSG y PROJ.",
    veredicto: "el_corpus_de_hoy_no_lo_alcanza",
    loQueDiceElTestigo:
      "Nada todavía, pero aquí sí hay material ajeno al alcance y es abundante: datos GIS públicos (Natural Earth es dominio público; INEGI publica marcos geoestadísticos) más `pyproj` como juez de la transformación.",
    loQueFaltaria:
      "Importar un shapefile público real y comprobar las coordenadas transformadas contra PROJ. Comparte oráculo con la fila `geo`, así que el mismo trabajo sirve para las dos.",
  },

  "toolset-raster": {
    candidato: "toolset-raster.vectorizacion",
    porQueEseCandidato:
      "La vectorización parte de una imagen, y una imagen ajena sí se puede conseguir con derechos limpios.",
    veredicto: "el_corpus_de_hoy_no_lo_alcanza",
    loQueDiceElTestigo:
      "Nada: el escaneo que vectoriza la suite lo genera la suite. Es la misma situación que tenía el corpus DXF antes del primer entregable de este frente.",
    loQueFaltaria:
      "Un plano escaneado de dominio público (los levantamientos HABS/HAER de la Library of Congress lo son) con su geometría conocida, y el resultado de la vectorización contrastado contra ella. Es el toolset más barato de volver independiente.",
  },

  "toolset-mechanical": {
    candidato: "toolset-mechanical.normalizados",
    porQueEseCandidato:
      "Una biblioteca de tornillería normalizada se puede contrastar contra la norma, que es de fuera.",
    veredicto: "el_corpus_de_hoy_no_lo_alcanza",
    loQueDiceElTestigo:
      "Nada: las medidas de la biblioteca las escribimos nosotros.",
    loQueFaltaria:
      "Contrastar las cotas contra una fuente ajena de las tablas. El texto de ISO y DIN es de pago y no se redistribuye —eso es una decisión de derechos, no técnica—, pero existe material libre equivalente (el banco de tornillería del taller Fasteners de FreeCAD, LGPL) que sí se puede citar y hashear como se hizo con las dos licencias MIT del corpus.",
  },

  "toolset-electrical": {
    candidato: "toolset-electrical.informes",
    porQueEseCandidato:
      "La revisión contra la NOM es la única afirmación de la fila cuya verdad la fija un documento externo.",
    veredicto: "el_corpus_de_hoy_no_lo_alcanza",
    loQueDiceElTestigo:
      "Nada: los límites contra los que revisamos el cuadro de cargas están escritos en nuestro código.",
    loQueFaltaria:
      "Anclar cada límite a su artículo de la NOM-001-SEDE publicada en el DOF —cita y fecha, no copia del texto, que es de la Secretaría— y que un electricista contraste un cuadro de cargas real. La primera mitad se puede hacer sin permiso de nadie; la segunda necesita persona.",
  },

  "toolset-plant3d": {
    candidato: "toolset-plant3d.pid",
    porQueEseCandidato:
      "Un P&ID ajeno con su lista de líneas sería el testigo perfecto, y son documentos que existen.",
    veredicto: "no_lo_sirve_material_ajeno",
    loQueDiceElTestigo:
      "Nada: el catálogo de equipos y la numeración de líneas salen de nuestro dibujo y se comprueban contra nuestras reglas.",
    loQueFaltaria:
      "Un P&ID de una planta real con su lista de líneas emitida por otro programa, para contrastar numeración y etiquetas. Es material industrial y casi siempre confidencial: la barrera aquí no es técnica.",
  },
};
