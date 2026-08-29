# CAMPAÑA DE SITIO COMERCIAL DE CLASE MUNDIAL — 2026-08-29

**Base:** main @ `cadaa0b` (campaña de ingeniería frontend dentro). Rama: `claude/valle-design-premium-campaign-24joj2`.

**Misión:** convertir el sitio en un escaparate comercial de clase mundial. Más premium, más imágenes, más fluidez, más movimiento, más contraste — con la regla de siempre: cada mejora medida, cada promesa verdadera, cero regresión (761 casos matemáticos, Jornada Real, gates de bundle/axe/Lighthouse/contraste intactos).

**Las tres prohibiciones:** (1) ni una foto de stock ni una persona inventada — las imágenes son EL PRODUCTO; (2) ni un testimonio ni un logo de cliente inventado — la prueba social es la evidencia de ingeniería; (3) ni un movimiento sin propósito — tokens del sistema, `prefers-reduced-motion` respetado.

**Regla de esta bitácora:** cada ítem se marca SOLO cuando está hecho y verificado; toda cifra que aparezca aquí fue medida en este contenedor o leída de un artefacto, nunca estimada.

---

## COLA

| # | Ítem | Estado |
| --- | --- | --- |
| 0.1 | Fuentes → woff2 subconjunto latino+técnico, preload críticas, font-display | ✅ 1 486→534 KB (−64 %), 2 precargas |
| 0.2 | Re-medir Lighthouse móvil, subir umbral bloqueante (meta ≥85) | ✅ 81/85/87 móvil, 98/99/99 escritorio; umbrales 0.78/0.95 |
| 0.3 | Pipeline de imágenes AVIF/WebP + presupuesto por página | pendiente |
| 0.4 | Barrido de fluidez: solo transform/opacity, sin jank | pendiente |
| 1.1 | Render por lote de las 145 plantillas (claro/oscuro) + manifiesto | pendiente |
| 1.2 | /plantillas: galería con búsqueda/filtros + página por plantilla + PDF muestra | pendiente |
| 1.3 | SEO por oficio: título/OG/sitemap/JSON-LD | pendiente |
| 1.4 | Sección galería en portada (6-8 destacadas) | pendiente |
| 2.1 | Spike modo invitado (45 min, veredicto en bitácora ANTES de construir) | pendiente |
| 2.2 | /demo si el spike da verde | pendiente |
| 2.3 | Recorrido interactivo si el spike da rojo | pendiente |
| 2.4 | Gates E2E/axe/carga del demo o recorrido | pendiente |
| 3.1 | Showcase pegajoso dibujar→acotar→publicar | pendiente |
| 3.2 | Sección "ingeniería que puedes auditar" con cifras de artefactos | pendiente |
| 3.3 | RevealOnScroll única + profundidad tarjetas + contraste al alza | pendiente |
| 3.4 | Screencast 45-60 s del flujo completo | pendiente |
| 4.1 | /casos-de-uso por profesión | pendiente |
| 4.2 | /seguridad | pendiente |
| 4.3 | /soporte con búsqueda | pendiente |
| 4.4 | Footer completo + coherencia | pendiente |
| 5.1 | P1-FE4 trampa de foco en CadDialogShell | pendiente |
| 5.2 | Axe del estudio | pendiente |
| 5.3 | P1-FE2 usePaperSpaces (+3 controladores si alcanza) | pendiente |
| 5.4 | Hoja de atajos imprimible | pendiente |
| 5.5 | Microfeedback restante del estudio | pendiente |
| F.1 | Suite completa + Jornada Real + gates + push | pendiente |
| F.2 | Tabla antes/después | pendiente |
| F.3 | Capturas/OG/manifiesto regenerados | pendiente |
| F.4 | INFORME_CAMPANA_SITIO_20260829.md | pendiente |

## BITÁCORA

### 2026-08-29 · Arranque y reconocimiento

- Rama `claude/valle-design-premium-campaign-24joj2` = origin/main @ `cadaa0b`. Arranque limpio.
- **Causa del 73-75 móvil confirmada en el repo:** `apps/web/src/app/layout.tsx` declara 5 caras con `next/font/local` y las precarga TODAS: InterVariable.woff2 (352 KB), InterVariable-Italic.woff2 (388 KB), JetBrainsMono-wght.ttf (300 KB), JetBrainsMono-Italic-wght.ttf (309 KB), SpaceGrotesk-wght.ttf (137 KB) = **1 486 KB de tipografía en cada página**, tres caras en TTF sin comprimir.
- **Restricción encontrada:** `plot-fidelity.spec.ts` usa `src/fonts/JetBrainsMono-wght.ttf` como programa de fuente real para el oráculo de incrustación en PDF. El TTF NO se mueve ni se toca: es fixture del motor. La conversión añade archivos `.subset.woff2` nuevos; los originales quedan como fuente canónica de regeneración.
- **Inventario de codepoints reales** (barrido de `apps/web/src` + `packages/messages` + e2e): 166 no-ASCII en uso. Los cirílicos y superíndices fonéticos (`о`, `ᵀᵤᵥ`) viven en comentarios de código, no en UI → fuera del subconjunto. Los símbolos GD&T (⌀ ⌒ ⌖ ⏤ ⏥ Ⓛ Ⓜ Ⓢ), griego de ingeniería, flechas, matemáticos y cajas → dentro.
- Umbral móvil actual del gate: 0.70 (medido 73/74/75, LCP 8.87-9.17 s, documentado en `lighthouserc.mobile.json`). Escritorio: 0.90 (medido 94).
- fonttools 4.63.0 + brotli instalados en el contenedor para la conversión (herramienta de generación, no dependencia del build).

### 0.1 · Fuentes — HECHO (medido)

- `scripts/design/subset-fonts.py`: subconjuntos con el inventario real por cara (perfil completo para Inter/JetBrains, perfil display para Space Grotesk), features de trabajo por cara (la mono PIERDE `liga/calt` a propósito: `->` tiene que verse `->` en una línea de comandos), ejes variables intactos, verificación de cobertura (0 codepoints perdidos de los que el original cubría).
- Resultado (bytes generados): Inter 132.4 KB (−62 %), Inter Italic 146.4 KB (−61 %), JetBrains 84.2 KB (−71 %), JetBrains Italic 88.2 KB (−71 %), Space Grotesk 83.2 KB (−38 %). **Total 534 KB frente a 1 451 KB (−64 %); y solo ~216 KB tocan el camino crítico.**
- Dos intentos fallidos documentados (para no repetirlos): (a) bloques Unicode enteros + `layout-features='*'` → 910 KB por la clausura de alternates; (b) desdoblar la romana de Inter en una segunda llamada `next/font` con `preload:true` → archivo duplicado `.p.` y el @font-face consumido apuntando al que NO se precarga (descarga doble, verificado en el build).
- Decisión final: **@font-face manual generado** (`src/app/fonts.css` + `public/fonts/*.hash.woff2` + `src/config/fonts-generated.ts`), romana+itálica en la MISMA familia (sin oblicuas sintéticas en MText), DOS precargas quirúrgicas (Inter romana, Space Grotesk), resto a demanda con swap + métricas de fallback sincronizadas (mismos valores que calculaba next/font). Cache inmutable de /fonts en next.config.ts. `next/font` fuera del layout.
- Gate `check:fonts` endurecido: exige originales + subconjuntos hasheados (exactamente uno por cara), techos de peso por archivo (TRINQUETE: solo bajan), coherencia CSS↔TS↔disco, máximo 2 precargas, y sin huérfanas en public/fonts. LICENSE.txt gana la sección de subconjuntos (Modified Version bajo OFL, sin RFN) y la entrada de Space Grotesk que FALTABA.
- El TTF de JetBrains queda intacto como fixture del oráculo de incrustación PDF (`plot-fidelity.spec.ts`) — verificado que producción no lee archivos de fuente para incrustar (recibe base64 del usuario).

### 0.2 · Lighthouse — HECHO (medido, mediana de 3 por ruta, contenedor de trabajo)

| pasada | ruta | antes | después | LCP antes → después |
| --- | --- | --- | --- | --- |
| móvil | / | 73 | **81** | 8.87-9.17 s → 5.04 s |
| móvil | /precios | 75 | **85** | → 4.21 s |
| móvil | /register | 74 | **87** | → 4.06 s |
| escritorio | / | 94 | **98** | 1.62-1.69 s → 1.04 s |
| escritorio | /precios | 94 | **99** | → 0.89 s |
| escritorio | /register | 94 | **99** | → 0.89 s |

- Umbrales bloqueantes SUBEN: móvil 0.70 → **0.78**, escritorio 0.90 → **0.95** (peor observación −3, la regla de la casa). Solo suben desde aquí.
- La meta ≥85 se cumple en /precios y /register; `/` queda en 81 CON LA CAUSA DIAGNOSTICADA y descartadas dos hipótesis por experimento: (a) `font-display: optional` no movió el LCP (no es el swap de fuente); (b) congelar la aurora del hero en móvil no lo movió (no es el pintado del fondo — igual queda hecho, es presupuesto de energía). La causa real: el modelo simulado de Lighthouse ancla el pintado del párrafo del hero DETRÁS de la hidratación, y el costo fijo es el cascarón compartido (~272 KB gzip de JS de primera carga incluso en /docs). El pintado real medido con Playwright + CPU 4×: 872 ms, un solo pintado. → BACKLOG: dieta de layout por grupo de rutas para las públicas.
- Aurora del hero ESTÁTICA en <1024px (tres orbes con blur 72-80px + malla cónica girando eran pintado continuo en móvil): las capas y el color quedan, la deriva es lujo de escritorio. Presupuesto de energía, no reduced-motion.
