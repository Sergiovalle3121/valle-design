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
- **Toda rama nace de `main` actualizado.** `git fetch origin main` (o
  equivalente) inmediatamente antes de crear la rama, no de un `main` de
  hace días — evita que la rama nazca ya desfasada y con conflictos que
  nadie previó. Una campaña larga que deja el checkout abierto varias horas
  vuelve a traer `main` antes de la fusión final, no sólo al principio.
- Cambios pequeños y autocontenidos (una corrección, un documento, un ajuste
  de una función) van **directo a `main`** con los seis gates locales verdes
  — no necesitan una rama ni un PR que nadie va a revisar por separado; abrir
  uno para cerrarlo el mismo minuto es la clase de rama huérfana que esta
  política existe para evitar. Reserve una rama para trabajo que de verdad
  necesita aislarse: multi-sesión, multi-día, o en revisión activa.
- Ramas de trabajo (cuando sí hacen falta): `claude/<tema>` (sesiones
  asistidas), `deps/<tema>` (dependencias), `codex/<tema>` (histórico, en
  extinción). Nombre corto en minúsculas con guiones, tema reconocible sin
  abrir la rama.
- Vida máxima de una rama: 7 días o 30 commits de distancia respecto a `main`,
  lo que ocurra primero. Una rama que supere eso se rebasa el mismo día o se
  cierra con una nota de qué se rescata (el rescate se documenta en el PR o en
  la bitácora de campaña antes de borrarla).
- **Quien abre una rama la cierra en la misma sesión de trabajo que la creó**
  — fusionada o borrada, nunca abandonada a medias para que otra sesión
  adivine su estado. Terminar una campaña sin resolver sus propias ramas es
  dejar el trabajo a medias, aunque el código ya esté en `main`.
- Las ramas se borran del remoto al fusionarse o cerrarse — el repositorio
  tiene activado "Automatically delete head branches" para que esto ocurra
  solo en el caso normal (merge vía PR); una rama cerrada SIN fusionar
  (contenido descartado o ya absorbido por otra vía) se borra a mano. Una
  rama muerta no es un archivo histórico — la historia vive en `main` y en
  `docs/history/`.
- Sesiones paralelas sobre el mismo checkout o worktrees: staging explícito
  (nunca `git add -A`) y `git pull --rebase --autostash` antes de cada push.
  Si dos sesiones empujan a `main` casi a la vez, la segunda resuelve el
  conflicto de fusión de inmediato (conservando lo que la otra sesión tocó
  después) — nunca fuerza el push.
