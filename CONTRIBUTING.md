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

## Titularidad y contribuciones

Sergio Valle Zárate es el único titular y contribuidor humano actual del
proyecto. Ninguna contribución externa se admite sin acuerdo de cesión o CLA
confirmado por escrito por el titular ANTES del primer pull request; abrir un
PR no sustituye el acuerdo ni transfiere derechos por sí mismo. El borrador de
cesión vive en `docs/governance/CONTRIBUTOR_IP_ASSIGNMENT_TEMPLATE.md` y debe
pasar por asesoría jurídica antes de usarse. Todo cambio asistido por IA se
registra en `docs/governance/assisted-development-log.json` y lo adopta el
titular tras revisar el diff; una IA nunca figura como autora ni coautora.
El gate `npm run check:governance` verifica estos invariantes.

## Política de ramas

- `main` es la única rama de larga vida. Sólo el titular (o una sesión
  autorizada por él) integra a `main`, siempre con los gates locales verdes
  sobre el SHA exacto que se empuja: `check:cad`, `check:dwg`, `typecheck`,
  `test`, `lint`, `build`. Para fusionar un PR se exigen además los
  checks requeridos verdes sobre el SHA exacto candidato.
- Ramas de trabajo: `claude/<tema>` (sesiones asistidas), `deps/<tema>`
  (dependencias), `codex/<tema>` (histórico, en extinción). Nombre corto en
  minúsculas con guiones.
- Vida máxima de una rama: 7 días o 30 commits de distancia respecto a `main`,
  lo que ocurra primero. Una rama que supere eso se rebasa el mismo día o se
  cierra con una nota de qué se rescata (el rescate se documenta en el PR o en
  la bitácora de campaña antes de borrarla).
- Las ramas se borran del remoto al fusionarse o cerrarse; una rama muerta no
  es un archivo histórico — la historia vive en `main` y en `docs/history/`.
- Sesiones paralelas sobre el mismo checkout o worktrees: staging explícito
  (nunca `git add -A`) y `git pull --rebase --autostash` antes de cada push.
