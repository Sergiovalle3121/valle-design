# Política de contribuciones propietarias

## Titular y objetivo

Valle Design es un producto propietario, comercial y cerrado. Sergio Valle
Zárate es el titular del proyecto y de sus obras first-party, sujeto a los
instrumentos escritos que pueda celebrar posteriormente con una entidad
comercial. El repositorio no adopta una licencia open source.

Sergio es también el único contribuidor humano actual. Un cambio first-party
presentado y adoptado por él no necesita un CLA consigo mismo ni la aprobación
de otra persona. Si fue asistido por IA, Sergio revisa y adopta personalmente el
diff bajo `ASSISTED_DEVELOPMENT.md`; la herramienta no adquiere autoría ni
titularidad.

## Regla de admisión

La regla de esta sección se aplica a toda persona distinta de Sergio Valle
Zárate. No existe una excepción implícita para amistades, contratistas,
empleados futuros, cuentas automatizadas o aportaciones no solicitadas.

Una persona externa sólo puede aportar después de que el titular confirme un
acuerdo escrito y ejecutado que cubra la contribución. El instrumento aplicable
debe ser revisado para la jurisdicción y, como mínimo:

- identificar correctamente al contribuidor y, si aplica, a su empleador o
  entidad con facultad para ceder;
- describir las contribuciones cubiertas y asignar al titular los derechos de
  propiedad intelectual transferibles necesarios para usar, modificar,
  relicenciar, mantener cerrado y comercializar el trabajo;
- incluir una licencia exclusiva, irrevocable, mundial, transferible y
  sublicenciable como respaldo sólo donde una cesión no resulte eficaz, según
  lo que permita la ley aplicable;
- identificar y excluir material preexistente o de terceros, con sus términos;
- contener declaraciones de autoría, autoridad, ausencia de gravámenes y
  cumplimiento de obligaciones laborales/confidencialidad; y
- tratar derechos morales y obligaciones posteriores en la medida permitida por
  la ley aplicable.

Esta política no pretende convertir un PR o una casilla en un contrato. El
acuerdo definitivo se firma por separado y debe ser aprobado por un revisor
jurídico. DCO, `Signed-off-by` y consentimiento implícito no son sustitutos.

## Evidencia y privacidad

El acuerdo firmado, identidad legal, domicilio y demás datos personales viven
en un registro privado controlado por el titular. El PR sólo indica una
referencia interna no sensible y quién confirmó su vigencia. Si no existe esa
confirmación, el PR no se revisa ni fusiona.

## Procedencia

Cada contribuidor revela código, datos, fixtures, documentos, modelos, SDKs,
empleadores y otras fuentes usadas. No se acepta material con términos
desconocidos, incompatibles con software propietario, filtrado, descompilado o
que la persona no tenga autoridad para aportar. Las dependencias de terceros se
mantienen bajo sus propios términos y pasan SBOM/licencias.

La persona que use una herramienta de IA sigue siendo responsable de revisar el
resultado, demostrar que las entradas estaban autorizadas y adoptar el cambio.
Cuando Sergio presenta el cambio first-party, su revisión del SHA exacto, su
autorización de merge y el registro aplicable documentan esa adopción. La
herramienta no adquiere condición de autora, contribuidora jurídica ni
copropietaria; un trailer de atribución de herramienta en el commit no altera
esto (ver `ASSISTED_DEVELOPMENT.md`).

## Topología de repositorios

El proyecto vive en exactamente dos repositorios del mismo titular:
`Sergiovalle3121/valle-design` (producto) y
`Sergiovalle3121/valle-design-dwg-conformance` (laboratorio clean-room y corpus
de conformidad DWG). Ningún otro repositorio está autorizado. Poder ver un
repositorio no concede licencias ni relaja procedencia, secretos o privacidad.
Contratos, secretos, datos personales y planos de clientes no se incorporan al
control de versiones. Todo fixture o dato del corpus debe superar su gate de
derechos y procedencia antes de incorporarse, según `CORPUS_POLICY.md` del
repositorio de conformidad — resumido en pasos concretos, con el propósito de
cada uno, en [`docs/guides/donar-corpus-dwg.md`](../guides/donar-corpus-dwg.md).
