/**
 * EL CONTRATO DE LAS SUPERFICIES TRADUCIDAS POR CLAVES.
 *
 * Hasta la campaña sin conexión, «traducir» en este repositorio quería decir
 * elegir un literal EN/ES dentro del componente con `useLocale`. Funciona hasta
 * el día en que hay que cambiar una frase: son dos sitios, nadie los ve juntos,
 * y el que se olvida no rompe nada — simplemente deja media pantalla en el
 * idioma equivocado y no hay forma de enterarse salvo mirándola en los dos
 * idiomas.
 *
 * `/sin-conexion` fue la primera pantalla que salió entera de un namespace, y
 * este spec es lo que impide que el namespace se pudra. Nació como
 * `offline-copy.spec.ts` y hoy gobierna una TABLA de superficies, porque la
 * segunda —el aviso de versión nueva del service worker— merecía las mismas
 * ocho reglas y no una copia de este archivo con otro nombre. Añadir una
 * superficie nueva es añadir una fila.
 *
 * Los cuatro fallos silenciosos que ninguna de ellas puede permitirse, y
 * ninguno rompe el build:
 *
 *   1. UNA CLAVE SÓLO EN UN IDIOMA. next-intl no lanza: el `getMessageFallback`
 *      de `I18nProvider` pinta el último segmento de la clave, así que el
 *      usuario español ve «warningBody» donde iba una frase. Verde en CI.
 *   2. UN VALOR VACÍO. La clave existe, el catálogo cuadra, y la pantalla sale
 *      con un hueco. También verde.
 *   3. UN MARCADOR ICU QUE NO CUADRA. Si el inglés dice `{checkpoints}` y el
 *      español no, la cifra desaparece en español; si el español lo escribe
 *      distinto, se pinta el marcador crudo entre llaves.
 *   4. UNA CLAVE MUERTA. Se traduce con esmero algo que la pantalla ya no
 *      consume. No hace daño y por eso nadie la borra nunca: el catálogo crece
 *      con texto que no se ve y las revisiones de copy se vuelven ruido.
 *
 * Se leen los ARCHIVOS y no los módulos a propósito: el catálogo importado ya
 * pasó por `applyBrandToMessages`, y lo que hay que comparar es lo que está
 * escrito, fichas de marca incluidas.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

interface Superficie {
  /** El namespace, que es también el nombre del archivo en `messages/<locale>/`. */
  namespace: string;
  /** El único archivo que consume esas claves. */
  consumidor: string;
  /** Suelo de claves: una superficie que encoge sola es una superficie que se está muriendo. */
  minimoDeClaves: number;
  /** Marcadores ICU que este namespace debe ejercer. Cero es legítimo. */
  marcadoresMinimos: number;
  /** Lo que el archivo consumidor tiene que decir, con su motivo. */
  exigencias: { patron: RegExp; porque: string }[];
}

const SUPERFICIES: Superficie[] = [
  {
    namespace: "offline",
    consumidor: "src/app/(sw)/sin-conexion/page.tsx",
    minimoDeClaves: 10,
    marcadoresMinimos: 1,
    exigencias: [
      {
        patron: /useTranslations\("offline"\)/,
        porque: "la página debe consumir el namespace por claves, no por literales",
      },
      {
        patron: /robots:\s*\{[^}]*index:\s*false/,
        porque:
          "una pantalla de error de conectividad indexada es ruido: el noindex va en su propio metadata, sin tocar config/site-routes.ts",
      },
    ],
  },
  {
    namespace: "appUpdate",
    consumidor: "src/app/(sw)/ServiceWorkerRegistrar.tsx",
    minimoDeClaves: 4,
    /* Cero marcadores, y es una decisión: el aviso no cita ninguna cifra. La
       versión, el número de build o la fecha del despliegue serían justo el tipo
       de dato que no puede llegar hasta aquí sin inventárselo, y un aviso que
       enseña un número inventado es peor que uno que no enseña ninguno. */
    marcadoresMinimos: 0,
    exigencias: [
      {
        patron: /useTranslations\("appUpdate"\)/,
        porque: "el aviso debe consumir el namespace por claves, no por literales",
      },
      {
        patron: /^"use client";/m,
        porque:
          "el registro del service worker sólo existe en el navegador: sin la directiva, Next lo renderiza en el servidor y `navigator` no está",
      },
    ],
  },
];

const leerCatalogo = (locale: string, namespace: string) =>
  JSON.parse(
    readFileSync(`messages/${locale}/${namespace}.json`, "utf8"),
  ) as Record<string, unknown>;

/** Aplana el catálogo a `ruta.de.la.clave -> valor`, que es como lo pide `t()`. */
function aplanar(
  nodo: Record<string, unknown>,
  prefijo = "",
): Map<string, string> {
  const salida = new Map<string, string>();
  for (const [clave, valor] of Object.entries(nodo)) {
    const ruta = prefijo ? `${prefijo}.${clave}` : clave;
    if (valor && typeof valor === "object" && !Array.isArray(valor)) {
      for (const [k, v] of aplanar(valor as Record<string, unknown>, ruta)) {
        salida.set(k, v);
      }
    } else {
      assert.equal(
        typeof valor,
        "string",
        `la clave ${ruta} no es texto: un catálogo de copy no guarda otra cosa`,
      );
      salida.set(ruta, valor as string);
    }
  }
  return salida;
}

/** `{nombre}` y también el `{nombre, plural, …}` que ICU permite. */
const marcadoresIcu = (texto: string) =>
  [...texto.matchAll(/\{\s*([A-Za-z0-9_]+)\s*[,}]/g)]
    .map((m) => m[1])
    .sort();

/** Fichas de marca (`%PRODUCT_DESIGN%`), que se resuelven antes que el ICU. */
const fichasDeMarca = (texto: string) =>
  [...texto.matchAll(/%[A-Z_]+%/g)].map((m) => m[0]).sort();

let clavesRevisadas = 0;

for (const superficie of SUPERFICIES) {
  const { namespace, consumidor } = superficie;
  const en = aplanar(leerCatalogo("en", namespace));
  const es = aplanar(leerCatalogo("es", namespace));
  const pagina = readFileSync(consumidor, "utf8");
  clavesRevisadas += en.size;

  /* ── 1 · EL MISMO JUEGO DE CLAVES ──────────────────────────────────────── */
  {
    const soloEn = [...en.keys()].filter((k) => !es.has(k)).sort();
    const soloEs = [...es.keys()].filter((k) => !en.has(k)).sort();
    assert.deepEqual(soloEn, [], `${namespace}: claves sin traducir al español: ${soloEn}`);
    assert.deepEqual(soloEs, [], `${namespace}: claves que sobran en español: ${soloEs}`);
    assert.ok(
      en.size >= superficie.minimoDeClaves,
      `el namespace ${namespace} se quedó en ${en.size} claves`,
    );
  }

  /* ── 2 · NINGÚN VALOR VACÍO ────────────────────────────────────────────── */
  for (const [catalogo, mapa] of [
    ["en", en],
    ["es", es],
  ] as const) {
    for (const [clave, valor] of mapa) {
      assert.ok(
        valor.trim().length > 0,
        `${catalogo}/${namespace}.json: la clave ${clave} está vacía`,
      );
    }
  }

  /* ── 3 · LOS MISMOS MARCADORES ICU Y LAS MISMAS FICHAS DE MARCA ────────── */
  for (const [clave, textoEn] of en) {
    const textoEs = es.get(clave) as string;
    assert.deepEqual(
      marcadoresIcu(textoEs),
      marcadoresIcu(textoEn),
      `${namespace}: marcadores ICU distintos en ${clave}: en=${marcadoresIcu(textoEn)} es=${marcadoresIcu(textoEs)}`,
    );
    assert.deepEqual(
      fichasDeMarca(textoEs),
      fichasDeMarca(textoEn),
      `${namespace}: fichas de marca distintas en ${clave}`,
    );
  }

  /* ── 4 · SE TRADUJO DE VERDAD ────────────────────────────────────────────
     Un catálogo español copiado del inglés pasa las tres reglas anteriores sin
     despeinarse. Se excluyen las claves cuyo texto coincide por ser el mismo en
     los dos idiomas; hoy no hay ninguna, y el día que la haya se declara aquí. */
  {
    const IGUALES_A_PROPOSITO: string[] = [];
    const sinTraducir = [...en.entries()]
      .filter(
        ([clave, textoEn]) =>
          !IGUALES_A_PROPOSITO.includes(clave) && es.get(clave) === textoEn,
      )
      .map(([clave]) => clave);
    assert.deepEqual(
      sinTraducir,
      [],
      `${namespace}: estas claves son idénticas en los dos catálogos: ${sinTraducir}`,
    );
  }

  /* ── 5 · NINGUNA CLAVE MUERTA ────────────────────────────────────────────
     Cada clave del namespace tiene que aparecer en su consumidor como
     `t("clave")`. Es la mitad que le falta a la comprobación habitual: los
     catálogos pueden cuadrar perfectamente entre sí y describir una pantalla
     que ya no existe. */
  {
    const huerfanas = [...en.keys()].filter(
      (clave) => !pagina.includes(`t("${clave}")`) && !pagina.includes(`t("${clave}",`),
    );
    assert.deepEqual(
      huerfanas,
      [],
      `claves del namespace ${namespace} que ${consumidor} no consume: ${huerfanas}`,
    );
  }

  /* ── 6 · CADA MARCADOR RECIBE SU VALOR ───────────────────────────────────
     Un `t("clave")` sin el segundo argumento deja el `{marcador}` crudo en
     pantalla. next-intl no lo considera un error, así que lo comprueba esto. */
  {
    const nombres = new Set([...en.values()].flatMap(marcadoresIcu));
    for (const nombre of nombres) {
      assert.ok(
        new RegExp(`\\b${nombre}\\s*:`).test(pagina),
        `${consumidor} no le pasa valor al marcador {${nombre}}`,
      );
    }
    assert.ok(
      nombres.size >= superficie.marcadoresMinimos,
      `el namespace ${namespace} debería ejercer al menos ${superficie.marcadoresMinimos} marcador(es) ICU`,
    );
  }

  /* ── 7 · EL CONSUMIDOR NO ESCRIBE COPY NI COLOR ──────────────────────────
     Dos reglas de la casa aplicadas a estas superficies: nada de hex fuera de
     globals.css y ningún tamaño fuera de la escala. Más lo que cada una tiene
     que declarar por su cuenta. */
  {
    assert.deepEqual(
      [...pagina.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]),
      [],
      `hex suelto en ${consumidor}: el color sale de tokens`,
    );
    assert.deepEqual(
      [...pagina.matchAll(/text-\[[0-9.]+(?:px|rem)\]/g)].map((m) => m[0]),
      [],
      `tamaño fuera de la escala en ${consumidor}`,
    );
    for (const exigencia of superficie.exigencias) {
      assert.match(pagina, exigencia.patron, `${consumidor}: ${exigencia.porque}`);
    }
  }

  /* ── 8 · EL NAMESPACE ESTÁ ENCHUFADO ─────────────────────────────────────
     Un JSON perfecto que nadie importa no llega a next-intl. */
  for (const locale of ["en", "es"] as const) {
    const indice = readFileSync(`messages/${locale}.ts`, "utf8");
    assert.match(
      indice,
      new RegExp(`from "\\./${locale}/${namespace}\\.json"`),
      `messages/${locale}.ts no importa el namespace ${namespace}`,
    );
    assert.match(
      indice,
      new RegExp(`\\b${namespace}\\b\\s*,`),
      `messages/${locale}.ts no expone el namespace ${namespace}`,
    );
  }
}

/* ── 9 · NINGUNA SUPERFICIE SE QUEDA SIN VIGILAR ─────────────────────────────
   La tabla de arriba tiene que cubrir TODOS los namespaces de los catálogos. Sin
   esto, añadir `messages/en/loquesea.json` y olvidarse de la fila deja un
   namespace entero sin ninguna de las ocho reglas — que es exactamente cómo se
   pudre un catálogo. `language` es la excepción declarada: son las etiquetas
   nativas del conmutador EN/ES («English», «Español»), que por definición no se
   traducen y romperían la regla 4. */
{
  const SIN_VIGILAR = ["language"];
  const indice = readFileSync("messages/en.ts", "utf8");
  const declarados = [...indice.matchAll(/from "\.\/en\/([A-Za-z0-9]+)\.json"/g)].map(
    (m) => m[1],
  );
  const vigilados = new Set([...SUPERFICIES.map((s) => s.namespace), ...SIN_VIGILAR]);
  const huerfanos = declarados.filter((namespace) => !vigilados.has(namespace));
  assert.deepEqual(
    huerfanos,
    [],
    `estos namespaces no tienen fila en este spec: ${huerfanos}`,
  );
  assert.ok(declarados.length >= SUPERFICIES.length, "el barrido de namespaces falló");
}

console.log(
  `key-driven-copy: ${clavesRevisadas} claves en en/es sobre ${SUPERFICIES.length} superficies (${SUPERFICIES.map((s) => s.namespace).join(", ")}), todas consumidas.`,
);
