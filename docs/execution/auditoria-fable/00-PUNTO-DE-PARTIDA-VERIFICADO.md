# Punto de partida, verificado a mano el 2026-09-05

Este documento existe para una sola cosa: **que la sesión de Fable no gaste ni un
crédito redescubriendo lo que ya está comprobado.** Todo lo de aquí lo verifiqué
ejecutando o leyendo el árbol en `main` a la altura de `b9c1ef5`, no leyendo informes.

Si algo de aquí contradice a otro documento del repo, gana esto: es lo más reciente.

---

## 1. Dónde está el producto hoy

| | |
|---|---:|
| Rúbrica competitiva contra AutoCAD 2027 | **244/271 (90.0 %)** |
| Alcance de HOY (dibujo 2D técnico, la cifra de cliente) | **185/197 (93.9 %)** |
| Puntos con evidencia INDEPENDIENTE | **28** |
| Filas en su tope | **11 de 36** |
| Filas que retienen 1 pt por falta de testigo ajeno | **20** |
| Specs de `apps/web` | **624/624 verdes** |
| Casos numéricos contra oráculo independiente | **5 427, 0 desviaciones** |
| Comandos | **294, 0 éxitos falsos, 294/294 alcanzables con el ratón** |

Las cuatro fases de la campaña «Superar a AutoCAD completo» están en `main`:
`5c2cc87` (ventanas 1 y 2), `d0493e3` (ventana 3), `b9c1ef5` (fase 4).

**Cómo reproducirlo:** `node scripts/cad/rubric.mjs`.

---

## 2. Los cuatro P0 de comercialización de agosto: LOS CUATRO ESTÁN CERRADOS

`docs/history/execution/paid-beta-readiness-2026-08.md` levantó cuatro defectos que
impedían cobrar. **Verifiqué los cuatro hoy, en el código, uno por uno.** No los
vuelvas a auditar:

| | Qué era | Estado hoy |
|---|---|---|
| **P0-A** | Un owner de la organización cliente podía confirmar su propio upgrade-intent y activar la suscripción **sin evidencia de pago real** | **CERRADO.** `confirmUpgradeIntent` en `commercial.controller.ts:330` devuelve `never` y lanza `ForbiddenException` con código `assisted_checkout_confirmation_retired`. La ruta está retirada. |
| **P0-B** | `design.cad` se concedía a cualquier suscripción `active` **sin comparar `currentPeriodEnd`**: una suscripción vencida seguía funcionando | **CERRADO.** `postgres.adapters.ts:148` compara `subscription.currentPeriodEnd > :now` para `active` y `trialEndsAt > :now` para `trialing`. |
| **P0-C** | RLS cubría 8 tablas pero **no `design_blobs`** —los bytes del plano— y la app corría como el rol dueño de la migración, así que **ninguna política RLS aplicaba en runtime** | **CERRADO.** `20260823120000-TenantRuntimeRoleAndDesignBlobsRls.ts` pone `design_blobs` bajo RLS y crea el rol no-dueño `valle_app`, con su spec de Postgres al lado (`.pg.spec.ts`) que verifica la precondición y el resultado. |
| **P0-D** | El `Dockerfile` de web no copiaba `apps/web/public` → el kernel WASM y los logos daban 404 en producción | **CERRADO.** `apps/web/Dockerfile:207` copia `public`. |

**Consecuencia para la cola:** la pregunta «¿esto se puede cobrar?» ya no se responde
en el backend comercial ni en el aislamiento de inquilinos. Se responde en el
PRODUCTO, y ahí es donde está la sección 3.

---

## 3. LA COLA YA ESTABA ESCRITA: `apps/web/e2e/auditoria/`

**Éste es el hallazgo que más crédito ahorra de todo el documento.**

El repo tiene 28 pruebas de Playwright **rojas a propósito**, de una auditoría de
cliente final del 2026-09-01. Cada una reproduce **en el navegador, contra el estudio
real**, un defecto confirmado. No entran en la suite (`playwright.config.ts` las excluye
con `testIgnore`) porque un veredicto siempre rojo deja de mirarse.

La disciplina que las rodea ya existe y hay que respetarla:

- `e2e/auditoria/manifiesto.json` declara cada spec con **qué defecto reproduce** y su
  **impacto**. El campo `techo` vale 28 y **SÓLO BAJA**.
- `scripts/cad/check-auditoria-manifest.mjs` es el gate que lo exige.
- Cuando un defecto se arregla, **su prueba no se borra: se GRADÚA** a `e2e/golden/` y
  pasa a defender el arreglo. Bajar el techo es el acto de graduar.

**Esto le da a Fable una cola con criterio de terminación por tarea, que es justo lo que
una sesión que no puede preguntar necesita.** Cada tarea es: pon verde esta prueba,
gradúala, baja el techo.

### El reparto por impacto

| Impacto | Cuántas |
|---|---:|
| `bloquea_el_trabajo` | **2** |
| `molesta_mucho` | **15** |
| `molesta_poco` | **8** |
| `arnes` (no reproducen defecto; guardan lo que sí funciona) | 3 |

### Los dos que bloquean el trabajo, y son el mismo defecto

- **`tresd.spec.ts`** — Con el SCU apoyado en la fachada, una línea de dos clics **se va
  al suelo sin decir nada**: el primer punto sale en el centro de la huella del suelo, ni
  siquiera sobre el sólido. Y **no se puede dibujar un rectángulo en la fachada**: sólo
  `LINE` se declara espacial.
- **`refutacion-scu-raton.spec.ts`** — La contraprueba aislada: el punto del ratón bajo un
  SCU inclinado sale del plano del suelo y no del plano de trabajo.

**Diagnóstico:** no es un hueco de funciones, es que **el 3D no se puede usar para
dibujar**. Un ingeniero que apoya el SCU en una cara y traza no obtiene lo que trazó.
Esto es lo primero de la cola, y de largo.

### Los quince que molestan mucho

Varios son de los que hacen devolver un producto:

- **`imprimir.spec.ts`** — «PLOT → Extensión → Trazar», la forma normal de sacar un
  dibujo en AutoCAD, **no traza nunca**. (Con su contraprueba aislada,
  `refutacion-plot-extension.spec.ts`.)
- **`capas.spec.ts`** — El estándar de capas sobrevive a guardar y recargar, pero **ningún
  tipo de línea se dibuja ni se imprime**: un plano no distingue un eje de un muro.
- **`acotar.spec.ts`** — Acotas un tabique dibujado con polilínea, lo mueves, y la cota se
  queda **acotando el aire, y sigue diciendo 4.000 con la misma pinta de estar viva**.
- **`modificar.spec.ts`** + **`refutacion-pinzamiento.spec.ts`** + **`refutacion-trim.spec.ts`**
  — El clic con el que se designa **se lo come el pinzamiento**, y eso rompe OFFSET y TRIM.
- **`intercambio.spec.ts`** + **`refutacion-texto-capa.spec.ts`** + **`refutacion-notas-solo-text.spec.ts`**
  — Los rótulos TEXT llegan al otro despacho en una capa «Text» que nadie creó, en vez de
  en su capa NOTAS, y el cuadro de exportar **promete una capa que el fichero no lleva**.
- **`refutacion-mis-bloques.spec.ts`** — El botón «Mis bloques» **está muerto**.
- **`refutacion-cara-visible.spec.ts`** — La cara que se mira no está pintada y designarla
  no la resalta: **no se ve qué cara se va a empujar**.
- **`refutacion-escala-bloqueada.spec.ts`** — En una hoja recién creada el desplegable de
  escala **nace apagado y nada explica por qué**.
- **`refutacion-cmdk-silla.spec.ts`** + **`refutacion-panel-bloques-designar.spec.ts`** —
  Buscar «silla» ofrece algo que no es el bloque de la biblioteca del despacho.

### Cómo se corren (verificado hoy)

```
cd apps/web
rm -rf .next
NEXT_PUBLIC_API_URL=http://localhost:4000 npx turbo run build --filter=web --force
E2E_PROD=1 E2E_AUDITORIA=1 E2E_API_ORIGIN=http://localhost:4000 \
  npx playwright test e2e/auditoria --project=chromium --reporter=line --workers=1
```

Son **59 casos** en 28 ficheros. Tardan; van en segundo plano.

**Trampa que me costó veinte minutos y que no tienes que repetir:** si matas un
`next build` a media escritura, `.next` queda corrupto **y no se nota** — turbo sirve el
resto de la caché y el build siguiente parece bueno, pero `next start` muere con
`ENOENT: prerender-manifest.json`. Si el servidor no arranca: `rm -rf .next` y
reconstruye con `--force`.

---

## 4. Las 14 filas de la rúbrica que se desbloquean con trabajo mecánico

`docs/cad/evidence/independencia-por-fila.json` es un censo **generado, no escrito a
mano**: sale de `scoreRubric()` sobre el árbol de hoy. Dice que 20 filas retienen 1 punto
por no tener testigo ajeno, y clasifica el motivo:

| Motivo | Filas | ¿Alcanzable? |
|---|---:|---|
| `el_corpus_de_hoy_no_lo_alcanza` | **14** | **Sí.** Cada una nombra el oráculo exacto que la desbloquea, y PyPI, npm y crates.io responden desde este contenedor. |
| `no_lo_sirve_material_ajeno` | 6 | No. Piden **un usuario real**; ningún fichero de terceros las atestigua. |
| `bloqueado_por_defecto_medido` | **0** | La fase 4 vació esta categoría. |

**Las 14, con su oráculo ya elegido por el censo** (no hay que investigar cuál):

| Fila | Oráculo que la desbloquea |
|---|---|
| Layouts, viewports y publicación | `pypdf`, `pdfminer.six` o `mutool` leyendo los bytes publicados y midiendo la escala |
| Nubes de puntos, raster y GIS | **`pyproj`** (envuelve PROJ, la referencia del mundo GIS) sobre el mismo juego de puntos |
| Toolset Map 3D | **El mismo `pyproj`** — un solo trabajo sirve para las dos filas |
| API y SDK | `openapi-spec-validator` (PyPI) o Spectral/Redocly (npm) sobre `design-api.v1.yaml` |
| Eventos e integración | HMAC de la librería estándar de Python verificando `X-Valle-Signature` |
| Almacenamiento de objetos | **MinIO** real (imagen pública) juzgando nuestro cliente S3 |
| Kernel Rust/WASM | `mpmath` (precisión arbitraria) emitiendo los valores de referencia |
| Importación de JSON canónico | Un fuzzer ajeno: `radamsa`, `atheris` o `hypothesis` |
| Toolset Raster Design | Un plano escaneado de dominio público (HABS/HAER de la Library of Congress) con geometría conocida |
| Toolset Electrical | Anclar cada límite a su artículo de la **NOM-001-SEDE** publicada en el DOF (cita y fecha, nunca copia del texto) |
| Toolset Mechanical | Banco de tornillería libre equivalente (el texto de ISO/DIN es de pago y **no se redistribuye**) |
| Línea de comandos y alias | Un tercero libre que publique la tabla de alias (LibreCAD, BricsCAD). **`acad.pgp` es de Autodesk: no se redistribuye.** |
| MLEADER y tablas | Primero la CAPACIDAD (importar LEADER), y sólo después el testigo |
| Xrefs | Un conjunto ajeno completo —el dibujo y sus referencias—; **no existe donante todavía** |

**El más barato y más sólido de los catorce, según el propio censo: `pyproj`.** Y sirve
para dos filas.

**Regenerar el censo:** `cd apps/web && VALLE_ESCRIBIR_CENSO=1 npx tsx src/lib/cad/verification/independencia-rubrica.spec.ts`

---

## 5. La disciplina ya está escrita en la casa. No la inventes: cítala.

`docs/history/execution/CAMPANA_LANZAMIENTO_20260827.md` ya trae, palabra por palabra,
lo que una sesión larga y sin preguntas necesita:

**LA VARA** — «Un arquitecto que no conocemos, en una computadora que no controlamos,
dibuja una planta, la acota, la imprime a PDF, la exporta a DXF, y **los tres archivos
dicen la verdad**. Lo que no aguante esa vara se arregla; lo que no se pueda arreglar
hoy, se oculta.»

**FIX-OR-HIDE** — tres puertas y sólo tres: VERIFICADA (funciona con evidencia
numérica), ARREGLADA (tenía defecto, se corrigió, hay evidencia nueva), OCULTA (no se
pudo verificar ni arreglar hoy: desaparece de la superficie hasta ganar su evidencia, con
entrada en el backlog). **Prohibido el cuarto estado: visible y no verificada.**

**REGLAS DE NO-DETENCIÓN**, tal cual están:
1. Nunca preguntar. Decidir lo más conservador, bitácora, seguir.
2. Ítem bloqueado > 25 min → bitácora + backlog + siguiente.
3. La bitácora se actualiza al cerrar cada ítem. Si el contexto se compacta, se relee primero.
4. Tras cada ola: suite completa + goldens con árbol quieto + push.
5. Prohibido: relajar gates, tocar identificadores persistidos (`IDENTITY.md` / ADR-0010),
   renombrar `data-testid`.

**UNA SALVEDAD, y hay que decirla porque es una contradicción real:** aquella campaña
añadía a la regla 5 «prohibido agregar funciones nuevas», porque era un barrido
funcional, no una construcción. **La sesión de Fable SÍ construye.** Las otras cuatro
prohibiciones siguen enteras; ésa no aplica.

---

## 6. Trampas operativas, todas medidas en este proyecto

No son consejos: cada una costó tiempo real aquí.

- **El código de salida real.** Nunca `gate | tail` encadenado con `&&`: el pipe devuelve
  el código de `tail` y eso ya coló un commit con `check:cad` en rojo. Redirige a fichero
  y lee `$?`.
- **Node 20** (`/opt/node20/bin`) para lint, typecheck y gates de scripts. **Node 22** para
  `npm test`. Bajo el 20, `better-sqlite3` da **124 fallos FALSOS** de la API.
- **El lint corta ANTES que E2E**: un error de lint esconde el estado real de las pruebas.
- **Nunca correr `npm test` de `apps/api` directamente**: agota la memoria y tumba el
  contenedor.
- **No competir por CPU.** Ocho tareas de turbo sobre cuatro núcleos ya produjo un rojo
  falso que costó una hora. Antes de creerte un rojo, **reejecuta ESE spec en aislamiento**.
- **`check:cad` quiere `VALLE_DWG_CORPUS_MIRROR` con una RUTA** a un clon del repositorio
  de conformidad (aquí: `/home/user/valle-design-dwg-conformance`), **no un `1`**. Sin
  espejo falla `check:dwg-evidence` por un desajuste conocido CI-vs-local que **no es una
  regresión** — está documentado en `paid-beta-readiness-2026-08.md`.
- **`main` usa squash.** Una rama vieja puede no ser ancestro suyo: se aplican diffs, no se
  fusionan ramas antiguas.
- **Un build a medias no se nota.** Ver §3.
- **No se retira el andamio hasta que el último agente dijo que terminó.** Borrar los
  árboles de trabajo mientras un frente cerraba ya dejó un entregable colgando en el
  almacén de objetos, rescatado por los pelos.

---

## 7. Lo que esta campaña aprendió y no se puede perder

Tres lecciones que costaron caro y que ordenan cómo se verifica aquí:

1. **Un acuerdo entre dos medidas equivocadas por el mismo sitio no es un acuerdo.** La
   matriz de fidelidad comparaba MTEXT y HATCH contra el oráculo y los números cuadraban
   —porque el lector contaba el fichero entero y el censo se leía de `archivoEntero`, que
   incluye `*Model_Space` y los bloques que nadie inserta—. Se detectó **arreglando uno de
   los dos lados**, no mirándolos.
2. **Aplicar una petición no es ejecutarla: es volver a medir lo que afirma.** Dos
   peticiones escritas con rigor traían un dato mal: los índices ACI del corpus eran
   catorce y no doce, y `floorplan.dxf` sí trae HATCH dentro de bloques.
3. **Cuando un gate te para a ti, tiene razón.** Dar ámbito a los escaneos crudos
   introdujo cinco pérdidas silenciosas nuevas; el techo del corpus ajeno es cero y las
   cazó en la primera corrida. Se emitió el aviso que faltaba; **el techo no se tocó**.
