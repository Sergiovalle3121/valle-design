# Arquitectura

## Límites del sistema

Valle Design es un CAD 2D general y universal (ver [`IDENTITY.md`](IDENTITY.md)),
desplegable como una aplicación standalone de dos procesos y una base de datos:

1. `apps/web`: Next.js/React, el dashboard y el estudio CAD. El editor usa un
   documento canónico TypeScript, command bus, historia acotada, índices y
   proyecciones Three.js.
2. `apps/api`: NestJS y TypeORM. Los módulos de identidad, organizaciones,
   comercial, CAD, blobs y auditoría comparten transacciones PostgreSQL.
3. PostgreSQL 16: fuente de verdad para usuarios, sesiones, organizaciones,
   membresías, trials, entitlements, rate limits, outboxes, proyectos,
   documentos, versiones, publicaciones, comentarios, auditoría y blobs.

SQLite es un adaptador de conveniencia para desarrollo de un solo proceso. No
implementa las garantías de migración, concurrencia, rate limiting compartido
ni leases `SKIP LOCKED` requeridas en producción.

## Contratos y clientes

`packages/contracts/specs/design-api.v1.yaml` define la API HTTP completa bajo
`/v1`. `packages/design-sdk` se genera desde ese YAML y usa cookies first-party
con `credentials: "include"`; en mutaciones envía el CSRF obtenido por el
navegador. Un gate compara OpenAPI, SDK y router Nest para detectar rutas
faltantes, clientes manuales divergentes y regresiones al namespace legacy.

## Flujo de confianza

```text
navegador
  -> cookie de sesión opaca + cookie/header CSRF
  -> IdentityService valida hash, expiración y revocación
  -> OrganizationAccessService verifica membresía activa
  -> organization.id se deriva como tenant_id
  -> PermissionsGuard comprueba RBAC + design.cad vigente
  -> TenantContext/Repository aplican el scope
  -> transacción PostgreSQL
```

La contraseña se guarda con Argon2id. Sesiones y tokens de un solo uso se
persisten por hash. Verificación, recuperación, revocación y auditoría se
ejecutan de forma transaccional. Los endpoints de recuperación no revelan si
una cuenta existe. En PostgreSQL, el rate limiter usa contadores atómicos
compartidos; las claves son HMAC opacas para no guardar correos o IP sin
protección en la tabla.

Los review links son una excepción deliberada: se guardan por hash, expiran y
son revocables. Al canjearse producen un contexto sintético, de solo lectura y
acotado a un documento; no se convierten en una sesión normal ni aceptan un
tenant elegido por el cliente.

## Organizaciones y acceso comercial

Una organización tiene membresías `owner`, `admin`, `member` o `viewer`. El
servidor traduce el rol a permisos `cad:*`; no consume claims del navegador.
Crear una organización crea al owner, activa esa organización en la sesión y
abre un trial local del plan `standalone-trial` con `design.cad`.

Una suscripción sólo es efectiva cuando el plan está activo y su estado es
`active`, o cuando está `trialing` con `trialEndsAt` futuro. `past_due`,
`suspended`, `cancelled`, trial expirado, tenant ausente o una diferencia entre
`organizationId` y `tenantId` fallan cerrados.

## Ciclo de vida documental

El navegador abre `/v1/cad/documents/:documentId`, migra el payload al esquema
canónico, construye índices y sincroniza la escena. Cada cambio significativo
crea una entrada de historia inmutable con límites de cantidad y memoria;
operaciones agrupables conservan sharing estructural.

Autosave aplica debounce, pero comparte con el guardado manual una cola de un
solo escritor. Cada envío lleva `expectedCadDocumentVersion`. El servidor
guarda blob, documento, versión, uso y evento dentro del límite transaccional;
un CAS obsoleto revierte todo y devuelve `409`. El cliente mantiene el estado
sucio hasta guardar o resolver el conflicto.

Documentos de hasta 1 MB viajan como JSON. Por encima de ese umbral, el cliente
comprime y usa el endpoint multipart `/archive`; el servidor valida gzip,
tamaño expandido y SHA-256. `design_blobs` deduplica por tenant y hash. El API
rehidrata el documento al abrirlo, así que el puntero de almacenamiento no se
convierte en un segundo modelo público.

La importación de DXF de texto y JSON canónico ocurre en un Web Worker con
progreso, cancelación, timeout y límites estructurales. La conversión produce
el mismo `CadDocument` y conserva warnings/loss manifest. El runtime de producto
rechaza DWG.

## Outbox y efectos externos

El código que crea un email o evento escribe una fila idempotente en la misma
transacción que el cambio de dominio. Un worker PostgreSQL reclama lotes con
leases y `FOR UPDATE SKIP LOCKED`, renueva el lease durante entregas largas,
reintenta con backoff y jitter y mueve intentos agotados a `dead`.

El transporte productivo envía email y eventos a webhooks HTTPS. Firma el cuerpo
con HMAC-SHA256, incluye timestamp e idempotency key estable y ofrece entrega
at-least-once. Los receptores y el proveedor final viven fuera de este
repositorio; deben verificar firma/frescura y deduplicar antes de producir el
efecto externo.

## Interoperabilidad y asistencia

DXF es un adaptador parcial sobre el documento canónico. El loss manifest hace
explícita la semántica no representable. STEP e IGES existen para SÓLIDOS
(comandos IMPORT/EXPORT del motor, geometría facetada del kernel B-rep); DWG e
IFC no están implementados en el producto. El contrato que cualquier formato
futuro debe implementar está escrito en `docs/interop/CONTRATO-INTEROP.md`.

`packages/dwg-codec/` es el laboratorio clean-room gobernado por ADR-0007.
Su códec lee AC1015/AC1018 a la base neutral con diagnósticos y pérdidas
declaradas, y escribe un AC1015 completo aceptado por oráculo externo.
Desde ADR-0009 §6-bis (2026-08-24), ampliado el mismo día por §6-ter/§6-quater
y por §7 para AC1018, tiene un ÚNICO consumidor runtime autorizado,
`apps/web/src/lib/cad/dwg-native-reader.ts`, que expone el perfil de
importación `AC1015_MODELSPACE_2D_V3` detrás del flag
`DWG_NATIVE_IMPORT_BETA` (apagado en producción pública por defecto, gate
verificado por `scripts/dwg/check-product-boundary.mjs`); AC1018 entra al
MISMO perfil de entidades detrás de una SEGUNDA variable propia
(`NEXT_PUBLIC_DWG_AC1018_IMPORT_BETA`, también apagada por defecto). El
resto del laboratorio —1024/1027/1032, escritura— sigue sin consumidor.
Toda la vía es códec propio: ADR-0014 retiró la opción de proveedor
licenciado que ADR-0012 dejaba abierta.

No hay ningún puerto de inferencia: Valle Design no tiene IA. El proveedor
CIDE, sus servicios de intención y visión y sus rutas `/v1/cad/intent` y
`/v1/cad/vision` eran de Axos OS y se retiraron enteros (ver `IDENTITY.md`).

## Llamadas

WebRTC propio, sin SDK de terceros. La señalización (crear/unirse a una
sala, salir, oferta/respuesta/candidato ICE) vive en `/v1/calls/*`
(`apps/api/src/modules/calls/`): salas y participantes en memoria del
proceso, nunca en disco, con TTL y barrido — una llamada dura minutos, no
meses, y las señales SDP/ICE en vuelo son exactamente el tipo de dato
efímero que no pertenece a PostgreSQL. La entrega en vivo usa `@Sse`
(Server-Sent Events), no WebSocket: el volumen es de decenas de mensajes
por llamada, y esta API no tenía ningún canal en vivo antes de esto.

Audio, video y pantalla compartida viajan directo entre navegadores; el
servidor nunca los toca. `apps/web/src/lib/cad/calls/` tiene la máquina de
estados de la llamada y las políticas de reconexión ICE/pistas, puras y
probadas sin navegador; `apps/web/src/components/cad/calls/` tiene el
anfitrión que sí usa `RTCPeerConnection`/`getUserMedia`/`getDisplayMedia`, y
la barra de llamada que lo monta.

Límite declarado: malla completa (cada participante conectado a todos los
demás) topa en cuatro por sala, y WebRTC punto a punto necesita un servidor
TURN —que este repositorio no opera— para el ~15% de pares que no
atraviesan NAT directo. Sin `CALLS_TURN_URLS`, esas llamadas fallan
diciéndolo (`turnConfigured: false`) en vez de quedarse "conectando" para
siempre. Ver `DEPLOYMENT.md` § TURN para llamadas WebRTC.

## Deuda visible

- `Layout3DEditor.tsx` aún concentra demasiado estado e interacción.
- Los blobs viven por defecto como BYTEA en PostgreSQL; el adaptador S3/MinIO
  EXISTE (`apps/api/src/modules/blob-store`, con firma SigV4 propia y
  selección en runtime por las variables `S3_BLOB_*` de `.env.example`) y lo
  que falta es evidencia operativa en producción, no el código.
- El pipeline de render por lotes (`apps/web/src/lib/cad/render/`) ya está
  enchufado por defecto vía `CadViewportRenderHost`
  (`apps/web/src/components/cad/viewport/render-pipeline-host.ts`); usa LOD
  cuantizado por octava y el benchmark en Node de 100k mide con margen dentro
  de un cuadro de 16,7 ms (`docs/cad/evidence/cad-render-benchmark-100k.json`),
  pero eso es CPU en Node, no GPU ni composición del navegador — no demuestra
  interacción profesional sostenida ni 60 FPS reales. La evidencia de
  navegador (`docs/cad/evidence/browser-slo-100k.json`) es del 2026-08-21 y no
  se ha vuelto a correr desde entonces.
- No hay receptor webhook, proveedor de correo ni broker dentro del repo.
- La cobertura DXF no equivale a round-trip universal. La beta DWG
  (`DWG_NATIVE_IMPORT_BETA`, perfil `AC1015_MODELSPACE_2D_V3`, sólo
  importación) está apagada en producción pública por defecto y su
  cobertura real es exactamente ese perfil, no DWG general; no hay
  exportación DWG en ningún estado.
