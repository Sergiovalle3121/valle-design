# Campaña de lanzamiento gratuito — barrido funcional total

**Fecha de arranque:** 27 de agosto de 2026 · **Base:** `main` @ `9592869`
(tras COMMERCIAL-RC1 y la campaña de paridad) ·
**Rama:** `claude/valle-design-launch-campaign-yhxse6`

> Bitácora VIVA mientras la campaña corre. Al publicar
> `INFORME_LANZAMIENTO_20260827.md` este archivo se archiva a
> `docs/history/execution/` en el mismo commit (regla del cierre de ramas,
> `AGENTS.md`).

## La vara

Un arquitecto que no conocemos, en una computadora que no controlamos, dibuja
una planta, la acota, la imprime a PDF, la exporta a DXF, y **los tres archivos
dicen la verdad**. Lo que no aguante esa vara se arregla; lo que no se pueda
arreglar hoy, **se oculta**.

## La regla que ordena todo: FIX-OR-HIDE

Cada capacidad visible pasa por una de tres puertas, y sólo tres:

| Puerta | Significado |
| --- | --- |
| **VERIFICADA** | Funciona, con evidencia numérica. Se queda. |
| **ARREGLADA** | Tenía defecto, se corrigió, hay evidencia nueva. |
| **OCULTA** | No se pudo verificar ni arreglar hoy: desaparece de la superficie hasta ganar su evidencia, con entrada en el backlog. |

Prohibido el cuarto estado: **visible y no verificada**.

## Reglas de no-detención

1. Nunca preguntar. Decidir lo más conservador, bitácora, seguir.
2. Ítem bloqueado > 25 min → bitácora + backlog + siguiente.
3. Esta bitácora se actualiza al cerrar cada ítem. Si el contexto se compacta,
   se relee primero.
4. Tras cada ola: suite completa + goldens con árbol quieto + push.
5. Prohibido: relajar gates, tocar identificadores persistidos
   (`IDENTITY.md` / ADR-0010), renombrar `data-testid`, agregar funciones nuevas.

## Cola

| Ola | Ítem | Estado |
| --- | --- | --- |
| 0 | 0.1 Trial de 90 días como experiencia de producto | pendiente |
| 0 | 0.2 Modo solo-lectura post-expiración (regla de oro: sin rehenes) | pendiente |
| 0 | 0.3 Aviso de expiración digno (banner + correos 7/1 + mensaje final) | pendiente |
| 0 | 0.4 Embudo de registro sin tarjeta medido contra el stack real | pendiente |
| 1 | 1.1 Geometría de construcción contra oráculo analítico | pendiente |
| 1 | 1.2 Modificación (TRIM/FILLET/OFFSET/ARRAY/MIRROR/ROTATE/SCALE) | pendiente |
| 1 | 1.3 Medición, interrogación y valor de las cotas | pendiente |
| 1 | 1.4 Ángulos en TODAS las fronteras entre subsistemas | pendiente |
| 1 | 1.5 Unidades y escala de punta a punta | pendiente |
| 1 | 1.6 Precisión en coordenadas grandes (UTM + lámina de papel) | pendiente |
| 2 | 2.1 La Jornada Real (E2E sin un solo mock) | pendiente |
| 2 | 2.2 La Jornada Real en CI en cada push a main | pendiente |
| 2 | 2.3 Barrido de cables sueltos en la UI | pendiente |
| 2 | 2.4 Los errores hablan español humano | pendiente |
| 3 | 3.1 Verificador de contenido del PDF | pendiente |
| 3 | 3.2 Round-trip numérico DXF + lector independiente | pendiente |
| 3 | 3.3 GLB a escala 1:1 verificado | pendiente |
| 3 | 3.4 DWG apagado y sin promesas en la superficie | pendiente |
| 3 | 3.5 Descargas en modo solo-lectura y desde review link | pendiente |
| 4 | 4.1 La primera hora de un desconocido | pendiente |
| 4 | 4.2 Botón «algo salió mal» | pendiente |
| 4 | 4.3 Telemetría mínima decente y declarada | pendiente |
| 4 | 4.4 Móvil: embudo público y dashboard | pendiente |
| 5 | 5.1 `DESPLIEGUE-RAILWAY.md` probado | pendiente |
| 5 | 5.2 Smoke post-deploy ejecutable | pendiente |
| 5 | 5.3 Respaldo diario verificado, Sentry, uptime | pendiente |
| 5 | 5.4 Aviso de privacidad y términos del modo gratuito | pendiente |
| 5 | 5.5 Los cinco fixes de producción abiertos | pendiente |
| F | F.1 Suite + Jornada Real + goldens + push | pendiente |
| F | F.2 `INFORME_LANZAMIENTO_20260827.md` | pendiente |
| F | F.3 «Lo que sólo Sergio puede hacer» | pendiente |

## Bitácora

### Arranque — mapa del terreno (antes de tocar nada)

Verificación de herencias, como manda la regla 5 («verificar herencias antes de
rehacer»):

- `TRIAL_DAYS` ya existe y su máximo ya es 90
  (`apps/api/src/modules/organizations/organization-commercial.configuration.ts:5`).
  Falta el **modo de producto**, no la variable.
- El guard de entitlement (`permissions.guard.ts`) hoy es binario: sin
  `design.cad` vigente, **403 a todo** — incluido `cad:view`, que es lo que
  usan abrir y exportar. Ésta es la regla de oro de 0.2 y está sin implementar.
- `/precios` lee el catálogo real (`PricingCatalog.tsx`); no hay precios
  escritos a mano. La oferta de fundadores tiene que entrar sin romper esa
  propiedad.
- El árbol está limpio y no hay otra sesión con cambios sin commitear
  (`git status` vacío).

