# Decisiones que solo puede tomar Sergio (campaña beta pagada, agosto 2026)

Ninguna de estas decisiones se desbloquea simulando una respuesta desde esta campaña. Cada ficha tiene: la
decisión, las opciones reales encontradas en el código/repo, una recomendación de ingeniería, y el costo/riesgo
de cada camino.

## 1. P0-A — ¿qué hacemos con el "checkout asistido"?

**Encontrado:** `commercial.controller.ts` permite a un owner/admin de la organización cliente confirmar su propio
upgrade-intent sin evidencia de pago real. No hay integración de Stripe en el código todavía (a confirmar por el
Frente A). Es diseño intencional para vender sin pasarela, no un bug introducido por accidente.

**Opciones:**
- (a) Retirar el endpoint hasta tener Stripe real. Costo: cero venta asistida hasta ese momento. Riesgo: bajo.
- (b) Crear un principal interno separado (no un usuario de la organización cliente) que confirme pagos
  externos, con auditoría obligatoria. Costo: trabajo de ingeniería adicional (nuevo rol/autenticación). Riesgo:
  medio — si el diseño del principal interno queda débil, reabre el mismo hueco con más pasos.

**Recomendación:** (a) para el piloto de invitación inicial, (b) solo si hay necesidad de negocio real de vender
sin tarjeta antes de tener Stripe operativo. Ver reporte del Frente A cuando termine para la implementación real.

## 2. P0-C — activar el rol `valle_app` no-dueño en producción

**Encontrado:** `DEPLOYMENT.md` ya documentaba esto como pendiente, no oculto. La app corre hoy como el rol
dueño de la migración, por lo que ninguna política RLS existente aplica en runtime.

**Recomendación:** aprobar la migración preparada por el Frente B solo después de revisión humana y de probarla
en un entorno con datos representativos (no producción con clientes reales todavía, dado que esta campaña es
pre-beta). Es el cambio de mayor riesgo operativo de esta ola — un rol mal configurado puede romper el acceso
legítimo de la app a sus propios datos.

## 3. Repos públicos → privados

**Encontrado:** `LICENSE`/`NOTICE` en ambos repos declaran "proprietary, closed-source" pero la visibilidad real
en GitHub no fue verificada por esta campaña (requiere `gh repo view`, que no se ejecutó automáticamente).

**Recomendación:** correr el runbook `docs/ops/runbook-repo-protection.md` cuanto antes — es una acción de
minutos con alto impacto si los repos siguen públicos.

## 4. Identidad legal, RFC, domicilio, responsable de privacidad

**No resuelto por ingeniería.** El Frente D preparará el schema de validación fail-closed y las plantillas con
placeholders, pero los valores reales (razón social, RFC, domicilio, responsable ARCO, subprocesadores,
política de reembolso/cancelación) los define Sergio, idealmente con revisión de abogado/contador.

## 5. Precio final, IVA, planes despacho/anual

**No resuelto por ingeniería.** El prompt propone MXN 199/mes piloto por invitación; confirmar si incluye IVA,
si se abren planes despacho/anual en esta ola (recomendación: no, mantener el MVP a un solo plan tarjeta
recurrente hasta cerrar el gate de beta pagada) y las cuotas de almacenamiento/versiones por plan.

## 6. Stripe: modo tarjeta-only y momento de activar modo live

**No resuelto por ingeniería.** Depende de si existe ya cuenta Stripe, y de que P0-A/P0-B estén cerrados y
verificados antes de cualquier cobro real. Recomendación: no activar modo live hasta que el gate de la sección
13 del prompt maestro esté en PASS.

## 7. Proveedor PAC/CFDI

**No resuelto por ingeniería.** Se encontró `null-cfdi.provider.ts` en el código (confirmado por la suite de
tests del baseline: `null-cfdi.provider.spec.ts` pasa) — es un stub, no una integración real. Elegir proveedor
PAC y validar sandbox/real es un paso humano-fiscal, no algo que esta campaña deba decidir.

## 8. DWG: ODA SaaS vs RealDWG/worker Windows vs posponer

**No resuelto por ingeniería.** El repo ya tiene ADR-0009 (propuesta de promoción DWG, sin firmar) y ADR-0012
(estrategia dual-track). Recomendación: no adelantar esta decisión en esta ola — el corpus actual (57 DWG/57 DXF,
100% sintético vía ODA File Converter, no AutoCAD real) no alcanza el gate de 200+ archivos reales autorizados
que exige el prompt maestro para import productivo. DWG sigue apagado.

## 9. Presupuesto de storage/monitoring/email

**No resuelto por ingeniería.** Depende de proveedor elegido (S3/R2, Sentry, proveedor de correo) y volumen
esperado de la beta de 5-10 clientes. Se puede estimar una vez que el Frente C tenga el staging Railway
diseñado, pero la aprobación del gasto es de Sergio.

## 10. 3D conceptual/facetado vs kernel geométrico exacto

**No resuelto por ingeniería en esta ola.** El prompt maestro pide un ADR comparativo antes de cualquier
inversión irreversible (sección 9). No se abrió este frente en la ola P0 — es trabajo de la Ola 2/3D, posterior
al cierre de P0.

## 11. Quién hace la revisión externa de seguridad, pagos, IP y geometría

**No resuelto por ingeniería.** Esta campaña puede producir el material (hallazgos, ADRs, evidencia) pero no
puede autoauditarse como revisión externa independiente — el propio prompt maestro lo prohíbe explícitamente
(regla 16 de la sección 3: "una campaña que produce evidencia DWG no puede aprobar ni activar su propia
promoción", extensible por espíritu a seguridad/pagos en general).
