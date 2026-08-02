# Contribuir

1. Lea `AGENTS.md`, alcance, arquitectura y ADRs.
2. Cree un cambio pequeño; no mezcle migración de datos, actualización de
   goldens y refactor. Actualice contrato antes del SDK generado.
3. Añada prueba en la capa afectada y evidencia end-to-end si declara recorrido.
4. Ejecute `npm ci`, build, typecheck, test, lint sin fix, contrato/SDK y
   `git diff --check`. Persistencia/tenancy requiere PostgreSQL real; cambio UI
   perceptible requiere Playwright y captura.
5. El PR debe describir alcance, evidencia, riesgos, migración y rollback. No
   elevar “parcial” a “soportado” sin prueba completa.

Formato Prettier/ESLint existente; no envolver imports en `try/catch`. No
editar `package-lock.json` a mano. Dependencias nuevas requieren licencia
permisiva compatible con software propietario, SBOM y justificación.
