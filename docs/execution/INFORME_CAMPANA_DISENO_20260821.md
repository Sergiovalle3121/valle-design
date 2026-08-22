# Informe — Campaña de diseño

**Fechas:** 2026-08-21 → 2026-08-22
**Territorio:** `apps/web` (capa visual), `apps/web/public/`, `docs/design/`
**Bitácora completa:** [`CAMPANA_DISENO_20260821.md`](CAMPANA_DISENO_20260821.md)

---

## El diagnóstico, y por qué la campaña no reescribió nada

El problema no era que faltara diseño. `globals.css` llevaba 825 líneas de
sistema escritas con criterio —tokens semánticos claro/oscuro, tres niveles de
elevación, interletraje que se cierra con el tamaño, escala fluida con
`clamp()`, y comentarios explicando el porqué de cada decisión— y **nadie lo
consumía**.

Un sistema que nadie consume no es un sistema: es documentación. Así que esta
campaña no reescribió el sistema: **lo cableó**.

---

## Métricas, antes y después

### Lo que sobraba

| Métrica                                       | Antes | Después | |
| --------------------------------------------- | ----: | ------: | - |
| Tamaños de letra arbitrarios `text-[Npx]`      |   659 |   **0** | ✅ |
| Valores distintos de tamaño arbitrario         |    13 |   **0** | ✅ |
| Tamaño de letra más pequeño de la interfaz     |  7 px | **11 px** | ✅ |
| Clases de acento fuera de marca (`cyan/sky/teal`) |  327 |   **0** | ✅ |
| Colores fijos en el chrome del estudio         |   646 |   **1** | ✅ |
| `shadow-2xl` (elevación máxima indiscriminada) |    29 |      25 | parcial |

### Lo que faltaba

| Métrica                              | Antes | Después | |
| ------------------------------------ | ----: | ------: | - |
| Familias tipográficas cargadas        |     0 |   **2** | ✅ |
| Archivos en `src/components/ui/`      |     1 |  **14** | ✅ |
| Archivos en `public/`                 |     1 |  **15** | ✅ |
| Archivos de imagen en `public/`       |     0 |  **13** | ✅ |
| Pantallas de error/carga propias      |     0 |   **4** | ✅ |
| Conmutadores de tema fuera del estudio |    0 |   **∞** | ✅ |

### Tokens consumidos — el número que importa

| Token / clase              | Antes | Después |
| -------------------------- | ----: | ------: |
| `text-muted-foreground`    |     0 | **509** |
| `text-foreground`          |     0 | **377** |
| `border-border`            |     0 | **307** |
| `text-primary-ink`         |     — | **140** |
| `rounded-control`          |     0 | **139** |
| `bg-surface`               |     0 | **127** |
| `text-warning-ink`         |     — |  **82** |
| `text-danger-ink`          |     — |  **67** |
| `rounded-card`             |     0 |  **54** |
| `text-success-ink`         |     — |  **45** |
| `bg-primary`               |     0 |  **29** |
| `bg-card`                  |     0 |  **25** |
| `shadow-floating/elevated/resting` | 0 | **19** |
| `.type-*` (los diez escalones) |   0 | **758** |
| `.aurora-bg` `.hero-orb` `.hero-conic` `.product-halo` `.float-slow` `.mission-grid` | 0 | **25** |
| `animate-pulse` (huesos de carga) |  0 |   **3** |

---

## Lo que se hizo, ola por ola

**Ola 0 — cimientos.** `next/font` carga Inter y JetBrains Mono como variables
CSS: hasta hoy `globals.css` declaraba `var(--font-inter)` y nadie la definía
nunca, así que la app salía con Segoe UI en Windows, San Francisco en Mac y
Roboto en Android — tres productos con el mismo código. Se unificó la marca (327
clases), se limpió el CSS realmente muerto y se completó el mapeo a Tailwind:
`--shadow-*`, `--radius` y `--tracking-*` no estaban mapeados, así que ni
siquiera PODÍAN escribirse como clase.

**Ola 1 — primitivas.** Quince componentes donde había uno. La app tenía 329
`<button>`, 127 `<input>` y 44 `<select>` a mano, con cinco constantes de botón
incompatibles y al menos 25 combinaciones de radio + fondo.

**Ola 2 — identidad.** Isotipo propio —línea de cota con marcas a 45°, la V, el
nodo de referencia a objetos— generado desde UNA geometría que alimenta el
componente, siete SVG, el favicon de tres tamaños, el icono de iOS y las tarjetas
sociales, con gate `--check`. `public/` no tenía un solo archivo de imagen y el
«logo» era un icono de librería que usan miles de productos.

**Ola 3 — portada.** El producto ES la imagen, con capturas que se GENERAN
conduciendo el editor de verdad. Nav pegajosa compartida por todas las páginas
públicas, conmutador de tema global y `/precios` con jerarquía y sello fiscal.

**Ola 4 — embudo.** El plano de ejemplo, que es literalmente el plano de la
portada. Organización sin jerga. Verificación al hacer clic. Huesos de carga y
las cuatro pantallas de Next que faltaban.

**Ola 5 — estudio.** El «Cerrar» rojo deja de ser lo más fuerte de la pantalla,
la telemetría de desarrollador se esconde tras `?cadDiag=1` sin salir del DOM
—dieciséis goldens la leen—, la paleta gana iconos y tooltips con el atajo de
teclado, y el modo claro **funciona por primera vez**: los colores fijos del
chrome del estudio bajan de 646 a 1.

**Cola de reserva — R.1 a R.4.** El sistema de movimiento quedó tokenizado en la
ola 0 (dos curvas, `ease-out-expo` y `ease-spring`, mapeadas como utilidad).
Guías y `/docs` con el tratamiento del sistema, tres ilustraciones propias en el
vocabulario del isotipo, y `/status` y `/support` reordenadas por urgencia — son
las dos páginas a las que se llega cuando algo va mal.

---

## Los tres hallazgos que no estaban en el encargo

**1. Cuatro colores del sistema fallaban AA como texto.** Midiendo la paleta para
documentarla: el verde de estado sobre tarjeta blanca da 3,02:1, el ámbar 2,13:1,
el rojo 3,78:1 y el índigo 4,41:1, cuando AA exige 4,5. Las primitivas iban a
propagar ese fallo a toda la aplicación. Se añadieron al sistema los tokens
`-ink`, calculados como el mínimo desplazamiento que despeja el umbral contra las
tres superficies claras.

**2. El editor arranca en 3D.** La primera captura del producto salió con la
planta como un plano inclinado en perspectiva. Un CAD 2D que se anuncia con una
órbita 3D vacía está enseñando lo que NO es. Ninguna lectura del código lo habría
visto; hizo falta fotografiarlo.

**3. La portada no puede publicar un precio.** `public-pages.spec.ts` lo prohíbe,
y tiene razón: el catálogo lo publica el propio producto desde su tabla vigente.
La comparativa de la ola 3 se reformuló para comparar MODELOS de licencia
—comprobables— y remitir a `/precios` para las cifras.

---

## Verificación

| Gate                        | Estado |
| --------------------------- | ------ |
| `typecheck`                 | ✅ |
| `build`                     | ✅ |
| `lint`                      | ✅ 0 errores |
| `test` (specs)              | ✅ |
| `design-system.spec`        | ✅ (nuevo) |
| `organization-slug.spec`    | ✅ (nuevo) |
| `build-brand-assets --check` | ✅ (nuevo) |
| Goldens Playwright          | ver bitácora |

**Ningún `data-testid` cambió, se borró ni se renombró.** Cuando un spec
existente dejó de encajar —`public-pages` y `seo-surface` afirmaban que la
portada enlaza `/login` leyendo el TEXTO de `page.tsx`, y al extraer la barra el
`href` se mudó de archivo— la comprobación se hizo **más fuerte**, no más débil:
ahora sigue el enlace hasta donde esté y además exige que la portada monte la
barra.

---

## Lo que queda pendiente

| # | Pendiente | Estimación |
| - | --------- | ---------- |
| 1 | **Seis goldens rojos heredados** (`21-xrefs`, `47-lisp-appload`, `47-solids`, `53-bim-wall`, `54-bim-wall-joins`, `55-anchored-comments`). Fallan también en `main` limpio —comprobado con `git stash` y corrida de control— y sus aserciones son de dominio CAD, no visuales. | ajeno |
| 2 | **`check:dwg-evidence` rojo**, también en `main` limpio. Territorio de la sesión de DWG. | ajeno |
| 3 | **25 `shadow-2xl` restantes**, todos dentro del monolito. | 1 h |
| 4 | **Restos de vocabulario industrial en el estudio** («estaciones», «Aisle», «Zone», «Equipment», «AXOS-CAD-STUDIO»). Territorio de la campaña de identidad, que corrió en paralelo. | ajeno |
| 5 | **Modo presentación del estudio** (R.5). Diferenciador barato y muy vendible: una vista limpia sin paletas para enseñar el plano en junta. | 2 h |
| 6 | **Infraestructura de claves i18n del estudio** (R.6). Hoy hay cinco claves de traducción en total y el editor tiene el español cableado. | 2 h |
| 7 | **Golden visual del embudo público.** Es lo único que impediría una regresión estética silenciosa. | 2 h |

---

## Los diez siguientes pasos

1. **Cerrar los seis goldens heredados.** Son rojos desde antes de esta campaña y
   nadie los ha reclamado; cada día que pasan en rojo la suite pierde autoridad.
2. **Fotografiar el estudio otra vez cuando la campaña de identidad termine.** Las
   capturas de la portada seguirán diciendo «AXOS-CAD-STUDIO» hasta entonces, y
   regenerarlas es un comando.
3. **Migrar el resto del monolito a las primitivas.** Los 25 `shadow-2xl` y los
   controles a mano que quedan viven ahí; cada extracción baja el trinquete.
4. **Medir el contraste de forma automática**, no a mano: un script que recorra
   los pares token-sobre-token y falle por debajo de 4,5. Hoy las 21 mediciones
   están escritas en `BRAND.md` y podrían envejecer.
5. **Un golden visual del embudo público.** Portada, registro y precios en los dos
   temas, comparados contra referencia. Es lo único que impediría una regresión
   estética silenciosa.
6. **Terminar `/docs` y las guías** con el sistema (R.2). Tienen buen armazón y
   son la superficie de captación orgánica.
7. **Ilustraciones propias para los estados vacíos** (R.3), en la línea del
   isotipo: geometría, no stock.
8. **Modo presentación** (R.5): una vista limpia sin paletas para enseñar el plano
   al cliente. Diferenciador barato y muy vendible.
9. **Revisar el embudo en móvil de verdad**, con dedo y no con puntero fino. La
   regla `@media (pointer: coarse)` existe y está medida, pero el embudo público
   nuevo no se ha vuelto a medir.
10. **Escribir el gate de tono de voz.** El de diseño impide un hex suelto; nada
    impide todavía un «¡Revolucionario!» en la portada.


---

## Cola de reserva — lo que se alcanzó

| # | Ítem | Estado |
| - | ---- | ------ |
| R.1 | Sistema de movimiento tokenizado | ✅ (en la ola 0) |
| R.2 | Documentación y guías con el sistema | ✅ |
| R.3 | Ilustraciones SVG propias | ✅ |
| R.4 | `/status` y `/support` premium | ✅ |
| R.5 | Modo presentación del estudio | pendiente |
| R.6 | Infraestructura de claves i18n del estudio | pendiente |

**R.3 · las tres ilustraciones** están dibujadas con el vocabulario del isotipo
—trazo de plano, líneas de construcción, nodos de referencia a objetos— y todas
en `currentColor`, así que funcionan en los dos temas sin una sola variante:

- **Lienzo vacío**: una hoja con su cajetín. Dice «aquí va un plano» sin dibujar
  uno; una planta terminada prometería un contenido que la pantalla no tiene.
- **Sin resultados**: una lupa con marcas de centro y cota de radio con su marca
  oblicua — una lupa dibujada como se dibuja en un plano.
- **Algo se rompió**: una línea de construcción interrumpida con los dos nodos
  huérfanos en ámbar, que es exactamente lo que el editor pinta cuando una
  referencia se rompe. El dibujo dice lo mismo que el mensaje.

---

## Nota de método, para la próxima campaña

Tres cosas costaron tiempo y merecen quedar escritas:

1. **Correr los goldens mientras se edita no sirve.** El `webServer` de Playwright
   es `npm run dev` y recarga en caliente con cada guardado. La primera corrida
   dio seis fallos con duraciones de 3,5 y 4,6 minutos — firma inconfundible de
   una recarga a mitad de prueba. Toda medición de goldens se hace con el árbol
   quieto, y un `build` o un `lint` en paralelo cuenta como movimiento.

2. **Antes de culpar a la rama, correr el control.** Cada fallo se clasificó con
   `git stash` + corrida sobre `HEAD`. De doce rojos, seis eran anteriores a la
   campaña, cuatro venían de la sesión paralela y sólo dos eran míos.

3. **Dos sesiones sobre el MISMO árbol de trabajo es el riesgo real.** La campaña
   de identidad renombró `components/line-engineering/` a `components/cad/` a
   mitad de una ola, y el servidor de desarrollo se quedó con el grafo de módulos
   a medias. Lo que lo hizo sobrevivible: staging explícito por ruta (nunca
   `git add -A`), sacar sus archivos del índice antes de cada commit, y
   transformaciones de archivo en una sola lectura-escritura para que la ventana
   en la que se puede pisar su trabajo dure milisegundos.
