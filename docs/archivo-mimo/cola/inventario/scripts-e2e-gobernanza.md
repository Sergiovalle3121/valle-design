# Inventario: Scripts, E2E y Gobernanza

Fecha: 2026-09-06
Alcance: scripts/**/*.mjs, apps/web/e2e/**, docs/competitive/**, docs/cad/evidence/**, docs/governance/**

---

## 1. SCRIPTS Y GATES (scripts/)

### 1.1 Resumen cuantitativo

| Subdirectorio | Archivos .mjs | Con spec (.spec.mjs) | Rol principal |
|---|---|---|---|
| scripts/cad/ | 37 | 4 | Gates de identidad CAD, rúbrica, integridad de comandos, monolito |
| scripts/dwg/ | 20 | 3 | Codec DWG: corpus, oracle, fuzz, firma, boundary |
| scripts/perf/ | 11 | 3 | SLO navegador, bundle budget, curva kernel render, etapas 100k |
| scripts/deploy/ | 3 | 2 | Dockerfiles, Railway smoke, production startup |
| scripts/design/ | 3 | 2 | Contraste WCAG, superficie pública (sin AutoCAD), fuentes |
| scripts/ops/ | 6 | 0 | Backup, restore-verify, outbox-replay, webhook replay, alerts |
| scripts/wasm/ | 2 | 0 | Build kernel WASM, evidencia paridad WASM |
| scripts/brand/ | 1 | 0 | build-brand-assets (logo, SVG, favicon, social) |
| scripts/legal/ | 1 | 0 | check-legal-content (candado de inmutabilidad legal) |
| scripts/ (raíz) | 6 | 2 | doctor, branch-audit, check-lint-budget, check-dependency-licenses, check-import-direction, check-proprietary-governance, check-self-hosted-fonts |
| **TOTAL** | **108** (aprox.) | **16** | |

### 1.2 Gates críticos del pipeline (
pm run check:cad)

| Gate | Archivo | Qué vigila | Estado |
|---|---|---|---|
| **Rúbrica competitiva** | scripts/cad/rubric.mjs (798 líneas) | Calcula la nota frente a AutoCAD 2027 leyendo ubric.json y verificando evidencia contra el árbol | Vivo, informativo (no bloquea merge) |
| **Integridad de comandos** | scripts/cad/check-command-integrity.mjs (145 líneas) | 300 comandos del registro: ninguno en ROJO (éxito sin efecto). 9 exentos declarados | Gate bloqueante |
| **Dominio industrial** | scripts/cad/check-no-industrial-domain.mjs (343 líneas) | Nada de vocabulario ERP/MES (takt, yamazumi, etc.) | Gate bloqueante |
| **Presupuesto monolito** | scripts/cad/check-monolith-budget.mjs (241 líneas) | Layout3DEditor.tsx: ≤23 560 líneas, useState ≤73. Archivos nuevos ≤800 | Gate bloqueante con trinquete |
| **Autorización handlers** | scripts/cad/check-handler-authorization.mjs (187 líneas) | Todo handler HTTP declara @Public o @RequirePermissions | Gate bloqueante |
| **Contrato OpenAPI** | scripts/cad/check-design-contract.mjs (325 líneas) | Biyección OpenAPI ↔ SDK ↔ Nest para 9 módulos de controllers | Gate bloqueante |
| **Claves JSON duplicadas** | scripts/cad/check-json-duplicate-keys.mjs (236 líneas) | Scan textual (no parse) de manifiestos versionados | Gate bloqueante |
| **Cobertura cinta** | scripts/cad/check-ribbon-coverage.mjs (81 líneas) | Todo comando cae en pestaña o está declarado no expuesto | Gate bloqueante |
| **Precisión UTM** | scripts/cad/check-precision-evidence.mjs (36 líneas) | Recomputa sonda de coordenadas grandes y verifica contra JSON | Gate bloqueante |
| **Matemática CAD** | scripts/cad/check-cad-math.mjs (197 líneas) | Suites de verificación numérica contra oráculo independiente | Gate bloqueante |
| **Manifest auditoría** | scripts/cad/check-auditoria-manifest.mjs (127 líneas) | Archivos en e2e/auditoria declarados en manifiesto, techo sólo baja | Gate bloqueante |
| **Localizadores E2E** | scripts/cad/check-e2e-localizadores.mjs (220 líneas) | No hay getByTitle ambiguo fuera de la fixture de cámara | Gate bloqueante |
| **Sin línea de ingeniería** | scripts/cad/check-no-line-engineering.mjs (123 líneas) | Prohíbe engineering:* y AXOS_DIM/MLEADER/BLOCK fuera de legacy/ | Gate bloqueante |

### 1.3 Scripts de evidencia y medición

| Script | Evidencia que produce |
|---|---|
| cad/ui-command-reach.mjs | docs/cad/evidence/ui-command-reach.json — comandos alcanzables con ratón |
| cad/touch-support-evidence.mjs | docs/cad/evidence/touch-support.json |
| cad/sheet-set-publish-evidence.mjs | docs/cad/evidence/sheet-set-publish.json |
| cad/review-concurrency-evidence.mjs | docs/cad/evidence/review-concurrency.json |
| cad/point-cloud-scale-evidence.mjs | docs/cad/evidence/point-cloud-scale.json |
| cad/plot-fidelity-evidence.mjs | docs/cad/evidence/plot-fidelity-slo.json |
| cad/mexican-drafting-standards-evidence.mjs | docs/cad/evidence/mexican-drafting-standards.json |
| cad/live-presence-evidence.mjs | docs/cad/evidence/live-presence.json |
| cad/dense-editing-evidence.mjs | docs/cad/evidence/cad-dense-editing-100k.json |
| cad/document-limits.mjs (483 líneas) | docs/cad/evidence/document-limits.json — límites de documento/IndexedDB |
| cad/build-command-manifest.mjs (309 líneas) | command-manifest.ts — metadatos de comandos generados |
| cad/build-sketchup-migration-matrix.mjs | docs/cad/evidence/sketchup-migration-matrix.json |
| cad/build-pdf-import-corpus.mjs | docs/cad/evidence/pdf-import-corpus-matrix.json |
| cad/build-dxf-external-corpus.mjs | docs/cad/evidence/dxf-external-corpus-matrix.json |
| cad/build-dxf-property-matrix.mjs | docs/cad/evidence/dxf-property-loss-matrix.json |
| cad/audit-repair-matrix-evidence.mjs | docs/cad/evidence/audit-repair-matrix.json |
| cad/api-load-tests.mjs | docs/cad/evidence/api-load-tests.json |
| perf/slo-navegador.mjs (707 líneas) | rowser-slo-100k.json, cad-dense-editing-100k.json |
| perf/bundle-budget.mjs (267 líneas) | Presupuesto de bundle por ruta, trinquete |
| perf/curve-kernel-render-bench.mjs | docs/cad/evidence/curve-kernel-render-100k.json |
| wasm/wasm-parity-evidence.mjs (385 líneas) | docs/cad/evidence/wasm-parity.json |
| dwg/dwg-evidence.mjs | docs/cad/evidence/dwg-*.json (múltiples) |

### 1.4 Scripts de infraestructura/operaciones

| Script | Función |
|---|---|
| doctor.mjs (201 líneas) | Diagnóstico de entorno para quien clona (Node, workspaces, pg, puertos) |
| ranch-audit.mjs (100 líneas) | Auditoría semanal de ramas remotas (clasifica por contenido) |
| check-lint-budget.mjs (125 líneas) | Trinquete de avisos de lint por archivo, no sólo por regla |
| check-dependency-licenses.mjs (268 líneas) | Gate de licencias: SBOM CycloneDX, bloquea GPL/AGPL/SSPL |
| check-proprietary-governance.mjs (418 líneas) | Verifica gobernanza: UNLICENSED, private:true, LICENSE, NOTICE, CODEOWNERS |
| check-import-direction.mjs (76 líneas) | lib/ no importa de components/ ni de app/ |
| check-self-hosted-fonts.mjs (175 líneas) | Build no depende de Google Fonts en tiempo de compilación |
| ops/backup.mjs (241 líneas) | Backup consistente de PostgreSQL con inventario verificable |
| ops/restore-verify.mjs | Verificación post-restauración |
| ops/outbox-replay.mjs | Replay de outbox para debugging |
| ops/check-alerts.mjs | Verificación de alertas operativas |
| ops/pg-tools.mjs | Herramientas PostgreSQL |
| ops/webhook-replay-audit-evidence.mjs | Evidencia de auditoría de replay de webhook |

### 1.5 Huecos en scripts

1. **No hay spec para doctor.mjs** en el sentido estricto — sí existe doctor.spec.mjs pero no pude verificar su cobertura completa. Los scripts de ops (backup, restore, outbox-replay) no tienen specs.
2. **Scripts de evidencia sin --check/--write simétricos**: algunos scripts de evidencia (touch-support, sheet-set-publish, live-presence, etc.) generan JSON pero su mecanismo de recomputación y verificación no es uniforme — check-command-integrity y check-precision-evidence sí recomputan; otros parecen write-once.
3. **cad/distancia-probe.mts** referenciado en distancia-autocad-completo-20260903.md no aparece como .mjs — es un .mts ejecutado con 	sx, fuera del inventario de scripts .mjs.

### 1.6 Redundancias y deudas

- **ubric.mjs (798 líneas)** está cerca del tope de 800 líneas. Ya se extrajo ubric-report.mjs (253 líneas) y ubric-history.mjs (78 líneas) por el presupuesto del monolito. La separación es correcta; la deuda es que ubric.mjs sigue siendo el archivo más grande de scripts/.
- **slo-navegador.mjs (707 líneas)** es el segundo más grande. Sus 707 líneas incluyen validación de GPU, ejecución de Playwright, cruce de corridas y escritura de artefacto — todo en un solo archivo.
- **alidate-dockerfiles.mjs (583 líneas)** y **document-limits.mjs (483 líneas)** son los terceros y cuartos más grandes. Ninguno viola el tope de 800 pero merecen vigilancia.
- **Patrón repetido**: ~15 scripts de evidencia siguen el mismo patrón importa tsx, ejecuta sonda, escribe JSON con variaciones menores. No hay un helper compartido (unProbeAndWrite); cada uno replica la lógica de execFileSync, timeout, maxBuffer y escritura condicional. Esto es deuda técnica menor pero acumulable.

---

## 2. PRUEBAS DE NAVEGADOR (pps/web/e2e/)

### 2.1 Resumen cuantitativo

| Subdirectorio | Archivos .spec.ts | Rol |
|---|---|---|
| e2e/golden/ | 147 | Pruebas de regresión: defienden comportamiento verificado |
| e2e/real/ | 16 | Contra API real + PostgreSQL (flujo completo, offline, 3D, DWG) |
| e2e/performance/ | 7 | Presupuestos de viewport, fuzzing, memoria, edición densa |
| e2e/a11y/ | 3 | axe-core sobre estudio, superficies públicas, teclado |
| e2e/auditoria/ | 5 (excluidas del runner) | Defectos confirmados rojos a propósito, con trinquete |
| e2e/ (raíz) | 3 | Dashboard: viewer RBAC, document lifecycle, DWG import beta |
| e2e/commercial/ | 1 | legal-acceptance-gate |
| e2e/public/ | 2 | mobile-accessibility, demo-studio |
| e2e/fixtures/ | 23 | Fixtures compartidos (mock-backend, identity, camera, etc.) |
| **TOTAL** | **~182 specs + 23 fixtures** | |

### 2.2 Golden tests (147 archivos)

Los goldens son el corazón de la calidad. Numerados del 10 al 162+ (con huecos en la numeración). Cubren:

- **Dibujo 2D**: entidades nativas (10), selección profesional (12), entrada dinámica (13), hatch asociativo (14), MTEXT nativo (15), dimensiones asociativas (16)
- **Comandos**: línea de comandos (44), modify (45), mirror (45), trim-fence (123), angle-units (124), designate-keywords (121)
- **BIM**: wall (53), wall-joins (54), wall material lifecycle (58), alzado muro nativo (140)
- **3D**: sólidos (47), primitivas de sólido (73), empujar cara (66), importar modelo (65), diagnósticos sólido 3D (60)
- **Layout y publicación**: layout-plot (46), publicar y seguir guardando (71), conjunto de planos (89), project delivery (61)
- **Bloques**: blocks-insert (46), block nombre existente redefine (70), bloques redefinir con punto base (69), bloque dinámico (96)
- **Revisión**: review-link-guest (56), anchored-comments (55)
- **Auditoría graduada**: 101–118 (14 pruebas migradas de auditoria/)
- **Primeros minutos**: primeros cinco minutos (55), primera hora plano ajeno (88), diez segundos (85), reconocimiento (86)
- **UX**: nada tapa el lienzo (68), nada tapa un control (67), ribbon-mouse-only (61)
- **Interoperabilidad**: DXF schema4 export (46), xref manager (47), xattach tecleado (87)
- **LISP**: appload (47), AutoLISP runtime
- **Outlier**: hay 3 archivos con prefijo 61- (ribbon-mouse-only, project-delivery, audit-repair) y 3 con prefijo 46- y 3 con 47- — colisiones de numeración que no rompen el runner pero indican que el esquema de numeración manual tiene fricción.

### 2.3 Pruebas reales (16 archivos)

Requieren E2E_REAL_API=1 y PostgreSQL. Flujo completo:

| Archivo | Qué cubre |
|---|---|
| primera-hora.spec.ts (265 líneas) | Registro, verificación, primer plano abierto, cronometrado |
| jornada-real.spec.ts | Jornada completa de trabajo |
| studio-real-api.spec.ts | CRUD documentos contra API real |
| cad-acceptance-projects.spec.ts | Proyectos de aceptación |
| cad-conflict-per-document.spec.ts | Conflictos CAS por documento |
| cad-recovery-lanes.spec.ts | Carriles de recuperación |
| cad-offline-multitab.spec.ts | Offline + multipestaña |
| cad-presencia-viva.spec.ts | Presencia en tiempo real |
| cad-3d-m1-real.spec.ts | 3D milestone 1 contra API real |
| dwg-import-real.spec.ts | Importación DWG beta |
| movil.spec.ts | Experiencia móvil |
| llamada-webrtc-real.spec.ts | Llamada WebRTC real |
| ree-launch-funnel.spec.ts | Embudo de alta gratuita |
| commercial-fiscal-checkout.spec.ts | Checkout fiscal |
| errores-en-espanol.spec.ts | Errores en español |
| cables-sueltos.spec.ts | Auditoría de cables sueltos |

### 2.4 Pruebas de performance (7 archivos)

| Archivo | Qué mide |
|---|---|
| cad-viewport-100k.spec.ts (335 líneas) | Presupuesto viewport 10k/100k con fidelidad, trinquete |
| cad-dense-editing-100k.spec.ts | Estrés de edición densa a 100k entidades |
| cad-render-browser.spec.ts | Render en navegador |
| cad-import-fuzzing.spec.ts | Fuzzing de importación |
| cad-editor-memory-cycles.spec.ts | Ciclos de memoria del editor |
| rontend-load-budget.spec.ts | Presupuesto de carga inicial |
| interaccion-estudio.spec.ts | Latencia de interacción |

### 2.5 Pruebas de accesibilidad (3 archivos)

- xe-estudio.spec.ts (129 líneas): axe-core sobre el editor real (light/dark), serias+críticas+moderate. 0 violaciones.
- xe-superficies.spec.ts: axe sobre embudo y cuenta (superficies públicas).
- 	eclado-embudo.spec.ts: navegación por teclado del embudo.

### 2.6 Pruebas de auditoría (5 archivos, excluidas del runner)

Sistema innovador con trinquete:

- manifiesto.json: techo actual = 5 (sólo baja). De 28 al nacer → 5 por graduaciones sucesivas.
- 3 arnés (00-arranque, planta, precision): en verde, protegen el terreno.
- 2 con defecto vivo (acotar, refutacion-panel-bloques-designar).
- Graduación: cuando el defecto se arregla, la prueba se muda a e2e/golden/ y el techo baja.

### 2.7 Huecos en E2E

1. **No hay prueba E2E para FLATSHOT**: mencionado como exento en command-integrity (9 exentos totales). FLATSHOT, SOLPROF y VPOINT/VSCURRENT están fuera del alcance probado.
2. **No hay E2E para el flujo de subscripciones/entitlements**: cad-acceptance-projects y commercial-fiscal-checkout cubren parcialmente, pero el flujo trial → expiración → denegación de acceso no tiene golden dedicado.
3. **Numeración colisionada**: los prefijos 61-, 46-, 47- tienen 3 archivos cada uno. No rompe Playwright pero dificulta la referencia verbal (el golden 47).
4. **Sin E2E para WebRTC en golden**: llamada-webrtc-real.spec.ts existe sólo en eal/, requiere API real. No hay regresión de la señalización en el runner estándar.
5. **e2e/commercial/ tiene 1 solo archivo** (legal-acceptance-gate). El embudo comercial completo no tiene cobertura golden.

### 2.8 Redundancias y deudas

- **Fixtures**: 23 archivos en ixtures/ es un ecosistema maduro. mock-backend.ts y cad-v1-backend.ts son los más usados; la separación es correcta.
- **dashboard-viewer-rbac.spec.ts, dashboard-document-lifecycle.spec.ts, dashboard-dwg-import-beta.spec.ts** están en la raíz de e2e/, sin subdirectorio temático. Podrían moverse a e2e/dashboard/ para consistencia.
- **El informe uditoria-cliente-final-20260901.md** documenta 22 defectos, el manifiesto tiene 5 pruebas (3 arnés + 2 defecto vivo). Los 15 restantes fueron graduados a golden o no se automatizaron. La deuda es que algunos defectos del informe (como el SCU inclinado o el CAS de publicación) no tienen golden dedicado tras graduación — están cubiertos implícitamente.

---

## 3. RÚBRICA, EVIDENCIA Y GOBERNANZA

### 3.1 docs/competitive/ — Rúbrica competitiva

| Archivo | Rol | Estado |
|---|---|---|
| ubric.json (4 668 líneas) | Fuente de verdad de la rúbrica: 9 grupos, 309 puntos totales, DOS denominadores (HOY/DESTINO) | Vivo, versión 2026-09-06.1 |
| utocad-2027-gap-matrix.md (401 líneas) | Matriz fila a fila generada por ubric.mjs --markdown | Generado, NO editar a mano |
| liston-autocad-completo.md (685 líneas) | Qué es AutoCAD completo: referencia escrita SIN abrir el repo | Estático, documento de alcance |
| distancia-autocad-completo-20260903.md (1 569 líneas) | Re-medición con sonda automática: 9 áreas, 243 comandos | Informe puntual |
| distancia-autocad-completo-20260901.md | Primera medición manual | Informe puntual (antecesor) |
| uditoria-cliente-final-20260901.md (175 líneas) | 10 recorridos de despacho, 22 defectos confirmados | Informe puntual |
| history/ (8 JSONs) | Serie temporal de la rúbrica: cortes desde 2026-08-09 | Generado por ubric.mjs --history |
| history/README.md (45 líneas) | Formato y reglas de la serie temporal | Documentación |

**Estado de la rúbrica** (ubric.json:7): 309 puntos totales. Corte 2026-09-06.1. DOS denominadores publicados siempre con etiqueta:
- **HOY** (scope:hoy): flujo diario de dibujo 2D técnico.
- **DESTINO** (todas): AutoCAD completo con siete toolsets.

Cifras citadas en distancia-autocad-completo-20260903.md:41-42:
- HOY: 175/197 (88,8 %)
- DESTINO: 225/271 (83 %)

### 3.2 docs/cad/evidence/ — Evidencia versionada

**51 archivos JSON + 2 Markdown**. Cada uno producido por un script específico y verificable contra el árbol.

| Familia | Archivos | Patrón de verificación |
|---|---|---|
| DWG (codec) | 17 | Producidos por scripts/dwg/ — corpus, roundtrip, fuzz, fields |
| CAD (producto) | 18 | Producidos por scripts/cad/ — command-integrity, SLO, math, document-limits |
| Performance | 5 | Producidos por scripts/perf/ — browser-slo, render, dense-editing |
| WASM | 1 | wasm-parity.json |
| DXF/intercambio | 4 | Property loss, external corpus, corpus terceros |
| Otros | 6 | Webhook replay, UI reach, touch, template gallery, etc. |

**Patrón de integridad**: Los artefactos de evidencia más importantes siguen el patrón:
1. Script produce JSON (--write)
2. Gate recomputa y verifica contra el JSON committeado (--check)
3. Si difieren, el gate falla (la evidencia no puede envejecer en silencio)

Ejemplos: check-command-integrity.mjs, check-precision-evidence.mjs, ui-command-reach.mjs, uild-command-manifest.mjs.

**Hueco**: Algunos JSONs de evidencia DWG (dwg-r2010-*.json, dwg-mtext-fields.json, etc.) se producen por scripts de sonda pero su mecanismo de re-verificación no es uniforme — algunos recomputan, otros parecen write-once.

### 3.3 docs/governance/ — Gobernanza propietaria

| Archivo | Líneas | Rol |
|---|---|---|
| README.md | 28 | Índice: describe cada archivo del directorio |
| PROPRIETARY_CONTRIBUTIONS.md | 78 | Política de admisión y cesión de contribuciones externas |
| ASSISTED_DEVELOPMENT.md | 53 | Uso de IA: registro obligatorio, adopción humana |
| ssisted-development-log.json | — | Registro versionado de cambios asistidos |
| REPOSITORY_PROTECTION.md | 105 | Controles de GitHub para propietario único |
| epository-protection-baseline.json | 91 | Captura auditable de configuración remota |
| DEPENDENCY_LICENSE_REVIEW.md | 27 | 5 componentes pendientes de decisión (sharp, axe-core, lightningcss) |
| CONTRIBUTOR_IP_ASSIGNMENT_TEMPLATE.md | — | Borrador de CLA (no ejecutado) |

**Estado real de la gobernanza**:

1. **Modelo**: propietario único (Sergio Valle Zárate). Sin segundo revisor humano.
   - epository-protection-baseline.json:27-33: governanceModel.kind: sole-human-owner, humanContributors: 1

2. **Visibilidad**: PÚBLICA, contradice LICENSE/NOTICE que declaran propietario.
   - epository-protection-baseline.json:6-14: isibilityContradictsNotice: true, decisión pendiente del titular (P0-1)

3. **Protección remota**: Branch protection clásica con 3 checks requeridos.
   - epository-protection-baseline.json:37-41: Contrato+Build+Test+Lint+Smoke, E2E Playwright, Gitleaks
   - enforceAdmins: false — el titular puede empujar directo a main

4. **Protocolo de merge**: squash merge, sin force-push, 6 gates locales.
   - epository-protection-baseline.json:51-63: check:cad, check:dwg, typecheck, test, lint, build

5. **Licencias pendientes**: 5 componentes requieren decisión humana.
   - DEPENDENCY_LICENSE_REVIEW.md:7-14: @img/sharp-wasm32, axe-core, lightningcss (LGPL/MPL)

6. **Topología**: 2 repos del mismo titular.
   - Sergiovalle3121/valle-design (producto) + Sergiovalle3121/valle-design-dwg-conformance (corpus DWG)

### 3.4 Huecos en gobernanza

1. **Visibilidad P0 no resuelta**: epository-protection-baseline.json:14 registra la contradicción como pending-owner-decision desde 2026-08-22. A 15 días sin decisión registrada.

2. **Sin transición documentada para contribuidor externo**: El plan existe escrito (REPOSITORY_PROTECTION.md:74-80) pero no tiene checklist ejecutable ni fecha.

3. **ssisted-development-log.json**: No pude verificar su tamaño o contenido actual, pero su existencia es requerida por check-proprietary-governance.mjs.

4. **DEPENDENCY_LICENSE_REVIEW.md**: Las 5 dependencias pendientes llevan desde la fundación sin decisión registrada. No es bloqueante (son dev/optional) pero es deuda visible.

---

## 4. CORTES TRANSVERSALES

### 4.1 Trinquetes del repositorio

El proyecto usa trinquetes (ratchets) de forma extensiva y consistente:

| Trinquete | Mecanismo | Archivo clave |
|---|---|---|
| Monolito | Líneas y useState sólo bajan | scripts/cad/monolith-budget.json |
| Lint | Avisos por archivo sólo bajan | scripts/lint-budget.json |
| Bundle | KB gzip por ruta sólo bajan | scripts/perf/bundle-budget.json (referenciado) |
| Auditoría | Techo de pruebas rojas sólo baja | pps/web/e2e/auditoria/manifiesto.json |
| Rúbrica | Sin evidencia, cero puntos | docs/competitive/rubric.json |
| Command integrity | Exenciones sólo se retiran | scripts/cad/command-integrity-exemptions.json |

### 4.2 Cadena de evidencia

`
Script de sonda (--write)
  → JSON en docs/cad/evidence/
    → Gate (--check) recomputa contra el árbol
      → Si difiere, CI falla
`

Esta cadena es el patrón más maduro del proyecto. Los 51 JSONs de evidencia son verificables, no declaraciones muertas.

### 4.3 Archivos más grandes (vigilancia monolito)

| Archivo | Líneas | Tope |
|---|---|---|
| scripts/cad/rubric.mjs | 798 | 800 (2 de margen) |
| scripts/perf/slo-navegador.mjs | 707 | 800 |
| scripts/deploy/validate-dockerfiles.mjs | 583 | 800 |
| scripts/cad/document-limits.mjs | 483 | 800 |
| scripts/check-proprietary-governance.mjs | 418 | 800 |

---

## 5. HUEGOS RESUMEN

### Críticos
1. **Visibilidad pública sin decisión** (P0 desde 2026-08-22): código propietario visible.
2. **9 comandos exentos en command-integrity**: ATTEDIT, CHAMFEREDGE, COGO, FILLETEDGE, FLATSHOT, SCALE, SOLPROF, VPOINT, VSCURRENT — todos 3D/avanzados.

### Medios
3. **Sin E2E golden para subscripciones/entitlements** completos.
4. **Colisiones de numeración golden**: 61-x3, 46-x3, 47-x3.
5. **5 dependencias pendientes de revisión legal** (sharp, axe-core, lightningcss).
6. **Algunos JSONs de evidencia DWG sin re-verificación automática**.

### Bajos
7. **dashboard-*.spec.ts** sin subdirectorio temático.
8. **Patrón de script de evidencia replicado** sin helper compartido.
9. **distancia-probe.mts** es .mts, no .mjs — fuera del inventario de scripts.
10. **Flujo WebRTC** sin golden de regresión (sólo real).

---

## 6. REDUNDANCIAS

1. **distancia-autocad-completo-20260901.md y 20260903.md**: dos informes del mismo eje, el segundo re-mide al primero. No son redundantes (serie temporal), pero 20260901 podría archivarse a docs/history/ si ya no se consulta.

2. **ubric.mjs + ubric-report.mjs + ubric-history.mjs + ubric.spec.mjs**: 4 archivos para la rúbrica. La separación está justificada por el tope de 800 líneas, pero la dependencia circular (rubric.mjs ↔ rubric-report.mjs, runtime-only) es un riesgo latente.

3. **Evidencia DWG dual**: scripts/dwg/ produce JSONs que scripts/dwg/check-oracle-evidence.mjs verifica. Separado de la cadena CAD principal. Correcto por aislamiento de dominio, pero la duplicación del patrón de verificación (write/check) sin helper compartido es deuda menor.
