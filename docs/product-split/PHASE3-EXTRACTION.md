# PHASE3-EXTRACTION — Registro de la extracción del historial CAD a valle-design

Fecha: 2026-08-01 · Ejecutada tras la fusión de Fases 1–2.

## SHA de extracción

- PR #1446 fusionado a `main` de valle-enterprise (squash, flujo del repo):
  **`f3703a6f50387c73fcefda1a4077b3ac720a67c2`**.
- `main` de valle-design nace en **`ea234900c1a7c5f573e785da9f0a466762f98163`**
  (el mismo árbol de rutas DESIGN_OWNED, historial reescrito por filter-repo).

## Comando exacto (Regla de documentación)

```bash
git clone --no-local --branch main /home/user/valle-enterprise valle-design-source
cd valle-design-source   # HEAD = f3703a6f
git filter-repo $(grep -v '^#' FILTER-REPO-PATHS.txt | grep -v '^$' | sed 's/^/--path /')
git remote add origin <valle-design>
git push -u origin main
```

- Lista de rutas: `FILTER-REPO-PATHS.txt` **v2** — la v1 sellada al cierre de Fase 1 más las
  rutas VIEJAS (pre-move de Fase 1) de los 17 archivos backend y 6 libs frontend movidos,
  para conservar la procedencia completa (`git log --follow` cruza el move; p.ej.
  snap-engine.ts: 6 commits incluyendo sus 5 en components/line-engineering).
- filter-repo requiere clon "fresco": `--no-local` y SIN fetch/checkout posteriores.

## Resultado

| Métrica | Valor |
|---|---|
| Commits origen (main @ f3703a6f) | 2,129 |
| Commits en valle-design | **427** (todos los que tocan rutas DESIGN_OWNED) |
| Archivos en HEAD | 400 |
| Autoría | preservada (Sergiovalle3121 390, Claude 31, Sergio Valle 1 — emails intactos) |
| Commits que tocan lib/cad | 285 |
| valle-design antes del push | verificado VACÍO (`ls-remote` = 0 refs) |

## Escaneo de secretos (Regla 10)

`gitleaks git .` sobre TODO el historial filtrado (427 commits, 5.48 MB):
**1 hallazgo, FALSO POSITIVO documentado** — `cad-document-validation.spec.ts:117`,
`token: '0123456789abcdef'`: hex secuencial sintético, fixture del test de validación de
review-links (regla generic-api-key). No es credencial; nada que rotar. Acción pendiente en
valle-design: `.gitleaks.toml` con allowlist de ese fixture para que los escaneos de CI
queden en 0 (se añade en la reestructura).

## Artefactos históricos aceptados (documentado, no oculto)

- El historial de valle-design contiene la EVOLUCIÓN pasada de los 10 archivos industriales
  que vivieron dentro de `lib/cad` hasta WP4 (line-balance, flow-optimization,
  material-flow-route): sus commits históricos tocan rutas `lib/cad/*` y por tanto viajan;
  en HEAD están eliminados (el tip está limpio). Es historia, no producto.
- Los adaptadores enterprise (`*.adapter.ts` de cad-documents) y wrappers de compatibilidad
  viajan en HEAD y se sustituyen/eliminan en la reestructura de valle-design.

## Estado post-extracción

- valle-enterprise: `main` intacto y funcional CON runtime CAD (el retiro es Fase 6, gated).
- valle-design: `main` con historial; la reestructura (apps/packages, README, .env.example,
  docker-compose, CI propio) es el siguiente paso, vía rama de trabajo + PR.
