import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { globSync } from "glob";

/**
 * 3.4 — DWG SIGUE APAGADO, Y NINGUNA SUPERFICIE VISIBLE LO PROMETE.
 *
 * La exportación DWG está detrás de sus candados y así se queda para el
 * lanzamiento: esta campaña no los toca. Lo que sí comprueba es la otra mitad
 * del trato, que es la que un usuario nota — **que nada en la superficie
 * visible insinúe una compatibilidad que el producto no tiene**.
 *
 * ─── Por qué un gate y no una revisión ─────────────────────────────────────
 *
 * Porque una promesa DWG no se cuela escribiendo «soportamos DWG». Se cuela en
 * una lista de formatos, en un `title` de un botón, en una nota de una guía
 * escrita con prisa. Revisarlo a ojo funciona una vez; un gate funciona cada
 * vez que alguien añade una pantalla.
 *
 * ─── La regla ──────────────────────────────────────────────────────────────
 *
 * La palabra DWG puede aparecer en la superficie pública SÓLO si en su misma
 * frase declara el límite: que no se abre, que no se escribe, que hace falta
 * un proveedor licenciado, o que está en el plan y todavía no. Cualquier otra
 * aparición es una promesa, y una promesa que el producto no cumple es
 * exactamente lo que esta campaña existe para quitar.
 */

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

/**
 * Marcas de LÍMITE DECLARADO. Basta una en la misma frase que el «DWG».
 *
 * `marca de Autodesk` está aquí porque el aviso de marcas del pie NOMBRA a la
 * competencia para posicionarse —lo cual es legítimo— y precisamente niega la
 * afiliación: es el contrario de una promesa.
 */
const LIMIT_MARKERS = [
  /\bno\b[^.]{0,60}\b(abre|abrimos|lee|leemos|escribe|escribimos|promete|soporta|admite)\b/iu,
  /\bno\b[^.]{0,40}\bcompatibilidad\b/iu,
  /\brequiere\b[^.]{0,40}\bproveedor\b/iu,
  /\btodav[íi]a no\b/iu,
  /\bpr[óo]xim(os|as)\s+meses\b/iu,
  /\bmarcas?\b[^.]{0,60}\bautodesk\b/iu,
  /\bautodesk\b[^.]{0,60}\bmarcas?\b/iu,
  /\bbeta\b[^.]{0,60}\b(import|lectura)/iu,
  /\bsólo\b[^.]{0,40}\b(import|lectura)/iu,
  /\bimport(a|ación|ar)?\b[^.]{0,30}\bDXF\b/iu,
  /✕/u,
  // Un ENLACE a la guía «DXF vs DWG» cuenta como declaración: lleva al lector
  // exactamente al documento que explica el límite, que es más honesto que
  // repetir la coletilla en cada sitio donde se nombran los dos formatos.
  /dxf-vs-dwg/u,
];

/**
 * La SUPERFICIE PÚBLICA: lo que ve alguien sin cuenta o recién registrado. El
 * editor entero no entra —sus avisos son contextuales y ya los cubre
 * `DWG_UNAVAILABLE_REASON`—, pero sí las páginas y los componentes de marketing,
 * que es donde una promesa se convierte en expectativa de compra.
 */
const SURFACE_GLOBS = [
  "src/app/**/*.tsx",
  "src/components/marketing/**/*.tsx",
  "src/components/commercial/**/*.tsx",
];

/** Ficheros que declaran el límite POR OFICIO y se leen enteros, no por ventana. */
const LIMIT_DOCUMENTS = new Set(["src/app/docs/dxf-vs-dwg/page.tsx"]);

const files = SURFACE_GLOBS.flatMap((pattern) => globSync(pattern)).sort();
ok(files.length > 10, `la superficie pública tiene ${files.length} archivos que auditar`);

const offenders: string[] = [];
let mentions = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  if (!/\bDWG\b/u.test(source)) continue;

  if (LIMIT_DOCUMENTS.has(file)) {
    // La guía «DXF vs DWG» existe justamente para explicar la diferencia: se
    // lee entera y basta con que declare el límite una vez.
    ok(
      LIMIT_MARKERS.some((marker) => marker.test(source)),
      `«${file}» compara los formatos y declara el límite`,
    );
    continue;
  }

  /*
   * VENTANA DE PROXIMIDAD, no división en frases.
   *
   * La primera versión partía por `.!?;` y producía dos falsos positivos que
   * enseñan por qué: la pregunta del FAQ «¿Puedo abrir mis archivos DWG?»
   * quedaba separada de su respuesta —«No.»— por el propio signo de
   * interrogación, y el texto de un enlace («Leer la guía de DXF y DWG»)
   * quedaba suelto aunque la guía entera declare el límite.
   *
   * Una ventana de 240 caracteres alrededor de la mención captura la
   * declaración esté en la frase anterior, en la siguiente o en el atributo de
   * al lado, que es como está escrita de verdad la superficie. Sigue siendo
   * LOCAL: una declaración tres párrafos más abajo, donde nadie la lee, no
   * entra en la ventana y el gate la rechaza igual.
   */
  const WINDOW = 240;
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/^\s*\/\/.*$/gmu, " ");
  for (const match of withoutComments.matchAll(/\bDWG\b/gu)) {
    mentions += 1;
    const around = withoutComments.slice(
      Math.max(0, match.index - WINDOW),
      match.index + WINDOW,
    );
    if (LIMIT_MARKERS.some((marker) => marker.test(around))) continue;
    offenders.push(`${file}: «${around.replace(/\s+/gu, " ").trim().slice(0, 200)}»`);
  }
}

ok(mentions > 0, `se auditaron ${mentions} menciones de DWG en la superficie`);

if (offenders.length > 0) {
  console.error(
    `Menciones de DWG SIN su límite declarado al lado (${offenders.length}):\n  - ${offenders.join("\n  - ")}`,
  );
}
assert.equal(
  offenders.length,
  0,
  `${offenders.length} mención(es) de DWG prometen compatibilidad que el producto no tiene. ` +
    "O se acompaña del límite en la misma frase, o se quita de la superficie.",
);

/* ── Y EL CANDADO, que es la otra mitad ───────────────────────────────────── */

{
  const flag = readFileSync("src/lib/cad/dwg-export-flag.ts", "utf8");
  ok(
    /DWG_EXPORT_FLAG(\s*:\s*boolean)?\s*=\s*false/u.test(flag),
    "la bandera de exportación DWG nace APAGADA en el código, no sólo en la configuración",
  );
}

console.log(
  `verificación 3.4 (honestidad DWG): ${checks} comprobaciones · ${mentions} menciones auditadas, 0 promesas sin límite`,
);
