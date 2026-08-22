# INFORME — Campaña de cimientos, 22 de agosto de 2026

Diez horas en cascada sobre `valle-design` y `valle-design-dwg-conformance`,
desde `fc9ba23`. Encargo: dejar el repositorio como el de un producto propio y
serio — limpio por dentro, honesto en lo que declara, productivo para un
equipo nuevo el primer día — sin agregar funciones. Condicionado por el anexo
de crecimiento: acotar lo que se promete, nunca lo que se puede construir
después.

Corrió en paralelo con la campaña de pulido (mismo día, mismo equipo físico,
checkout principal). Coordinación: worktree propio, staging explícito, zonas
de roce anotadas antes de editar, y sus frentes (goldens, ERP-fixture,
DIMVARs, rendimiento, monolito-imports) respetados y enlazados desde el
backlog en vez de duplicados.

## El hallazgo que manda sobre todo lo demás

**Los dos repositorios son PÚBLICOS** (verificado por API y `curl` anónimo)
mientras LICENSE, NOTICE y toda la gobernanza declaran software propietario
confidencial. Es además la razón de que la protección de rama funcione en el
plan Free. No se cambió la visibilidad — es decisión del titular con efectos
colaterales — pero quedó registrada con opciones y remediación en
`docs/governance/repository-protection-baseline.json` y como **P0-1** del
backlog. Hasta que se decida, el NOTICE afirma la naturaleza propietaria sin
afirmar hechos falsos.

## Cifras antes → después

| Qué | Antes | Después |
| --- | --- | --- |
| Ramas remotas (producto) | 37 | 2 (`main` + `deps/majors-diferidos`, PR #87 borrador deliberado) |
| PRs abiertos (producto) | 4 (uno de una semana) | 1 borrador-documento con tabla de desbloqueo |
| PRs abiertos (conformidad) | 2 (fusionarlos borraba 25,588 líneas y revertía correcciones) | 0 |
| Actualizaciones de deps | 32 agrupadas sin decidir | 15 fusionadas con suite verde · 17 diferidas con razón escrita por ítem |
| Gobernanza en main | ci.yml referenciaba un NOTICE inexistente; sin CODEOWNERS ni plantillas | NOTICE, CODEOWNERS, plantillas PR/issue, docs/governance completo, gate `check:governance` (9 specs) en CI, actions pineadas por SHA re-verificado, checksum de gitleaks |
| Comandos con éxito falso | PLOT Previa y MSPACE/PSPACE afirmaban sin hacer; 3 no-op mudos sin descubrir | **0 de 192** — arnés de veracidad como gate (`check:command-integrity`), 8 exentos declarados |
| TRIM | Al revés de AutoCAD (borraba lo que el usuario quería conservar) | Convención AutoCAD: el clic elimina; corte por el medio PARTE en dos; specs reescritos |
| FILLET/CHAMFER | Radio 0 (el de fábrica) rechazado: la orden fallaba recién invocada | R=0 y 0×0 cierran la esquina exacta |
| Capa apagada | Seleccionable e imantable (comentario: «nadie pidió cambiarlo») | Ni se designa ni imanta; la bloqueada imanta sin designarse (estándar CAD) |
| Precisión UTM | Sin medir | Medida y publicada: 4.2 cm a 2·10⁶, 37.5 cm a 10⁷ en render; CERO en documento/exportación; diseño del arreglo en P0-2 |
| Build | Descargaba fuentes de Google al compilar | Autohospedadas (OFL, procedencia documentada) + gate `check:fonts`; `npm ci`+`build` verificados en carpeta prístina (1 min + 1m25s) |
| Toolchain | typescript ×3 versiones, @types/node ×3, eslint ×2, prettier ×2, tsx ×2 | UNA versión por herramienta, declarada en la raíz |
| Avisos de lint | 562 (+2 errores latentes) sin techo | 548 con trinquete por regla/workspace (`check:lint-budget`), 4 reglas en cero subidas a ERROR, `[object Object]` imposible en un DXF exportado |
| Dirección de imports | Sin regla verificada | `check:conventions`: lib/ no importa de components//app/ (524 archivos, 1 exención declarada con deuda) |
| Superficie DWG pública | `writeDwg` exportaba el writer con placeholders; el validado por ODA era interno | `writeDwg` ES el validado por oráculo; el contenedor de laboratorio con su nombre honesto; tests de superficie actualizados |
| Rúbrica | 191/200 (95.5 %) con filas infladas y una sola cifra | **HOY 154/175 (88 %)** + **DESTINO 189/220 (85.9 %)**; 17 filas retienen 1 pt por evidencia solo-propia; «todavía no» explícito; fila de integridad (12/13) y de capacidad de crecer (7/8) |
| Onboarding | Nada | PRIMER-DIA, MAPA, GATES, CONVENCIONES + índice de 12 ADR |
| ADRs | 10 sueltas | 12 indexadas con estado (nuevas: 0011 migración aditiva invariante, 0012 DWG a doble vía) |

## Lo hecho, por ola (bitácora completa: `CAMPANA_CIMIENTOS_20260822.md`)

- **OLA 0** — 36 ramas remotas borradas con lista publicada; #86 partido con
  evidencia (TS7 revienta contracts; @nestjs 11.2 duplica el core y rompe
  ModuleRef; next 16.3 exige binarios que el Control de aplicaciones de
  Windows bloquea); #77 rescatado ADAPTADO (dos repos, protección remota real,
  trailers como atribución sin autoría); #78/#79 y los 2 de conformidad
  cerrados con verificación de lo que habrían revertido; política de ramas en
  CONTRIBUTING.
- **OLA 1** — el arnés: 192 comandos conducidos con el reductor real y
  clasificados (63 mutan verificado · 31 delegan · 13 informan · 77 declaran
  su límite · 8 exentos · 0 éxitos falsos). Cables conectados: QSELECT/FILTER
  designan, MSPACE/PSPACE cambian la pestaña real, LAYOUT/PLOT/PAGESETUP
  operan sobre la hoja ACTIVA, PARAMETERS recibe la tabla, AUTOCONSTRAIN ve
  las restricciones existentes. Descubiertos y arreglados tres no-op mudos que
  la auditoría no vio: RECTANG y REVCLOUD con esquinas alineadas, XCLIP con
  selección múltiple.
- **OLA 2** — TRIM/EXTEND/BREAK/FILLET contra AutoCAD (dos divergencias
  reales arregladas, dos verificadas correctas); precisión UTM medida con
  sonda propia y evidencia committeada; capas apagadas/bloqueadas con
  semántica estándar en el punto único de visibilidad.
- **OLA 3** — fuentes propias, toolchain único, curva de lint a la baja con
  techo, arranque en dos comandos verificado en frío.
- **OLA 4 + ANEXO** — onboarding completo; ADR-0011/0012; política de API
  pública con manifiesto de plugins v1; contrato de interoperabilidad; deuda
  del monolito publicada (<8,000 con método); donaciones de corpus montadas en
  conformidad; entitlements genéricos y medición por organización VERIFICADOS
  como ya existentes.
- **OLA 5** — writeDwg honesto; README/ARCHITECTURE corregidos en las DOS
  direcciones (negaban B-rep facetado, AutoLISP y STEP/IGES existentes;
  exageraban en otras).
- **OLA 6** — la rúbrica de dos denominadores descrita arriba; el evaluador
  `todaviaNo` con razón publicada; la matriz y el histórico regenerados del
  script (la cifra vive en UN lugar).

## Lo que quedó abierto (completo en `BACKLOG.md`)

P0: decisión de visibilidad (titular) · origen flotante de escena (diseñado,
con sonda lista) · ruta DXF única sin re-encuadre silencioso. P1: seis goldens
(coordinar con el informe de pulido) · XATTACH tecleable · BEDIT real ·
DIMVARs (ídem pulido) · `x-visibility` por operación · ERP-fixture (ídem
pulido). P2: techos silenciosos de snap/selección · intersecciones analíticas
· architecture@100k a SLO · majors del PR #87 · familias de lint · CFDI
sandbox real · exponer consumo · anti-pisado de PRs de corpus · social-card ·
artefacto de integridad comparado por gate.

## Los diez siguientes pasos, en orden

1. El titular decide P0-1 (visibilidad) — 15 minutos con las opciones ya
   escritas.
2. Origen flotante de escena (P0-2) en ventana SIN campañas de render
   paralelas; la sonda da el antes/después.
3. Ruta DXF única bajo el contrato de interop (P0-3): cierra georreferencia y
   topes silenciosos de una vez.
4. Leer el informe de la campaña de pulido y reconciliar sus frentes (goldens,
   DIMVARs, ERP-fixture, 100k) con el backlog — borrar lo que ya cerró.
5. 87/87 goldens con árbol quieto (P1-1).
6. XATTACH adjunta desde la línea de comandos (P1-2, 1 día).
7. `x-visibility` en el contrato + lista pública inicial (P1-5, medio día).
8. Primer escalón REAL del monolito: extraer el anfitrión de selección
   (método en DEUDA-MONOLITO.md) y bajar el trinquete en el mismo commit.
9. Exponer el consumo por organización (P2-7): los datos ya se acumulan desde
   hoy.
10. Tipar `cfdi-issuance.service.ts` (19 unsafe en la ruta del dinero) y
    bajar el presupuesto de lint del API un escalón.

## Registro de desarrollo asistido

Entrada `CIMIENTOS-2026-08-22` en
`docs/governance/assisted-development-log.json`, estado `proposed`: la
adopción del titular se registra al revisar este informe y los SHA empujados.
