# El rendimiento, leído de la medición y no de la rúbrica

Medido el 2026-09-05 sobre `docs/cad/evidence/browser-slo-100k.json`, el artefacto que
publica la corrida de navegador. **La rúbrica declara UNA fila incumplida
(`performance.architecture-100k`). La medición dice bastante más, y la diferencia
importa porque cambia qué hay que atacar.**

SLO declarado: **detalle completo ≤ 5 000 ms** y **paneo ≥ 30 fps p95**.

## Lo que vive un usuario hoy (pipeline `next`, el del producto)

| | Corpus | Entidades | Detalle | Paneo | Zoom |
|---|---|---:|---:|---:|---:|
| ✅ | architecture | 10 000 | 1 907 ms | 59,5 fps | 33 ms |
| ✅ | cartography | 10 000 | 703 ms | 59,2 fps | 16 ms |
| ✅ | baseline | 10 000 | 490 ms | 59,5 fps | 33 ms |
| ✅ | mechanical | 10 000 | 467 ms | 59,9 fps | 50 ms |
| ⚠️ | text-hostile | 10 000 | 427 ms | **29,9 fps** | 34 ms |
| ❌ | **architecture** | **100 000** | **25 340 ms** | **8,6 fps** | 303 ms |
| ❌ | cartography | 100 000 | 7 350 ms | 20,1 fps | 67 ms |
| ❌ | text-hostile | 100 000 | 6 297 ms | 8,6 fps | 48 ms |
| ❌ | mechanical | 100 000 | 5 177 ms | 30,0 fps | 116 ms |
| ✅ | baseline | 100 000 | 4 244 ms | 30,0 fps | 67 ms |

**Máquina declarada:** AMD Ryzen 5 5500U, 12 CPU lógicas, 7,9 GB, Chromium, win32.

## La lectura honesta, en tres frases

1. **A la escala de un plano normal de despacho —10 000 entidades— el producto va bien.**
   59 fps en cuatro de los cinco corpus. Esto no es un producto lento.
2. **Hay un acantilado entre 10 000 y 100 000.** `architecture` pasa de 1,9 s y 59 fps a
   **25,3 s y 8,6 fps**: trece veces más lento en detalle y siete veces peor en paneo,
   por diez veces más entidades. Eso no es una curva, es un cambio de régimen.
3. **El peor corpus es justo el del usuario objetivo.** `architecture` no es un caso de
   esquina: es lo que dibuja un arquitecto. `baseline` —líneas, círculos y arcos— sí
   cumple a 100 000, así que el problema no es el número de entidades: es **lo que hay
   dentro de esas entidades** en una mezcla de arquitectura.

## Qué NO se puede concluir de esto, y hay que decirlo

- El artefacto mide también un pipeline `legacy` con números catastróficos (0,033 fps en
  `mechanical`@10k). **Ése no es el pipeline del producto**: es el plan anterior
  (`planCadNativeRenderBudget`) que el benchmark conserva para demostrar la mejora.
  Citarlo como si fuera lo que vive un usuario sería mentir. Con `legacy` incluido,
  15 de 20 perfiles incumplen; **con `next` solo, son 4 de 10** y todos a 100 000.
- No se midió en una máquina de despacho real ni en Firefox o Safari.

## Para la sesión de Fable

El objetivo no es «mejorar el rendimiento». Es **`architecture`@100k**, y en este orden:

1. **El detalle completo (25,3 s → ≤5 s) antes que los fps.** Es el que más se desvía —
   cinco veces el techo contra 3,5 veces en paneo— y el que ve el usuario al abrir.
2. **Perfilar contra `baseline`@100k, que SÍ cumple**, para aislar qué tiene la mezcla de
   arquitectura que no tienen las líneas y los arcos. La respuesta está en esa diferencia,
   no en el número de entidades.
3. `text-hostile` a 10 000 roza el límite (29,9 fps). Es la señal temprana del mismo
   problema: el texto pesa.

**Reproducir:** `npm run check:slo-navegador`. El artefacto se regenera con la corrida de
navegador; la máquina se declara dentro, y comparar entre máquinas distintas no vale.
