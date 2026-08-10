# Protección del repositorio

## Última observación remota, 2026-08-09

- Repositorio: `Sergiovalle3121/valle-design` (`id: 1318987896`).
- Titular y CODEOWNER actual: `@Sergiovalle3121`.
- Visibilidad: privada, verificada por API.
- Topología: un único repositorio; no se requiere un repositorio compañero.
- Antes de formalizar el modelo de propietario único, `main` usaba branch
  protection clásica con PR obligatorio, una aprobación y aprobación del
  último push por otra persona. Esas dos condiciones no pueden satisfacerse
  cuando Sergio es simultáneamente el único titular, contribuidor y operador.
- Checks requeridos: `Contrato · Build · Test · Lint · Smoke`,
  `E2E Playwright (PostgreSQL · Chromium + Firefox)`,
  `Gitleaks (historial completo)` y `SBOM CycloneDX (evidencia)`.
- La regla se aplica al administrador; force-push y borrado están bloqueados.
- El repositorio permite sólo squash merge, habilita actualización de rama y
  auto-merge, y elimina la rama después del merge.

La observación y la baseline normativa están separadas en
`repository-protection-baseline.json`. Después de convertir el repositorio en
privado, las API de branch protection y rulesets respondieron `403` y exigieron
GitHub Pro o visibilidad pública. Por ello la protección normativa descrita
abajo **no está aplicada mecánicamente** con el plan actual y el repositorio no
se declara protegido. Debe auditarse de nuevo después de cualquier cambio de
propietario, contribuidores, visibilidad, plan de GitHub o ruleset.

## Modelo vigente de propietario único

Sergio Valle Zárate declaró que no existe un segundo revisor: es el único
titular y contribuidor humano. No se inventa una persona, una cuenta alterna ni
una IA para producir una aprobación aparente, y Sergio no necesita celebrar un
CLA consigo mismo.

Mientras se mantenga ese estado, la protección requerida es:

1. todo cambio entra por PR y conserva alcance, procedencia y adopción;
2. los cuatro checks requeridos deben terminar verdes sobre el SHA exacto que
   se fusiona y la rama debe estar actualizada respecto de `main`;
3. las conversaciones deben estar resueltas y sólo se permite squash merge con
   historial lineal;
4. `CODEOWNERS` conserva a `@Sergiovalle3121` como titular de todas las
   superficies sensibles;
5. la protección se aplica al administrador y permanecen bloqueados el
   force-push, el borrado y cualquier bypass de los checks; y
6. el registro de desarrollo asistido identifica a Sergio como adoptante del
   diff exacto cuando interviene una IA.

El conteo de aprobaciones y la aprobación del último push se fijan
normativamente en cero y `false`, respectivamente, porque no agregan una
revisión independiente en este modelo: sólo crean un bloqueo imposible. Su
eliminación no permite omitir PR, checks, actualización de rama, procedencia ni
historial lineal.

## Limitación del plan privado y protocolo temporal

La cuenta personal actual no habilita branch protection ni rulesets para este
repositorio privado. Hasta contratar GitHub Pro o transferir este mismo
repositorio a una organización con un plan compatible, Sergio aplica el
siguiente protocolo verificable pero no inmutable:

1. no hacer push directo a `main`;
2. usar exclusivamente un PR y registrar su SHA de cabeza;
3. comprobar que ese SHA parte del `main` remoto vigente;
4. esperar los cuatro checks y exigir éxito de todos sobre ese SHA; y
5. fusionar por squash pasando el SHA esperado a la API, que rechaza un cambio
   concurrente de cabeza.

Este protocolo permite continuar el desarrollo del propietario único, pero no
sustituye una protección remota frente al propio administrador. “Repositorio
protegido” y el 10/10 de gobernanza permanecen bloqueados hasta aplicar y volver
a verificar `requiredProtection`.

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
