# CAMPAÑA AUTÓNOMA DE CIMIENTOS — 22 de agosto de 2026

**HEAD de referencia:** `d5969f0`. **HEAD real de arranque:** `fc9ba23` (la rama
de láminas ya estaba integrada al empezar; se trabaja sobre `fc9ba23`).
**Duración prevista:** 10 horas en cascada, sin detenerse.
**Objetivo:** repositorio íntegro y honesto — ramas y PR cerrados, comandos que
no mienten, tres P0 de corrección, build reproducible, onboarding de primer
día, documentación veraz, rúbrica con denominador acotado, y backlog accionable.
**Esta campaña no agrega funciones.**

## Suposiciones de arranque

- **A-0.** HEAD real `fc9ba23`, un commit encima del `d5969f0` citado. Todo lo
  verificado por la auditoría externa se re-verifica contra `fc9ba23`.
- **A-1.** Hay una campaña paralela activa hoy («PULIDO», arrancó 10:24, ~8 h)
  trabajando directamente en el checkout `D:\dev\valle-design` sobre capturas,
  chrome del estudio, goldens rojos, fixture ERP, DIMVARs y rendimiento. Para
  no colisionar, esta campaña trabaja en el worktree `D:\dev\wt-cimientos`
  (rama `claude/cimientos`), con staging explícito y
  `git pull --rebase --autostash` antes de cada push a main.
- **A-2.** Zonas de roce conocidas con PULIDO: (a) su F.2 reconcilia la cifra
  186/200 vs 191/200 y mi OLA 6 reescribe la rúbrica — la mía llega después y
  rebasa encima; (b) sus goldens e2e usan el dev server — mis gates evitan
  goldens e2e concurrentes; los corro solo en el barrido final o con puerto
  propio. (c) Mi OLA 3 (lint) evita tocar los archivos que PULIDO tiene
  modificados sin commitear.
- **A-3.** Las operaciones remotas de OLA 0 (borrar ramas remotas, cerrar PR)
  no tocan ningún working tree: seguras en paralelo.

## La cola

### OLA 0 — Cerrar la casa: ramas y PR (~1 h)
- [ ] 0.1 Borrar las 34 ramas remotas muertas (excepto las tres `codex/dwg-*`),
      con lista publicada aquí antes de borrar, en dos tandas.
- [ ] 0.2 PR #86 Dependabot (32 actualizaciones): suite completa con esas
      versiones; fusionar lo que pase; separar lo que rompa con razón escrita.
- [ ] 0.3 PR #77/#78/#79: rescatar a main la gobernanza del #77 (CODEOWNERS,
      plantilla PR, NOTICE, cesión PI, registro IA y su gate) adaptada a hoy;
      cerrar los tres con explicación. El código DWG del #78/#79 NO se trae.
- [ ] 0.4 Repo conformidad: cerrar/rebasar los 2 PR duplicados
      (`dwg-corpus-hardening`, `dwg-corpus-lockdown`) sin revertir la
      corrección posterior de main; borrar sus ramas.
- [ ] 0.5 Política de ramas en `CONTRIBUTING.md`.

### OLA 1 — Auditoría de integridad: ¿cada comando hace lo que dice? (~2.5 h)
- [ ] 1.1 Arnés de veracidad sobre los ~192 comandos del registro: efecto real
      en documento/estado, no mensaje de éxito.
- [ ] 1.2 Confirmar/desmentir uno por uno: QSELECT, FILTER, PLOT Previa,
      MSPACE, PSPACE, LAYOUT, PAGESETUP, XATTACH, PARAMETERS, AUTOCONSTRAIN,
      BEDIT — con archivo y línea.
- [ ] 1.3 Arreglar los cables sueltos (host, hoja activa, callback).
- [ ] 1.4 Lo no arreglable hoy responde «no disponible en esta versión».
- [ ] 1.5 Arnés como gate en `check:cad` con exentos declarados.

### OLA 2 — Los tres P0 de corrección (~2 h)
- [ ] 2.1 TRIM invertido para coincidir con AutoCAD; revisar EXTEND, BREAK,
      FILLET; actualizar `modify-edges.spec.ts` y `curve-edit.ts`.
- [ ] 2.2 Precisión con coordenadas ~10⁷: medir error, origen flotante antes
      de empaquetar a Float32, evidencia antes/después.
- [ ] 2.3 Snaps/selección: capa apagada o bloqueada NO seleccionable ni
      imantable; tolerancia de snap relativa al zoom. Resto al backlog medido.

### OLA 3 — Dependencias, build y reproducibilidad (~1 h)
- [ ] 3.1 Fuentes autohospedadas (`next/font/local`); build sin internet.
- [ ] 3.2 Una sola versión por herramienta: typescript, @types/node, eslint,
      prettier, tsx.
- [ ] 3.3 559 avisos de lint: clasificar, arreglar familias peligrosas, subir
      a error las reglas en cero. Conteo antes/después.
- [ ] 3.4 `npm ci && npm run build` en carpeta limpia; script de arranque
      único si hacen falta >3 comandos.

### OLA 4 — Equipo de sistemas productivo el primer día (~1.5 h)
- [ ] 4.1 `docs/onboarding/PRIMER-DIA.md`
- [ ] 4.2 `docs/onboarding/MAPA.md`
- [ ] 4.3 `docs/onboarding/GATES.md`
- [ ] 4.4 `.github/`: CODEOWNERS, plantilla PR, plantillas de issue, NOTICE.
- [ ] 4.5 Convenciones escritas y gate de lo verificable.
- [ ] 4.6 `docs/adr/README.md` con los nueve ADR y su estado.

### OLA 5 — La documentación dice la verdad (~1 h)
- [ ] 5.1 Verificar afirmación por afirmación los 9 documentos raíz; especial:
      superficie pública DWG (`writeDwg`) y claims de compatibilidad.
- [ ] 5.2 Una sola fuente de la cifra de estado (el script); el resto la lee.
- [ ] 5.3 Podar documentación duplicada/caducada.

### OLA 6 — La rúbrica honesta (~1 h)
- [ ] 6.1 Reescribir `docs/competitive/rubric.json` con denominador acotado
      (flujo diario de dibujo 2D técnico en español); fuera de alcance
      declarado, no filas en cero.
- [ ] 6.2 Corregir filas infladas: plugins/.NET/VBA, B-rep facetado, BEDIT y
      bloques dinámicos, rendimiento 25.3 s / 8.57 fps, DWG rechazado.
- [ ] 6.3 Evidencia propia vs independiente; el script imprime cuántos puntos
      vienen de cada tipo; solo-propia no alcanza el tope de fila.
- [ ] 6.4 Fila nueva de integridad: % comandos veraces, pruebas verdes/total,
      pérdidas silenciosas (meta cero).
- [ ] 6.5 Correr y publicar el corte nuevo, aunque baje.

### OLA FINAL — El backlog y la verdad (~1 h, obligatoria)
- [ ] F.1 Suite completa + goldens con árbol quieto + push de ambos repos.
- [ ] F.2 `docs/execution/BACKLOG.md` P0/P1/P2 accionable y ordenado por lo
      que impide vender.
- [ ] F.3 `AGENTS.md` con las reglas que deja esta campaña.
- [ ] F.4 `docs/execution/INFORME_CAMPANA_CIMIENTOS_20260822.md`.

### Cola de reserva
R.1 unificar rutas DXF y topes · R.2 descomponer monolito <18k ·
R.3 auditoría de arranque · R.4 accesibilidad con lector real ·
R.5 `npm run doctor`.

## Reglas activas
1. Nunca preguntar; decisión conservadora + bitácora.
2. Bloqueo >20 min → bitácora + backlog + siguiente.
3. Gates antes de cada push: `check:cad`, `check:dwg`, `typecheck`, `test`,
   `lint`, `build`. Push al cerrar cada ola.
4. Prohibido relajar gates/umbrales/goldens; prohibido tocar identificadores
   persistidos (`IDENTITY.md`); prohibido renombrar `data-testid`.

---

## BITÁCORA

### Arranque (10:55)
Worktree `D:\dev\wt-cimientos` creado en `fc9ba23`. `gh` autenticado
(Sergiovalle3121/valle-design). 271 GB libres en D:. Campaña paralela PULIDO
detectada y anotada en A-1/A-2.

### OLA 0 (11:00)

**0.1 — Lista de ramas remotas a borrar** (verificadas: todas entre 254 y 333
commits atrás de main, contenido integrado según auditoría; se conservan
`codex/dwg-01-governance`, `codex/dwg-02-research-corpus`,
`codex/dwg-04-safe-core` (PRs #77–79) y `dependabot/npm_and_yarn/npm-semanal-…`
(PR #86 vivo)). Formato: rama (atrás/adelante).

Tanda 1: agent/dwg0-binary-foundation (284/5), agent/dwg0-governance (295/1),
claude/cad-anotacion (282/9), claude/cad-autolisp (295/5), claude/cad-brep
(295/5), claude/cad-draw-schema4 (287/12), claude/cad-modify-completo (294/11),
claude/cad-paletas (288/14), claude/cad-parametricas-53wxi8 (290/6),
claude/cad-reflexion-completa (295/7), claude/cad-render-pipeline (294/8),
claude/cad-rubrica (286/4), claude/cad-trazado (285/6), claude/dwg1-bitcodes
(254/0), claude/merge-work-eors1o (329/6),
claude/r1-cad-validator-integrity-20260804 (327/1).

Tanda 2: claude/r1-cas-conflict-latch-20260806 (320/1),
claude/r1-cas-conflict-resolution-20260806 (318/4),
claude/r1-conflict-plan-core-20260806 (319/1),
claude/r1-design-audit-postgres-20260804 (326/1),
claude/r1-dxf-fidelity-preflight-20260804 (328/4),
claude/r1-recovery-multitab-cas-20260804 (325/1),
claude/r1-recovery-tab-lanes-20260806 (321/1),
claude/r1-recovery-trailing-write-20260805 (323/1),
claude/r1-spec-runner-completion-20260806 (322/1),
claude/r1-valle-design-rebrand-20260805 (324/1),
claude/valle-design-analysis-f19l9d (269/1), claude/valle-design-audit-8niaqt
(333/14), claude/valle-design-autocad-parity-cqdaoq (295/0),
claude/valle-design-cad-advance-p6ys65 (299/1),
claude/valle-design-r0-cas-version-20260803 (331/1),
claude/valle-design-r0-e2e-recovery-20260803 (332/1).

Total: 32 ramas (la cola decía 34; el conteo real contra el remoto de hoy es
32 una vez excluidas las 3 `codex/dwg-*` y la de Dependabot).
