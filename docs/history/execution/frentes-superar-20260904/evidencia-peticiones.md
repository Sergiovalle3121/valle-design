# Peticiones de F11 · Evidencia independiente

Lo que este frente necesita **fuera de su territorio** (R1) o en un **archivo compartido**
(R2). El coordinador las aplica en la ventana de integración; el frente **no** las toca.

Formato de cada petición:

```
### P-evidencia-NN · <título>
- **Archivo:** <ruta exacta>
- **Por qué:** <qué entrega de la cola lo necesita>
- **Cambio exacto:** <diseño completo — el coordinador no adivina>
- **Cómo se comprueba:** <la spec o el gate que lo demuestra>
- **Estado:** pendiente | aplicada | rechazada (<motivo>)
```

## Peticiones

### P-evidencia-01 · La cifra de casos numéricos está escrita a mano en la superficie pública
- **Archivo:** `apps/web/src/lib/marketing/use-cases.ts` (línea 116)
- **Por qué:** La regla 4 de la campaña de cimientos dice que ninguna cifra vive en dos
  lugares. `site-evidence.ts` ya lee `docs/cad/evidence/cad-math-cases.json` como debe;
  `use-cases.ts` repite el número a mano. Al regenerar el artefacto (10 suites/761 casos
  era estado de otra campaña; hoy son 14 suites/1038 casos) el literal quedó **falso**.
  Era un defecto antes de este frente: el artefacto llevaba tiempo desactualizado y nadie
  lo notó porque el literal no está atado a nada.
- **Cambio exacto:** en `apps/web/src/lib/marketing/use-cases.ts`, sustituir el texto

  ```ts
          detalle:
            "Entrada por coordenadas absolutas y relativas, y una precisión " +
            "verificada contra oráculo: 761 casos numéricos en cada corrida de " +
            "integración continua, cero desviaciones toleradas.",
  ```

  por una composición que lea la cifra medida:

  ```ts
          detalle:
            "Entrada por coordenadas absolutas y relativas, y una precisión " +
            `verificada contra oráculo: ${mathCases.totalCases} casos numéricos en cada ` +
            "corrida de integración continua, cero desviaciones toleradas.",
  ```

  con el import `import mathCases from "../../../../../docs/cad/evidence/cad-math-cases.json";`
  al principio del archivo — exactamente el mismo que `site-evidence.ts` ya usa, así que
  webpack lo inlina en build y no aparece `fs` en runtime.
- **Cómo se comprueba:** `npm run typecheck`, y `node scripts/cad/check-cad-math.mjs --write`
  seguido de `git diff --exit-code apps/web/src/lib/marketing/use-cases.ts` — si el número
  vuelve a estar a mano, cambiar el artefacto deja de propagarse y la cifra pública miente.
- **Estado:** pendiente

### P-evidencia-02 · `check:corpus-terceros` encadenado a `check:cad`
- **Archivo:** `package.json` de la raíz (archivo compartido, R2)
- **Por qué:** El corpus de terceros (`docs/cad/corpus/`) sólo vale si su puerta de derechos
  corre en cada gate. Hoy su spec corre por dos vías (`npm test` la recoge bajo
  `src/**/*.spec.ts`, y `check:cad-math` la ejecuta y suma sus 137 comprobaciones), lo cual
  ya la protege. Esta petición es para que el corpus tenga **nombre propio** en el gate y un
  rojo se lea «los derechos del corpus no cuadran» en vez de «una suite de matemática».
- **Cambio exacto:** añadir a `scripts`:

  ```json
  "check:corpus-terceros": "cd apps/web && npx tsx src/lib/cad/verification/dxf-corpus-terceros.spec.ts"
  ```

  No hace falta encadenarlo a `check:cad`: `check:cad-math`, que ya está encadenado, lo
  ejecuta. Encadenarlo dos veces sólo duplicaría el coste.
- **Cómo se comprueba:** `npm run check:corpus-terceros` imprime
  «corpus de terceros: 137 comprobaciones · 19 archivos ajenos de 2 fuentes» y sale 0.
- **Estado:** pendiente

### P-evidencia-03 · Firma humana de derechos del corpus de terceros
- **Archivo:** `docs/cad/corpus/manifest.json` → `derechos.firmaHumana` (territorio de F11:
  **esta petición no es de archivo, es de FIRMA**; el frente puede escribir el JSON pero no
  puede firmar por una persona)
- **Por qué:** El criterio `dxf.corpus-external` de la rúbrica (2 pt) pide, además del
  artefacto, una evidencia `manual` con `verifiedBy` y `verifiedAt`. Hoy falla con
  «evidencia manual sin firma o sin fecha», y falla con razón. El dictamen automático está
  completo: las dos fuentes publican MIT, el texto de cada licencia está descargado,
  hasheado y versionado en `docs/cad/corpus/licencias/`, y el spec comprueba que el aviso
  de copyright del titular está dentro de ese texto. Lo que falta es que una persona lea
  ese dictamen y lo firme.
- **Cambio exacto:** el titular revisa `docs/cad/corpus/README.md` (regla de admisión),
  `EXCLUIDOS.md` (lo rechazado y por qué) y `manifest.json` (las dos licencias y los
  diecinueve archivos), y si está conforme escribe en `manifest.json`:

  ```json
  "firmaHumana": {
    "firmadoPor": "Sergio Valle Zárate",
    "firmadoEl": "<AAAA-MM-DD>",
    "nota": "Revisadas las dos licencias MIT y su cobertura sobre los ficheros de prueba de cada repositorio; revisado el rechazo de Ceco.NET-Architecture-Tm-53.dxf."
  }
  ```

  El spec ya contempla las dos ramas: sin firma exige que la nota diga «TODAVÍA NO»; con
  firma exige fecha legible.
- **Cómo se comprueba:** `npm run check:corpus-terceros` sigue verde, y la evidencia
  `manual` de P-evidencia-04 deja de fallar.
- **Estado:** pendiente — **bloquea 2 pt**

### P-evidencia-04 · `dxf.corpus-external`: apuntar la rúbrica al corpus que ya existe
- **Archivo:** `docs/competitive/rubric.json` (archivo compartido, R2 — **nunca lo edita el frente**)
- **Por qué:** El criterio vale 2 pt y hoy su única evidencia de artefacto es
  `docs/cad/evidence/dxf-external-corpus-matrix.json`, que el propio archivo declara
  **sintético**: «Imitar un dialecto NO es haberlo recibido». Es honesto y por eso hay que
  sustituirlo, no borrarlo. El corpus ajeno ya está en el árbol con sus derechos escritos.
- **Cambio exacto:** en el criterio `dxf.corpus-external`, sustituir el bloque `evidence`
  por:

  ```json
          "evidence": [
            {
              "kind": "file",
              "path": "docs/cad/corpus/manifest.json",
              "independent": true
            },
            {
              "kind": "spec",
              "path": "apps/web/src/lib/cad/verification/dxf-corpus-terceros.spec.ts"
            },
            {
              "kind": "file",
              "path": "docs/cad/evidence/dxf-corpus-terceros-matrix.json",
              "independent": true
            },
            {
              "kind": "manual",
              "verifiedBy": "",
              "verifiedAt": "",
              "note": "Derechos de los diecinueve archivos ajenos: dos licencias MIT descargadas y hasheadas en docs/cad/corpus/licencias/. Falta la firma del titular (P-evidencia-03)."
            }
          ]
  ```

  **Orden de aplicación: ya no hay bloqueo.** La tercera entrada apunta a la matriz de
  fidelidad, que **ya existe** desde el segundo entregable de este frente
  (`docs/cad/evidence/dxf-corpus-terceros-matrix.json`, verificada por
  `dxf-fidelidad-terceros.spec.ts`, 80 comprobaciones). Las cuatro entradas se pueden
  aplicar de una vez.

  **Lo que NO se pide:** quitar la evidencia `manual`. Sustituir una revisión humana de
  derechos por una comprobación automática sería relajar un gate legal. Se queda, y se
  firma o no se concede.
- **Cómo se comprueba:** `node scripts/cad/rubric.mjs` — la fila «Import/export DXF de
  texto» pasa de 10/12 a 12/12 el día que la firma exista, y `EVIDENCIA:` sube 2 pt de
  independiente.
- **Estado:** pendiente (parcialmente aplicable ya)

### P-evidencia-05 · Las 31 filas con tope por independencia, censadas y con su parche
- **Archivo:** `docs/competitive/rubric.json` (archivo compartido, R2)
- **Censo completo:** `docs/cad/evidence/independencia-por-fila.json`, **generado** por
  `apps/web/src/lib/cad/verification/independencia-rubrica.spec.ts` desde
  `scripts/cad/rubric.mjs`. Las 31 filas no están escritas a mano en ninguna parte: salen de
  `scoreRubric()` sobre el árbol de hoy, cumpliendo la regla 4. Lo único escrito a mano es el
  dictamen —qué criterio es el candidato y si el material ajeno puede servirlo—, y está atado
  por los dos lados: una fila con tope sin dictamen falla el spec, y un dictamen de una fila
  que ya no tiene tope, también.
- **Por qué:** `node scripts/cad/rubric.mjs` dice hoy «31 fila(s) retienen 1 pt por
  carecer de evidencia independiente» y no dice cuáles ni qué hacer con ellas. Cada una recupera
  su punto en cuanto UNO de sus criterios ya concedidos lleve una evidencia `independent: true`
  que verifique. No es un punto regalado: la evidencia tiene que existir, verificar y ser de
  fuera.

#### El reparto, medido

> **CORREGIDO EL 2026-09-05.** Este bloque decía «6 servibles» y decía 239/271. Son **5** y
> **238/271**. La fila `dimensions` bajó a `bloqueado_por_defecto_medido` porque
> `terceros-cota-sombreado.spec.ts` midió, sobre un fichero ajeno de dos cotas, que cada cota
> llega con su rótulo escrito DOS VECES y sin un aviso (P-evidencia-11). La medida de 80 y 30
> sigue siendo correcta y sigue estando; lo que no se puede es cobrar el tope de «Cotas
> asociativas» con un defecto silencioso encima, que es lo que este mismo censo le negó a
> `layers` y a `integrity`. Las cifras de abajo son las de hoy, recalculadas por el spec.

> **AMPLIADO EL 2026-09-05 (tarde).** La fila `brep` sube de
> `el_corpus_de_hoy_no_lo_alcanza` a **`servible_hoy`**, y es el censo cobrándose su propia
> nota: aquella entrada pedía, por su nombre, «un lector STEP de terceros (`steputils` o
> pythonocc en PyPI)». El quinto entregable lo cableó. Son **6** servibles y **239/271**.
> Las cifras de abajo son las de hoy, recalculadas por el spec.

De las 31 filas, **6 se pueden servir hoy** con material que ya está en el
árbol y que ya verifica. Las otras 25 no, y el censo dice por qué cada una, con este
vocabulario:

| Veredicto | Filas | Qué significa |
| --- | --- | --- |
| `servible_hoy` | 6 | Hay un testigo ajeno en el árbol y dice que SÍ. Parche abajo. |
| `bloqueado_por_defecto_medido` | 5 | Hay un testigo ajeno en el árbol y dice que **NO**. |
| `el_corpus_de_hoy_no_lo_alcanza` | 14 | El material ajeno del árbol no llega; lo que sí llegaría va nombrado. |
| `no_lo_sirve_material_ajeno` | 6 | Ningún fichero de terceros puede atestiguarlo: falta un usuario real. |

**El efecto, MEDIDO sobre una copia en memoria** (el archivo compartido no se tocó: el spec clona
la rúbrica, le aplica estos seis parches y vuelve a llamar a `scoreRubric()`):

| | antes | después |
|---|---|---|
| TOTAL | 233/271 (86 %) | **239/271 (88.2 %)** |
| ALCANCE DE HOY | 176/197 | **181/197** |
| pt con evidencia independiente | 5 | **16** |
| filas que retienen 1 pt | 31 | **25** |

#### Los seis parches, uno por fila

#### draw-2d · Dibujo 2D y precisión — 15/16 → 16

- **Criterio:** `draw-2d.canonical` — se añaden al final de su array `evidence`:

  ```json
  [
    {
      "kind": "file",
      "path": "docs/cad/evidence/dxf-corpus-terceros-matrix.json",
      "independent": true
    }
  ]
  ```

- **Por qué ese criterio:** Es el criterio que enumera las seis entidades (línea, polilínea, círculo, arco, elipse, spline), y las seis están en el corpus ajeno con veredicto por entidad.
- **Qué dice el testigo:** La matriz cubre las seis: LINE en siete archivos, LWPOLYLINE en cuatro y POLYLINE en dos, CIRCLE en tres, ARC en uno, ELLIPSE en gdsestimating/ellipse.dxf y SPLINE en dos. Veredicto intacto en todas salvo SPLINE de bjnortier (degradado: dos venían fuera del plano del suelo) y las de blocks2.dxf, que es el archivo entero el que no se analiza.
- **Hasta dónde llega y hasta dónde no:** La matriz mide la ENTRADA de esas entidades al documento canónico, no que se dibujen bien en pantalla ni que el comando las cree. Eso lo sostienen los specs propios que el criterio ya tenía; el testigo ajeno añade que los seis tipos sobreviven al viaje desde un fichero que no escribimos.

#### foreign-work · Trabajo ajeno: tomar el plano de otro y trabajar sobre él — 5/6 → 6

- **Criterio:** `foreign-work.properties` — se añaden al final de su array `evidence`:

  ```json
  [
    {
      "kind": "spec",
      "path": "apps/web/src/lib/cad/verification/terceros-jornada.spec.ts",
      "independent": true
    },
    {
      "kind": "file",
      "path": "docs/cad/evidence/jornada-plano-ajeno.json"
    }
  ]
  ```

- **Por qué ese criterio:** Su texto termina en «tecleados sobre un plano ajeno», y hasta ahora el plano ajeno lo sembraba la propia prueba.
- **Qué dice el testigo:** La jornada abre bjnortier-dxf/floorplan.dxf (R2004, 1,1 MB, 1109 entidades), mide 3.065 magnitudes contra ezdxf sobre los mismos bytes con desviación peor por debajo de 1e-12, modifica con MOVE/LINE/ERASE del registro de producción, exporta 1101 entidades y las vuelve a leer con dxf-parser.
- **Hasta dónde llega y hasta dónde no:** La jornada conduce MOVE, LINE y ERASE, no SELECTSIMILAR ni ADDSELECTED ni XPLODE. Los comandos que el criterio enumera siguen sostenidos por sus specs propios; lo que el testigo ajeno añade es que el PLANO sobre el que se trabaja ya no lo escribimos nosotros.
- **Ya diseñado en:** P-evidencia-10 (mismo bloque; aquí queda para que el censo esté completo).

#### ~~dimensions · Cotas asociativas~~ — RETIRADO EL 2026-09-05

El parche de esta fila estaba escrito y medido, y se retira **antes** de que nadie lo aplique.
`terceros-cota-sombreado.spec.ts` midió sobre `bjnortier-dxf/dimensions.dxf` que cada cota ajena
llega con su número **escrito dos veces** —el que la cota dibuja sola y el MTEXT que el lector
saca del bloque de dibujo, en el mismo punto y con la misma altura—: nueve entidades donde
`ezdxf` cuenta siete, y ningún aviso que lo diga.

Lo que el testigo dice a favor sigue en pie y no se borra: ezdxf lee 63 DIMENSION en el plano
ajeno y da sus 63 medidas, el producto las trae, las escribe y `dxf-parser` las reencuentra
dentro de 1,5e-6 por segmento; sobre `dimensions.dxf`, ezdxf mide 80 y 30 y el producto recalcula
80 y 30. **Lo que no se puede es cobrar el tope de una fila con un defecto silencioso medido
sobre su propio objeto.** El parche vuelve —tal cual estaba, más
`terceros-cota-sombreado.spec.ts`— en cuanto entre **P-evidencia-11**.

#### blocks · Bloques y atributos — 8/9 → 9

- **Criterio:** `blocks.dxf` — se añaden al final de su array `evidence`:

  ```json
  [
    {
      "kind": "file",
      "path": "docs/cad/evidence/dxf-corpus-terceros-matrix.json",
      "independent": true
    },
    {
      "kind": "spec",
      "path": "apps/web/src/lib/cad/verification/terceros-jornada.spec.ts",
      "independent": true
    }
  ]
  ```

- **Por qué ese criterio:** Es el criterio de ida y vuelta de INSERT, y los INSERT del plano ajeno hacen el viaje entero con los dos oráculos mirando.
- **Qué dice el testigo:** Los dos oráculos cuentan 10 INSERT en floorplan.dxf, el lector trae 10 y dxf-parser reencuentra 10 en lo que exportamos; ezdxf abre ese fichero y no audita ni un error sobre ellos. La matriz añade el caso incómodo: blocks1.dxf entra DEGRADADO —un bloque con escala distinta en X y en Y sobre geometría circular sale con círculos del radio promedio— y lo declara.
- **Hasta dónde llega y hasta dónde no:** blocks2.dxf, uno de los diecinueve, no lo analiza nuestro lector en absoluto (`parse_failed`): sus INSERT, LINE y LWPOLYLINE constan como pérdida DECLARADA, no silenciosa. El parche no tapa eso; la matriz lo publica. **Desde el 2026-09-05 la causa está medida y es una sola**: `$XCLIPFRAME` = 2 en la cabecera, valor legítimo desde AutoCAD 2010 que `dxf-parser` no admite —y el lector comparte ese analizador—. Normalizado ese par en memoria, el fichero entra completo con su anidado de dos niveles, su ARC y su ELLIPSE (P-evidencia-13, con el arreglo probado).

#### brep · Modelo 3D y sólidos B-rep FACETADO — 6/7 → 7

- **Criterio:** `brep.interop` — se añaden al final de su array `evidence`:

  ```json
  [
    {
      "kind": "spec",
      "path": "apps/web/src/lib/cad/verification/oraculos-externos.spec.ts",
      "independent": true
    },
    {
      "kind": "file",
      "path": "docs/cad/corpus/oraculos/steputils-0.1.json",
      "independent": true
    }
  ]
  ```

- **Por qué ese criterio:** STEP e IGES son formatos normalizados con lectores ajenos maduros; es el único criterio de la fila que sale del proyecto.
- **Qué dice el testigo:** `steputils` 0.1 (MIT, PyPI, Manfred Moitzi) —un analizador de la parte 21 que no comparte una línea con `step-export.ts`— lee los cinco sólidos que exportamos y **cuenta lo mismo que el kernel**: 163 vértices uno a uno con sus coordenadas, 311 longitudes de arista, y los `VERTEX_POINT` / `EDGE_CURVE` / `ORIENTED_EDGE` / `ADVANCED_FACE` / `CLOSED_SHELL` / `MANIFOLD_SOLID_BREP` de cada fichero. Con **sus** números, no con los nuestros, sale la característica de Euler-Poincaré de los cinco: género 0 en la caja y el tetraedro, género 1 en la caja con agujero pasante, en el tubo de revolución y en la placa nacida de una booleana. Hasta el 2026-09-05 el único lector que había leído nuestro STEP era el nuestro.
- **Hasta dónde llega y hasta dónde no:** Tres límites, ninguno tapado. (1) El criterio se llama «STEP e IGES en los dos sentidos» y el oráculo sólo cubre **STEP**: para IGES no se encontró lector ajeno con licencia admisible. (2) `steputils` es un **analizador, no un kernel**: confirma que el fichero es parte 21 válida y que su topología cierra, no que un CAD mecánico comercial reconstruya el sólido — el que lo haría, `pythonocc-core`, es LGPL y `CORPUS_POLICY.md` lo prohíbe. (3) ADR-0016 sigue en pie: el sólido es **facetado**, así que lo que el lector ajeno confirma es la faceta, no la superficie que la generó.

#### modeling3d · Modelado 3D: primitivas, SOLIDEDIT y la cota — 4/5 → 5

- **Criterio:** `modeling3d.z-roundtrip` — NO se añade evidencia: se le pone `"independent": true` a la entrada que YA está.

  ```json
  [
    {
      "kind": "spec",
      "path": "apps/web/src/lib/cad/verification/z-frontiers.spec.ts",
      "independent": true
    }
  ]
  ```

- **Por qué ese criterio:** No hace falta buscarle candidato: el texto del criterio ya termina en «(lector de terceros como oráculo)» y su spec importa `dxf-parser` en la línea 2. La independencia estaba ahí; lo que faltaba era la bandera.
- **Qué dice el testigo:** `z-frontiers.spec.ts` cierra ocho fronteras de la cota escribiendo DXF y leyéndolo con dxf-parser: 30/31 de la LINE, la z del centro de CIRCLE y ARC, la cabecera 30 y los VERTEX de la polilínea elevada, el bit 8 del código 70 de la polilínea 3D, ELLIPSE y SPLINE en WCS, y el SCU reflejado.
- **Hasta dónde llega y hasta dónde no:** Es el único parche del censo que no añade evidencia: sólo pone `independent: true` en una entrada que ya está y que ya verifica. Si alguien discute este punto, discute si `dxf-parser` es de terceros, no si la prueba existe.

#### growth · Capacidad de crecer: las puertas que no se cierran — 7/8 → 8

- **Criterio:** `growth.independent-corpus` — se añaden al final de su array `evidence`:

  ```json
  [
    {
      "kind": "file",
      "path": "docs/cad/corpus/manifest.json",
      "independent": true
    }
  ]
  ```

- **Por qué ese criterio:** El criterio se llama «corpus independiente» y hasta el primer entregable de este frente sólo tenía el MECANISMO (pin y procedimiento de donación). Ahora hay corpus.
- **Qué dice el testigo:** Diecinueve DXF de dos bibliotecas MIT, cinco dialectos (R12, R2004, R2007, R2010, R2013), diecisiete tipos de entidad, con el texto de las dos licencias descargado y hasheado, y una puerta de derechos fail-closed de 137 comprobaciones que incluye un rechazo escrito (Ceco.NET-Architecture-Tm-53.dxf).
- **Hasta dónde llega y hasta dónde no:** El manifiesto acredita que el corpus existe y que sus derechos están dictaminados; NO acredita la firma humana de esos derechos, que sigue vacía a propósito (P-evidencia-03). Y ninguno de los diecinueve lo guardó AutoCAD: acreditan interoperabilidad con implementaciones independientes, no compatibilidad con AutoCAD.

#### Las cuatro que el testigo ajeno BLOQUEA, y por qué eso es lo correcto

Son las más valiosas del censo. En las cuatro **hay** oráculo externo, corre, y **dice que no**.
Cobrar el punto con el testigo callado sería exactamente la inflación que la regla del corte
inventó para impedir; lo que se hace es escribir qué dijo y apuntar a la petición que lo arregla.

| Fila | Puntos | Candidato | Qué falta |
| --- | --- | --- | --- |
| `hatch` | 11/12 | `hatch.dxf` | Aplicar P-evidencia-07 (dos pares de códigos en `dxf-export-hatch.ts`). El arreglo está PROBADO antes de pedirlo: parcheando 170 entidades sobre el texto ya exportado, ezdxf abre el fichero entero y audita cero errores. Cuando eso entre, este parche pasa a `servible_hoy` con `terceros-jornada.spec.ts`. |
| `mtext` | 8/9 | `mtext.dxf` | Aplicar P-evidencia-07 (los mismos dos pares de códigos, en `dxf-export.ts`). Marcar hoy este criterio independiente sería cobrar «viaja en los dos sentidos» con un lector ajeno diciendo que no viaja de vuelta. |
| `layers` | 9/10 | `layers.canonical` | Aplicar P-evidencia-09 (el aviso `layer_table_pruned` en `document-import.ts` y su fila en `WARNING_RULES`). Conceder hoy el tope de «Capas y propiedades» con una poda medida y silenciosa encima sería el caso exacto que la regla del corte inventó para impedir. |
| `integrity` | 12/13 | `integrity.no-silent-loss` | Aplicar P-evidencia-09. La cifra de cabecera de la matriz es buena y este frente la firma; conceder con ella el tope de la fila que se llama «Integridad: el producto hace lo que dice», mientras el propio frente publica una pérdida silenciosa medida, sería la contradicción más cara del censo. |

#### Las que el material ajeno del árbol no alcanza (14)

Ninguna se queda sin salida escrita. El reconocimiento de este frente desmintió la suposición de
que los registros públicos no respondían —`pip3 download ezdxf` bajó 5,8 MB—, así que estos
caminos son alcanzables hoy; lo que falta es el trabajo, no el permiso.

| Fila | Puntos | Candidato | Qué falta |
| --- | --- | --- | --- |
| `layouts` | 9/10 | `layouts.fidelity` | Un lector de PDF de terceros (`pypdf` o `pdfminer.six` en PyPI, o `mutool` de MuPDF) que abra los bytes publicados y mida la escala por su cuenta. Es alcanzable —el reconocimiento comprobó que PyPI responde y bajó ezdxf por ese camino— y el patrón ya existe en este frente: oráculo congelado con su sha256, como el censo de ezdxf. |
| `command-line` | 11/12 | `command-line.alias-table` | La autoridad de acad.pgp es Autodesk y el fichero viaja con AutoCAD: redistribuirlo es una decisión de derechos que no es de este frente. El camino limpio es un tercero libre que publique la misma tabla (LibreCAD y BricsCAD documentan sus equivalencias) y citarlo con su licencia, igual que se hizo con las dos MIT del corpus DXF. |
| `annotation-extras` | 4/5 | `annotation-extras.mleader` | Primero la capacidad (importar LEADER), y sólo después el testigo. Un corpus ajeno con MLEADER exige ficheros guardados por un programa que los escriba, y las dos bibliotecas MIT del corpus no los tienen entre sus ficheros de prueba. |
| `xrefs` | 5/6 | `xrefs.resolution` | Un conjunto ajeno completo: el dibujo y sus referencias. Ninguna de las dos bibliotecas MIT publica uno; el procedimiento de donación existe (`docs/DONACIONES.md` del repositorio de conformidad) y el donante no. |
| `json-import` | 3/4 | `json-import.fuzzing` | Un fuzzer de terceros (radamsa, o `atheris`/`hypothesis` en PyPI) que mute los documentos y decida él qué entradas probar. La independencia posible aquí no es del MATERIAL sino del generador. |
| `api-sdk` | 6/7 | `api-sdk.contract` | Un validador de OpenAPI de terceros sobre `design-api.v1.yaml` (`openapi-spec-validator` en PyPI, o Redocly/Spectral en npm), congelando su dictamen como artefacto igual que el censo de ezdxf. Alcanzable hoy: los tres registros responden. |
| `events` | 3/4 | `events.operational` | Verificar la firma `X-Valle-Signature` con una implementación de HMAC ajena (la de la librería estándar de Python, por ejemplo) sobre `timestamp + "." + rawBody` capturado, y congelar ese dictamen. Es el mismo patrón del oráculo B y cuesta poco. |
| `object-storage` | 2/3 | `object-storage.s3` | Correr el adaptador contra un MinIO real (AGPL, imagen pública) y publicar qué guardó y qué devolvió. MinIO es software ajeno juzgando nuestro cliente, que es la definición del oráculo externo. |
| `wasm` | 1/2 | `wasm.toolchain` | Un tercero de precisión arbitraria (`mpmath` en PyPI) que emita los valores de referencia de las mismas operaciones. No falta el método —está bien resuelto—: falta que el que calcule sea otro. |
| `geo` | 2/3 | `geo.crs` | `pyproj` (que envuelve PROJ, la implementación de referencia del mundo GIS) transformando el mismo juego de puntos, congelado como artefacto con su versión. Es el candidato más barato y más sólido de las veinticinco filas que no se sirven hoy: la fórmula ya está contrastada por dentro, sólo falta que el que la ejecute sea otro. |
| `toolset-map3d` | 3/4 | `toolset-map3d.georreferencia` | Importar un shapefile público real y comprobar las coordenadas transformadas contra PROJ. Comparte oráculo con la fila `geo`, así que el mismo trabajo sirve para las dos. |
| `toolset-raster` | 3/4 | `toolset-raster.vectorizacion` | Un plano escaneado de dominio público (los levantamientos HABS/HAER de la Library of Congress lo son) con su geometría conocida, y el resultado de la vectorización contrastado contra ella. Es el toolset más barato de volver independiente. |
| `toolset-mechanical` | 3/4 | `toolset-mechanical.normalizados` | Contrastar las cotas contra una fuente ajena de las tablas. El texto de ISO y DIN es de pago y no se redistribuye —eso es una decisión de derechos, no técnica—, pero existe material libre equivalente (el banco de tornillería del taller Fasteners de FreeCAD, LGPL) que sí se puede citar y hashear como se hizo con las dos licencias MIT del corpus. |
| `toolset-electrical` | 3/4 | `toolset-electrical.informes` | Anclar cada límite a su artículo de la NOM-001-SEDE publicada en el DOF —cita y fecha, no copia del texto, que es de la Secretaría— y que un electricista contraste un cuadro de cargas real. La primera mitad se puede hacer sin permiso de nadie; la segunda necesita persona. |

#### Las que necesitan un usuario real (6)

La regla del corte nombra tres patas: oráculo externo, material de terceros **o usuario real**.
Estas filas sólo tienen la tercera, y decirlo es más honesto que inventarles un fichero.

| Fila | Puntos | Candidato | Qué falta |
| --- | --- | --- | --- |
| `persistence` | 7/8 | `persistence.real-e2e` | La tercera pata de la regla del corte: un usuario real. Un documento de un despacho, guardado por una persona en una sesión que no montamos nosotros, con su historia de versiones. PostgreSQL es software ajeno pero no es un oráculo: no opina sobre si el CAS hizo lo correcto. |
| `review` | 4/5 | `review.concurrency` | Personas. Dos revisores ajenos sobre un enlace real, con su rastro. Es la fila donde el «usuario real» de la regla no tiene sustituto técnico. |
| `recognition` | 13/14 | `recognition.ribbon-order` | Un dibujante que no sea de aquí, sentado delante, con lo que encontró y lo que no. Ningún fichero sustituye eso, y es la fila más grande del censo (14 pt) que lo necesita. |
| `toolset-architecture` | 3/4 | `toolset-architecture.envolvente` | Un arquitecto levantando una planta con WALL/DOOR/WINDOW y su cuadro de superficies, y el cuadro contrastado contra la medición de otro. Sin persona, no hay testigo. |
| `toolset-mep` | 3/4 | `toolset-mep.trazado` | Un proyectista de instalaciones y su plano, con las longitudes de la tabla contrastadas contra su presupuesto. |
| `toolset-plant3d` | 3/4 | `toolset-plant3d.pid` | Un P&ID de una planta real con su lista de líneas emitida por otro programa, para contrastar numeración y etiquetas. Es material industrial y casi siempre confidencial: la barrera aquí no es técnica. |

- **Cómo se comprueba:** `cd apps/web && npx tsx src/lib/cad/verification/independencia-rubrica.spec.ts`
  recalcula el censo entero desde la rúbrica y lo compara contra el artefacto comprometido; fija
  `TECHO_FILAS_CON_TOPE = 31` como trinquete que sólo puede bajar; comprueba que cada
  candidato existe, está concedido y no es ya independiente; que cada ruta citada por un parche
  existe en el árbol; y **rechaza cualquier parche que marque `independent: true` sobre una ruta
  que no esté en la lista cerrada de fuentes ajenas admitidas** —`verification/oracle.ts` está en
  la lista de lo que NO lo es, con su razón escrita—. Después, `node scripts/cad/rubric.mjs`
  enseña las cifras de la tabla y `node scripts/cad/rubric.mjs --markdown --check` exige
  regenerar `docs/competitive/autocad-2027-gap-matrix.md` en el mismo commit.
- **Lo que NO se pide:** marcar `independent: true` sobre evidencia que fabricó este proyecto. El
  oráculo por fuerza bruta de `verification/oracle.ts` es honesto y es útil, y lo escribimos
  nosotros: marcarlo convertiría «lo comprobamos aparte» en «lo comprobó otro».
- **Hallazgo que el censo destapó en el propio archivo compartido:** la única marca
  `independent: true` del lado DXF de la rúbrica de hoy está en `dxf.corpus-external` y apunta a
  `docs/cad/evidence/dxf-external-corpus-matrix.json`, cuyo encabezado dice `corpusSintetico: true`.
  Hoy no infla la cuenta porque ese criterio no se concede (falta la firma de derechos), pero el
  día que la firma llegue sin P-evidencia-04 concedería 2 pt de «independencia» a un corpus que
  generó este proyecto. **P-evidencia-04 la sustituye; conviene aplicarla antes que P-evidencia-03.**
- **Estado:** pendiente — diseño COMPLETO. Los seis bloques se pueden aplicar de una vez y su
  efecto está medido.

### P-evidencia-06 · `flattened_to_ground` no tiene fila en la tabla del informe de importación
- **Archivo:** `apps/web/src/lib/cad/dxf-import-report.ts` (`WARNING_RULES`)
- **Por qué:** Lo destapó la matriz de fidelidad contra el corpus ajeno. `bjnortier-dxf/splines.dxf`
  entra con sus dos SPLINE completas y el importador emite `flattened_to_ground` sobre ellas —la
  spline venía fuera del plano del suelo y se aplanó—. Ese código **no está en `WARNING_RULES`**,
  así que el informe cae al comodín y le enseña al arquitecto: *«2 entidad(es) con una incidencia
  todavía sin describir (flattened_to_ground)»*, clasificada además como `lost` por el valor por
  defecto. Las dos cosas están mal a la vez: la geometría **sí entró** (no es `lost`, es
  `degraded`) y la frase no informa de nada. El comentario del propio comodín dice que «el día que
  aparezca uno nuevo, su spec lo caza y se le escribe la frase»: apareció, y lleva tiempo
  apareciendo — `dxf-import-cota.ts` lo emite desde la Ola C.
- **Cambio exacto:** en `apps/web/src/lib/cad/dxf-import-report.ts`, dentro de `WARNING_RULES`,
  insertar justo DESPUÉS del bloque `dimension_without_block` (línea 232, antes de
  `dxf_paper_space_excluded`):

  ```ts
    flattened_to_ground: {
      fidelity: "degraded",
      detail: (count, types) =>
        `${count} entidad(es) (${TYPES(types)}) venían fuera del plano del suelo —en un plano ` +
        "inclinado, elevadas sobre su plano, o con cota en textos e inserciones— y entran " +
        "aplanadas contra el suelo: cambian de sitio y pueden cambiar de longitud. El documento " +
        "todavía no guarda un plano inclinado.",
    },
  ```

  `TYPES` ya está definido en ese archivo y es el que usan las demás reglas.
- **Cómo se comprueba:** `cd apps/web && npx tsx src/lib/cad/verification/dxf-fidelidad-terceros.spec.ts`
  seguido de `VALLE_ESCRIBIR_MATRIZ=1` — la fila `bjnortier-dxf/splines · SPLINE` de la matriz pasa
  de `degradaA: "2 entidad(es) con una incidencia todavía sin describir (flattened_to_ground)."` a
  la frase nueva, y el artefacto se regenera para decirlo. Además `npm test` sobre
  `dxf-import-report.spec.ts` sigue verde: la regla es aditiva y ningún caso existente la toca.
- **Estado:** APLICADA el 2026-09-05 por el coordinador, con su medición rehecha y las suites de terceros pasadas de registrar el defecto a guardar que no vuelve. Ver `docs/execution/FASE4_TESTIGO_AJENO_20260905.md`. Estado anterior: pendiente — no bloquea nada de este frente; es un defecto de superficie de usuario
  que la matriz destapó al pasar por delante.

### P-evidencia-07 · Lo que exportamos no lo abre `ezdxf`: MTEXT y HATCH salen sin marcador de subclase
- **Archivos:** `apps/web/src/lib/cad/dxf-export.ts` (escritor de MTEXT, ~línea 485) y
  `apps/web/src/lib/cad/dxf-export-hatch.ts` (`pushHatch`, ~línea 37)
- **Por qué:** Lo destapó la jornada completa sobre el plano ajeno
  (`verification/terceros-jornada.spec.ts`). Al exportar `bjnortier-dxf/floorplan.dxf` ya
  modificado, **`ezdxf` 1.4.4 no consigue abrir el fichero** — ni siquiera en modo `recover`:

  ```
  HATCH → IndexError: list index out of range   (ezdxf/entities/polygon.py:81)
  MTEXT → DXFStructureError: missing 'AcDbMText' subclass in MTEXT(#None)
  ```

  La causa está medida, no supuesta: la cabecera declara `AC1015` (R2000), dialecto en el que
  los marcadores de subclase son **obligatorios**, y los escritores viejos —MTEXT y HATCH entre
  ellos— no los emiten. La casa ya sabe hacerlo bien: `dxf-write-schema4.ts` tiene
  `pushEntityHead`, que escribe `0 <TIPO>`, `100 AcDbEntity`, `8 <capa>`, la presentación y
  `100 <subclase>` para POINT, XLINE, RAY, SOLID y compañía, y `pushMleader` emite
  `100 AcDbMLeader`. Lo que falta es aplicar ese mismo patrón a los dos tipos que un lector
  estricto rechaza. Los otros siete
  tipos que escribe este plano —LINE, POLYLINE, CIRCLE, ARC, TEXT, DIMENSION, INSERT— `ezdxf`
  sí los abre, con **cero errores de auditoría**: el fichero exportado sin MTEXT ni HATCH se
  lee entero (625 LINE, 124 POLYLINE, 20 ARC, 89 TEXT, 63 DIMENSION, 10 INSERT). O sea que la
  estructura general es válida y lo que la rompe son esas dos entidades.

  Esto NO se ve con el oráculo A (`dxf-parser`, el que corre en CI): es tolerante y lee
  nuestro fichero completo. Sólo un lector estricto lo delata, y por eso hacía falta el
  segundo oráculo.
- **Cambio exacto:** dos parejas de códigos por entidad, en los dos escritores.

  En `dxf-export.ts`, donde hoy dice:

  ```ts
    pushPair(lines, 0, "MTEXT");
    pushPair(lines, 8, layer);
  ```

  escribir:

  ```ts
    pushPair(lines, 0, "MTEXT");
    // R2000 —el dialecto que declara nuestra cabecera— exige los marcadores de
    // subclase, y `pushEntityHead` de dxf-write-schema4.ts ya los escribe para
    // los tipos nuevos. Sin ellos un lector estricto no sabe dónde empieza
    // AcDbMText: `ezdxf` rompe con «missing 'AcDbMText' subclass» y no abre el
    // fichero entero, ni en modo recover. Medido en terceros-jornada.spec.ts.
    pushPair(lines, 100, "AcDbEntity");
    pushPair(lines, 8, layer);
    pushPair(lines, 100, "AcDbMText");
  ```

  Y en `dxf-export-hatch.ts`, donde hoy dice:

  ```ts
    pushPair(lines, 0, "HATCH");
    pushPair(lines, 8, layer);
  ```

  escribir:

  ```ts
    pushPair(lines, 0, "HATCH");
    // Mismo motivo que en MTEXT: sin `100 AcDbHatch`, `ezdxf` ni siquiera da un
    // error de estructura — revienta con IndexError en polygon.py, que es peor.
    pushPair(lines, 100, "AcDbEntity");
    pushPair(lines, 8, layer);
    pushPair(lines, 100, "AcDbHatch");
  ```

  **El arreglo está PROBADO antes de pedirlo.** `docs/cad/corpus/oraculos/medidas-floorplan.py`
  inserta exactamente esas parejas sobre el texto ya exportado (función `parche_subclases`, sin
  tocar el producto) y vuelve a leerlo con `ezdxf`: con 170 entidades parcheadas (144 MTEXT +
  26 HATCH) **abre el fichero completo, cuenta las 1101 entidades del documento y audita cero
  errores**. Está registrado en `docs/cad/evidence/jornada-plano-ajeno.json`
  (`actos.releerConOraculoB.conElParcheDeSubclases`) y anclado al sha256 del fichero exportado.
- **Riesgo:** bajo. Las suites que leen el texto escrito lo buscan por contenido
  (`dxf-hatch.spec.ts` usa `content.includes("0\nHATCH")`), no por posición, así que insertar
  pares detrás no las rompe; y el reimportador (dxf-parser) ya trata el código 100 como
  atributo común —los ficheros ajenos R2004 del corpus lo traen y se leen bien—. Aun así:
  correr `npm test` y `npm run check:cad-math` después.
- **Cómo se comprueba:** `cd apps/web && npx tsx src/lib/cad/verification/terceros-jornada.spec.ts`
  se pondrá en ROJO al aplicar el cambio, y es la señal correcta: el fichero exportado cambia
  de bytes y la medición congelada del oráculo B deja de corresponder. Se refresca en dos pasos
  (en una máquina con `pip install ezdxf==1.4.4`): correr el spec —deja los ficheros en el
  temporal— y después `python3 docs/cad/corpus/oraculos/medidas-floorplan.py`. Entonces
  `tiposQueNoAbre` baja de `["HATCH","MTEXT"]` a `[]`, y el techo
  `TECHO_TIPOS_QUE_EL_ORACULO_B_NO_ABRE` del spec se puede vaciar. El artefacto se regenera con
  `VALLE_ESCRIBIR_JORNADA=1`.
- **Estado:** APLICADA el 2026-09-05 por el coordinador, con su medición rehecha y las suites de terceros pasadas de registrar el defecto a guardar que no vuelve. Ver `docs/execution/FASE4_TESTIGO_AJENO_20260905.md`. Estado anterior: pendiente — es el defecto más caro de los tres que destapó la jornada: hoy,
  cualquier programa estricto que reciba un DXF nuestro con sombreados o textos de párrafo
  **no lo abre**.

### P-evidencia-08 · El informe declara perdidas 63 cotas que SÍ entraron
- **Archivo:** `apps/web/src/lib/cad/dxf-import.ts` (final de `importDxfPrimitives`, justo antes
  del `return`, ~línea 1105)
- **Por qué:** Medido sobre el plano ajeno. Al abrir `floorplan.dxf`, el informe que ve el
  arquitecto (`dxfReport.rows`) dice, con `fidelity: "lost"`:

  > *«72 entidad(es) de tipo DIMENSION, LEADER, VIEWPORT no tienen equivalente en el dibujo y
  > NO entraron. Si hacen falta, pide al remitente que las explote a líneas y arcos antes de
  > exportar.»*

  y **dos filas más abajo**, con `fidelity: "degraded"`:

  > *«63 cota(s) de otro programa entran VIVAS —vuelven a medir sus propios puntos y su número
  > se recalcula— pero DESLIGADAS del dibujo.»*

  Las dos no pueden ser verdad a la vez, y la que miente es la primera: 63 de esas 72 son las
  cotas, que entran por el camino semántico (`parseRawDxfSemanticDimensions`) mientras el mapa
  de primitivas —que no las conoce— emite un `unsupported_entity` por cada una. Las otras 9 sí
  son pérdida real (6 LEADER + 3 VIEWPORT). El consejo que da («pide al remitente que las
  explote») haría perder cotas vivas que ya tenía.
- **Cambio exacto:** en `dxf-import.ts`, justo antes del `return` de `importDxfPrimitives`
  (después del bucle `for (const mleader of mleaders) layers.add(mleader.layer);` y del
  comentario sobre `layers`), insertar:

  ```ts
  // Las DIMENSION no las mapea `mapDxfEntityToPrimitive` —no son una primitiva—
  // sino el camino SEMÁNTICO, que ya las trajo en `semanticDimensions`. El aviso
  // del mapa era, para cada una de ellas, una pérdida que no ocurrió: el informe
  // le decía al arquitecto que sus cotas no entraron y le aconsejaba pedir que
  // las explotasen, dos filas antes de contarlas como cotas vivas. Se descuenta
  // UNA por cota efectivamente recuperada, nunca en bloque: una DIMENSION que el
  // camino semántico no consiguiera leer sigue siendo una pérdida, y tiene que
  // seguir avisándose.
  let cotasRecuperadas = semanticDimensions.length;
  const avisosSinCotasFantasma = warnings.filter((warning) => {
    if (warning.code !== "unsupported_entity" || warning.entityType !== "DIMENSION") return true;
    if (cotasRecuperadas <= 0) return true;
    cotasRecuperadas -= 1;
    return false;
  });
  ```

  y cambiar la última línea del objeto devuelto de `warnings, layers: [...layers].sort(),` a
  `warnings: avisosSinCotasFantasma, layers: [...layers].sort(),`.
- **Cómo se comprueba:** `cd apps/web && npx tsx src/lib/cad/verification/terceros-jornada.spec.ts`
  — el bloque del acto 1 afirma hoy `unsupported_entity: 72` y el techo
  `TECHO_DECLARADAS_PERDIDAS_PERO_ENTRARON = 63`. Al aplicar el cambio pasa a `9` y el techo se
  pone a `0` (sólo puede bajar; nunca subirlo). El artefacto se regenera con
  `VALLE_ESCRIBIR_JORNADA=1` y `docs/cad/evidence/jornada-plano-ajeno.json` deja de publicar la
  contradicción. Además `npm test` sobre `dxf-import.spec.ts` y `dxf-import-report.spec.ts`:
  ningún caso existente cuenta DIMENSION entre lo no soportado, así que el cambio es aditivo.
- **Estado:** APLICADA el 2026-09-05 por el coordinador, con su medición rehecha y las suites de terceros pasadas de registrar el defecto a guardar que no vuelve. Ver `docs/execution/FASE4_TESTIGO_AJENO_20260905.md`. Estado anterior: pendiente

### P-evidencia-09 · Siete capas de la tabla LAYER no llegan al documento y nadie lo dice
- **Archivos:** `apps/web/src/lib/cad/document-import.ts` (`importDxfDocument`) y
  `apps/web/src/lib/cad/dxf-import-report.ts` (`WARNING_RULES`)
- **Por qué:** `floorplan.dxf` declara **24 capas** en su tabla LAYER y al documento llegan
  **17**: `buildLayers` construye la lista a partir de las capas USADAS
  (`imported.layers`) y usa las declaradas sólo para sacarles el tipo de línea, el grosor y el
  congelado. Las siete que se quedan fuera —`Defpoints`, `View Port`, `TEMP` y cuatro de xref—
  no las usa ninguna entidad de espacio modelo. El daño real es **menor de lo que ese 17 sugiere,
  y hay que decirlo con el número medido**: al exportar, el fichero que devolvemos declara **23**
  capas, porque el exportador escribe también las que usan las entidades dentro de los bloques.
  O sea que el plano vuelve al remitente con 22 de sus 24 capas más la del revisor, y las dos que
  no vuelven tienen causa conocida: `Defpoints` (sus 378 entidades viven dentro de definiciones
  de bloque y no entraron) y `View Port` (la usa una sola entidad de espacio papel, que el lector
  excluye a propósito). Ninguna de las dos cambia el dibujo.

  Lo que falla, entonces, no es el recuento: es que **ningún aviso menciona nada de esto**. El
  arquitecto ve una paleta de 17 capas donde su cliente tenía 24, no puede dibujar en `TEMP` sin
  volver a crearla, y no hay dónde enterarse. Está medido en `terceros-jornada.spec.ts`
  (`actos.releerConOraculoA.tablaDeCapas` del artefacto).
- **Cambio exacto (el barato, y el que este frente recomienda):** declararlo. En
  `document-import.ts`, dentro de `importDxfDocument`, después de construir `document` y antes
  del `return`, no hace falta tocar nada; el sitio correcto es donde se arma `lossManifest`,
  justo después del bloque `if (scoped.excludedCount > 0) { ... }`:

  ```ts
  // Las capas DECLARADAS que ninguna entidad usa no llegan al documento
  // (`buildLayers` parte de las usadas). No cambia el dibujo —nada se pinta en
  // ellas— pero sí el fichero que se devuelve al remitente, así que se dice.
  const capasUsadas = new Set(imported.layers);
  const capasSoloDeclaradas = imported.layerDefinitions
    .map((entry) => entry.name)
    .filter((name) => name !== "0" && !capasUsadas.has(name));
  if (capasSoloDeclaradas.length > 0)
    lossManifest.push({
      code: "layer_table_pruned",
      sourceType: "LAYER",
      severity: "warning",
      detail:
        `${capasSoloDeclaradas.length} capa(s) declaradas en el archivo no las usa ninguna ` +
        `entidad y no llegan al documento (${capasSoloDeclaradas.slice(0, 6).join(", ")}` +
        `${capasSoloDeclaradas.length > 6 ? ", …" : ""}). El dibujo no cambia; el archivo que ` +
        "devuelvas al remitente llevará una tabla de capas más corta.",
    });
  ```

  y en `dxf-import-report.ts`, dentro de `WARNING_RULES`, junto a `dxf_paper_space_excluded`:

  ```ts
    layer_table_pruned: {
      fidelity: "degraded",
      detail: (count) =>
        `${count} capa(s) del archivo se quedaron fuera del documento porque ninguna entidad ` +
        "las usa. No falta nada del dibujo: falta la definición de esas capas si devuelves el " +
        "archivo al remitente.",
    },
  ```

  **La alternativa completa** —traer las 24 capas cambiando `unique` en `buildLayers` a
  `[...new Set(["0", ...names, ...definitions.map((entry) => entry.name)])]`— es más fiel pero
  mueve el `layerCount` de todas las importaciones DXF ya medidas (informe, goldens, matrices).
  Este frente no la pide: la decisión de cambiar un recuento publicado no es suya.
- **Cómo se comprueba:** `cd apps/web && npx tsx src/lib/cad/verification/terceros-jornada.spec.ts`
  — el acto 1 afirma hoy que **ningún** aviso nombra la tabla de capas
  (`lossManifest.some(p => /capa/i.test(p.code)) === false`). Al aplicar el cambio esa
  afirmación se invierte a `true` en el spec y el artefacto se regenera.
- **Estado:** APLICADA el 2026-09-05 por el coordinador, con su medición rehecha y las suites de terceros pasadas de registrar el defecto a guardar que no vuelve. Ver `docs/execution/FASE4_TESTIGO_AJENO_20260905.md`. Estado anterior: pendiente — el menor de los tres; se pide por el silencio, no por el número.

### P-evidencia-10 · La fila `foreign-work` llega a 6/6: la medición está hecha
- **Archivo:** `docs/competitive/rubric.json` (archivo compartido, R2) — es la primera entrada
  concreta de P-evidencia-05, que era el paraguas
- **Por qué:** El `gap` de la fila `foreign-work` termina hoy con este «todavía no»: *«el dibujo
  ajeno de la prueba lo siembra la propia prueba; medir con archivos de terceros reales pide
  permiso para redistribuirlos, y es decisión del titular»*. **Eso ya está resuelto y medido**:
  el corpus de terceros (19 DXF de dos bibliotecas MIT, con licencias descargadas, hasheadas y
  su puerta de derechos en `dxf-corpus-terceros.spec.ts`) existe desde el primer entregable de
  este frente, y `verification/terceros-jornada.spec.ts` recorre la jornada entera sobre
  `bjnortier-dxf/floorplan.dxf`: abrir con `importDocumentText`, medir **3.065 magnitudes**
  (624 longitudes de línea, 9 radios de círculo, 20 radios y 20 longitudes de arco, 124
  longitudes de polilínea, 63 medidas de cota y la extensión) contra lo que `ezdxf` leyó de los
  MISMOS bytes, modificar con MOVE/LINE/ERASE del registro de producción, exportar con
  `exportCadDocumentDxf` y releerlo con dos lectores ajenos.
- **Cambio exacto:** en el criterio `foreign-work.properties`, añadir al final de `text`:

  ```
  , y la jornada entera sobre un plano ajeno de verdad (bjnortier/dxf floorplan.dxf, R2004, 1,1 MB, 1109 entidades): abrir con el lector de producción, medir 3065 magnitudes contra ezdxf sobre los mismos bytes, modificar con MOVE/LINE/ERASE, exportar y releer
  ```

  y añadir a su array `evidence` estas dos entradas:

  ```json
  {
    "kind": "spec",
    "path": "apps/web/src/lib/cad/verification/terceros-jornada.spec.ts",
    "independent": true
  },
  {
    "kind": "file",
    "path": "docs/cad/evidence/jornada-plano-ajeno.json"
  }
  ```

  Y en el `gap` de la fila, sustituir la frase final *«Lo que sigue en «todavía no»: el dibujo
  ajeno de la prueba lo siembra la propia prueba; medir con archivos de terceros reales pide
  permiso para redistribuirlos, y es decisión del titular.»* por:

  ```
  Ola de superación (2026-09-04): el archivo ajeno ya no lo siembra la prueba. El corpus de terceros (19 DXF de bjnortier/dxf y gdsestimating/dxf-parser, ambas MIT, con licencias hasheadas y puerta de derechos) trae floorplan.dxf, y `verification/terceros-jornada.spec.ts` le hace la jornada entera midiendo 3065 magnitudes contra ezdxf 1.4.4. Lo que sigue en «todavía no»: ezdxf NO abre lo que exportamos —MTEXT y HATCH salen sin marcador de subclase, arreglo probado en P-evidencia-07—; sí abre los otros siete tipos con cero errores de auditoría. Y ninguno de estos ficheros lo guardó AutoCAD: acreditan interoperabilidad con implementaciones independientes, no compatibilidad con AutoCAD.
  ```
- **La cifra, MEDIDA sobre una copia** (el archivo compartido no se tocó; la copia vive en el
  scratchpad y se midió con `node scripts/cad/rubric.mjs --rubric <copia>`):

  | | antes | después |
  |---|---|---|
  | fila `foreign-work` | 5/6 (retiene 1 pt: toda su evidencia es propia) | **6/6** |
  | ALCANCE DE HOY | 176/197 (89.3 %) | **177/197 (89.8 %)** |
  | TOTAL | 233/271 (86 %) | **234/271 (86.3 %)** |
  | pt con evidencia independiente | 5 | **7** |
  | filas que retienen 1 pt | 31 | **30** |
- **Cómo se comprueba:** `node scripts/cad/rubric.mjs` (informativo) y
  `node scripts/cad/rubric.mjs --markdown --check`, que exige regenerar
  `docs/competitive/autocad-2027-gap-matrix.md` en el mismo commit. La evidencia marcada
  `independent: true` es una spec que el runner corre y que compara contra `ezdxf` y
  `dxf-parser`, no contra una corrida anterior del producto: es exactamente lo que la regla
  pide, y por eso el punto no está regalado.
- **No se aplica dos veces.** El bloque `evidence` de esta petición es EL MISMO que
  P-evidencia-05 lista para la fila `foreign-work`, y la medición de P-evidencia-05 ya lo
  incluye. Lo que P-evidencia-10 añade y P-evidencia-05 no toca es el cambio de `text` del
  criterio y la frase del `gap` de la fila: eso es prosa de la rúbrica, no evidencia.
- **Estado:** pendiente

### P-evidencia-11 · El MTEXT de dentro de un bloque sale a espacio modelo, sin la transformación acumulada
- **Archivo:** `apps/web/src/lib/cad/dxf-read-annotations.ts` (`parseRawDxfMTexts`) y, por el
  mismo motivo, el escaneo hermano de HATCH en `apps/web/src/lib/cad/dxf-import.ts`
- **Por qué:** MTEXT y HATCH no los lee el tokenizador: los lee un escaneo sobre los pares
  crudos, y ese escaneo **no sabe en qué sección está**. `parseRawDxfMTexts` recorre
  `rawDxfPairs(text)` de principio a fin y se queda con todo par `0/MTEXT` que encuentre, esté en
  `ENTITIES` o dentro de un `BLOCK`. Un MTEXT que vive dentro de una definición de bloque sale
  entonces como entidad suelta de espacio modelo, con las coordenadas LOCALES del bloque: sin la
  traslación, sin la escala y sin la rotación del INSERT que lo trae. Está medido en dos ficheros
  ajenos distintos, con dos síntomas distintos:

  | Fichero | Qué pasa | Medido en |
  |---|---|---|
  | `bjnortier-dxf/blocks2.dxf` | De los 3 MTEXT que el lector entrega a espacio modelo, **2 viven dentro de `block01` y `block02`**. Salen en (40, 80) y (35,72, 24,90), que son coordenadas del bloque: la transformación acumulada del anidado es traslación (175, 25), así que los dos rótulos caen **175 mm a la izquierda y 25 mm abajo** de donde el remitente los puso. Y siguen dentro del bloque, así que además se dibujan dos veces. | `terceros-bloques.spec.ts` |
  | `bjnortier-dxf/dimensions.dxf` | Las 2 cotas traen su bloque de dibujo (`*D1`, `*D2`) con el rótulo ya escrito dentro. El lector resuelve la cota por sus puntos y **vuelve a dibujar el número** —que es lo correcto— y además saca el MTEXT del bloque: el número queda escrito **dos veces, uno encima del otro**, en el mismo punto y con la misma altura. Nueve entidades donde `ezdxf` cuenta siete. | `terceros-cota-sombreado.spec.ts` |

  Ningún aviso menciona nada de esto en ninguno de los dos casos: es **pérdida silenciosa de
  fidelidad**, la categoría que este frente cuenta con techo cero.

  **El tamaño lo pone el plano grande.** En `floorplan.dxf` el remitente puso **9** MTEXT en
  espacio modelo y el fichero entero tiene **144**: los otros **135 viven dentro de bloques**, y
  el lector entrega los 144 como entidades de espacio modelo. O sea que el ámbito equivocado no
  es un caso de esquina de dos ficheros pequeños: son 135 rótulos de un plano de despacho que
  cambian de dueño sin que nadie avise. La jornada ya había declarado que el lector devuelve
  MTEXT «sin dueño» (`ambitosDeConteo` de `dxf-corpus-terceros-matrix.json`); lo que faltaba era
  la cifra y la consecuencia.
- **Cambio exacto:** darle al escaneo la sección en la que está. En `dxf-read-annotations.ts`,
  dentro de `parseRawDxfMTexts`, justo antes del bucle:

  ```ts
  // EN QUÉ SECCIÓN ESTAMOS. Sin esto, un MTEXT de dentro de un BLOCK sale como
  // entidad de espacio modelo con las coordenadas locales del bloque: ni la
  // traslación ni la escala del INSERT que lo trae se le aplican, porque a este
  // nivel no hay INSERT ninguno. Medido sobre blocks2.dxf y dimensions.dxf.
  const enEntidades = new Array<boolean>(pairs.length).fill(false);
  {
    let seccion = "";
    for (let i = 0; i < pairs.length; i += 1) {
      if (pairs[i].code === 0 && pairs[i].value.toUpperCase() === "SECTION")
        seccion = pairs[i + 1]?.code === 2 ? pairs[i + 1].value.trim().toUpperCase() : "";
      else if (pairs[i].code === 0 && pairs[i].value.toUpperCase() === "ENDSEC") seccion = "";
      enEntidades[i] = seccion === "ENTITIES";
    }
  }
  ```

  y en la condición de entrada del bucle:

  ```ts
    if (pairs[start].code !== 0 || pairs[start].value.toUpperCase() !== "MTEXT") continue;
    if (!enEntidades[start]) continue;
  ```

  El mismo par de bloques va en el escaneo de HATCH de `dxf-import.ts` (la línea
  `if (pairs[start].code !== 0 || pairs[start].value.toUpperCase() !== "HATCH") continue;`).
  Ningún fichero del corpus ajeno trae un HATCH dentro de un bloque, así que ahí el cambio es
  preventivo y se pide por simetría, no por defecto medido — y conviene decirlo así.
- **Lo que este cambio NO hace, y hay que decirlo:** el MTEXT de dentro del bloque **deja de
  dibujarse** en vez de dibujarse en el sitio equivocado. Eso es lo correcto para la cota (el
  rótulo lo pone la propia cota) y es lo correcto para `blocks2.dxf` sólo si la expansión de
  bloques ya trae el texto — y lo trae: `block01` y `block02` conservan su rótulo dentro como
  entidad `text`, y `terceros-bloques.spec.ts` lo comprueba. Si algún día un bloque llegara sin
  su texto expandido, el arreglo completo es aplicarle la transformación acumulada del INSERT,
  no volver a sacarlo a espacio modelo.
- **Cómo se comprueba:** `cd apps/web && npx tsx src/lib/cad/verification/terceros-cota-sombreado.spec.ts`
  — hoy afirma que hay **2** rótulos duplicados (`TECHO_ROTULOS_DUPLICADOS`) y que el lector trae
  **9** entidades donde el oráculo cuenta 7. Al aplicar el cambio, las dos cifras bajan a 0 y 7 y
  el techo se baja en el spec. Igual en `terceros-bloques.spec.ts` con los dos MTEXT fugados.
- **Estado:** APLICADA el 2026-09-05 por el coordinador, con su medición rehecha y las suites de terceros pasadas de registrar el defecto a guardar que no vuelve. Ver `docs/execution/FASE4_TESTIGO_AJENO_20260905.md`. Estado anterior: pendiente — es el más caro de los cuatro en consecuencias visibles y el más claro
  en diagnóstico.

### P-evidencia-12 · El color de capa del remitente se descarta y se sustituye por una paleta de cinco
- **Archivos:** `apps/web/src/lib/cad/document-import.ts` (`buildLayers`) y
  `apps/web/src/lib/cad/dxf-document-export.ts` (`cadDocumentDxfLayerDefinitions`)
- **Por qué:** `buildLayers` asigna el color de cada capa así:

  ```ts
  const palette = ["#ffffff", "#ff5252", "#4fc3f7", "#ffd54f", "#81c784"];
  …
  color: palette[index % palette.length],
  ```

  donde `index` es la **posición alfabética** de la capa. El código 62 del fichero no se mira,
  aunque **ya está leído**: `dxf-read-properties.ts` lo guarda en
  `CadDxfLayerDefinition.colorIndex` y llega hasta aquí. Y el exportador tampoco lo escribe:
  `cadDocumentDxfLayerDefinitions` arma nombre, tipo de línea, grosor y congelado, y el fichero
  que devolvemos sale con `62 7` —blanco— en todas las capas. **El dibujo del remitente vuelve
  monocromo por tabla de capas**, y el informe de importación dice «Entró completo … sin
  pérdidas».

  Con tres capas parece una elección de estilo. Con las 24 de `floorplan.dxf` se ve que es un
  error en las dos direcciones a la vez, y está medido: **4 índices ACI** que el remitente usó en
  varias capas salen de colores distintos (las tres capas de texto, todas ACI 4, salen de tres
  colores), y **los 5 colores de la paleta** juntan cada uno capas de índices distintos (`0`,
  `A-CASE-1`, `A-OPENING` y `S-STEM-WALL` —ACI 7, 3, 1 y 8— salen todas `#ffffff`).
- **Cambio exacto (1 de 2), en `document-import.ts`:** ampliar el tipo del parámetro y usar el
  índice cuando venga. La tabla ACI↔RGB **ya existe en el árbol**:
  `apps/web/src/lib/cad/plot/aci-palette.ts` exporta `aciToHex` y `hexToAci`.

  ```ts
  import { aciToHex, hexToAci } from "@/lib/cad/plot/aci-palette";
  …
  function buildLayers(
    names: string[],
    definitions: readonly {
      name: string;
      colorIndex?: number;   // ← ya viaja; hasta hoy se tiraba aquí
      linetype?: string;
      lineweight?: number;
      frozen?: boolean;
    }[] = [],
  ): CadLayerDef[] {
    // La paleta sigue siendo el respaldo: una capa que el fichero no colorea
    // (o que no está en su tabla) necesita un color y este es tan bueno como
    // otro. Lo que cambia es que deja de PISAR el que sí venía.
    const palette = ["#ffffff", "#ff5252", "#4fc3f7", "#ffd54f", "#81c784"];
    …
      // El índice NEGATIVO del código 62 significa capa apagada, no color
      // negativo: el color es su valor absoluto y el signo lo lee `visible`.
      const aci = entry?.colorIndex === undefined ? undefined : Math.abs(entry.colorIndex);
      return {
        …
        color: aci !== undefined && aci > 0 && aci < 256 ? aciToHex(aci) : palette[index % palette.length],
        visible: entry?.colorIndex === undefined ? true : entry.colorIndex >= 0,
        …
      };
  }
  ```
- **Cambio exacto (2 de 2), en `dxf-document-export.ts`:** `CadDxfExportLayer` **ya tiene**
  `color?: number` y el escritor ya sabe emitirlo; sólo falta rellenarlo.

  ```ts
    return document.layers.map((layer) => ({
      name: layer.name,
      // El color cruza aquí su frontera: el documento guarda hexadecimal y el
      // fichero pide índice ACI. La conversión de ida vive en el importador.
      color: hexToAci(layer.color),
      …
  ```
- **Probado antes de pedirlo:** el viaje ACI → hex → ACI se comprobó sobre los **doce índices que
  este corpus usa de verdad** (1, 3, 4, 5, 7, 8, 9, 30, 54, 95, 152, 203 — los de `layers.dxf` y
  los de las 24 capas de `floorplan.dxf`) y los doce vuelven idénticos con las funciones que ya
  están en el árbol. El arreglo no necesita tabla nueva.
- **Lo que hay que mirar al aplicarlo:** cambia el color de las capas en **toda** importación DXF
  ya medida, así que hay goldens de interfaz que se moverán. No cambia recuentos ni geometría.
  La `visible` derivada del signo es una mejora que viene de regalo con el mismo dato; si se
  prefiere no tocar visibilidad en el mismo cambio, se deja fuera y se pide aparte.
- **Cómo se comprueba:** `cd apps/web && npx tsx src/lib/cad/verification/terceros-capas.spec.ts`
  — hoy afirma `PISO_COLORES_QUE_SOBREVIVEN = 0` y que el fichero exportado sale con `62 7` en
  las tres capas. Al aplicar el cambio, el piso sube a 3, la afirmación del `62 7` se invierte, y
  las dos cifras de colisión de `floorplan.dxf` (4 y 5) bajan a 0.
- **Estado:** APLICADA el 2026-09-05 por el coordinador, con su medición rehecha y las suites de terceros pasadas de registrar el defecto a guardar que no vuelve. Ver `docs/execution/FASE4_TESTIGO_AJENO_20260905.md`. Estado anterior: pendiente — es el hallazgo con más superficie visible de este entregable.

### P-evidencia-13 · Un DXF válido se rechaza entero por `$XCLIPFRAME`, con un mensaje que culpa al remitente
- **Archivo:** `apps/web/src/lib/cad/document-import.ts` (`importDxfDocument`, la línea del
  `throw`) y, si se quiere el arreglo completo, `apps/web/src/lib/cad/dxf-import.ts` antes de
  entregarle el texto a `dxf-parser`
- **Por qué:** `importDocumentText` levanta **«El DXF está corrupto o no es un DXF de texto
  válido.»** sobre `bjnortier-dxf/blocks2.dxf`. El fichero **no está corrupto**: `ezdxf` lo abre
  entero y sin una queja, y además es material de prueba de la biblioteca MIT que lo publica. El
  mensaje acusa al remitente de algo que no hizo, y el arquitecto que lo lee reenvía el fichero a
  su cliente para que «se lo arregle».

  La causa está medida y es **una sola**: la cabecera trae `$XCLIPFRAME` con valor **2**.
  `dxf-parser` convierte los códigos 290–299 a booleano y sólo acepta `0` y `1`
  (`String '2' cannot be cast to Boolean type`); desde AutoCAD 2010 esa variable admite 0, 1 y 2.
  El oráculo A cae por el mismo sitio que el lector, y eso no es coincidencia: `dxf-import.ts`
  **importa** `dxf-parser`, o sea que comparten la máquina de analizar.
- **Probado antes de pedirlo:** normalizando **ese único par** a `1` sobre una copia en memoria
  —el fichero del árbol no se toca, y su `sha256` lo demuestra—, el fichero entra completo:
  **6 entidades, 3 bloques, 0 avisos**, con el anidado de dos niveles intacto y el ARC y la
  ELLIPSE de dentro medidos uno a uno contra `ezdxf`. Está en `terceros-bloques.spec.ts`.
- **Cambio exacto (el barato, y el que este frente recomienda):** **no mentir**. En
  `document-import.ts`:

  ```ts
    if (imported.warnings.some((warning) => warning.code === "parse_failed")) {
      // NO se dice «corrupto»: hay ficheros perfectamente válidos que este
      // lector no sabe analizar todavía (medido: `$XCLIPFRAME` = 2, legítimo
      // desde AutoCAD 2010, tumba el analizador entero). Acusar al remitente
      // de algo que no hizo es peor que no abrir el archivo.
      throw new Error(
        "Este lector no pudo analizar el DXF. Puede que el archivo esté dañado, " +
          "o que use algo que todavía no soportamos. Escríbenos y lo miramos.",
      );
    }
  ```
- **Cambio exacto (el completo, si se quiere abrir el fichero):** normalizar los booleanos fuera
  de rango antes de analizar, en `dxf-import.ts`, justo antes de la llamada al analizador:

  ```ts
  // Los códigos 290-299 son booleanos para `dxf-parser` y sólo admite 0 y 1.
  // El formato REAL permite más: `$XCLIPFRAME` vale 0, 1 o 2 desde AutoCAD 2010.
  // Un valor de cabecera que no entendemos no puede tumbar el archivo entero.
  const saneado = text.replace(
    /(\n\s*29\d\s*\r?\n\s*)([2-9]\d*)(\s*\r?\n)/gu,
    (_todo, antes: string, valor: string, despues: string) => `${antes}1${despues}`,
  );
  ```

  con su aviso `header_boolean_out_of_range` en el manifiesto de pérdidas si se toca algo, para
  que la normalización no sea también silenciosa. **Los dos cambios son independientes**: el
  primero se puede aplicar solo y ya deja de mentir.
- **Cómo se comprueba:** `cd apps/web && npx tsx src/lib/cad/verification/terceros-bloques.spec.ts`
  — hoy afirma que el mensaje del lector encaja con `/corrupto|no es un DXF/` y que
  `TECHO_FICHEROS_RECHAZADOS = ["bjnortier-dxf/blocks2"]`. Con el cambio barato, la primera
  afirmación se cambia por la del mensaje nuevo; con el completo, el techo queda vacío y la suite
  deja de necesitar la copia en memoria.
- **Estado:** APLICADA el 2026-09-05 por el coordinador, con su medición rehecha y las suites de terceros pasadas de registrar el defecto a guardar que no vuelve. Ver `docs/execution/FASE4_TESTIGO_AJENO_20260905.md`. Estado anterior: pendiente — el cambio barato es una línea y quita una acusación falsa al usuario.

### P-evidencia-14 · Un contorno de HATCH de cuatro aristas RECTAS se descarta por «no poligonal»
- **Archivo:** `apps/web/src/lib/cad/dxf-import.ts` (el escaneo crudo de HATCH, el bloque
  `if ((pathFlags & 2) === 0) { unsupportedEdgePath = true; … }`)
- **Por qué:** el importador sólo reconstruye los contornos escritos como **polilínea** (bit 2 del
  código 92). `bjnortier-dxf/hatches.dxf` trae su contorno como **ruta de aristas**, y sus cuatro
  aristas son **rectas**: es un cuadrado de 100 × 100. El sombreado se descarta entero con
  `hatch_unsupported_boundary`, y el fichero pierde su relleno aunque la forma sea trivial. La
  pérdida se **declara** —eso está bien y hay que decirlo— pero es evitable.

  El detalle que lo hace incómodo: las cuatro `LINE` que el remitente dibujó encima del sombreado
  **sí entran**, y son exactamente el mismo cuadrado. O sea que el documento tiene la forma y no
  tiene el relleno. Está medido en `terceros-cota-sombreado.spec.ts`, que compara clave a clave
  el contorno descartado con las cuatro líneas importadas.
- **Cambio exacto:** un contorno cuyas aristas sean todas de tipo 1 (línea) es un polígono, y sus
  vértices son el inicio de cada arista. En el bloque que hoy abandona la ruta:

  ```ts
      if ((pathFlags & 2) === 0) {
        // RUTA DE ARISTAS. Si TODAS son rectas (código 72 = 1), el contorno es
        // un polígono y sus vértices son el inicio de cada arista: no hace falta
        // saber de curvas para reconstruirlo. Sólo se abandona si aparece una
        // arista que no es recta — arco, elipse o spline —, y eso se sigue
        // declarando igual que hasta hoy.
        const aristas: CadDxfPoint[] = [];
        let todasRectas = true;
        for (let index = cursor + 1; index < pathEnd; index += 1) {
          const pair = entityPairs[index];
          if (pair.code === 72 && Number(pair.value) !== 1) { todasRectas = false; break; }
          if (pair.code === 10) {
            const px = num(pair.value);
            const py = num(entityPairs[index + 1]?.code === 20 ? entityPairs[index + 1].value : undefined);
            if (px !== null && py !== null) aristas.push({ x: px, y: py });
          }
        }
        if (todasRectas && aristas.length >= 3) boundaries.push(aristas);
        else unsupportedEdgePath = true;
        cursor = pathEnd - 1;
        continue;
      }
  ```

  El aviso `hatch_edge_path_partial` que ya existe sigue sirviendo para el caso mixto (unas
  aristas rectas y otras no) y no hay que tocarlo.
- **Lo que NO arregla:** un contorno con arcos o splines sigue sin entrar, y sigue declarándolo.
  Este frente no pide teselar curvas: pide dejar de tirar los polígonos.
- **Cómo se comprueba:** `cd apps/web && npx tsx src/lib/cad/verification/terceros-cota-sombreado.spec.ts`
  — hoy afirma `TECHO_SOMBREADOS_PERDIDOS = 1` y que el contorno descartado y las cuatro líneas
  importadas son el mismo cuadrado. Al aplicar el cambio, el techo baja a 0, el sombreado entra
  con sus cuatro vértices y la comparación de claves pasa a hacerse contra el HATCH importado.
- **Estado:** APLICADA el 2026-09-05 por el coordinador, con su medición rehecha y las suites de terceros pasadas de registrar el defecto a guardar que no vuelve. Ver `docs/execution/FASE4_TESTIGO_AJENO_20260905.md`. Estado anterior: pendiente.
