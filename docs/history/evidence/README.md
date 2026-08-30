# Evidencia archivada

Artefactos de medición que ningún generador regenera ni ningún gate verifica
ya. Se archivan en vez de borrarse por la regla de esta carpeta (memoria del
proyecto), pero **no describen el estado actual**: la evidencia viva vive en
`docs/cad/evidence/`, donde cada JSON tiene su generador y, cuando el gate
existe, su `--check`.

- `browser-slo-100k-swiftshader-ci.json` — SLO de navegador a 100k medido en
  CI/SwiftShader; su sucesor vivo es la suite de `e2e/performance` y los
  benchmarks bloqueantes de `ci.yml`.
- `cad-render-stage-profile-100k.json` — perfil por etapa del pipeline de
  render a 100k; misma sucesión.
