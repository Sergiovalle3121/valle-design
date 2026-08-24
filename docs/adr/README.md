# Decisiones de arquitectura (ADR)

El índice completo con una línea y el estado de cada una. Una ADR «aceptada»
sigue vigente hasta que otra la sustituya nombrándola; nada de aquí caduca en
silencio. Formato: `NNNN-titulo.md`, estado en la segunda línea.

| ADR | Una línea | Estado |
| --- | --- | --- |
| [0001](0001-standalone-identity-boundary.md) | Identidad first-party propia: el producto no delega su login en el origen del que se extrajo. | Aceptada |
| [0002](0002-contract-first-api-and-sdk.md) | El contrato OpenAPI manda: la API `/v1` y el SDK se generan de él, nunca al revés. | Aceptada |
| [0003](0003-native-kernel-and-rust-wasm-entry-gate.md) | Un solo kernel canónico en TS; Rust/WASM entra únicamente por su gate de paridad numérica. | Aceptada |
| [0004](0004-dxf-native-dwg-authorized-provider.md) | DXF propio y honesto sobre sus límites; DWG sólo entra por proveedor autorizado o códec probado. | Aceptada |
| [0005](0005-organization-id-is-tenant-id.md) | `organization.id` ES el tenant: una sola noción de aislamiento en toda la pila. | Aceptada |
| [0006](0006-transactional-outbox-signed-webhooks.md) | Los eventos salen por outbox transaccional y los webhooks van firmados. | Aceptada |
| [0007](0007-dwg-clean-room-experimental-research.md) | El laboratorio DWG es clean-room y vive AISLADO del producto (hoy: repo `valle-design-dwg-conformance`). | Aceptada |
| [0008](0008-receptor-outbox-en-api.md) | El receptor del outbox corre dentro de la misma API: un proceso menos que operar. | Aceptada |
| [0009](0009-dwg-promotion-package.md) | Paquete de evidencia para promover el códec DWG propio a producto. | Aceptada — firmada 2026-08-24, alcance acotado a la beta `AC1015_MODELSPACE_2D_V1` |
| [0010](0010-identificadores-persistidos-congelados.md) | Los identificadores persistidos heredados están CONGELADOS: renombrarlos rompe documentos de clientes. | Aceptada |
| [0011](0011-migracion-aditiva-invariante.md) | La migración aditiva del documento canónico es INVARIANTE del producto: abrir viejo sin perder un campo, para siempre. | Aceptada |
| [0012](0012-dwg-doble-via.md) | DWG a doble vía: licenciar para VENDER, códec propio para POSEER, con criterio de cambio escrito. | Aceptada — vía licenciada sustituida por 0013 |
| [0013](0013-dwg-via-propia-unica.md) | DWG a vía única propia: se retira el proveedor licenciado que ADR-0012 dejaba abierto. | Aceptada |

## Cómo se añade una

Copia el formato de cualquiera (Contexto → Decisión → Consecuencias), número
siguiente, estado inicial `Propuesta`, y una fila aquí. La decisión que
contradiga a otra la nombra y la marca «Sustituida por NNNN».
