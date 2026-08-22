# Protección del repositorio

## Última observación remota, 2026-08-22

- Repositorio: `Sergiovalle3121/valle-design` (`id: 1318987896`).
- Titular y CODEOWNER actual: `@Sergiovalle3121`.
- Visibilidad: **PÚBLICA**, verificada por API y por acceso anónimo. Contradice
  el carácter confidencial declarado; la decisión de remediación es del titular
  y está registrada en `repository-protection-baseline.json` y en el backlog
  como P0. La protección de rama clásica activa hoy (checks requeridos sobre
  PRs) funciona en el plan Free precisamente porque el repositorio es público:
  volverlo privado la apaga, salvo plan de pago.
- Topología: dos repositorios del mismo titular; el compañero
  `valle-design-dwg-conformance` (también público hoy) aloja el laboratorio y
  corpus DWG.
- Antes de formalizar el modelo de propietario único, `main` usaba branch
  protection clásica con PR obligatorio, una aprobación y aprobación del
  último push por otra persona. Esas dos condiciones no pueden satisfacerse
  cuando Sergio es simultáneamente el único titular, contribuidor y operador.
- Checks requeridos observados en la protección activa:
  `Contrato · Build · Test · Lint · Smoke`,
  `E2E Playwright (PostgreSQL · Chromium + Firefox)` y
  `Gitleaks (historial completo)`. El SBOM se genera y bloquea dentro del
  primer job; no existe como check separado.
- La protección NO exige PR ni se aplica al administrador (`enforce_admins`
  apagado): el titular puede empujar directo a `main`, y ésa es la práctica
  documentada de las campañas, siempre con los seis gates locales verdes
  (`check:cad`, `check:dwg`, `typecheck`, `test`, `lint`, `build`).
- Force-push y borrado de `main` están bloqueados.
- El repositorio permite sólo squash merge, habilita actualización de rama y
  auto-merge, y elimina la rama después del merge.

La observación y la baseline normativa viven en
`repository-protection-baseline.json`. Debe auditarse de nuevo después de
cualquier cambio de propietario, contribuidores, visibilidad, plan de GitHub o
ruleset.

## Modelo vigente de propietario único

Sergio Valle Zárate declaró que no existe un segundo revisor: es el único
titular y contribuidor humano. No se inventa una persona, una cuenta alterna ni
una IA para producir una aprobación aparente, y Sergio no necesita celebrar un
CLA consigo mismo.

Mientras se mantenga ese estado, la protección requerida es:

1. todo cambio que entre por PR exige los checks requeridos verdes sobre el
   SHA exacto que se fusiona;
2. todo push directo del titular a `main` exige los seis gates locales verdes
   sobre ese mismo SHA — es el equivalente operativo del punto 1 mientras no
   haya contribuidores externos;
3. sólo se permite squash merge en PRs, y `main` conserva historial de pushes
   del titular sin force-push ni borrado;
4. `CODEOWNERS` conserva a `@Sergiovalle3121` como titular de todas las
   superficies sensibles; y
5. el registro de desarrollo asistido identifica a Sergio como adoptante del
   diff exacto cuando interviene una IA.

El conteo de aprobaciones se fija normativamente en cero porque no existe un
segundo revisor humano: exigir una aprobación sólo crearía un bloqueo
imposible. Su eliminación no permite omitir checks, procedencia ni registro.

## Límite honesto del modelo actual

La protección activa no restringe al administrador: es una salvaguarda para
PRs, no frente al propio titular. Un «repositorio protegido» pleno (PR
obligatorio incluso para el admin, historial lineal exigido por la plataforma)
queda pendiente de la decisión de visibilidad/plan registrada en la línea
base. Hasta entonces, la protección real es el protocolo de gates locales y
este registro, verificables pero no inmutables.

## Transición si aparece otro contribuidor

Antes de autorizar el primer cambio humano externo se debe:

1. ejecutar y verificar su cesión o CLA conforme a
   `PROPRIETARY_CONTRIBUTIONS.md`;
2. añadir a una persona independiente con el mínimo permiso suficiente;
3. exigir al menos una aprobación distinta del autor, aprobación del último
   push y review de CODEOWNERS para las superficies sensibles; y
4. probar en un PR real que ni autor ni administrador pueden saltar los checks.

GitHub limita las merge queues a repositorios de organizaciones. Este
repositorio pertenece hoy a una cuenta personal, por lo que la merge queue no
puede activarse. `strict` + auto-merge es el control provisional y no se declara
equivalente. Para cumplir el requisito final, Sergio debe transferir el
repositorio a una organización que admita merge queue; si será privado, el plan
de la organización también debe soportarla.

## Cierre comercial

Estado y acciones antes del piloto:

1. `valle-design` ya es privado y debe permanecer así;
2. contratar un plan compatible y aplicar/verificar la baseline de propietario
   único sobre `main`;
3. habilitar y probar merge queue tras una eventual transferencia del mismo
   repositorio a una organización compatible, sin crear un repositorio nuevo;
4. verificar que no haya artefactos o source maps públicos controlados por el
   titular;
5. conservar el aviso confidencial definitivo aprobado por Sergio en `NOTICE`;
6. no incorporar contratos, secretos, datos de clientes ni corpus sin derechos
   y procedencia verificados; esta regla no presume que hoy exista un corpus; y
7. distribuir sólo builds, servicios y SDK bajo términos comerciales.
