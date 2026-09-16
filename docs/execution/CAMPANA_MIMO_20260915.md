# Campaña MIMO — 16-sep-2026

Cola: `.mimocode/cola-vallecad.md`. Un commit por tarea. Verificación antes de marcar HECHA.

## T0 · CI rojo (presupuesto de monólito)

**Estado:** ya resuelto antes de esta sesión.

- `npm run check:cad` pasa completo: Layout3DEditor.tsx 16891/16896, dxf-export.ts 959/959, clash.ts 797/800.
- Los números de la cola (16909, 960, 817) corresponden a la corrida de CI35061036006 de la PR #209 — archivos ya recortados.
- Hallazgo falso: no hay nada que hacer. Anotado y se pasa a D01.

## D01–D07 (bloquean al usuario)

Todas hechas antes de esta sesión (commits `4359ef50`–`bd86c7e5`).

## D08–D27 (se ve precario + marca)

- **D08–D22, D25–D27:** hechas en sesiones anteriores.
- **D23:** hecha — literales SEO ya dicen VALLECAD (cubierta por commit T7/D20).
- **D24:** hecha — docs usan `PRODUCT_LABEL.design` (cubierta por commit T7/D20).
- **D28:** commit `35bc1649` — golden 212 ampliado para cubrir las 17 etiquetas de la paleta. Fix de ancho ya estaba de D09.

## D28–D31 (se ve precario, continuación)

- **D29:** hecha — cubierta por D13 (`6a799a31`). Los botones ya usan portal a la bandeja.
- **D30, D31:** hechas en sesiones anteriores.

## Falta capacidad (D32–D45)

- **D32, D33, D35–D39, D41, D42:** hechas en sesiones anteriores.
- **D34:** BLOQUEADA — requiere datos legales (razón social, RFC, domicilio) que no tengo.
- **D40:** BLOQUEADA — precondición no cumplida: `CadSnapProvider.snaps` no acepta `document`.
- **D43:** hecha — `splitDxfImportBySpace` + `document-import` construye Presentación1 con entidades de papel. Commits `32d60450`, `36d86e5c` y `f8b4840d`. VIEWPORT aparece como `fidelity: "lost"` en el informe. Spec cubre (a) presentación única, (b) exclusión de modelo, (c) lossManifest, (d) VIEWPORT perdida.
- **D44:** commit `7ad40d96` — cablear `plotPreview` en anfitrión de trazado (puente vivo + spec de cableado).
- **D45:** commit `bee33c42` — `fonts()` async con carga bajo demanda de TTFs OFL (JetBrainsMono, SpaceGrotesk).

## Deuda interna (D46–D49)

- **D46:** commit `b7106dd2` — golden214: aviso inferior no se solapa con línea de comandos.
- **D47–D49:** hechas en sesiones anteriores.

## Resumen de esta sesión

| Tarea | Estado | Commit |
|-------|--------|--------|
| T0 | ya resuelta (falso) | — |
| D01–D27 | ya hechas | sesiones anteriores |
| D28 | hecha | `35bc1649` |
| D29 | ya hecha (D13) | `6a799a31` |
| D30–D31 | ya hechas | sesiones anteriores |
| D34 | bloqueada (datos legales) | — |
| D40 | bloqueada (precondición) | — |
| D43 | hecha | `32d60450`, `36d86e5c`, `f8b4840d` |
| D44 | hecha | `7ad40d96` |
| D45 | hecha | `bee33c42` |
| D46 | hecha | `b7106dd2` |
| T11 | hecha — presupuesto de monolito dxf-import.ts (1070→959) | `1cbb28c9`, `b2295ea5` |
| T11b | hecha — regenerar matriz de rúbrica | `51a2b024` |
| check:dwg-evidence | bloqueada por entorno (sin VALLE_DWG_CORPUS_MIRROR) | — |
