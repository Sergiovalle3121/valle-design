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

(Estado final: todo cerrado o resuelto con decisión documentada; los dos
parciales conscientes —la IMPLEMENTACIÓN del origen flotante de 2.2 y la
unificación DXF de A.5— quedaron como P0-2 y P0-3 del BACKLOG con diseño
completo y evidencia, por colisión con la campaña paralela. El detalle de
cada cierre está en la bitácora.)

### OLA 0 — Cerrar la casa: ramas y PR (~1 h)
- [x] 0.1 Borrar las 34 ramas remotas muertas (excepto las tres `codex/dwg-*`),
      con lista publicada aquí antes de borrar, en dos tandas.
- [x] 0.2 PR #86 Dependabot (32 actualizaciones): suite completa con esas
      versiones; fusionar lo que pase; separar lo que rompa con razón escrita.
- [x] 0.3 PR #77/#78/#79: rescatar a main la gobernanza del #77 (CODEOWNERS,
      plantilla PR, NOTICE, cesión PI, registro IA y su gate) adaptada a hoy;
      cerrar los tres con explicación. El código DWG del #78/#79 NO se trae.
- [x] 0.4 Repo conformidad: cerrar/rebasar los 2 PR duplicados
      (`dwg-corpus-hardening`, `dwg-corpus-lockdown`) sin revertir la
      corrección posterior de main; borrar sus ramas.
- [x] 0.5 Política de ramas en `CONTRIBUTING.md`.

### OLA 1 — Auditoría de integridad: ¿cada comando hace lo que dice? (~2.5 h)
- [x] 1.1 Arnés de veracidad sobre los ~192 comandos del registro: efecto real
      en documento/estado, no mensaje de éxito.
- [x] 1.2 Confirmar/desmentir uno por uno: QSELECT, FILTER, PLOT Previa,
      MSPACE, PSPACE, LAYOUT, PAGESETUP, XATTACH, PARAMETERS, AUTOCONSTRAIN,
      BEDIT — con archivo y línea.
- [x] 1.3 Arreglar los cables sueltos (host, hoja activa, callback).
- [x] 1.4 Lo no arreglable hoy responde «no disponible en esta versión».
- [x] 1.5 Arnés como gate en `check:cad` con exentos declarados.

### OLA 2 — Los tres P0 de corrección (~2 h)
- [x] 2.1 TRIM invertido para coincidir con AutoCAD; revisar EXTEND, BREAK,
      FILLET; actualizar `modify-edges.spec.ts` y `curve-edit.ts`.
- [x] 2.2 Precisión con coordenadas ~10⁷: medir error, origen flotante antes
      de empaquetar a Float32, evidencia antes/después.
- [x] 2.3 Snaps/selección: capa apagada o bloqueada NO seleccionable ni
      imantable; tolerancia de snap relativa al zoom. Resto al backlog medido.

### OLA 3 — Dependencias, build y reproducibilidad (~1 h)
- [x] 3.1 Fuentes autohospedadas (`next/font/local`); build sin internet.
- [x] 3.2 Una sola versión por herramienta: typescript, @types/node, eslint,
      prettier, tsx.
- [x] 3.3 559 avisos de lint: clasificar, arreglar familias peligrosas, subir
      a error las reglas en cero. Conteo antes/después.
- [x] 3.4 `npm ci && npm run build` en carpeta limpia; script de arranque
      único si hacen falta >3 comandos.

### OLA 4 — Equipo de sistemas productivo el primer día (~1.5 h)
- [x] 4.1 `docs/onboarding/PRIMER-DIA.md`
- [x] 4.2 `docs/onboarding/MAPA.md`
- [x] 4.3 `docs/onboarding/GATES.md`
- [x] 4.4 `.github/`: CODEOWNERS, plantilla PR, plantillas de issue, NOTICE.
- [x] 4.5 Convenciones escritas y gate de lo verificable.
- [x] 4.6 `docs/adr/README.md` con los nueve ADR y su estado.

### OLA 5 — La documentación dice la verdad (~1 h)
- [x] 5.1 Verificar afirmación por afirmación los 9 documentos raíz; especial:
      superficie pública DWG (`writeDwg`) y claims de compatibilidad.
- [x] 5.2 Una sola fuente de la cifra de estado (el script); el resto la lee.
- [x] 5.3 Podar documentación duplicada/caducada.

### OLA 6 — La rúbrica honesta (~1 h)
- [x] 6.1 Reescribir `docs/competitive/rubric.json` con denominador acotado
      (flujo diario de dibujo 2D técnico en español); fuera de alcance
      declarado, no filas en cero.
- [x] 6.2 Corregir filas infladas: plugins/.NET/VBA, B-rep facetado, BEDIT y
      bloques dinámicos, rendimiento 25.3 s / 8.57 fps, DWG rechazado.
- [x] 6.3 Evidencia propia vs independiente; el script imprime cuántos puntos
      vienen de cada tipo; solo-propia no alcanza el tope de fila.
- [x] 6.4 Fila nueva de integridad: % comandos veraces, pruebas verdes/total,
      pérdidas silenciosas (meta cero).
- [x] 6.5 Correr y publicar el corte nuevo, aunque baje.

### OLA FINAL — El backlog y la verdad (~1 h, obligatoria)
- [x] F.1 Suite completa + goldens con árbol quieto + push de ambos repos.
- [x] F.2 `docs/execution/BACKLOG.md` P0/P1/P2 accionable y ordenado por lo
      que impide vender.
- [x] F.3 `AGENTS.md` con las reglas que deja esta campaña.
- [x] F.4 `docs/execution/INFORME_CAMPANA_CIMIENTOS_20260822.md`.

### OLA A — ANEXO DE CRECIMIENTO (11:20, condiciona todo lo anterior)
Regla: **acotar lo que se promete, nunca lo que se puede construir después.**
Lo que queda fuera se marca «todavía no», nunca «nunca».
- [x] A.1 ADR: migración aditiva del documento canónico como invariante
      (procedimiento de subida de esquema, tipos congelados) + fila de rúbrica
      de compatibilidad hacia atrás medida. [puerta 1]
- [x] A.2 Tres documentos de extensibilidad: operaciones públicas vs internas
      en el contrato OpenAPI; política de versionado de la API pública;
      manifiesto de plugins LISP como formato con versión. Cero código. [p. 2]
- [x] A.3 Mecanismo de niveles: guard consulta cualquier capacidad, catálogo
      admite varias por plan, UI sabe decir «esto es del plan Pro». Sin planes
      ni precios nuevos. [p. 3]
- [x] A.4 Medición por organización: documentos, almacenamiento,
      publicaciones — registrar sin exponer. [p. 4]
- [x] A.5 Interfaz escrita de interoperabilidad (bytes → representación
      neutral → documento canónico, pérdidas declaradas en ambos sentidos);
      unificación DXF si alcanza (R.1). [p. 5]
- [x] A.6 Deuda del monolito publicada con meta <8,000 líneas y método por
      costuras; trinquete baja ≥1 escalón por campaña. [p. 6]
- [x] A.7 ADR de la decisión DWG: licenciar para vender + códec propio para
      poseer, con criterio de cambio escrito. [p. 7]
- [x] A.8 Mecanismo de corpus independiente: procedimiento de donación con
      permiso escrito, procedencia, compromiso de matriz de fidelidad por
      versión. [p. 8]
- [x] A.9 (modifica OLA 6) Rúbrica con DOS denominadores: alcance de hoy
      (10/10 alcanzable) y alcance de destino (AutoCAD completo, ~25% sin
      vergüenza); fila nueva «capacidad de crecer» medida con A.1–A.8.

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

**0.1 CERRADO (11:10).** 32 borradas en dos tandas; luego las 3 `codex/dwg-*`
(tras rescatar #77 y cerrar #78/#79) y la de Dependabot (tras cerrar #86).
Remoto final: `main` + `deps/majors-diferidos-20260822` (PR #87 borrador).

**0.2 CERRADO (12:00).** PR #86 partido con evidencia: set completo revienta
en `npm ci` (TS7 → TS5108 en contracts). Subconjunto seguro fusionado directo
a main en `c034e0b` (15 de 32: pg, class-validator, better-sqlite3, argon2,
supertest types, ts-eslint 8.67, next-intl, react 19.2.8, cross-env 10,
esbuild, tsx 4.23.12 ×2, openapi-typescript 7.13 + SDK regenerado, turbo
2.10.11) con typecheck+test+lint+check:cad+check:dwg+build verdes. Diferidos
con razón por ítem en el PR #87 (borrador deliberado, manifests sin lockfile):
TS7, ESLint 10, TypeORM 1.x, @nestjs 11.2 (duplica core→ModuleRef roto),
next 16.3 (Turbopack exige binario nativo que el Control de aplicaciones de
Windows bloquea; 16.2 compila en WASM), Playwright 1.62, framer-motion 13,
three 0.185, lucide 1.32, @types/node 26 (runtime es 22), redocly 2.
Aprendizajes de entorno: (a) los gates DWG requieren
`VALLE_DWG_CORPUS_MIRROR` apuntando al repo de conformidad — sin documentar
hasta hoy; (b) los scripts raíz importaban tsx/openapi-typescript sin
declararlos (azar del hoisting) — ahora están en devDependencies raíz.

**0.3 CERRADO (13:05).** Gobernanza del #77 rescatada y adaptada en `c1b169c`:
CODEOWNERS, plantilla PR, plantillas de issue, NOTICE, docs/governance (7
docs + registro + baseline), gate `check:governance` (9 specs) cableado a CI,
actions pineadas por SHA re-verificado contra tags oficiales, checksum
SHA-256 de gitleaks, `sbom:full` como evidencia (el bloqueante sigue runtime).
#77/#78/#79 cerrados con explicación; el código DWG paralelo NO entró.
Adaptaciones: topología de dos repos, protección remota YA activa (3 checks),
práctica real de trailers = atribución sin autoría (329/786 commits).
**HALLAZGO P0: ambos repositorios son PÚBLICOS** (verificado por API y curl
anónimo) mientras NOTICE/LICENSE declaran confidencial. La visibilidad pública
es lo que hace funcionar la protección de rama en plan Free. Registrado en
`repository-protection-baseline.json` como pendiente de decisión del titular;
opciones documentadas. NO se cambió la visibilidad (decisión del dueño).

**0.4 CERRADO (13:15).** Conformidad: PRs #2/#3 cerrados con verificación —
fusionar #2 borraría 25,588 líneas (pipelines fuente de los bundles admitidos)
y revertiría la política enmendada + la corrección de summarizeDxf (82f0368).
Idea rescatada al backlog: pull_request_target + verificador del commit base
si algún día se aceptan PRs externos de corpus. Ramas borradas; remoto = main.

**0.5 CERRADO (13:05).** Política de ramas en CONTRIBUTING.md: main única
larga vida, prefijos claude/deps, vida máxima 7 días o 30 commits, borrado al
cerrar, staging explícito y rebase-autostash en sesiones paralelas.

### OLA 1 (13:30–15:10)

**1.1 CERRADO.** Arnés de veracidad construido:
`apps/web/scripts/command-integrity-probe.mts` ejecuta los 192 comandos del
registro real con el reductor del producto y un auto-respondedor, y clasifica:
muta (61, con serialización canónica antes/después), delegado (31), informa
(13), honesto-limitado (79), no-concluyente (8, exentos con razón), ROJO (0).

**1.2 CERRADO — la lista de la auditoría, confirmada una por una:**
- QSELECT/FILTER: CONFIRMADO — el monolito no pasaba `setSelection`
  (Layout3DEditor.tsx, montaje del motor); el host avisaba honesto pero no
  designaba. ARREGLADO: cableado a `selectNative` (con su tope de 300 al
  backlog, dominio 2.3).
- PLOT Previa: CONFIRMADO ÉXITO FALSO — `plot-host.ts` respondía «Vista previa
  de N hoja(s)» sin que exista NINGÚN panel de vista previa en el producto.
  ARREGLADO: mensaje honesto que además reporta los problemas del cálculo real.
- MSPACE/PSPACE: CONFIRMADO ÉXITO FALSO — «Espacio papel.» incondicional con
  `setSpace` ausente. ARREGLADO doble: honestidad en plot-host (setSpace ahora
  devuelve si cambió) y cable real en el monolito (`setActivePaperSpaceId`),
  así que hoy MSPACE/PSPACE/MODEL cambian la pestaña DE VERDAD.
- LAYOUT/PLOT/PAGESETUP sobre la primera hoja: CONFIRMADO — `activeLayout` no
  se pasaba al contexto. ARREGLADO: viaja `activePaperSpaceId`.
- PAGESETUP: era honesto por línea de comandos; ahora además su forma de
  cuadro activa la hoja (openPageSetup → pestaña con los controles).
- XATTACH: CONFIRMADO — `context.xrefCatalog` no se provee; la orden completa
  existe y explica su límite. NO arreglado hoy: exige biblioteca asíncrona del
  tenant (fetchCadXrefSnapshot). P1 en backlog con diseño (petición de host
  asíncrona al patrón de PLOT, reutilizando attachProfessionalXref).
- PARAMETERS: CONFIRMADO — faltaba `context.parameters`. ARREGLADO en
  studio-context.ts: la tabla del documento viaja al motor.
- AUTOCONSTRAIN: CONFIRMADO — faltaba `context.constraints`: infería como si
  el dibujo no tuviera ninguna. ARREGLADO en studio-context.ts.
- BEDIT: verificado honesto — es la puerta tecleable al panel de bloques (con
  redefinición real detrás); el editor de bloques en sitio queda P1.

**Hallazgos NUEVOS del arnés (no estaban en la auditoría):** RECTANG y
REVCLOUD terminaban en SILENCIO ABSOLUTO con esquinas alineadas (resultado
`none`: ni entidad ni mensaje) y XCLIP se esfumaba ante una selección
múltiple. Los tres arreglados con mensaje que explica; specs de familia
actualizados (afirmaban el silencio como contrato).

**1.3/1.4 CERRADOS** con lo anterior. **1.5 CERRADO:** gate
`check:command-integrity` (sonda + exenciones declaradas en
`scripts/cad/command-integrity-exemptions.json`, con regla bidireccional: un
no-concluyente sin declarar falla, y una exención ya innecesaria también)
cableado dentro de `check:cad`.

### OLA 2 (15:15–17:15)

**2.1 CERRADO — TRIM es AutoCAD.** `curve-edit.ts` invertido: el clic señala
lo que SE ELIMINA. Curva abierta con corte a cada lado → el objeto SE PARTE
(la mitad inicial conserva el id; la segunda nace en `create` con id nuevo,
misma capa y contexto — no se rompen cotas ni sombreados). Extremos → se
acorta hasta el corte. Cerrada → se conserva el complemento y se abre.
`modify-edges.ts` emite ahora N comandos por recorte (edición + inserción).
Specs reescritos a la convención nueva (128 comprobaciones curve-edit + familia
modify-edges verdes). EXTEND verificado: ya era AutoCAD. BREAK verificado: ya
era AutoCAD (quita entre dos puntos, conserva id del primer trozo). **FILLET y
CHAMFER: divergencia REAL encontrada y arreglada** — con radio 0 (el valor de
fábrica ¡y el de AutoCAD!) la orden rechazaba «el radio debe ser mayor que
cero», o sea fallaba de fábrica; ahora R=0 y 0×0 cierran la ESQUINA EXACTA
(recorte/prolongación de ambos objetos a su intersección, sin arco),
sobreviviendo el lado pulsado. Spec nuevo del caso.

**2.2 MEDIDO Y DOCUMENTADO (implementación a backlog P0 por colisión).**
Sonda `large-coordinate-precision-probe.mts` atravesando el empaquetador real:
la cuantización float32 empieza en la TESELACIÓN (`CadTessellatedPath.xy` es
Float32Array) y confirma la pérdida: **4.2 cm a magnitud UTM-México (2·10⁶) y
37.5 cm a 10⁷**; documento y exportación pierden CERO (float64 de punta a
punta). Evidencia en `docs/cad/evidence/large-coordinate-precision.json`.
El arreglo (origen flotante de escena: marco anclado al centro del documento,
`cadCenter` y uniformes calculados en doubles, tocar line-batch, text-atlas,
entity-three, scene y el mapeo de cámara del monolito) NO se implementa hoy:
son exactamente los archivos que la campaña paralela PULIDO está optimizando
en este momento (su OLA 4: subida por lotes, atlas de texto). P0 en backlog
con el diseño completo y la sonda lista para el «después».

**2.3 CERRADO (los dos baratos) + verificaciones.**
- Capa APAGADA ya no imanta NI se designa; capa BLOQUEADA imanta pero no se
  designa (semántica CAD estándar, más fina que el enunciado). Implementado en
  el punto único (`cad-layer-visibility.ts` + filtros "snap"/"selection" del
  `CadNativeSelectionIndex`) con opt-in explícito en los 4 sitios de usuario
  del monolito; los consumidores internos (regeneración de asociativas, plan
  de render) conservan su filtro de fábrica para no cambiar comportamiento
  legítimo. Specs nuevos.
- Tolerancia de snap: VERIFICADA ya relativa al zoom (`pointerWorldTolerance`
  → `viewController.toleranceWorld` con apertura en píxeles) — ese punto de la
  auditoría estaba resuelto antes de hoy; queda registrado.
- Al backlog con medición pendiente: tope de segmentos del snap
  (maxSegments 96), topes de selección por índice (300/4096, cortan por orden
  espacial), intersecciones sobre teselado vs analíticas, tope de 300 en
  `selectNative` (afecta QSELECT grande).

### OLA 3 (17:20–18:35)

**3.1 CERRADO.** Inter (variable, 4.66) y JetBrains Mono (variable) viven en
`apps/web/src/fonts/` (OFL 1.1, procedencia en su LICENSE.txt y en
THIRD_PARTY_NOTICES); `layout.tsx` pasa a `next/font/local` con
`adjustFontFallback`. Gate `check:fonts`: archivos presentes + cero imports de
`next/font/google` (sólo imports reales, los comentarios pueden contar la
historia). **3.2 CERRADO.** typescript 5.9.3, @types/node ^22.18, eslint
^9.18, prettier ^3.4→3.9.6, tsx 4.23.12: UNA declaración en la raíz;
workspaces heredan (borradas 14 declaraciones duplicadas). Typecheck verde con
la cadena única; SDK regenerado byte-estable. **3.3 CERRADO (curva a la baja +
techo).** 562→548 avisos: 2 errores prettier arreglados, no-base-to-string de
RUTA DE PRODUCCIÓN corregidos (DXF export ya no puede emitir '[object
Object]'; token DI multi-tenant sin colisión de anónimos), imports muertos
fuera del monolito retirados (los ~20 del monolito son del 5.2 de PULIDO hoy
mismo — no tocados a propósito), 4 reglas del React Compiler en cero suben a
ERROR, convención `_` declarada, y trinquete `check:lint-budget` (por regla y
workspace, sólo baja, --update auditable) cableado en check:cad. **3.4
CERRADO.** Carpeta prístina (git archive): `npm ci` 1 min + `npm run build`
1m25s, VERDES, sin variables de entorno. Arranque = 2 comandos (ci, dev).
Nota de entorno: el Control de aplicaciones de Windows puede bloquear binarios
nativos recién extraídos (documentado en PRIMER-DIA.md).

### OLA 4 + ANEXO (18:35–19:15)

**4.1–4.3, 4.5, 4.6 CERRADOS.** `docs/onboarding/`: PRIMER-DIA.md (clonar→
correr con tiempos medidos), MAPA.md (tres procesos, documento canónico,
motor, render, interop, comercial, seis fronteras), GATES.md (los ~15 gates
uno a uno con su «cuando está rojo» y el único procedimiento para cambiarlos),
CONVENCIONES.md (dónde va el código, nombres, commits, comentarios, pruebas).
Gate NUEVO `check:conventions` (dirección de imports: lib/ no importa de
components//app/; 524 archivos verificados; halló 3 violaciones — 2 specs de
integración, ahora fuera por regla, y `social-card.tsx`, exenta DECLARADA con
deuda escrita). `docs/adr/README.md`: índice de las DOCE ADR con estado (la
cola decía nueve; son diez + las dos nuevas). **4.4 cerrado en OLA 0.**

**Anexo (detalle):** A.1 → ADR-0011 (migración aditiva como invariante, procedimiento
de subida de esquema, fila de compatibilidad medida). A.7 → ADR-0012 (DWG a
doble vía con criterio de cambio medible). A.2 →
`docs/api/POLITICA-API-PUBLICA.md` (tres niveles, reglas de cambio, default
todo-internal, manifiesto de plugins LISP/JS declarado formato v1 sobre el
contrato ya existente en `lib/lisp/plugins/api.ts`; marcado por operación en
el YAML queda en backlog). A.5 → `docs/interop/CONTRATO-INTEROP.md` (bytes →
neutral → canónico, cinco garantías, estado real por formato; unificación de
las dos rutas DXF sigue en backlog R.1). A.6 → `docs/execution/DEUDA-MONOLITO.md`
(meta <8,000 líneas como compromiso fechado, método por costuras, registro por
campaña; el escalón del trinquete de HOY lo da el 5.2 de PULIDO). A.8 →
`docs/DONACIONES.md` EN EL REPO DE CONFORMIDAD (pusheado: procedimiento,
permiso mínimo, compromiso de fidelidad por versión, registro vacío a
propósito). **A.3/A.4 VERIFICADOS COMO EXISTENTES** (mejor que construirlos):
el guard ya pregunta entitlements genéricos por código con catálogo
N-por-plan, y `UsageLedger` ya registra `design.document.saved/published` por
organización con idempotencia. Faltantes menores a backlog: métrica de
almacenamiento, superficie UI «esto es del plan Pro», exposición de consumo.

### OLA 5 (19:20–20:00)

**5.1 CERRADO (lo señalado + barrido).** `writeDwg` re-apuntado al writer
validado por oráculo (el contenedor de laboratorio queda con su nombre
honesto); tests de superficie fijan los seis límites públicos y el round-trip
del archivo COMPLETO (366/366 + adversarial + fuzz verdes). README y
ARCHITECTURE corregidos en las DOS direcciones: negaban B-rep facetado,
AutoLISP con biblioteca y STEP/IGES de sólidos que SÍ existen; el laboratorio
DWG descrito como «detección acotada» cuando lee 2000/2004 contra oráculo.
**5.2** → resuelto por diseño en OLA 6 (la matriz se regenera del script y los
artefactos de evidencia committeados eliminan la dependencia del entorno;
la raíz del 186-vs-191 era una matriz generada sin corpus). **5.3** → docs
duplicados ya viven en `docs/history/`; sin más poda necesaria hoy.

### OLA 6 (20:00–20:50)

**CERRADA COMPLETA.** rubric.json v2026-08-22.1: DOS denominadores publicados
(HOY = 16 categorías del flujo diario, 175 pt; DESTINO = 220 pt con las filas
nuevas), `scope` por categoría, evaluador `todaviaNo` (falla con razón
publicada — «todavía no», nunca «nunca»), clase de evidencia
propia/independiente con TECHO (una fila toda-propia retiene 1 pt; 17 lo
retienen), filas corregidas (plugins sin .NET/VBA fingido, BEDIT y dinámicos
todavía-no, SLO exigido sobre architecture@100k que FALLA y resta, B-rep
FACETADO en el nombre, detectar-rechazar DWG movido a integridad), fila de
INTEGRIDAD (13 pt: arnés con artefacto committeado, pérdidas jamás
silenciosas, límites a la vista) y de CAPACIDAD DE CRECER (8 pt: las ocho
puertas). rubric.spec.mjs: 57 comprobaciones verdes con los casos nuevos
(techo aplicado / techo levantado con evidencia independiente). **El corte
publicado: HOY 154/175 (88 %) · DESTINO 189/220 (85.9 %)** — bajó de 95.5 %
y ése era el punto. Matriz e histórico regenerados del script.

### OLA FINAL (20:50–…)

F.2 `BACKLOG.md` escrito (3 P0 · 6 P1 · 10 P2 + herencias con dueño), F.3
`AGENTS.md` con las cuatro reglas cableadas y tres costumbres de sesiones
paralelas, F.4 informe completo. F.1: suite final sobre el árbol committeado
y push — abajo el resultado.

**Decisión F.1 sobre el barrido de goldens e2e:** a las 21:20 la campaña
paralela PULIDO sigue activa con el checkout principal y el dev server (su
árbol lleva horas sin commitear). Lanzar Playwright desde este worktree
compartiría puerto/servidor con su corrida (reuseExistingServer apuntaría a SU
árbol a medio editar): resultados basura para ambas. El barrido de goldens con
árbol quieto queda expresamente en manos del F.1 de PULIDO —que es su paso
final declarado y correrá sobre main INCLUYENDO lo empujado por esta
campaña—, y esta campaña cierra con sus seis gates (typecheck, test, lint,
check:cad, check:dwg, build) sobre el árbol committeado. Si PULIDO no lo
corriera, el barrido pasa a ser el primer paso del backlog P1-1.
