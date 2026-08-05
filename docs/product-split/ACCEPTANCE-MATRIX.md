# ACCEPTANCE-MATRIX — Criterios 1–18 con evidencia (documento vivo)

Actualizado: 2026-08-02 — **ESTADO FINAL DE LA MIGRACIÓN, CORREGIDO EN LA FASE DE PURIFICACIÓN.**
Estados: ✅ PASS con evidencia · 🟡 PARCIAL (falta evidencia o queda trabajo) · ⬜ PENDIENTE
(fase posterior). Nada se marca PASS sin evidencia verificable.

> **Corrección de esta revisión.** La versión anterior de este documento contenía afirmaciones
> que el código no sostenía. La fase de purificación las verificó una por una contra el árbol
> real y las corrigió aquí. El detalle de cada corrección está en la sección
> **"Afirmaciones corregidas"** al pie. La más grave: el criterio 11 declaraba que de los
> enlaces de revisión se persistía **sólo el hash**, y era **falso** — el token en claro
> también viajaba dentro del JSON del documento CAD. Se corrigió en el código
> (valle-design #4) antes de corregirlo aquí.

SHAs de referencia al cierre de la migración: valle-design `d71cc3a5`, valle-enterprise
`f123aad0`. Ambos `main` han avanzado desde entonces con los PRs de purificación; los SHAs
vivos están en `docs/cleanup/`.

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | valle-design arranca de clon limpio sin dependencia del monorepo | ✅ | R3: export a dir virgen → npm ci → build 4/4 → 6 migraciones en BD virgen (10 tablas) → tests 4/4 workspaces (api 102 + web 118 + sdk 6) + pg 4/4 + smoke E2E. Cero referencias al monorepo |
| 2 | valle-enterprise arranca de clon limpio | ✅ | Verificado de nuevo en la fase de purificación desde un clon limpio **del remoto** (no del árbol local): 20 gates ejecutados y registrados en `docs/cleanup/BASELINE.md`, incluyendo los que fallan. Los SHAs que citaba esta fila (f3703a6f, 9053a88b) quedaron obsoletos al avanzar `main` |
| 3 | valle-design: abrir/editar/guardar/recargar/revisar/publicar sin ERP | ✅ **(corregido)** | E2E sin ERP (incl. API real y >1MB hidratado) + revisar PROBADO end-to-end por API full-stack (crear sesión→canjear token→read-only impuesto→comentar→revocar→muere). **Corrección**: la fila anterior daba por buena la capa web sin haberla ejercido con un invitado real. Al hacerlo se encontró un fallo: `redeemReviewLink()` colgaba de la rama de carga del documento, así que el modo sólo-lectura del invitado dependía de que el dibujo cargara, y un enlace pegado en la misma pestaña sólo cambia el fragmento (no hay remonte). Un invitado podía quedarse en modo edición con un token válido. Corregido en valle-design #4 con un efecto de montaje dedicado + listener de `hashchange`; el E2E ahora abre una pestaña nueva, que es el flujo real del invitado |
| 4 | Ningún producto consulta la BD del otro; sin imports cruzados ni FKs entre bases | ✅ | Design: BD propia valle_design_dev, FKs solo cad_*↔cad_* (revisión de migraciones R1); adaptadores enterprise BORRADOS y sustituidos; grep fronteras 0 en ambos repos (WP7 + R1). Enterprise intacto con su BD |
| 5 | ~106 specs kernel + E2E 10-28 + acceptance journey en valle-design y pasan | ✅ | 107 specs kernel (95 lib/cad + 12 commands) dentro de 118/118; E2E dorados 10-28: 23/23 + 2 perf + 2 real-API = 27/27; acceptance journey 50/50. Suite real (build prod + API + Playwright) |
| 6 | Documentos dorados conservan semántica/conteos/hashes del manifiesto | ✅ | Verificación formal ejecutada: 250 archivos byte-idénticos al manifiesto; los 40 distintos mapean 1:1 a modificaciones documentadas (21 E2E migrados a /v1 en R3, editor WP5/6, wrappers WP4, seam WP4b, redirect R2) — CERO diferencias inexplicadas; conteos de goldens intactos (E2E verdes) |
| 7 | DXF y PDF comparación estructural y visual vs baseline | 🟡 **(degradado)** | Estructural: PASS — golden 27-dxf-loss-manifest + roundtrips verdes en ambos lados. Visual: **NO medida**. La fila anterior la marcaba ✅ "por construcción" (renderer y escritor DXF byte-idénticos según el manifiesto + round-trip exacto ⇒ salida idéntica). Ese razonamiento es plausible pero **es un argumento, no una medición**, y el criterio pide comparación visual. Se degrada a PARCIAL hasta que exista un pixel-sweep ejecutado. El visual-sweep original quedó en enterprise por D-006 |
| 8 | Benchmark 100k sin regresión inexplicada | ✅ *(el criterio, sí; los números, malos)* | Comparación en la MISMA máquina, mismo spec y umbrales: Design pasa todos los umbrales del spec (canonicalReady 6,431ms, frameLatency 28.8ms, zoomSettle 29.1s<30s); enterprise en la corrida comparativa pasó 10k pero EXCEDIÓ zoomSettle 30s en 100k. **El criterio se cumple** (no hay regresión: Design supera al lado enterprise bajo la misma carga) **pero los umbrales que se están aprobando no son un criterio profesional**: un `zoomSettle` de 29 segundos pasa sólo porque el umbral es de 30. Esos umbrales miden "no empeoró", no "sirve". Sustituirlos por objetivos reales y medirlos en hardware de CI documentado es trabajo de la fase de purificación (B6), no de esta matriz |
| 9 | ERP mantiene su golden flow verde | ✅ | Fase 6: smoke:golden COMPLETO (fases 1–6 de la cadena canónica, supertest vs Postgres) verde ANTES (valle_smoke, pre-retiro) y DESPUÉS del retiro (BD limpia valle_smoke_f6) en el mismo entorno; bootstrap-smoke verde en ambos cortes; suites api 363/2,457 post-retiro con delta 100% CAD (PHASE6-RETIREMENT.md) |
| 10 | ERP-only, Design-only y bundle desde UI y API con design.cad en servidor | 🟡 | Design-only: PROBADO (E2E 27/27 + aislamiento). ERP-only: PROBADO (golden flow post-retiro sin CAD). design.cad en servidor: PROBADO (barrido 30+ rutas fail-closed). Bundle end-to-end: REQUIERE que Platform implemente /v1/entitlements (contrato listo, cliente listo, switch = apuntar URL) — fuera del alcance físico de esta tarea (Platform permanece en enterprise por mandato) |
| 11 | Revocación de review links y read-only por backend | ✅ **(corregido)** | Token `vdrl_` 32B crypto, expiración server-side, revocación inmediata probada (el canje muere), read-only IMPUESTO por backend (barrido: 10 rutas de mutación→403 con contexto review; el JWT jamás abre superficie de invitado), auditoría sin token, aislamiento de 2 tenants en PG real (26 rutas). **La redacción original de esta fila era falsa**: decía "SOLO hash persistido" y sólo era cierto de la tabla `cad_review_link`; el token EN CLARO se escribía además en `reviewLinks[].token` dentro del JSON del documento CAD, legible por cualquiera con acceso de lectura al documento. Corregido en valle-design #4 (`303b917`): redacción en el único borde de salida, `token` opcional en el esquema y migración quirúrgica idempotente que purga los tokens ya persistidos con conteos antes/después. Los documentos guardados como blob no son alcanzables por SQL y se reportan como tales en vez de darse por limpios |
| 12 | Exportador/importador con dry-run, conteos/hashes y rollback probados | ✅ | Fase 4 (002892e): CLI export/import/verify/rollback validada e2e contra BD enterprise fixture real (76 migraciones): dry-run, idempotencia (0 duplicados), delta, resume tras interrupción, rollback exacto por manifiesto, aislamiento de tenants, origen READ-ONLY estructural (SQLSTATE 25006), blob >1MB por puntero verificado por hash y abierto HIDRATADO vía API. 47 tests nuevos. DATA-MIGRATION.md |
| 13 | Tag pre-cad-split, mirror, bundle, historial/autoría/checksums preservados | ✅ | Tag local + rama remota backup/pre-cad-split-20260801 @ 4cf045ad (API verificada); mirror 88MB + bundle 81MB verificado; autoría intacta en Design (390/31/1 commits, emails preservados); PHASE3-EXTRACTION.md |
| 14 | Cero secretos y cero datos personales en historial de valle-design | ✅ | gitleaks sobre TODO el historial en 3 momentos (427→403→404 commits): único hallazgo = fixture sintético 0123456789abcdef, FP documentado + allowlist; 0 con config final. Emails de autoría son procedencia git deliberadamente preservada (mandato de misión) |
| 15 | Office intacto (cero cambios funcionales fuera del desacople neutral) | ✅ *(cumplido durante la migración; superado después)* | WP1: escaneo PDF/Office del GC intacto byte a byte (spec original con mismas aserciones); ningún WP de la migración tocó document-authoring/sheets/presentations (diff de PRs). **Ya no describe el rumbo del repo**: la fase de purificación retira Office de enterprise por decisión de alcance (`REPOSITORY_SCOPE.md`). El primer paso ya está en `main` (#1452): el GC de blobs dejó de conocer Office por inversión de dependencia, para que el mark-and-sweep no se quede ciego cuando el módulo se retire |
| 16 | CI/CD verde e independiente en ambos repos | ✅ *(verde sí; equivalentes no)* | **valle-design**: 4/4 jobs verdes en GitHub (Contrato·Build·Test·Lint·Smoke con servicio PostgreSQL, E2E Playwright full-stack real, Gitleaks de historial completo, SBOM CycloneDX) — workflow propio, cero dependencia de enterprise. **valle-enterprise**: Build·Test·Lint·Smoke verde. **Matiz que la fila anterior omitía**: el CI de enterprise es más débil que el de design — no corre escaneo de secretos, no tiene job de E2E y no prueba el upgrade desde el esquema legado. Están inventariados como huecos en `docs/cleanup/BASELINE.md`; cerrarlos es trabajo de la purificación |
| 17 | docs/product-split completo | ✅ | Baseline, inventarios, clasificación (649 rutas), import-graph, manifiesto SHA-256 verificado, riesgos/rollback, decisiones D-001..D-008, PHASE1-PLAN, PHASE3-EXTRACTION, PHASE6-RETIREMENT, DATA-MIGRATION (en design), ACCEPTANCE-MATRIX, STATE vivo en ambos repos, comandos exactos documentados |
| 18 | Lista priorizada de trabajo posterior | ✅ | Ver sección al pie |

## Trabajo posterior priorizado (criterio 18)

Las Fases 4, 5 y 6 que esta lista daba como "siguientes" **ya están ejecutadas y fusionadas**
(filas 12, 11 y 9 de la matriz). Lo que queda, con el estado real:

1. **Fase de purificación** (en curso, `docs/cleanup/`): retiro de Office de enterprise,
   retiro del CAD residual de `line-engineering`, ruta canónica y contratos en design,
   descomposición del editor, almacenamiento de blobs fuera de PostgreSQL, objetivos de
   rendimiento medidos y rebranding Valle Design→Valle con compatibilidad versionada.
2. **Seguridad multi-tenant** (A6): el primer corte ya está en `main` (#1454). Los hallazgos
   críticos restantes están clasificados por alcanzabilidad, no cerrados en bloque.
3. **Pixel-sweep visual en CI** — cierra el criterio 7, hoy degradado a PARCIAL.
4. **Objetivos de rendimiento reales** — cierra el matiz del criterio 8.
5. **Huecos del CI de enterprise**: gitleaks, job de E2E, prueba de upgrade desde legado
   (cierra el matiz del criterio 16).
6. **Extracción física de Platform** a su propio repo — cierra el criterio 10.
7. **Rust/WASM geometry-core**: sólo si el profiling lo justifica, como módulo de geometría
   aislado y con benchmark reproducible antes/después. No antes de perfilar.
8. Offline desktop; proveedor DWG (interop-provider ya declara la ausencia); workers de
   conversión (apps/conversion-worker).
9. Identificadores persistidos `AXOS-CAD-STUDIO`/`UNIVERSAL` y XDATA DXF: **alias con lectura
   bidireccional, nunca sustitución ciega** — hay datos y archivos de clientes que dependen
   de ellos.

## Afirmaciones corregidas

Esta sección existe porque la versión anterior del documento marcaba PASS cosas que el código
no sostenía. Se verificó fila por fila contra el árbol real; lo que no se sostuvo se corrigió.

| Fila | Decía | Realidad verificada | Qué se hizo |
|---|---|---|---|
| 11 | "SOLO hash persistido" | Cierto de la tabla, **falso del documento**: el token en claro vivía en `reviewLinks[].token` dentro del JSON del documento CAD | Se arregló el código primero (valle-design #4: redacción en el borde + migración de purga), luego el documento |
| 3 | "UI de review = mejora futura, la capacidad existe y está probada" | La capacidad de backend sí; la web **estaba rota**: el modo sólo-lectura del invitado dependía de que el dibujo cargara | Efecto de montaje + `hashchange`; el E2E abre pestaña nueva (flujo real del invitado) |
| 7 | ✅ "visual por construcción" | Es un argumento, no una medición. No se ejecutó ninguna comparación de píxeles | Degradado a 🟡 hasta que exista pixel-sweep |
| 8 | ✅ sin matiz | El criterio se cumple, pero aprueba un `zoomSettle` de 29s contra un umbral de 30s | Se conserva el ✅ del criterio y se dice en la misma fila que esos umbrales no son un criterio profesional |
| 16 | ✅ "CI verde e independiente" | Verde sí, pero el CI de enterprise no corre secretos, ni E2E, ni upgrade legado | Se añade el matiz y se enlazan los huecos inventariados |
| 15 | "Office intacto" | Cierto entonces; ya no describe el rumbo | Se marca como superado por la decisión de alcance |
| 2 | SHAs `f3703a6f`, `9053a88b` | Obsoletos: `main` avanzó | Sustituidos por la evidencia de clon limpio del remoto |
