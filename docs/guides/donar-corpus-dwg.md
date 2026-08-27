# Donar un archivo real al corpus de conformidad DWG

Escrito 2026-08-27, campaña Paridad (OLA 3.3). No inventa un procedimiento
nuevo — señala y resume el que YA existe y ya rige, `CORPUS_POLICY.md` en
`Sergiovalle3121/valle-design-dwg-conformance` (repositorio privado,
laboratorio clean-room del códec, distinto de este). Ese archivo es la
autoridad; este documento es la puerta de entrada para quien nunca lo ha
leído y no sabe por dónde empezar.

## Por qué importa

`docs/parity/ESCALERA.md` distingue el peldaño 3 ("probado con datos
propios" — el laboratorio se verifica a sí mismo) del peldaño 4
("verificado con oráculo independiente" — un archivo real, ajeno al
laboratorio, confirma el resultado). Hoy el decodificador DWG decodifica
65 tipos de entidad contra fixtures que el propio laboratorio generó
(`docs/cad/evidence/dwg-decoder-matrix.json`,
`tiposDecodificadosEnLaboratorio: 65`) — peldaño 3. Sin corpus
independiente admitido, ninguna promoción de capacidad es posible
(`dwg-evidence.mjs`: `bundlesAdmitidos ≥ 1` es condición necesaria). Un
archivo real donado con procedencia limpia es lo único que mueve una
capacidad de 3 a 4.

## Qué SÍ se puede donar

Según `CORPUS_POLICY.md` (sección "Material admisible" + enmienda
2026-08-20), en cuatro categorías:

1. **`sergio-original`** — dibujos originales del titular, sin datos de
   clientes.
2. **`donated-original`** — dibujos originales tuyos, con tu permiso
   escrito. Ésta es la categoría para un arquitecto/despacho externo.
3. **`licensed-third-party`** — material con licencia explícita que
   permita el uso concreto.
4. **`tool-converted-original`** — contenido de autoría propia
   transformado a DWG con una herramienta gratuita legítima (p. ej. ODA
   File Converter), con la fuente ASCII congelada como oráculo.

Las categorías 1, 2 y 3 exigen DOS revisores humanos; la 4 exige un
revisor-propietario más dos validaciones automáticas independientes —
lee la enmienda completa antes de asumir cuál aplica a tu caso.

## Qué NUNCA se admite (lee la lista completa en `CORPUS_POLICY.md`)

Planos de clientes o con información personal/confidencial; archivos
encontrados sin procedencia clara; código, tablas o fixtures de Autodesk,
ODA, RealDWG, LibreDWG u otros códecs; cualquier cosa bajo GPL/AGPL/LGPL/
MPL/SSPL/BUSL o términos desconocidos/restringidos. Si dudas, NO lo
mandes — pregunta primero.

## Los pasos, en orden

1. **Confirma que el archivo es tuyo de verdad.** Si es de un cliente,
   necesitas su permiso ESCRITO explícito para esta donación concreta —
   "puedes usarlo" en una llamada no basta; el gate exige el permiso como
   evidencia archivable.
2. **No lo subas a ningún lado todavía.** El repositorio del corpus tiene
   una regla de cuarentena fail-closed: nada se descarga, abre ni procesa
   mientras la revisión de derechos esté pendiente. El primer contacto es
   una descripción de qué es el archivo (herramienta y versión que lo
   creó, si tiene datos de terceros, qué permiso das sobre él) — nunca el
   binario suelto.
3. **Contacta al titular** (Sergio, único titular de derechos de los dos
   repositorios — ver `docs/governance/PROPRIETARY_CONTRIBUTIONS.md`)
   para iniciar la revisión de dos personas. Sin su aprobación y la del
   segundo revisor, el archivo no entra.
4. **Metadata, no el archivo, es lo primero que se registra** —
   herramienta/versión de creación, titular del dibujo, derechos sobre el
   output, ausencia de datos confidenciales, permiso de modificación,
   alcance de redistribución y referencia privada del acuerdo. Esto vive
   FUERA de git hasta que se apruebe.
5. **Tras la aprobación:** el fixture, su oráculo independiente y su
   manifiesto se congelan, se verifica contra `manifest.schema.json`, se
   corre `npm run check` en el repositorio de conformidad, y se fusiona
   por PR protegido. El bundle es INMUTABLE — una corrección crea un id
   nuevo, nunca reemplaza bytes bajo el mismo id.

## Lo que esto NO promete

Un corpus admitido demuestra que el decodificador lee ESE archivo
concreto correctamente — no "compatible con AutoCAD" en general, y
`CORPUS_POLICY.md` lo dice explícito para el origen `tool-converted-original`:
ODA File Converter es una implementación madura del formato, pero no es
AutoCAD. La prueba de compatibilidad con AutoCAD real llega específicamente
con bundles `donated-original` de despachos que de verdad usan AutoCAD —
que es exactamente lo que este documento existe para facilitar.

## Si trabajas dentro de `valle-design` (no eres un donante externo)

El consumidor del corpus vive en `scripts/dwg/corpus-consumer.mjs` y
`scripts/dwg/fetch-corpus.mjs` — leen el commit fijado en
`scripts/dwg/corpus-pin.json` contra `VALLE_DWG_CORPUS_MIRROR` o
`VALLE_DWG_CORPUS_TOKEN`. Sin ninguno de los dos configurados, `npm run
check:dwg-corpus` reporta honestamente `"status": "unavailable"` y cero
bundles — así debe verse en cualquier entorno sin esas credenciales (CI
las configura; un sandbox de desarrollo normalmente no).
