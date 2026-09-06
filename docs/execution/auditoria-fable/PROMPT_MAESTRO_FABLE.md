# Prompt maestro — Campaña «El lunes de un arquitecto»

> **Cómo se usa:** pega este documento entero como primer mensaje de una sesión
> nueva de Claude Code sobre `/home/user/valle-design`. No hace falta ningún otro
> contexto. Si el contexto se compacta, este fichero se relee **primero**.
>
> **Encargo en una frase:** que un arquitecto que no conocemos abra Valle Design
> el lunes por la mañana, dibuje su trabajo del día entero, lo entregue, y no se
> encuentre ni una sola cosa que el producto le dijo que hacía y no hace.
>
> **Esta sesión hace dos cosas a la vez: audita y construye.** Auditar sin
> construir produce informes; construir sin auditar produce afirmaciones falsas.
> La regla que las une es la de la casa: **ningún claim sin evidencia**, en el
> código y en lo que escribas sobre el código.

---

## 0 · Lo primero que haces, antes de leer el resto

Diez minutos, en este orden, y no se salta ninguno:

```bash
cd /home/user/valle-design
git status --short                      # ¿hay trabajo ajeno sin commitear?
git log --oneline -5
node scripts/cad/rubric.mjs | tail -6    # la cifra de HOY, recomputada
wc -l apps/web/src/components/cad/editor/Layout3DEditor.tsx
node -v && /opt/node20/bin/node -v
```

Lee después, en este orden, y sólo estos cuatro:

1. `AGENTS.md` — las reglas de la casa. **Son gates, no opiniones.**
2. `docs/execution/auditoria-fable/00-PUNTO-DE-PARTIDA-VERIFICADO.md` — lo
   verificado a mano el 2026-09-05. **Si algo lo contradice, gana este documento.**
3. `docs/execution/auditoria-fable/00c-CUADRO-DE-MANDO.md` — los 19 bloqueantes
   confirmados y los 106 huecos que el escéptico añadió, con sus `grep` hechos.
4. `docs/parity/ESCALERA.md` §«Los siete peldaños» — qué se puede prometer en cada uno.

Los veintitrés informes largos viven **un nivel más adentro**, en
`docs/execution/auditoria-fable/dimensiones/` —veinte de dimensión y tres lentes
de completitud—, y están ahí a propósito: son **1,3 MB** y leerlos todos gasta la
sesión antes de empezar. **No los leas enteros.** Abre uno, por su sección
concreta, cuando vayas a tocar esa dimensión. La carpeta de arriba tiene sólo los
cuatro documentos que sí se leen, para que listarla no te cueste nada.

---

# 1 · LA VERDAD

Sin adornos. Un prompt que empieza mintiendo produce una sesión que termina
mintiendo.

## 1.1 · Las dos cifras, y qué miden de verdad

| | |
|---|---:|
| Rúbrica competitiva contra AutoCAD 2027 (**alcance DESTINO**) | **244/271 (90,0 %)** |
| Alcance de HOY — dibujo 2D técnico, la cifra de cliente | **185/197 (93,9 %)** |
| Puntos con evidencia **independiente** (oráculo ajeno, material de terceros) | **28** |
| Filas que llegan a su tope | **11 de 36** |
| Filas que retienen 1 pt por no tener testigo ajeno | **20** |
| Specs de `apps/web` | **624** |
| Goldens de navegador | **105** |
| Comandos en el registro, alcanzables con el ratón | **294 / 294** |
| Casos numéricos contra oráculo independiente, 0 desviaciones | **5 427** |

**Y aquí está el problema.** Esa rúbrica dice 90 % y la auditoría de veinte
dimensiones —cada hallazgo revisado por un escéptico independiente contra el
árbol real— pone **5,15/10 de media**. Las dos cifras son correctas y miden
cosas distintas:

- La rúbrica mide **si la capacidad existe con evidencia**. Casi siempre existe.
- La auditoría mide **si un profesional puede usarla el lunes**. Muy a menudo no.

De **295 huecos auditados, 285 se confirmaron reales**; sólo 10 se refutaron
—ya estaban construidos—. De los reales, **19 bloquean el trabajo** y 118 son de
severidad alta. Los escépticos añadieron **106 huecos más que el auditor no vio**,
de los cuales **49 son altos o bloqueantes**. Tres lentes de completitud
posteriores (negocio, navegador, modos de fallo) añadieron **33 huecos y 13
defectos** en territorio que ninguna de las veinte dimensiones cubría.

**La distancia entre 90 % y 5,15/10 es el encargo de esta campaña.**

## 1.2 · Dimensión a dimensión, con la nota del escéptico

La nota es la del **escéptico** que revisó cada informe contra el árbol, no la
que se puso el auditor: la del auditor era sistemáticamente más alta.

| Nota | Dimensión | Reales / auditados | Bloq. |
|---:|---|---:|---:|
| **2,0** | Toolsets Mechanical y Electrical | 14/14 | 2 |
| **3,0** | Visualización 3D: estilos, render, materiales, luces, navegación | 16/16 | 1 |
| **3,0** | Toolset Architecture | 15/15 | 2 |
| **3,5** | Toolsets MEP y Plant 3D | 15/15 | 0 |
| **4,0** | Modelado 3D: sólidos, superficies, mallas, SCU | 14/15 | 2 |
| **4,0** | Interoperabilidad: DWG, PDF, IFC, nubes de puntos, Revit | 15/15 | 3 |
| **4,0** | Trabajar con otros: xrefs, contenido, revisión, versiones | 14/14 | 1 |
| **4,5** | Espacio papel, láminas y publicación | 15/15 | 1 |
| **4,5** | *(lente)* El navegador: lo que sólo un CAD en la web puede dar | 10 + 6 def. | 2 |
| **5,0** | Toolsets Map 3D y Raster Design | 12/14 | 0 |
| **5,0** | Automatización y productividad del despacho | 13/15 | 2 |
| **5,5** | La cinta y cómo se usa de verdad | 14/14 | 0 |
| **6,0** | Seguridad: autenticación, secretos, multiusuario, OWASP | 15/15 | 1 |
| **6,0** | Frontend: arquitectura, estado, monolitos | 13/14 | 1 |
| **6,0** | Landing, alta de cuenta y primeros cinco minutos | 15/15 | 1 |
| **6,0** | Accesibilidad, teclado e idiomas | 15/15 | 0 |
| **6,5** | Backend: API, datos, escalabilidad | 14/15 | 0 |
| **7,0** | El flujo diario de dibujo 2D | 15/15 | 1 |
| **7,0** | Rendimiento: bundle, render, 100k entidades, memoria | 13/15 | 0 |
| **7,5** | Diseño visual: sistema, tipografía, color, densidad, movimiento | 14/14 | 1 |
| **7,5** | Calidad del código: deuda, duplicación, tipos, pruebas débiles | 14/15 | 0 |
| *(lente)* | El negocio: cobrar, crecer, entrar y salir | 11 + 6 def. | 2 |
| *(lente)* | Los modos de fallo: qué pasa cuando algo se rompe | 12 + 7 def. | 1 |

**Lo que esta tabla dice, sin diplomacia:**

- **El 2D básico está bien** (7,0) y es la mitad que se vende. El 3D **no**
  (4,0 y 3,0): no existe ninguna transformación 3D —un sólido no se puede
  inclinar, porque `CadSolidPlacement` es una afín 2×3 más un `dz` y **el
  esquema persistido no tiene dónde escribir el giro**—, `EXTRUDE` aplana el
  perfil inclinado en silencio, y el estilo visual sólo alcanza a `solid3d`,
  o sea que confirma por la línea de comandos un cambio que sobre muros, losas
  y cubiertas **no ocurre**.
- **Los siete toolsets son la nota más baja del producto** (2,0 a 5,0) y son
  justo lo que AutoCAD vende de más en la suscripción cara. `FLATSHOT` y
  `SECTION` no ven la entidad `wall`: **no se puede sacar un corte ni un
  alzado**. El DXF sale sin puertas ni ventanas. El número de conductor y la
  etiqueta del componente **no se dibujan en el plano**, en el sitio donde el
  repositorio jura por escrito que sí.
- **La entrega es más débil que el dibujo.** No se puede dibujar ni escribir
  sobre el papel; la ventana gráfica no recorta en el PDF de `PLOT` y el aviso
  afirma que sí; una capa marcada «no imprimir» se imprime en los dos PDF; el
  DXF entregado no lleva las láminas.
- **Trabajar con otros está a medias.** Para adjuntar una xref hay que teclear
  un UUID; el plano del estructurista llega aplastado a **una sola capa gris**;
  el botón «Versiones» abre un diálogo cuyo servidor **devuelve 404 siempre**.
- **La infraestructura de abajo es excelente y está infravalorada.** CAS
  atómico real, diario de recuperación con carril por pestaña, hash SHA-256
  verificado, bomba de gzip acotada, guardián de `webglcontextlost` con su
  `preventDefault()`, matriz ejecutable de 34 flujos sin red, ventana de pérdida
  **medida y publicada en 16,9 s**, y las pruebas que lo sostienen corren en CI
  contra API real y PostgreSQL. Ocho cosas que el auditor entró a buscar
  convencido de que faltaban **están, y bien hechas**.
- **La maquinaria de cobro también está construida con rigor** —catálogo servido
  de la base, aritmética en céntimos enteros, checkout con tarjeta/OXXO/SPEI,
  asientos comprobados en el servidor, reembolsos y disputas por webhook— y
  **nadie lo sabía**, porque ninguna de las 36 filas de la rúbrica mide la compra.

## 1.3 · Lo que YA ESTÁ y no se vuelve a construir

Esta lista existe para ahorrarte días. Diez huecos de la auditoría se refutaron
—estaban construidos—, y los tres informes de completitud encontraron otras
tantas. **Antes de construir cualquier cosa de esta lista, ábrela y míralas:**

- **La beta DWG de importación está FIRMADA y CABLEADA de punta a punta.**
  `dwg-interop-flag.ts:174` y `:242` tienen `ownerSigned: true` para AC1015 y
  AC1018, ADR-0009 §6-bis/ter/quater y §7, perfil
  `AC1015_MODELSPACE_2D_V3`. El tablero ya ofrece `.dwg` cuando la variable está
  encendida. Lo que falta es la firma de la **familia moderna** (AC1024/27/32,
  `ownerSigned: false`), el dictamen jurídico y encender una variable en un
  despliegue. **`DWG_IMPORT_FLAG` y `DWG_EXPORT_FLAG` siguen en `false` a
  propósito y esta sesión NO los toca.**
- **El escritor DWG público existe** (`dwg-native-writer.ts`, 469 líneas,
  ADR-0009 §8 firmada). Lo abierto es `externalOracleVerified: false`: una
  corrida de ODA File Converter que sólo puede hacer el titular.
- **La cadena puntero → plano de trabajo está cableada** y con su razonamiento
  escrito: `command-engine-host.ts:451`, `Layout3DEditor.tsx:6451`,
  `pointer-work-plane.ts:117`, `view-controller.ts:610`. Y `RECTANG` **sí** está
  declarado espacial. No hay que arquitecturar planos de trabajo: hay que depurar
  los que existen y **declarar los 272 comandos de 294 que no declaran nada**.
- **El motor 3D de enganche a sólidos existe y es bueno** — un auditor lo puntuó
  a ciegas con 5/10 mirando el adaptador equivocado.
- **El motor de selección profesional está completo por debajo**: ventana, cruce,
  polígono, valla y lazo en `native-selection-index`, más `QSELECT` y `FILTER`.
  Lo que falta es poder llamarlo por teclado **desde dentro de un comando**.
- **`professional-snapping.spec.ts:22-42` es un spec VERDE sobre una función
  MUERTA**: afirma que el motor resuelve `insertion`, `geometric-center`,
  `tangent` y `quadrant` sobre una escena escrita a mano, mientras los
  adaptadores del documento no alimentan cuatro de los catorce cubos.
- **`/demo` ya abre el DXF del propio visitante, sin cuenta y sin red.** `DXFIN`
  está en el registro (`command-manifest.ts:150`) y su implementación no toca la
  red: el fichero entra por `engine.feedFile`. Un visitante anónimo teclea
  `DXFIN` y ve **su** plano en diez segundos. **Nada en el sitio lo dice.**
- **El aislamiento de inquilinos y los cuatro P0 de cobro de agosto están
  cerrados**, verificados uno a uno el 2026-09-05. No los vuelvas a auditar.
- **La aceptación legal versionada ya está conectada al checkout**, contra lo que
  dice la checklist legal.
- **`redefineCadBlock` sube la versión a 2** (`block-edit-session.spec.ts:77`
  pasa): el defecto del panel de bloques vive en el **puente**, no en el dominio.
- **`placeBody` ya invierte las caras cuando el determinante es negativo**: la
  mitad difícil de `MIRROR3D` está resuelta.
- **`tessellateBody` ya produce posiciones e índices**: un escritor STL ASCII
  son cuarenta líneas.

## 1.4 · La contradicción que hay que resolver antes de creerse nada

`apps/web/e2e/auditoria/` tiene **28 ficheros y 59 casos** que nacieron rojos a
propósito, excluidos de la suite por `playwright.config.ts:47`
(`testIgnore: ["auditoria/**"]` salvo con `E2E_AUDITORIA=1`). El manifiesto
declara `techo: 28`. **Ese techo describe la foto del 2026-09-01 y está viejo.**

Corridos contra el navegador real el 2026-09-05: **12 rojos, 47 verdes**. Pero
cuatro pruebas llevan `test.fail()`, que **invierte el veredicto**, y el
reportero `line` mete las «fallas esperadas» dentro de `passed` sin distinguirlas:

| prueba | cómo salió | qué significa |
|---|---|---|
| `tresd.spec.ts:344` (marca en :348) | «Expected to fail, but passed» | defecto **CERRADO**, marca vieja |
| `imprimir.spec.ts:436` (marca en :438) | «Expected to fail, but passed» | defecto **CERRADO**, marca vieja |
| `acotar.spec.ts:505` (marca en :525) | dentro de los 47 «pasados» | defecto **VIVO**, escondido en verde |
| `refutacion-palabra-imprimir.spec.ts:126` (marca en :137) | dentro de los 47 | defecto **VIVO**, escondido en verde |

**Recuento corregido: 10 casos con defecto vivo, 45 realmente verdes.** Catorce
defectos confirmados de aquella auditoría **ya están cerrados** y sus pruebas
siguen fuera de la suite defendiendo nada.

**Regla que sale de aquí y que aplica a toda la campaña: un `test.fail()` que
nadie revisa es un defecto vivo con aspecto de verde. Al graduar se mira cada
marca, no la cifra del reportero.**

## 1.5 · La aritmética de la rúbrica, para que sepas dónde está el techo

De los 27 puntos que faltan para 271:

| pt | Qué los desbloquea | ¿Puede esta sesión? |
|---:|---|---|
| **14** | Las 14 filas que retienen 1 pt porque «el corpus de hoy no lo alcanza». `docs/cad/evidence/independencia-por-fila.json` **nombra el oráculo exacto de cada una** y PyPI, npm y crates.io **responden desde este contenedor**. | **Sí. Es lo más barato del repositorio.** |
| **1** | `modify.dense-stress`: correr el golden de 100k y `npm run evidence:dense-editing`, que escribe `docs/cad/evidence/cad-dense-editing-100k.json`. El fichero **no está versionado**; el punto está esperando una corrida. | **Sí.** |
| **1** | `performance.architecture-100k`: la mezcla pesada cumple el SLO (≤5 s detalle, ≥30 fps p95). Hoy mide 25,3 s y 8,57 fps. | Difícil, y ojo: ese artefacto **mide un pipeline que el editor no ejecuta**. |
| **2** | Corpus DXF de terceros: falta la **firma humana de derechos**. | **No. Sólo el titular.** |
| **1** | DWG: integración en runtime con gates legal, seguridad y fidelidad. | **No. Sólo el titular.** |
| **6** | Seis filas que **ningún fichero ajeno atestigua**: piden un usuario real trabajando. | **No. Cero personas han usado esto.** |
| **2** | Puente .NET/VBA. Declarado imposible, con su alternativa documentada. | **No, y no se finge.** |

**Techo de esta sesión sin una sola firma del titular: 260/271 (95,9 %).** Con
sus tres firmas, 263. Los 8 restantes son un usuario real y el puente .NET.

**No copies esa cifra a ningún documento.** La regla 4 de la casa: ninguna cifra
vive en dos lugares. Se recomputa con `node scripts/cad/rubric.mjs`.

## 1.6 · Lo que la rúbrica NO mide, y por eso la auditoría duele

Cuatro dimensiones enteras **no tienen dónde puntuar**. Ninguna fila de las 36
puede castigarlas, así que arreglarlas **baja** el rendimiento aparente de quien
las arregle:

1. **La cinta y la UX** (5,5/10). Ninguna fila. Y dos `gap` de la rúbrica están
   desactualizados a la baja.
2. **Accesibilidad e idiomas** (6,0/10). «La rúbrica competitiva no mide esta
   dimensión en absoluto» es literalmente uno de sus quince huecos.
3. **El negocio.** 36 filas y ninguna mide la compra, el crecimiento del
   despacho, la migración de su archivo ni la salida.
4. **La ventaja del navegador.** Ni la rúbrica, ni `ESCALERA.md`, ni `BACKLOG.md`
   tienen una sola casilla para el enlace de entrega, la presencia, la llamada,
   la instalación o el push.

**Abrir filas nuevas SUBE el denominador y BAJA el porcentaje. Eso es correcto y
se hace igual.** La cifra existe para medir el producto, no para proteger la
moral. Si al final de la campaña el porcentaje ha bajado porque el denominador
creció con filas honestas, eso es un éxito y se escribe así en el informe.

---

# 2 · LA ORDEN DE MARCHA

## 2.1 · El criterio de orden, y por qué no es «lo fácil primero»

El orden es **cuánto acerca a «un arquitecto podría trabajar el lunes aquí»**,
no cuánto cuesta. Dentro de ese criterio, tres desempates:

1. **Una afirmación falsa viva va antes que una ausencia.** Un `EXTRUDE` que
   aplana en silencio es peor que un `EXTRUDE` que no existe: el segundo se
   nota, el primero entrega geometría equivocada con aspecto de correcta. La
   casa ya lo tiene escrito («una ausencia silenciosa es peor que una limitación
   declarada»), y además esas afirmaciones **están cobrando puntos de rúbrica
   ahora mismo** en `integrity.commands` (5 pt) e `integrity.no-silent-loss`
   (4 pt). No arreglarlas no es no ganar: es tener 9 puntos que se caen el día
   que alguien mire.
2. **Lo que rompe el bucle va antes que lo que falta al final del bucle.** Si el
   clic se pierde sobre un pinzamiento, `OFFSET` y `TRIM` no funcionan, y sin
   `OFFSET` y `TRIM` no hay dibujo de arquitectura. Eso va antes que cualquier
   toolset.
3. **Lo que impide ENTREGAR va antes que lo que impide MODELAR.** Un despacho
   que dibuja y no puede entregar no cobra; uno que entrega planos 2D honestos
   sin modelo 3D cobra desde el primer día. El 3D es la ola siguiente, no la
   primera, aunque su nota sea peor.

## 2.2 · Lo que NO se toca. Explícitamente

- **`DWG_IMPORT_FLAG` y `DWG_EXPORT_FLAG` siguen en `false`.** No se encienden,
  no se «prueban encendidos en un commit», no se anuncia DWG «pronto» ni «en
  beta» en ninguna superficie. ADR-0014 está firmada. El único punto que la
  bandera daría requiere la firma del titular.
- **Ningún gate, umbral, golden o presupuesto se relaja.** Ni «temporalmente»,
  ni «para desbloquear», ni con un `--allow-growth` sin extracción real detrás.
  Si un gate te para, **tiene razón**: ya paró al coordinador de la campaña
  anterior y acertó.
- **Ningún identificador persistido se renombra**, ni `data-testid` se cambia.
  `AXOS-CAD-STUDIO`, `UNIVERSAL`, `AXOS_DIM`, `AXOS_MLEADER`, `AXOS_BLOCK` y
  `engineering:*` son valores de compatibilidad (`IDENTITY.md`, ADR-0010).
- **Ninguna función de IA.** `lib/cad/no-ai-boundary.spec.ts` comprueba que
  ningún comando ni alias la anuncie y que nueve módulos retirados sigan fuera
  de `git ls-files`. **Montar el panel «Copiloto CAD» está prohibido por
  nombre.** La salida honesta al hueco de las 40 entradas «Frase» es retirarlas
  o cerrar el circuito bajo un nombre que no mienta.
- **No se reintroduce vocabulario ERP/MES.** `check:no-industrial-domain` lo
  vigila.
- **No se toca `apps/api` `npm test` directamente**: agota la memoria y tumba el
  contenedor. Se corre por turbo.
- **No se retira el andamio hasta que el último agente dijo que terminó.**
  Borrar los árboles de trabajo mientras un frente cerraba ya dejó un entregable
  colgando en el almacén de objetos, rescatado por los pelos.

---

## OLA 0 · El andamio · medio día · **coordinador solo**

Sin esto, las cinco olas siguientes chocan entre sí o no pueden ni empezar.

### T-00 · Abrir espacio en el monolito · **la tarea más importante de la campaña**

**Qué.** `apps/web/src/components/cad/editor/Layout3DEditor.tsx` tiene **18 453
líneas** y su asignación en `scripts/cad/monolith-budget.json` es **18 454**:
**una línea de margen**. Y el trinquete tiene dos filos: si el fichero adelgaza
**200 líneas o más** por debajo de su asignación sin que se corra `--update`,
**también falla**. El `useState` está topado en 131 y sólo puede bajar.

Al menos **quince defectos confirmados de la auditoría viven en ese fichero**:
las dos escrituras de `layer: "Text"` (:12635, :12823), `exportPng` con cámara
en perspectiva (:12495-12505), el botón «Versiones» que llama a una ruta 404
(:15361-15367 → :10513), los tres puntos donde el pinzamiento se come el clic
(:6793, :6926, :7319), `hitEntity` designando por la sombra (:6691-6717), la
reconstrucción entera del lote instanciado (:3177-3183), los dos `Map` de
100 000 entradas por render (:13737-13741), el reseteo de avisos DXF (:2858) y
la segunda puerta de importación que se salta el validador (:10404-10419).
**Ninguno se puede arreglar si no cabe una línea más.**

**Dónde.** Extraer por **controladores**, no por paneles —es lo que
`docs/execution/DEUDA-MONOLITO.md` ya razona—: el controlador de guardado y
versiones, el de importación de ficheros, el de exportación (PNG/DXF/GLB) y el
de pinzamientos, cada uno a su módulo bajo
`apps/web/src/components/cad/editor/`. Los 11 símbolos muertos que el informe 14
nombra (`applyCommand`, `interpretCommand`, `navigateCommandLineHistory`,
`undoLastCommand`, `redoLastCommand`, `commandPreview`, `commandText`…) salen en
el mismo barrido: `npx eslint src/components/cad/editor/Layout3DEditor.tsx` los
lista como `no-unused-vars`.

**Verifica.** `node scripts/cad/check-monolith-budget.mjs` en verde, y
`node scripts/cad/check-monolith-budget.mjs --update` **en el mismo commit** que
la extracción, para que el manifiesto siga diciendo la verdad. La suite completa
detrás: la extracción no puede cambiar comportamiento.

**Mueve.** Ninguna fila directamente. **Desbloquea las olas 1 a 4 enteras.**
Objetivo mínimo: **1 200 líneas fuera** y el techo bajado a ≤17 250.

### T-01 · Graduar las catorce pruebas que ya están verdes

**Qué.** Quitar las marcas `test.fail()` viejas de `tresd.spec.ts:348` y
`imprimir.spec.ts:438`, mover los catorce ficheros ya verdes de
`apps/web/e2e/auditoria/` a `apps/web/e2e/golden/`, sacarlos del manifiesto y
**bajar el techo de 28 a 11**. Los tres `arnes` (`00-arranque`, `planta`,
`precision`) **no se gradúan**: ya guardan lo que funciona.

**Dónde.** `apps/web/e2e/auditoria/manifiesto.json`, `apps/web/e2e/auditoria/*`,
`apps/web/e2e/golden/`.

**Verifica.** `npm run check:auditoria`
(`scripts/cad/check-auditoria-manifest.mjs`) con el techo nuevo; los catorce
goldens corriendo **dentro** de la suite normal, sin `E2E_AUDITORIA=1`.

**Mueve.** El techo del manifiesto, que **sólo baja**: 28 → 11. Y convierte
catorce pruebas mudas en catorce defensas activas. Es trabajo mecánico y sin
riesgo. **Hazlo antes de tocar código de producto**, porque a partir de ahí cada
arreglo de la campaña se gradúa igual y el techo se convierte en el marcador de
la campaña.

### T-02 · Abrir las filas que faltan en la rúbrica y en la escalera

**Qué.** Cuatro dimensiones no tienen dónde puntuar (§1.6). Escribir sus filas
**antes** de construir, para que el trabajo de las olas 1-6 se pueda cobrar y
para que el `gap` diga la verdad mientras tanto. Como mínimo:

- Grupo **`comercial`** con denominador propio: compra y crecimiento del
  despacho, facturación declarada con su límite, expediente del comprador,
  migración de entrada y de salida.
- Grupo **`navegador`**: el plano entregado tiene dirección; el invitado existe
  entre máquinas; un punto del dibujo tiene URL; se instala; avisa con la
  pestaña cerrada.
- Filas de **degradación** en `persistence` o grupo propio, con las cuatro
  propiedades que la lente de modos de fallo propone y su evidencia ejecutable:
  el fallo permanente no se anuncia como transitorio; la profundidad de deshacer
  prometida es la entregada; ninguna operación deja el documento fuera del
  límite del servidor; el almacenamiento local avisa cuando deja de proteger.
- Filas de **cinta/UX y accesibilidad**, o —si se decide no abrirlas— dejarlo
  **escrito** en `ESCALERA.md` con su motivo, que es lo que la casa exige.

Y **corregir los `gap` caducados** que la auditoría encontró: los dos de la
dimensión de la cinta, el de `toolset-electrical.esquemas` (su criterio se llama
«Esquemas eléctricos: símbolos normalizados» y su evidencia es un fichero de
símbolos de **planta**), el de `xrefs.resolution` (cobra 2 pt por «capas de
xref» con una sola spec de bind, y las capas se aplastan a una), el de
`modeling3d.z-roundtrip` (2 pt con evidencia sólo de specs unitarios que un spec
de navegador committeado contradice) y el de `performance.browser-slo`.

**Dónde.** `docs/competitive/rubric.json`, `docs/parity/ESCALERA.md`,
`docs/execution/BACKLOG.md`. Regenerar
`docs/competitive/autocad-2027-gap-matrix.md` desde el guion, **nunca a mano**.

**Verifica.** `node scripts/cad/rubric.spec.mjs` y
`node scripts/cad/rubric.mjs --markdown --check` (los dos dentro de
`check:cad`); `npm run check:json-keys`.

**Mueve.** **Baja el porcentaje** y sube el denominador. Es correcto. Escríbelo
así en la bitácora para que nadie lo lea como una regresión.

### T-03 · Arrancar el frente de evidencia independiente · **en paralelo desde el minuto uno**

**Qué.** Las 14 filas que retienen 1 pt porque «el corpus de hoy no lo alcanza».
`docs/cad/evidence/independencia-por-fila.json` **ya nombra el oráculo de cada
una** —no hay que investigar cuál—. Los más baratos y sólidos primero:

| Fila | Oráculo | Nota |
|---|---|---|
| Nubes de puntos, raster y GIS · **y** Toolset Map 3D | **`pyproj`** (envuelve PROJ) | **Un solo trabajo, dos filas.** Empieza por aquí. |
| API y SDK | `openapi-spec-validator` (PyPI) o Spectral/Redocly (npm) sobre `design-api.v1.yaml` | |
| Eventos e integración | HMAC de la librería estándar de Python verificando `X-Valle-Signature` | |
| Kernel Rust/WASM | `mpmath` emitiendo valores de referencia | |
| Importación de JSON canónico | Fuzzer ajeno: `radamsa`, `atheris` o `hypothesis` | |
| Almacenamiento de objetos | **MinIO** real juzgando nuestro cliente S3 | |
| Layouts y publicación | `pypdf`, `pdfminer.six` o `mutool` leyendo los bytes y **midiendo la escala** | Cruza con la ola 3 |
| Toolset Raster Design | Un plano escaneado de dominio público (HABS/HAER, Library of Congress) con geometría conocida | |
| Toolset Electrical | Anclar cada límite a su artículo de la **NOM-001-SEDE** del DOF: **cita y fecha, nunca copia del texto** | |
| Toolset Mechanical | Banco de tornillería libre. **ISO/DIN es de pago y no se redistribuye.** | |
| Línea de comandos y alias | Tabla de alias de un tercero libre (LibreCAD, BricsCAD). **`acad.pgp` es de Autodesk: no se redistribuye.** | |
| MLEADER y tablas | Primero la **capacidad** (importar `LEADER`), y sólo después el testigo | |
| Xrefs | Un conjunto ajeno completo —el dibujo y sus referencias—; **no existe donante todavía** | La más cara |

**PyPI, npm y crates.io responden desde este contenedor.** La premisa contraria
—«la red sólo alcanza GitHub»— era falsa, se creyó una campaña entera y encogió
dos frentes. Compruébalo tú:
`curl -sS "$HTTPS_PROXY/__agentproxy/status"` y una petición de prueba.

**Dónde.** `docs/cad/evidence/`, `apps/web/src/lib/cad/verification/`,
`scripts/cad/`. Regenerar el censo:
`cd apps/web && VALLE_ESCRIBIR_CENSO=1 npx tsx src/lib/cad/verification/independencia-rubrica.spec.ts`

**Verifica.** Cada oráculo con su artefacto versionado y su corrida reproducible,
como `check:cad-math` (5 427 casos, 0 desviaciones) o `check:dxf-corpus`. La
licencia de todo material ajeno **descargada, identificada y hasheada**.

**Mueve.** **Hasta +14 pt: de 244 a 258/271.** Es el mayor rendimiento por día
de toda la campaña y **no toca una sola línea de producto**, así que no compite
por territorio con nadie. **Este frente arranca el primer día y no para.**

> **La trampa que este frente ya se comió una vez, y no se repite:** construir la
> capacidad entera de `toolset-raster.vectorizacion` subió la fila **1** punto de
> los 2, porque entró en el conjunto que retiene un punto por carecer de
> evidencia ajena. **Construir da la mitad; la otra mitad la da un archivo que no
> escribimos nosotros.** Por eso este frente va en paralelo con todos los demás,
> no después.

### T-0D · La higiene documental, porque el sesgo también se hereda por MD

**Qué.** El repositorio tiene **225 ficheros markdown y 7,1 MB**. Eso no es
neutral: una sesión que lista `docs/` y hojea lo que encuentra arrastra el estado
de campañas cerradas y toma por vigente lo que ya no lo está. Ya pasó dos veces y
las dos costaron: `AGENTS.md` decía «~192 comandos» cuando el gate imprime 294, y
el manifiesto de `e2e/auditoria` acusaba a catorce defectos ya cerrados.

**La regla ya existe y es de la casa** (`AGENTS.md`, §campaña de cierre de ramas):
la bitácora de una campaña se archiva a `docs/history/execution/` **en el mismo
commit que publica su informe de cierre**; el `INFORME_*` se queda, porque es
evidencia medida y no un plan vencido.

**Dónde.**

- `docs/execution/` — 24 documentos, 407 KB. Cuatro bitácoras `CAMPANA_*` siguen
  ahí **sin informe de cierre publicado** (10X, 3D_POST_M1, COMMERCIAL_RC1,
  REVIEW_CONCURRENCY). No se movieron a propósito: mover lo que la regla no cubre
  sería inventar una norma. **Publica su cierre o decláralas muertas en una línea,
  y entonces archívalas.**
- **Toda cifra a mano en un documento vivo es un defecto**, aunque hoy coincida
  (regla 4). Búscalas: `grep -rnE '~?[0-9]{3,} (comandos|specs|casos|filas)' *.md docs/`.
  Se quitan remitiendo al gate que las imprime, **no se actualizan**.
- **No borres nada.** En un repo donde la rúbrica cita evidencia, borrar el rastro
  es peor que el desorden. Archivar es mover, no suprimir.

**Verifica.** `find . -name '*.md' -not -path './node_modules/*' | wc -l` baja, y
cero referencias rotas: `grep -rn 'docs/execution/CAMPANA' --include='*.md' --include='*.ts' .`
no debe apuntar a nada movido.

**Mueve.** Ninguna fila de la rúbrica. Se hace igual: es la higiene que evita que
la sesión siguiente herede una mentira. **Medio día del coordinador, y va en la
Ola 0 porque todo lo demás se lee después.**

---

## OLA 1 · Las mentiras vivas · 3-4 días · **fix-or-hide, y va primero**

Nada de esta ola es una función nueva. Todo es **una afirmación que el producto
hace hoy y no cumple**. La casa tiene tres puertas y sólo tres: **VERIFICADA**
(funciona con evidencia numérica), **ARREGLADA** (tenía defecto, se corrigió,
hay evidencia nueva) y **OCULTA** (no se pudo hacer ninguna de las dos hoy:
desaparece de la superficie hasta ganar su evidencia, con entrada en el
backlog). **El cuarto estado —visible y no verificada— está prohibido.**

Cuando ocultar sea la respuesta honesta, **ocúltalo**. Es la decisión correcta y
la campaña anterior la tomó cinco veces sin que costara un punto.

### T-10 · Los dos éxitos falsos del 3D

**Qué.** (a) `VSCURRENT`/estilo visual confirma por la línea de comandos un
cambio que sobre `wall`, `room`, losas, cielorrasos y cubiertas **no ocurre**:
sólo alcanza a `solid3d`. O el estilo llega a los tres anfitriones de masa
nativa, o el comando **declara** a qué alcanza. Además el estilo es un campo
privado que se pierde al recargar y `VSCURRENT`+Intro devuelve mensaje **vacío**
en vez del valor vigente. (b) `EXTRUDE` toma la elevación de **un** vértice y
aplana el perfil inclinado **sin un mensaje**: entrega un sólido más pequeño por
el coseno y a la cota de una esquina, con aspecto de correcto. El arreglo barato
—medir la desviación de planaridad y devolver el motivo en vez del perfil
aplanado— va **hoy**, antes que el arreglo bueno (extruir por la normal).

**Dónde.** `components/cad/viewport/solid-shade-host.ts:121,321-324`;
`components/cad/viewport/{wall-solid-host,room-solid-host,native-mass-hosts}.ts`;
`lib/cad/studio-engine-bridges.ts:144`; `lib/cad/wall-solid-three.ts:213-214,248`;
`lib/cad/engine/commands/view-visual.ts:66-71`;
`lib/cad/solid3d-profiles.ts:84-128,139-146`; `lib/cad/engine/commands/solids-create.ts:138`.

**Verifica.** El golden `e2e/golden/47-cad-solids.spec.ts:225-241` afirma hoy
**sólo el texto** «Estilo visual: Alámbrico.», nunca la escena: **el éxito falso
está protegido por la única prueba que existe.** Amplíalo para que afirme la
escena (material/`side`/wireframe de un `wall`), no la frase. Spec nuevo de
planaridad en `solid3d-profiles.spec.ts` con un perfil a 30° que exige motivo
declarado. `npm run check:command-integrity`.

**Mueve.** **Defiende los 5 pt de `integrity.commands`** («ningún comando
responde éxito sin efecto verificado») y los 4 de `integrity.no-silent-loss`. Es
el hueco mejor probado de toda la auditoría y el único que el escéptico llamó
bloqueante «de verdad».

### T-11 · Las tres pérdidas silenciosas de la puerta de salida

**Qué.** (a) El API público `GET /v1/cad/documents/{id}/export/dxf` entrega un
DXF **R12 mutilado y sin manifiesto**: `boxOf(entity)` va **antes** de toda
discriminación por tipo, así que cualquier entidad con `x/y/w/h` finitos sale
como **rectángulo inventado**; el nombre de capa se recorta a 31 caracteres y el
texto a 240, **sin aviso**. Y el SDK generado promete por escrito que ese
endpoint sigue respondiendo 200 cuando el entitlement vence, «para que los datos
del usuario nunca queden rehenes de un cobro» — o sea que es **la puerta por la
que se va el cliente que se va**. (b) La capa se tira al **construir** la carga
de exportación: dos líneas escriben `layer: "Text"` literal y descartan el
`ann.layer` que la anotación sí trae. El aserto que falla es
`Expected: "NOTAS" / Received: "Text"`, y el patrón correcto está **tres líneas
más arriba** (`layerLabel("measurements")`) y en el adaptador vecino
(`an.layer ?? "Text"`). (c) La declaración de pérdidas del DXF de fondo es **de
sesión**: al reabrir el documento el panel vuelve a cero y quien recibe el
archivo de un compañero **nunca ve el aviso**.

**Dónde.** `apps/api/src/modules/cad/cad-dxf-export.ts:58-77,210-215`;
`apps/api/src/modules/cad-documents/line-dxf.ts:199-200`;
`apps/api/src/modules/cad/cad.controller.ts:331-352`;
`Layout3DEditor.tsx:12635,12823` y `:2858,2867`;
`lib/cad/cad-document-legacy-adapter.ts:200`; `lib/cad/dxf-export-loss-manifest.ts`.

**Verifica.** (b) es el **racimo C** de `e2e/auditoria/`: `intercambio.spec.ts:257`,
`refutacion-texto-capa.spec.ts:45`, `refutacion-notas-solo-text.spec.ts:119`
(dos casos) y `refutacion-cotas-resumen.spec.ts:72` — **cinco casos, un
defecto**. Al ponerse verdes se gradúan y el techo baja. **Aviso: cambiar esas
dos líneas cambia los BYTES exportados de todo dibujo con anotaciones**, así que
entra con la suite de goldens entera detrás, nunca como parche de dos líneas.
Para (a): spec de manifiesto en el endpoint del API y
`npm run lint:check --workspace=valle-design-api`.

**Mueve.** **Defiende los 4 pt de `integrity.no-silent-loss`**, cuyo `gap`
afirma hoy «CERO pérdidas silenciosas» midiendo **únicamente la ruta del
navegador**. Techo de auditoría 11 → 6. Y toca `dxf` (10/12).

### T-12 · Los controles que prometen y no hacen

**Qué.** Cuatro botones y una entrada de paleta, todos visibles, ninguno cumple:

1. **«Versiones»** (title: «guardar, restaurar») llama a `layout/snapshots?…`,
   una ruta que `layout-http-adapter.ts:46-49` **declara por escrito** entre los
   endpoints «sin equivalente en `/v1/cad` → 404 limpio». La lista está siempre
   vacía y guardar/restaurar/borrar siempre sacan `toast.error`. **O se cablea a
   la historia real del servidor —que existe— o el botón se retira.**
2. **«Exportar imagen (PNG)»** fuerza el render con la `PerspectiveCamera` cruda
   en vez de la cámara activa, que en 2D es la **ortográfica**. En planta, el PNG
   que se manda al cliente **no es lo que hay en pantalla** y lleva la
   deformación que `lib/cad/view/perspective-distortion.spec.ts:24-31` declara
   inaceptable. Es la **única** salida de imagen del producto.
3. **`PAGESETUP` Diálogo** anuncia éxito y no hay diálogo de configuración de
   página ni setups con nombre.
4. **«Imprimir / Exportar» de la paleta** no saca el plano, mientras
   `PLOT → Extensión → Trazar` sí traza: el defecto está **en esa entrada**, no
   en trazar.
5. **Las 40 entradas «Frase» de Ctrl+K** prometen un panel que **se borró a
   propósito** y no puede volver: `no-ai-boundary.spec.ts:95` lista
   `CadCommandDock.tsx` entre los ficheros que el guardián impide que regresen.
   Hay **tres** cadenas visibles, no una: el toast «Preview listo en el Copiloto
   CAD», el título «Comandos del copiloto CAD» de un informe que el usuario lee,
   y «Lista todos los comandos del copiloto…» que la paleta pinta. **Retirar las
   40 entradas y las tres cadenas es la salida honesta**, y de paso mueren cinco
   símbolos que el linter ya marca.

**Dónde.** `Layout3DEditor.tsx:15361-15367,10513,10522,10575-10622` ·
`:12495-12505,15301` · `lib/cad/commands/palette-actions.ts:124` ·
`lib/cad/commands/registry.ts:361,1165` · `lib/cad/commands/command-palette.ts:68` ·
`lib/cad/engine/commands/plot-commands.ts`.

**Verifica.** Golden nuevo por control: el que se retira, que no aparezca (busca
su `data-testid` y falla si está); el que se cabla, que haga lo que dice.
`refutacion-palabra-imprimir.spec.ts:126` es del racimo D y **hoy está escondido
en verde por su `test.fail()` de :137**: quítalo primero y míralo fallar antes
de arreglarlo. `npm test` para `no-ai-boundary.spec.ts`.

**Mueve.** `persistence` (7/8) si «Versiones» se cabla. `integrity` completa. Y
retira el peor incumplimiento de fix-or-hide del catálogo: cuatro controles
visibles y no verificados.

### T-13 · El plano entero desaparece a un clic del conmutador de tema

**Qué.** La tinta por defecto del dibujo es **blanca** y el preset «Claro» del
lienzo es casi blanco. Medido con el metro de la casa: **#ffffff sobre #eaf0f8 =
1,15:1**. La capa 0 —la de todo plano importado— se crea con ACI 7, y
`aci-palette.ts:36` dice `7: [255,255,255]`. El color por defecto del
renderizador, `0x60a5fa`, da **2,22:1** sobre ese mismo lienzo, por debajo del
piso de 3,0 que el propio gate de la casa exige. Y `Layout3DEditor.tsx:2058-2061`
fuerza el lienzo a `light` en cuanto el usuario elige el tema claro de la
aplicación: **está a un clic de cualquiera**. AutoCAD invierte el índice 7 según
el fondo desde siempre; aquí `grep -rn "luminan|invert|contrast" lib/cad/render/`
no devuelve nada.

Y el gate que debería haberlo cazado **declara por escrito en su cabecera** que
«no se mide la paleta: se miden las COMBINACIONES QUE LA APP PINTA», y mide 76
pares token×token sólidos. **La intención estaba escrita y la implementación no
la alcanza**, lo cual lo hace más grave, no menos.

**Dónde.** `lib/cad/plot/aci-palette.ts:36`;
`lib/cad/dwg-document-bridge-layers.ts:47`; `lib/cad/audit/recover.ts:117`;
`lib/cad/flatshot.ts:156`; `lib/cad/render/render-style.ts:30,44`;
`components/cad/studio/editor-presentation.ts:31-36`;
`Layout3DEditor.tsx:2058-2061`; `scripts/design/check-contrast.mjs`.

**Verifica.** **Amplía `check:contrast`** para que mida la tinta del dibujo
contra el fondo del lienzo en los cuatro presets, y añade los cuatro pares que
la auditoría midió a mano (1,17:1 en `viewport-hints.tsx:44`; 1,62:1 en
`ReviewPlanView.tsx:251` y `CollabThreadPanel.tsx:222`; 1,09:1 en
`CadHatchPalette.tsx:77`; 3,04:1 en `field-controls.tsx:34`). **El gate se
amplía, nunca se relaja.** Y el gate de diseño no ve los `.ts`, que es justo
donde vive la punta del lápiz: extiende su glob.

**Mueve.** Ninguna fila hoy —ésta es una de las cuatro dimensiones sin casilla
(§1.6)—, así que **T-02 tiene que haber pasado antes** o el trabajo no se cobra.
Sube `recognition` si se abre la fila.

### T-14 · El imán que devuelve un punto correcto con el nombre equivocado

**Qué.** No es que falte el punto medio: es que **con CEN encendido el cursor se
pega al punto MEDIO de toda línea y de todo eje de muro y el HUD anuncia
«centro»**; con NOD encendido se pega al medio de cada tramo de polilínea y
anuncia «nodo». **Apagar el modo que estorba no salva**, porque el candidato
está en el cubo equivocado. Un imán que da un punto con nombre falso es un fallo
de **integridad**, no de comodidad, y no está declarado en `ESCALERA.md`.
`CadSnapKind` tiene cinco valores y el puente reparte «todo lo demás →
endpoints»: **cuatro de los catorce modos que el cuadro de ajustes promete y
enciende no tienen adaptador que los sirva**.

**Dónde.** `lib/cad/entity-runtime.ts:81-86` (el tipo, que es la causa raíz);
`lib/cad/snap-scene.ts:178-207`; `lib/cad/basic-native-adapters.ts:52-56,89-92`;
`lib/cad/polyline-entity-adapter.ts:314-330`;
`lib/cad/point-line-adapters.ts:165`; `lib/cad/block-text-adapters.ts:459`;
`lib/cad/wall-entity-adapter.ts:288-290`;
`components/cad/dialogs/CadDraftSettingsDialog.tsx:23-38`;
`lib/cad/draft-settings-host.ts:71-75`.

**Verifica.** `professional-snapping.spec.ts:22-42` **ya afirma** que el motor
resuelve `insertion`, `geometric-center`, `tangent` y `quadrant` sobre una escena
escrita a mano: es un **spec verde sobre una función muerta**. Hazlo pasar
alimentado por los adaptadores del documento, no por una escena inventada. Golden
nuevo de navegador: encender sólo MED sobre una polilínea y afirmar el rótulo
del HUD.

**Mueve.** **Defiende los 2 pt de `draw-2d.osnap`**, en una de las 11 filas que
hoy llegan a su tope. Si se prefiere no arreglarlo en esta ola, **hay que
declararlo en `ESCALERA.md`** — hoy no está cobijado por ningún «todavía no».

### T-15 · La etiqueta que el repositorio jura dibujada y no se dibuja

**Qué.** De las dos únicas cosas que el toolset Electrical pone sobre el papel
—el número del conductor y la etiqueta del componente— **ninguna se imprime**.
El plano eléctrico que sale hoy son rayas amarillas y símbolos mudos.
`cadMepBlockDefinition` devuelve `{id, name, basePoint, entities}` **sin campo
`attributes`**, y las dos rutas de salida exigen esa declaración: el trazador
recorre `Object.entries(block.attributes ?? {})` y el exportador escribe `ATTRIB`
sólo tras `.filter(([tag]) => !!definition?.attributes?.[tag])`. Sin `ATTDEF`:
cero texto en la lámina, cero `ATTRIB` en el DXF. El `-LT1` sobrevive sólo en la
XDATA propia, **que sólo Valle lee**.

**Y es un olvido, no una decisión**: el módulo hermano de Plant **sí** lo declara
(`pid-symbols.ts:192`, `attributes: { TAG: … }`), y por eso la etiqueta de equipo
sí se traza. **Es una línea copiada de un fichero al de al lado.**

Lo grave es lo escrito: `device-tags.ts:16-24` y `device-tags.spec.ts:11`
**afirman como razón de diseño** que la etiqueta «se dibuja» y «viaja al DXF como
ATTRIB», `ESCALERA.md` lo declara en peldaño 5 con esa misma frase, y la fila
`toolset-electrical.esquemas` está **cobrada** con esa evidencia.
`grep -rn 'ATTRIB' electrical/*.spec.ts` devuelve **sólo esa frase de prosa: cero
aserciones**.

**Dónde.** `lib/cad/mep-symbols.ts:157-160`; `lib/cad/plant/pid-symbols.ts:188-193`
(el modelo a copiar); `lib/cad/electrical/device-tags.ts:16-24,168-172`;
`lib/cad/engine/commands/electrical-wire.ts:130-172`;
`lib/cad/paper-space.ts:714`; `lib/cad/dxf-export.ts:791-794`.

**Verifica.** Spec que **afirme el `ATTRIB` en los bytes del DXF** y golden que
afirme el texto en la lámina trazada — hoy no existe ninguno de los dos. El
número de conductor necesita además emitir su `mtext`/`text` en `wireCommands`,
que hoy emite exactamente dos comandos y ninguno rotula.

**Mueve.** `toolset-electrical` (3/4) y su criterio `esquemas`, que **hoy cobra
2 pt con evidencia de símbolos de PLANTA**. Si en esta ola no se construyen los
símbolos de esquema de control (bobina, contactor, guardamotor, seccionador — hoy
**cero** en todo el árbol), el criterio **se renombra a lo que verifica** y el
`gap` lo declara. Cobrar «Esquemas eléctricos» con `mep-symbols.ts` es la única
falla de honestidad de esa dimensión.

### T-16 · Las dos puertas de importación que dan respuestas distintas al mismo fichero

**Qué.** La puerta del **tablero** resuelve las cuatro banderas de beta y, con
`NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA=true`, **admite** un `.dwg` AC1015/AC1018.
La puerta del **estudio** —`onDxfFile`, con `accept=".dxf,.dwg"` en el input— no
llama a `validateImportFile`, no conoce ninguna beta, tiene su propio tope de
12 000 000 **escrito a mano y en unidades UTF-16, no bytes**, comprobado
**después** de materializar el fichero entero como cadena, y responde **siempre**
`toast.error(DWG_UNAVAILABLE_REASON)`. En un despliegue con la beta firmada
encendida, **el mismo `.dwg` entra por el tablero y el estudio le dice al usuario
que el editor no lee DWG.** La superficie más visible del producto miente sobre
una capacidad que el producto ya tiene.

Y de paso: **el DXF se rechaza de plano por encima de 12 MB**
(`MAX_DXF_IMPORT_BYTES = 12_000_000`). Con la propia medida del proyecto
—`floorplan.dxf`, 1,1 MB para 961 entidades— eso son unas 10 000 entidades. Un
plano ejecutivo real pasa de 50 000 sin esfuerzo. **AutoCAD no tiene ningún tope
de este tipo**, y el flujo que el producto le recomienda al usuario cuando
rechaza un DWG («pídele el DXF») falla **por tamaño**.

**Dónde.** `Layout3DEditor.tsx:10404-10419,15314`;
`lib/cad/document-import-validation.ts:27,60,124,133-137`;
`lib/cad/document-import-client.ts:106`; `app/dashboard/page.tsx:692`.

**Verifica.** Unificar en **una** puerta: el estudio llama a
`validateImportFile`. Golden que afirme que el mismo fichero recibe **la misma
respuesta** por las dos puertas, con la bandera apagada y encendida. Para el tope
de 12 MB: o se sube con streaming y se mide, o **se declara en `ESCALERA.md`** con
su cifra y su motivo — hoy no está en ninguna de las quince fichas.

**Mueve.** `dxf` (10/12) y el `gap` de `dwg`. Y quita el fallo de veracidad más
caro del catálogo.

### T-17 · Los cuatro correos que se encolan y se descartan en silencio

**Qué.** El `switch` de plantillas tiene **cuatro casos** y el árbol encola
**ocho** nombres. Huérfanas: `commercial.trial-expiry`, **`identity.new-sign-in`
—el aviso «alguien entró en tu cuenta desde un dispositivo nuevo», que es un
control de SEGURIDAD—**, `product.feedback` y `support.incident`. Las cuatro
siguen el mismo camino: `EmailTemplateError('unknown_template')` → 200 con
`status: 'ignored'` → **entrega marcada como hecha**, sin reintento ni alarma.

**Por qué CI está verde sobre cuatro correos muertos:** las dos specs que
ejercitan el descarte usan una plantilla **inventada**, `'marketing.navidad'`,
nunca un nombre real del árbol.

**Dónde.** `apps/api/src/modules/outbox-receiver/email-templates.ts:46,57,68,70`;
`outbox-receiver.service.ts:74-96`;
`commercial/trial-expiry-reminder.service.ts:60`; `identity.service.ts:543`;
`feedback.service.ts:119`; `support.service.ts:69`.

**Verifica.** **Gate de cobertura**: una spec que recorra **todos** los nombres
de plantilla que el árbol encola y exija que cada uno tenga renderizador. Ése es
el arreglo de fondo; los cuatro renderizadores son la consecuencia. Sustituir
`'marketing.navidad'` por un nombre real en las dos specs existentes. Prioridad
dentro de la tarea: **`identity.new-sign-in` primero** — es seguridad, no
comercio.

**Mueve.** Ninguna fila. Es un bloqueante de la lente de landing y un agujero de
seguridad silencioso.

### T-18 · Las promesas de la portada que el producto no respalda

**Qué.** (a) **«Factura CFDI»** se anuncia en dos superficies **públicas**
—`PricingCatalog.tsx:60-64` (`FiscalSeal`) y `faq.ts:322-325`— con etiquetas
escritas a mano, mientras el proveedor está en `mode: 'manual'` porque no hay PAC
contratado. El límite honesto sólo aparece **después** de iniciar sesión
(`TaxProfileForm.tsx:183-188`), y el comprador pregunta **antes**. (b) Se le dice
a Google que Valle funciona en **Safari** y **nada corre nunca en WebKit**: el
JSON-LD lo afirma y no hay proyecto de Playwright que lo respalde. (c) Al cliente
del enlace de revisión se le afirma que **no hay nadie mirando** cuando sí lo
hay. (d) `<html lang="en">` sobre una página entera en español, con `og:locale`
diciendo `es_MX`.

**Dónde.** `PricingCatalog.tsx:60-64`; `faq.ts:322-325`;
`null-cfdi.provider.ts`; `TaxProfileForm.tsx:183-188`; el JSON-LD de la portada y
`apps/web/playwright.config.ts`; la vista del enlace de revisión;
`apps/web/src/app/layout.tsx`.

**Verifica.** (a) El sello y la respuesta del FAQ **se derivan del descriptor**,
con una prueba que impide que «Factura CFDI» aparezca en modo `manual`. (b) Spec
que **ata el JSON-LD a los proyectos de Playwright**: si se declara un motor, se
corre en ese motor, o el claim se recorta. `npm run check:legal` y
`npm run check:surface` ya vigilan superficie pública: **amplíalos**.

**Mueve.** Ninguna fila hoy (§1.6 · negocio). Bloqueante de la lente comercial.
Y es lo único de esa lente que **corrige afirmaciones falsas vivas**, así que va
en esta ola y no en la 5.

### T-19 · Lo que se lleva por delante en silencio

**Qué.** Cinco destrucciones calladas, todas reproducibles:

1. **`BLOQUE` sobre un muro lo hace INVISIBLE, borra el original y se lleva la
   puerta por delante.** `cadDefineBlockCommands` no filtra tipos y con la
   disposición por defecto **borra los originales**; el teselador de hijos de
   bloque conoce nueve tipos y para todo lo demás devuelve `[]`. Designo tres
   muros con sus puertas, tecleo `BLOCK`, y el trozo de planta **desaparece** sin
   advertencia, sin manifiesto de pérdidas y sin que `REVISA` lo vea. **El
   arreglo fiel a la casa es fix-or-hide: que `BLOCK` se niegue nombrando el
   muro, como `OFFSET` ya hace.**
2. **`COPIAR` un muro con su puerta deja la puerta en el muro ORIGINAL.**
   `hostId` sólo se escribe al colocar el hueco y **nadie lo reasigna**: la
   ventana copiada se aloja otra vez en la fachada vieja —dos superpuestas— y el
   muro nuevo sale ciego. El cuadro de carpintería cuenta 2, que es el total
   correcto, **así que la tabla no delata el error**. Igual con `MIRROR` y
   `ARRAY`. Copiar una crujía es lo primero que hace quien dibuja un edificio.
3. **Una capa marcada «no se imprime» SE IMPRIME**, en los dos PDF, y la interfaz
   dice lo contrario.
4. **La ventana gráfica poligonal degrada al rectángulo envolvente, callando** —
   y su contorno se dibuja **como polilínea de espacio modelo con coordenadas de
   papel**, proyectada en todas las ventanas de todas las hojas del PDF.
5. **La ventana gráfica no recorta en el PDF de `PLOT`, y el aviso afirma que
   sí.**

**Dónde.** `lib/cad/blocks/block-workflow.ts:194-235`;
`lib/cad/block-text-adapters.ts:271-284`;
`lib/cad/engine/commands/draw-opening.ts:332`;
`lib/cad/engine/commands/entity-commands.ts:401-410`;
`lib/cad/opening-entity-adapter.ts:298-316`;
`lib/cad/viewport-operations.ts:305-317`;
`lib/cad/engine/commands/entity-commands.ts:359-372,547`;
`lib/cad/paper-space.ts`; los dos emisores de PDF.

**Verifica.** Spec por cada uno, y **el aviso es parte del arreglo**: lo que no
se pueda hacer, se declara nombrando la entidad. `grep -rn blockChildPaths` no
encuentra hoy ninguna spec que cubra `wall` ni `opening`; `grep -rln hostId
--include=*.spec.ts` no incluye `entity-commands.spec.ts`.

**Mueve.** `toolset-architecture` (3/4), `layouts` (9/10), `blocks` (9/9 — lo
**defiende**) e `integrity.no-silent-loss`.

> **Y una decisión de esta ola que hay que tomar explícitamente:** el producto
> tiene **DOS emisores de PDF que no se parecen** y el botón usa el pobre. Antes
> de arreglar (3), (4) y (5) tres veces en dos sitios, **unifica**. Si unificar
> no cabe en esta ola, escribe en la bitácora cuál es el bueno y por qué, y
> arregla los dos.

---

## OLA 2 · El bucle diario del arquitecto · 4-5 días

Sin esta ola no hay lunes. Todo lo demás del producto asume que esto funciona.

### T-20 · El clic con el que se designa se pierde si cae sobre un pinzamiento

**Qué.** Rompe `OFFSET` y `TRIM`, que son la mitad del dibujo de arquitectura.
El controlador de pinzamientos tiene **derecho de tanteo sobre el clic en tres
sitios y ninguno pregunta si hay un comando esperando un punto**. La pregunta
que falta **ya está respondida** a un `get` de distancia:
`CadCommandEngineHost.accepts` devuelve la máscara del paso activo y **0 en
reposo**, y su comentario dice para qué existe. El estudio la consulta **una sola
vez en todo el fichero** y no en la rama del pinzamiento. Regla: arrastrar un
pinzamiento sigue ganando **en reposo**; con un comando pidiendo punto, **el clic
es del comando**.

**Dónde.** `Layout3DEditor.tsx:6793,6926,7319,8514`;
`lib/cad/engine/command-engine-host.ts:424`.

**Verifica.** **Racimo B**, tres pruebas ya escritas y rojas:
`modificar.spec.ts:470` (`Expected length: 1 / Received: 0`),
`refutacion-pinzamiento.spec.ts:220` (`Expected 3 / Received 2`, con su mensaje
«mismo píxel y misma distancia que A»), `refutacion-trim.spec.ts:296`. **Un
defecto, tres pruebas.** Al pasar se gradúan.

**Mueve.** `modify` (13/14). Techo de auditoría −3.

### T-21 · Ningún prompt de «Designe objetos» acepta palabras clave

**Qué.** En AutoCAD **toda** petición de designación acepta Todo, Previo, Último,
Ventana, Captura, Valla, Vpolígono, Cpolígono, Borrar y Añadir, y son **la mitad
de las designaciones del día**. Aquí el prompt compartido es
`{ message: "Designe objetos", options: [] }` y acepta
`CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK` — **sin `CAD_ACCEPT_KEYWORD`**.
Duele el doble porque **el motor de selección profesional está completo por
debajo** (ventana, cruce, polígono, valla, lazo, `QSELECT`, `FILTER`) y no hay
forma de llamarlo por teclado desde dentro de un comando. Es además **la puerta
por la que entra gratis la valla de `TRIM`**.

**Dónde.** `lib/cad/engine/commands/modify-basics.ts:31,33`;
`lib/cad/selection/native-selection-index.ts`;
`lib/cad/engine/commands/view-navigation.ts:54,60` (el `Todo` de `ZOOM`, que es
el patrón a copiar).

**Verifica.** Spec por palabra clave sobre el motor + golden que teclee
`BORRAR` → `V` (ventana) → dos puntos → `Intro` y afirme el conteo. Y
`npm run check:command-integrity`, que ejecuta **todos** los comandos del
registro y veta el «hecho» vacío.

**Mueve.** `modify` (13/14) y `command-line` (11/12).

### T-22 · Cuatro modos de captura que el cuadro promete y ningún adaptador sirve

**Qué.** Continuación estructural de T-14: `CadDraftSettingsDialog` pinta las
**catorce** etiquetas y `draft-settings-host` las enciende **todas menos
`grid`**, mientras `midpoint`, `node`, `insertion` y `geometric-center` no
existen en `CadSnapKind`. Y faltan cuatro auxiliares que un dibujante usa cada
hora: **`DESDE` (FROM)**, **`M2P`** (medio entre dos puntos), **`TT`** (rastreo
temporal) y **`PAR`** (paralelo).

**Dónde.** `lib/cad/entity-runtime.ts:81-86`; `lib/cad/snap-scene.ts:97-101,178-207`;
`lib/cad/pdf/pdf-snap-geometry.ts:632-653` (ya llena `insertions`: el patrón
existe); `lib/cad/engine/command-manifest.ts`.

**Verifica.** `professional-snapping.spec.ts` alimentado por adaptadores reales.
Golden por auxiliar. `check:command-integrity` para los cuatro comandos nuevos.

**Mueve.** `draw-2d.osnap` (defiende 2 pt) y `draw-2d.tracking`.

### T-23 · Los cinco modificadores que se quedan a medias

**Qué.** (a) **`OFFSET` no pregunta de qué lado** y **rechaza cualquier polilínea
con arcos** — o sea, casi todos los muros curvos y todas las jambas. (b) `TRIM`
sin valla (llega gratis con T-21). (c) `BREAK` sólo sobre línea. (d) **`HATCHEDIT`
no existe**: un sombreado colocado no tiene comando que lo reedite. (e) `CIRCLE`
no tiene `Ttr` ni `Ttt` **y, a diferencia de `ARC`, no lo declara**.

**Dónde.** `lib/cad/engine/commands/modify-basics.ts`,
`lib/cad/engine/commands/draw-basics.ts`, `lib/cad/hatch/`.

**Verifica.** Spec por rama + golden del caso que duele (offset de una polilínea
con arco, y el lado elegido con el ratón). Para (e), si no se construye:
**declararlo en el propio comando**, como `ARC` ya hace. Fix-or-hide también
aplica a una opción que falta.

**Mueve.** `modify` (13/14), `hatch` (12/12 — lo **defiende**), `draw-2d`.

### T-24 · El usuario no puede romperse el plano de un teclazo, y deshacer no miente

**Qué.** Tres cosas que sólo se ven en un plano de verdad:

1. **`ARRAY` no tiene techo.** `500 × 500` sobre diez objetos son 2 500 000
   entidades: no hay confirmación, ni tope, ni cancelación, y el documento
   resultante **ya no se puede guardar nunca más**. AutoCAD lleva treinta años
   preguntando «va a crear N elementos, ¿continúo?». Importa
   `CAD_DOCUMENT_LIMITS.maxEntities` **del contrato**, no un número escrito a
   mano. Igual para `COPY` múltiple y `DIVIDE` con bloque.
2. **Deshacer se queda en UN paso en un plano denso y nadie lo dice.** Medido
   corriendo el estimador de `canonical-history.ts` sobre el corpus denso: a
   100 000 entidades un checkpoint estima **48,6 MiB** contra un presupuesto de
   32 MiB, así que la pila se poda al mínimo de **1**. A 20 000 —el plano de
   todos los días— caben **3**. La promesa es 80. **El indicador que lo diría
   existe y está detrás de `?cadDiag=1`.**
3. **El error permanente se comporta como transitorio.** Un `400` —el documento
   superó las 100 000 entidades y **no va a caber nunca**— sale por la misma rama
   que un `500` pasajero: *«espera un momento y vuelve a pulsar Guardar»*. El
   usuario esperará y volverá a pulsar el resto de la tarde.

**Dónde.** `lib/cad/engine/commands/` (`ARRAY`, `COPY`, `DIVIDE`);
`lib/cad/canonical-history.ts`; `lib/cad/benchmark/dense-editing-harness.ts`;
`lib/cad/save-failure.ts:159-166`; `document-lifecycle/autosave.ts:52-54`;
`docs/cad/evidence/document-limits.json`.

**Verifica.** **Tres gates nuevos** (los tres **añaden**, ninguno relaja): a
20 000 entidades el historial conserva al menos N pasos, con N medido y
versionado en un tramo `undoDepthByTier`; una prueba de `ARRAY` por encima del
techo que **exige confirmación**; el caso `400` en `save-failure.spec.ts`, que
hoy cubre cinco estados y **no el que más duele**. La profundidad de deshacer
sale de `?cadDiag=1` **a la barra de estado**, con aviso de una sola vez cuando
`evict` dispara.

**Mueve.** Las filas de degradación que T-02 abre. `persistence` (7/8).

### T-25 · Teclear un ángulo ignora ANGBASE, ANGDIR y AUNITS

**Qué.** Lo que `DIST` informa **no se puede volver a teclear**: el ángulo que el
producto imprime y el ángulo que el producto acepta no están en el mismo sistema.
Es el defecto que un dibujante encuentra en el primer minuto porque su plantilla
de despacho no usa el norte del programa.

**Dónde.** `lib/cad/precision-input.ts`, `lib/cad/engine/commands/inquiry-*.ts`,
las variables de sistema del documento.

**Verifica.** Spec de ida y vuelta: lo que `DIST` imprime, tecleado de vuelta,
da el mismo punto, para los cuatro `AUNITS` y con `ANGBASE`/`ANGDIR` no
triviales. `check:cad-math` es el sitio natural.

**Mueve.** `draw-2d.coordinates` (defiende 2 pt).

---

## OLA 3 · Que se pueda ENTREGAR · 5-6 días

Un despacho que dibuja y no entrega no cobra. Ésta es la ola que convierte el
producto en facturable.

### T-30 · No se puede dibujar ni escribir sobre el papel

**Qué.** `CadPublishSheet` **no tiene ningún campo `paperCommands`**: el
publicador recorre `document.modelSpace.entityIds` dentro del `.map` de
viewports, y `grep -rn "space.entityIds"` da **tres consumidores productivos y
ningún lector de dibujo**. En AutoCAD el cajetín, las notas, la simbología y el
norte se dibujan **en el papel**. Aquí no hay dónde.

**Dónde.** `lib/cad/paper-space.ts:806-863,823`; `lib/cad/viewport-operations.ts:308`;
`Layout3DEditor.tsx:2781`; `lib/cad/cad-document-merge.ts:582`. `BACKLOG` P2-14
lo declara (líneas 711-718).

**Verifica.** Golden: crear lámina, dibujar una línea y escribir un texto en el
papel, publicar, y afirmar que **salen en el PDF y no aparecen en ninguna
ventana**. Y arregla de paso lo que P2-14 ya dice: el contorno de la ventana
poligonal **se suma hoy a `modelSpace.entityIds`** y por eso se proyecta en todas
las ventanas de todas las hojas (T-19·4).

**Mueve.** `layouts` (9/10) — su criterio abierto y su `gap`.

### T-31 · El PDF que rellena, recorta y respeta la capa

**Qué.** Cuatro defectos del trazado, y **primero se unifican los dos emisores**
(T-19): (a) la ventana gráfica **no recorta**; (b) el PDF **no rellena nada**:
sombreado sólido, máscara y wipeout salen huecos; (c) área y escala de trazado
inertes, y **tres de cinco áreas bloquean el trazado**; (d) `MVIEW Desactivada`
apaga la ventana en `PLOT` y **no** en el botón de publicar; (e) una lámina con
dos ventanas a escalas distintas **rotula mal en una de las dos**.

**Dónde.** Los dos emisores de PDF, `lib/cad/paper-space.ts`,
`lib/cad/engine/commands/plot-commands.ts`, `lib/cad/plot/`.

**Verifica.** El oráculo ya está elegido por el censo: **`pypdf`,
`pdfminer.six` o `mutool` leyendo los bytes publicados y MIDIENDO la escala**.
Eso convierte esta tarea en la que cierra a la vez el defecto y la fila de
evidencia independiente. `plot-fidelity.ts` (506 líneas) es uno de los módulos
probados **y no cableados**: cablearlo es parte del arreglo.

**Mueve.** `layouts` (9/10) **hasta su tope**, porque le da testigo ajeno. Es
**dos puntos en una tarea**.

### T-32 · El DXF entregado no lleva las láminas

**Qué.** Ni entra ni sale. **Entrada:** `modelSpaceOnly()` descarta toda entidad
con `paperSpace` y sólo la **cuenta**. **Salida:** `paperSpaceEntityIds` filtra y
emite el aviso. `grep -n "LAYOUT|Paper_Space|VIEWPORT|BLOCK_RECORD|ACAD_LAYOUT"`
sobre el escritor devuelve **cero**; `grep -rn "410"` sobre el lector, **cero**:
ni siquiera se lee el código que agruparía por presentación. Un despacho que
recibe nuestro DXF **recibe el modelo sin sus láminas**, y la propia rúbrica ya
lo dice en el `gap` de `layouts`.

**Dónde.** `lib/cad/dxf-model-space-scope.ts:47-58`;
`lib/cad/dxf-document-export.ts:132-149`; `lib/cad/dxf-export.ts`;
`lib/cad/dxf-write-tables.ts`; `lib/cad/dxf-import.ts`.

**Verifica.** La ruta correcta ya está diagnosticada: `BLOCK_RECORD` +
`ACAD_LAYOUT` + código **410** + reutilizar `document.paperSpaces`, **que ya
existe**. Round-trip con `ezdxf` como oráculo —ya instalado y usado— afirmando
las presentaciones. **Y el DXF que escribimos no lleva handles ni `$HANDSEED`**:
nada del remitente identificado por handle sobrevive. Entra aquí.

**Mueve.** `dxf` (10/12) y `layouts` (9/10).

### T-33 · No se puede sacar un corte ni un alzado

**Qué.** `FLATSHOT` y `SECTION` **no ven la entidad `wall`**: el filtro descarta
todo lo que no sea `solid3d`, `box` o `station` **antes** de llegar a
`volumeFor`, así que ningún catálogo de alturas lo salva; y `SLICE`/`SECTION`
usan `selectedSolids`, que filtra `entity.type === "solid3d"`. `WALL` emite
`type: "wall"`; el golden 92 monta `{type:'box', kind:'wall'}`: **son dos objetos
distintos**. El cuerpo B-rep del muro **existe** y sólo lo consumen dos módulos.

**Y hay un arreglo documental que va ANTES y es de minutos:** `ESCALERA.md:366-367`
da **peldaño 5** a «`FLATSHOT`/`SOLPROF` sobre el modelo del ARQUITECTO (muros…)»
citando el golden 92, que está cobrado sobre el muro **heredado** y no sobre la
entidad que `WALL` emite. Corrige el peldaño primero; el código después.

**Dónde.** `lib/cad/flatshot-solids.ts:181-192`;
`lib/cad/engine/commands/solids-support.ts:44-51`;
`lib/cad/engine/commands/draw-wall.ts:74-79`; `lib/cad/wall-solid-three.ts:105`;
`docs/parity/ESCALERA.md:366-367`.

**Verifica.** Golden nuevo: dibujar tres muros con `WALL`, lanzar `FLATSHOT`, y
afirmar que el alzado **tiene aristas del muro** — hoy el golden 92 usa un muro
heredado y **no es evidencia de ninguna fila de la rúbrica**
(`grep -n '92-cad-alzado' docs/competitive/rubric.json` → nada).

**Mueve.** `toolset-architecture` (3/4). Es el bloqueante que decide si un
arquitecto puede entregar un juego de planos.

### T-34 · El DXF sale sin puertas ni ventanas y con las esquinas sucias

**Qué.** (a) **`opening` no está en el exportador**: `grep -n opening
dxf-entity-primitives.ts` → 0; no está en `DXF_NON_PRIMITIVE_TYPES`; el fallback
devuelve `null` y cae en `dxf_export_entity_dropped` con severidad `error`. **Se
va la carpintería entera.** (b) El exportador dibuja `wallFootprint(entity)` y el
producto dibuja `wallJoinedFootprint(entity, joins)`: en una esquina de muros de
250 la diferencia medida es `±125` con `cap:false`. **El exportador es el único
disidente del repositorio**: el trazado a papel y la proyección del enlace de
revisión sí pasan el documento y dibujan el contorno unido. Eso lo convierte de
«inconsistencia» en **regresión localizada de un fichero**. Y el manifiesto
declara la pérdida de eje/grosor/altura pero **no la divergencia del contorno**.

**Dónde.** `lib/cad/dxf-entity-primitives.ts:111-124`;
`lib/cad/dxf-schema4-primitives.ts:46-125`;
`lib/cad/dxf-export-loss-manifest.ts:50-64,179-201,296-308`;
`lib/cad/wall-entity-adapter.ts:164`; `lib/cad/wall-joins.spec.ts:67-69`;
`lib/cad/paper-space-registry-fallback.ts:74-78`;
`lib/cad/collab/plan-projection.ts:96-100`.

**Verifica.** Round-trip con `ezdxf`: exportar una planta con tres muros unidos y
dos huecos, y afirmar hueco a hueco y esquina a esquina. El manifiesto **declara
o el defecto no existe**.

**Mueve.** `dxf` (10/12), `toolset-architecture` (3/4),
`integrity.no-silent-loss`.

### T-35 · Los datos existen y el papel no los ve

**Qué.** Tres disciplinas, el mismo defecto. **Planta** es la única de las tres
sin cuadro en el plano: `PIDLIST` y `PIDMTO` son `kind: inquiry` —escriben un
renglón y se lo lleva el viento— mientras MEP y Electrical sí tienen su `TABLE`
y **la rúbrica los cobra por eso**. **Electrical:** `AEWIRELIST` y `AETAGLIST`
son un renglón **truncado a propósito** (6 visibles de «de/a», 3 de sueltos): en
un tablero de 60 conductores el electricista ve seis, y **no hay salida a
fichero** — `DATAEXTRACTION → CSV` exporta el cuadro de cantidades de obra, no
los circuitos. En AutoCAD Electrical **los informes son el producto que se le
manda al tablerista**. **MEP:** el número de línea y la etiqueta del equipo no se
dibujan en la lámina (cierra con T-15).

**Dónde.** `lib/cad/engine/commands/data-extraction-commands.ts:44-49,101-116,134-154`;
`lib/cad/engine/commands/electrical-wire.ts:247-250`;
`lib/cad/engine/command-manifest.ts:128,235,237`;
`lib/cad/mep-schedule-table.ts` (el modelo a copiar); `lib/cad/plant/plant-iso.ts:122`.

**Verifica.** Golden por disciplina: generar el cuadro, insertarlo en la lámina,
publicar y afirmarlo en los bytes del PDF. Salida CSV con su spec.

**Mueve.** `toolset-plant3d`, `toolset-electrical`, `toolset-mep` (3/4 los tres).
Es «la palanca más barata del frente»: dos funciones al lado de una que ya
existe.

### T-36 · La escala anotativa es destructiva y sólo acierta en una ventana

**Qué.** Una lámina con dos ventanas a escalas distintas rotula mal en una de las
dos, y la escala anotativa **modifica el objeto** en vez de resolverse por
ventana. Es lo que impide componer un juego de planos real. Y los símbolos
mecánicos **no son anotativos**: en una lámina a 1:5 el globo sale cinco veces
más chico.

**Dónde.** `lib/cad/annotation-scale.ts` y consumidores;
`lib/cad/paper-space.ts`; `lib/cad/symbols.ts`.

**Verifica.** Golden de dos ventanas a 1:50 y 1:100 en la misma hoja, midiendo
la altura de texto en los bytes del PDF con el mismo oráculo de T-31.

**Mueve.** `layouts` (9/10), `annotation-extras` (4/5), `toolset-mechanical`.

---

## OLA 4 · Trabajar con otros · 4-5 días

Un arquitecto no dibuja solo. Recibe el plano del estructurista, manda el suyo al
instalador y le enseña algo al cliente. Hoy los tres pasos están rotos.

### T-40 · Para adjuntar una xref hay que teclear un UUID

**Qué.** No hay **catálogo del inquilino** dentro del CAD. `xrefCatalog` tiene
exactamente **13 apariciones y ninguna es un proveedor**: la declaración, dos
specs y los consumidores. La paleta es un `<input>` libre con placeholder
`PLANT-ARCH`, y para un documento nuevo el identificador **es el UUID**.
`COMPARE` declara `NO_CATALOG` y se para. `ADCENTER` sólo ofrece
`document.externalReferences`.

**Matiz importante, para no construir de más:** el **tablero sí navega** la
biblioteca (`designClient.projects.list` + `documents.list`). El hueco exacto es
que **ese catálogo no entra al CAD**: ni al motor, ni a la paleta, ni a
`ADCENTER`, ni a `COMPARE`. Es cablear, no construir. Y **está declarado
honestamente** en la rúbrica, en `ESCALERA.md:339` y en `BACKLOG.md:114-122`:
es un «todavía no», no una fila cobrada sin evidencia.

**Dónde.** `lib/cad/engine/command-types.ts:259`; `lib/cad/engine/commands/xrefs.ts`;
`lib/cad/engine/commands/compare-drawings.ts:139-141`;
`lib/cad/design-center.ts:12-24`; `components/cad/palettes/CadXrefPalette.tsx:93-104`;
`app/dashboard/page.tsx:141-142` (el proveedor que ya existe).

**Verifica.** Golden: abrir `XREF`, teclear `?`, **ver la lista de la
organización**, elegir por nombre. Y el límite: **la biblioteca se corta a 200
documentos sin decirlo** — o se pagina, o se declara.

**Mueve.** `xrefs` (5/6).

### T-41 · El plano del estructurista llega aplastado a UNA capa gris

**Qué.** Es lo **primero** que hace un arquitecto con una xref y aquí no se puede
hacer. `detachedEntity` **sobrescribe la capa de cada entidad** con una sola,
`xref:<id>:layer`, creada con nombre `XREF|<nombre>`, color fijo `#64748b` y
grosor fijo 0,18. Las cuarenta capas del estructurista se convierten en **una
capa gris**: no puedo congelar sus textos, ni apagar su retícula, ni atenuarlo.
No hay `VISRETAIN` ni `XDWGFADECTL` (`fade` sólo existe para ráster). `XREF`
ofrece Descargar, Recargar, Desligar, Enlazar y Ruta — **ninguna opción de
capas**. Todo lo que puedo hacer es apagar la xref **entera**.

**Y toca la evidencia:** `xrefs.resolution` cobra **2 puntos** por «Resolución de
recursos, **capas de xref** y bind con round-trip» con **una sola spec de bind**,
y `docs/competitive/distancia-autocad-completo-20260901.md` ya lo tenía medido y
escrito («las capas se aplastan a una (medido)»). **La fila sigue cobrando.**

**Dónde.** `lib/cad/xref-projection.ts:62-79,100-105,145-158`;
`lib/cad/engine/commands/xrefs.ts:115-120`; `docs/competitive/rubric.json`
(criterio `xrefs.resolution`).

**Verifica.** Golden: adjuntar una xref de tres capas, **apagar una**, y afirmar
que las otras dos siguen. Hasta que exista, **el `gap` de `xrefs.resolution` lo
declara**.

**Mueve.** `xrefs` (5/6) y **defiende 2 pt hoy cobrados de más**. Duele más que
T-40: con el catálogo arreglado, lo adjuntado **sigue sin poder gestionarse**.

### T-42 · Nadie se entera de nada

**Qué.** Cuatro silencios de colaboración: (a) **nadie avisa de que la xref
cambió**, y preguntarlo **ensucia el dibujo**; (b) **el bloque de la biblioteca
se redefine y los otros catorce planos no se enteran**; (c) al comentario del
cliente **no se le puede contestar** y nadie se entera de que llegó; (d) el `409`
**no tiene salida**: el motor de fusión existe y **no lo llama nadie en el
producto**, y «Apply atomic merge» compara el documento **consigo mismo** si nadie
pulsó «Checkpoint».

Y uno peor, que es de datos: **la biblioteca de bloques del equipo pierde
escrituras en silencio** — la redefinición no lleva `expectedVersion` ni `409`,
al revés que los conjuntos de planos, cuyo contrato **se puede copiar
literalmente**.

**Dónde.** `lib/cad/engine/commands/xrefs.ts`; el módulo de bloques de
organización en `apps/api`; `lib/cad/collab/`; `lib/cad/cad-document-merge.ts`.

**Verifica.** **Gate nuevo**: prueba contra la **API real** con dos escritores
concurrentes sobre el mismo bloque, hermana de
`cad-conflict-per-document.spec.ts`, que ya corre en CI con `E2E_REAL_API: "1"`.

**Mueve.** `review` (4/5), `blocks` (defiende 9/9), `persistence` (7/8).

### T-43 · El plano entregado no tiene dirección · **la apuesta, §7**

**Qué.** Publicar produce un **recibo**, no un enlace: el recibo lleva `sha256`,
tamaño y hojas, es inmutable y server-managed, con su `409` de CAS y su evento de
dominio — y **no tiene los bytes al lado**. Al cliente sólo se le puede enseñar
el **espacio modelo**, nunca la lámina. Y el invitado del enlace es **invisible**
entre máquinas: no aparece en la presencia y no puede entrar en la llamada.

**Casi nada hay que inventar.** Están construidos y probados: el recibo de
publicación; el mecanismo de enlace server-owned entero (hash, caducidad,
revocación, aislamiento por organización, **token en el fragmento**, `403
review_read_only` fuera de su superficie); el manifiesto de pérdidas que la casa
ya obliga a que viaje con el documento; la presencia con cursor y encuadre; la
llamada con política ICE y TURN declarado; y **un codificador de QR propio con su
oráculo y su round-trip**, hoy usado sólo para el alta de MFA. Falta el
**adaptador** del blob store y **coserlo**.

**Dónde.** `packages/contracts/specs/design-api.v1.yaml:1895`;
`apps/api/src/modules/cad-documents/cad-documents.repository.ts:513`;
`lib/cad/collab/`; `lib/qr/qr-encode.ts`; la vista del enlace de revisión.

**Verifica.** Golden de extremo a extremo: publicar → abrir el enlace **sin
sesión** en otro contexto de navegador → ver la **lámina** con su versión, su
`sha256` y sus pérdidas → revocar → 403. Y **D1 primero, que es media hora**: al
cliente se le afirma que no hay nadie mirando y sí lo hay.

**Mueve.** Las filas del grupo `navegador` que T-02 abre. **Hoy no puntúa nada**,
y por eso T-02 va antes.

---

## OLA 5 · El 3D que sale del navegador · 5-7 días

Va aquí y no antes **a propósito**: un arquitecto 2D factura desde el primer día,
y los dos defectos del 3D que son **mentiras** ya se arreglaron en T-10. Lo que
queda es capacidad ausente, declarada honestamente en `ESCALERA.md:376`.

### T-50 · El esquema persistido no tiene dónde escribir un giro

**Qué.** No existe **ninguna** transformación 3D: no hay `3DMOVE`, `3DROTATE`,
`3DSCALE`, `3DALIGN`, `MIRROR3D` ni `3DARRAY`. Y no es que falten comandos:
`CadSolidPlacement` es literalmente `{a,b,c,d,e,f,dz?}` —afín 2×3 más un
desplazamiento en Z— y `placeBody` aplica `x' = a·x + c·y + e`, `y' = b·x + d·y +
f`, `z' = z + dz`: **la z no se mezcla nunca con x ni con y**. `CadEntityTransform`
es todo `CadPoint2`. **El transporte entero es 2D.** La campaña anterior ya
intentó abrirlo y se paró: «pedía cambiar el esquema del documento canónico».

**Es la tarea de más riesgo de la campaña.** Toca el documento persistido, así
que: migración bidireccional, lectura de lo viejo, specs de round-trip, y
`AGENTS.md` §«Legacy boundary» delante.

**Buena noticia medida:** `placeBody` **ya invierte las caras cuando el
determinante es negativo**, así que la mitad difícil de `MIRROR3D` —la
lateralidad— está resuelta. **Lo que falta son las tres filas de la matriz.**

**Dónde.** `lib/cad/cad-entities-v5.ts:270-281`; `lib/cad/solid3d-build.ts:546-573`;
`lib/cad/solid3d-adapter.ts:306-317`; `lib/cad/entity-runtime.ts:184-195`;
`lib/cad/engine/command-manifest.ts`.

**Verifica.** Round-trip de documento: escribir con giro, guardar, reabrir,
comparar vértice a vértice. `check:cad-math` para la matriz. Golden por comando.

**Mueve.** `modeling3d` (5/5 — lo **amplía** si se abre criterio), `brep` (7/7).
Y es la precondición de `SWEEP` con camino no plano y `LOFT` entre secciones no
horizontales.

### T-51 · El modelo 3D no sale del navegador por NINGUNA vía

**Qué.** Asimetría total: **entran cuatro formatos de malla** (OBJ, STL, glTF,
COLLADA — cinco lectores en `lib/cad/interop/`) y **no sale ninguno**.
`grep -rn 'writeStl|exportStl|exportObj|writeObj|toStl' apps/web/src/lib` →
**cero**. `EXPORT` ofrece dos formatos, STEP e IGES, y **ninguno se descarga**:
el exportador escupe el fichero **en la línea de comandos**. Y el 3D **no cruza
el DXF en ninguna dirección**. Para un despacho eso cierra tres flujos de golpe:
impresión 3D, render externo, y mandarle la pieza a alguien sin cuenta.

**Y el GLB —la única vía que sí descarga— exporta el modelo con las caras del
revés**, porque los tres constructores nativos invierten el giro y `exportGltf`
recoge esos mismos objetos de escena. Arreglar el giro lo arregla gratis.

**Dónde.** `lib/cad/engine/commands/solids-interop.ts:35-36,112-113`;
`lib/cad/glb-export.ts`; los tres constructores nativos; `lib/cad/interop/`;
`tessellateBody` (ya produce posiciones e índices).

**Verifica.** Round-trip: exportar STL, releerlo con el lector STL **que ya
existe**, y comparar volumen y orientación de normales. Golden de descarga real.
**El giro se afirma en un spec, no se mira.**

**Mueve.** `brep`, `modeling3d`, `geo`. Y es de las tareas más baratas de la ola:
«un escritor STL ASCII son cuarenta líneas».

### T-52 · Designar en 3D va por la SOMBRA, y el repositorio ya lo tenía diagnosticado

**Qué.** Hay **dos semánticas de designación en el mismo visor** y sólo una es
correcta. La selección libre usa rayo 3D de verdad. El **puente del motor de
comandos** define `hitEntity` sobre `floorWorld`, que devuelve la intersección
del rayo con el **plano de trabajo**, y consulta el índice 2D, cuyo hit-tester
para `solid3d` es la **proyección en planta**. Consecuencia: `UNION`, `SUBTRACT`,
`INTERSECT`, `SLICE`, `SECTION`, `FILLETEDGE`, `CHAMFEREDGE`, `INTERFERE` y
`SOLIDEDIT·Cuerpo` designan **la pieza bajo la sombra del cursor en el suelo**.
En una caja de 3 m vista a 50° son metros de error; en un sólido elevado no se
designa nunca.

**Lo demoledor:** el repositorio **ya escribió este diagnóstico palabra por
palabra** en `lib/cad/view/solid-snap.ts:12-18` —«hay que colocar el cursor sobre
la SOMBRA de esa esquina en el suelo… un enganche que existe pero que nadie puede
usar»— y **lo resolvió para OSNAP** construyendo un índice de pantalla, **sin
llevar el mismo arreglo a `hitEntity`**.

**Dónde.** `Layout3DEditor.tsx:6447-6452,6465-6471,6691-6717,6885-6918`;
`lib/cad/view/solid-snap.ts:12-18` (el arreglo a copiar);
`lib/cad/solid3d-adapter.ts:97-117`.

**Verifica.** El **racimo A** vive aquí: `refutacion-scu-raton.spec.ts:65`
(`punto 1 no puede quedar aplanado a cota 0`, `Expected: > 1 / Received: 0`).
Golden nuevo de designar un sólido elevado con el ratón. Y **declarar `spatial`
en los 272 comandos de 294 que no declaran nada** es trabajo de declaración y
prueba, no de arquitectura: hazlo por lotes con su spec.

**Mueve.** `modeling3d.z-roundtrip` — que hoy cobra 2 pt con evidencia sólo de
specs unitarios que un spec de navegador committeado contradice. Al cerrarlo, esos
2 puntos pasan de **discutidos** a **defendidos**.

### T-53 · Lo que queda del 3D, con su nombre

Sin ficha larga porque son ausencias declaradas, no mentiras. En orden de dolor:
**el árbol paramétrico no se puede editar** (la reeditabilidad está persistida y
es inalcanzable) · **no se puede designar una ARISTA**: `FILLETEDGE` y
`CHAMFEREDGE` eligen ellos · `SLICE` y `SECTION` **sólo cortan por un plano
vertical de dos puntos en planta** · **sin gizmos** ni designación de subobjeto
fuera de un comando · `UNION`/`SUBTRACT`/`INTERSECT` **no funcionan sobre
regiones** · faltan **`HELIX` y `SECTIONPLANE`**, que rompen flujos enteros ·
**no hay render, ni materiales, ni luces** · **el sol no sabe dónde está el
edificio ni qué día es** · **la lámina no puede llevar una vista 3D** · **los
cuatro alzados y la vista inferior los deshace `OrbitControls` al cuadro
siguiente** · **el ViewCube no gira con la cámara** · **ninguna variable de
sistema del 3D**: el LISP y los guiones no pueden leer ni fijar la vista · **la
eliminación exacta de líneas ocultas no alcanza a ningún modelo real**.

**Regla para esta tarea:** lo que no entre en la ola **se declara en
`ESCALERA.md` con su peldaño y su motivo**. Ninguno se queda sin fila.

---

## OLA 6 · Que un despacho pueda comprar, entrar y salir · 4-5 días

### T-60 · Los cuatro agujeros de administración que no tienen ruta

**Qué.** (a) **No se puede echar a nadie de la organización.** Seis rutas en el
controlador y **ninguna mutante sobre una membresía**; sobre **todo** el API hay
17 rutas `@Delete/@Patch/@Put` y ninguna es de organizaciones. Las dos palancas
de escape tampoco sirven: revocar sesión filtra por el `userId` **de quien
llama**, y el servicio de asientos sólo **cuenta**. **No está ni en el backlog.**
(b) **No se puede cambiar la contraseña estando dentro de la sesión.** (c) Dar de
alta el segundo factor **no pide la contraseña**, y no existe reautenticación
reciente. (d) **No se puede cambiar el correo ni el nombre visible: no existe
ninguna ruta de perfil.** Y los permisos son **de organización entera**: no hay
proyecto, carpeta ni ACL por documento.

**Dónde.** `apps/api/src/modules/organizations/organizations.controller.ts`;
`identity.service.ts`; `commercial/seat-entitlement.service.ts`.

**Verifica.** Spec de PostgreSQL por ruta (`npm run test:pg --workspace=valle-design-api`,
con `TEST_DATABASE_URL` y `REQUIRE_POSTGRES_TESTS=true`) más
`npm run check:authz`. **Cuidado con el radio real:** la invitación pendiente
caduca a los 7 días y es de un solo uso, así que esa mitad es baja; **quitar un
miembro y degradar un rol es exactamente tan grave como suena.**

**Mueve.** Ninguna fila hoy. Es el bloqueante de seguridad de la auditoría 15.

### T-61 · El despacho que crece no puede comprar el cuarto asiento

**Qué.** El checkout responde `plan_already_active` y el servidor rechaza la
cuarta invitación. El único camino es el portal genérico de Stripe, **que el
producto no configura ni declara**. `resolveCheckoutSeats` y
`SeatEntitlementService` **ya existen**: falta el endpoint, el botón en
`BillingPortal.tsx` y el enlace desde el muro de invitación de `TeamRoom.tsx`.

**Y una prohibición explícita:** **no se relaja el límite de asientos** para que
el cliente pueda invitar «mientras tanto». El límite está bien puesto, está en el
servidor y es lo que se compró. El arreglo es **venderle** el asiento.

**Verifica.** Golden que compre tres asientos, choque contra el límite, compre el
cuarto e invite.

**Mueve.** El grupo `comercial` que T-02 abre. **Es la ola que más dinero mueve.**

### T-62 · El expediente que pide un comprador

**Qué.** (a) **La bitácora de auditoría se escribe y no se lee**: el módulo
`audit-log` **no tiene controlador**. Y **no tiene retención ni purga**: crece
para siempre con correos dentro. (b) El **SLA existe, es bueno y ningún cliente
puede verlo**: vive en `docs/ops/SLA.md`, no se publica, y sus nombres de plan
(Piloto · Profesional · Empresa) **no coinciden** con los del catálogo vendible
(Prueba · Individual · Despacho). (c) **No hay borrado de cuenta ni exportación
de datos personales**: no hay derechos ARCO/RGPD. (d) El argumento de precio
contra AutoCAD **no tiene una sola cifra respaldada** — y si va a compararse, va
**con fecha, fuente y caducidad vigilada por un gate**, como todo lo demás aquí.

**Verifica.** `GET /v1/organizations/{id}/audit-log` con su pantalla y su spec de
aislamiento; `/sla` publicado con una prueba que **ata los nombres de plan al
catálogo**; `costo-comparado.json` con caducidad vigilada; `npm run check:legal`.

**Mueve.** El grupo `comercial`. Y cierra el bloqueante «el cliente no puede ver
quién tocó sus planos».

### T-63 · Los primeros cinco minutos

**Qué.** Cinco defectos del embudo, **y tres de ellos son el mismo**: (a)
«Importa un DXF» del estado vacío **no hace absolutamente nada**; (b) el
`returnTo` **muere en la verificación**: el dibujo de la demo y la plantilla
elegida nunca llegan a la cuenta; (c) «Ábrelo desde este dispositivo y entrarás
directo» **es falso**: verificar no abre sesión. **Y el arreglo que el informe
propuso para (b) no entregaría el dibujo**, porque el consumidor de la adopción
vive dentro de `createDocument`, que **empieza rechazando** si no hay proyecto
seleccionado — y una cuenta recién verificada tiene **cero proyectos**. Los tres
son **un solo defecto: ninguna pantalla del primer minuto sabe crear el proyecto
implícito.** Se arreglan juntos o no se arregla ninguno. (d) **Nadie acepta los
términos ni el aviso de privacidad al crear la cuenta.** (e) `<html lang="en">`
sobre una página en español. (f) **No existe arrastrar-y-soltar un DXF en
ninguna parte del producto** —ni estado vacío, ni tablero, ni lienzo—: las cuatro
únicas apariciones de `onDrop` son el reordenado de viewports. Y es barato:
`importDocumentFile` **ya acepta un array de `File`**; falta el `onDrop`.

**Y el renglón que falta, que es gratis y vale más que todo lo anterior:**
`/demo` **ya abre el DXF del propio visitante, sin cuenta, sin instalar y sin
subir nada** (§6.2). Nada en el sitio lo dice.

**Dónde.** `app/dashboard/page.tsx:251,264,657`; `DemoStudio.tsx:54-73`;
`app/demo/page.tsx:19-23`; `app/page.tsx:382-387`; `app/layout.tsx`.

**Verifica.** Golden de extremo a extremo desde `/demo` hasta el documento
abierto en la cuenta nueva, **con el dibujo dentro**.

**Mueve.** El grupo `comercial`. Bloqueante de la lente de landing.

### T-64 · Nada de lo que configura el despacho se comparte

**Qué.** Rutinas `.lsp`, paletas, plantillas y atajos viven en `localStorage`; el
**`.ctb` y el `.lin` ni siquiera llegan ahí: viven en la SESIÓN y se pierden al
recargar**. No existe ninguna ruta de `/v1` para rutinas, plantillas, normas,
paletas, macros ni alias, y `apps/api/src/modules/` no tiene módulo de
configuración de despacho. **El único almacén compartido de configuración es
`/v1/cad/blocks`** — y el catálogo de paletas de herramientas **no tiene ninguna
escritura**: `save()` y `remove()` **no los llama nadie en producción**.

**Verifica.** `/v1/cad/assets` por organización, empezando por las rutinas
**porque su puerto ya está escrito y esperando**. Spec de aislamiento por
inquilino contra PostgreSQL real.

**Mueve.** El grupo `comercial` y `plugins` (6/8).

---

## OLA 7 · Los cimientos y la piel · 5-6 días · **mismo peso que el producto**

Ver §5: esto no es «lo que sobra al final». Es la mitad de por qué alguien
prefiere una herramienta.

### T-70 · Medir el rendimiento donde pasa el usuario

**Qué.** Cuatro cosas, y la primera invalida las otras tres si no se hace
primero: **el artefacto del SLO mide un pipeline que el editor no ejecuta**. El
arnés mete las 100 000 entidades —los 34 000 `INSERT` incluidos— en
`CadRenderScene.replace()`; el editor **excluye** los `INSERT` y los sólidos
sombreados y los dibuja instanciados. **Los 25,3 s de `architecture@100k` no son
el número del producto, y nadie sabe hoy cuánto tarda el editor.** La propia
evidencia lo declara en su `scope.notMeasured`.

Luego: (b) **cada edición reconstruye entero el lote instanciado de los 34 000
`INSERT`**, sin guarda de `documentChanged`, dentro de lo que el motor invoca en
**cada lote aplicado**; (c) **dos `Map` de 100 000 entradas en cada render de
React**, a tres líneas de un `useMemo`, en un componente con 60 `useState` y con
el React Compiler **apagado por defecto**; (d) **la malla de texto se destruye y
se reconstruye entera en cada reconciliación**; (e) **designar re-tesela la
geometría**, y designar todo re-tesela el dibujo entero; (f) **la caché de
teselado es más pequeña que el conjunto de trabajo de una vista**; (g) **el
benchmark bloqueante mide un corpus sin texto, sin sombreado, sin cotas y sin
bloques**; (h) **nadie vuelve a medir en CI**: `check:etapas-100k` juzga el
**artefacto publicado** contra el techo publicado, así que un PR puede triplicar
el teselado y seguir verde.

**Dónde.** `lib/cad/benchmark/browser-harness.ts:331-335`;
`Layout3DEditor.tsx:3177-3183,3262-3263,6743,13737-13741`;
`lib/cad/professional-blocks.ts:537`; `lib/cad/entity-three.ts:326-330`;
`next.config.ts:102`; `scripts/perf/check-etapas-100k.mjs`;
`docs/cad/evidence/browser-slo-100k.json`.

**Verifica.** **El arnés monta la escena por donde pasa el usuario, o declara la
diferencia entidad por entidad.** El gate de interacción hoy mide **400
entidades** y **sobre la ruta legacy**: súbelo a la escala real. Y
`setSelection(ids, null)` **puede dar de baja las entidades designadas** — sólo
el orden de dos líneas lo impide: spec que lo fije.

**Mueve.** `performance` (11/12) y su criterio abierto, más `modify.dense-stress`
(1 pt, esperando una corrida: `npm run evidence:dense-editing`).

### T-71 · El backend que sostiene el guardado

**Qué.** (a) **El auditor auditó el endpoint equivocado**: para todo plano de más
de 1 MB el navegador manda `PUT /archive`, no `PUT /content` — y ese camino es
**más caro** (hasta 20 MiB en memoria, descomprime, valida con su propio
`stringify`+`parse`, y luego vuelve a serializar y comprimir) y es **el único que
la evidencia de carga declara NO MEDIDO**. (b) El guardado **recorre el documento
cinco veces, en el hilo único, dentro de la transacción**, y la transacción de
PostgreSQL **sostiene una llamada HTTP al bucket S3**. (c) **La cadencia del
autoguardado y el techo del limitador chocan exactamente: 30 contra 30** en
ventana fija de 60 s — un arquitecto que dibuja sin parar sobre un plano de más
de 1 MB agota su ventana en el primer minuto y ve «Demasiados guardados
seguidos», y **nada en el cliente lee `retryAfterSeconds`**. (d) **No existe
guardado incremental**: el cliente reenvía el documento **entero** cada dos
segundos. Es la decisión de diseño que está debajo de (b), (c) y del crecimiento
sin fin. (e) **Los blobs y las versiones crecen sin fin: no hay recolector, y la
documentación afirma al operador que sí lo hay** — y hoy es **imposible de
escribir**, porque no hay arista de referencia que consultar. (f) `GET
/v1/cad/blocks` carga hasta 400 bloques con su `jsonb` y filtra en JavaScript.
(g) **Abrir un plano no admite petición condicional**: no hay `ETag` ni
`If-None-Match` en **ninguna** ruta CAD.

**Verifica.** `npm run evidence:api-load` con el camino de archivo **medido**;
specs de PostgreSQL para la transacción sin HTTP dentro; un spec que ate la
cadencia del autoguardado al techo del limitador **por construcción**. Y **el
contrato y `ESCALERA.md` declaran la política de retención de versiones**, que
hoy no está en ninguno de los dos.

**Mueve.** `persistence` (7/8), `object-storage` (2/3), `api-sdk` (6/7).

### T-72 · La deuda que hace lento todo lo demás

**Qué.** (a) **Una función React de 17 300 líneas concentra el 87 % de los avisos
de lint** (continuación de T-00). (b) **`apps/web` no tiene lint con tipos**:
438 000 líneas sin `no-floating-promises`. (c) **47 módulos probados y no
cableados**, dos de los cuales **cobran puntos en la rúbrica**; la lista se queda
corta —faltan `plot-pdf-geometry.ts` (486), `plot-fidelity.ts` (506) e
`interaction-latency.ts` (134)—. (d) **28 defectos confirmados aparcados en
rojo**, dos «bloquea el trabajo». (e) **`lazy.ts` cachea la promesa RECHAZADA**:
un chunk caído mata la línea de comandos **para toda la sesión**, sin mensaje, y
sólo recargar la página lo arregla — **el arreglo son dos líneas**: capturar y
limpiar `pending` en el rechazo. (f) **El presupuesto de lint congela por regla y
por workspace, no por archivo**: la concentración puede migrar sin que el
trinquete lo note. (g) **El fake de la API que sostiene 2 184 aserciones está
escrito a mano y ningún gate lo compara con el contrato real.** (h) **El editor
es lo único del estudio sin `ErrorBoundary`.** (i) **Un documento de la casa
describe un árbol que ya no existe, y eso es lo que descarriló esta auditoría**:
localízalo y corrígelo.

**Verifica.** `npm run check:lint-budget` **endurecido a por-archivo**;
`no-floating-promises` encendido con su presupuesto inicial congelado y
descendente; un gate que compare el fake con el contrato generado; el
`ErrorBoundary` del editor **escribiendo checkpoint antes del fallback y
ofreciendo DXF**.

**Mueve.** Ninguna fila directamente. Todo lo demás va más rápido y más seguro.

### T-73 · Que se pueda usar sin ratón, sin vista y en dos idiomas

**Qué.** (a) **Los atajos de palabra clave son españoles y CHOCAN
destructivamente con los de AutoCAD en inglés.** (b) **El producto habla un 0,4 %
por claves: el inglés es el default y no existe.** (c) **No existe vocabulario de
comandos en español**, que es la promesa comercial declarada. (d) **43 controles
del estudio se enfocan sin verse** (el trinquete dice 27). (e) **El estudio no
tiene ni un solo encabezado: cero `<h1>`…`<h3>` en 18 453 líneas** — y se escapa
porque `page-has-heading-one` es de impacto **moderate** y el gate de axe filtra a
`serious|critical`. (f) **Los 159 botones de la cinta llegan sin su panel**:
`CadRibbonPanel` no tiene `role` ni `aria-label`; **no hay Alt+letra (KeyTips)**.
(g) **El lienzo no existe para un lector de pantalla** y la lista de entidades se
corta en 20. (h) **El prompt vivo no se puede volver a leer**: la caja de comandos
no tiene `aria-describedby`, el log no recibe foco y `F2` no existe — tres huecos
«media» que juntos son un callejón sin salida. (i) **La paleta Ctrl+K —la
superficie insignia— no tiene ni una marca de accesibilidad ni una prueba de
extremo a extremo**, y es justo donde vive (b). (j) **`forced-colors` y
`prefers-contrast` no existen en ninguna parte del árbol**, mientras
`prefers-reduced-motion` aparece diez veces y mejor razonado que en ningún repo:
el criterio existe y **esta rama falta**. Contra AutoCAD esto es una
**regresión**, no un empate: a una app nativa el Modo de alto contraste le
reasigna los colores gratis.

**Verifica.** Sube el filtro de `axe-estudio.spec.ts` para que **`moderate` falle**
y no sólo se imprima. Golden de navegación por flechas de la cinta y de enrutado
de teclas a la línea de comandos desde un botón — **hoy no defiende ninguno**.
Trinquete de foco visible **a 0**, no a 27. Y `BACKLOG P1-FE4` declara ausente
una trampa de foco **que ya existe**: corrígelo.

**Mueve.** Ninguna fila hoy (§1.6). Con T-02, la fila que se abra.

### T-74 · La cinta y el gesto

**Qué.** (a) **No hay ni una sola pestaña contextual**: la cinta no sabe qué hay
designado. (b) **PR, OP, TP y UC contestan con un aviso en rojo aunque el panel
esté montado.** (c) **La línea de comandos no sugiere nada mientras escribo, y el
buscador ya existe.** (d) **Inicio tiene 159 botones en una tira de ~10 500 px**,
sin desplegables y con la barra de desplazamiento oculta. (e) **La paleta de
herramientas no tiene interfaz**: Ctrl+3 abre una disculpa sobre un catálogo que
ya persiste. (f) **El menú del botón derecho es el mismo tenga designado un muro,
una cota o nada.** (g) **Sólo hay pestaña para las tres primeras láminas, están
arriba, dicen «Model» y no hay Ctrl+RePág.** (h) **Ctrl+8 y Ctrl+9 están atados a
la paleta EQUIVOCADA respecto a AutoCAD, y un comentario del código afirma lo
contrario.** (i) **En un dibujo de sólo lectura la cinta se apaga ENTERA**,
incluidos los comandos que no mutan nada. (j) **La cinta no tiene buscador propio
ni recuerda nada**: el único camino a un comando que no se sabe de memoria es
Ctrl+K.

**Verifica.** `npm run check:cad` ya corre `check-ribbon-coverage.mjs` y
`ui-command-reach.mjs`: **amplíalos** a pestaña contextual y a KeyTips. Golden por
cada uno de (a), (f) y (g).

**Mueve.** Ninguna fila hoy, y **dos `gap` de la rúbrica están desactualizados a
la baja**: corrígelos en T-02.

### T-75 · Que el fallo se quede en pantalla mientras exista

**Qué.** (a) **El aviso mejor escrito del producto dura doce segundos**: los tres
párrafos de `describeCadSaveFailure` —qué pasó, qué pasa con tu trabajo, qué
puedes hacer— viajan en un toast que se va, y lo que queda es una etiqueta de
cinco palabras con el resto en un `title` **que en una tableta no existe**.
Sustitúyelo por un **panel de estado del guardado** con acciones (Reintentar ·
Exportar DXF · Detalles). (b) **Abrir el dibujo caído no ofrece ni reintentar ni
el borrador local.** (c) **`openDatabase` no maneja `blocked`**: dos pestañas y
un cambio de versión **cuelgan el recovery para siempre, y en silencio**. (d)
**«Dibujar funciona sin red» es cierto sólo para lo que ya se cargó**: hay 108
módulos de comandos en carga diferida y el service worker **no precarga
ninguno** — y la fila `dibujar-acotar-modelar` de la matriz sin red **dice que sí
se nota** cuando no. (e) **Nada mira la memoria mientras el producto corre**, y
**no hay escalera de degradación** entre «cabe» y «no cabe». (f) **La importación
muere a los 45 segundos aunque esté avanzando**: el temporizador tiene que ser
por **atasco**, no por reloj, con «Seguir esperando» y «Cancelar». (g) **Nadie
puede borrar un plano**, y `documentsRepository.archive` **no tiene llamador de
producto**. (h) **El contenedor de todos los avisos de fallo está pintado con
color crudo** y las notificaciones **no se anuncian a un lector de pantalla y son
de otro sistema de diseño**.

**Verifica.** `save-failure.spec.ts` con el caso que falta; spec de `openDatabase`
bloqueado que **exige aviso visible**; gate sin red que exija el núcleo de
comandos precargado; y el aviso de la matriz corregido — **la matriz es
ejecutable, así que mentir en ella es un rojo**.

**Mueve.** Las filas de degradación que T-02 abre. `persistence` (7/8).

---

# 3 · LAS REGLAS DE LA CASA

No son consejos. Están cableadas en gates y violarlas no es una opinión: es un
rojo.

## 3.1 · Las cinco invariantes

1. **Ningún claim sin evidencia.** Si escribes «falta X», tienes que haber
   **mirado** si X existe. Este repositorio es enorme y lo más fácil del mundo es
   declarar que falta algo que ya está: diez huecos de los 295 auditados se
   cayeron por eso, y cada uno habría costado días de reconstruir lo construido.
   La lista de §1.3 existe para eso. **Amplíala** cada vez que descubras algo que
   ya estaba.
2. **Lo parcial se declara «todavía no», nunca «nunca», y nunca en silencio.**
   Toda afirmación pública lleva su frontera al lado: README «Límites
   declarados», CAPABILITIES con columna de límites, manifiesto de pérdidas que
   viaja con el archivo, peldaño en `ESCALERA.md`.
3. **Prohibido relajar gates, umbrales, goldens o presupuestos.** Se amplían,
   nunca se aflojan. Si un gate te para, **tiene razón**: en la campaña anterior
   paró al coordinador y acertó. Bajar un techo es un acto que se gana; subirlo
   exige `--allow-growth` y queda en el diff **delante de quien revisa**.
4. **Prohibido tocar identificadores persistidos o renombrar `data-testid`.**
5. **Fix-or-hide.** Tres puertas: VERIFICADA, ARREGLADA, OCULTA. **El cuarto
   estado —visible y no verificada— está prohibido.** Ningún botón, formato de
   importación, precio, afirmación de seguridad o claim de compatibilidad se
   muestra sin que la conducta que lo respalda esté probada.

**Y las cuatro de la campaña de cimientos, que también son gates:**

- **Ningún módulo cuenta por existir.** Una capacidad puntúa sólo si su flujo
  está **conectado y probado**. Un subsistema sin importador fuera de sí mismo no
  está implementado. Y una fila con **toda** la evidencia fabricada por el
  proyecto **no puede llegar a su tope**: retiene 1 punto hasta tener oráculo
  externo, material de terceros o usuario real.
- **Ningún comando responde éxito sin efecto verificado.**
  `check:command-integrity` ejecuta **todos** los comandos del registro y veta el
  «hecho» vacío. Un comando nuevo o termina con efecto, o declara su límite, o se
  exenta con razón escrita en `command-integrity-exemptions.json`.
- **Ninguna capacidad se anuncia sin evidencia del límite.**
- **Ninguna cifra vive en dos lugares.** El estado lo computa
  `node scripts/cad/rubric.mjs` y la matriz se **regenera** de él. **Los informes
  enlazan, no copian.** Una cifra escrita a mano en un doc es un defecto aunque
  hoy coincida. *(Este prompt cita cifras a propósito, como foto fechada del
  2026-09-05; ningún documento que escribas puede hacerlo.)*

**Una salvedad explícita.** La campaña de lanzamiento añadía «prohibido agregar
funciones nuevas», porque era un barrido funcional. **Esta sesión SÍ construye.**
Esa prohibición **no aplica**; las otras cuatro siguen enteras.

## 3.2 · Las trampas operativas, todas medidas en este proyecto

Cada una costó tiempo real aquí. No son hipótesis.

- **El código de salida real.** **Nunca `gate | tail` encadenado con `&&`**: el
  pipe devuelve el código de `tail` y eso ya coló un commit con `check:cad` en
  rojo. Redirige a fichero y lee `$?`.
- **Node 20 para lint, typecheck y gates de scripts** (`/opt/node20/bin`, y es lo
  que dice `.nvmrc`). **Node 22 para `npm test`** (`node -v` aquí da v22). Bajo el
  20, `better-sqlite3` da **124 fallos FALSOS** de la API, porque `node_modules`
  se compiló con el 22. Al revés también engaña: un fallo **real**
  (`ERR_INVALID_URL` en la sonda del manifiesto) sólo aparecía en el 20.
- **El lint corta ANTES que E2E.** Con lint en rojo, los fragmentos de E2E **ni
  corren** y no te enteras del estado real de las pruebas.
- **Nunca `npm test` de `apps/api` directamente**: agota la memoria y tumba el
  contenedor. Por turbo.
- **`check:cad` quiere `VALLE_DWG_CORPUS_MIRROR` con una RUTA** a un clon de
  `valle-design-dwg-conformance` (aquí `/home/user/valle-design-dwg-conformance`),
  **no un `1`**. Sin espejo falla `check:dwg-evidence` por un desajuste conocido
  CI-vs-local que **no es una regresión**.
- **`main` usa squash.** Una rama vieja puede **no ser ancestro** suyo: se aplican
  diffs, no se fusionan ramas antiguas.
- **Un build a medias no se nota.** Si matas un `next build` a mitad, `.next`
  queda corrupto, turbo sirve el resto de la caché y el build siguiente **parece
  bueno**, pero `next start` muere con `ENOENT: prerender-manifest.json`. Si el
  servidor no arranca: `rm -rf .next` y reconstruye con `--force`.
- **El presupuesto de bytes sin `E2E_PROD=1`** mide contra `next dev` y da basura
  (~17 000 KB). **Con** él mide el **último** build: sin reconstruir, mide una
  aplicación vieja.
- **No competir por CPU.** Ocho tareas de turbo sobre cuatro núcleos ya produjo
  un rojo falso que costó una hora. `plan-budget` y el banco de snap **fallan bajo
  carga y pasan en aislamiento**: ante un rojo, **reejecuta ESE spec solo antes de
  creerlo**. En CI pasan.
- **El alta de cuentas en `e2e/real` tiene tope: 8 por IP y minuto**
  (`identity.controller.ts:356`, ventana de 60 s). En CI las suites comparten
  proceso, API e IP, así que la novena recibe **429**; una prueba que dispara el
  alta sin mirar la respuesta muere tres líneas después con un **404** del arnés
  de correo que no acusa a nadie. Ya tumbó el fragmento 4/4 con un diff de sólo
  markdown. **Usa `registrarCuenta` (`e2e/fixtures/first-party.ts`)**, que afirma
  el 202 y espera lo que el 429 pide. Las tres suites que disparaban el alta a
  ciegas ya están convertidas; quedan **seis** llamadas crudas en `e2e/real/`
  que sí afirman el 202 —ante un 429 fallan en voz alta y señalando al
  registro—, así que convertirlas es mejora, no arreglo: trabajo mecánico de
  `BACKLOG.md`. **El tope no se relaja.**
- **Los gates se corren sobre el árbol QUIETO (committeado).** Un gate a media
  edición produce rojos falsos que cuestan más que esperar.
- **Antes de tocar un archivo caliente, `git status` del checkout principal**:
  mira si otra sesión lo tiene sin commitear.
- **Cómo se corren las pruebas de auditoría** (59 casos, 28 ficheros, ~11 minutos,
  en segundo plano):

  ```bash
  cd apps/web && rm -rf .next
  NEXT_PUBLIC_API_URL=http://localhost:4000 npx turbo run build --filter=web --force
  E2E_PROD=1 E2E_AUDITORIA=1 E2E_API_ORIGIN=http://localhost:4000 \
    npx playwright test e2e/auditoria --project=chromium --reporter=line --workers=1
  ```

## 3.3 · Las tres lecciones de verificación que costaron caro

Estas tres ordenan **cómo se comprueba** aquí, y las tres se pagaron:

1. **Un acuerdo entre dos medidas equivocadas por el mismo sitio no es un
   acuerdo.** La matriz de fidelidad comparaba MTEXT y HATCH contra el oráculo y
   los números cuadraban — porque el lector contaba el fichero entero y el censo
   se leía de `archivoEntero`, que incluye `*Model_Space` y los bloques que nadie
   inserta. **No hay forma de detectarlo mirando: sólo arreglando uno de los dos
   lados.** Cuando dos medidas coinciden, pregunta si **comparten el error**, no
   sólo si comparten el resultado.
2. **Aplicar una petición no es ejecutarla: es volver a medir lo que afirma.**
   Dos peticiones escritas con rigor traían un dato mal —los índices ACI del
   corpus eran catorce y no doce; `floorplan.dxf` sí trae HATCH dentro de
   bloques— y las dos habrían pasado sin comprobar.
3. **Cuando un gate te para a ti, tiene razón.** Dar ámbito a los escaneos crudos
   introdujo cinco pérdidas silenciosas nuevas y el techo del corpus las cazó en
   la primera corrida. **Se emitió el aviso que faltaba; el techo no se tocó.**

## 3.4 · El régimen de la sesión: horas sin detenerse, y sin preguntar

**Requisito explícito del titular, y no es una preferencia de estilo:** esta
sesión dura varias horas y **no se detiene por nada, ni siquiera a preguntar.**
Ante cualquier duda se toma la opción **más conservadora**, se anota y se sigue.

Conviene entender por qué eso NO es permiso para ir deprisa. Una duda sin regla
escrita es una parada; por eso lo que sigue es la respuesta **escrita de
antemano** a cada duda previsible de este repositorio. Si te encuentras una que
no está en la tabla, la regla de cierre es: **elige lo que se puede deshacer con
un `git revert` y que no cambie ni un byte persistido.**

### 3.4.1 · La tabla de decisión. Duda → opción conservadora

| Si dudas de… | Haces esto. Sin excepción |
|---|---|
| Tocar un fichero de otro frente | **No.** Escribes una petición al buzón (§5.4) y sigues con lo tuyo |
| Tocar `Layout3DEditor.tsx` sin ser F1 | **No.** Petición. Tiene **una** línea de margen (§Ola 0) |
| Relajar un umbral, techo, golden o presupuesto | **Nunca.** Ni «temporalmente». Si te para, tiene razón |
| Renombrar un identificador persistido o un `data-testid` | **No.** Son compatibilidad (`IDENTITY.md`, ADR-0010) |
| Modificar un módulo grande **o** crear uno nuevo aditivo | **El nuevo.** Aditivo, con su spec, y el viejo delega |
| Construir algo que **quizá** ya existe | **Búscalo tres veces** —`grep` del nombre, del concepto y del test— antes de escribir una línea. §1.3 existe porque esto pasó |
| Borrar código que parece muerto | **No se borra: se anota** en `BACKLOG.md` con la prueba de que nadie lo llama |
| Migrar el esquema persistido | **No.** Campo **opcional** con lectura tolerante, y el viejo sigue leyéndose |
| Encender `DWG_IMPORT_FLAG` / `DWG_EXPORT_FLAG` | **Nunca.** Ni para probar. Ni en un commit que luego se revierte |
| Un conflicto donde los dos lados cambian la misma lógica | **Se queda lo de `main`.** Tu versión va a petición |
| Publicar una cifra que no mediste **en esta sesión** | **No se publica.** O la mides o no aparece |
| Un rojo que no entiendes | **Reejecuta ESE spec solo.** `plan-budget` y el banco de snap fallan bajo carga y pasan en aislamiento |
| Una prueba que estorba | **Jamás se salta, se desactiva ni se pone en cuarentena.** Se arregla el producto o se declara el límite |
| Un `test.fail()` que no sabes si sigue vigente | **Míralo.** Invierte el veredicto: puede esconder un defecto vivo en verde (§1.4) |
| Si algo es «suficientemente pequeño» para saltarse la verificación | **No lo es.** Un cambio de dos líneas en el exportador cambia los bytes de todo dibujo |
| Ampliar el alcance de una tarea porque «ya que estoy» | **No.** Lo de más va a `BACKLOG.md` con su nombre |

### 3.4.2 · El registro de decisiones: no preguntar es preguntar en diferido

Abre `docs/execution/DECISIONES_<fecha>.md` en el primer ciclo y escríbelo
**mientras decides**, no al final. Una entrada por duda, cuatro campos:

```
## D-07 · La cota anotativa a dos escalas en la misma lámina
Qué se dudó ......  Si añadir representaciones por escala al objeto.
Qué se eligió ....  No. Se deja el comportamiento de hoy y se declara en ESCALERA.
Por qué es lo conservador ...  Toca el esquema persistido de toda entidad
                     anotativa; un campo nuevo obligatorio rompe la lectura
                     de cualquier documento guardado antes de hoy.
Qué haría falta para elegir lo otro ...  Una decisión del titular sobre versionar
                     el formato, más una migración con lectura tolerante.
```

Ese último campo es el que convierte el registro en algo útil: es la pregunta que
**no** hiciste, formulada para que el titular la conteste después en dos minutos.
Sin él, «no preguntar» se convierte en «decidir a solas y que no se entere nadie»,
que es otra cosa.

### 3.4.3 · La cola es MÁS LARGA que la sesión, a propósito

Ocho olas y 46 fichas no caben en una sesión, y **está bien que no quepan.** Una
cola corta obliga a parar cuando algo se atasca; una cola larga convierte el
atasco en un cambio de tarea.

- **Ítem bloqueado 25 minutos** → escribes **qué lo desbloquearía** (no «está
  bloqueado»: *qué haría falta*), lo pasas a `BACKLOG.md`, **siguiente ficha.**
- **Nunca esperes.** Ni con `sleep`, ni con nada interactivo, ni a que termine
  una suite: lánzala en segundo plano y avanza en otro fichero.
- **Nunca te quedes sin siguiente.** Si agotas una ola, empiezas la siguiente;
  si las agotas todas —no va a pasar—, `BACKLOG.md` está lleno.

### 3.4.4 · La cadencia: ciclos de ~90 minutos que SIEMPRE acaban en commit

**El commit es el único punto de guardado real.** El contexto se compacta y el
contenedor se reinicia; las dos cosas pasan. Trabajo sin commitear es trabajo que
puede no existir dentro de una hora.

Cada ~90 minutos, aunque la tarea siga abierta:

1. Gates locales del área que tocaste (§3.4.5).
2. **Commit**, con el mensaje diciendo qué quedó a medias y qué sigue.
3. Bitácora al día.
4. `push` al terminar la ola, con la suite entera y el árbol quieto.

Y **cada ficha nace con su «terminada» escrita**, antes de empezarla. La
ambigüedad sobre si algo está hecho es la otra causa de parada: cuando el
criterio está escrito —«este spec en verde y graduado», «este gate imprime N»—
no hay nada que deliberar.

### 3.4.5 · Antes de cada push, sin excepción

`npm test`, `npm run typecheck`, los tres gates de comandos, y —si tocaste rutas
o el registro— build de producción con el presupuesto de bytes. **Tres corridas
de CI se gastaron aprendiendo esto.** Un push que pone CI en rojo cuesta un ciclo
entero y la confianza del que revisa.

---

# 4 · LA PARTE DE DESARROLLADOR TIENE EL MISMO PESO

Esto no es una sección de cortesía al final. **El encargo del titular es que su
usuario ABRA la aplicación y sienta que es mejor que AutoCAD, y eso no lo da la
lista de comandos.**

Piénsalo desde el otro lado: un arquitecto que evalúa un CAD nuevo en veinte
minutos no compara matrices de funciones. Compara **cinco sensaciones**, y las
cinco son trabajo de desarrollador:

1. **Que arranque y responda.** Si designar todo re-tesela el dibujo entero, si
   cada edición reconstruye 34 000 `INSERT`, si dos `Map` de 100 000 entradas se
   levantan en cada render, la herramienta «va lenta» y no hay comando que lo
   arregle. **T-70.**
2. **Que no le dé miedo.** Que no haya un botón que llame a un 404. Que el aviso
   de fallo no dure doce segundos. Que `ARRAY 500×500` pregunte. Que Deshacer no
   se apague en silencio. **T-24, T-75.**
3. **Que se vea de una pieza.** Que el plano no desaparezca al conmutar el tema.
   Que ningún control se enfoque sin verse. Que las notificaciones no sean de otro
   sistema de diseño. Que 11 px sea un piso y no una sugerencia. **T-13, T-73.**
4. **Que entrar sea de un minuto.** Que arrastrar un DXF al lienzo lo abra. Que
   verificar el correo te deje dentro con tu dibujo. Que la portada no prometa una
   factura que el producto no timbra. **T-18, T-63.**
5. **Que sus planos sean suyos.** Que pueda echar a quien se fue del despacho,
   cambiar su contraseña, leer quién tocó qué, exportarlo todo y borrarlo todo.
   **T-60, T-62.**

**Cómo se reparte el esfuerzo.** De las siete olas, **dos y media son de
desarrollador puro** (la 6 completa, la 7 completa, y la mitad de la 1). No es
relleno: es el 40 % del plan y **no se recorta cuando la campaña vaya con
retraso**. Si hay que recortar, se recorta la **Ola 5** (el 3D), porque un
arquitecto 2D factura sin ella y sus dos mentiras ya están arregladas en la Ola 1.

**La vara, palabra por palabra, de la campaña de lanzamiento:**

> Un arquitecto que no conocemos, en una computadora que no controlamos, dibuja
> una planta, la acota, la imprime a PDF, la exporta a DXF, y **los tres archivos
> dicen la verdad**. Lo que no aguante esa vara se arregla; lo que no se pueda
> arreglar hoy, se oculta.

---

# 5 · CÓMO SE ORGANIZA LA SESIÓN

La disciplina no se inventa: está escrita en
`docs/history/execution/CAMPANA_SUPERAR_20260904.md` (la bitácora) y en
`docs/execution/INFORME_CAMPANA_SUPERAR_20260904.md` (el cierre, §6 «Método»).
**Léelos y reutilízalos.** Lo que sigue es esa disciplina ajustada a esta campaña.

## 5.1 · Lo primero: mide tu propio techo

```bash
nproc; free -g; df -h /home/user
```

La campaña anterior tenía 4 CPU y 15 GB, y su techo real de agentes concurrentes
fue **`min(16, nproc-2)` = 2**. Los once frentes existían y avanzaban **de dos en
dos por orden de prioridad**. **El paralelismo real es el que la máquina sostiene,
no el que el plan dibuja**, y forzarlo produce rojos falsos que cuestan más que
esperar. Si aquí el techo vuelve a ser 2, el orden de §2 **es** el plan: las
tandas salen de él, no de una tabla de frentes.

Cada frente en su propio `git worktree`, con `node_modules` **enlazado por
hardlink** desde el árbol principal: once copias ocuparon 1,2 GB, no 13 GB.

## 5.2 · Territorios exclusivos

| Frente | Territorio | Olas |
|---|---|---|
| **F0 · Coordinador** | `rubric.json`, `ESCALERA.md`, `BACKLOG.md`, `monolith-budget.json`, `manifiesto.json`, la bitácora de campaña. **Aplica todas las peticiones. No escribe código de producto salvo aplicando una petición.** | todas |
| **F1 · El monolito** | `Layout3DEditor.tsx` **en exclusiva**, y los módulos que extraiga de él | 0, y disponible después |
| **F2 · Verdad de superficie** | Las cadenas, botones y claims de la Ola 1 fuera del monolito | 1 |
| **F3 · El bucle 2D** | `lib/cad/snap-*`, `selection/`, `engine/commands/modify-*`, `draw-*` | 2 |
| **F4 · Papel y entrega** | `paper-space.ts`, `plot/`, los dos emisores de PDF, `dxf-*` | 1, 3 |
| **F5 · Toolsets** | `mep-symbols.ts`, `electrical/`, `plant/`, `flatshot-*`, `wall-*`, `bim-*` | 1, 3 |
| **F6 · Colaboración** | `xref-*`, `collab/`, `design-center.ts`, el módulo de bloques del API | 4 |
| **F7 · El 3D** | `brep/`, `solid3d-*`, `viewport/`, `glb-export.ts`, `interop/` | 5 |
| **F8 · El despacho** | `apps/api/src/modules/{organizations,commercial,identity,outbox-receiver}`, la landing, el alta | 1, 6 |
| **F9 · Cimientos** | `benchmark/`, `render/`, gates de diseño y a11y, `check-lint-budget`, la cinta | 7 |
| **F10 · Evidencia independiente** | `docs/cad/evidence/`, `verification/`, `scripts/cad/`. **No toca producto: no compite con nadie.** | **todas, desde el día 1** |

## 5.3 · La regla del monolito · **la más importante de esta campaña**

`Layout3DEditor.tsx` tiene **18 453 líneas** contra una asignación de **18 454**:
**una línea de margen**. El trinquete tiene **dos filos**: crecer por encima
falla, y adelgazar 200 líneas o más por debajo **sin correr `--update` también
falla**. `useState` está topado en **131** y sólo puede bajar. Al menos quince
defectos confirmados viven ahí (T-00). Por tanto:

1. **Sólo F1 escribe en ese fichero.** Todos los demás escriben una **petición**.
2. **Ninguna función nueva entra ahí.** Se extrae primero, se añade después.
3. **Toda extracción de ≥200 líneas lleva
   `node scripts/cad/check-monolith-budget.mjs --update` EN EL MISMO COMMIT**, para
   que el manifiesto siga diciendo la verdad y el progreso quede en el diff.
4. **Nunca `--allow-growth`** sin que el titular lo pida por escrito.

## 5.4 · El buzón de peticiones

Funcionó: **49 peticiones escritas por quien las necesitaba y aplicadas por quien
podía, cero conflictos de dos manos en el mismo archivo.** Se conserva tal cual.

- Cada frente: `docs/execution/frentes/<frente>.md` (bitácora) y
  `<frente>-peticiones.md` (buzón).
- Una petición dice: **qué archivo, qué cambio exacto, por qué, y qué prueba lo
  verifica.**
- **El coordinador las aplica en grupos secuenciales, nunca dos a la vez sobre el
  mismo árbol**, y **vuelve a medir lo que la petición afirma** (§3.3·2).
- **Un criterio abierto de la rúbrica lo otorga quien lo evalúa, no quien lo
  construye.** Los frentes miden y proponen; `rubric.json` sólo lo toca F0.

## 5.5 · Ventanas de integración

Entre tanda y tanda. **Se integra frente por frente con la suite completa DESPUÉS
DE CADA UNO**, y un solo push al final. Eso reveló, en la campaña anterior, que
un rojo no era del frente al que se le atribuyó y que otro era una colisión entre
dos trabajos nacidos a la vez.

**Vara de integración:** la suite al cortar. Si tras integrar un frente la cifra
baja, **el frente se revierte** y se investiga fuera de la ventana.

## 5.6 · Las cinco faltas del coordinador anterior, para no repetirlas

Están escritas con nombre en su propia bitácora. Son el material más útil que
dejó:

1. **Concluyó «el rojo de E2E no es de este PR» mirando un fragmento de tres**,
   cuando dos eran regresiones propias. **Mide cada lado antes de atribuir.**
2. **Escribió que «la red sólo alcanza GitHub» y era falso.** PyPI, crates.io y
   npm responden — y esos hosts estaban en el `noProxy` que **leyó en su primera
   hora**. Probó dos destinos y generalizó. La premisa encogió dos frentes
   enteros durante un día. **Comprueba, no generalices.**
3. **Comiteó dos veces el trabajo en vuelo de un agente**, que tuvo que verificar
   **después** que su contenido había sobrevivido. **Mientras un agente tenga el
   árbol, sus archivos son suyos.**
4. **Borró los once árboles de trabajo mientras un agente todavía cerraba.** Un
   frente perdió su bitácora, dos peticiones sin commitear, y su sexto entregable
   quedó **colgando en el almacén de objetos** — rescatado a un parche antes de
   que un `git gc` lo podara. Con él, `check:cad-math` sube de 4 806 a 5 421 casos
   y la rúbrica de 238 a 239. **Casi se pierde un punto y 615 casos numéricos por
   limpiar antes de tiempo. No se retira el andamio hasta que el último agente
   dijo que terminó.**
5. **Empujó un estado a medio construir porque compilaba.** Cuatro corridas de CI
   se gastaron aprendiéndolo.

Y una regla **violada a propósito y conservada**, que enseña cómo se decide aquí:
un agente editó `ESCALERA.md`, reservado al coordinador. Se **conservó**, con el
motivo escrito, porque no hubo colisión y porque lo que escribió era de lo más
honesto de la campaña —abría en peldaño 0 un defecto propio que nadie le
obligaba a confesar—. **Borrarlo para hacer valer la forma de la regla habría
costado verdad.** La regla sigue en pie; la excepción quedó anotada con su
nombre.

## 5.7 · Al cerrar

- **Cada frente cierra su propia rama en la MISMA sesión** — fusionada o
  borrada. 74 ramas remotas vivas no fue un accidente: fue el efecto de sesiones
  que abrían una rama y la dejaban ahí, y costó un día entero de campaña
  dedicada. Si el cambio es pequeño y autocontenido, **sáltate la rama**: los
  seis gates locales verdes bastan para empujar directo a `main`.
- **La bitácora de campaña se archiva a `docs/history/execution/` en el mismo
  commit que publica el informe de cierre.** El `INFORME_*` **no** se archiva: se
  queda en `docs/execution/` porque es evidencia medida, no un plan vencido.

---

# 6 · LA APUESTA

Todo lo anterior sirve para **igualar** a AutoCAD. Esta sección es lo que hace
que alguien lo **prefiera**, y va aquí al final porque es lo que hay que tener en
la cabeza mientras se hace todo lo demás.

## 6.1 · Las ventajas estructurales, que son de la plataforma y no del esfuerzo

AutoCAD no puede copiar estas cuatro sin dejar de ser AutoCAD. **No son
funciones: son consecuencias de correr en el navegador.**

1. **La unidad de reparto puede ser una dirección, porque la unidad de ejecución
   ya lo es.** La entrega de AutoCAD es un archivo —un `.dwg` en una carpeta, un
   PDF adjunto— **porque su unidad de ejecución es una instalación**. Para que ese
   archivo tenga dirección, Autodesk necesita **vender otro producto**: Docs, el
   visor, otra suscripción, un alta más para el cliente del despacho. **El cliente
   final del arquitecto mexicano no va a crear una cuenta de Autodesk para ver su
   casa.**
2. **El destinatario ya tiene el dispositivo.** El teléfono del maestro de obra
   abre el plano. Sin instalar, sin cuenta, sin «guárdamelo en 2018 que mi versión
   no lo abre».
3. **El estado vive donde se puede medir.** La ventana de pérdida de una
   aplicación de escritorio es lo que diga el autoguardado de cada usuario, en su
   disco, y **nadie la publica**. Aquí es un número: **16,9 segundos, medido y
   publicado**.
4. **La versión que corre es la única que existe.** No hay parque de versiones
   que negociar entre despachos ni entre socios.

Las tres apuestas de abajo son esas cuatro ventajas convertidas en frases que se
dicen delante de un socio director.

## 6.2 · Apuesta 1 · El plano entregado deja de ser un archivo y pasa a ser una dirección

> Una URL que el cliente abre en el teléfono **sin cuenta y sin instalar nada**,
> que lleva la **versión**, el **`sha256`** y las **pérdidas declaradas** al lado
> del dibujo, que se **revoca**, que **caduca**, y en la que el arquitecto y el
> cliente **se ven** mirando el mismo punto mientras hablan.

**Por qué AutoCAD no puede.** §6.1·1. Un enlace que se abre en el teléfono del
cliente sin cuenta es **una frase que AutoCAD no puede decir con ningún precio**.

**Lo que ya está pagado y sin cobrar.** No hay que inventar casi nada:

- El **recibo de publicación** con `sha256`, tamaño y hojas, inmutable y
  server-managed, con su `409` de CAS y su evento de dominio. Es la prueba de
  **qué** se entregó; hoy **no tiene los bytes al lado**.
- El **mecanismo de enlace server-owned entero**: hash, caducidad, revocación,
  aislamiento por organización, **token en el fragmento** (no en la ruta, no en
  los logs), `403 review_read_only` fuera de su superficie. **No hay que
  diseñarlo: hay que reusarlo.**
- El **manifiesto de pérdidas**, que la casa ya obliga a que viaje con el
  documento, con el DXF y con la publicación por lotes.
- Un **codificador de QR propio y probado**, con su oráculo y su round-trip, hoy
  usado sólo para el alta de MFA. **El enlace de la lámina impreso como QR en el
  cajetín es el plano de papel de la obra apuntando a su versión viva**, y no
  cuesta una dependencia nueva.
- La **presencia con cursor y encuadre** y la **llamada con política ICE y TURN
  declarado**: sólo necesitan que el invitado tenga transporte.
- El **puerto de blob store desacoplado**, ya conseguido en la rúbrica; falta el
  adaptador.

**Lo que falta**, en el orden en que cada uno abarata al siguiente: los bytes y
el enlace → el invitado existe y se le ve → el enlace apunta a **un punto**, no a
un documento → con la pestaña cerrada, avisa → y para que avise en un iPhone, se
instala. **T-43.**

**Y la rebanada que es gratis y sale esta semana.** `/demo` **ya abre el DXF del
propio visitante**: `DXFIN` está en el registro y su implementación **no toca la
red** —el fichero entra por el canal de interfaz, no por HTTP—, y `/demo` monta el
mismo estudio con el puerto sin red. Un visitante anónimo teclea `DXFIN` y ve
**su** plano en diez segundos, sin cuenta, sin instalar y sin subir nada a ningún
servidor. **Eso responde la pregunta que decide toda evaluación de CAD —«¿abre
bien MI archivo?»— y es la más difícil de contestar que tiene este mercado.** No
lo dice el titular del héroe, ni el metadata de `/demo`, ni el banner. **Es un
hueco de promesa, no de capacidad: falta el renglón, y una prueba que lo
defienda.**

**La frase de venta, que es lo que decide un cambio de suscripción:**

> En AutoCAD entrego un PDF por correo y a los tres días nadie sabe si el que
> tiene el maestro de obra es el bueno. En Valle Design entrego una dirección: el
> cliente la abre en su teléfono sin instalar nada, la lámina dice de qué versión
> es y qué se perdió al exportarla, yo veo su cursor sobre el eje que no entiende
> y se lo explico por la llamada que ya está dentro del plano — y el día que
> caduque, caduca.

## 6.3 · Apuesta 2 · «Apaga el portátil sin guardar. Dime qué perdiste.»

> Y la respuesta, **medida y publicada**, es: diecisiete segundos como máximo.

**Por qué AutoCAD no puede.** Tiene treinta años de fallos aprendidos y aun así,
cuando a un arquitecto se le va la luz, lo que le espera al volver es el
**Administrador de Recuperación de Dibujos**: una lista de ficheros `.sv$` con
nombres de máquina, horas y una pregunta que nadie sabe contestar del todo. Es
mejor que nada y **es la vara que la industria acepta**. §6.1·3 explica por qué
nadie del escritorio publica su ventana de pérdida: no la tiene.

**Lo que ya está pagado y sin cobrar.** La parte difícil está hecha, y es lo mejor
construido del repositorio: **CAS atómico de verdad** (`UPDATE … WHERE version =
?`, no un leer-y-escribir); **diario de recuperación con carril por pestaña** en
`sessionStorage`, códec gzip fuera del hilo, **SHA-256 verificado al leer** y
triple poda por edad, carril y global; **`gunzipBounded`**, que corta la bomba de
gzip mientras descomprime; el guardián de `webglcontextlost` **con su
`preventDefault()`** —la línea que todo el mundo olvida y sin la cual no hay
restauración posible—; una **matriz ejecutable de 34 flujos sin red** (7
funcionan, 4 degradan, 23 exigen backend); y la ventana de pérdida **medida y
publicada: 16,9 s**.

Y encima: `apps/web/e2e/real/errores-en-espanol.spec.ts` **provoca de verdad**
—contra la API real y PostgreSQL, en CI, con `E2E_REAL_API: "1"`— las cinco
desgracias del día de un arquitecto, y afirma sobre cada una **tres** cosas: que
hay mensaje, que el mensaje es humano, y **que hay salida**. Esa tercera aserción,
escrita como código ejecutable, es más disciplina de degradación de la que tiene
la mayoría del software que ya factura.

**Lo que falta no es más motor: es que el producto no se contradiga a sí mismo
cuando falla.** Cuatro frases, y las cuatro se dicen en veinte segundos:

- Que **no invite a reintentar lo imposible** (un `400` permanente sale hoy por
  la rama del `500` pasajero).
- Que **no apague el botón Deshacer sin decir por qué** (promete 80 pasos y
  entrega 3 a 20 000 entidades y 1 a partir de 50 000, en silencio).
- Que **no deje que un dígito de más convierta un plano en un archivo que ya no
  se puede guardar** (`ARRAY 500×500`).
- Que **no ponga el mensaje mejor escrito del producto en un tooltip de 11
  píxeles**.

**T-24 y T-75. De una a tres semanas.**

## 6.4 · Apuesta 3 · Cuando dejas de pagar, tus planos siguen siendo tuyos

> Cuando el período termina, la cuenta pasa a **sólo lectura** y el usuario sigue
> **abriendo, imprimiendo y exportando** sus planos. Está escrito en `/terms`
> como **obligación del servicio, no cortesía revocable**, y probado en
> `apps/api/src/modules/auth/guards/entitlement-read-only.pg.spec.ts`.

**Por qué AutoCAD no puede.** No es que no pueda: es que **no quiere**. Autodesk
te bloquea, y ése es el miedo que decide una firma. **El producto ya es mejor que
Autodesk en la cosa que más miedo da al firmar**, y esa frase, dicha delante de
un socio director, vale más que tres filas de rúbrica.

**Y hoy está enterrada, y peor: incumplida en la letra pequeña.** Tres cosas hay
que hacer para poder decirla:

1. **La puerta de salida entrega hoy un DXF R12 mutilado y sin manifiesto**, con
   rectángulos inventados, capas recortadas a 31 caracteres y texto a 240, **sin
   aviso** — y es exactamente el endpoint que el SDK anuncia como la regla de oro
   («los datos del usuario nunca quedan rehenes de un cobro»). **T-11.** Mientras
   eso siga así, la promesa se cumple en la forma y se rompe en el fondo.
2. **No existe exportación completa de la organización ni borrado de cuenta**, que
   además es el derecho ARCO. **T-62.**
3. **No hay material de venta.** No está en la portada, no está en el FAQ, no está
   en ningún sitio donde un comprador lo lea antes de firmar.

**Coste: días, no semanas.** Y es la única de las tres apuestas cuyo obstáculo
principal no es técnico.

## 6.5 · Lo que estas apuestas NO son, dicho para que nadie lo lea de más

- **No es co-edición simultánea.** El guardado sigue siendo **cola de un escritor
  con CAS y `409`**, que es la decisión correcta para un CAD y está probada. Un
  CAD que fusiona geometría a espaldas del dibujante pierde la confianza que estas
  tres apuestas construyen.
- **No es BIM.** Modelar volúmenes no lo convierte en BIM: `bim-claim-boundary.spec.ts`
  sigue en pie.
- **No es IA.** `no-ai-boundary.spec.ts` comprueba que ningún comando ni alias la
  anuncie y que los nueve módulos retirados sigan fuera de `git ls-files`.
  **Proponer una función de IA aquí es pedir que se relaje un gate.** La
  consecuencia hay que asumirla con los ojos abiertos: **la única palabra que el
  mercado usa hoy para vender está deliberadamente vacía, lo que sube el precio de
  las otras.** Estas tres apuestas son ese precio, pagado.

## 6.6 · Y el hueco que hay que cerrar antes que las tres

**Ninguna de las tres tiene dónde puntuar.** Ni la rúbrica, ni `ESCALERA.md`, ni
`BACKLOG.md` tienen una casilla para el enlace de entrega, para la degradación
honesta ni para la salida del cliente. **Mientras eso siga así, cerrar cualquiera
de las tres BAJA el rendimiento aparente de quien lo haga, porque no mueve la
cifra.**

Ése es el hueco que va primero, y **se cierra escribiendo filas, no código**:
**T-02**, medio día.

---

# 7 · CÓMO SE CIERRA

## 7.1 · El resumen de la cola, en una tabla

| Ola | Qué consigue | Tareas | Días |
|---|---|---|---:|
| **0** | El andamio: espacio en el monolito, pruebas graduadas, filas abiertas, evidencia en marcha | T-00 … T-03 | 0,5 + F10 continuo |
| **1** | **Ninguna afirmación falsa viva.** Fix-or-hide en todo el producto | T-10 … T-19 | 3-4 |
| **2** | Un arquitecto puede **dibujar** el día entero | T-20 … T-25 | 4-5 |
| **3** | Un arquitecto puede **entregar**: PDF, DXF, láminas, cortes y alzados | T-30 … T-36 | 5-6 |
| **4** | Un arquitecto puede **trabajar con otros** y con su cliente | T-40 … T-43 | 4-5 |
| **5** | El 3D **sale del navegador** y se puede designar y transformar | T-50 … T-53 | 5-7 |
| **6** | Un despacho puede **comprar, entrar, crecer y salir** | T-60 … T-64 | 4-5 |
| **7** | Cimientos y piel: rendimiento, backend, deuda, accesibilidad, cinta, fallos | T-70 … T-75 | 5-6 |

**Si hay que recortar, se recorta la Ola 5.** Nunca la 1, nunca la 7.

## 7.2 · Lo que se escribe al terminar, y lo que no

- **Un `docs/execution/INFORME_CAMPANA_<NOMBRE>_<FECHA>.md`** con: las cifras
  antes y después **enlazadas al guion, no copiadas**; frente por frente lo que
  entregó y lo que quedó **parcial, con su motivo**; los umbrales que **no** se
  relajaron; los goldens anteriores que cazaron regresiones propias; **las
  correcciones a afirmaciones propias, incluidas las del coordinador**; lo que
  queda «todavía no» con su peldaño; y **lo que sólo el titular puede hacer**.
- **La bitácora de campaña se archiva** a `docs/history/execution/` **en el mismo
  commit** que publica el informe. El `INFORME_*` **no** se archiva.
- **`ESCALERA.md` actualizado** con cada capacidad tocada, su peldaño nuevo y su
  fecha.
- **`BACKLOG.md`** con todo lo que se decidió no hacer, y **por qué**.
- **Nada de cifras a mano.** `node scripts/cad/rubric.mjs` computa; los documentos
  **enlazan**.

## 7.3 · Lo que sólo el titular puede hacer, y no se inventa

Al cerrar, esta lista va **al final del informe y sin diluir**:

1. **Firmar la familia moderna de DWG** (AC1024/27/32) —hoy `ownerSigned: false`,
   y es la que AutoCAD 2018-2026 guarda por defecto, o sea lo que manda el
   estructurista—, cerrar el dictamen jurídico (`pending_parallel`) y encender la
   variable en un despliegue. **Las banderas siguen en `false` hasta entonces.**
2. **Firmar los derechos del corpus de terceros.** El dictamen automático está
   completo: licencia descargada, identificada y hasheada. **Falta la firma
   humana y bloquea 2 puntos.**
3. **Correr una GPU real.** `node scripts/perf/slo-navegador.mjs` está escrito
   para que lo corra él: comprueba, mide, publica y **se niega** si el rasterizador
   es software, como pasa en este contenedor.
4. **Poner el producto delante de usuarios.** **Seis filas de la rúbrica no las
   cierra ningún fichero: piden a alguien trabajando. Cero personas han usado
   esto.** Es el único camino al peldaño 7 y ninguna sesión puede recorrerlo.
5. **Decidir el alcance de IFC**, y si `PIDCLASH`, `PIDSOLID` y `MEPRISER`
   merecen órdenes propias en la cinta. **Las dos preguntas quedaron sin respuesta
   a propósito y no se contestan solas.**
6. **Contratar el PAC** para que «Factura CFDI» pueda decirse, y arrancar en
   paralelo desde el primer día lo que no es ingeniería —razón social, dominio,
   correos propios, abogado—: **es el camino crítico más largo y no lo acelera
   nadie del equipo.**

## 7.4 · La única frase con la que se mide esta campaña

> **Un arquitecto que no conocemos abre Valle Design el lunes, dibuja su trabajo
> del día entero, lo entrega, y no se encuentra ni una sola cosa que el producto
> le dijo que hacía y no hace.**

Todo lo demás —los 244 puntos, las 36 filas, las 624 specs, los 105 goldens— es
la manera de comprobar que esa frase es cierta. **No al revés.**
