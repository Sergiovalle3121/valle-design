# Gobernanza propietaria

Este directorio define los controles operativos de propiedad intelectual de
Valle Design bajo su modelo actual de propietario único: Sergio Valle Zárate es
el único titular y contribuidor humano. No reemplaza asesoría jurídica ni
contiene contratos firmados o datos personales.

- `PROPRIETARY_CONTRIBUTIONS.md`: admisión y cesión de aportaciones externas.
- `CONTRIBUTOR_IP_ASSIGNMENT_TEMPLATE.md`: borrador no ejecutado que el asesor
  jurídico debe adaptar antes de admitir a un contribuidor externo.
- `ASSISTED_DEVELOPMENT.md`: uso de IA, procedencia y adopción humana.
- `assisted-development-log.json`: registro versionado de cambios asistidos.
- `REPOSITORY_PROTECTION.md`: controles de GitHub para propietario único y la
  transición obligatoria antes de admitir a otro contribuidor.
- `repository-protection-baseline.json`: captura auditable de la configuración
  remota y del modelo de aprobación aplicable.
- `DEPENDENCY_LICENSE_REVIEW.md`: términos conocidos pendientes de decisión.

`LICENSE` y `NOTICE` son las fuentes raíz de los términos del código first-party.
Los acuerdos ejecutados se guardan fuera del repositorio con acceso restringido;
aquí sólo se registra su confirmación no sensible.

La topología aprobada son exactamente dos repositorios del mismo titular:
`Sergiovalle3121/valle-design` (el producto) y
`Sergiovalle3121/valle-design-dwg-conformance` (laboratorio clean-room y corpus
de conformidad DWG, aislado del producto por política). El estado de visibilidad
observado y su remediación pendiente se registran en
`repository-protection-baseline.json`; esta gobernanza aplica a ambos.
