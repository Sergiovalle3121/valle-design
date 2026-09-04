# F1 · DWG dentro del producto

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `packages/dwg-codec/**`
- `apps/web/src/lib/cad/dwg-*`
- `apps/web/src/lib/cad/interop*`
- `scripts/dwg/**`
- `docs/cad/evidence/dwg-*`
- `el repo valle-design-dwg-conformance completo`

## Cola

1. Writer público: de 9 clases a las de un plano de despacho — INSERT con ATTRIB, DIMENSION con su bloque anónimo, LEADER/MLEADER, HATCH de patrón (hoy sólo sólido), SPLINE, TABLE, VIEWPORT y espacio papel. Cada clase verificada por el oráculo externo antes de darla por buena.

2. Escritura de la familia moderna (AC1024/AC1027/AC1032): un cliente pedirá «guárdalo en 2018».

3. Preservación opaca en round-trip DENTRO del producto: proxies, objetos AEC y ACIS viajan intactos de entrada a salida, con su manifiesto de pérdida visible.

4. Segundo oráculo externo como binario (dwg2dxf de LibreDWG o equivalente) cableado al arnés, para que «doble validación» deje de ser una etiqueta. Si no se puede instalar en este entorno, se declara con el intento y el motivo.

5. Paquete de firma: ADR-0009 §encendido con matriz de soporte, límites, riesgos y checklist, listo para que el titular encienda DWG_IMPORT_FLAG y DWG_EXPORT_FLAG con un solo commit.

## Cierre

Corpus completo en cero discrepancias con las clases nuevas; `dwg-oda-roundtrip.json` con ≥20 casos sobre el writer público; documento de firma en `docs/adr/`.

## Lo que hay que tener presente

Las dos banderas NO se encienden en esta campaña. Clean-room: la ODS pública y el corpus propio son las únicas fuentes; los oráculos sólo como binarios; cada hecho nuevo al SOURCE_REGISTER ANTES de tocar código.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/execution/frentes/dwg-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-dwg` sobre la rama `campana/superar/dwg`. Commits sí;
  **push a origin no** (el coordinador hace un push por ventana).
- **R6 Las reglas de la casa, intactas.** Prohibido relajar gates, umbrales, goldens o
  presupuestos. Prohibido tocar identificadores persistidos (IDENTITY.md, ADR-0010).
  Prohibido renombrar `data-testid`. Fix-or-hide: lo que no gana su evidencia no es visible.
  Ningún claim sin evidencia; lo parcial se declara «todavía no» en tu bitácora, con fecha.
  Las banderas `DWG_IMPORT_FLAG` y `DWG_EXPORT_FLAG` NO se encienden en esta campaña.
- **R7 Bitácora.** Este archivo es tu memoria. Si tu contexto se compacta, lo relees primero.
  Nunca se pregunta al titular: se decide, se anota y se sigue.

## Cómo se valida antes de dar algo por hecho

```
cd /home/user/vd-dwg
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

_(sin entradas todavía)_

## «Todavía no»

_(sin entradas todavía)_
