# Protección del repositorio

## Estado remoto verificado el 2026-08-09

- Repositorio: `Sergiovalle3121/valle-design` (`id: 1318987896`).
- Titular y CODEOWNER actual: `@Sergiovalle3121`.
- Visibilidad: pública temporalmente para desarrollo asistido.
- `main` usa branch protection clásica con PR obligatorio, una aprobación,
  reviews obsoletas descartadas, aprobación del último push por otra persona,
  rama estrictamente actualizada, conversaciones resueltas e historial lineal.
- Checks requeridos: `Contrato · Build · Test · Lint · Smoke`,
  `E2E Playwright (PostgreSQL · Chromium + Firefox)`,
  `Gitleaks (historial completo)` y `SBOM CycloneDX (evidencia)`.
- La regla se aplica al administrador; force-push y borrado están bloqueados.
- El repositorio permite sólo squash merge, habilita actualización de rama y
  auto-merge, y elimina la rama después del merge.

La captura estructurada está en `repository-protection-baseline.json`. Debe
auditarse nuevamente después de cualquier cambio de propietario, visibilidad,
plan de GitHub o ruleset.

## Controles pendientes

Segundo revisor humano: **pendiente de que Sergio proporcione el usuario y
confirme su aceptación**. Hasta entonces no se puede cumplir el control de
CODEOWNERS ni fusionar los PR de este programa. No se inventa ni se usa una
cuenta de IA. Al incorporarlo se debe:

1. añadirlo como colaborador con el mínimo permiso suficiente;
2. añadirlo a las líneas sensibles de `CODEOWNERS` junto a Sergio;
3. activar `require_code_owner_reviews`; y
4. verificar con un PR real que el autor del último push no puede aprobarse a sí
   mismo ni saltar checks.

GitHub limita las merge queues a repositorios de organizaciones. Este
repositorio pertenece hoy a una cuenta personal, por lo que la merge queue no
puede activarse. `strict` + auto-merge es el control provisional y no se declara
equivalente. Para cumplir el requisito final, Sergio debe transferir el
repositorio a una organización que admita merge queue; si será privado, el plan
de la organización también debe soportarla.

## Cierre comercial

Antes del piloto:

1. convertir `valle-design` en privado;
2. aplicar de nuevo protecciones compatibles con el plan privado elegido;
3. habilitar y probar merge queue tras la transferencia a organización;
4. verificar que no haya artefactos o source maps públicos controlados por el
   titular;
5. aplicar el aviso confidencial definitivo aprobado por el revisor;
6. confirmar que corpus, contratos y documentación técnica privada viven en
   almacenamiento separado con mínimo privilegio; y
7. distribuir sólo builds, servicios y SDK bajo términos comerciales.
