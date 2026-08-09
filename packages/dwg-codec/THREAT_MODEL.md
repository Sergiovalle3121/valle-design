# Threat model del parser DWG experimental

## Alcance y activos

La frontera actual recibe un `Uint8Array` no confiable y produce un probe
discriminado con error tipado, diagnostics y un manifiesto de pérdidas vacío.
Sólo detecta la firma: no produce una object database ni `CadDocument` y no se
ejecuta en el producto durante DWG-0.

Se protegen:

- disponibilidad y memoria del proceso/worker;
- determinismo e integridad del resultado;
- aislamiento respecto a filesystem, red, telemetría y estado global;
- confidencialidad de los bytes y diagnostics; y
- integridad de los claims, fixtures y procedencia.

## Adversario y supuestos

El atacante controla cada byte, longitud, offset, orden, repetición y relación
del archivo. Puede truncar en cualquier posición, fabricar valores extremos,
duplicar o solapar secciones, crear ciclos, provocar trabajo cuadrático,
disparar descompresión excesiva o insertar contenido activo. El caller también
puede conservar y mutar el buffer durante el parseo o entregar una vista sobre
`SharedArrayBuffer` modificada concurrentemente.

No se asume que la extensión, MIME, firma reconocida, checksum o archivo
producido por software conocido sea seguro. Tampoco se asume que el runtime
tenga memoria ilimitada o que un timeout pueda interrumpir una operación
síncrona que no coopera.

## Fronteras de confianza

```text
vista no confiable
  -> rechazar SharedArrayBuffer + validar tamaño + snapshot propio
  -> detección de firma estricta
  -> versión conocida/desconocida + resultado unsupported/error
  -> [fundamentos internos] cursores/budgets/aritmética comprobada
  -X-> decoder y base de objetos completa (todavía unsupported)
  -X-> filesystem, red, comandos, OLE, scripts, URLs, CadDocument o UI
```

## Amenazas y controles requeridos

| Amenaza                | Ejemplo                               | Control verificable                                                                     |
| ---------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| Lectura fuera de rango | header o campo truncado               | Cursor acotado; error tipado con offset; truncación en cada byte                        |
| Overflow/underflow     | `offset + length`, conteos enormes    | Aritmética comprobada y conversiones seguras antes de leer/reservar                     |
| Memoria no acotada     | longitud controla array/string        | Budget inmutable; validar antes de reservar; límites de bytes expandidos                |
| CPU/tiempo no acotados | ciclos, nesting o trabajo cuadrático  | Trabajo determinista; deadline/cancel checks acotados; terminación externa del worker   |
| Mutación concurrente   | caller cambia bytes durante el parseo | Rechazar SharedArrayBuffer; validar/cobrar budget y copiar atómicamente a bytes propios |
| Confusión estructural  | secciones duplicadas/solapadas        | Validación global de rangos, unicidad y orden antes de decodificar contenido            |
| Recuperación insegura  | rellenar campos faltantes con cero    | Fallo cerrado o `unsupported`; ninguna resincronización silenciosa                      |
| Checksum falso         | CRC/sentinel corrupto                 | Validar sólo algoritmos/constantes con fuente permitida y vectores independientes       |
| Contenido activo       | macros, OLE, URL o path               | Tratar como datos opacos o rechazar; nunca ejecutar, resolver ni abrir                  |
| Exfiltración           | logs con bytes o nombres              | Diagnostics sin contenido sensible; sin red/telemetría/filesystem implícito             |
| No determinismo        | tiempo, azar o estado global          | Configuración inmutable, seed fijo y comparación exacta de resultado/error              |
| Supply chain           | codec o tabla de procedencia dudosa   | Cero dependencias runtime por defecto; registro, SBOM, licencia y revisión              |
| Claim falso            | firma aceptada se llama “importación” | Capability matrix con evidencia independiente y estados separados                       |

## Límites mínimos que el código debe exponer

`DwgLimits` es inmutable y limita por separado tamaño del archivo, memoria
concurrente, secciones, objetos, handles, referencias, profundidad, strings,
arrays, trabajo total, intervalo de polling, tiempo de pared y bytes expandidos.
Cada uno se prueba en su mínimo, máximo de perfil y un valor por encima. Un
tamaño no confiable nunca se usa para reservar antes de compararlo con el
budget; `maxFileBytes` nunca se interpreta como un permiso de RAM.

El contador de trabajo determinista es el límite reproducible del núcleo. Un
reloj inyectado y una señal de cancelación se consultan cada cantidad fija de
trabajo; su vencimiento devuelve un error tipado sin estado parcial. Además, un
supervisor solicita la terminación si un bug impide cooperar con el deadline y
espera su confirmación bajo un timer interno acotado. Si el host no confirma la
terminación, el supervisor devuelve un fallo tipado de terminación no confirmada:
eso no demuestra que el worker haya muerto y el proceso contenedor debe seguir
siendo el límite externo. Las pruebas usan reloj falso para fijar el resultado y
pruebas separadas cubren confirmación, rechazo, thenables pendientes y hostiles.
La frontera pública no puede filtrar `RangeError`, panic o excepciones sin tipar.

Las reservas del budget son estimaciones conservadoras independientes del motor,
aplicadas antes de crear copias, arreglos, mapas, sets y strings relevantes. No
son telemetría exacta del heap ni una garantía contra toda presión de GC; por eso
no reemplazan el aislamiento y límite de memoria del worker o proceso.

## Casos adversariales mínimos

- vacío y entradas de uno a cinco bytes;
- firma truncada, bytes extra y versión sintácticamente válida desconocida;
- truncación en cada byte de cada vector;
- offsets fuera de rango, suma/multiplicación con overflow y longitudes enormes;
- lecturas de bits desalineadas y límites exactos de byte;
- duplicados, solapamientos y rangos fuera del archivo cuando exista directorio;
- budgets mínimos/máximos y miles de entradas pseudoaleatorias con seed fijo;
- dos ejecuciones idénticas con resultado/error byte por byte equivalente; y
- deadline/cancelación con reloj falso y hard timeout de un worker no
  cooperativo;
- respuesta de worker incompleta, proxy hostil y resultado específico de
  operación inválido, siempre sin promover estado parcial;
- rechazo de `SharedArrayBuffer` y estabilidad ante mutación del buffer original
  después de crear el snapshot; y
- prueba estática y dinámica de ausencia de red y filesystem.

## Fuera de alcance de DWG-0

Object database completa, entidades, geometría, mapping a `CadDocument`, writer,
round-trip, macros, OLE, descompresión moderna, provider, endpoint, upload, UI y
disponibilidad productiva. La ausencia de esas rutas reduce superficie; no es
evidencia de seguridad o compatibilidad para una fase posterior.

## Riesgo residual y revisión

Fixtures sintéticos pueden ocultar una interpretación equivocada del formato.
Fuzz smoke determinista no sustituye fuzzing sostenido ni sanitizers. TypeScript
reduce complejidad de toolchain, pero requiere polling cooperativo y supervisor
para controlar tiempo y no evita presión de GC. Un parser, scheduler o
`terminate()` síncrono no cooperativo tampoco es preemptable dentro de su propio
realm; el hard timeout depende de un worker o proceso externo que el host pueda
descartar. El protocolo limita y cobra las transfer lists de requests; para
responses, el adapter y worker first-party deben cobrar y transferir cada buffer
antes de publicarlo. Su marker es una declaración fail-closed del contrato, no
una prueba contra un host malicioso. Cualquier decoder de una estructura real
permanece `experimental`
hasta validación independiente, revisión de procedencia y CI sobre el SHA exacto.
