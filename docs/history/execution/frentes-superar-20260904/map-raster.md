# F8 · Toolsets Map 3D y Raster Design

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/history/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `apps/web/src/lib/cad/geo*`
- `apps/web/src/lib/cad/map*`
- `apps/web/src/lib/cad/raster*`
- `apps/web/src/lib/cad/image*`
- `apps/web/src/lib/cad/engine/commands/geo*|map*|image*|vector*`
- `specs y goldens`

## Cola

1. Map: más sistemas de coordenadas (todo México y los EPSG comunes de LATAM); COGO (rumbos y distancias, cuadro de construcción); topología y consultas espaciales; edición de atributos GIS en tabla; exportar shapefile y GeoJSON (hoy sólo se importa).

2. Raster: **vectorización de líneas y textos de un escaneo** — es un criterio ABIERTO de la rúbrica que vale 2 pt, es tu entrega de mayor valor; IMAGEFRAME y transparencia; corrección de deformación y limpieza (deskew, despeckle).

## Cierre

Filas Map y Raster a 4/4 salvo evidencia independiente; el criterio de vectorización otorgado por la rúbrica.

## Lo que hay que tener presente

Fondos de mapa en línea sólo con permiso de uso escrito; si no lo hay, no se pone.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/history/execution/frentes-superar-20260904/map-raster-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-map-raster` sobre la rama `campana/superar/map-raster`. Commits sí;
  **push a origin no** (el coordinador hace un push por ventana).
- **R6 Las reglas de la casa, intactas.** Prohibido relajar gates, umbrales, goldens o
  presupuestos. Prohibido tocar identificadores persistidos (IDENTITY.md, ADR-0010).
  Prohibido renombrar `data-testid`. Fix-or-hide: lo que no gana su evidencia no es visible.
  Ningún claim sin evidencia; lo parcial se declara «todavía no» en tu bitácora, con fecha.
  Las banderas `DWG_IMPORT_FLAG` y `DWG_EXPORT_FLAG` NO se encienden en esta campaña.
- **R7 Bitácora.** Este archivo es tu memoria. Si tu contexto se compacta, lo relees primero.
  Nunca se pregunta al titular: se decide, se anota y se sigue.

## Cómo se valida antes de dar algo por hecho

```
cd /home/user/vd-map-raster
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

### 2026-09-04 · VECTORIZE, primera mitad: del escaneo a polilíneas

Lo que existe ahora y antes no:

- `apps/web/src/lib/cad/raster-decode.ts` — decodificador de imagen PURO en el motor, sin
  navegador y sin red. PNG (profundidades 1, 2, 4, 8 y 16; los cinco tipos de color; los cinco
  filtros; `PLTE` y `tRNS`) y BMP sin comprimir (1, 4, 8, 24 y 32 bits, de abajo arriba y de
  arriba abajo, cabecera CORE de 12 e INFO de 40+). El IDAT lo infla `cadPdfInflate`, que ya
  existía con spec propia desde el importador de PDF: la pieza cara no se reescribió.
  JPEG, GIF, WebP y TIFF se RECHAZAN diciendo el límite y la salida; el PNG entrelazado y el BMP
  con RLE también. Un archivo cortado o con un CRC tocado falla CERRADO.
- `apps/web/src/lib/cad/raster-vectorize.ts` — la tubería: umbral de Otsu, despeckle por
  componentes conexas con su recuento, adelgazamiento de Zhang-Suen, recorrido del esqueleto por
  nodos y extremos (con el descarte de enlaces diagonales redundantes, sin el cual las esquinas
  de un rectángulo parecen nodos y el contorno sale en cuatro trozos) y ajuste con
  Douglas-Peucker más fusión de tramos colineales. Sale una polilínea canónica por trazo, en
  píxeles con la Y hacia arriba: el sistema que come `cadImagePixelToWorld`.
- `apps/web/src/lib/cad/engine/commands/vectorize-raster.ts` — el comando VECTORIZE: designa una
  IMAGE ya adjunta, enseña el plan con el manifiesto (umbral, manchas descartadas y sus píxeles,
  tolerancia, trazos) y sólo escribe al confirmar, igual que MAPIMPORT. Tolerancia, Mancha y
  Umbral rehacen el plan sin tocar el dibujo.
- `apps/web/src/lib/cad/image-fixtures.ts` — se le añadieron `cadPngTypedFixture` (los cinco
  tipos de color y las profundidades por debajo de 8) y `cadBmpFixture`. Un decodificador sin
  archivos de los cuatro tipos no está probado: está escrito.

Evidencia, con las tres órdenes que la producen:

```
cd /home/user/vd-map-raster/apps/web
npx tsx src/lib/cad/raster-decode.spec.ts                       # 61 comprobaciones
npx tsx src/lib/cad/raster-vectorize.spec.ts                    # 43 comprobaciones
npx tsx src/lib/cad/engine/commands/vectorize-raster.spec.ts    # 68 comprobaciones (hoy 98: el spec creció con el texto)
```

El número que cierra la entrega: un PNG de 40 × 30 con un rectángulo de (5, 5) a (34, 24) y una
diagonal de (10, 10) a (22, 22), adjuntado con IMAGEATTACH en (1000, 500) a 1 px = 100 mm y
girado 90°, vuelve como dos polilíneas cuyos seis vértices caen a menos de **una micra** —el
criterio pedía menos de 1 px, que son 100 mm— del vértice de origen en coordenadas del dibujo.
El polvo sembrado a propósito (cinco motas) no produce ni una entidad y el manifiesto dice que
quitó cinco manchas de cinco píxeles.

Decisiones que conviene no volver a discutir:

- **Se decodifica en el motor, no en el anfitrión.** El navegador ya decodifica la imagen una
  vez para saber su tamaño; volver a pedírselo para vectorizar habría atado la entrega a un
  `canvas` y la habría hecho improbable fuera del navegador. El motor es puro y se prueba con
  `tsx`, sin abrir nada.
- **La colocación no se repite.** La vectorización no sabe nada de la escala ni del giro: saca
  píxeles y los pasa por `cadImagePixelToWorld`, donde la escala y la rotación ya viven dentro
  de `uVector`/`vVector`. Por eso el giro de 90° no desplaza un solo vértice.
- **Se rechaza en vez de adivinar.** Un JPEG no se lee «como se pueda»: se dice que el motor no
  lleva descodificador JPEG y que hay que volver a guardar en PNG o BMP.

Registrar el comando cae FUERA del territorio (`engine/index.ts`, `alias-table.ts`,
`command-summaries.ts`, `ribbon.ts`): las seis peticiones están escritas con su diseño completo
en `map-raster-peticiones.md`. Hasta que el coordinador las aplique, VECTORIZE existe, está
probado por su descriptor exportado y **no se puede teclear** — que es lo que manda fix-or-hide.

El árbol compila (`npm run typecheck`, 8 de 8) y los vecinos siguen verdes
(`image-geometry.spec.ts` 44, `raster-image.spec.ts` 75, `paper-space-image.spec.ts` 29,
`pdf/pdf-inflate.spec.ts` 73).

### 2026-09-04 · VECTORIZE, segunda mitad: el rótulo vuelve a ser un TEXT

`raster-text-recognize.ts` (759 líneas) y `raster-text-templates.ts` (318) reconocen el texto de
un escaneo por PLANTILLA contra las MISMAS fuentes de trazos Hershey con las que el producto
dibuja su TEXT (`lib/cad/fonts/`). No es un OCR y no se vende como tal: lee rótulos trazados con
una fuente de trazos —`txt`, `simplex`, `romans`, `isocp`, `monotxt`—, no manuscrito ni
tipografías de contorno relleno, y ese límite va escrito en la cabecera del módulo, en el plan
del comando y en el aviso que queda registrado en el dibujo.

La tubería, con el porqué de cada paso:

1. **La misma tinta que el calco.** `cadRasterInkMask` se extrajo de `raster-vectorize.ts` y lo
   usan los dos: si cada mitad umbralizara por su cuenta, las cajas de los glifos leídos no
   taparían los trazos que los produjeron y la letra saldría dos veces en el dibujo.
2. **Esqueleto contra esqueleto.** Mancha y plantilla pasan por el MISMO `cadRasterThin`. Sin
   eso la distancia mide sobre todo el GROSOR de la plumilla: medido, con el rótulo engrosado la
   `I` quedaba a 0,025 y la `1` a 0,026, y ninguna ganaba el margen.
3. **Renglones por solape vertical**, con los acentos sueltos pegados después a la letra que
   tienen debajo — sin ese paso `AÑO` se lee `ANO`, que es otra palabra y no una errata.
4. **Base y altura ajustadas, no sólo medidas.** La línea base es una RECTA de mínimos cuadrados
   por los pies de las letras (por debajo de un cuarto de grado manda la mediana, porque ahí el
   ajuste es ruido), y sobre la altura medida se prueban siete hipótesis de escala: gana la que
   más glifos lee.
5. **Chanfle simétrico normalizado**, alineando por la línea base —lo que separa una coma de un
   apóstrofo— y por el CENTRO DE MASA horizontal, probando los tres corrimientos enteros
   vecinos. Alinear por el canto izquierdo hacía que un píxel de ruido corriera el glifo entero:
   la `I` de PREDIO se leía `í`. Medio píxel de redondeo sube la distancia de un glifo exacto de
   0,004 a 0,035.
6. **Los espacios se miden.** Con el glifo reconocido se sabe su avance; el hueco hasta la
   siguiente célula, dividido entre el avance del espacio, da cuántos van. Nada de umbrales a
   ojo sobre la separación.

Los dos cortes son constantes con su medida detrás: `CAD_RASTER_TEXT_MAX_DISTANCE = 0,04`
(un glifo limpio queda entre 0,000 y 0,013; engrosado y con 2 % de ruido, hasta 0,024; una
estrella de cinco puntas dibujada a mano da 0,046 y un garabato 0,070) y
`CAD_RASTER_TEXT_MARGIN = 0,12` sobre la segunda plantilla. Lo que no los gana **no se
inventa**: se queda como polilínea y el recuento lo dice.

Cómo se comprueba:

```
cd /home/user/vd-map-raster/apps/web
npx tsx src/lib/cad/raster-text-recognize.spec.ts               # 94 comprobaciones
npx tsx src/lib/cad/engine/commands/vectorize-raster.spec.ts    # 98 comprobaciones
```

Los números que cierran la entrega. «PREDIO 4-A · 1 240.50 m2» trazado con
`cadHersheyTextStrokes` a 24 px de altura de mayúscula y rasterizado a un PNG de
`cadPngFixture` vuelve **carácter a carácter**, con la altura EXACTA (el criterio pedía menos
del 5 %) y la inserción en el píxel exacto (el criterio pedía menos de 1 px). El mismo rótulo
con el trazo engrosado una pasada y un 2 % de píxeles invertidos da la misma cadena, la misma
altura y la misma inserción. Un garabato a mano metido en el hueco del rótulo queda a 0,065 de
su mejor plantilla —por encima del corte 0,04—, sale como geometría y el aviso lo cuenta; en su
sitio NO aparece ninguna letra parecida. De punta a punta: el PNG del rótulo adjuntado con
IMAGEATTACH a 1 px = 10 mm vuelve como UNA entidad TEXT de altura 240 mm en (245, 235), sin que
ninguno de sus 36 trazos se escriba además como polilínea; con la imagen girada 90° el texto
sale girado 90°.

Decisiones que conviene no volver a discutir:

- **El `·` no se lee como `·`, y está bien.** La colección Hershey no tiene punto medio y
  `cadHersheyGlyph` lo dibuja como `?`. Lo que se compara es lo que SE DIBUJÓ, así que se lee
  `?`. Afirmar que se leyó un `·` sería afirmar que se leyó un glifo que nadie trazó.
- **`I` y `l` son el mismo trazo** en el juego Simplex, con el mismo avance. No hay píxel que
  las separe: las plantillas idénticas se colapsan en una clase, se lee la primera del orden
  declarado (`I`) y el glifo publica en `ambiguousWith` con quién se colapsó.
- **Por plantilla y no por rasgos.** Un clasificador de rasgos necesitaría datos de
  entrenamiento que este repositorio no tiene y no podría citar. Una plantilla necesita la
  fuente, que sí está aquí y es de dominio público.

El árbol compila (`npm run typecheck`, 8 de 8), el presupuesto de monolito sigue OK (ningún
archivo nuevo pasa de 800 líneas: por eso el reconocimiento va en dos módulos, la tubería y la
ventana de comparación) y los vecinos siguen verdes (`raster-decode.spec.ts` 61,
`raster-vectorize.spec.ts` 43, `fonts/hershey-fonts.spec.ts`).

## «Todavía no»

### 2026-09-04 · Lo que VECTORIZE no reconoce

Declarado en el propio plan del comando y en el aviso que queda registrado, no sólo aquí:

- **Arcos y círculos.** Todo trazo sale como polilínea de tramos rectos. Reconocerlos es ajustar
  primitivas a la cadena por mínimos cuadrados; no es de esta entrega.
- **Sombreados y zonas macizas.** Salen como su contorno, no como HATCH.
- ~~**Texto.**~~ Hecho el 2026-09-04 (segunda mitad): se reconoce por plantilla contra los
  glifos Hershey y sale como TEXT. Lo que de ESO sigue sin hacerse va abajo, en su propia
  entrada.

### 2026-09-04 · Lo que el reconocimiento de texto NO lee

Declarado en `CAD_RASTER_TEXT_LIMITS`, en el plan de VECTORIZE y en su aviso:

- **Manuscrito y tipografías de contorno relleno.** Esto compara contra fuentes de TRAZOS. Una
  Arial escaneada es un contorno macizo, no un esqueleto, y su plantilla aquí no existe.
- **Letras que se tocan.** Con el trazo muy engrosado, `r` y `t` de «vertice» se leen como una
  sola mancha, no ganan el margen y salen como polilínea. Medido: 41 de 54 rótulos de una
  batería deliberadamente dura (seis rótulos × nueve condiciones de altura, engrosado y ruido)
  salen carácter a carácter; los 13 restantes pierden un glifo o un punto decimal, y ninguno
  inventa una palabra distinta.
- **Más de 3° de inclinación.** A 1°, 1,5°, 2° y 3° se leen los 19 glifos del rótulo y el giro
  sale a menos de una décima del real; a 5° la franja del renglón deja de solaparse consigo
  misma de un extremo al otro y el renglón entero se deja como geometría en vez de leerse a
  trozos. `CAD_RASTER_TEXT_MAX_SKEW_DEG = 3` lo dice.
- **Alturas de mayúscula pequeñas.** Por debajo de unos 18 px el punto decimal tiene cuatro
  píxeles o menos y se pierde: «240.50» se lee «240 50». El área mínima del reconocedor son 4 px
  a propósito —lo que mide ese punto—, y una mota de cuatro píxeles sobre la línea base es,
  píxel a píxel, indistinguible de un punto: por eso el aviso dice cuántas manchas se
  descartaron.
- **MTEXT, párrafos y estilos.** Cada renglón sale como un TEXT independiente. Ni se agrupan en
  un MTEXT, ni se reconoce negrita, ni oblicuidad, ni factor de anchura.

### 2026-09-04 · Lo que el decodificador no lee

- **JPEG, GIF, WebP y TIFF.** Cada uno se rechaza con su motivo y con la salida (volver a
  guardar en PNG o BMP). IMAGEATTACH sigue aceptándolos para VER la imagen: es el navegador quien
  los pinta. Lo que no se puede es vectorizarlos.
- **PNG entrelazado (Adam7)** y **BMP comprimido** (RLE, BITFIELDS).
- **Más de 24 Mpx.** El tope está declarado en `CAD_RASTER_MAX_PIXELS` y se dice antes de
  reservar memoria.
- **Zhang-Suen come dos píxeles en cada punta** de un trazo romo (una barra de 24 × 3 px da una
  línea media de 20 px). Es la cifra real, medida en el spec, no una holgura: corregir el
  extremo pide una reconstrucción del final del trazo que no está hecha.

### 2026-09-04 · COGO y el cuadro de construcción: la lámina que se protocoliza

Lo que existe ahora y antes no:

- `apps/web/src/lib/cad/geo-cogo.ts` — la aritmética de un levantamiento, PURA: no conoce
  entidades ni unidades de dibujo. Rumbo por cuadrante (`N 45°30'20" E`) ↔ azimut ↔ radianes del
  motor, con los cuatro ejes en forma CANÓNICA para que la ida y vuelta valga también en 0°,
  90°, 180° y 270°. Grados-minutos-segundos que van y vuelven campo a campo, con el acarreo que
  evita escribir `44°59'60"`. Lectura de rumbos en las escrituras con que se teclean de verdad
  (`N45d30m20sE`, `N 45-30-20 E`, `S 12°04'10" O`, `SUR`) y RECHAZO CON MOTIVO de lo que no lo
  es: ningún rumbo mal escrito degrada a 0. Poligonal levantada de una lista de rumbo+distancia
  o de un cuadro PEGADO con un tramo por renglón; error de cierre lineal con su rumbo y su
  precisión 1:N; superficie por Gauss; ángulos interiores; cierre ANGULAR contra los ángulos
  leídos; y compensación por la regla del compás (Bowditch), que cierra exacto y dice cuánto se
  movió cada vértice.
- `apps/web/src/lib/cad/engine/commands/geo-cogo.ts` — las dos órdenes. **COGO** dibuja la
  polilínea, enseña el plan (cada lado, perímetro, superficie, cierre y precisión) y sólo
  escribe al confirmar; **no cierra la poligonal a la fuerza** —el último vértice queda donde
  las cuentas lo dejan— y `Compensar` la cierra por la regla del compás DICIENDO cuánto repartió.
  Las distancias se leen en METROS, que es como viene un cuadro, y `Unidades` cambia a las del
  documento. **CUADROCONSTRUCCION** designa una polilínea cerrada y emite una entidad TABLE
  canónica de 8 filas × 7 columnas: `EST · PV · RUMBO · DISTANCIA · V · X · Y` y el renglón de
  superficie. Con el marcador GEO puesto, X e Y son el ESTE y el NORTE de verdad, vía
  `cadGeoreferenceWorld`.

Evidencia, con las dos órdenes que la producen:

```
cd /home/user/vd-map-raster/apps/web
npx tsx src/lib/cad/geo-cogo.spec.ts                       # 200 comprobaciones
npx tsx src/lib/cad/engine/commands/geo-cogo.spec.ts       # 86 comprobaciones
```

Los números que cierran la entrega: la poligonal de cinco lados de un cuadro real —rumbos a
segundo entero y distancias al milímetro— cierra a **0.401 mm** con precisión **1:348 787**, y
su superficie, **1 231.53 m²**, coincide con la de Gauss calculada en la propia spec sobre los
vértices, por camino independiente. Con el marcador GEO de la zona 14N en el origen del dibujo,
la columna X del vértice 1 del cuadro dice **660,000.000** y la del vértice 2 **660,042.150**.

Dos cosas que se aprendieron construyendo, y que están escritas en el código:

- **Gauss sobre coordenadas UTM pierde cifras.** Los productos `x·y` de la fórmula valen
  1,4 × 10¹² y el área que sale de restarlos vale dos mil: el `float64` se come seis cifras y la
  superficie del predio baila en la quinta décima (6,6 µm² medidos en la spec). El anillo se
  traslada al primer vértice antes de sumar —exactamente reversible— y las cifras vuelven.
- **Compensar mueve el rumbo.** Repartir 0,4 mm de cierre entre cinco lados desplaza el vértice
  2 tres décimas de milímetro, y sobre un lado de 42 m eso es un segundo de arco: el cuadro
  publica `N 89°58'19" E` donde la libreta decía `20"`. Por eso los rumbos del cuadro se
  RECALCULAN sobre las coordenadas que se publican: así la lámina es consistente consigo misma,
  que es lo que el Registro comprueba.

Cinco peticiones nuevas (P-map-raster-07 a 12) para registrar las órdenes, sus alias, sus
resúmenes y su sitio en la cinta: hasta que el coordinador las aplique, las dos órdenes existen
y están probadas pero **no se pueden teclear**, y nada en la interfaz las anuncia.

### 2026-09-04 · Lo que COGO todavía no hace

- **Distancia de cuadrícula, no de terreno.** No se aplica el factor de escala de la proyección
  (0,9996 en el meridiano central de una zona UTM) ni la reducción al nivel del mar. Va escrito
  en el plan y en el aviso de las dos órdenes: son unos cuatro centímetros por kilómetro, y
  callarlos movería un lindero.
- **Lados en ARCO.** Una polilínea con `bulge` se RECHAZA diciendo que un cuadro de construcción
  publica lados rectos y que los curvos —con su radio, su desarrollo y su cuerda— todavía no se
  emiten.
- **Compensación por mínimos cuadrados.** La que hay es la regla del compás, que es la que se
  enseña y la que un cuadro declara.
- **La libreta de tránsito completa.** `cadCoursesFromAngles` levanta la poligonal desde el
  azimut del primer lado más los ángulos interiores, y `cadAngularClosure` mide el cierre
  angular de esas lecturas; lo que no hay es una orden que capture ángulo a ángulo desde el
  aparato.
