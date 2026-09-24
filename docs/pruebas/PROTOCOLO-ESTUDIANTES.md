# Prueba de primer uso con estudiantes

Sergio organiza la sesión con cinco estudiantes de primeros semestres de arquitectura o ingeniería. Cada estudiante usa su propia laptop, con navegador y cuenta nuevos o datos de sitio limpios. Se graban pantalla y voz con su consentimiento. La persona facilitadora lee cada encargo literalmente, uno a la vez, sin mostrar dónde están las herramientas ni intervenir durante la tarea. La sesión dura hasta veinte minutos; para el criterio de salida cada estudiante debe completar las cuatro tareas sin ayuda en diez minutos o menos.

1. «Dibuja una recámara de 3 × 4 metros y dime cuántos metros cuadrados tiene.» El espacio debe quedar cerrado, con nombre y área visibles en el plano.
2. «Ponle una puerta y una ventana.» Ambas deben verse en muros del espacio y permanecer al terminar la acción.
3. «Pon una cota de 4 metros en el muro largo.» La medida debe ser legible sin abrir paneles técnicos.
4. «Comparte el plano con alguien que lo abra en un celular.» Se abre el enlace en 390 × 844; plano y m² deben verse sin desplazamiento horizontal.

Por tarea se anota si terminó, la duración desde la lectura del encargo, dónde se detuvo y la frase literal que dijo al detenerse. Se registra cualquier ayuda como **no completada sin ayuda**, aunque luego termine. Antes de cada estudiante se reinicia el demo y se verifica que no hereda dibujos de otra sesión. El criterio global es al menos cuatro de cinco estudiantes con las cuatro tareas terminadas sin ayuda en diez minutos o menos. La prueba automatizada de `scripts/qa/medir-tareas.mjs` complementa esta observación; no sustituye las sesiones humanas.

| Estudiante | Fecha y equipo | 1. Cuarto (tiempo, resultado, atasco y frase) | 2. Aberturas | 3. Cota | 4. Enlace móvil | 4/4 sin ayuda ≤10 min |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Pendiente de Sergio | — | — | — | — | — |
| 2 | Pendiente de Sergio | — | — | — | — | — |
| 3 | Pendiente de Sergio | — | — | — | — | — |
| 4 | Pendiente de Sergio | — | — | — | — | — |
| 5 | Pendiente de Sergio | — | — | — | — | — |

## Línea base automatizada, 23-09-2026

Chromium, `es-MX`, contexto limpio, 1440 × 769, `https://vallecad.com/demo`: **0/4**. El robot dibujó los cuatro muros en siete acciones y el lienzo cambió, pero no apareció el rótulo de 12 m²; puso puerta y ventana en cuatro acciones, sin conteos visibles; dibujó una cota en cuatro acciones, pero la medida no fue legible para la prueba; no encontró el botón «Compartir». Resultado local y capturas: `apps/web/e2e/.artifacts/medicion-versionado-base-23-09/` después de ejecutar el comando del README. El script sale con código 1 mientras la puerta de salida esté roja y por eso se ejecuta fuera de la CI requerida hasta que pase completa.
