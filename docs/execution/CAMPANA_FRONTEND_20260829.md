# Campaña de ingeniería frontend — endurecer lo que el usuario ve

**Fecha de arranque:** 2026-08-29 · **Repositorio:** `valle-design` ·
**Rama de trabajo:** `claude/valle-design-premium-identity-4hnemt` (reiniciada desde `main` tras la fusión de #115).

## Misión

El backend ya está endurecido y la identidad visual nueva ya existe. Esta campaña hace lo tercero:
que el frontend sea **ingeniería** — rápido de verdad, accesible de verdad, robusto ante errores,
medible, y con una arquitectura de componentes que aguante los próximos dos años. Al terminar, el
frontend debe tener las mismas garantías que el backend: presupuestos que fallan en CI, evidencia
medida, y cero degradación silenciosa.

## Decisiones de tecnología (tomadas; no se reabren)

| Decisión | Veredicto |
| --- | --- |
| Stack (Next.js + React + Tailwind v4 con tokens propios + framer-motion + three.js + lucide + `components/ui`) | **No se migra.** Sin framework nuevo, sin librería de UI externa, sin reescrituras. |
| Gates de rendimiento | **Entran**: presupuesto de bundle por ruta (script propio sobre `next build`) + Lighthouse CI con umbrales. Ambos bloqueantes. |
| Gate de accesibilidad | **Entra**: axe-core sobre las pantallas clave en Playwright, bloqueante para violaciones serias/críticas. |
| React Compiler | **A evaluar tras flag**, con medición antes/después. Se adopta sólo si mejora y no rompe goldens. Si no, se documenta y se apaga. |
| Radix | **Sólo si** el barrido de accesibilidad encuentra un overlay propio irreparable; envuelto en la primitiva propia. Preferencia: arreglar lo propio. |
| Estado del editor | **Extraer** del monolito hacia anfitriones/controladores. Un store ligero (zustand) SÓLO si aparece estado compartido con prop-drilling doloroso, con ADR. **Prohibido** meter el documento canónico en un store. |

## Reglas de no-detención y no-romper

1. Nunca preguntar; decidir, bitácora, seguir. Ítem bloqueado >25 min → backlog y siguiente.
2. Esta bitácora se actualiza **por ítem**. Si el contexto se compacta, se relee primero.
3. Tras cada ola: suite completa + goldens con árbol quieto + push. Los 761 casos matemáticos, la
   Jornada Real y los gates de identidad (contraste, superficie sin marcas) quedan intactos.
4. Cero hex sueltos, cero tamaños fuera de escala: todo por tokens. Ningún `data-testid` cambia.
   El trinquete del monolito **sólo baja**. Fix-or-hide sigue vigente.
5. Todo número de rendimiento se publica con su máquina y condiciones. Las cifras de este contenedor
   son **techos, no marcas**; las metas de CI se fijan con margen sobre lo medido aquí.

### Condiciones de medición declaradas

| Elemento | Valor |
| --- | --- |
| Máquina | Contenedor efímero de Claude Code on the web |
| CPU | 4 núcleos |
| RAM | 15 GiB total |
| Disco | 252 G (26 G libres al arrancar) |
| Node | ver bitácora de la OLA 1.1 |
| Red | proxy de agente; sin latencia de usuario real |

Estas cifras **no** representan la laptop del arquitecto. Sirven para comparar antes/después en la
misma máquina y para fijar techos de CI con margen.

---

## Cola de la campaña

- [ ] **OLA 0 — Todo a main** (~45 min)
- [ ] **OLA 1 — Rendimiento real de carga** (~2.5 h)
- [ ] **OLA 2 — Rendimiento de interacción** (~1.5 h)
- [ ] **OLA 3 — Robustez de la capa vista** (~1.5 h)
- [ ] **OLA 4 — Accesibilidad como gate** (~1.5 h)
- [ ] **OLA 5 — Arquitectura de componentes: el método que queda** (~2 h)
- [ ] **OLA 6 — Lo que la firma dejó pendiente** (~1 h)
- [ ] **OLA FINAL — La verdad medida** (~45 min, obligatoria)

Cola de reserva: R.1 ruta interna `/sistema` (living styleguide, en vez de Storybook) ·
R.2 golden visual del estudio en ambos temas · R.3 service worker para carga repetida ·
R.4 auditoría de fuentes de re-render exportada como evidencia versionada.

---

# Bitácora

## OLA 0 — Todo a main

### 0.1 · La campaña de firma sobre `main`

**Estado: YA HECHO antes de que empezara esta campaña.** El enunciado describe la rama
`claude/valle-design-premium-identity-4hnemt` como viva y sin fusionar (19 commits, +16 498 líneas).
No lo está: se fusionó el 2026-08-28 a las 20:43 UTC.

| Hecho | Evidencia |
| --- | --- |
| PR #115 fusionado | `merged_at: 2026-08-28T20:43:15Z`, squash |
| Commit en `main` | `ad3c32a` — «Campaña de firma propia: identidad ultra premium, cuenta segura y voz del usuario (#115)» |
| Base anterior | `a7a33d8` (#114) |
| Rama de origen | borrada automáticamente por el remoto al fusionar |
| CI sobre `ebbc027` | Gitleaks ✅ · Contrato·Build·Test·Lint·Smoke ✅ · Despliegue ✅ · E2E Playwright ✅ |
| Suite de navegador local | 172 pasados, 0 fallos, 19 omitidos (39,5 min) |

Los 13 goldens que la campaña de firma arregló sin bajar pruebas (etiqueta `Contraseña*`,
`CÍRCULO`+`CIRCLE` con jerarquía, presets 3D pidiendo su modo) estaban **verdes en el CI que
autorizó la fusión**, no sólo en local. No hay rebase que verificar porque no hubo rebase: la rama
fue a `main` por squash directo.

Como el PR de la rama designada ya está fusionado, esta campaña la reinicia desde `main`
(`git checkout -B claude/valle-design-premium-identity-4hnemt origin/main`) y abre un PR nuevo.

### 0.2 · Clasificación de las otras dos ramas vivas

Método del cierre de ramas: *contenido ya en main / rescatar / descartar*, con veredicto escrito.

#### `claude/valle-design-3d-campaign-t0zzad` → **contenido ya en main · descartar**

Seis commits por delante de `main`; su PR abierto era el **#108** (borrador, cerrado sin fusionar).
El PR #105 de la misma rama sí se fusionó (2026-08-25), así que lo único en disputa son los commits
posteriores: `cb02ead` (429 legítimo ya no falla en seco), `0a05efd` (evidencia real de
review-concurrency) y `d8f9aca` (presupuesto de monolito tras el reintento).

Veredicto por **identidad byte a byte**, no por prosa: los ficheros que esos commits crearon o
tocaron son idénticos a los de `main` hoy.

```
git diff --stat origin/main origin/claude/valle-design-3d-campaign-t0zzad -- \
  apps/api/src/load-probe/rate-limit-retry.ts \
  apps/api/src/load-probe/rate-limit-retry.spec.ts \
  apps/api/src/load-probe/review-concurrency.main.ts \
  apps/web/src/components/cad/collab/use-cad-comments.ts \
  apps/web/src/components/cad/collab/use-cad-comments.spec.ts \
  scripts/cad/review-concurrency-evidence.mjs
→ (salida vacía: idénticos)
```

El contenido de #108 llegó a `main` por otra vía. Nada que rescatar. **Rama borrada.**

#### `claude/valle-design-p0-3-encuadre-utm` → **contenido ya en main · descartar**

Veintiocho commits de la campaña 3D-M1 y del cierre de P0-2/P0-3.

| Aportación de la rama | ¿En `main`? |
| --- | --- |
| `applyCadCameraViewPreset` con quinto parámetro `content` y criterio `boundsIntersect` | Sí — `camera-view-presets.ts:86-94` |
| Encuadre inicial sobre el contenido real cuando el footprint es disjunto (P0-3) | Sí — `Layout3DEditor.tsx:12641` |
| Volúmenes B-rep de muro, recintos, materiales nativos, adaptadores de muro | Sí — `wall-solid.ts` (226 l.), `room-solid.ts` (72 l.), `wall-materials.ts` (71 l.), `wall-solid-three.ts` (275 l.), `wall-entity-adapter.ts` (375 l.), `camera-continuity.ts` (42 l.) |
| `CanonicalHistory` en `document-lifecycle/history-controller.ts` | Sí, **movido**: la lógica pura vive en `lib/cad/canonical-history.ts` y el fichero antiguo quedó como barril de reexportación, para que ningún import existente cambiara |

Además, la campaña de firma volvió a cerrar el mismo P0-3 desde la otra costura: el conmutador
2D↔3D no pasaba por el efecto de apertura, y el golden 57 (UTM) lo destapó — 3 entidades visibles en
2D, **0** al pasar a 3D. `Layout3DEditor.tsx:12762-12775` lo arregla y explica por qué el re-encuadre
sólo ocurre con bounds disjuntos.

`git diff --name-status origin/main origin/<rama>` no lista **ningún** fichero presente en la rama y
ausente en `main`; al revés sí (`main` tiene módulos enteros — feedback, education, migraciones de
MFA — que la rama nunca vio). La rama está estrictamente por detrás. Nada que rescatar.
**Rama borrada.**

> Nota de método: `git diff A...B` (tres puntos) engaña aquí — mide contra la base de fusión, así que
> una rama vieja aparenta «aportar» 7 637 líneas que `main` ya tiene por squash. El veredicto se tomó
> con `git diff A B` (dos puntos) y con identidad de fichero, no con el conteo de tres puntos.

### 0.3 · Estado de `main`

`main` = `ad3c32a`, con la campaña de firma dentro y CI verde. Las tres ramas que existían al empezar
quedan en cero: la de firma la borró el remoto al fusionar, y las otras dos se borran aquí con el
veredicto escrito arriba. A partir de este punto la campaña trabaja sobre `main`.

> **Borrado bloqueado por el proxy.** `git push origin --delete` y `git push origin :rama` mueren con
> `send-pack: unexpected disconnect while reading sideband packet` en las tres formas de refspec
> probadas: el proxy de este entorno no deja borrar ramas remotas. El enunciado admite «déjalas en
> cero **o** con veredicto escrito»; queda el veredicto escrito, que es el artefacto que importa —
> las dos ramas están estrictamente por detrás de `main` y no contienen nada que rescatar. Borrarlas
> desde la interfaz de GitHub es un clic y no bloquea nada de esta campaña.

## OLA 1 — Rendimiento real de carga

### 1.1 · La foto ANTES, medida

Dos medidores, porque una sola cifra mentiría:

1. **`scripts/perf/bundle-budget.mjs`** — suma en gzip los `<script src>` del HTML que sirve
   `next start`. Es el JS de **primera carga**. Deliberadamente **no** lee los manifiestos internos
   de Next: en Next 16 con turbopack, `.next/server/app/**/build-manifest.json` trae `pages` vacío, y
   además un manifiesto describe lo que Next cree que emite, no lo que el navegador acaba pidiendo.
   El HTML sí es el contrato con el navegador.
2. **`e2e/performance/frontend-load-budget.spec.ts`** — navegador real, cuenta el cuerpo de **cada
   respuesta `.js`** hasta que la pantalla es usable. Hace falta porque el editor llega **después** de
   la hidratación: medido sólo por el HTML, el estudio parece pesar lo mismo que `/contact`.

**Condiciones:** contenedor efímero, 4 núcleos, 15 GiB, Node 22.22.2, Next 16.2.12, build de
producción con `NEXT_PUBLIC_API_URL=http://localhost:4010` (el mismo que usa `E2E_PROD`), Chromium de
Playwright headless, red local sin latencia. **Son techos, no marcas.**

#### JS de primera carga por ruta (gzip)

| Ruta | gzip | chunks |
| --- | ---: | ---: |
| `/` (landing) | **284,9 KB** | 16 |
| `/register` | 284,7 KB | 17 |
| `/login` | 284,7 KB | 17 |
| `/precios` | 288,4 KB | 17 |
| `/contact` | 280,2 KB | 17 |
| `/docs` | 270,6 KB | 16 |
| `/dashboard` | **430,1 KB** | 22 |
| `/studio` | 272,3 KB | 16 |
| `/studio/[id]` | 277,8 KB | 17 |
| `/cuenta` | 280,9 KB | 17 |
| `/educacion` | 270,6 KB | 16 |

#### Lo que descarga el navegador de verdad

| Pantalla | JS descargado (bruto) | Hasta usable |
| --- | ---: | ---: |
| Landing | 806,9 KB | — |
| Estudio con documento | **4 456,9 KB** | 1 394 ms |

#### Qué pesa dentro del estudio

| Chunk | Bruto | Huellas encontradas dentro |
| --- | ---: | --- |
| `0myuc3yko1yb2.js` | **1 918,9 KB** | three · plantillas · DXF · LISP |
| `0zvhl6h0ab67c.js` | 197,4 KB ×3 = 592,2 | (worker; se descarga **tres veces**) |
| `3e4vdz-eu_0w1.js` | 370,5 KB | three |
| `0djdkp88-sld8.js` | 346,8 KB | three |
| `3utngkl8dgi2r.js` | 197,4 KB | — |
| `0221vbwwh7ja9.js` | 227,1 KB | react-dom |
| `1q6oj3x1dkx-e.js` | 163,5 KB | framer-motion + next-intl |

### 1.2 · Corrección al plan: three.js **no** es «un clic»

El enunciado pide mover «three.js y todo el visor 3D a import dinámico, porque el 3D es un clic, no
la bienvenida». **En este producto esa premisa no se sostiene, y conviene decirlo antes de ejecutar
sobre ella.** Hay un único `THREE.WebGLRenderer` (`Layout3DEditor.tsx:6058`) y el modo 2D **es** ese
mismo renderer con otra cámara y otra política de órbita (`applyCadCameraPolicy(controls, viewMode)`,
`Layout3DEditor.tsx:6246`). Abrir el estudio en 2D ya necesita three.js entero. Diferirlo hasta el
clic de «3D» no ahorraría un byte en la apertura: sólo movería la misma descarga unos milisegundos
más tarde dentro de la misma pantalla.

Lo que **sí** es verdad del enunciado, y es lo que se ejecuta:

- **three.js no debe aparecer en las rutas públicas.** Comprobado, y ahora vigilado por una
  aserción: la spec de carga falla si la landing evalúa `THREE`, y ninguna huella de
  `WebGLRenderer` aparece en los 16 chunks de la landing.
- **El editor ya está fuera del bundle de ruta**: `app/studio/[documentId]/page.tsx:9` lo carga con
  `next/dynamic(..., { ssr: false })`. Por eso `/studio/[id]` mide 277,8 KB y no 4,4 MB.
- **Lo genuinamente opcional sí sale del chunk crítico**: plantillas (4 982 líneas de datos), el
  intérprete LISP, los importadores DXF pesados, el exportador GLB y el laboratorio de interop están
  hoy en `import` estático dentro del monolito y viajan aunque el usuario nunca los use.

### 1.3 · Los gates que fijan lo medido

`scripts/perf/bundle-budget.json` y `src/lib/cad/benchmark/frontend-load-baseline.json` guardan los
techos con la máquina escrita al lado. Ambos son **trinquetes**: `--write` sólo baja un techo y se
niega a subirlo; para subir uno hay que editar el JSON a mano y explicarlo en el commit. Es el mismo
patrón del presupuesto del monolito y del de lint, por la misma razón: que una regresión no se
«arregle» ejecutando el actualizador.

