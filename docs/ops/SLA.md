# Niveles de servicio y soporte

Este documento declara compromisos **que se pueden medir con lo que el sistema
ya expone**. Todo lo que aparece aquí tiene una fuente concreta: un endpoint,
una consulta o un procedimiento ejecutable. Nada está redondeado hacia arriba
para que quede bien en una propuesta comercial.

Regla que gobierna el documento: **un objetivo sin instrumento de medida no es
un objetivo, es una promesa**. Donde el instrumento todavía no existe, se dice
que no existe (§6).

---

## 1 · Definiciones

| Término | Definición operativa EXACTA |
| ------- | ---------------------------- |
| **Disponible** | `GET /health/ready` responde 200 desde al menos una réplica. Readiness y no liveness: un proceso vivo que no puede consultar la base no está sirviendo a nadie. |
| **No disponible** | Un minuto en el que ninguna réplica responde 200 a `/health/ready`, o en el que la tasa de 5xx sobre el total supera el 5 % (`sum(rate(valle_http_requests_total{status=~"5.."}[1m])) / sum(rate(valle_http_requests_total[1m])) > 0.05`). |
| **Ventana de mantenimiento** | Periodo anunciado con la antelación de la tabla §3. No cuenta como indisponibilidad. |
| **Degradación** | Servicio disponible con funciones concretas afectadas (por ejemplo, entrega de correo retrasada por backlog de outbox). Tiene objetivos propios (§4). |
| **RPO** | Máximo intervalo de datos que se puede perder ante una restauración: el tiempo entre backups verificados. |
| **RTO** | Tiempo desde la decisión de restaurar hasta que el servicio vuelve a estar disponible. |
| **Incidente Sev-1** | Servicio no disponible, pérdida o exposición de datos, o exposición cross-tenant. |
| **Incidente Sev-2** | Degradación que impide una operación de negocio (guardar, abrir, exportar, registrarse) para varios clientes. |
| **Incidente Sev-3** | Fallo acotado con solución alternativa, o afectando a un solo cliente sin bloquear su trabajo. |

Todos los tiempos son **horas hábiles** salvo donde se indique 24×7. Horario
hábil: lunes a viernes, 09:00–18:00 America/Mexico_City, excluidos los días
festivos oficiales de México (los de descanso obligatorio de la Ley Federal
del Trabajo). El operador y los clientes del producto están en México; un
horario en CET con festivos de España era una promesa medida en el huso
equivocado.

---

## 2 · Niveles por plan

| | **Piloto / Evaluación** | **Profesional** | **Empresa** |
| --- | --- | --- | --- |
| Objetivo de disponibilidad mensual | *sin compromiso* | 99,5 % | 99,9 % |
| Minutos de indisponibilidad al mes que eso permite | — | 216 | 43 |
| Canal de soporte | correo | correo | correo + canal directo |
| Cobertura | hábil | hábil | 24×7 para Sev-1 |
| Retención de backups | 7 días | 30 días | 90 días |
| Frecuencia de backup | diaria | cada 6 h | cada hora |
| Restauración de prueba verificada | trimestral | mensual | **semanal** |
| Ventana de mantenimiento anunciada con | 24 h | 72 h | 7 días |
| Informe post-incidente escrito (Sev-1) | a petición | sí, 5 días hábiles | sí, 3 días hábiles |

**Piloto no lleva compromiso de disponibilidad, y es una decisión honesta.**
El servicio no tiene todavía historial operativo suficiente para comprometer un
porcentaje: prometerlo sería inventar el número. El piloto sí lleva
procedimiento de backup, restauración verificada y respuesta a incidentes, que
es lo que de verdad protege al cliente.

---

## 3 · Objetivos de respuesta

Tiempo de **respuesta** = un humano confirma que trabaja en ello. No es tiempo
de resolución: comprometer una resolución para un fallo aún sin diagnosticar
produce o una mentira o una prisa peligrosa.

| Severidad | Piloto | Profesional | Empresa |
| --------- | ------ | ----------- | ------- |
| Sev-1 | siguiente día hábil | 4 h hábiles | **1 h, 24×7** |
| Sev-2 | 3 días hábiles | 1 día hábil | 4 h hábiles |
| Sev-3 | mejor esfuerzo | 3 días hábiles | 1 día hábil |

Compromisos de **mitigación** (no de causa raíz) para Sev-1:

| Escenario | Objetivo | Procedimiento |
| --------- | -------- | ------------- |
| Despliegue malo, esquema compatible | 15 min | `RUNBOOK.md` INC-4 → `kubectl rollout undo` |
| Base de datos caída, servidor recuperable | 30 min | `RUNBOOK.md` INC-1 |
| Restauración desde backup | ver §5 | `docs/guides/backup-restore.md` |

---

## 4 · Objetivos de rendimiento y degradación

Se miden con `GET /metrics`. Los percentiles se calculan sobre los BUCKETS
agregados de todas las réplicas (`histogram_quantile`), no promediando
percentiles por proceso — eso último daría un número que no corresponde a
ningún usuario.

| Indicador | Objetivo | Consulta |
| --------- | -------- | -------- |
| p95 de rutas de lectura | < 500 ms | `histogram_quantile(0.95, sum by (route,le) (rate(valle_http_request_duration_seconds_bucket{route!~".*content.*"}[5m])))` |
| p95 de guardado CAD | < 2 s | mismo, con `route=~".*content.*"` |
| Entrega de outbox (correo de verificación) | < 5 min p95 | `max by (queue) (valle_outbox_oldest_pending_age_seconds)` |
| Tasa de 5xx | < 0,5 % sostenida | `sum(rate(valle_http_requests_total{status=~"5.."}[5m])) / sum(rate(valle_http_requests_total[5m]))` |

Los objetivos de latencia se declaran para el API. **El rendimiento del editor
CAD en el navegador no entra en el SLA**: depende de la máquina, la GPU y el
tamaño del documento del cliente, tres variables que el operador no controla.
Las cifras de capacidad del motor están en los benchmarks del repositorio y son
informativas.

Umbrales de alerta sugeridos (los mismos números, aplicados 10 minutos):

```promql
# Sev-2: el outbox lleva más de 15 min sin drenar
max by (queue) (valle_outbox_oldest_pending_age_seconds) > 900

# Sev-2: el pool de PostgreSQL está saturado
max_over_time(valle_db_pool_connections{state="waiting"}[10m]) > 5

# Sev-1: ninguna réplica lista
absent(up{job="valle-api"} == 1)
```

---

## 5 · RPO y RTO

### Declarados por plan

| Plan | RPO (datos que se pueden perder) | RTO objetivo |
| ---- | -------------------------------- | ------------ |
| Piloto | 24 h | 8 h hábiles |
| Profesional | 6 h | 4 h |
| Empresa | 1 h | 2 h |

El RPO **es** la frecuencia de backup, y sólo cuenta si cada backup está
**verificado**: un `.dump` que nunca se restauró no reduce el RPO, sólo lo
aparenta. `scripts/ops/restore-verify.mjs` es lo que convierte el archivo en un
backup.

### Lo que se ha MEDIDO

Ejercicio real ejecutado el 2026-08-15 contra PostgreSQL 16.9 (`pg_dump`/
`pg_restore` 16.9), base `valle_design_ci`, 30 tablas, 18 migraciones:

| Fase | Medido |
| ---- | ------ |
| `pg_dump` (formato custom, esquema `public`) | 0,47 s |
| Dump resultante | 77,3 KiB |
| `pg_restore --exit-on-error` sobre base nueva | 1,98 s |
| Crear base temporal + restaurar + verificar (5 comprobaciones) | **6,86 s** |

**Esta medida NO se extrapola.** El conjunto era pequeño; el tiempo de
restauración crece con el volumen y con el número de índices a reconstruir. El
RTO de la tabla de arriba incluye el margen de decisión humana, conmutación de
conexión y revalidación, que domina sobre el tiempo de `pg_restore` en un
conjunto pequeño y deja de dominar en uno grande. **Cada cliente con RTO
comprometido necesita su propio ejercicio medido sobre su volumen real**, y ese
ejercicio es el que vale, no éste.

### Qué NO cubre el RPO

- **Efectos ya entregados.** Restaurar un snapshot antiguo devuelve la visión
  histórica del outbox: mensajes ya entregados pueden reenviarse. Por eso el
  receptor debe deduplicar por `Idempotency-Key` más allá del RPO máximo.
- **Sesiones y tokens revocados** después del snapshot vuelven a existir.
  Antes de reabrir al público hay que decidir explícitamente si se revocan
  todas las sesiones restauradas.

---

## 6 · Exclusiones y límites declarados

Se declara lo que NO se compromete, porque un SLA que no dice dónde acaba es un
SLA que se descubre roto durante un incidente.

- **No hay compromiso de disponibilidad para el plan Piloto** (§2).
- **Sin réplica en caliente.** La recuperación ante pérdida de la base pasa por
  restaurar un backup, no por conmutar a un standby. El RTO refleja eso.
- **Sin multi-región.** Una caída de la región del proveedor es una
  indisponibilidad, no un evento de failover.
- **Sin compromiso de rendimiento del cliente en navegador** (§4).
- **DWG nativo no es una capacidad del producto** (`available:false`): no
  entra en ningún nivel de servicio.
- **La asistencia CIDE es opcional y degradable.** Sin `CIDE_BASE_URL` responde
  `available:false`; su latencia y disponibilidad dependen de un proveedor
  externo y quedan fuera del SLA.
- **Métricas y reporte de errores son opt-in.** Sin `METRICS_TOKEN` no hay
  `/metrics`; sin `SENTRY_DSN` el reporte de errores es inerte. Un despliegue
  que no los active **no puede acogerse a los objetivos medidos de §4**, porque
  nadie los estará midiendo.
- **Créditos por incumplimiento:** este documento define objetivos técnicos y
  procedimientos. Las consecuencias contractuales de un incumplimiento se pactan
  en el acuerdo escrito con el cliente; aquí no se declaran porque no
  corresponde a un documento técnico inventarlas.

---

## 7 · Cómo se comprueba lo que aquí se dice

| Afirmación | Comprobación ejecutable |
| ---------- | ------------------------ |
| Los probes distinguen liveness de readiness | `apps/api/src/health/health.controller.spec.ts` |
| El apagado drena antes de cerrar | `apps/api/src/bootstrap/graceful-shutdown.spec.ts` + `scripts/deploy/production-startup-smoke.mjs` (bloque D) |
| `/metrics` está protegido y desactivado por defecto | `apps/api/src/observability/metrics.spec.ts` + smoke (bloque C) |
| Las métricas no exportan PII | `apps/api/src/observability/scrub.spec.ts` |
| Un backup se puede restaurar y verificar | `node scripts/ops/restore-verify.mjs --dump <archivo>` |
| La imagen es reproducible y no root | `node scripts/deploy/validate-dockerfiles.mjs` |
| El rollback de una migración funciona | `apps/api/src/modules/legal/legal-acceptances.pg.spec.ts` (aplica → revierte → reaplica) |

Si alguna de estas comprobaciones deja de pasar, el compromiso correspondiente
deja de estar respaldado. Actualizar este documento es parte de arreglarla.
