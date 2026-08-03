# ADR-0004: DXF parcial y entrada condicionada de DWG

- Estado: aceptado
- Fecha: 2026-08-02

## Contexto

El repositorio importa y exporta DXF de texto mediante TypeScript y
`dxf-parser`. Conserva varias entidades semánticas y XDATA histórica, pero
emite advertencias cuando la representación pierde información. No contiene
parser, SDK, licencia, endpoint, corpus ni prueba DWG.

## Decisión

Declarar DXF nativo parcial y DWG no soportado. La UI debe rechazar `.dwg` de
forma explícita; renombrar un archivo o un DXF no crea compatibilidad DWG.

La importación DXF/JSON se procesa con límites de tamaño, tiempo y estructura,
produce el documento canónico y conserva warnings/loss manifest. Una promoción
de fidelidad exige corpus autorizado, round-trip y pruebas de las entidades
afectadas, no sólo que el parser acepte el archivo.

DWG sólo podrá habilitarse mediante un proveedor autorizado cuyo SDK y licencia
permitan uso y distribución. Antes se requieren revisión legal y de seguridad,
acuerdo de tratamiento de planos, aislamiento y límites del conversor, SBOM,
corpus autorizado, fuzzing, round-trip, tenancy y E2E. El proveedor será un
adaptador; `CadDocument` seguirá siendo la fuente canónica.

## Consecuencias

Documentación, marketing y UI no pueden decir “compatible con DWG”. DXF se
ofrece con el alcance y las pérdidas visibles. Un archivo desconocido nunca se
envía silenciosamente a un tercero.

## Alternativas rechazadas

- Parser DWG por ingeniería inversa sin autorización.
- Binario opaco sin licencia o SBOM.
- Conversión externa sin acuerdo de datos y aislamiento tenant-safe.
- Claims de compatibilidad basados únicamente en una exportación feliz.
