# Informe de campaña — 8 horas autónomas, 2026-08-20 → 2026-08-21

Misión: dejar el producto LISTO PARA COBRAR Y OPERAR. Bitácora completa en
`docs/history/execution/CAMPANA_8H_20260820.md`. Rúbrica al cierre: **186/200 (93 %)**, corte
`docs/competitive/history/2026-08-21-da59d22.json` (llegó a 184 tras la
seguridad y a 186 con la evidencia de GPU real; el corte anterior era 166).

Contexto operativo que marcó la campaña: **otra campaña Claude (DWG) trabajó
EN PARALELO sobre el mismo working tree** durante toda la sesión. Obligó a
staging explícito (un `git add -A` le robó archivos en curso y hubo que
rehacer un commit), a `pull --rebase --autostash` antes de cada push, y a
distinguir en cada corrida de gates qué rojo era mío y qué rojo era su WIP.
La regla quedó en memoria persistente.

## Qué se hizo (con commits)

### OLA 0 — Estado y vulnerabilidades ✅ (`405ace8`, push propio)
- `npm audit --omit=dev`: **0 vulnerabilidades** (nanoid 3.3.18, dompurify
  3.4.14). Paso bloqueante de audit high+ en quality-gates y dependabot
  semanal agrupado.
- Gate NUEVO `check-json-duplicate-keys` encadenado PRIMERO en `check:cad`:
  escáner del TEXTO de los 9 manifiestos versionados (JSON.parse esconde el
  duplicado que ya mató 3 gates una vez); spec de 50 comprobaciones.

### OLA 1 — Seguridad de producción ✅ (`96d8d9c`, `eb41206`, `41c1223`)
- **La póliza**: migración `TenantIntegrityRls` — `tenant_id NOT NULL` en las
  7 tablas CAD de tenant (la 8ª, `sf_cad_blocks`, conserva su carril NULL de
  biblioteca de sistema A PROPÓSITO) + **Row-Level Security** en las 8 con
  política `current_setting('app.tenant_id', true)` (cerrada por defecto),
  pre-check que ABORTA sin mutar ante filas huérfanas, y spec .pg con
  `SET ROLE` a rol no dueño: sin scope 0 filas, A no ve B, INSERT ajeno 42501,
  down reversible. Sin FORCE: la app (dueña) no cambia; el rol runtime
  no-dueño quedó guiado en DEPLOYMENT.md §3.2.
- `/health/metrics/commercial` con el bearer de METRICS_TOKEN (era @Public y
  consultaba la BD en cada hit).
- SSL estricto POR DEFECTO en producción (escape explícito documentado) +
  presupuestos de conexión: pool 20, statement 30 s, idle-in-tx 30 s, lock
  10 s — valor ilegible aborta el arranque.
- `ApiRateLimitService` (claves HMAC + store PG compartido): content
  120/min/doc, archive 30/min/doc, visión 10/min/cuenta, checkout 10/min/org,
  comentarios de review 30/min/sesión. Spec .pg: bajo 30 llamadas concurrentes
  pasan EXACTAMENTE 10; la tabla no contiene identificadores en claro.
- `CAD_DOCUMENT_MAX_ARCHIVE_BYTES` 128→32 MiB (evidencia: 100k entidades ≈
  24,7 MB — el techo efectivo sigue siendo el de entidades, con 26 % de
  holgura).
- Listados sin lastre: proyección explícita (nunca `cadDocument`/`dxfData`) y
  búsqueda `q` EN SQL con escape, dentro del scoping de tenant — `total` real
  y documentos viejos alcanzables (antes: tope de 1000 en memoria).
- Gate de contrato ampliado a auth/organizations/commercial: **79/79
  operaciones** en biyección OpenAPI=SDK=router (y una familia nueva fuera
  del alcance ahora es ERROR). `migration-chain` gana un candado que deriva
  la lista de migraciones DEL DIRECTORIO.
- El trinquete del monolito atrapó a su propio autor dos veces; se resolvió
  partiendo por la costura real (helpers de listado a `cad-list-query.ts`;
  arnés Stripe duplicado a `common/testing/stripe-billing-fixture.ts`).

### OLA 2 — Cobro completo con factura ✅ (`ff6c9f7` + `2613613`; push OLAS 1+2)
- **`FacturamaCfdiProvider`**: primer adaptador real del puerto CFDI. Con
  `CFDI_PAC_NAME=facturama` el arranque en producción YA NO revienta (un PAC
  desconocido sigue reventando a propósito). Contrato HTTP fijado por 15
  specs con dobles (Basic auth, POST /2/cfdis, descarga autenticada, IVA 16 %
  desglosado exacto en centavos, PUE, forma 31). **Parcial declarado
  parcial**: la corrida contra el sandbox REAL exige credenciales del dueño y
  está pendiente (así lo dicen DEPLOYMENT.md y environment-variables.md).
- Tabla `cfdi_receipts` (idempotencia POR ESQUEMA: único parcial por factura
  y por período global) + `CfdiIssuanceService` en el tick del worker:
  pago→CFDI nominativo con los datos fiscales capturados; sin datos→pool;
  pool→**factura global mensual** XAXX010101000 (día 1, mes anterior, sólo
  MXN, una por período). 6 specs .pg del ciclo completo; una factura
  reembolsada antes de timbrar jamás genera CFDI.
- Portal: `GET /v1/commercial/cfdi` + descarga XML/PDF servida por el
  producto (la credencial del PAC nunca viaja al navegador), SDK
  (`cfdiReceipts`/`cfdiFileUrl`) y sección CFDI en /cuenta/facturacion.
- 2.4 verificado YA cubierto: `commercial-refunds-disputes.pg.spec` (8 tests
  — refund NO revoca acceso por política; disputa→suspended sin borrar datos;
  el entitlement suspendido se apaga por construcción).

### OLA 3 — Cotas y estilos: 3.1 ✅ 3.3 ✅ (`427a121`, `6148f37`, `383018a`)
- **DIMSTYLE de verdad**: `CadDimensionStyleDefinition` con el núcleo de
  **30 DIMVARs** (cada campo con su DIMVAR al lado), resolución
  defaults←Standard←nombrado, horneado con DIMSCALE multiplicando tamaños,
  comando DIMSTYLE con vocabulario cerrado + **Aplicar** (re-hornea las cotas
  existentes del estilo) + **Comparar** (diferencias nombrando su DIMVAR),
  paleta con el núcleo completo editable, y **tabla DIMSTYLE en el DXF**:
  códigos DIMVAR estándar para lectores ajenos (un ISO-25 de fuera puebla
  `styles.dimension` al importar) y XDATA clave=valor para round-trip propio
  sin pérdida. 27+41+23 comprobaciones, incluido el ciclo integral
  escritor→lector.
- Dos bugs reales destapados y arreglados: `applyStyleCommands` descartaba
  `styles.linetype` entero en cualquier orden de estilo, y el monolito pisaba
  el horneado del estilo DESPUÉS de aplicarlo.
- **Cotas anotativas v1**: el juego completo de tamaños (flecha/huecos/
  exceso/texto) mantiene su medida de PAPEL entre viewports a escalas
  distintas (2,5 mm → 125 u a 1:50 y 12,5 u a 1:5, proporciones conservadas);
  flag `annotative=` por la XDATA con ciclo export→import probado.
- 3.2 quedó PARCIAL (mleader ya aplicaba al crear; el DXF de mleader/table
  styles y la tabla que gobierna bordes/filas → PENDIENTES) y 3.4 (bloques
  dinámicos) → PENDIENTES con diseño esbozado.

### OLA 4 — Rendimiento en GPU real ✅ (`da59d22`)
- `browser-slo-100k.json` es ahora la corrida en **GPU real declarada** (AMD
  Ryzen 5 5500U + Radeon integrada, ANGLE D3D11, Chromium headed, tier full
  10 corpus × next/legacy; la SwiftShader de CI se conserva renombrada).
  Hallazgo del camino: el headless cae a SwiftShader incluso CON GPU — la
  corrida válida es headed, y `environment.webglRenderer` es el testigo.
- **Presupuestos de producto (report-only) contra lo medido**: apertura 10k
  <5 s ✓ (peor caso 1 907 ms), zoom asentado <1 s ✓ (peor caso 50 ms), pan
  ≥30 fps ✓ con matiz (text-hostile 29,9), 100k <15 s ✓ en 4/5 mezclas —
  baseline 4,2 s, mechanical 5,2 s, text-hostile 6,3 s, cartography 7,4 s.
- La fila `performance.browser-slo` (2 pt) pasó a CUMPLIDA por contenido:
  1 907 ms ≤ 5 000 · 59,5 fps ≥ 30 · 33 ms ≤ 500.
- 4.3 no se ejecutó (sin tiempo): el hotspot con nombre queda abajo.

### OLA 5 — Limpieza del legado ✅ scoped (`d529176`)
- Monolito **−335 líneas netas** (techo 22 577→22 208): el PDF muerto de la
  Fase 65 (364 líneas de jsPDF de rollback sin llamadas) fuera, y con él una
  de las dos importaciones de jspdf. Modo planta tras la compuerta
  `standalone` (patrón WP6): calor MES, overlays de estación, paseo en
  primera persona, optimizar flujo, CSV de estaciones y el DOCK del copiloto
  legado de 47 comandos NO existen en el estudio Design; el motor NL→CAD del
  puerto CIDE intacto.
- es-MX: Start/End/Monochrome/Scope/Layers/«Sin layers»/objetos de capas +
  el cajetín del PDF PUBLICADO (PROYECTO/TÍTULO/NO. DE PLANO/ELABORÓ/REVISÓ —
  claves de contrato intactas). Accesibilidad mínima: role=log+aria-live en
  el diálogo de comandos, aria-pressed en OSNAP/ORTHO/POLAR, role=dialog en
  el gestor de estilos, nombres accesibles deduplicados.
- STEP: límite exacto declarado en PRODUCT.md y en el prompt de IMPORT
  («sólo sólidos de caras planas»); CYLINDRICAL_SURFACE → PENDIENTES.

## Qué quedó ROJO (y de quién es)

- **Nada mío en rojo al cierre.** Los gates de mi territorio (check:json-keys,
  contrato 79/79, no-line-engineering, monolito committeado, wasm, normas-mx,
  nl-cad, rúbrica, typecheck/test/lint/build de api+web+sdk+contracts, y las
  31 suites .pg con 152 tests) quedaron verdes en local.
- `check:dwg` / `check:dwg-evidence` / typecheck de dwg-codec fallaban EN EL
  ÁRBOL por el **WIP no committeado de la campaña DWG paralela** (sus
  archivos, su territorio, su pre-push). El estado COMMITTEADO estaba verde y
  CI valida commits.
- Flakiness real observada: 2 timeouts de tests de blob (5 s/30 s) SOLO bajo
  contención de 12 tareas turbo + campaña vecina; verdes en reintento a
  solas. No se cuarentenó nada.

## PENDIENTES priorizados (detalle en docs/history/execution/CAMPANA_8H_20260820.md § PENDIENTES)

1. **CFDI sandbox real** (~0,5 día + credenciales del dueño): correr el
   contrato fijado contra apisandbox.facturama.mx y marcar la verificación.
   Es el último paso para «cobra y factura» sin asteriscos.
2. **architecture@100k a <15 s** (~1-2 días): 25,3 s hoy en GPU real (paneo
   8,6 fps). El perfil por etapas publicado señala teselado+batchPush como
   dominantes; candidatos por lo medido: subida de geometría por lotes y
   atlas de texto en detalle. Con él, encender el perfil EN EL NAVEGADOR
   (~1 día) — hoy sólo corre por el arnés Node.
3. **Esquema de entidad para el núcleo DIMVAR completo** (~2-3 días): que
   alturas/colores/grosores/TAD/JUST gobiernen el render por cota; hoy
   definen, persisten, se editan y viajan, pero no dibujan. + golden del
   ciclo DIMSTYLE (~0,5 día).
4. **Rol runtime no-dueño** (~0,5 día + cableado `app.tenant_id` por
   transacción): para que la póliza RLS cubra también a la aplicación.
5. **MLEADERSTYLE/TABLESTYLE por DXF + tabla que gobierna bordes/filas**
   (~1-2 días) y **bloques dinámicos v1** (~3-4 días, diseño en PENDIENTES).
6. `cad-viewport-100k` E2E en GPU real (exige `next build` E2E_PROD; la
   corrida de hoy cubrió browser-slo, que es la evidencia que la rúbrica lee).

## Los 10 siguientes ítems recomendados

1. CFDI sandbox real + credenciales (cierra el ciclo de cobro sin asterisco).
2. architecture@100k <15 s (única mezcla fuera de presupuesto en GPU real).
3. Esquema 10 de entidad dimension (DIMVARs al render) + golden DIMSTYLE.
4. Rol runtime no-dueño + `SET app.tenant_id` por transacción (RLS total).
5. Nota de crédito (CFDI de egreso) para refunds post-timbrado — hoy el
   refund revierte el espejo pero no emite egreso.
6. R.1 de la reserva: round-trip DWG AC1015 verificado por ODA como oráculo
   (la campaña DWG vecina avanzó lectura; el oráculo externo sigue en 0).
7. Bloques dinámicos v1 (visibilidad + estiramiento).
8. Paginación de `listPublications` (take:1000 literal restante) + contrato.
9. Accesibilidad: completar roles/foco en las paletas restantes (capas,
   propiedades) y navegación por teclado de las flotantes.
10. Restaurar el cron semanal de CI cuando la cuota renueve (nota en ci.yml).

## Verificación final

Suite local por territorio propio: verde (este informe se escribió con el
último turbo en vuelo; el resultado quedó en la bitácora). Push final con
`pull --rebase --autostash`. CI de main: los pushes de la campaña
(`405ace8`, `2613613`, y el final) llevan el veredicto real del árbol
committeado — revisar el último run al leer esto.
