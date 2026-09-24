# Robot estudiante

`medir-tareas.mjs` reproduce cuatro encargos consecutivos en `/demo`, en un
solo contexto nuevo de Chromium, `es-MX` y 1440 × 769. Mide la escala por la
regla visible, dibuja un cuarto de 3 × 4 m, coloca puerta y ventana, acota el
muro largo e intenta compartir el plano con un invitado a 390 × 844.

Desde la raíz del repositorio, después de `npm ci`:

```powershell
node scripts/qa/medir-tareas.mjs local http://localhost:3000
node scripts/qa/medir-tareas.mjs produccion https://vallecad.com
```

En un worktree sin dependencias propias se puede usar una instalación de otro
checkout con `VALLE_QA_DEPS_ROOT` apuntando a la raíz de ese checkout. El script
no copia ni modifica `node_modules`.

Las acciones se limitan a clics en el lienzo o en botones con rótulo visible y
a Enter. Las lecturas de DOM, píxeles y portapapeles verifican el resultado; no
controlan el editor. La tarea de cuarto exige un rótulo nuevo de 11.5–12.5 m²
dentro del cuarto y hasta 8 acciones. Puerta y ventana exigen incrementos
visibles de sus conteos y cambios de píxeles, en hasta 4 acciones. La cota exige
texto nuevo de 4.00 m o 4000 mm junto al muro y cambio de píxeles, en hasta 4
acciones. Compartir exige el botón, el enlace copiado, plano y m² visibles en
el celular, y ningún desplazamiento horizontal, en hasta 3 acciones.

La salida está en `apps/web/e2e/.artifacts/medicion-<etiqueta>/`: `tareas.json`,
captura inicial, captura por tarea y, si se abre el enlace, captura móvil. La
carpeta está ignorada por Git. El JSON omite el token del enlace de revisión.
El proceso devuelve código 1 si alguna tarea falla: una línea base roja es un
resultado útil y **no forma parte de `npm run check:cad` ni de la CI requerida**.
Cada fase de producto debe mejorar el mismo protocolo, sin relajar sus límites
ni dar por completada una tarea sólo porque cambió el lienzo.
