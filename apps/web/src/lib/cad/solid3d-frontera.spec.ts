/**
 * LA FRONTERA DEL 3D, EJECUTABLE (2026-09-04).
 *
 * Este spec no mide geometría —eso lo hacen `solids-edit.spec.ts`,
 * `solids-primitives.spec.ts` y los del kernel—. Mide la FRONTERA: recorre una
 * por una las ramas de SOLIDEDIT y los modos de las ocho primitivas y exige de
 * cada una que haga UNA de estas tres cosas, nunca otra:
 *
 *   - `escribe`: conducida hasta el final, termina en un `result` de tipo
 *     `document` con órdenes de verdad, y el sólido que inserta es un cuerpo
 *     cerrado. Es la única forma de decir «esto existe».
 *   - `responde`: existe pero no toca el documento —una consulta, o un límite
 *     que se rechaza a tiempo—, y termina en un `message` cuyo texto NO está
 *     vacío y dice su motivo. Un «Hecho» vacío no cuenta.
 *   - `ausente`: no se ofrece como palabra clave (una opción que no funciona es
 *     peor que una ausencia declarada), su nombre aparece igualmente donde el
 *     dibujante lo lee, y forzarla no escribe NADA en el documento.
 *
 * ## Por qué es un candado y no una lista
 *
 * Las dos tablas se comprueban EN LOS DOS SENTIDOS contra lo que el propio
 * diálogo anuncia:
 *
 *   1. Las palabras clave que las órdenes ofrecen se descubren recorriendo su
 *      máquina de estados (`teclasOfrecidas`), no se copian aquí a mano. Toda
 *      palabra clave descubierta tiene que estar declarada en la tabla, y toda
 *      clave declarada tiene que ser ofrecida. Añadir una rama o un modo sin
 *      declararlo rompe el spec; retirar uno sin borrar su renglón, también.
 *   2. Los nombres que el prompt de cada rama declara «todavía no» se PARSEAN
 *      del propio mensaje y se cotejan con los renglones `ausente` de esa rama.
 *      Dejar de nombrar una ausencia rompe el spec; nombrar una que ya existe,
 *      también.
 *
 * Ése es el sentido del archivo: que ninguna rama pueda desaparecer, aparecer a
 * medias ni quedarse muda sin que un gate se entere.
 *
 * ## El recuento, con la cifra real
 *
 * SOLIDEDIT reparte DIECISÉIS operaciones entre sus tres ramas —nueve de Cara
 * (Extruir, Mover, Girar, Desfasar, Inclinar, Borrar, Copiar, Color, Material),
 * dos de Arista (Copiar, Color) y cinco de Cuerpo (Estampar, Separar, Vaciar,
 * Limpiar, Comprobar)—, sin contar Deshacer y Salir, que son navegación y no
 * editan nada. La cabecera de `solids-edit.ts` decía «unas catorce»: era una
 * aproximación de memoria y aquí se sustituye por la enumeración completa.
 * Ocho existen y ocho no, y la tabla las lleva las dieciséis.
 *
 * Los modos de las primitivas no tienen una cifra canónica que copiar —son los
 * caminos que cada diálogo abre—, así que la tabla se cierra contra lo que las
 * órdenes OFRECEN, que es lo único verificable.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bodyIsClosed } from "../brep";
import type { CadEntity } from "./cad-document";
import type { CadSolid3dEntity } from "./cad-entities-v5";
import type { CadAnyCommandDescriptor, CadCommandContext, CadCommandInput } from "./engine/command-types";
import { CAD_SOLIDEDIT_COMMANDS } from "./engine/commands/solids-edit";
import { CAD_SOLID_PRIMITIVE_COMMANDS } from "./engine/commands/solids-primitives";
import { cadFaceRefFromBody } from "./pick3d/solid-face-ref";
import { solid3dBody } from "./solid3d-build";

let checks = 0;
let solidosVerificados = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const aqui = path.dirname(fileURLToPath(import.meta.url));
/**
 * El texto de un módulo, planchado para poder buscar frases enteras.
 *
 * Se quita primero el ` * ` con que Prettier prefija cada línea del comentario
 * y sólo después se colapsan los blancos: sin ese primer paso una frase que el
 * formateo parte en dos líneas quedaría con un asterisco en medio y no se
 * encontraría nunca — el spec daría por no declarado algo que sí lo está.
 */
const fuente = (relativo: string) =>
  readFileSync(path.join(aqui, relativo), "utf8")
    .replace(/^[ \t]*\*[ \t]?/gm, "")
    .replace(/\s+/g, " ");

/* ── El banco de pruebas ──────────────────────────────────────────────────── */

function contexto(entidades: readonly CadEntity[], seleccion: readonly string[] = []): CadCommandContext {
  let ids = 0;
  return {
    entityIds: entidades.map((entidad) => entidad.id),
    entity: (id) => entidades.find((entidad) => entidad.id === id),
    selection: seleccion,
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `nuevo${++ids}`,
  };
}

interface Conducido {
  readonly resultado: ReturnType<CadAnyCommandDescriptor["begin"]>["result"];
  readonly prompts: readonly string[];
  readonly opciones: readonly string[];
}

/** Conduce un descriptor hasta que da resultado o se acaban las entradas. */
function conducir(
  descriptor: CadAnyCommandDescriptor,
  entradas: readonly CadCommandInput[],
  entidades: readonly CadEntity[] = [],
  seleccion: readonly string[] = [],
): Conducido {
  const ctx = contexto(entidades, seleccion);
  let paso = descriptor.begin(ctx);
  const prompts = [paso.prompt.message];
  for (const entrada of entradas) {
    if (paso.result) break;
    paso = descriptor.step(paso.state as never, entrada, ctx);
    prompts.push(paso.prompt.message);
  }
  return { resultado: paso.result, prompts, opciones: paso.prompt.options.map((opcion) => opcion.keyword) };
}

/**
 * Todas las palabras clave que una orden llega a ofrecer.
 *
 * Recorre la máquina de estados en anchura con un alfabeto fijo —los puntos, la
 * distancia y el Intro que cualquier diálogo de dibujo recibe— MÁS las opciones
 * que el prompt de cada estado ofrece, que es como se llega a las que sólo
 * aparecen después de contestar otra. Los estados se identifican por su mensaje
 * y sus opciones, así que un recorrido que vuelve a preguntar lo mismo no se
 * explora dos veces y la búsqueda termina.
 *
 * Es un recorrido ACOTADO (profundidad 10, 3000 nodos) y se dice: una palabra
 * clave escondida más allá de esa profundidad no la vería. Con los diálogos de
 * hoy sobra —el más profundo, POLYSOLID, cierra en 13 estados—.
 */
function teclasOfrecidas(descriptor: CadAnyCommandDescriptor, entidades: readonly CadEntity[] = []): Set<string> {
  const ctx = contexto(entidades);
  const halladas = new Set<string>();
  const vistos = new Set<string>();
  const inicio = descriptor.begin(ctx);
  const cola: { paso: typeof inicio; hondo: number }[] = [{ paso: inicio, hondo: 0 }];
  let nodos = 0;
  while (cola.length > 0 && nodos < 3000) {
    const nodo = cola.shift()!;
    nodos += 1;
    if (nodo.paso.result) continue;
    const opciones = nodo.paso.prompt.options.map((opcion) => opcion.keyword);
    opciones.forEach((clave) => halladas.add(clave));
    const firma = `${nodo.paso.prompt.message}|${opciones.join(",")}`;
    if (vistos.has(firma) || nodo.hondo >= 10) continue;
    vistos.add(firma);
    const alfabeto: CadCommandInput[] = [
      ...opciones.map((clave) => ({ kind: "keyword", keyword: clave }) as CadCommandInput),
      punto(10, 20),
      punto(70, 90),
      punto(120, 30),
      distancia(30),
      intro,
    ];
    for (const entrada of alfabeto) cola.push({ paso: descriptor.step(nodo.paso.state as never, entrada, ctx), hondo: nodo.hondo + 1 });
  }
  return halladas;
}

const punto = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const clave = (valor: string): CadCommandInput => ({ kind: "keyword", keyword: valor });
const distancia = (valor: number): CadCommandInput => ({ kind: "distance", value: valor });
const designar = (id: string): CadCommandInput => ({ kind: "entityPick", entityId: id, point: { x: 0, y: 0 } });
const intro: CadCommandInput = { kind: "enter" };

function caja(id: string, x = 0, lado = 100, alto = 50): CadSolid3dEntity {
  return {
    id,
    type: "solid3d",
    layer: "0",
    root: `${id}-caja`,
    nodes: [{ id: `${id}-caja`, op: "box", min: { x, y: 0, z: 0 }, max: { x: x + lado, y: lado, z: alto } }],
  };
}

/** Unión de dos cajas: separadas (Separar) o pegadas (Limpiar, que funde su plano partido). */
function union(id: string, segunda: number): CadSolid3dEntity {
  const a = caja("a");
  const b = caja("b", segunda);
  return { id, type: "solid3d", layer: "0", root: "u", nodes: [...a.nodes, ...b.nodes, { id: "u", op: "union", operands: [a.root, b.root] }] };
}

/** La cara superior, designada como lo haría el rayo de cámara. */
function caraSuperior(solido: CadSolid3dEntity): CadCommandInput {
  const cuerpo = solid3dBody(solido);
  const refs = Array.from({ length: cuerpo.faces.length }, (_, indice) => cadFaceRefFromBody(cuerpo, indice));
  const alta = refs.reduce((mejor, ref) => (ref.centroid.z > mejor.centroid.z ? ref : mejor));
  return { kind: "facePick", entityId: solido.id, face: alta, point: { ...alta.centroid }, normal: { x: 0, y: 0, z: 1 } } as CadCommandInput;
}

/**
 * El veredicto de un renglón que dice `escribe`.
 *
 * No basta con que el `result` sea `document`: un lote vacío también lo sería.
 * Se exige al menos una orden, y que TODO sólido que se inserte o sustituya sea
 * un cuerpo CERRADO — el efecto verificable en el documento, no la promesa.
 */
function escribeDeVerdad(conducido: Conducido, nombre: string): void {
  const resultado = conducido.resultado;
  ok(
    resultado?.kind === "document",
    `${nombre}: debía terminar escribiendo y dio ${resultado?.kind ?? "ningún resultado"}${resultado?.kind === "message" ? ` — ${resultado.text}` : ""}`,
  );
  if (resultado?.kind !== "document") return;
  ok(resultado.commands.length > 0, `${nombre}: escribe al menos una orden`);
  for (const orden of resultado.commands) {
    const entidad = orden.type === "insert" ? orden.entity : orden.type === "replace" ? orden.entity : null;
    if (!entidad || entidad.type !== "solid3d") continue;
    ok(bodyIsClosed(solid3dBody(entidad as CadSolid3dEntity)), `${nombre}: el sólido que deja es un cuerpo cerrado`);
    solidosVerificados += 1;
  }
}

/** El veredicto de un renglón que dice `responde`: mensaje con texto y con su motivo dentro. */
function respondeDeVerdad(conducido: Conducido, nombre: string, espera: RegExp): void {
  const resultado = conducido.resultado;
  ok(resultado?.kind === "message", `${nombre}: debía responder con un mensaje y dio ${resultado?.kind ?? "ningún resultado"}`);
  if (resultado?.kind !== "message") return;
  ok(resultado.text.trim().length > 0, `${nombre}: el mensaje NO está vacío`);
  ok(espera.test(resultado.text), `${nombre}: el mensaje nombra su motivo (dijo «${resultado.text.slice(0, 120)}»)`);
}

/* ── Tabla A · Las dieciséis ramas de SOLIDEDIT ───────────────────────────── */

const solidedit = CAD_SOLIDEDIT_COMMANDS[0];

interface Guion {
  readonly entradas: readonly CadCommandInput[];
  readonly entidades: readonly CadEntity[];
}

interface Rama {
  readonly rama: "Cara" | "Arista" | "cUerpo";
  /** El nombre con el que la orden lo llama (o lo nombraría). */
  readonly operacion: string;
  readonly estado: "escribe" | "responde" | "ausente";
  /** Las palabras clave que hay que teclear para llegar. Vacío en las ausentes. */
  readonly claves: readonly string[];
  readonly motivo: string;
  readonly guion: () => Guion;
  readonly espera?: RegExp;
}

const RAMAS: readonly Rama[] = [
  {
    rama: "Cara",
    operacion: "Extruir",
    estado: "escribe",
    claves: ["Cara", "Extruir"],
    motivo: "nodo `push` sobre el árbol, reeditable; sin trayectoria ni ángulo de inclinación",
    guion: () => {
      const pieza = caja("caja");
      return { entradas: [clave("Cara"), clave("Extruir"), caraSuperior(pieza), distancia(30)], entidades: [pieza] };
    },
  },
  {
    rama: "Cara",
    operacion: "Desfasar",
    estado: "escribe",
    claves: ["Cara", "Desfasar"],
    motivo: "el mismo nodo `push` con el signo de AutoCAD; esta rama sí está completa",
    guion: () => {
      const pieza = caja("caja");
      return { entradas: [clave("Cara"), clave("Desfasar"), caraSuperior(pieza), distancia(20)], entidades: [pieza] };
    },
  },
  {
    rama: "Cara",
    operacion: "Copiar",
    estado: "escribe",
    claves: ["Cara", "Copiar"],
    motivo: "los lazos de la cara salen como REGION en coordenadas del mundo; el sólido no se toca",
    guion: () => {
      const pieza = caja("caja");
      return { entradas: [clave("Cara"), clave("Copiar"), caraSuperior(pieza)], entidades: [pieza] };
    },
  },
  {
    rama: "Cara",
    operacion: "Mover",
    estado: "ausente",
    claves: [],
    motivo: "pide recomponer las caras adyacentes y el kernel no rehace una cara movida",
    guion: () => ({ entradas: [clave("Cara"), clave("Mover")], entidades: [caja("caja")] }),
  },
  {
    rama: "Cara",
    operacion: "Girar",
    estado: "ausente",
    claves: [],
    motivo: "mismo motivo que Mover: la cara girada deja las vecinas sin recomponer",
    guion: () => ({ entradas: [clave("Cara"), clave("Girar")], entidades: [caja("caja")] }),
  },
  {
    rama: "Cara",
    operacion: "Inclinar",
    estado: "ausente",
    claves: [],
    motivo: "mismo motivo que Mover, y además el ángulo puede volver el sólido inválido",
    guion: () => ({ entradas: [clave("Cara"), clave("Inclinar")], entidades: [caja("caja")] }),
  },
  {
    rama: "Cara",
    operacion: "Borrar",
    estado: "ausente",
    claves: [],
    motivo: "borrar una cara pide coser el hueco que deja: cirugía topológica que `lib/brep/` no tiene",
    guion: () => ({ entradas: [clave("Cara"), clave("Borrar")], entidades: [caja("caja")] }),
  },
  {
    rama: "Cara",
    operacion: "Color",
    estado: "ausente",
    claves: [],
    motivo: "el esquema no guarda un atributo por cara; el color es de la entidad entera",
    guion: () => ({ entradas: [clave("Cara"), clave("Color")], entidades: [caja("caja")] }),
  },
  {
    rama: "Cara",
    operacion: "Material",
    estado: "ausente",
    claves: [],
    motivo: "mismo motivo que Color: no hay atributo por cara donde escribirlo",
    guion: () => ({ entradas: [clave("Cara"), clave("Material")], entidades: [caja("caja")] }),
  },
  {
    rama: "Arista",
    operacion: "Copiar",
    estado: "escribe",
    claves: ["Arista", "Copiar"],
    motivo: "salen TODAS las aristas como entidades `line`; designar una suelta lo dice el propio prompt",
    guion: () => {
      const pieza = caja("caja");
      return { entradas: [clave("Arista"), clave("Copiar"), designar("caja"), intro], entidades: [pieza] };
    },
  },
  {
    rama: "Arista",
    operacion: "Color",
    estado: "ausente",
    claves: [],
    motivo: "el esquema no guarda un atributo por arista",
    guion: () => ({ entradas: [clave("Arista"), clave("Color")], entidades: [caja("caja")] }),
  },
  {
    rama: "cUerpo",
    operacion: "Separar",
    estado: "escribe",
    claves: ["cUerpo", "Separar"],
    motivo: "una unión de cuerpos que no se tocan se parte en un sólido por operando",
    guion: () => {
      const pieza = union("dos", 500);
      return { entradas: [clave("cUerpo"), clave("Separar"), designar("dos"), intro], entidades: [pieza] };
    },
  },
  {
    rama: "cUerpo",
    operacion: "Vaciar",
    estado: "escribe",
    claves: ["cUerpo", "Vaciar"],
    motivo: "interior por desfase de planos, restado con un nodo `subtract`; sólo cuerpos convexos",
    guion: () => {
      const pieza = caja("caja");
      return { entradas: [clave("cUerpo"), clave("Vaciar"), designar("caja"), intro, distancia(10)], entidades: [pieza] };
    },
  },
  {
    rama: "cUerpo",
    operacion: "Limpiar",
    estado: "escribe",
    claves: ["cUerpo", "Limpiar"],
    motivo: "funde las caras coplanarias que dejó la booleana y hornea el resultado como nodo `brep`",
    guion: () => {
      const pieza = union("pegadas", 100);
      return { entradas: [clave("cUerpo"), clave("Limpiar"), designar("pegadas"), intro], entidades: [pieza] };
    },
  },
  {
    rama: "cUerpo",
    operacion: "Comprobar",
    estado: "responde",
    claves: ["cUerpo", "Comprobar"],
    motivo: "es una consulta: valida el árbol y dice caras, aristas y volumen sin tocar el documento",
    espera: /sólido válido, \d+ caras, \d+ aristas, volumen /,
    guion: () => {
      const pieza = caja("caja");
      return { entradas: [clave("cUerpo"), clave("Comprobar"), designar("caja"), intro], entidades: [pieza] };
    },
  },
  {
    rama: "cUerpo",
    operacion: "Estampar",
    estado: "ausente",
    claves: [],
    motivo: "pide partir una cara por una curva del dibujo: esa cirugía no existe en `lib/brep/`",
    guion: () => ({ entradas: [clave("cUerpo"), clave("Estampar")], entidades: [caja("caja")] }),
  },
];

/* ── Tabla A · el veredicto renglón a renglón ─────────────────────────────── */

for (const fila of RAMAS) {
  const nombre = `SOLIDEDIT ${fila.rama} ${fila.operacion}`;
  const { entradas, entidades } = fila.guion();
  const conducido = conducir(solidedit, entradas, entidades);
  if (fila.estado === "escribe") escribeDeVerdad(conducido, nombre);
  else if (fila.estado === "responde") respondeDeVerdad(conducido, nombre, fila.espera!);
  else {
    // Forzar la palabra clave que la orden NO ofrece no puede escribir nada, y
    // lo que se ve después tampoco puede ser un silencio.
    ok(conducido.resultado?.kind !== "document", `${nombre}: forzarla no escribe en el documento`);
    const ultimo = conducido.prompts[conducido.prompts.length - 1];
    ok(ultimo.trim().length > 0, `${nombre}: tras forzarla la orden sigue diciendo algo (no se queda muda)`);
    ok(new RegExp(fila.operacion).test(ultimo), `${nombre}: y lo que dice la nombra`);
    ok(/todavía no/.test(ultimo), `${nombre}: con las palabras «todavía no»`);
  }
  ok(fila.motivo.trim().length > 0, `${nombre}: el renglón lleva su motivo escrito`);
}

/* ── Tabla A · los dos candados ───────────────────────────────────────────── */

/** Las opciones que ofrece cada rama, leídas del propio diálogo. */
const OPCIONES_RAMA: Record<string, readonly string[]> = {
  raiz: conducir(solidedit, []).opciones,
  Cara: conducir(solidedit, [clave("Cara")]).opciones,
  Arista: conducir(solidedit, [clave("Arista")]).opciones,
  cUerpo: conducir(solidedit, [clave("cUerpo")]).opciones,
};
/** Navegación: entrar en una rama y salir. No son operaciones y no van en la tabla. */
const NAVEGACION = ["Cara", "Arista", "cUerpo", "Salir"];

{
  ok(OPCIONES_RAMA.raiz.join(",") === "Cara,Arista,cUerpo,Salir", `la raíz ofrece las tres ramas y Salir (dio ${OPCIONES_RAMA.raiz.join(",")})`);
  for (const rama of ["Cara", "Arista", "cUerpo"] as const) {
    const ofrecidas = OPCIONES_RAMA[rama].filter((opcion) => !NAVEGACION.includes(opcion));
    const declaradas = RAMAS.filter((fila) => fila.rama === rama && fila.estado !== "ausente").map((fila) => fila.operacion);
    ok(
      ofrecidas.every((opcion) => declaradas.includes(opcion)),
      `rama ${rama}: toda opción ofrecida está declarada en la tabla (ofrece ${ofrecidas.join(",")}; la tabla lleva ${declaradas.join(",")})`,
    );
    ok(
      declaradas.every((operacion) => ofrecidas.includes(operacion)),
      `rama ${rama}: toda operación declarada como existente se ofrece de verdad`,
    );
    ok(OPCIONES_RAMA[rama].includes("Salir"), `rama ${rama}: se puede salir sin hacer nada`);
  }
  // El recorrido completo, por si alguna clave apareciera más abajo del menú.
  const descubiertas = teclasOfrecidas(solidedit, [caja("caja")]);
  const declaradas = new Set(RAMAS.flatMap((fila) => fila.claves));
  for (const nombre of NAVEGACION) declaradas.add(nombre);
  ok(
    [...descubiertas].every((tecla) => declaradas.has(tecla)),
    `SOLIDEDIT: toda palabra clave que el diálogo llega a ofrecer está declarada (sobran ${[...descubiertas].filter((t) => !declaradas.has(t)).join(",") || "ninguna"})`,
  );
  ok(
    [...declaradas].every((tecla) => descubiertas.has(tecla)),
    `SOLIDEDIT: toda clave declarada se ofrece de verdad (faltan ${[...declaradas].filter((t) => !descubiertas.has(t)).join(",") || "ninguna"})`,
  );
}

/**
 * El segundo candado: los nombres que el prompt declara «todavía no».
 *
 * Se leen del mensaje —«…; Mover, Girar, Inclinar, Borrar, Color y Material
 * todavía no»— y se cotejan con los renglones `ausente` de esa rama en los dos
 * sentidos. Dejar de nombrar una ausencia rompe el spec; seguir nombrando una
 * que ya se construyó, también.
 */
function ausenciasDelPrompt(mensaje: string): string[] {
  const cola = mensaje.split("; ").pop() ?? "";
  const lista = cola.replace(/\s*todavía no.*$/, "");
  return lista
    .split(/,\s*|\s+y\s+/)
    .map((nombre) => nombre.trim())
    .filter((nombre) => nombre.length > 0);
}

{
  for (const rama of ["Cara", "Arista", "cUerpo"] as const) {
    const mensaje = conducir(solidedit, [clave(rama)]).prompts[1];
    ok(/todavía no/.test(mensaje), `rama ${rama}: el prompt declara lo que todavía no hay`);
    const nombradas = ausenciasDelPrompt(mensaje);
    const ausentes = RAMAS.filter((fila) => fila.rama === rama && fila.estado === "ausente").map((fila) => fila.operacion);
    ok(
      nombradas.length === ausentes.length && nombradas.every((nombre) => ausentes.includes(nombre)),
      `rama ${rama}: el prompt nombra exactamente las ausencias de la tabla (prompt: ${nombradas.join(",")}; tabla: ${ausentes.join(",")})`,
    );
    ok(
      ausentes.every((nombre) => !OPCIONES_RAMA[rama].includes(nombre)),
      `rama ${rama}: ninguna ausencia se ofrece como opción pulsable`,
    );
  }
  const escriben = RAMAS.filter((fila) => fila.estado === "escribe").length;
  const responden = RAMAS.filter((fila) => fila.estado === "responde").length;
  const ausentes = RAMAS.filter((fila) => fila.estado === "ausente").length;
  ok(RAMAS.length === 16, `la tabla recorre las dieciséis operaciones de SOLIDEDIT (lleva ${RAMAS.length})`);
  ok(escriben === 7 && responden === 1 && ausentes === 8, `ocho existen (siete escriben, una responde) y ocho no (dio ${escriben}/${responden}/${ausentes})`);
}

/**
 * El MODO ausente de Vaciar: la cáscara abierta.
 *
 * No es una operación —Vaciar existe— sino un modo suyo, y por eso no ocupa
 * renglón en la tabla de las dieciséis. Se declara donde se decide: en el
 * prompt que pide el espesor, antes de teclear el número.
 */
{
  const pieza = caja("caja");
  const conducido = conducir(solidedit, [clave("cUerpo"), clave("Vaciar"), designar("caja"), intro], [pieza]);
  const espesor = conducido.prompts[conducido.prompts.length - 1];
  ok(/espesor de la pared/.test(espesor), "Vaciar pide el espesor de la pared");
  ok(/retirando las caras designadas todavía no/.test(espesor), "y en ese mismo renglón declara que la cáscara ABIERTA todavía no");
}

/* ── Tabla B · los modos de las ocho primitivas ───────────────────────────── */

const primitiva = (nombre: string): CadAnyCommandDescriptor => {
  const descriptor = CAD_SOLID_PRIMITIVE_COMMANDS.find((entrada) => entrada.name === nombre);
  assert.ok(descriptor, `${nombre} está registrado`);
  return descriptor!;
};

interface Modo {
  readonly orden: string;
  readonly modo: string;
  readonly estado: "escribe" | "responde" | "ausente";
  /** Palabras clave que este modo consume; vacío en el camino por defecto y en las ausentes. */
  readonly claves: readonly string[];
  readonly entradas: readonly CadCommandInput[];
  readonly entidades?: readonly CadEntity[];
  readonly espera?: RegExp;
  /** Ausentes: la frase con la que el módulo lo declara, para que no sea un silencio. */
  readonly declarado?: string;
}

const linea: CadEntity = { id: "linea", type: "line", layer: "0", start: { x: 0, y: 0 }, end: { x: 200, y: 0 } } as CadEntity;
const polilinea: CadEntity = {
  id: "poli",
  type: "polyline",
  layer: "0",
  vertices: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 150 }],
  closed: false,
} as unknown as CadEntity;

/** Los cinco caminos que comparten BOX y WEDGE (el mismo descriptor de esquinas). */
const CAMINOS_ESQUINA = (orden: string): Modo[] => [
  { orden, modo: "esquina, esquina opuesta y altura", estado: "escribe", claves: [], entradas: [punto(0, 0), punto(100, 60), distancia(40)] },
  { orden, modo: "Centro", estado: "escribe", claves: ["Centro"], entradas: [clave("Centro"), punto(0, 0), punto(50, 30), distancia(40)] },
  { orden, modo: "Cubo", estado: "escribe", claves: ["Cubo"], entradas: [punto(0, 0), clave("Cubo"), distancia(50)] },
  { orden, modo: "Longitud", estado: "escribe", claves: ["Longitud"], entradas: [punto(0, 0), clave("Longitud"), distancia(100), distancia(60), distancia(40)] },
  {
    orden,
    modo: "altura por 2Puntos",
    estado: "escribe",
    claves: ["2Puntos"],
    entradas: [punto(0, 0), punto(100, 60), clave("2Puntos"), punto(0, 0), punto(0, 40)],
  },
];

/** Los seis caminos de base y altura que comparten CYLINDER y CONE. */
const CAMINOS_REDONDO = (orden: string): Modo[] => [
  { orden, modo: "centro y radio", estado: "escribe", claves: [], entradas: [punto(0, 0), distancia(50), distancia(80)] },
  { orden, modo: "Diámetro", estado: "escribe", claves: ["Diámetro"], entradas: [punto(0, 0), clave("Diámetro"), distancia(100), distancia(80)] },
  { orden, modo: "2Puntos (el diámetro)", estado: "escribe", claves: ["2Puntos"], entradas: [clave("2Puntos"), punto(-50, 0), punto(50, 0), distancia(80)] },
  {
    orden,
    modo: "3Puntos (la circunferencia)",
    estado: "escribe",
    claves: ["3Puntos"],
    entradas: [clave("3Puntos"), punto(-50, 0), punto(50, 0), punto(0, 50), distancia(80)],
  },
  {
    orden,
    modo: "Elíptico",
    estado: "escribe",
    claves: ["Elíptico"],
    entradas: [clave("Elíptico"), punto(-50, 0), punto(50, 0), punto(0, 30), distancia(80)],
  },
  {
    orden,
    modo: "altura por 2Puntos",
    estado: "escribe",
    claves: ["2Puntos"],
    entradas: [punto(0, 0), distancia(50), clave("2Puntos"), punto(0, 0), punto(0, 80)],
  },
  {
    orden,
    modo: "Ttr (tangente-tangente-radio)",
    estado: "ausente",
    claves: [],
    entradas: [clave("Ttr")],
    declarado: "**Ttr** (tangente-tangente-radio)",
  },
];

const MODOS: readonly Modo[] = [
  ...CAMINOS_ESQUINA("BOX"),
  ...CAMINOS_ESQUINA("WEDGE"),
  ...CAMINOS_REDONDO("CYLINDER"),
  ...CAMINOS_REDONDO("CONE"),
  {
    orden: "CONE",
    modo: "radio Superior (tronco)",
    estado: "escribe",
    claves: ["radio Superior"],
    entradas: [punto(0, 0), distancia(50), clave("radio Superior"), distancia(20), distancia(80)],
  },
  { orden: "SPHERE", modo: "centro y radio", estado: "escribe", claves: [], entradas: [punto(0, 0), distancia(50)] },
  { orden: "SPHERE", modo: "Diámetro", estado: "escribe", claves: ["Diámetro"], entradas: [punto(0, 0), clave("Diámetro"), distancia(100)] },
  { orden: "TORUS", modo: "centro, radio del toro y radio del tubo", estado: "escribe", claves: [], entradas: [punto(0, 0), distancia(100), distancia(20)] },
  { orden: "TORUS", modo: "Diámetro del toro", estado: "escribe", claves: ["Diámetro"], entradas: [punto(0, 0), clave("Diámetro"), distancia(200), distancia(20)] },
  { orden: "TORUS", modo: "Diámetro del tubo", estado: "escribe", claves: ["Diámetro"], entradas: [punto(0, 0), distancia(100), clave("Diámetro"), distancia(40)] },
  {
    orden: "TORUS",
    modo: "tubo mayor que el toro (se corta a sí mismo)",
    estado: "responde",
    claves: [],
    entradas: [punto(0, 0), distancia(100), distancia(120)],
    espera: /debe ser menor que el radio del toro[\s\S]*todavía no está disponible/,
  },
  { orden: "PYRAMID", modo: "centro y radio", estado: "escribe", claves: [], entradas: [punto(0, 0), distancia(50), distancia(80)] },
  { orden: "PYRAMID", modo: "Lados", estado: "escribe", claves: ["Lados"], entradas: [clave("Lados"), distancia(6), punto(0, 0), distancia(50), distancia(80)] },
  { orden: "PYRAMID", modo: "Inscrito", estado: "escribe", claves: ["Inscrito"], entradas: [punto(0, 0), clave("Inscrito"), distancia(50), distancia(80)] },
  {
    orden: "PYRAMID",
    modo: "Circunscrito",
    estado: "escribe",
    claves: ["Inscrito", "Circunscrito"],
    entradas: [punto(0, 0), clave("Inscrito"), clave("Circunscrito"), distancia(50), distancia(80)],
  },
  { orden: "PYRAMID", modo: "Diámetro", estado: "escribe", claves: ["Diámetro"], entradas: [punto(0, 0), clave("Diámetro"), distancia(100), distancia(80)] },
  { orden: "PYRAMID", modo: "Arista de la base", estado: "escribe", claves: ["Arista"], entradas: [clave("Arista"), punto(0, 0), punto(60, 0), distancia(80)] },
  {
    orden: "PYRAMID",
    modo: "radio Superior (tronco)",
    estado: "escribe",
    claves: ["radio Superior"],
    entradas: [punto(0, 0), distancia(50), clave("radio Superior"), distancia(20), distancia(80)],
  },
  {
    orden: "PYRAMID",
    modo: "altura por 2Puntos",
    estado: "escribe",
    claves: ["2Puntos"],
    entradas: [punto(0, 0), distancia(50), clave("2Puntos"), punto(0, 0), punto(0, 80)],
  },
  { orden: "POLYSOLID", modo: "recorrido al vuelo", estado: "escribe", claves: [], entradas: [punto(0, 0), punto(200, 0), intro] },
  { orden: "POLYSOLID", modo: "Objeto (línea)", estado: "escribe", claves: ["Objeto"], entradas: [clave("Objeto"), designar("linea")], entidades: [linea] },
  { orden: "POLYSOLID", modo: "Objeto (polilínea)", estado: "escribe", claves: ["Objeto"], entradas: [clave("Objeto"), designar("poli")], entidades: [polilinea] },
  { orden: "POLYSOLID", modo: "Altura", estado: "escribe", claves: ["Altura"], entradas: [clave("Altura"), distancia(120), punto(0, 0), punto(200, 0), intro] },
  { orden: "POLYSOLID", modo: "Ancho", estado: "escribe", claves: ["Ancho"], entradas: [clave("Ancho"), distancia(15), punto(0, 0), punto(200, 0), intro] },
  {
    orden: "POLYSOLID",
    modo: "Justificación Izquierda",
    estado: "escribe",
    claves: ["Justificación", "Izquierda"],
    entradas: [clave("Justificación"), clave("Izquierda"), punto(0, 0), punto(200, 0), intro],
  },
  {
    orden: "POLYSOLID",
    modo: "Justificación Centro",
    estado: "escribe",
    claves: ["Justificación", "Centro"],
    entradas: [clave("Justificación"), clave("Centro"), punto(0, 0), punto(200, 0), intro],
  },
  {
    orden: "POLYSOLID",
    modo: "Justificación Derecha",
    estado: "escribe",
    claves: ["Justificación", "Derecha"],
    entradas: [clave("Justificación"), clave("Derecha"), punto(0, 0), punto(200, 0), intro],
  },
  { orden: "POLYSOLID", modo: "Cerrar", estado: "escribe", claves: ["Cerrar"], entradas: [punto(0, 0), punto(200, 0), punto(200, 150), clave("Cerrar")] },
  {
    orden: "POLYSOLID",
    modo: "desHacer",
    estado: "escribe",
    claves: ["desHacer"],
    entradas: [punto(0, 0), punto(200, 0), punto(200, 150), clave("desHacer"), punto(200, 90), intro],
  },
  { orden: "POLYSOLID", modo: "Arco tangente", estado: "escribe", claves: ["Arco"], entradas: [punto(0, 0), punto(200, 0), clave("Arco"), punto(260, 60), intro] },
  {
    orden: "POLYSOLID",
    modo: "Línea (volver del arco)",
    estado: "escribe",
    claves: ["Arco", "Línea"],
    entradas: [punto(0, 0), punto(200, 0), clave("Arco"), punto(260, 60), clave("Línea"), punto(320, 120), intro],
  },
  {
    orden: "POLYSOLID",
    modo: "submodos del Arco (Dirección, Radio, Ángulo, Segundo punto)",
    estado: "ausente",
    claves: [],
    entradas: [punto(0, 0), punto(200, 0), clave("Arco"), clave("Radio")],
    declarado: "Sus submodos (Dirección, Radio, Ángulo, Segundo punto) no se ofrecen",
  },
];

/* ── Tabla B · el veredicto modo a modo ───────────────────────────────────── */

const CABECERA_PRIMITIVAS = fuente("engine/commands/solids-primitives.ts");

for (const fila of MODOS) {
  const nombre = `${fila.orden} · ${fila.modo}`;
  const conducido = conducir(primitiva(fila.orden), fila.entradas, fila.entidades ?? []);
  if (fila.estado === "escribe") escribeDeVerdad(conducido, nombre);
  else if (fila.estado === "responde") respondeDeVerdad(conducido, nombre, fila.espera!);
  else {
    ok(conducido.resultado?.kind !== "document", `${nombre}: forzarlo no escribe en el documento`);
    ok(CABECERA_PRIMITIVAS.includes(fila.declarado!), `${nombre}: el módulo declara por escrito por qué no está («${fila.declarado}»)`);
  }
}

/* ── Tabla B · el candado ─────────────────────────────────────────────────── */

{
  for (const orden of ["BOX", "WEDGE", "CYLINDER", "CONE", "SPHERE", "TORUS", "PYRAMID", "POLYSOLID"]) {
    const descubiertas = teclasOfrecidas(primitiva(orden), [linea, polilinea]);
    const declaradas = new Set(MODOS.filter((fila) => fila.orden === orden).flatMap((fila) => fila.claves));
    ok(
      [...descubiertas].every((tecla) => declaradas.has(tecla)),
      `${orden}: toda opción que la orden ofrece está declarada como modo (sobran ${[...descubiertas].filter((t) => !declaradas.has(t)).join(",") || "ninguna"})`,
    );
    ok(
      [...declaradas].every((tecla) => descubiertas.has(tecla)),
      `${orden}: todo modo declarado se ofrece de verdad (faltan ${[...declaradas].filter((t) => !descubiertas.has(t)).join(",") || "ninguno"})`,
    );
    ok(MODOS.some((fila) => fila.orden === orden && fila.estado === "escribe"), `${orden}: al menos un camino llega a escribir un sólido`);
  }
  // El arco NO se ofrece como primer tramo: no hay dirección de entrada a la
  // que ser tangente. Ofrecerlo sería una opción que no se puede contestar.
  const polysolid = primitiva("POLYSOLID");
  ok(!conducir(polysolid, [punto(0, 0)]).opciones.includes("Arco"), "POLYSOLID no ofrece Arco con un solo punto: no hay tangente de entrada");
  ok(conducir(polysolid, [punto(0, 0), punto(200, 0)]).opciones.includes("Arco"), "y lo ofrece en cuanto hay un tramo del que salir");
  ok(CABECERA_PRIMITIVAS.includes("el PRIMER tramo no puede ser un arco"), "el módulo lo dice por escrito");
}

/* ── El recuento final ────────────────────────────────────────────────────── */

const cuenta = (estado: Modo["estado"]) => MODOS.filter((fila) => fila.estado === estado).length;
ok(MODOS.length === 52, `la tabla recorre los cincuenta y dos caminos de las ocho primitivas (lleva ${MODOS.length})`);
/**
 * Y el contador de cuerpos cerrados, que es el que impide que `escribeDeVerdad`
 * se vuelva un sello de goma: si alguien lo dejara sin comprobar nada, este
 * número caería y el spec lo diría. Son los 48 caminos de primitiva que escriben
 * más los seis sólidos que deja SOLIDEDIT (Extruir, Desfasar, las dos piezas de
 * Separar, Vaciar y Limpiar); Cara·Copiar deja una REGION y Arista·Copiar
 * líneas, que no son cuerpos y no cuentan.
 */
ok(solidosVerificados === 54, `54 sólidos comprobados CERRADOS sobre el árbol persistido (dio ${solidosVerificados})`);
ok(
  cuenta("escribe") === 48 && cuenta("responde") === 1 && cuenta("ausente") === 3,
  `48 caminos escriben un sólido, 1 responde su límite y 3 están declarados ausentes (dio ${cuenta("escribe")}/${cuenta("responde")}/${cuenta("ausente")})`,
);

console.log(
  `frontera del 3D: ${checks} comprobaciones, ${solidosVerificados} sólidos cerrados · SOLIDEDIT ${RAMAS.length} ramas (${RAMAS.filter((f) => f.estado !== "ausente").length} existen, ${RAMAS.filter((f) => f.estado === "ausente").length} declaradas ausentes) · primitivas ${MODOS.length} modos (${cuenta("escribe")} escriben, ${cuenta("responde")} responde, ${cuenta("ausente")} ausentes)`,
);
