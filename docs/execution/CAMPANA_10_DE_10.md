# Campaña 10/10 — estado y cascada

Actualizado: 2026-08-21 · main: `da59d22` · Rúbrica: **186/200 (93 %)**
(corte `docs/competitive/history/2026-08-21-da59d22.json`)

> **Nota 2026-08-21** — Campaña de 8 h (bitácora en `CAMPANA_8H_20260820.md`,
> informe en `INFORME_CAMPANA_8H_20260820.md`): seguridad de producción
> (RLS + NOT NULL por tenant, rate limits, SSL estricto, timeouts de pool),
> cobro con CFDI 4.0 real (adaptador Facturama tras el puerto + factura
> global mensual + portal), DIMSTYLE de 30 DIMVARs con tabla en DXF, cotas
> anotativas v1, y la evidencia de rendimiento pasó de SwiftShader (45–48 s)
> a GPU real declarada (10k en 1,9 s; fila performance.browser-slo CUMPLIDA
> por contenido). La prosa de abajo es del corte 2026-08-14 y se conserva
> como historia.

Regla de oro: nada cuenta sin evidencia ejecutable (spec, golden, benchmark
con máquina, migración probada). La rúbrica no se infla; se gana.

## Hecho (agosto 13–14)

- Toolchain local completo en Windows: quality-gates reproducible sin WSL
  (6 bugs de rutas arreglados), PostgreSQL 16.9 portable, Playwright.
- Olas 5c/6/7 integradas en main con certificación local exhaustiva + push
  único; PRs #83/#84/#85 merged; #49/#28 cerrados.
- E2E local ambos navegadores: 3 arreglos reales (prefs Firefox condicionadas
  a CI tras diagnóstico A/B de crash; fixture worldPoint a lazo cerrado;
  tolerancia del golden 53 = resolución real del snap).
- Gobernanza: protección de main (3 checks requeridos, enforce_admins=false),
  Release v0.1.0-early-access, limpieza de PRs.
- DWG-1 fases A y B verdes en main: códigos de bits completos y contenedor
  AC1015 (directorio validado, CRC con respuesta conocida, centinela), con
  fuente pública ODA-ODS-5.4.1 registrada según CLEAN_ROOM_POLICY.

## Bloqueos externos

- **Billing de GitHub Actions** (pago fallido o spending limit): ningún job
  arranca. Restaurar en Settings → Billing & plans; después
  `gh run rerun <id>` sobre las corridas marcadas por billing.
- Borrado de ~31 ramas muertas: comando listo, requiere ejecución manual del
  dueño (el clasificador de permisos del agente bloquea borrados masivos).

## Cascada de fases (orden de ejecución)

### DWG-1 fase C — writer AC1015 mínimo (siguiente)
Un escritor first-party que produce archivos AC1015 válidos mínimos:
cabecera (ya semillada en la spec de fase B), secciones de variables de
cabecera/clases/mapa de objetos con CRCs y centinelas, tablas de símbolos
mínimas y model space vacío. Meta: round-trip reader↔writer byte-consistente
y fixtures deterministas legales para el corpus. DoD: `npm run check` del
paquete verde con fixtures nuevos manifiestados; CAPABILITIES sin claims
nuevos hasta validar contra corpus real.

### DWG-1 fase D — objetos y entidades núcleo
Cabecera común de objeto, LINE/POINT/CIRCLE/ARC/LWPOLYLINE/TEXT/INSERT y
tablas LAYER/LTYPE/STYLE/BLOCK_RECORD → modelo neutral → bridge de tooling
(sin import runtime del producto; frontera intacta). DoD: round-trip de
laboratorio de un dibujo sintético con geometría verificada coordenada a
coordenada. La promoción a producto sigue condicionada a revisión legal
externa (ADR-0004/0007) y corpus real con derechos.

### P1 — Rendimiento profesional
Metas en el perfil calibrado del runner (2 vCPU): detailReady 100k < 60 s
(hoy ~224 s), zoomSettle < 30 s (hoy ~110 s), sin pantalla vacía nunca.
Palancas en orden: pool de workers de teselación (hoy 1 worker singleton en
`tessellate-worker-client.ts`), INSERTs expandidos para viajar al worker
(hoy excluidos), cache de teselación persistente entre octavas de zoom,
prioridad de detalle por distancia al viewport. Evidencia: re-calibrar
`viewport-baseline.json` y `render-baseline.json` con el procedimiento
documentado del repo (9 corridas, factor 2,5).

### P3 — Comercial autoservicio
Puerto `PaymentProvider` (Null para piloto asistido — ya cubierto por
intents #83 — y Stripe: Checkout, customer portal, webhooks firmados
procesados vía outbox idempotente). Migraciones: precios por plan/moneda/
período, facturas espejo, asientos como entitlement numérico aplicado en
membresías. Correo transaccional real detrás del outbox. UI: planes,
checkout, portal, administración de miembros. E2E con claves de test.

### P4 — BIM vertical
Sobre el muro: uniones automáticas L/T con limpieza de testeros, puertas y
ventanas alojadas (recorte del anfitrión), niveles, tablas de cantidades
vivas. Cada pieza: entidad canónica + invariantes espejo API + golden.

### P5 — Deuda técnica dirigida (paralelo continuo)
Layout3DEditor.tsx 22.774→<15k por extracción de dominios (el trinquete del
monolith-budget baja en cada PR); warnings 501→0 por lotes; solver que
rechaza ediciones no convergentes; resolución CAS (renace de #28).

### P6 — Producción operable
Deploy reproducible con rollback ENSAYADO, Sentry API+web, métricas p95 y
lag de outbox con alertas, backups con restauración verificada, status page,
soporte con SLA, términos/privacidad versionados con aceptación registrada.

## Cadencia

Cada ola: rama → verde local completo → merge a main → push (una corrida
oficial) → siguiente. Con el billing restaurado, re-certificar main con
Firefox+perf en el runner calibrado antes de anunciar nada nuevo.
