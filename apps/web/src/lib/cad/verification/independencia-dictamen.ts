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
  // Frente F10 (2026-09-06): seis oráculos más, cada uno con su censo
  // congelado en docs/cad/corpus/oraculos/ y su licencia hasheada.
  "apps/web/src/lib/geo/crs-pyproj.spec.ts":
    "PROJ (envuelto por pyproj 3.7.2, MIT) reproyecta la misma malla de control de México que crs.spec.ts genera con su propia fórmula. Sin PROJ, este spec no afirma nada.",
  "apps/web/src/lib/geo/shapefile-pyproj.spec.ts":
    "Un shapefile PÚBLICO de terceros (Natural Earth, dominio público) leído por el lector de producción y reproyectado contra PROJ; los derechos, en docs/cad/corpus/terceros-gis-manifest.json.",
  "apps/web/src/lib/cad/verification/api-sdk-openapi.spec.ts":
    "openapi-spec-validator 0.9.0 (Apache-2.0) dictamina design-api.v1.yaml contra el esquema OFICIAL de OpenAPI 3.1, no contra check-design-contract.mjs, que es nuestro.",
  "apps/web/src/lib/cad/verification/events-hmac.spec.ts":
    "La biblioteca estándar de Python recalcula HMAC-SHA256 desde cero y llega al mismo X-Valle-Signature que el emisor; otra implementación, otro lenguaje.",
  "apps/web/src/lib/cad/wasm/curve-kernel-mpmath.spec.ts":
    "mpmath (BSD-3-Clause) emite el teselado de arcos y elipses a 50 dígitos como referencia ABSOLUTA; el spec de paridad sólo comparaba JS↔WASM entre sí.",
  "apps/web/src/lib/cad/verification/json-import-atheris.spec.ts":
    "atheris (Google, Apache-2.0), un fuzzer guiado por cobertura ajeno, decide los documentos hostiles; el importador real los clasifica. El generador ya no es nuestro.",
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
  /* `brep` se retiró el 2026-09-05, por servido: el tercer oráculo (steputils,
   * rescatado del entregable 6 de F11) le dio el testigo que esta misma entrada
   * pedía por su nombre, y su fila dejó de retener el punto — 238/271 → 239/271.
   * Su razonamiento vive en P-evidencia-05 y en la evidencia de `brep.interop`. */
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
   * `docs/history/execution/frentes-superar-20260904/evidencia-peticiones.md` (P-evidencia-05, con el
   * testigo y el límite de cada parche) y en las entradas `independent: true`
   * que ahora lleva la rúbrica.
   */
  /* ── LAS CINCO QUE SALIERON EL 2026-09-05 ────────────────────────────────
   *
   * `dimensions`, `hatch`, `mtext`, `layers` e `integrity` tenían aquí su
   * dictamen con veredicto `bloqueado_por_defecto_medido`: un testigo ajeno
   * decía que NO sobre el criterio candidato de cada una, y ninguna podía
   * cobrar su punto encima de un defecto silencioso medido.
   *
   * Los cinco defectos están arreglados —los marcadores de subclase que
   * impedían que nadie abriera lo que exportamos, el color de capa que volvía
   * monocromo el plano del remitente, el rótulo de cota escrito dos veces, las
   * siete capas podadas sin aviso y las 63 cotas declaradas perdidas que sí
   * entraban— y las cinco filas llegan a su tope con evidencia `independent`
   * en la rúbrica. Salen de aquí porque este censo describe las filas que
   * TODAVÍA retienen su punto, y el spec lo exige por los dos lados.
   *
   * El razonamiento no se pierde: vive en las suites de terceros, que pasaron
   * de afirmar cada defecto a guardar que no vuelva, y en
   * `docs/history/execution/frentes-superar-20260904/evidencia-peticiones.md`.
   */






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

  // `xrefs` salió del censo el 2026-09-06 (campaña «El lunes de un arquitecto»,
  // T-02): la fila dejó de estar en su tope porque `xrefs.resolution` se partió
  // en `xrefs.bind` (cobrado) y `xrefs.layers` (todavía no: las capas de la
  // xref se aplastan a una). Un dictamen de una fila sin tope es lo que este
  // spec prohíbe. Cuando `xrefs.layers` se cierre y la fila vuelva al tope, el
  // dictamen vuelve con candidato `xrefs.bind` y este texto: «Resolver una
  // referencia externa exige el fichero que la contiene Y el fichero al que
  // apunta; floorplan.dxf declara cuatro capas con prefijo de xref pero llegó
  // solo. Lo que faltaría: un conjunto ajeno completo —el dibujo y sus
  // referencias—; el procedimiento de donación existe (docs/DONACIONES.md del
  // repositorio de conformidad) y el donante no.»

  // `json-import` salió del censo el 2026-09-06 (frente F10 de la campaña «El lunes
  // de un arquitecto»): su testigo ajeno ya está en el árbol —json-import-atheris.spec.ts (atheris)—
  // y la fila cobra su punto con `independent: true`; un dictamen de una fila
  // que ya no retiene nada es lo que este spec prohíbe.

  // `api-sdk` salió del censo el 2026-09-06 (frente F10 de la campaña «El lunes
  // de un arquitecto»): su testigo ajeno ya está en el árbol —api-sdk-openapi.spec.ts (openapi-spec-validator)—
  // y la fila cobra su punto con `independent: true`; un dictamen de una fila
  // que ya no retiene nada es lo que este spec prohíbe.

  // `events` salió del censo el 2026-09-06 (frente F10 de la campaña «El lunes
  // de un arquitecto»): su testigo ajeno ya está en el árbol —events-hmac.spec.ts (hmac de la biblioteca estándar de Python)—
  // y la fila cobra su punto con `independent: true`; un dictamen de una fila
  // que ya no retiene nada es lo que este spec prohíbe.

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


  // `wasm` salió del censo el 2026-09-06 (frente F10 de la campaña «El lunes
  // de un arquitecto»): su testigo ajeno ya está en el árbol —wasm/curve-kernel-mpmath.spec.ts (mpmath)—
  // y la fila cobra su punto con `independent: true`; un dictamen de una fila
  // que ya no retiene nada es lo que este spec prohíbe.

  // `geo` salió del censo el 2026-09-06 (frente F10 de la campaña «El lunes
  // de un arquitecto»): su testigo ajeno ya está en el árbol —geo/crs-pyproj.spec.ts (pyproj/PROJ)—
  // y la fila cobra su punto con `independent: true`; un dictamen de una fila
  // que ya no retiene nada es lo que este spec prohíbe.

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

  // `toolset-map3d` salió del censo el 2026-09-06 (frente F10 de la campaña «El lunes
  // de un arquitecto»): su testigo ajeno ya está en el árbol —geo/shapefile-pyproj.spec.ts (Natural Earth + PROJ)—
  // y la fila cobra su punto con `independent: true`; un dictamen de una fila
  // que ya no retiene nada es lo que este spec prohíbe.

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
