# DECISIONS — Migración CAD → valle-design

Registro de decisiones tomadas durante la migración. Formato: ID, fecha, decisión, alternativas
consideradas, razón. Las decisiones son conservadoras por defecto (Regla: no se pierde nada).

## D-001 · 2026-08-01 · PR #1445 excluido del baseline (no bloqueante)

- **Contexto**: Regla 1 exige clasificar todo PR abierto antes de elegir baseline. Único PR
  abierto: #1445 (draft) "fix(erp): invoiceSO factura exactamente una vez — candado + clave de
  efecto (O2C)".
- **Evidencia**: el diff toca exactamente 2 archivos, ambos en
  `apps/api/src/modules/erp-core/services/` (fix de concurrencia + spec Postgres). Cero rutas
  CAD, cero rutas de line-engineering/documents que la Fase 1 refactoriza.
- **Decisión**: clasificarlo EXCLUIDO/NO BLOQUEANTE y elegir baseline `main@4cf045a`. El PR
  seguirá su flujo normal de fusión en enterprise; la extracción CAD no lo pierde porque es
  trabajo ENTERPRISE_OWNED que jamás iría a valle-design.
- **Alternativa descartada**: detener la migración hasta decisión del usuario. Se descartó
  porque la regla aplica a trabajo "relevante" para la elección del baseline CAD; un fix ERP
  en erp-core no altera qué SHA contiene todo el trabajo CAD terminado. Si el usuario
  discrepa, ningún paso destructivo depende de esta decisión (el baseline puede re-elegirse
  antes de la Fase 3).

## D-002 · 2026-08-01 · Rama única de trabajo en enterprise

- **Decisión**: todo el trabajo de Fases 0–2 y 6 en valle-enterprise se desarrolla en la rama
  designada `claude/migrate-cad-valle-design-6nle2k`, con commits pequeños y atómicos por paso,
  integrable a `main` por PR (flujo existente del repo: todo entra por PR).
- **Razón**: el entorno de ejecución fija esa rama como única rama de push permitida; commits
  pequeños dentro de una rama preservan la revisabilidad que la misión pide de "ramas/PRs
  pequeños" sin violar la restricción del entorno.

## D-003 · 2026-08-01 · Respaldo durable = tag + no-reescritura + bundle local documentado

- **Contexto**: el proxy git del entorno no confirma push de tags (Regla 3 pide tag inmutable
  remoto) y el contenedor es efímero (mirror/bundle locales se pierden al reciclar).
- **Decisión**: crear tag/mirror/bundle localmente (hecho, bundle verificado), documentar rutas
  y dejar comandos exactos para que el usuario ancle el tag en el remoto y conserve una copia
  del bundle. La garantía dura es la Regla 4: `main` de enterprise jamás se reescribe.

## D-004 · 2026-08-01 · `modules/engineering` (EngineeringDocument CAD-lite) se queda en enterprise

- **Contexto**: el crítico de completitud detectó que `apps/api/src/modules/engineering/`
  persiste `EngineeringDocument` con enum `VISUAL_AID | PLANT_LAYOUT` y campos
  viewport/layers/geometry — un almacén de dibujo CAD-ligero LEGADO, anterior al CadDocument
  canónico.
- **Decisión**: ENTERPRISE_OWNED. Sirve a Visual Aids/BOM del MES; no es el producto
  CadDocument (que tiene su propio pipeline de storage gzip/CAS y validación v1–v3). Extraerlo
  arrastraría consumidores MES al repo Design.
- **Reversible**: sí — si el usuario quiere ese legado en Design, puede migrarse después vía
  exportador de Fase 4 (los datos no se tocan en esta tarea).

## D-005 · 2026-08-01 · Historia de migraciones legacy de `sf_line_layout` queda en enterprise

- **Contexto**: las migraciones legacy AddLayoutDxf/Connectors/Assets/Annotations/Snapshots/
  Cells/Approval operan sobre `sf_line_layout`, tabla MIXTA (CAD + industrial).
- **Decisión**: la historia de migraciones de enterprise queda intacta (Regla: no eliminar
  migraciones históricas). valle-design nace con migraciones `cad_*` propias (creadas en
  Fase 1) + `AddCanonicalCadDocument` (exclusivamente CAD → DESIGN_OWNED). Los datos de
  `sf_line_layout` se migran por el exportador de Fase 4 con `legacy_source_id`, no por
  replay de migraciones.

## D-006 · 2026-08-01 · Infra de pruebas compartida se DUPLICA, no se comparte

- **Contexto**: `e2e/fixtures/{session,constants,mock-backend}.ts`, `run-specs.mjs` y el
  visual-sweep sirven a todas las suites (CAD y no-CAD).
- **Decisión**: cada repo tendrá su copia adaptada. Duplicar infraestructura de test es
  aceptable; duplicar código de producto no lo es (Regla 8 aplica a auth/billing, no a
  arneses de prueba).

## D-007 · 2026-08-01 · IA CAD estrictamente opcional: sin CIDE_BASE_URL no se toca la red

- **Contexto**: cad-intent/cad-vision construían el cliente CIDE con default implícito
  `localhost:11434` aunque no hubiera configuración.
- **Decisión** (mandato de misión "el CAD debe funcionar completo sin ningún proveedor de IA"):
  el puerto `CadAiProvider` solo se materializa con `CIDE_BASE_URL` presente; sin config,
  `available:false` inmediato con el mismo payload de no-disponible que ya manejaba el
  frontend. Cambio de comportamiento deliberado y documentado: elimina intentos de red
  espurios en despliegues sin IA.

## D-008 · 2026-08-01 · Binding de tenant para persistencia NO se abstrae tras puerto

- **Contexto**: WP2c intentó que CadBlocksService tomara el tenant del puerto
  PlatformIdentityClient; el auditor tenant-safety (TS-Q005, fail-closed, no baselineable)
  solo reconoce TenantContextService/TenantScopedRepository como evidencia de binding
  autenticado — y con razón: un puerto arbitrario podría inyectar identidad no autenticada.
- **Decisión**: el estampado/filtrado de tenant en persistencia usa SIEMPRE el contexto
  autenticado de la plataforma local (TenantContextService hoy; el equivalente propio de
  valle-design tras la Fase 3). El puerto de identidad queda para propósitos no-persistentes.
  Semántica intacta (lane tenant-o-NULL de la biblioteca de bloques conservada).
