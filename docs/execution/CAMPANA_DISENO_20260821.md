# CAMPAÑA AUTÓNOMA DE DISEÑO — 2026-08-21

**Territorio:** `apps/web` (capa visual), `apps/web/public/`, `docs/design/`.
**Misión:** que Valle Design SE VEA como una herramienta profesional de 199/mes que
compite con AutoCAD. El sistema de diseño ya existe y está bien pensado; el problema
es que **nadie lo consume**. Esta campaña no reescribe el sistema: **lo cablea**.

## Regla de oro

> Ningún hex fuera de `globals.css`. Ningún tamaño fuera de la escala.
> Si dudas entre inventar un valor y usar el token que ya existe, **gana el token**.
> Si el token no existe, se añade AL SISTEMA y se consume desde ahí.

## Reglas de no-romper

- **NUNCA** cambiar, borrar ni renombrar un `data-testid`. 61 goldens + 5 E2E cuelgan de ellos.
- El **trinquete del monolito SOLO BAJA** (`Layout3DEditor.tsx`). Mejorar ahí = extraer, no añadir.
- Prohibido tocar lógica CAD (geometría, comandos, motor, persistencia, DXF/DWG, API).
- Contraste AA como piso. Nada por debajo de 11px sobrevive.
- `prefers-reduced-motion` respetado en cada animación nueva.
- Español es-MX. Cero emojis en la UI.
- Sin claims inventados. La sección "Lo que todavía no hacemos" se queda íntegra.

## Métricas de partida (medidas 2026-08-21, antes de tocar nada)

| Métrica                                | Antes |
| -------------------------------------- | ----- |
| `text-[Npx]` arbitrarios (.tsx)         | 659   |
| valores distintos de `text-[Npx]`       | 13    |
| clases `cyan-*`                         | 327   |
| hex hardcodeados en .tsx (ocurrencias)  | 56    |
| hex distintos en .tsx                   | 26    |
| `shadow-2xl` vs `shadow-sm`             | 29/2  |
| `<button>` a mano                       | 329   |
| `<input>` a mano                        | 127   |
| `<select>` a mano                       | 44    |
| archivos en `src/components/ui/`        | 1     |
| archivos de imagen en `public/`         | 0     |
| **Tokens consumidos**                   |       |
| `bg-card`                               | 0     |
| `bg-primary`                            | 0     |
| `text-muted-foreground`                 | 0     |
| `border-border`                         | 0     |
| `.type-display` / `.type-title`         | 0 / 0 |
| `.type-lead` / `.type-eyebrow` / `.type-numeric` | 0 / 0 / 0 |
| `.premium-glass` / `.aurora-bg`         | 0 / 0 |
| `.hero-orb` / `.hero-conic` / `.product-halo` / `.float-slow` | 0 / 0 / 0 / 0 |
| `animate-pulse` / `skeleton`            | 0 / 0 |

## LA COLA

### OLA 0 — LOS CIMIENTOS QUE FALTAN

- [x] 0.1 Tipografía real (`next/font`: Inter + JetBrains Mono conectadas a `--font-inter` / `--font-jetbrains`)
- [x] 0.2 Unificar la marca (cian → índigo; ACI del dibujo intacto; un solo color de "activo")
- [x] 0.3 Limpiar el CSS muerto con criterio (borrar Recharts + AuroraBackground; marcar el resto por ola)
- [x] 0.4 Completar el mapeo a Tailwind (`--shadow-*`, `--radius`, `--tracking-*` en `@theme inline`)

### OLA 1 — LAS PRIMITIVAS QUE NO EXISTEN

- [ ] 1.1 Primitivas en `src/components/ui/` (Button, Input, Textarea, Select, Checkbox, Switch, Card, Modal, Badge, Tooltip, Tabs, Skeleton, EmptyState, Spinner, ProgressBar)
- [ ] 1.2 Escala tipográfica de 7 escalones + migración de los `text-[Npx]`
- [ ] 1.3 Migración del embudo público a las primitivas
- [ ] 1.4 Unificar radios a 3 escalones + deduplicar la tarjeta de auth

### OLA 2 — IDENTIDAD DE MARCA

- [ ] 2.1 Logo (isotipo + wordmark + lockup, claro/oscuro/mono, componente `<Logo/>`)
- [ ] 2.2 Favicon (`icon.tsx`, `apple-icon.tsx`, `icons:` en metadata)
- [ ] 2.3 Imagen Open Graph (`opengraph-image.tsx`, `twitter-image.tsx`, por ruta)
- [ ] 2.4 `manifest.webmanifest`
- [ ] 2.5 `docs/design/BRAND.md`

### OLA 3 — LANDING ULTRA PREMIUM

- [ ] 3.1 Capturas reales del producto (script Playwright reproducible → `public/product/`)
- [ ] 3.2 Hero con el producto como imagen (halo + orbes + float ya escritos)
- [ ] 3.3 Secciones reordenadas para vender
- [ ] 3.4 Nav sticky con blur + hamburguesa real
- [ ] 3.5 Conmutador de tema global (nav pública + dashboard)
- [ ] 3.6 `/precios` con jerarquía, plan destacado, IVA y CFDI

### OLA 4 — EL EMBUDO DE ALTA

- [ ] 4.1 Registro sin callejón ("Revisa tu correo")
- [ ] 4.2 Verificación por enlace, token como respaldo
- [ ] 4.3 Organización sin jerga (slug derivado + "trabajo por mi cuenta")
- [ ] 4.4 El primer minuto (tres caminos; plano de ejemplo)
- [ ] 4.5 Estados (skeletons, vacíos ilustrados, `loading/error/not-found/global-error`)
- [ ] 4.6 Skip link real a `#contenido`

### OLA 5 — LA PRIMERA IMPRESIÓN DEL ESTUDIO

- [ ] 5.1 Jerarquía de la barra superior (el "Cerrar" rojo deja de ser lo más fuerte)
- [ ] 5.2 Fuera la telemetría de desarrollador (tras modo diagnóstico)
- [ ] 5.3 Iconos en la paleta de herramientas + tooltip con alias
- [ ] 5.4 Arreglar el modo claro de las paletas CAD
- [ ] 5.5 Rediseñar el tour "Primeros cinco minutos"
- [ ] 5.6 Densidad coherente en el chrome del estudio

### OLA FINAL — DOCUMENTAR Y PROBAR QUE MEJORÓ

- [ ] F.1 Suite completa de gates + goldens verdes + push
- [ ] F.2 Antes/después de las 6 pantallas clave → `docs/design/before-after/`
- [ ] F.3 `docs/design/DESIGN_SYSTEM.md` + sección de diseño en `AGENTS.md`
- [ ] F.4 `docs/execution/INFORME_CAMPANA_DISENO_20260821.md`

### COLA DE RESERVA

- [ ] R.1 Sistema de movimiento tokenizado
- [ ] R.2 Rediseño de documentación y guías
- [ ] R.3 Ilustraciones SVG propias
- [ ] R.4 `/status` y soporte premium
- [ ] R.5 Modo presentación del estudio
- [ ] R.6 Infraestructura de claves i18n del estudio

---

## BITÁCORA

### 2026-08-21 — Arranque

Repositorio limpio en `main` (`7982cf3`). Diagnóstico verificado contra el código
antes de escribir una línea: los 659 `text-[Npx]`, los 327 `cyan-*`, los 0 usos de
todos los tokens semánticos y el único archivo en `src/components/ui/` son exactos.
El hex hardcodeado en `.tsx` mide 56 ocurrencias / 26 valores distintos (la cifra de
105 del diagnóstico incluye `.ts`); la conclusión no cambia.

`public/` contiene un solo directorio (`wasm/`) y ni un archivo de imagen. `layout.tsx`
no importa `next/font` en ninguna forma, así que `--font-inter` y `--font-jetbrains`
—declaradas en `globals.css:91-97`— nunca se definen y el stack cae siempre al
fallback del sistema.

**Suposición registrada:** el `public/` del proyecto es `apps/web/public/`, no un
`public/` en la raíz del monorepo (la raíz no tiene ninguno). Todo lo que la campaña
llama `public/` se escribe ahí.

### OLA 0 — cerrada

**0.1 · Tipografía real.** `layout.tsx` carga Inter y JetBrains Mono con
`next/font/google` como *variables* (`--font-inter`, `--font-jetbrains`), que es
exactamente lo que `globals.css` llevaba declarando y nadie definía. `display:
swap`, subconjunto `latin` (es-MX necesita acentos, ñ y signos de apertura) y el
respaldo con métricas ajustadas para que el cambio de tipo no mueva el layout.
Verificado en el build: 8 `.woff2` emitidos en `.next/static/media/` y las dos
variables presentes en el CSS de producción. La mono ya no es decorativa —
`.type-mono` fuerza `tnum` y `zero`, que es lo que distingue un 0 de una O en
una coordenada.

**0.2 · Marca unificada.** 327 clases `cyan-*` → `indigo-*` en 27 archivos.
Comprobado antes de tocar nada que en todo `src` NO existe un solo uso de la
cadena «cyan» que no sea una clase de Tailwind, así que la migración no podía
alcanzar un dato. Los colores ACI del dibujo (`#ff0000`, `#00ff00`, `#00ffff`…)
son hex y siguen intactos: son datos del plano, no marca. Los cuatro
conmutadores de dibujo pierden sus cuatro colores (cian/ámbar/violeta/fucsia) y
comparten UN estado activo tokenizado; lo que los distingue es su etiqueta, que
es lo que un dibujante lee de todos modos. Ningún golden asserta sobre color:
comprobado con grep sobre `e2e/**/*.ts`.

**0.3 · CSS muerto, con criterio.** Fuera de verdad: el bloque de tooltips de
Recharts (`recharts` no es dependencia del proyecto) y la marquesina de logos
(`marquee-*` + su keyframe) —un carrusel de logotipos de clientes que el
producto deliberadamente NO tiene— y `@keyframes sheen`, que no tenía ni una
clase que lo invocara. La referencia a un `<AuroraBackground/>` inexistente pasa
a nombrar quién lo consumirá. Todo lo demás se queda **con la ola que lo cablea
escrita al lado**, para que la próxima auditoría distinga «pendiente» de
«basura» sin volver a razonarlo. De paso `.mission-grid` deja de pintar líneas
blancas fijas —invisibles en tema claro— y sale del token de borde.
825 → 771 líneas antes de añadir la escala.

**0.4 · Mapeo completo.** `@theme inline` gana `shadow-resting/elevated/floating`
y `brand`/`brand-strong`; un `@theme` nuevo (no `inline`) toma como ÚNICA fuente
el radio (`control`/`card`/`surface`), el interletraje y las dos curvas de
movimiento. El detalle que importa: un alias `inline` con el mismo nombre que su
variable de origen (`--tracking-display: var(--tracking-display)`) es circular y
el navegador lo descarta entero — por eso lo que no depende del tema se declara
en `@theme` a secas, que Tailwind emite igual en `:root`.

**Escala tipográfica (adelantada de la ola 1 porque es sistema, no consumo):**
siete escalones `display · title · heading · body · small · caption · mono`, más
`micro` como piso duro de 11 px. Verificados los siete en el CSS de producción.

**Gates:** `typecheck` ✅ · `build` ✅ · `lint` ✅ (0 errores, 196 avisos
preexistentes) · `test` ✅ 385/385 · gates CAD ✅ (contrato, línea, monolito
22 208 sin subir, wasm, normas-mx, nl-cad, rúbrica).

**PENDIENTE AJENO:** `check:dwg-evidence` falla **también en `main` limpio**
(comprobado con `git stash`). Es territorio de la sesión de DWG
(`scripts/dwg`, `packages/dwg-codec`), no de esta campaña; se deja como está.
