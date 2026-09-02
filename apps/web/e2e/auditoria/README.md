# Las pruebas de la auditoría de cliente final

**Estas pruebas están rojas a propósito.** No corren en la suite. Cada una reproduce en el
navegador un defecto confirmado y seguirá roja hasta que ese defecto se arregle.

## De dónde salieron

El 1 de septiembre de 2026 se usó Valle Design como lo usaría un despacho: diez recorridos
de oficina reales —levantar una planta, dibujar por coordenadas, montar el estándar de
capas, acotar para obra, modificar un plano ajeno, sacarlo en papel a escala, intercambiarlo
por DXF, mirarlo en tres dimensiones, reutilizar mobiliario, trabajar en equipo—. Cada FALLA
pasó después por un refutador adversario cuyo único encargo era tumbarla. **26 fallos
encontrados, 22 sobrevivieron.** El informe entero está en
`docs/competitive/auditoria-cliente-final-20260901.md`.

Estos archivos son la parte ejecutable de ese informe: no describen el defecto, lo
**reproducen**.

## Por qué no corren en la suite

Meterlas dejaría el veredicto de E2E en rojo permanente. Y un veredicto que siempre está
rojo deja de mirarse — es literalmente la enfermedad que costó semanas de regresiones
escondidas cuando el job de E2E se cancelaba y nadie lo notaba. Así que se excluyen
explícitamente en `playwright.config.ts` (`testIgnore: ["auditoria/**"]`).

Pero **una carpeta de pruebas excluida se pudre en silencio**, que es la misma enfermedad con
otro disfraz. Por eso la exclusión no viaja sola:
`scripts/cad/check-auditoria-manifest.mjs` (dentro de `npm run check:cad`) exige que cada
archivo esté declarado en `manifiesto.json` con **qué defecto reproduce**, que no haya
entradas sin archivo, y que **la lista sólo encoja**.

## La regla de graduación

Cuando un defecto se arregla, su prueba **no se borra**:

1. Se **muda** a `e2e/golden/`, donde pasa a defender el arreglo contra la próxima regresión.
2. Se quita su entrada de `manifiesto.json`.
3. Se **baja el techo** en uno.

El techo sólo baja. Subirlo pide una auditoría nueva y su entrada en
`docs/governance/assisted-development-log.json`.

## Las tres que están en verde, y por qué se quedan

`00-arranque.spec.ts`, `planta.spec.ts` y `precision.spec.ts` pasan, y están marcadas
`impacto: "arnes"`. La primera comprueba que el terreno está puesto —si se pone roja,
ningún rojo de sus hermanas significa nada, porque no se sabrá si es el producto o el arnés—.
Las otras dos son la prueba de que **el recorrido bueno sigue bueno** mientras se arregla lo
demás: la tarea número uno de un despacho sale, las cuatro esquinas cierran con holgura cero
exacta, y una cota de 3500 mm se guarda como 3500 clavado.

## Cómo se corren

**`E2E_AUDITORIA=1` tampoco es opcional**: sin ella Playwright no ve esta carpeta —está en
`testIgnore`— y responde «No tests found», que parece un error de ruta y no lo es.

El puerto **no es opcional**. El build de producción inlinea `NEXT_PUBLIC_API_URL`, y las
fixtures interceptan el origen que diga `E2E_API_ORIGIN`. Si no casan, el estudio no carga y
la pantalla dice «No existe un documento histórico compatible» o «Buscando documento
histórico…». Eso **no es un defecto del producto**: es el puerto.

```bash
cd apps/web
NEXT_PUBLIC_API_URL=http://localhost:4000 npx turbo run build --filter=web
E2E_PROD=1 E2E_AUDITORIA=1 E2E_API_ORIGIN=http://localhost:4000 \
  npx playwright test e2e/auditoria/<archivo> --project=chromium --reporter=line
```

`00-arranque.spec.ts` es el esqueleto: exporta `abrirEstudio()` y `documentoSemilla()`, y
documenta las cuatro fixtures de localizadores que hay que usar en vez de nombrar la
interfaz a mano (`camera-preset`, `draft-toolbar`, `tool-palette`, `world-point`) — dos de
ellas con su propio gate, `check:e2e-localizadores`.

> **Aviso de máquina.** Con el contenedor a carga media 10 sobre 4 núcleos estas pruebas
> agotan sus plazos y el rojo no significa nada. Mire `uptime` antes de creerse un rojo
> local: en la propia auditoría, cinco pruebas que fallaban bajo carga pasaron en reposo.
