# Contribuir

Valle Design es software propietario y comercial. El acceso privado y
confidencial al repositorio no concede una licencia ni constituye una invitación
general a contribuir. Lea `NOTICE`, `LICENSE` y la
[política de propiedad intelectual](docs/governance/PROPRIETARY_CONTRIBUTIONS.md)
antes de preparar un cambio.

## Requisito previo de titularidad

Sergio Valle Zárate es el único titular y contribuidor humano actual. Sus
cambios first-party no requieren que celebre consigo mismo un CLA o una cesión,
ni una aprobación de GitHub emitida por una segunda persona inexistente. Para
esos cambios, la adopción se documenta mediante el PR revisado por Sergio, el
registro de desarrollo asistido cuando corresponda, los checks requeridos sobre
el SHA exacto, la rama actualizada y el historial lineal.

Esta excepción sólo aplica al titular. No habilita contribuciones externas ni
convierte la asistencia de IA en una contribución humana.

No se acepta ni fusiona una aportación externa hasta que Sergio Valle Zárate:

1. confirme por escrito que el contribuidor y, cuando corresponda, su empleador
   o representado, ejecutaron el acuerdo de cesión o CLA aplicable;
2. confirme que el registro privado del acuerdo está completo; y
3. autorice expresamente el PR para revisión técnica.

Enviar un PR, marcar una casilla o usar un trailer DCO no sustituye el acuerdo
firmado ni transfiere por sí solo la titularidad. Los PR no solicitados pueden
cerrarse sin incorporar código. No incluya datos personales ni contratos
firmados en GitHub.

## Flujo técnico

1. Lea `AGENTS.md`, alcance, arquitectura y ADRs.
2. Cree un cambio pequeño; no mezcle migración de datos, actualización de
   goldens y refactor. Actualice contrato antes del SDK generado.
3. Añada prueba en la capa afectada y evidencia end-to-end si declara recorrido.
4. Ejecute `npm ci`, `npm run check:governance`, build, typecheck, test, lint sin
   fix, contrato/SDK y `git diff --check`. Persistencia/tenancy requiere
   PostgreSQL real; cambio UI perceptible requiere Playwright y captura.
5. Complete la plantilla del PR: alcance, procedencia, desarrollo asistido,
   dependencias, evidencia, riesgos, migración y rollback. No eleve “parcial” a
   “soportado” sin prueba completa.

Mientras Sergio sea el único contribuidor humano, un cambio sólo se fusiona
desde PR, con todos los checks requeridos verdes sobre el SHA exacto que se va a
fusionar, la rama actualizada respecto de `main`, conversaciones resueltas e
historial lineal. La ausencia de una aprobación externa no permite omitir
ninguno de esos controles.

El formato es el Prettier/ESLint existente; no envuelva imports en `try/catch`.
No edite `package-lock.json` a mano. Dependencias nuevas requieren licencia
compatible con software propietario, inventario SBOM completo y justificación.
Las aportaciones asistidas por IA siguen la
[política y registro de desarrollo asistido](docs/governance/ASSISTED_DEVELOPMENT.md):
la persona que presenta el cambio responde por su procedencia y revisión; una
IA no se añade como autora, copropietaria ni `Co-authored-by`.
