# Informe de lanzamiento — barrido funcional total

**27 de agosto de 2026** · rama `claude/valle-design-launch-campaign-yhxse6` ·
base `main` @ `9592869` (tras COMMERCIAL-RC1 y la campaña de paridad)

> Bitácora de la campaña archivada en
> `docs/history/execution/CAMPANA_LANZAMIENTO_20260827.md`.

---

## El veredicto

**GO técnico.** Todo lo que se puede verificar desde este repositorio está en
verde, con números, **y lo verifica un servidor que empieza de cero**: los cuatro
jobs de CI —contrato, build, pruebas, lint, smoke, la suite E2E en Chromium y
Firefox contra PostgreSQL, el escaneo de secretos y el arranque productivo de la
imagen— pasan sobre el SHA candidato. Costó seis intentos llegar ahí, y
«El hueco que este informe casi tiene» (§5) cuenta por qué sin adornos.

Lo que falta para que el sitio exista no es código: es la lista de §8, y ninguna
línea de ella se puede hacer desde aquí.

La vara era ésta:

> Un arquitecto que no conocemos, en una computadora que no controlamos, dibuja
> una planta, la acota, la imprime a PDF, la exporta a DXF, y **los tres
> archivos dicen la verdad**.

Se cumple, y se cumple medida. La Jornada Real ejecuta ese recorrido de punta a
punta contra Next.js + NestJS + PostgreSQL reales, sin un solo mock, y verifica
los dos archivos de la vara **por contenido**: las coordenadas del DXF (el muro
sigue midiendo 3500) y los trazos del PDF (70 mm exactos a 1:50), nunca su
forma. El tercer descargable, el GLB, se mide en su propia suite —un muro
conocido medido dentro del archivo exportado— porque no forma parte de esa
frase; §3 los recoge los tres.

---

## 1 · La regla que ordenó todo: FIX-OR-HIDE

Cada capacidad visible pasó por una de tres puertas, y sólo tres. **No queda
ninguna en el cuarto estado —visible y no verificada—**, que era la prohibición
central de esta campaña.

### 1.1 · ARREGLADAS — tenían defecto, se corrigió, hay evidencia nueva

| # | Defecto | Qué le pasaba al usuario | Evidencia |
| --- | --- | --- | --- |
| 1 | TEXT canónico ausente de la exportación DXF | Escribía una nota y no salía en el archivo que manda al cliente | `dxf-roundtrip.spec.ts` (52) · corpus de terceros 3-de-3 |
| 2 | Origen flotante contaminado por el espacio papel | Un plano georreferenciado con lámina degradaba la precisión **7 243×** | `large-coordinates.spec.ts` (13) |
| 3 | El cajetín imprimía «—» en CLIENTE, FECHA y REVISÓ | Entregaba un PDF con el cajetín a medias | `pdf-content.spec.ts` (28) |
| 4 | El selector «Papel del plano» no lo leía **nadie** | Elegía A0 y salía lo que dijera la hoja | `cables-sueltos.spec.ts` · `ui-wiring.spec.ts` |
| 5 | «imprime en A3» escribía en ese mismo estado muerto | La orden decía haber hecho algo que no hacía | idem |
| 6 | «Failed to fetch» como mensaje de error | Al caerse el wifi leía el `TypeError` del navegador, en inglés | `save-failure.spec.ts` (59) · `errores-en-espanol.spec.ts` |
| 7 | Los errores duraban 3,5 s, igual que un acuse | «Tu sesión expiró» se iba antes de poder leerla | idem |
| 8 | 33 avisos titulados «3D» | Leía «**3D** — No se pudo guardar la versión» | idem |
| 9 | El panel de atajos decía «L — Conectar flujo» | Pulsaba L para unir dos objetos y le salía un muro | `shortcuts-help.spec.ts` (67) |
| 10 | El panel callaba 20 atajos reales | `Ctrl+S`, `Ctrl+K` y las siete teclas de función, invisibles | idem |
| 11 | El estudio se encogía en silencio en un móvil | Los paneles laterales desaparecían sin explicación: parecía que el producto no los tenía | `movil.spec.ts` (8) |
| 12 | El entitlement vencido cerraba **también** abrir y exportar | Dejaba de pagar y perdía el acceso a su propio trabajo | `entitlement-read-only.pg.spec.ts` (10) |

Y un defecto **en mis propias herramientas**, que merece constar porque estuvo a
punto de dar por bueno un producto roto: el extractor de PDF nuevo se
desincronizaba con datos comprimidos y perdía en silencio 38 de 50 trazos. Se
arregló anclando en `N 0 obj` y leyendo el `/Length` de cada objeto.

### 1.2 · OCULTAS — no se pudo verificar o no procede, y desaparecen de la superficie

| Qué | Por qué | Entrada de backlog |
| --- | --- | --- |
| Selector «Papel del plano» de la barra | El control que **sí** funciona vive en el panel de layouts, por hoja, que además es la semántica correcta (un conjunto mezcla A1 con A3) | cerrado, no reaparece |
| Checkout de Stripe | Decisión del lanzamiento, no defecto. **El código no se toca ni se borra**: se apaga su visibilidad tras `NEXT_PUBLIC_LAUNCH_MODE` | reversible con una variable |
| Exportación DWG | Sigue apagada, y los candados no se tocaron. Un gate audita las 9 menciones de DWG en la superficie pública y exige el límite declarado a menos de 240 caracteres | `dwg-surface-honesty.spec.ts` |
| Copiloto IA heredado (`aiBusy`) | **Inalcanzable**: ninguna llamada lo invoca, ningún botón lo expone. No hay superficie que prometa nada, así que no hay nada que ocultar | declarado en `ui-wiring.spec.ts` con su razón |
| Paso DXF→DWG→DXF con ODA File Converter | La herramienta no está en esta máquina. **Declarado, no fingido** | queda como peldaño de evidencia |

### 1.3 · VERIFICADAS — funcionan, con evidencia numérica

* **761 casos numéricos** contra oráculo independiente, **0 desviaciones fuera
  de tolerancia**, más la frontera documento↔DWG medida donde ADR-0009 la
  permite (§2).
* **192 comandos** del registro, **0 éxitos falsos** (`check:command-integrity`).
* **82 controles visibles** del estudio pulsados uno a uno contra el stack real:
  68 con efecto medido, 5 sin efecto **declarados uno a uno con su razón**, 3
  deshabilitados con motivo. **0 muertos sin declarar.**
* Los **tres descargables**, verificados por contenido (§3).
* El **modo sin rehenes** (§4).
* El recorrido guiado: sus cuatro comandos existen en el registro real, su
  bloque de puerta existe, sale una vez y saltarlo persiste.
* El embudo sin tarjeta: **6 clics, 7 pantallas, cero campos de pago**.
* El plano de ejemplo abre en **1,6 s con 18 entidades**.

---

## 2 · La matemática

**761 casos numéricos verificados contra oráculo independiente · 0 desviaciones
fuera de tolerancia**, más la frontera documento↔DWG, que se mide en la spec del
adaptador de escritura porque ADR-0009 no permite tocar ese laboratorio desde
ninguna otra parte (ver «El hueco…» abajo).

| Suite | Casos | Qué compara |
| --- | --- | --- |
| `construction-geometry.spec.ts` | 48 | Intersecciones **analíticas** (no sobre teselado), tangencias, OSNAP |
| `modification.spec.ts` | 400 | TRIM/EXTEND/BREAK, FILLET medido por distancia centro-línea, OFFSET a N puntos, ARRAY, MIRROR, ROTATE/SCALE |
| `measurement.spec.ts` | 134 | DIST, AREA con huecos y arcos (segmento circular en forma cerrada), y **20 cotas cuyo valor mostrado se compara con el medido** |
| `angle-frontiers.spec.ts` | 38 | **8 fronteras entre subsistemas** a 37,5°, ida y vuelta. La de DWG se mide en la spec del adaptador autorizado; un guardia en `check:cad-math` impide que desaparezca de allí |
| `units-and-scale.spec.ts` | 36 | Un muro de 3,5 m en las **cuatro** representaciones a la vez |
| `large-coordinates.spec.ts` | 13 | UTM + lámina de papel, por el teselador **real** |
| `pdf-content.spec.ts` | 28 | Trazos extraídos del content-stream |
| `dxf-roundtrip.spec.ts` | 52 | 21 tipos, ida y vuelta numérica + lector de terceros |
| `glb-scale.spec.ts` | 8 | Metros medidos dentro del archivo |
| `dwg-surface-honesty.spec.ts` | 4 | Ninguna promesa sin su límite |

**Qué hace que valga:** los oráculos no importan nada del código bajo prueba.
Son resultados analíticos calculados a mano —dos circunferencias de radio 5 con
centros a 8 se cortan en puntos que se pueden escribir en un papel— e
implementaciones de fuerza bruta escritas aparte. El *golden de regresión* está
explícitamente prohibido en esa carpeta: comparar el producto consigo mismo no
prueba nada.

Durante la ola, **cinco de mis propias expectativas resultaron equivocadas y el
producto tenía razón** (el sentido del TRIM sobre un arco, la dirección del
OFFSET, el área de un polígono de 192 lados, el bulge de una semicircunferencia,
la forma de `cadDistanceBetween`). Se corrigieron los oráculos, no el producto.

---

## 3 · Los tres descargables, verificados por contenido

| Formato | Cómo se verifica | Resultado |
| --- | --- | --- |
| **PDF** | Se extraen los **trazos** del content-stream (inflate, pila `q`/`Q`, `cm`/`m`/`l`/`re`/`c`/`h`) y se miden | El muro de 3,5 m mide **70 mm exactos a 1:50**. Cajetín completo, acentos intactos, márgenes ISO |
| **DXF** | Ida y vuelta numérica entidad por entidad **y** apertura con `dxf-parser`, biblioteca de **terceros** que no conoce las convenciones de este producto | Los 21 tipos que viajan, cada uno con su caso numérico. Cero pérdidas declaradas |
| **GLB** | Se **mide un muro conocido dentro del archivo exportado**, en los tres ejes | 3,5 × 2,4 × 0,25 m, y el **mismo** muro en un predio diez veces mayor sigue midiendo 3,5 — que es la afirmación entera |

Ninguno se valida por su forma. El DXF no pasa porque contenga la palabra
`LINE`: pasa porque el muro sigue midiendo 3500.

**Los tres funcionan también con la prueba vencida** (§4) y desde un enlace de
revisión donde aplica.

---

## 4 · La regla de oro: los datos nunca son rehenes

Antes de esta campaña, el entitlement `design.cad` vencido cerraba **todo**,
incluida la apertura y la exportación. Un arquitecto que dejaba de pagar perdía
el acceso a sus propios planos.

Ahora el guard **degrada a solo lectura**: entra, ve sus documentos, **exporta
DXF y PDF** y se lo lleva todo; lo único que no puede es editar. Y falla
cerrado por triple vía: sin fecha de vencimiento **probada** no hay concesión,
un adaptador que no implemente la consulta conserva el comportamiento anterior,
y un fallo del almacén deniega.

* `entitlement-read-only.pg.spec.ts` — 10 comprobaciones contra **PostgreSQL
  real**, porque en SQLite las fechas son texto y una suite verde ahí no
  probaría que el arquitecto puede abrir sus planos el día 91.
* Está **por escrito donde el cliente lo lee**: los términos 2026-08-27 dicen
  que sus documentos no quedan condicionados al pago.
* Y el aviso de guardado lo repite **en el instante en que el usuario duda de
  ello**: al fallar por expiración, el mensaje dice que puede seguir abriendo y
  exportando.

---

## 5 · La lista GO/NO-GO

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| La Jornada Real, verde contra el stack real | ✅ | `e2e/real/jornada-real.spec.ts` — **7/7**, cero mocks, en CI en cada push |
| Cero mentiras conocidas en la superficie visible | ✅ | Barrido de 82 controles (0 muertos sin declarar) · gates de DWG, atajos y recorrido |
| Los tres descargables verificados **por contenido** | ✅ | §3 |
| El modo 90 días sin rehenes, probado | ✅ | §4 |
| La matemática contra oráculo independiente | ✅ | **761 casos, 0 desviaciones** + la frontera DWG en su sitio autorizado |
| Los errores hablan español con salida | ✅ | `errores-en-espanol.spec.ts` — **5/5**, cinco fallos provocados de verdad |
| No se pierde trabajo: offline, dos pestañas, cierre forzado | ✅ | **13/13** con la red genuinamente cortada |
| Registro sin tarjeta, medido | ✅ | **6 clics · 7 pantallas · 0 campos de pago** |
| Ruta de despliegue escrita y probada | ✅ | `DESPLIEGUE-RAILWAY.md` · `smoke:railway` **9/9 en vivo** |
| Respaldo con restauración verificada | ✅ | 35 tablas, 885 filas, recuentos idénticos, **RTO 1,15 s** |
| Legal coherente con el modo gratuito | ⚠️ | Publicado y candado, **marcado «borrador pendiente de revisión legal»** |
| Repositorios privados | ❌ | **Sólo Sergio** (§8) |
| Dominio, DNS y despliegue | ❌ | **Sólo Sergio** (§8) |
| CI verde sobre el SHA candidato | ✅ | Los cuatro jobs, incluida la suite E2E en **Chromium y Firefox** contra PostgreSQL |

Las dos últimas no son deuda técnica: son actos de cuenta y de propiedad que
este repositorio no puede ejecutar. La legal tampoco lo es —el texto está
publicado, candado y coherente con el modo gratuito—, pero lo escribió el equipo
de producto describiendo lo que el software hace, y lo dice de sí mismo: falta
la revisión profesional antes de prestar un servicio público.

### El árbol, en números

| Suite | Resultado |
| --- | --- |
| `npm run check:cad` (17 gates) | **EXIT=0** |
| Specs del web | **432/432** |
| Suite de la API (SQLite) | **712 pasadas** |
| Suites contra **PostgreSQL real** | **192 pasadas**, 36 suites |
| Presupuesto de monolito | OK — `Layout3DEditor.tsx` clavado en **20 242 líneas / 140 `useState`** (bajó de 141) |
| Trinquete de lint | 547/547 |
| Candado legal | OK — `terms` 2026-08-27, `privacy` 2026-08-27.2 |
| **CI sobre el SHA candidato** | **Los cuatro jobs en verde**: `Contrato · Build · Test · Lint · Smoke`, `E2E Playwright (PostgreSQL · Chromium + Firefox)`, `Gitleaks (historial completo)` y `Despliegue · Imagen reproducible + arranque productivo` |
| Barrido Playwright local (chromium) | 170 pasadas · 1 fallo, que resultó ser **una regresión mía** (el aviso de pantalla estrecha robaba toques en tableta): corregida y verificada 9/9 |

### El hueco que este informe casi tiene

Mientras se escribía todo lo anterior, **el CI de esta rama llevaba rojo desde
su primer commit** y yo no lo estaba mirando. Los gates locales daban verde; el
servidor, no. Merece constar, porque es justo la clase de distancia entre «lo
medí» y «es verdad» que esta campaña existe para cerrar.

Eran dos defectos, los dos míos, y los dos **sólo visibles en una máquina
limpia**:

1. **`redocly` rechazaba el contrato.** El spec es OpenAPI 3.1, donde `nullable`
   ya no existe; el esquema que añadí para el botón «algo salió mal» lo usaba en
   dos propiedades. El resto del archivo ya escribía la nulabilidad como
   `type: [string, "null"]`. El SDK generado no cambia con la corrección —
   `openapi-typescript` producía `string | null` de las dos formas—, lo que
   confirma que era sólo la gramática del documento.
2. **`check:cad-math` moría con `Cannot find module …/dist-cjs/index.js`.**
   `angle-frontiers.spec.ts` cruza la frontera documento↔DWG, así que importa
   `@valle-design/dwg-codec`, que se publica **compilado** y cuyo `dist/` está
   en `.gitignore`, con razón. En una máquina de desarrollo lleva rato
   construido; en CI, `check:cad` corre **antes** de `turbo run build`, así que
   no existía.

   La salida no podía ser saltarse esa suite cuando el códec falta: eso
   convertiría «761 casos, 0 desviaciones» en una cifra que depende de la
   máquina donde se mide. El gate construye ahora lo que necesita, una vez y
   sólo si falta.

Los dos se **reprodujeron antes de arreglarlos** —borrando `dist` para provocar
el mismo error del servidor— y se verificaron desde ese estado limpio.

Y arreglar el segundo destapó un tercero, que es el más instructivo:

3. **`check:dwg` rechazaba la suite de ángulos, y tenía razón.** ADR-0009 —la
   política clean-room del laboratorio DWG— autoriza a tocar el códec y el
   punto de escritura a exactamente cuatro archivos: los dos adaptadores y sus
   dos specs. `angle-frontiers.spec.ts` importaba ambos para medir la frontera
   documento↔DWG. El gate lo rechazó **dos veces**: primero por importarlos y,
   tras el primer intento de arreglo, por **nombrarlos** — busca la mención como
   texto, a propósito, porque una referencia es el primer paso de un import.

   Yo nunca había corrido `check:dwg`: es un script aparte de `check:cad`, y
   sólo miraba el que había encadenado yo. Ésa es la parte que más me importa
   del hallazgo.

   Había una salida cómoda —añadir mi spec a la lista de autorizados— y era
   exactamente la prohibida: **relajar un gate**, y encima el más sensible que
   tiene el repositorio, que es una frontera legal. La frontera clean-room no se
   ensancha para acomodar una prueba; **la prueba se muda a donde la política ya
   la permite**. Vive ahora en la spec del adaptador de escritura, con el mismo
   37,5°, comparando el radián que quedó ESCRITO en el archivo.

   Y para que mudarla no fuera perderla, `check:cad-math` comprueba que siga
   allí: si alguien la borra, el gate falla nombrando lo que falta. Se verificó
   borrándola a propósito. Por eso la cifra de §2 son **761** y no 767 — los seis
   casos de esa frontera se miden fuera de la carpeta de verificación, y decir
   767 sería contarlos dos veces.

Y hubo un cuarto y un quinto, ya sin sorpresa conceptual pero con la misma
raíz: **`lint:check` de la API es bloqueante y ninguno de mis archivos había
pasado por él** (prettier tenía queja en once), y al arreglarlo con `--fix`
automático se quedó un import huérfano que **el trinquete de lint** rechazó,
porque su presupuesto de `no-unused-vars` en `apps/api` es CERO y la curva sólo
baja. Lección menor y útil: un `--fix` automático es el principio de la
comprobación, no el final.

### Y una regresión que sólo cazó el barrido completo

Con el CI ya en verde, el barrido local de 171 pruebas encontró **una regresión
mía**, y de las que importan: el aviso de pantalla estrecha de la OLA 4.4 se
pintaba ARRIBA y **capturaba el puntero**. Una tableta mide 1024 px —por debajo
del umbral de 1100 con el que el aviso sale—, así que en una tableta el cartel
se ponía encima de la barra de herramientas y **se comía el primer gesto de cada
sesión**. Lo cazó el golden «un arquitecto abre el plano en la tableta … sólo con
los dedos».

No es un detalle de estilo: un arquitecto en obra habría perdido su toque
inicial contra un cartel informativo. El aviso existía para que el producto no
pareciera menos de lo que es, y acababa impidiendo usarlo.

Lo peor —y lo más instructivo— es que **la regla ya estaba escrita en este
repositorio**, en `ToastContext`: «una notificación NUNCA debe robar un clic a un
control real; la tarjeta no captura puntero y sólo el botón de cerrar vuelve a
habilitarlo». Estaba ahí, con su razón, y no la apliqué. Ahora la tarjeta deja
pasar el puntero, sólo su botón lo captura, se pinta abajo, y `movil.spec.ts`
comprueba el `pointer-events` computado para que no vuelva.

**La lección, escrita para la próxima campaña**, en tres partes:

1. **Un gate que sólo se ha corrido en la máquina de quien lo escribió no es
   evidencia todavía.**
2. **La lista de gates que hay que correr no es la que uno recuerda**, es la que
   ejecuta el servidor.
3. **Una suite completa no es un trámite**: de las seis cosas que salieron mal,
   la única que un usuario habría notado —el toque robado en la tableta— la cazó
   el barrido entero, no ninguna prueba dirigida.

Las cifras de arriba valen porque ahora también las produce un servidor que
empieza de cero.

---

## 6 · Lo que se decidió y por qué, cuando había duda

* **El papel del plano se elige por hoja, no en la barra.** Un conjunto de
  entrega mezcla planos A1 con detalles A3; un desplegable global habría sido
  cómodo y equivocado.
* **El reporte de «algo salió mal» manda el identificador del plano, nunca el
  dibujo.** Adjuntarlo a un correo sería peor para la privacidad, no mejor: el
  documento ya vive en el servidor con su control de acceso; una copia en un
  buzón no lo tiene.
* **La telemetría no añade ni una recolección nueva.** Los cuatro números se
  derivan de filas que el producto ya escribe para operar. Si se retirase el
  endpoint, no dejaría de recogerse absolutamente nada.
* **Cuatro de los cinco «ajustes de producción» ya estaban puestos.** Se
  verificaron en vez de rehacerse. Lo que faltaba era evidencia, no código.
* **El estudio en un móvil no se bloquea.** Sirve para lo que la gente hace en
  un móvil —abrir el plano que le acaban de mandar y mirarlo—; lo que se
  arregló fue que dejara de callarse lo que faltaba.

---

## 7 · Límites declarados (lo que este informe **no** afirma)

* **DWG sigue apagado.** No se abre, no se escribe. La superficie lo dice donde
  lo nombra.
* **DXF→DWG→DXF con ODA File Converter no se ejecutó**: la herramienta no está
  en esta máquina. El peldaño queda declarado.
* **Los textos legales no han pasado revisión profesional** y lo dicen ellos
  mismos.
* **Sentry y el monitor de uptime están documentados, no encendidos**: dependen
  de cuentas que sólo Sergio tiene.
* **El respaldo diario está escrito para Railway, no programado**: el servicio
  con horario hay que crearlo en el proyecto.
* Las cifras de rendimiento salen de **un contenedor compartido**, más lento que
  cualquier portátil. Son techos, no marcas.

---

## 8 · Lo que sólo Sergio puede hacer, en orden

1. **Poner los dos repositorios EN PRIVADO.** Es lo primero porque hoy son
   públicos mientras toda la gobernanza los llama confidenciales (`P0-1` del
   backlog). Va antes que el dominio: publicar el sitio dirige atención al
   código.
2. **Crear el proyecto en Railway** con los tres servicios y seguir
   `docs/onboarding/DESPLIEGUE-RAILWAY.md` de arriba abajo. Las variables 🔑 son
   exactamente las que nadie más puede generar.
3. **Dominio y DNS**: `valledesign.mx` y `api.valledesign.mx`. Tienen que ser
   **mismo sitio**: la cookie de sesión es `SameSite=Lax` y con dominios
   distintos el acceso no funciona. No es una preferencia estética.
4. **Clave de Resend** y verificación del dominio de correo. Sin ella nadie
   recibe el enlace de verificación y **nadie llega a entrar**.
5. **Los secretos**: `IDENTITY_RATE_LIMIT_KEY_SECRET`, `OUTBOX_WEBHOOK_SECRET`,
   `METRICS_TOKEN` (`openssl rand -base64 48` cada uno), `SUPPORT_EMAIL` y
   `TRIAL_DAYS=90`.
6. **Correr el smoke** en cuanto haya URL:
   `npm run smoke:railway -- --web https://valledesign.mx --api https://api.valledesign.mx --email tu-correo@dominio.mx`.
   Dos minutos para saber si el sitio está vivo. Las omitidas **no cuentan como
   verdes**.
7. **Programar el respaldo diario** (§7.2 del documento de despliegue) y
   **restaurar uno a mano** para ver el verde con tus propios ojos.
8. **Sentry y el monitor de uptime**, apuntando a `/health/ready` —no a
   `/health`—, que es la diferencia entre «el proceso vive» y «el producto
   sirve».
9. **Mandar el enlace a los primeros cinco arquitectos**, con el guion de sesión
   que ya existe. A partir de ahí, el botón «algo salió mal» y
   `GET /health/metrics/activation` cuentan lo que pasa de verdad: de los que se
   registran, cuántos llegan a dibujar.

---

## 9 · Lo primero que hay que mirar cuando entren

De todo lo que se construyó hoy, dos cosas contestan la única pregunta que
importa la primera semana:

* **La tasa de activación.** `GET /health/metrics/activation` dice, de los que
  se registraron, cuántos llegaron a **guardar su primer dibujo**. Un embudo
  roto se ve ahí en un número, no en la ausencia de clientes tres semanas
  después.
* **Los reportes de «algo salió mal».** Van a describir cosas que ninguna prueba
  de este repositorio imaginó. Ésa es exactamente su utilidad.
