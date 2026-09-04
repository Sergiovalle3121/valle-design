# Peticiones de F2 · Velocidad sentida

Lo que este frente necesita **fuera de su territorio** (R1) o en un **archivo compartido**
(R2). El coordinador las aplica en la ventana de integración; el frente **no** las toca.

Formato de cada petición:

```
### P-velocidad-NN · <título>
- **Archivo:** <ruta exacta>
- **Por qué:** <qué entrega de la cola lo necesita>
- **Cambio exacto:** <diseño completo — el coordinador no adivina>
- **Cómo se comprueba:** <la spec o el gate que lo demuestra>
- **Estado:** pendiente | aplicada | rechazada (<motivo>)
```

## Peticiones

### P-velocidad-01 · Encadenar el spec del artefacto de ganancia del kernel a `check:cad`

- **Archivo:** `package.json` (raíz) — archivo compartido, R2.
- **Por qué:** entrega 2 de la cola («la evidencia de la ganancia»). El artefacto
  `docs/cad/evidence/curve-kernel-render-100k.json` ya existe y su verificador ya corre, pero
  hoy hay que invocarlo a mano. Sin encadenarlo, el día que alguien edite el artefacto a mano
  —o que el enrutador deje de mandar curvas al kernel y la ganancia se evapore— ningún gate se
  mueve. Es exactamente el fallo que la regla 4 de la campaña de cimientos vino a cerrar: una
  cifra publicada que nadie vuelve a comprobar.
- **Cambio exacto:** añadir a `scripts` de `package.json` (raíz):

  ```json
  "check:curve-kernel-render": "node scripts/perf/curve-kernel-render-bench.spec.mjs && node scripts/perf/curve-kernel-render-bench.mjs --check"
  ```

  y encadenarlo dentro de `check:cad`, justo después de `node scripts/wasm/build-kernel.mjs --check`
  (que es su vecino natural: comprueba el binario, y esto comprueba lo que el binario ahorra):

  ```
  … && node scripts/wasm/build-kernel.mjs --check && npm run check:curve-kernel-render && node scripts/cad/mexican-drafting-standards-evidence.mjs --check && …
  ```

  El orden importa: `build-kernel.mjs --check` falla antes si el `.wasm` del árbol no es el de
  su manifiesto, y entonces el mensaje que ve quien corre el gate es el útil («recompila el
  kernel») y no el derivado.

  **Ni el spec ni `--check` regeneran nada**: los dos leen el artefacto publicado y tardan
  milisegundos. La REGENERACIÓN (`node scripts/perf/curve-kernel-render-bench.mjs`, minutos)
  se queda fuera de todo gate a propósito, por el mismo motivo por el que
  `wasm-parity-evidence.mjs` tampoco está encadenado: los tiempos se miden en máquinas con
  vecinos y convertirlos en umbral produce un gate que falla por contención y no por una
  regresión del producto.
- **Cómo se comprueba:** `npm run check:curve-kernel-render` en verde imprime
  `curve-kernel-render-bench: N comprobaciones — …` y
  `docs/cad/evidence/curve-kernel-render-100k.json: PASA`. Para ver que el gate MUERDE, basta
  cambiar a mano `environment.gpu` a `true` en el artefacto: el spec lo rechaza citando `gpu`.
- **Estado:** pendiente
