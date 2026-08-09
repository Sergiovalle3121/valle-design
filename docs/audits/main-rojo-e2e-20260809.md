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

## 6. Cuarta observación, NO confirmada: «Web specs (tsx)»

Se ha reportado que ese job cayó al menos una vez sobre una rama cuyo único
cambio era Markdown, mientras `npm run test:specs` daba 230/230 en local. No se
ha reproducido ni se ha localizado la corrida, así que **no se toca**:
`apps/web/scripts/run-specs.mjs` da 120 s por spec y el más lento del repo baja
de 20 s, de modo que un timeout exigiría una degradación severa del runner.
Queda anotado como pista, explícitamente separado del fallo del E2E para que
nadie los confunda.

## 7. Reparto

- §3 se arregla en `e2e/fixtures/dynamic-input.ts` y en los dos goldens: es
  territorio de pruebas, sin dueño en el reparto de las diez sesiones.
- §4 y §5 se arreglan en `.github/workflows/ci.yml`, que tampoco tiene dueño.
- **No se toca código de producto.** La carrera es real en el producto —un
  botón deshabilitado que se come un click es un defecto de usabilidad menor—
  pero cerrarla de verdad exige tocar `CadDynamicInput`/`CadBlockPalette`
  (T1/T2) y no hace falta para poner `main` en verde.
