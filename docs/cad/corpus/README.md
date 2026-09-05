# Corpus de terceros — DXF que este proyecto no escribió

La regla del corte del 2026-08-22 dice que una fila cuya evidencia entera la
fabricó el propio proyecto no puede llegar a su tope. Este directorio existe
para dejar de fabricar la evidencia: son archivos DXF **escritos por otras
personas**, con su licencia descargada, hasheada y versionada al lado.

No sustituye al corpus propio (`apps/web/src/lib/cad/dxf-corpus-*`), que sigue
siendo quien prueba el ida y vuelta. Responde otra pregunta: *cuando llega un
archivo que nadie de aquí escribió, ¿qué llega y qué se pierde?*

## Lo que este corpus SÍ acredita

Interoperabilidad con material ajeno: diecinueve archivos de dos bibliotecas
libres, en cinco dialectos distintos (R12, R2004, R2007, R2010 y R2013),
leídos por el lector de producción y contrastados contra un lector de terceros.

## Lo que este corpus NO acredita, y hay que decirlo antes

- **No son archivos guardados por AutoCAD.** Son ficheros de prueba de dos
  lectores DXF libres. Acreditan que el formato de otro programa se lee, no
  compatibilidad con AutoCAD. Ninguna afirmación derivada de aquí puede decir
  «compatible con AutoCAD».
- **No son planos de despacho.** Sólo `bjnortier-dxf/floorplan.dxf` se parece a
  lo que un cliente manda de verdad. Los demás son casos de laboratorio de otra
  persona, que es mejor que casos de laboratorio propios pero no es lo mismo
  que producción.
- **No hay firma humana de derechos todavía.** El dictamen automático está
  completo (licencia descargada, identificada y hasheada); la firma del titular
  es lo que falta, y hasta que llegue el criterio de la rúbrica que la pide
  sigue sin concederse. Está escrito así en `manifest.json`, en
  `derechos.firmaHumana`.

## Regla de admisión — fail-closed

Un archivo entra sólo si se cumplen las cinco condiciones, todas comprobables:

1. **Licencia explícita y permisiva** publicada por la fuente (MIT, BSD,
   Apache-2.0, CC0 o dominio público declarado), que autorice redistribuir. El
   TEXTO de esa licencia se descarga a `licencias/` y se hashea. Copyleft
   (GPL/AGPL/LGPL/MPL), «source-available» y todo lo que no tenga licencia a la
   vista quedan fuera, sin excepción y sin discusión.
2. **Procedencia completa**: repositorio, referencia, ruta remota, URL exacta,
   fecha de descarga.
3. **Bytes íntegros**: `sha256` y tamaño en `manifest.json`. Los bytes NO se
   modifican; el hash es lo que lo demuestra.
4. **Titular identificado** y su aviso de copyright conservado.
5. **Motivo escrito**: qué prueba este archivo que los demás no prueban. Un
   archivo sin motivo es peso, no evidencia.

Un archivo cuya licencia no cubra su contenido —material de un tercero metido
dentro de un repositorio libre— **no entra**, aunque el repositorio que lo
aloja sí sea libre. Lo rechazado se anota en `EXCLUIDOS.md` con su motivo: el
corpus prefiere estar vacío a estar sucio.

## Los tres oráculos

El corpus se lee dos veces, con lectores que no son de este proyecto — y desde
el 2026-09-05 hay un tercero que no lee el corpus sino **lo que el modelador 3D
exporta**. Los tres están registrados con nombre, versión, licencia, autor,
origen, `sha256` de la rueda y estado de los términos en
[`oraculos/HERRAMIENTAS.md`](oraculos/HERRAMIENTAS.md), con el mismo rigor que
`docs/TOOLS.md` del repositorio de conformidad exige para ODA File Converter. Ese
registro trae además **lo que se intentó y no entró**, con su comando y su salida
real: LibreDWG (descartada por GPL, no por falta de intento), ODA File Converter
(descarga que sólo puede aceptar una persona), IfcOpenShell y pythonocc-core
(LGPL). El censo ejecutable vive en
`docs/cad/evidence/oraculos-externos-disponibilidad.json` y lo vigila
`apps/web/src/lib/cad/verification/oraculos-externos.spec.ts`, que **vuelve a
sondear la máquina en cada corrida**: una herramienta admisible declarada ausente
que aparece pone la suite en rojo, porque un oráculo disponible y no usado es
evidencia que se está dejando en la mesa.

- **Oráculo A — `dxf-parser`** (MIT, GDS Storefront Estimating). Ya es
  dependencia declarada de `apps/web`, así que corre en CI en cada corrida.
  Punto ciego conocido: no emite HATCH.
- **Oráculo B — `ezdxf` 1.4.4** (MIT, Manfred Moitzi), biblioteca de Python,
  otra lengua y otro autor. Ve lo que el oráculo A no ve —HATCH, LEADER,
  VIEWPORT, estilos de cota— y declara el dialecto real de cada archivo. **No
  está instalada en CI**: su salida se congela como artefacto hasheado en
  `oraculos/`, igual que el repositorio ya hace con ODA File Converter. Cuando
  no está, se declara ausente; nunca se finge. Se regenera con
  `python3 oraculos/censo-ezdxf.py`, que exige `pip install ezdxf==1.4.4`.

El oráculo B tiene dos artefactos, y responden preguntas distintas:

- `oraculos/ezdxf-1.4.4.json` — **el censo**: cuántas entidades de cada tipo
  trae cada uno de los diecinueve archivos, en sus cuatro ámbitos.
- `oraculos/medidas-cuatro-filas-ezdxf.json` — **las medidas por capacidad** de
  los siete archivos que sirven a las cuatro suites por fila: la tabla LAYER
  entera con sus propiedades (y, aparte, el recuento CRUDO de registros del
  fichero, para poder separar lo que el remitente declara de lo que `ezdxf`
  normaliza por su cuenta), el árbol de bloques anidados escalón por escalón, el
  formato de cada MTEXT, la medida de cada cota con el contenido de su bloque de
  dibujo, y el contorno del HATCH con sus aristas y sus vértices equivalentes.
  Lo genera `python3 oraculos/medidas-cuatro-filas.py`.
- `oraculos/medidas-floorplan-ezdxf.json` — **las medidas** del único archivo
  que se parece a un plano de despacho: las 624 longitudes de línea, los 9+20
  radios, los 20 barridos, las 124 longitudes de polilínea (con sus bulges), las
  63 medidas de cota y la extensión del dibujo, cada una con la CLAVE de su
  geometría para poder compararlas entidad por entidad. Lo genera
  `python3 oraculos/medidas-floorplan.py`, que además mide **lo que Valle
  exporta**: el spec de la jornada deja cuatro ficheros en el temporal del
  sistema y el script los lee, así que el artefacto dice si otro programa abre
  lo que escribimos. El orden importa y es este:

  ```sh
  cd apps/web && npx tsx src/lib/cad/verification/terceros-jornada.spec.ts
  cd ../.. && python3 docs/cad/corpus/oraculos/medidas-floorplan.py
  ```

  Cada medición queda anclada al `sha256` de los bytes medidos; el spec
  comprueba ese hash antes de creérsela.

- **Oráculo C — `steputils` 0.1** (MIT, Manfred Moitzi), analizador de la parte
  21 (ISO 10303-21). No lee el corpus ajeno: lee **el STEP que exporta
  `apps/web/src/lib/brep/step-export.ts`**, que hasta el 2026-09-05 sólo había
  leído nuestro propio importador. Cuenta lo mismo que el kernel en los cinco
  sólidos —163 vértices con sus coordenadas, 311 longitudes de arista y los
  recuentos de entidad— y con **sus** números sale la característica de
  Euler-Poincaré de los cinco. Su artefacto es `oraculos/steputils-0.1.json`,
  anclado al `sha256` de los bytes exportados, y se regenera con el spec primero
  y el script después:

  ```sh
  cd apps/web && npx tsx src/lib/cad/verification/oraculos-externos.spec.ts
  cd ../.. && python3 docs/cad/corpus/oraculos/censo-steputils.py
  ```

  Sus dos límites, escritos donde se usan: es del **mismo autor que `ezdxf`**
  (contra el oráculo B no es testigo independiente; contra el producto sí), y es
  un **analizador, no un kernel** — el que reconstruiría el sólido,
  `pythonocc-core`, es LGPL y `CORPUS_POLICY.md` lo prohíbe.

El límite del oráculo A hay que decirlo entero, porque cambia lo que su
coincidencia demuestra: **`apps/web/src/lib/cad/dxf-import.ts` importa
`dxf-parser`**, así que el oráculo A comparte MOTOR DE ANÁLISIS con el lector
de producción. Contra él no se mide el análisis del archivo —se mide la
conversión a entidades canónicas, que sí es código propio—, y la independencia
de análisis la aporta sólo el oráculo B. Se nota en un caso real del corpus:
`blocks2.dxf` lo rechazan a la vez el oráculo A y el lector, y el oráculo B lo
lee sin problema.

**Corrección del censo del oráculo B (2026-09-04).** Su primera versión publicó
un único `archivoEntero` que contaba DOS VECES cada entidad de espacio modelo,
porque `doc.blocks` de ezdxf incluye los bloques `*Model_Space` y
`*Paper_Space`, que no son definiciones de bloque sino el mismo contenido que
ya devuelven los layouts: `lines.dxf` aparecía con 22 líneas cuando tiene 11.
Corregido separando los cuatro ámbitos (`espacioModelo`, `espacioPapel`,
`definicionesDeBloque` y `archivoEntero` como suma sin repeticiones).

## Inventario

`manifest.json` es la fuente única: diecinueve archivos, sus derechos y sus
hashes. Ninguna cifra de este README se repite allí ni al revés.

## Volver a descargarlo

Los bytes están versionados: no hace falta red para verificar el corpus, sólo
para ampliarlo. Cada entrada de `manifest.json` lleva su `urlOrigen`, y el
`sha256` es lo que decide si lo que vuelve es lo mismo que entró.

## Qué lo verifica

Nueve suites, y responden preguntas distintas a propósito. Las nueve corren
con `npm test` y con `npm run check:cad-math`.

- `apps/web/src/lib/cad/verification/dxf-corpus-terceros.spec.ts` — **la puerta
  de derechos**. Comprueba que todo archivo del árbol está en el manifiesto y
  todo archivo del manifiesto está en el árbol, que cada `sha256` y cada tamaño
  cuadran, que cada fuente tiene licencia permisiva identificada con su texto
  hasheado, y que ningún archivo carece de motivo.
- `apps/web/src/lib/cad/verification/dxf-fidelidad-terceros.spec.ts` — **la
  fidelidad**. Recalcula entera la matriz por entidad de
  `docs/cad/evidence/dxf-corpus-terceros-matrix.json` y afirma que es idéntica
  a la comprometida; fija además el número de pérdidas en silencio como techo
  que sólo puede bajar. Para regenerar la matriz a propósito:
  `cd apps/web && VALLE_ESCRIBIR_MATRIZ=1 npx tsx src/lib/cad/verification/dxf-fidelidad-terceros.spec.ts`.
- `apps/web/src/lib/cad/verification/terceros-jornada.spec.ts` — **la jornada**.
  Coge `bjnortier-dxf/floorplan.dxf` —1,1 MB, R2004, 1109 entidades, lo más
  parecido a lo que manda un despacho— y lo abre con el lector de producción,
  compara 3.065 magnitudes contra las que midió `ezdxf` sobre los mismos bytes,
  lo modifica con MOVE/LINE/ERASE del registro de comandos, lo exporta con el
  exportador de producción y lo relee con los dos oráculos. Su artefacto es
  `docs/cad/evidence/jornada-plano-ajeno.json`, y se regenera con
  `cd apps/web && VALLE_ESCRIBIR_JORNADA=1 npx tsx src/lib/cad/verification/terceros-jornada.spec.ts`.
  Lo que hoy dice y no gusta: **`ezdxf` no abre lo que exportamos** porque MTEXT
  y HATCH salen sin marcador de subclase (P-evidencia-07, con el arreglo ya
  probado en `medidas-floorplan.py`); sí abre los otros siete tipos, con cero
  errores de auditoría. La suite vive repartida en cuatro archivos por el
  presupuesto de monolito, y la costura sigue el reparto de la jornada: el spec
  conduce los cuatro primeros actos (el producto trabajando),
  `terceros-jornada-medicion.ts` es el instrumento de medida,
  `terceros-jornada-comandos.ts` el conductor del registro de comandos y
  `terceros-jornada-relectura.ts` el quinto acto, donde el producto ya no hace
  nada y hablan los dos lectores ajenos.
- **Las cuatro suites por fila** (`terceros-capas`, `terceros-bloques`,
  `terceros-texto`, `terceros-cota-sombreado`). La jornada prueba que el
  producto aguanta un plano de 1,1 MB; lo que no prueba es **de quién es cada
  defecto**, porque en un dibujo de 1109 entidades una capa mal pintada se
  pierde entre otras veintitrés. Estas cuatro cogen el fichero ajeno más pequeño
  que atestigua UNA capacidad —tres capas, un bloque, dos textos, dos cotas y un
  sombreado— y la afirman sobre él, así que lo que falla se lee a ojo y no se
  puede discutir. Comparten `terceros-filas.ts` (anclaje por `sha256` en tres
  artefactos a la vez y la publicación del renglón) y su oráculo es
  `oraculos/medidas-cuatro-filas-ezdxf.json`. Cada una publica su renglón en
  `docs/cad/evidence/independencia-terceros.json`, que se regenera fila a fila
  con `cd apps/web && VALLE_ESCRIBIR_TERCEROS=1 npx tsx src/lib/cad/verification/terceros-capas.spec.ts`
  (y una por cada una de las otras tres). Lo que hoy dicen y no gusta: el
  **color de capa** del remitente no se lee ni se escribe y el informe dice «sin
  pérdidas» (P-evidencia-12); el **MTEXT de dentro de un bloque** sale a espacio
  modelo sin la transformación acumulada —135 rótulos en el plano ajeno—, y con
  eso cada cota ajena llega además con su número escrito dos veces
  (P-evidencia-11); `blocks2.dxf` se **rechaza entero**
  por un `$XCLIPFRAME` = 2 legítimo, con un mensaje que acusa al remitente
  (P-evidencia-13); y un contorno de HATCH de cuatro aristas **rectas** se
  descarta por «no poligonal» (P-evidencia-14).
- `apps/web/src/lib/cad/verification/independencia-rubrica.spec.ts` — **el
  censo**. No mide el corpus: mide qué filas de la rúbrica competitiva podría
  servir este corpus y cuáles no. Genera
  `docs/cad/evidence/independencia-por-fila.json` desde `scripts/cad/rubric.mjs`
  (las filas no se listan a mano), fija el número de filas con tope como
  trinquete que sólo puede bajar y RECHAZA cualquier parche que marque
  `independent: true` sobre una ruta que no esté en su lista de fuentes ajenas
  admitidas. Es la única de las cuatro que aporta **cero** casos al total de
  `check:cad-math`, y lo dice en su propia salida: sus afirmaciones son
  estructurales sobre la rúbrica, no medidas del dibujo contra un oráculo
  externo. Se regenera con
  `cd apps/web && VALLE_ESCRIBIR_CENSO=1 npx tsx src/lib/cad/verification/independencia-rubrica.spec.ts`.
- `apps/web/src/lib/cad/verification/oraculos-externos.spec.ts` — **el censo de
  los oráculos**. Sondea la máquina en cada corrida (siete candidatos y
  veintiún binarios), afirma la regla de una sola dirección, exige que el
  `sha256` de cada rueda y de cada licencia cuadre en los tres sitios donde está
  escrito, y **vuelve a correr los dos censos congelados cuando la herramienta
  está presente**, comparándolos byte a byte. Cuando no está, declara la
  ausencia. Sus 524 magnitudes del sólido salen del artefacto congelado, así que
  la cifra es la misma con Python instalado y sin él: una cifra que dependa del
  entorno es el defecto que `check:cad-math` se escribió para no tener. Se
  regenera con
  `cd apps/web && VALLE_ESCRIBIR_ORACULOS=1 npx tsx src/lib/cad/verification/oraculos-externos.spec.ts`.
