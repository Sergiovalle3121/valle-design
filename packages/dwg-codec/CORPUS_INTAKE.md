# Intake del corpus de conformidad DWG

## Separación obligatoria

`valle-design` sólo contiene fixtures redistribuibles y sus manifests. El corpus
no redistribuible vive en `valle-design-dwg-conformance`, repositorio privado
compañero creado como privado y con acceso de mínimo privilegio. La separación
permanece incluso después de privatizar el repositorio principal.

No se coloca material candidato dentro de ninguno de los repositorios antes de
completar un record de intake conforme a `corpus-intake.schema.json`. Un
candidato rechazado o en cuarentena conserva sólo metadata no técnica suficiente
para identificar el bloqueo; sus bytes no se descargan, copian, transforman ni
resumen.

## Flujo fail-closed

1. El submitter calcula SHA-256 y tamaño fuera del repositorio, asigna un ID
   opaco y declara creador, fecha, herramienta de creación y fuentes.
2. Un revisor de derechos confirma propiedad o licencia, uso permitido y, para
   el repositorio principal, redistribución expresa. La ausencia o ambigüedad de
   términos produce `rejected`.
3. Un revisor humano confirma que no hay información de clientes, secretos,
   datos personales ni material instalado o encontrado al azar.
4. Se registra un oráculo inmutable: resultado esperado, ground truth hasheado,
   herramienta/proceso autorizado y reviewer. Un resultado `ok` nunca se
   acepta sin ground truth y un oráculo aplicable.
5. El intake decide exactamente un destino: `public-fixture`,
   `private-companion` o `rejected`. No existe un destino implícito.
6. El segundo revisor, distinto del creador y de los revisores primarios,
   aprueba el record. Sólo entonces se copia el byte exacto cuyo hash fue
   revisado.

## Fixtures publicables

El destino `public-fixture` exige `redistributionAllowed:true` y una de estas
procedencias:

- sintético first-party de Valle y generador determinista versionado;
- creado o poseído por Sergio con autorización expresa; o
- tercero bajo una licencia permisiva enumerada por el schema.

El archivo se guarda en `fixtures/synthetic/` o `fixtures/authorized/` y se
añade a `fixtures/manifest.json`. Un fixture autorizado referencia records
físicos content-addressed bajo `fixtures/intake/sha256/` y
`fixtures/intake/oracles/sha256/`. `check:fixtures` verifica el conjunto físico
exacto, paths sin symlinks, hash/tamaño, derechos, privacy, cronología, segundo
revisor distinto, oracle aplicable y coherencia del probe. Un sintético sólo se
acepta si coincide byte por byte con el generador estático registrado.
`check:provenance` exige sources `allowed`; archivos técnicos nuevos requieren
además un fact permitido no-gobernanza.

Un fixture positivo expresa ground truth esperado; no declara que el reader
actual ya pase. La promoción de una celda ocurre por evidencia de matriz
separada, reproducible e independiente.

## Corpus privado

El destino `private-companion` exige derechos de uso, pero no redistribución
pública. `private-bundle.schema.json` y
`scripts/private-bundle-validation.ts` definen unicidad y correspondencia
content-addressed para bytes, intake y oracle. Sus pruebas locales no equivalen
a verificar un bundle físico.

El repositorio compañero y su CI no existen en este corte. Antes de aceptar un
bundle deberán invocar el contrato `valle-dwg-private-bundle-structure@1`,
verificar hashes, tamaños, conjunto físico exacto y ausencia de symlinks, usar
token de sólo lectura, no imprimir/subir bytes y limpiar el workspace. Hasta que
esa integración sea real y esté protegida, ningún bundle privado cuenta como
evidencia de matriz.

## Promoción y revocación

Dos validaciones independientes por versión son necesarias para `verified`.
Fixtures autocreados cuentan como consistencia interna, no como validación
independiente. Si se revoca un permiso o cambia un hash, el bundle se bloquea,
las celdas dependientes retroceden y no se reutiliza evidencia previa.

La aceptación de intake no autoriza material activo. Macros, OLE, URLs, rutas,
xrefs y payloads permanecen inertes y nunca se ejecutan o resuelven durante
validación.
