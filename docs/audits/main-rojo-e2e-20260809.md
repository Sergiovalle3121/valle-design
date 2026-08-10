# `main` en rojo — diagnóstico del E2E, 9 de agosto de 2026

Auditoría del job **«E2E Playwright (PostgreSQL · Chromium + Firefox)»**, paso
«Playwright E2E (goldens + performance + full-stack real)», sobre la serie de
fusiones del 9 de agosto. Los otros tres jobs (Contrato, Gitleaks, SBOM) pasan
en todas las corridas examinadas.

## 1. La serie completa, y lo que realmente dice

| Commit | PR | Veredicto | Test que cae | Navegador |
| --- | --- | --- | --- | --- |
| `8be49a55` | #59 esquema 4 | **falla** | `18-cad-professional-blocks.spec.ts:59` | firefox |
| `b2fd6773` | #60 paletas | verde | — | — |
| `ea5a5d6b` | #58 paramétricas | **falla** | `33-cad-canonical-transaction.spec.ts:190` · paso «Circle» | **chromium** |
| `bfbd26b9` | #62 render | cancelada | — | — |
| `29cd42a7` | #57 autolisp | **falla** | `33-cad-canonical-transaction.spec.ts:190` · paso «REDO» | firefox |
| `ccffc17c` | #61 modificación | cancelada | — | — |
| `9abe5287` | #56 brep | cancelada | — | — |
| `99e867d3` | #54 reflexión | cancelada | — | — |
| `792c0603` | #55 docs | cancelada | — | — |

Las tres corridas rojas fallan con **un solo test caído** y 155–167 pasando.

## 2. ¿Lo introdujo #59? No.

Es la pregunta que había que responder primero, y la respuesta está en la
tabla: **dos de los tres fallos son ANTERIORES a #59** (`29cd42a7` y `ea5a5d6b`
preceden a `8be49a55`), y caen en un spec DISTINTO al que cae en #59.

- #57 y #58 caen en el golden 33.
- #59 cae en el golden 18.
- Dentro del propio golden 33, #57 y #58 caen en **pasos distintos** («REDO» vs
  «Circle») y en **navegadores distintos** (firefox vs chromium).

Que #60 pasara justo antes de #59 no acota nada: la población es tres fallos y
un verde, cada fallo en una coordenada diferente. Un fallo determinista
introducido por un squash concreto cae siempre en el mismo sitio. Éste no.

**Conclusión: no hay regresión de producto. `main` está rojo por un fallo
intermitente que se ejecuta con `retries: 0`.**

## 3. La mecánica del intermitente

Los dos síntomas son la misma avería vista desde dos sitios:

- Golden 33: `cad-native-document-count` se queda en `Native 0` cuando debía
  decir `Native 1` — la figura nunca se creó.
- Golden 18: `cad-native-properties` no existe — la instancia nunca se insertó.

En ambos casos **no hay error**: la operación simplemente no ocurrió.

La causa es una carrera que `e2e/fixtures/dynamic-input.ts` ya persigue desde
#36 pero que no llega a cerrar, y el propio fixture lo dice:

> El hueco pasa de "cualquier instante tras el relleno" a los pocos
> milisegundos entre la última comprobación y el click.

Ese hueco residual es mortal porque **los botones de confirmación están
deshabilitados cuando el formulario no valida**:

- `CadDynamicInput`: `<button type="submit" disabled={!result.ok}>Aplicar</button>`
- `CadBlockPalette`: `<button data-testid="cad-block-insert" disabled={!selectedDefinition}>`

Playwright comprueba que el botón está habilitado y **después** despacha el
click. Si entre la comprobación y el despacho el componente se re-renderiza y
el botón queda deshabilitado, el navegador **ignora el click sin ruido**:
Playwright no falla —despachó un evento real— y el producto no ejecuta nada.
El test sigue adelante y muere varios pasos más tarde, en una aserción que ya
no tiene nada que ver con lo que se rompió.

El fixture reintenta la PRECONDICIÓN (que los campos sostengan su valor) pero
**nunca comprueba la POSTCONDICIÓN** (que el click surtiera efecto). Ésa es la
pieza que falta.

### Lo que NO se ha conseguido demostrar, y conviene decirlo

El mecanismo de arriba es una hipótesis coherente con los tres síntomas, **pero
no está reproducido**. Se intentaron dos vías, las dos en chromium (firefox no
se puede descargar tras el proxy del entorno, y dos de los tres fallos de CI
son de firefox):

- **Soak bajo contención**: goldens 18 y 33 repetidos con los cuatro núcleos
  saturados, `workers=1`, modo producción. **5 iteraciones, 30 tests, 0
  fallos.**
- **Carrera forzada por CDP**: `Emulation.setCPUThrottlingRate` a 20×, seis
  rondas de LINE por entrada dinámica, sin el arreglo puesto. **6/6 crearon la
  entidad.** Estrangular la CPU ralentiza por igual al re-montaje y a la
  prueba, así que la ventana de quietud de 150 ms sigue atrapándolo.

Conclusión honesta: **el intermitente es real y está acotado, pero su mecanismo
exacto sigue sin probarse.** Lo que se ha hecho es (a) cerrar el hueco lógico
que sí es demostrable por lectura —volver de `applyDynamicInput` con un
re-montaje en vuelo— y (b) hacer que el fallo, si vuelve, sea **ruidoso y
localizado** en vez de silencioso y a tres pasos de distancia. Y sobre todo,
(c) arreglar que el artefacto con la traza se suba: la próxima vez que ocurra
habrá evidencia directa en vez de otra reconstrucción desde los logs.

## 4. Segunda avería, independiente: nadie podía ver el informe

Las tres corridas rojas terminan con:

```
##[warning]No files were found with the provided path: apps/web/e2e/.report.
No artifacts will be uploaded.
```

`e2e/.report` y `e2e/.test-results` empiezan por punto, y
`actions/upload-artifact@v4` **excluye los ficheros ocultos por defecto**. El
informe HTML y las trazas se generan y se tiran a la basura justo en el único
caso en que sirven para algo. Por eso este diagnóstico ha tenido que
reconstruirse desde los logs del job en vez de desde el artefacto.

## 5. Tercera avería, independiente: `main` cancelaba su propio CI

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

Todas las fusiones a `main` comparten el ref `refs/heads/main`, así que **cada
fusión mataba la corrida de la fusión anterior**. Cinco commits consecutivos
—`792c0603`, `99e867d3`, `9abe5287`, `ccffc17c`, `bfbd26b9`— terminaron en
«cancelled» y nunca tuvieron veredicto.

Ésta es la razón de fondo de que `main` se quedara rojo sin que nadie lo
notara: con diez sesiones fusionando en cadena, la mayoría de los commits de
`main` nunca llegaban a decir si estaban sanos. No es que se ignorara la
alarma; es que la alarma se apagaba sola.

## 6. Cuarta avería, REPRODUCIDA: «Web specs (tsx)»

Se había reportado que ese job cayó sobre una rama cuyo único cambio era
Markdown, con 230/230 en local. **Ha vuelto a pasar, en este mismo PR**, cuya
única aportación en ese momento eran un documento y el workflow: la corrida
`31331144931` dio 229/230 con

```
❌ src/lib/cad/render/render-benchmark.spec.ts
```

No es un timeout ni un spec silencioso: es una **comparación de reloj de pared**
entre dos pipelines de render.

```ts
assert.ok(next.panFrameP95Ms < legacy.panFrameP95Ms, …);
assert.ok(next.panFrameMaxMs < legacy.panFrameMaxMs, …);
```

Reproducido en local sin tocar nada: **2 de cada 10 corridas fallan**, siempre
la del p95, con cifras como «nuevo 15.589 ms frente a 9.35 ms del anterior»
cuando lo normal es «5.4 frente a 9.1».

La razón es aritmética. El ruido de planificación es ABSOLUTO —una pausa de GC
cuesta lo mismo a los dos caminos— pero el coste real no lo es: el nuevo ronda
5-7 ms por cuadro y el anterior 9. Un hipo de 5 ms apenas mueve al anterior y
DUPLICA al nuevo. Encima el «p95» se calcula sobre los ~8 cuadros de las ocho
paradas del paseo: con esa muestra, **un percentil 95 es literalmente el
máximo**, el estadístico más sensible al ruido que existe. El propio módulo lo
avisa en un comentario («un p95 sobre dos muestras ES el máximo») sin sacar la
consecuencia.

**Arreglo**: cada ronda mide los dos caminos seguidos sobre el MISMO guion de
ocho paradas —el escenario no se ablanda— y se exige que el nuevo gane la
mayoría de cinco paseos emparejados. Se repite la MEDIDA, nunca la aserción: si
el pipeline nuevo se volviera de verdad más caro, perdería siempre y la mayoría
no se alcanzaría.

Medido: **0/12 fallos sin carga** (antes 2/10) y **0/12 con carga moderada**
(dos de cuatro núcleos ocupados).

**Residuo declarado**: con los cuatro núcleos saturados el spec sigue cayendo
—5/12, frente a 6/12 del original—. A esa oversuscripción ninguna estadística
salva una medida de reloj de pared. El arreglo durable es sacar la comparación
temporal de un spec unitario y dejarla en `scripts/cad-render-benchmark.mts`,
que corre en condiciones controladas y ya tiene su propia puerta de CI
(`benchmark:cad:smoke`); en el spec quedarían sólo las afirmaciones
deterministas, que son las que de verdad fijan el contrato (25.000 detalladas
frente al techo de 10.000 del camino anterior, el troceado en cuadros). Eso
toca `render-benchmark.ts` y es del dueño del pipeline de render (#62), no mío.

## 7. Reparto

- §3 se arregla en `e2e/fixtures/dynamic-input.ts` y en el golden 18: es
  territorio de pruebas, sin dueño en el reparto de las diez sesiones.
- §4 y §5 se arreglan en `.github/workflows/ci.yml`, que tampoco tiene dueño.
- §6 toca `src/lib/cad/render/render-benchmark.spec.ts`, que **sí** es del área
  del pipeline de render (#62). Se ha tocado igualmente porque bloqueaba el
  merge y el cambio es acotado —sólo la parte temporal del spec, ni una línea
  de `render-benchmark.ts` ni del producto—, y se avisa aquí y en el PR para
  que esa sesión resuelva el conflicto sabiendo lo que pasó.
- **No se toca código de producto.** La carrera es real en el producto —un
  botón deshabilitado que se come un click es un defecto de usabilidad menor—
  pero cerrarla de verdad exige tocar `CadDynamicInput`/`CadBlockPalette`
  (T1/T2) y no hace falta para poner `main` en verde.

---

# Segunda ronda — lo que se vio DESPUÉS de fusionar (10 de agosto)

El PR #65 entró como `e41f12d`. Su corrida sobre `main` dejó tres cosas.

## 8. El arreglo del artefacto funciona

El paso «Upload Playwright report» pasó de avisar «No files were found» a
subir **123 ficheros, 512 MB**, informe HTML y trazas incluidas. Por primera
vez hay evidencia directa de un E2E rojo de `main` sin reconstruirla desde los
logs. Artefacto `9050785880` de la corrida `31352932559`.

## 9. Y la concurrencia también

`6419f3d` (#69) seguía en curso cuando entró `e41f12d`, y **no se canceló**.
Con la configuración anterior habría muerto, exactamente como los cinco commits
del 9 de agosto. La causa de fondo está cerrada.

## 10. `Lint web` murió de memoria, y es la prueba del §5 que faltaba

```
FATAL ERROR: Ineffective mark-compacts near heap limit
JavaScript heap out of memory     (exit 134)
```

No falló ninguna regla: **el linter se cayó**, tras 91 s de GC dando vueltas.
El límite por defecto de Node en el runner son ~2 GB y, medido sobre este
árbol, eslint necesita entre 1,5 y 2: revienta con 1024, 1280 y 1536 MB, y pasa
con 2048. El gate venía corriendo con **margen cero**.

Lo importante no es el número, es el patrón: **#69 pasó su lint, #65 pasó el
suyo, y la suma se cayó.** Es exactamente el agujero que el §11 de FASE 3
describía — dos ramas verdes por separado que nadie prueba juntas— y ha
ocurrido en la primera oportunidad que tuvo. Si hiciera falta un argumento para
exigir *Require branches to be up to date before merging*, es éste.

Se le da a eslint 4 GB explícitos en el paso de CI. Es un tope, no una cura: el
coste sale del linteo con tipos sobre un monolito de 23k líneas
(`Layout3DEditor.tsx`), y quien lo parta recuperará este margen.

## 11. El E2E de esa corrida NO es el intermitente de siempre

12 tests caídos —goldens 10, 15, 16, 17, 19, 22, 24, 46, 51, la performance de
100k y dos de firefox— y **57,1 minutos** de ejecución, cuando la misma suite
tardó 32,6 en el PR y ~25-30 históricamente. El doble de tiempo y doce caídas a
la vez no es el fallo de un test: es un runner degradado, y la mayoría de las
caídas son afirmaciones sensibles al reloj, del tipo
`expect.poll(() => backend.snapshot().version).toBe(1)` recibiendo 2 —el
autosave con debounce de 2 s disparando dentro del test porque todo va lento.

No se persigue: doce fallos con la suite al doble de lento se arreglan
volviendo a correr, no tocando doce specs. La corrida del PR que trae el §10
sirve de contraste; si ahí el E2E vuelve a salir verde, queda confirmado que
fue el runner.
