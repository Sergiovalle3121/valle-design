# Fase 4 · Lo que el testigo ajeno destapó

**2026-09-05.** Continuación de la campaña «Superar a AutoCAD completo», cuyas
tres ventanas se mergearon en `main` (#189 y #190). Esta fase no la eligió
nadie: la dictó el censo de independencia que la campaña dejó escrito **en
máquina**, `docs/cad/evidence/independencia-por-fila.json`. De las 25 filas que
retenían un punto, cinco decían lo mismo — hay un testigo ajeno en el árbol y
dice que **no** — y nombraban la petición que lo arreglaba.

## La cifra

| | ventana 3 | fase 4 |
|---|---:|---:|
| TOTAL | 239/271 (88.2 %) | **244/271 (90.0 %)** |
| Alcance de HOY | 180/197 (91.4 %) | **185/197 (93.9 %)** |
| pt con evidencia INDEPENDIENTE | 16 | **28** |
| filas en su tope | 6 | **11** |
| filas que retienen 1 pt | 25 | **20** |
| de ellas, bloqueadas por un defecto medido | **5** | **0** |
| specs | 624 | **624** |
| casos contra oráculo independiente | 5 421 | **5 427** |

Los cinco puntos son exactamente los cinco que el censo predijo, y las cinco
filas que llegan a su tope son las cinco que nombraba: Cotas asociativas, HATCH
asociativo, MTEXT y texto, Capas y propiedades, e Integridad.

## Los ocho defectos, y qué medía cada uno

Todos estaban en la promesa central —un DXF entra y vuelve sin perder nada y sin
mentir sobre lo que perdió— y ninguno lo destapó una prueba propia.

| Petición | Lo que hacía | Lo que hace |
|---|---|---|
| **07** | `ezdxf` **no abría** lo que exportamos: MTEXT y HATCH sin `100 AcDbEntity` ni su marcador de subclase, con la cabecera declarando AC1015. Ni en modo `recover`. | Abre el fichero entero: 1101 entidades en su día, hoy 953, **0 errores de auditoría** |
| **12** | El código 62 se leía, viajaba en `colorIndex` y **se tiraba**: el color salía por posición alfabética sobre una paleta de cinco, y el exportador escribía `62 7` en todas. El plano del remitente volvía **monocromo** y el informe decía «entró completo, sin pérdidas» | Las 3 capas de `layers.dxf` conservan su color y vuelven con su índice; sobre las 24 de `floorplan.dxf`, los índices que se abrían en varios colores y los colores que juntaban índices distintos pasan de **4 y 5 a 0 y 0** |
| **11** | Los escaneos crudos no sabían en qué sección estaban: sacaban a espacio modelo lo que vive dentro de un BLOCK, con coordenadas locales. En `blocks2.dxf`, dos rótulos 175 mm a la izquierda; en `dimensions.dxf`, cada cota con su número escrito **dos veces** | MTEXT 144 → **9** y HATCH 26 → **13**, que es lo que `ezdxf` ve en el espacio modelo de ese fichero |
| **08** | El informe declaraba perdidas **63 cotas que sí entraban** y aconsejaba «pide al remitente que las explote», lo que le habría hecho perder cotas vivas | 72 pérdidas declaradas → **9**, las reales: 6 LEADER y 3 VIEWPORT |
| **09** | Siete capas declaradas no llegaban al documento y **ningún aviso lo mencionaba** | `layer_table_pruned`, una por capa y con su nombre |
| **06** | `flattened_to_ground` no tenía fila y caía al comodín («una incidencia todavía sin describir»), además clasificada como `lost` cuando la geometría sí entra | Fila propia, `degraded`, con la frase que informa |
| **13** | Un DXF **válido** se rechazaba entero con «El DXF está corrupto», acusando al remitente. La causa era una: `$XCLIPFRAME` = 2, legítimo desde AutoCAD 2010 | `blocks2.dxf` entra; los códigos 290-299 fuera de rango se normalizan **y se declaran** |
| **14** | Un contorno de HATCH de cuatro aristas **rectas** se descartaba por «no poligonal», mientras las cuatro LINE dibujadas encima sí entraban: el documento tenía la forma y no el relleno | El sombreado entra con su cuadrado de 100 × 100 |

## Las tres cosas que esta fase enseñó sobre sí misma

### 1. Un acuerdo entre dos medidas equivocadas por el mismo sitio no es un acuerdo

La matriz de fidelidad comparaba MTEXT y HATCH en el ámbito «archivo entero»,
con esta razón escrita: *«el lector los devuelve SIN DUEÑO; es una limitación
real del lector y por eso se declara; el ámbito no se eligió porque cuadre»*.

Al quitar la limitación salió a la luz que los dos lados venían coincidiendo por
el mismo error: el lector contaba el fichero entero porque no sabía distinguir,
y el censo del oráculo se leía de `archivoEntero`, que recorre `doc.blocks` e
incluye `*Model_Space` **más** los bloques que nadie inserta. Sobre
`floorplan.dxf` los dos decían 26 HATCH y 144 MTEXT. El espacio modelo tiene 13
y 9, y eso dicen hoy los dos.

Mientras los dos estuvieron mal por el mismo sitio, la igualdad **parecía una
verificación**. Se detectó arreglando uno de los dos lados, no mirándolos.

### 2. El gate cazó mi propio defecto a la primera corrida, y el techo no se subió

Dar ámbito a los escaneos crudos hizo que dejaran de entrar entidades que el
fichero **sí** tiene. Eso son cinco pérdidas silenciosas, y el techo de la
matriz es cero: se puso rojo antes de que nadie citara la cifra.

La respuesta fue el aviso que faltaba, `entity_in_block_definition`. Y se emite
**sólo para lo huérfano** —lo que vive en una definición que ningún INSERT del
dibujo, ni ninguna cota, alcanza—, porque un aviso que salta en todo dibujo
normal no informa de nada: sin ese filtro, cualquier rótulo dentro de un bloque
insertado habría producido una queja. La alcanzabilidad se calcula transitiva
desde los INSERT de espacio modelo más los bloques de dibujo de las cotas, y las
cifras coinciden con las que da `ezdxf` calculándolo por otro camino: **85** en
`floorplan` (72 MTEXT + 13 HATCH) y **44** en `entities`.

### 3. Una petición puede equivocarse en un dato, y hay que medirlo igual

P-evidencia-12 afirmaba que los doce índices ACI del corpus vuelven idénticos.
El corpus usa **catorce**, y uno de ellos no vuelve. Medido sobre los 255: siete
no conservan su número —10, 50, 90, 130, 170, 210 y 255—, y son los duplicados
de la propia paleta ACI: 1/10, 2/50 … 7/255 son el **mismo RGB**. Cambia la
etiqueta, no el color que ve nadie. Está declarado en el hallazgo de la fila, no
escondido en que «doce de doce vuelven».

P-evidencia-11 decía que ningún fichero del corpus trae un HATCH dentro de un
bloque. `floorplan.dxf` trae trece. El cambio dejó de ser «preventivo» y pasó a
ser medido.

Y P-evidencia-13 proponía dos arreglos, el barato y el completo. Se hicieron los
dos, y además se partió el mensaje en dos, porque son dos fracasos distintos que
llevan al usuario a acciones distintas: un archivo sin una sola `0/SECTION` no
es un DXF que no sepamos leer —se le dice que mire qué archivo eligió— y uno con
estructura que no digerimos es fallo nuestro y así se nombra. Lo cazó el arnés
de fuzz, cuya clase `dxf-corrupto` era, ella misma, la acusación.

## Lo que se pudo hacer porque la premisa anterior era falsa

La campaña anterior cerró con esta corrección escrita: *«la red sólo alcanza
GitHub» era mi premisa y era falsa; PyPI, npm y crates.io responden*. Esta fase
la cobró: `ezdxf 1.4.4` está instalado, y **la medición congelada del oráculo se
regeneró sobre los bytes de hoy**. Lee ahora 5/5 ficheros donde antes leía 3
—los dos que llevaban MTEXT o HATCH no los abría—.

El experimento que **probaba** P-evidencia-07 —parchear los marcadores sobre el
texto ya exportado y releerlo— pasó a ser el **control** que la guarda. Hubo que
hacerlo idempotente: sin eso duplicaba los marcadores y rompía el fichero, que
es exactamente lo que pasó la primera vez que se corrió tras el arreglo. Hoy
dice 0 entidades que parchear y 22 que ya los traían.

## Lo que sigue sin darse

Las 20 filas que retienen su punto, con el motivo que el censo mide:

- **14 · «el corpus de hoy no lo alcanza».** Lo que las serviría está nombrado y
  es alcanzable: un lector de PDF de terceros para la fidelidad de ploteo, un
  oráculo de geometría para el kernel, un lector GIS para las nubes de puntos.
  PyPI, npm y crates.io responden.
- **6 · «no lo sirve material ajeno».** Ningún fichero de terceros puede
  atestiguar esto. Falta la tercera pata de la regla: **un usuario real**.
- **0 · «bloqueado por un defecto medido».** Esta fase vació esa categoría.

Y sigue en pie lo que ninguna sesión cierra: la **firma humana de derechos** del
corpus (2 pt), el runtime .NET/VBA que no se finge, y que ninguno de los
diecinueve ficheros lo guardó AutoCAD — acreditan interoperabilidad con
implementaciones independientes, no compatibilidad con AutoCAD.

## La corrida, con el código de salida real

No con uno enmascarado por un pipe: un `| tail` encadenado con `&&` devuelve el
código de `tail`, y eso ya coló un commit con `check:cad` en rojo antes en esta
misma campaña.

- `npm run typecheck` **EXIT=0** · 8/8 tareas.
- `npm test` **EXIT=0** · **624/624 specs verdes**, 7/7 tareas.
- `npm run lint` **EXIT=0** · trinquete en 489/492.
- `npm run check:cad` **EXIT=0** con `VALLE_DWG_CORPUS_MIRROR`, la cadena entera.
- `check:command-integrity` 294 comandos, **0 éxitos falsos** · `ui-command-reach`
  294/294 alcanzables con el ratón · `check:ribbon-coverage` 294.
- `rubric.spec.mjs` 59 comprobaciones · `check:cad-math` **5 427 casos contra
  oráculo independiente, 0 desviaciones**.

Dos cosas que hay que decir de esta corrida, porque las dos fueron errores míos
al operar los gates y no del producto:

1. `check:cad` falló primero porque invoqué `VALLE_DWG_CORPUS_MIRROR=1`, y esa
   variable quiere la RUTA de un clon, no una bandera. Sin espejo, el gate
   `check:dwg-evidence` falla por el desajuste conocido entre CI y local que
   `docs/history/execution/paid-beta-readiness-2026-08.md` ya describe — y se
   comprobó guardando mis cambios aparte que falla IGUAL sin ellos.
2. `check:cad` volvió a fallar por la matriz del corpus SINTÉTICO
   (`dxf-external-corpus-matrix.json`), desfasada en una sola línea: el mensaje
   de rechazo. Regenerada, dice **0 perdidos en silencio** sobre 27 tipos, y el
   fichero que rechaza recibe ahora «no pudo analizar» —fallo nuestro— en vez de
   «está corrupto» —acusación al remitente—, porque ese fichero sí tiene
   estructura DXF.

Y tres archivos se salieron de su presupuesto de tamaño por lo que añadí. El
gate lo dijo, y ninguno se añadió al manifiesto: los tres se partieron por
fronteras que ya estaban dibujadas —el escaneo de HATCH, que es hermano del de
MTEXT; los avisos declarativos, que son de otra especie que el mapa de
entidades; el acto 3 de la jornada, que ya tenía hermanos fuera—. El trinquete
de lint también se puso rojo, por dos importaciones huérfanas que dejaron esas
particiones: se quitaron; el presupuesto no se tocó.
