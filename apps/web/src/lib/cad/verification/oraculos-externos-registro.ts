/**
 * EL REGISTRO DE ORÁCULOS EXTERNOS: quién puede atestiguar, quién está y quién no.
 *
 * Aquí vive la parte que NO se calcula —qué herramientas existen, qué licencia
 * tienen y para qué servirían— separada de la spec que la comprueba, con el
 * mismo reparto que `independencia-dictamen.ts` frente a
 * `independencia-rubrica.spec.ts`: el juicio en un módulo, la comprobación en
 * otro, y la comprobación atada por los dos lados.
 *
 * ─── LA REGLA DE UNA SOLA DIRECCIÓN ────────────────────────────────────────
 *
 * Un censo de disponibilidad que sólo se escribiera una vez sería una nota
 * vieja al día siguiente. Éste se vuelve a sondear en cada corrida, y falla
 * ASIMÉTRICAMENTE, que es lo que lo hace útil:
 *
 *   · Una herramienta declarada AUSENTE que APARECE → ROJO. Un oráculo
 *     disponible y no usado es evidencia que se está dejando en la mesa, y
 *     ésa es exactamente la deuda que este frente existe para no acumular.
 *   · Una herramienta declarada PRESENTE que falta → NO rojo. `ezdxf` y
 *     `steputils` no están en CI a propósito: su lectura viaja congelada y
 *     anclada por sha256. Cuando no están, se DECLARA la ausencia en vez de
 *     fingir la medición, igual que el repositorio ya hace con ODA File
 *     Converter.
 *
 * ─── POR QUÉ LA LICENCIA DECIDE SI LA APARICIÓN IMPORTA ────────────────────
 *
 * `CORPUS_POLICY.md` del repositorio de conformidad prohíbe GPL, AGPL, LGPL,
 * MPL, SSPL, BUSL y todo lo source-available «sin excepción y sin discusión».
 * Que `dwg2dxf` (LibreDWG, GPL-3.0) aparezca mañana en esta máquina no crea
 * ninguna obligación: seguiríamos sin poder usarlo. Por eso la regla de arriba
 * se aplica SÓLO a las herramientas admisibles, y cada inadmisible lleva
 * escrita la cláusula que la deja fuera. Sin esa distinción el gate exigiría
 * cablear lo que la política prohíbe.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

export const RAIZ = path.resolve(process.cwd(), "../..");

/** Cómo se pregunta por una herramienta. */
export type TipoDeSonda = "command -v" | "python-import" | "node-resolve";

export interface Sonda {
  tipo: TipoDeSonda;
  /** El comando EXACTO, para que cualquiera lo repita sin leer este archivo. */
  comando: string;
  /** El argumento que consume el ejecutor: binario, módulo o paquete. */
  objetivo: string;
}

export type EstadoDeOraculo =
  | "cableado"
  | "ausente_declarado"
  | "descartado_por_licencia"
  | "sin_via_de_obtencion";

export interface Oraculo {
  id: string;
  nombre: string;
  version: string | null;
  familia: "DXF" | "DWG" | "STEP" | "IFC" | "GEO" | "API" | "EVENTS" | "WASM" | "FUZZ";
  /** Contra qué superficie del producto sería testigo. */
  papel: string;
  estado: EstadoDeOraculo;
  licencia: string;
  /** ¿La política de corpus permite siquiera usarla? */
  admisible: boolean;
  porQueAdmisible: string;
  sonda: Sonda;
  /** Lo observado el día de la declaración. NO se recalcula: es historia. */
  disponibleAlDeclarar: boolean;
  /** Qué consume su salida. Vacío en todo lo que no está cableado. */
  arnes: string[];
  artefactoCongelado: string | null;
  /** Qué haría falta para cablearlo. `null` sólo si ya está cableado. */
  queHariaFalta: string | null;
}

/**
 * LOS SIETE CANDIDATOS. Tres cableados, cuatro no, y el motivo de cada uno
 * medido en esta máquina el 2026-09-05 en vez de supuesto.
 */
export const ORACULOS: Oraculo[] = [
  {
    id: "dxf-parser",
    nombre: "dxf-parser",
    version: "1.1.2",
    familia: "DXF",
    papel:
      "Oráculo A del corpus ajeno: lee los diecinueve DXF de terceros y relee lo que exportamos. Corre en CI en cada corrida porque ya es dependencia declarada de apps/web.",
    estado: "cableado",
    licencia: "MIT",
    admisible: true,
    porQueAdmisible: "MIT. Redistribución y uso permitidos conservando el aviso de copyright.",
    sonda: {
      tipo: "node-resolve",
      comando: "node -e \"console.log(require('dxf-parser/package.json').version)\"",
      objetivo: "dxf-parser/package.json",
    },
    disponibleAlDeclarar: true,
    arnes: [
      "apps/web/src/lib/cad/verification/dxf-corpus-terceros.spec.ts",
      "apps/web/src/lib/cad/verification/dxf-fidelidad-terceros.spec.ts",
      "apps/web/src/lib/cad/verification/terceros-jornada-relectura.ts",
    ],
    artefactoCongelado: null,
    queHariaFalta: null,
  },
  {
    id: "ezdxf",
    nombre: "ezdxf",
    version: "1.4.4",
    familia: "DXF",
    papel:
      "Oráculo B del corpus ajeno: ve HATCH, LEADER, VIEWPORT y estilos de cota donde el oráculo A es ciego, y declara el dialecto real de cada archivo. Es además el único que NO comparte motor con el lector de producción.",
    estado: "cableado",
    licencia: "MIT",
    admisible: true,
    porQueAdmisible:
      "MIT (Manfred Moitzi). El texto está descargado y hasheado en docs/cad/corpus/oraculos/licencias/ezdxf-1.4.4-MIT.txt.",
    sonda: {
      tipo: "python-import",
      comando: 'python3 -c "import ezdxf; print(ezdxf.__version__)"',
      objetivo: "ezdxf",
    },
    disponibleAlDeclarar: true,
    arnes: [
      "docs/cad/corpus/oraculos/censo-ezdxf.py",
      "docs/cad/corpus/oraculos/medidas-floorplan.py",
      "docs/cad/corpus/oraculos/medidas-cuatro-filas.py",
    ],
    artefactoCongelado: "docs/cad/corpus/oraculos/ezdxf-1.4.4.json",
    queHariaFalta: null,
  },
  {
    id: "steputils",
    nombre: "steputils",
    version: "0.1",
    familia: "STEP",
    papel:
      "Oráculo C del modelador 3D: lee el STEP (ISO 10303-21) que exporta apps/web/src/lib/brep/step-export.ts. Hasta hoy el único lector que había leído nuestro STEP era el nuestro.",
    estado: "cableado",
    licencia: "MIT",
    admisible: true,
    porQueAdmisible:
      "MIT (Manfred Moitzi). El texto está descargado y hasheado en docs/cad/corpus/oraculos/licencias/steputils-0.1-MIT.txt.",
    sonda: {
      tipo: "python-import",
      comando: 'python3 -c "import steputils; print(steputils.__version__)"',
      objetivo: "steputils",
    },
    disponibleAlDeclarar: true,
    arnes: ["docs/cad/corpus/oraculos/censo-steputils.py"],
    artefactoCongelado: "docs/cad/corpus/oraculos/steputils-0.1.json",
    queHariaFalta: null,
  },
  {
    id: "pyproj",
    nombre: "pyproj",
    version: "3.7.2",
    familia: "GEO",
    papel:
      "Oráculo D: reproyección geográfica ↔ UTM (envuelve PROJ 9.5.1). Sirve a dos filas con un solo trabajo: geo.crs (la malla de control de México de crs.spec.ts, reproyectada por PROJ) y toolset-map3d.georreferencia (un shapefile público de Natural Earth, dominio público, leído por el lector de producción y reproyectado por PROJ).",
    estado: "cableado",
    licencia: "MIT",
    admisible: true,
    porQueAdmisible:
      "MIT (pyproj) + MIT-estilo (PROJ, empaquetada dentro de la misma rueda). Los textos están descargados y hasheados en docs/cad/corpus/oraculos/licencias/pyproj-3.7.2-MIT.txt y pyproj-3.7.2-bundled-PROJ-MIT.txt.",
    sonda: {
      tipo: "python-import",
      comando: 'python3 -c "import pyproj; print(pyproj.__version__)"',
      objetivo: "pyproj",
    },
    disponibleAlDeclarar: true,
    arnes: [
      "docs/cad/corpus/oraculos/censo-pyproj.py",
      "apps/web/src/lib/geo/crs-pyproj.spec.ts",
      "apps/web/src/lib/geo/shapefile-pyproj.spec.ts",
    ],
    artefactoCongelado: "docs/cad/corpus/oraculos/pyproj-3.7.2.json",
    queHariaFalta: null,
  },
  {
    id: "openapi-spec-validator",
    nombre: "openapi-spec-validator",
    version: "0.9.0",
    familia: "API",
    papel:
      "Oráculo E: dictamina si design-api.v1.yaml es un documento OpenAPI 3.1 válido según el esquema oficial de la especificación pública. Sirve al criterio api-sdk.contract.",
    estado: "cableado",
    licencia: "Apache-2.0",
    admisible: true,
    porQueAdmisible:
      "Apache-2.0 (Artur Maciag y colaboradores). El texto está descargado y hasheado en docs/cad/corpus/oraculos/licencias/openapi-spec-validator-0.9.0-Apache-2.0.txt.",
    sonda: {
      tipo: "python-import",
      comando: 'python3 -c "import openapi_spec_validator; print(openapi_spec_validator.__version__)"',
      objetivo: "openapi_spec_validator",
    },
    disponibleAlDeclarar: true,
    arnes: [
      "docs/cad/corpus/oraculos/censo-openapi.py",
      "apps/web/src/lib/cad/verification/api-sdk-openapi.spec.ts",
    ],
    artefactoCongelado: "docs/cad/corpus/oraculos/openapi-spec-validator-0.9.0.json",
    queHariaFalta: null,
  },
  {
    id: "python-hmac-stdlib",
    nombre: "Python hmac + hashlib (biblioteca estándar)",
    version: null,
    familia: "EVENTS",
    papel:
      "Oráculo F: verifica de forma independiente que X-Valle-Signature es HMAC-SHA256 sobre timestamp + \".\" + rawBody. Sirve al criterio events.operational.",
    estado: "cableado",
    licencia: "PSF License (biblioteca estándar de Python)",
    admisible: true,
    porQueAdmisible:
      "PSF License, biblioteca estándar de una distribución de Python legítimamente obtenida. No se instala nada de PyPI: no hay rueda ni texto de licencia de terceros que archivar.",
    sonda: {
      tipo: "python-import",
      comando: 'python3 -c "import hmac, hashlib"',
      objetivo: "hmac",
    },
    disponibleAlDeclarar: true,
    arnes: [
      "docs/cad/corpus/oraculos/censo-hmac-stdlib.py",
      "apps/web/src/lib/cad/verification/events-hmac.spec.ts",
    ],
    artefactoCongelado: "docs/cad/corpus/oraculos/hmac-stdlib.json",
    queHariaFalta: null,
  },
  {
    id: "mpmath",
    nombre: "mpmath",
    version: "1.4.1",
    familia: "WASM",
    papel:
      "Oráculo G: teselado de arcos y elipses a precisión arbitraria (50 dígitos) como referencia absoluta para el corpus de casos límite que curve-kernel-parity.spec.ts sólo comparaba JS↔WASM entre sí. Sirve al criterio wasm.toolchain.",
    estado: "cableado",
    licencia: "BSD-3-Clause",
    admisible: true,
    porQueAdmisible:
      "BSD-3-Clause (Fredrik Johansson y colaboradores). El texto está descargado y hasheado en docs/cad/corpus/oraculos/licencias/mpmath-1.4.1-BSD-3-Clause.txt.",
    sonda: {
      tipo: "python-import",
      comando: 'python3 -c "import mpmath; print(mpmath.__version__)"',
      objetivo: "mpmath",
    },
    disponibleAlDeclarar: true,
    arnes: [
      "docs/cad/corpus/oraculos/censo-mpmath.py",
      "apps/web/src/lib/cad/wasm/curve-kernel-mpmath.spec.ts",
    ],
    artefactoCongelado: "docs/cad/corpus/oraculos/mpmath-1.4.1.json",
    queHariaFalta: null,
  },
  {
    id: "atheris",
    nombre: "atheris",
    version: "3.0.0",
    familia: "FUZZ",
    papel:
      "Oráculo H: fuzzer de terceros guiado por cobertura (Google) que decide qué documentos hostiles prueban la importación de JSON canónico. Sustituye a hypothesis (MPL-2.0, inadmisible). Sirve al criterio json-import.fuzzing.",
    estado: "cableado",
    licencia: "Apache-2.0",
    admisible: true,
    porQueAdmisible:
      "Apache-2.0 (Google). El texto está descargado y hasheado en docs/cad/corpus/oraculos/licencias/atheris-3.0.0-Apache-2.0.txt.",
    sonda: {
      tipo: "python-import",
      comando: 'python3 -c "import atheris"',
      objetivo: "atheris",
    },
    disponibleAlDeclarar: true,
    arnes: [
      "docs/cad/corpus/oraculos/atheris-fuzz-worker.py",
      "docs/cad/corpus/oraculos/censo-atheris.py",
      "apps/web/src/lib/cad/verification/json-import-atheris.spec.ts",
    ],
    artefactoCongelado: "docs/cad/corpus/oraculos/atheris-3.0.0.json",
    queHariaFalta: null,
  },
  {
    id: "oda-file-converter",
    nombre: "ODA File Converter",
    version: "27.1",
    familia: "DWG",
    papel:
      "Conversor DWG↔DXF. Es el oráculo que el repositorio de conformidad ya registra en docs/TOOLS.md y el que respalda dwg-oda-roundtrip.json.",
    estado: "ausente_declarado",
    licencia:
      "Sin términos publicados (hecho observado y archivado por el repositorio de conformidad: la página de descarga no publica licencia y el MSI no incorpora EULA).",
    admisible: true,
    porQueAdmisible:
      "El repositorio de conformidad ya lo autoriza como conversor/validador de ejecución local, con su registro completo en docs/TOOLS.md. Si apareciera en esta máquina habría que usarlo, y por eso su aparición pone la spec en rojo.",
    sonda: { tipo: "command -v", comando: "command -v ODAFileConverter", objetivo: "ODAFileConverter" },
    disponibleAlDeclarar: false,
    arnes: [],
    artefactoCongelado: null,
    queHariaFalta:
      "El instalador, que sólo se descarga de opendesign.com previo registro con aceptación de términos por una persona. Desde esta sesión la URL no es alcanzable (403 del proxy de egreso) y unos términos no los acepta un agente. Es trabajo del titular, y sus pasos ya están escritos en dwg-firma-encendido-20260904.md §7.",
  },
  {
    id: "libredwg",
    nombre: "LibreDWG (dwg2dxf y familia)",
    version: null,
    familia: "DWG",
    papel:
      "Sería el SEGUNDO validador independiente que DWG_REQUIRED_INDEPENDENT_VALIDATIONS pide y que hoy no existe.",
    estado: "descartado_por_licencia",
    licencia: "GPL-3.0-or-later",
    admisible: false,
    porQueAdmisible:
      "NO admisible. CORPUS_POLICY.md, «Material prohibido»: GPL, AGPL, LGPL, MPL, SSPL, BUSL y source-available quedan fuera sin excepción y sin discusión. Que apareciera en la máquina no cambiaría nada: seguiría sin poder usarse.",
    sonda: { tipo: "command -v", comando: "command -v dwg2dxf", objetivo: "dwg2dxf" },
    disponibleAlDeclarar: false,
    arnes: [],
    artefactoCongelado:
      "docs/cad/evidence/dwg-firma-encendido-20260904.md (§6: el intento y su motivo, escritos el 2026-09-04)",
    queHariaFalta:
      "Nada que este proyecto pueda hacer. Aunque el binario llegara, la licencia lo excluye del corpus. La cola que pedía «cablear dwg2dxf» está cerrada con esta razón, no con un pendiente.",
  },
  {
    id: "ifcopenshell",
    nombre: "IfcOpenShell",
    version: null,
    familia: "IFC",
    papel: "Sería lector de IFC. Ninguna superficie del producto emite ni consume IFC.",
    estado: "descartado_por_licencia",
    licencia: "LGPL-3.0-or-later",
    admisible: false,
    porQueAdmisible:
      "NO admisible: LGPL está en la lista prohibida de CORPUS_POLICY.md. Y aunque no lo estuviera, no habría contra qué medir: Valle Design NO es BIM y no exporta IFC (bim-claim-boundary.spec.ts es el gate que lo sostiene). Un oráculo sin superficie de producto no es un pendiente, es una confusión de alcance.",
    sonda: { tipo: "python-import", comando: 'python3 -c "import ifcopenshell"', objetivo: "ifcopenshell" },
    disponibleAlDeclarar: false,
    arnes: [],
    artefactoCongelado: null,
    queHariaFalta:
      "Que el producto tuviera IFC, que no lo tiene ni lo pretende, Y una implementación con licencia permisiva, que no la hay al alcance.",
  },
  {
    id: "pythonocc-core",
    nombre: "pythonocc-core (OpenCASCADE)",
    version: null,
    familia: "STEP",
    papel:
      "Sería el lector de STEP con kernel de verdad: reconstruiría el sólido en vez de contar entidades, que es lo que steputils NO hace.",
    estado: "descartado_por_licencia",
    licencia: "LGPL-2.1 (OpenCASCADE Technology Public License)",
    admisible: false,
    porQueAdmisible:
      "NO admisible: LGPL. Es la razón por la que el oráculo C es un analizador de la parte 21 y no un kernel, y por la que su artefacto declara que no acredita que un CAD mecánico comercial reconstruya el sólido.",
    sonda: { tipo: "python-import", comando: 'python3 -c "import OCC"', objetivo: "OCC" },
    disponibleAlDeclarar: false,
    arnes: [],
    artefactoCongelado: null,
    queHariaFalta:
      "Un lector de STEP con licencia permisiva que reconstruya topología. No se encontró ninguno en PyPI el 2026-09-05.",
  },
];

/**
 * EL CENSO DE BINARIOS. Veintiuno, todos reales y todos nombrados por su
 * proyecto: diez de LibreDWG, dos de ODA, uno de IfcOpenShell y ocho de otros
 * CAD/kernels libres. No se inventa ninguno: un binario que no existe en
 * ningún proyecto convertiría el censo en decoración.
 */
export const BINARIOS: Array<{ binario: string; proyecto: string; licencia: string; admisible: boolean }> = [
  { binario: "dwgread", proyecto: "LibreDWG", licencia: "GPL-3.0-or-later", admisible: false },
  { binario: "dwgwrite", proyecto: "LibreDWG", licencia: "GPL-3.0-or-later", admisible: false },
  { binario: "dwg2dxf", proyecto: "LibreDWG", licencia: "GPL-3.0-or-later", admisible: false },
  { binario: "dxf2dwg", proyecto: "LibreDWG", licencia: "GPL-3.0-or-later", admisible: false },
  { binario: "dwg2SVG", proyecto: "LibreDWG", licencia: "GPL-3.0-or-later", admisible: false },
  { binario: "dwgbmp", proyecto: "LibreDWG", licencia: "GPL-3.0-or-later", admisible: false },
  { binario: "dwggrep", proyecto: "LibreDWG", licencia: "GPL-3.0-or-later", admisible: false },
  { binario: "dwglayers", proyecto: "LibreDWG", licencia: "GPL-3.0-or-later", admisible: false },
  { binario: "dwgfilter", proyecto: "LibreDWG", licencia: "GPL-3.0-or-later", admisible: false },
  { binario: "dwgrewrite", proyecto: "LibreDWG", licencia: "GPL-3.0-or-later", admisible: false },
  { binario: "ODAFileConverter", proyecto: "Open Design Alliance", licencia: "sin términos publicados", admisible: true },
  { binario: "teigha", proyecto: "Open Design Alliance (nombre antiguo)", licencia: "sin términos publicados", admisible: true },
  { binario: "IfcConvert", proyecto: "IfcOpenShell", licencia: "LGPL-3.0-or-later", admisible: false },
  { binario: "DRAWEXE", proyecto: "OpenCASCADE", licencia: "LGPL-2.1", admisible: false },
  { binario: "gmsh", proyecto: "Gmsh", licencia: "GPL-2.0-or-later", admisible: false },
  { binario: "FreeCAD", proyecto: "FreeCAD", licencia: "LGPL-2.1-or-later", admisible: false },
  { binario: "FreeCADCmd", proyecto: "FreeCAD", licencia: "LGPL-2.1-or-later", admisible: false },
  { binario: "qcad", proyecto: "QCAD", licencia: "GPL-3.0", admisible: false },
  { binario: "librecad", proyecto: "LibreCAD", licencia: "GPL-2.0", admisible: false },
  { binario: "blender", proyecto: "Blender", licencia: "GPL-3.0-or-later", admisible: false },
  { binario: "openscad", proyecto: "OpenSCAD", licencia: "GPL-2.0-or-later", admisible: false },
];

/** Un intento que se hizo de verdad, con su comando y su salida real. */
export interface Intento {
  id: string;
  fecha: string;
  comando: string;
  salidaReal: string;
  veredicto: string;
  porQue: string;
}

/**
 * LOS INTENTOS, con la salida literal que dieron en esta máquina. Se copian
 * aquí en vez de re-ejecutarse en cada corrida por una razón: `apt-get update`
 * tarda un minuto en agotar sus tiempos de espera y una spec que tarde un
 * minuto en decir «sigue sin haber red» es una spec que alguien acabará
 * saltándose. Lo que SÍ se vuelve a sondear en cada corrida es el resultado
 * —`command -v`, que es instantáneo—; el intento explica CÓMO se llegó a él.
 */
export const INTENTOS: Intento[] = [
  {
    id: "apt-libredwg",
    fecha: "2026-09-05",
    comando: "apt-cache search libredwg",
    salidaReal: "(salida vacía, código 0)",
    veredicto: "LibreDWG no está empaquetada para esta distribución.",
    porQue:
      "La búsqueda vuelve vacía con el índice presente. Confirma lo que el frente DWG ya midió el 2026-09-04: no es un repositorio faltante, es un paquete que no existe aquí.",
  },
  {
    id: "apt-update",
    fecha: "2026-09-05",
    comando: "apt-get update -o Acquire::http::Timeout=6 -o Acquire::Retries=0",
    salidaReal:
      "Err: http://archive.ubuntu.com/ubuntu noble InRelease — Connection failed [IP: 91.189.91.83 80] · " +
      "W: Failed to fetch https://ppa.launchpadcontent.net/... — Invalid response from proxy: HTTP/1.1 403 Forbidden",
    veredicto: "El índice de paquetes no se puede refrescar desde esta sesión.",
    porQue:
      "La política de egreso del proxy deja pasar los registros de paquetes de lenguaje (PyPI responde) y no los repositorios de sistema. Instalar un binario con apt no es una opción aquí, y no por falta de permiso sino por falta de ruta.",
  },
  {
    id: "oda-descarga",
    fecha: "2026-09-05",
    comando: "curl -sS -o /dev/null -w '%{http_code}' https://www.opendesign.com/guestfiles/oda_file_converter",
    salidaReal: "curl: (56) CONNECT tunnel failed, response 403 · http=000",
    veredicto: "La página de descarga del conversor no es alcanzable desde esta sesión.",
    porQue:
      "Y aunque lo fuera, la descarga exige registro y aceptación de términos por una PERSONA. Un agente no acepta términos en nombre de nadie. Por eso este oráculo se declara ausente en vez de intentarse.",
  },
  {
    id: "pypi-lectores-step",
    fecha: "2026-09-05",
    comando: "curl -sS https://pypi.org/pypi/{steputils,ifcopenshell,pythonocc-core}/json",
    salidaReal:
      "steputils 0.1 → 'License :: OSI Approved :: MIT License' · ifcopenshell 0.8.5 → 'GNU Lesser General Public License v3 or later (LGPLv3+)' · pythonocc-core 0.16 → 'LGPL'",
    veredicto: "Uno de los tres es admisible, y es el que se cableó.",
    porQue:
      "El registro de paquetes de Python SÍ responde desde aquí (fue el desmentido del reconocimiento del 2026-09-04). Eso convirtió «no hay oráculo posible» en «hay uno, con licencia, y hay que mirarle la licencia a los tres».",
  },
  {
    id: "steputils-defecto-propio",
    fecha: "2026-09-05",
    comando: "python3 -c \"from steputils import p21; d=p21.readfile(f); sum(1 for _ in d.data[0])\"",
    salidaReal: "TypeError: iter() returned non-iterator of type 'odict_values'",
    veredicto: "El oráculo C tiene un defecto propio, y se esquiva por escrito.",
    porQue:
      "`DataSection.__iter__` de steputils 0.1 está roto en Python 3.11. El censo recorre `instances.values()`. Un oráculo con defectos sirve mientras sus defectos estén escritos; uno con defectos callados, no.",
  },
];

/** Ejecuta una sonda de verdad. Devuelve presencia y la salida recortada. */
export function sondea(sonda: Sonda): { disponible: boolean; salida: string } {
  if (sonda.tipo === "node-resolve") {
    // Se resuelve en un proceso aparte a propósito: `require` desde este módulo
    // depende de cómo lo compile el runner, y una sonda que dependa del runner
    // deja de medir la máquina para medirse a sí misma.
    const resuelto = spawnSync(
      process.execPath,
      ["-e", `console.log(require(${JSON.stringify(sonda.objetivo)}).version)`],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    return { disponible: resuelto.status === 0, salida: (resuelto.stdout ?? "").trim() };
  }
  const argumentos =
    sonda.tipo === "command -v"
      ? ["-c", `command -v ${sonda.objetivo}`]
      : ["-c", `python3 -c 'import ${sonda.objetivo}; print(getattr(${sonda.objetivo}, "__version__", ""))'`];
  const salida = spawnSync("/bin/sh", argumentos, { encoding: "utf8" });
  return { disponible: salida.status === 0, salida: (salida.stdout ?? "").trim() };
}
