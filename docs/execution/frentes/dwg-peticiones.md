# Peticiones de F1 · DWG dentro del producto

Lo que este frente necesita **fuera de su territorio** (R1) o en un **archivo compartido**
(R2). El coordinador las aplica en la ventana de integración; el frente **no** las toca.

Formato de cada petición:

```
### P-dwg-NN · <título>
- **Archivo:** <ruta exacta>
- **Por qué:** <qué entrega de la cola lo necesita>
- **Cambio exacto:** <diseño completo — el coordinador no adivina>
- **Cómo se comprueba:** <la spec o el gate que lo demuestra>
- **Estado:** pendiente | aplicada | rechazada (<motivo>)
```

## Peticiones

### P-dwg-01 · Un lugar donde guardar la trama de un sombreado AJENO

- **Archivo:** `apps/web/src/lib/cad/cad-document.ts` (esquema del documento canónico,
  archivo COMPARTIDO por R2) y, si el coordinador decide subir versión de esquema,
  `apps/web/src/lib/cad/cad-document-migrate.ts`.
- **Por qué:** entrega 2/5 del frente (HATCH de patrón). La ESCRITURA ya está cerrada: el
  producto resuelve su tabla propia y el DWG sale con sus líneas de definición. La
  LECTURA no: un sombreado ajeno con trama entra al documento como `pattern: "ANSI31"` y
  se redibuja con NUESTRA tabla, que a escala 1 separa 1 unidad donde el archivo ajeno
  separaba 0.125 (medido en `11-hatch` del corpus admitido). No es un error del lector
  —`decodeHatch` lee la trama entera y `dwgDatabaseToCanonicalDocument` ya la
  transporta—: es que el documento del producto no tiene dónde ponerla.
- **Cambio exacto:** añadir al miembro `type: "hatch"` de la unión de entidades un campo
  OPCIONAL, sin cambiar ningún campo existente:

  ```ts
  /**
   * La trama tal como venía en el archivo importado, cuando el archivo la
   * traía. Ausente = el sombreado se dibuja con la tabla propia
   * (`hatch-pattern-table.ts`), que es el caso de todo sombreado creado aquí.
   * Los ángulos van en GRADOS, como el resto del documento; los desfases y
   * los trazos, en unidades de dibujo y ya girados al dibujo — la misma
   * forma que `cadHatchPatternDxfLines` produce y que el DXF escribe en
   * 53/43/44/45/46/79/49.
   */
  patternDefinition?: {
    lines: {
      angle: number;
      base: CadPoint2;
      offset: CadPoint2;
      dashes: number[];
    }[];
  };
  ```

  No lleva `scale` ni `double` propios: `scale` y `angle` ya viven en la entidad, y la
  doble trama del formato se expresa como una familia más en `lines`. Es aditivo y
  opcional, así que NO necesita subir la versión de esquema ni migración: un documento
  guardado antes lo omite y se comporta igual que hoy. Si el coordinador prefiere subirla
  igualmente, la migración es identidad.
- **Cómo se comprueba:** con el campo en el esquema, este frente cierra el círculo en
  `dwg-document-bridge-entities.ts` (territorio propio) y lo prueba con una spec que
  importe `11-hatch` del corpus admitido y afirme que la separación del ANSI31 leído es
  0.125 y no 1 — hoy esa spec no se puede ni escribir. `apps/web/src/lib/cad/
  cad-document.spec.ts` y `persisted-identifiers.spec.ts` deben seguir verdes: el campo es
  nuevo y opcional, no renombra nada persistido.
- **Estado:** aplicada (2026-09-04, ventana de integración, grupo F). El campo entró con su nombre,
  su forma y sus nombres internos exactos (`lines[].angle` en GRADOS, `base`, `offset`, `dashes`),
  opcional y aditivo, sin tocar un solo campo existente, sin subir `CAD_DOCUMENT_SCHEMA` —sigue en
  10— y sin migración, tal como la petición razona.

  **Lo que NO cupo donde la petición lo ponía, y qué se hizo en su lugar.** `cad-document.ts`
  estaba en 799 líneas de un tope DURO de 800: no figura en `allowances` de
  `scripts/cad/monolith-budget.json`, así que le aplica `maxLines`. El campo con su comentario
  —doce líneas— habría dejado el archivo en 811 y `check:cad` en rojo, y meterlo en `allowances`
  habría sido relajar un presupuesto, que está prohibido. Se aplicó el precedente que el propio
  repositorio dejó escrito para este caso exacto en `cad-entities-v10.ts` («`cad-document.ts`
  tiene tope de 800 líneas y lo que se añade se extrae»): el campo vive DOCUMENTADO en un módulo
  HOJA nuevo, `apps/web/src/lib/cad/cad-hatch-imported-pattern.ts` (su único import es
  `import type`, así que no cierra ciclo), y el miembro `hatch` lo intersecta igual que
  `dimension` intersecta `CadSchema10DimensionFields`. En `cad-document.ts` eso cuesta UNA línea
  —el `import type`— y dos caracteres: `| {` → `| ({` y `}` → `} & CadHatchImportedPattern)`. El
  tipo público no cambia: `Extract<CadDocument["entities"][number], { type: "hatch" }>` sigue
  resolviendo y el estrechamiento por `type === "hatch"` sigue funcionando, que es lo que
  `dimension` lleva demostrando desde el esquema 10.

  **Consecuencia que hay que decir sin adornos:** `cad-document.ts` queda en 800/800. El
  siguiente campo del esquema NO cabe en ese archivo; quien lo necesite tendrá que extraer antes,
  y el gate se lo dirá con su propio mensaje («Divídelo; no lo añadas al manifiesto salvo que
  exista una razón escrita»).

  **La colisión de nombre que conviene conocer, medida y no supuesta:** `dwg-native-writer.ts` ya
  usaba la clave `patternDefinition` en el registro que manda al laboratorio, pero con OTRA forma
  —`angle`/`scale`/`double` arriba, `basePoint` en vez de `base`, y en RADIANES—. Ahora que la
  entidad canónica también puede traer una, se midió qué cambia: nada. Un sombreado NO sólido con
  nombre que la tabla no conoce ni llega al conversor (`cadEntityIsDwgWritable` lo filtra antes y
  lo declara como pérdida); uno de patrón conocido se sobrescribe con la trama resuelta por la
  tabla propia; y uno sólido no mira el campo. Medido sobre los tres casos con el campo nuevo
  puesto: preflight `{"writableCount":2,"unwritableByType":{"hatch":1}}`, el ANSI31 sale con
  1.5707963267948966 rad —los 90° de NUESTRA tabla, no los 45° del campo ajeno—, el sólido sigue
  sin bloque de trama y el desconocido sigue en `hatch-pattern-definition-missing`. NO se tocó
  `dwg-native-writer.ts`: es territorio del frente, no de este grupo.

  Verde: `cad-document.spec.ts`, `persisted-identifiers.spec.ts` y `cad-document-migrate.spec.ts`
  pasan; `npm run typecheck` 8/8; la suite 593/593; `check:cad` y `check:dwg` completos en verde
  con el espejo del corpus (`check:dwg-firma`: 50 comprobaciones, banderas apagadas).

  Lo que queda para el frente, tal como la propia petición lo reparte: cerrar el círculo en
  `dwg-document-bridge-entities.ts` y escribir la spec que importa `11-hatch` del corpus admitido
  y exige 0.125 en vez de 1. Hasta que eso entre, el campo existe y nadie lo escribe: el
  sombreado ajeno se sigue redibujando con la tabla propia.

### P-dwg-02 · Injertar en ADR-0009 la sección del encendido, ENLAZANDO el paquete de firma

- **Archivo:** `docs/adr/0009-dwg-promotion-package.md` (fuera del territorio del frente
  por R1; el frente no lo toca).
- **Por qué:** entrega 5/5 del frente. El paquete de firma existe y está vivo en
  `docs/cad/evidence/dwg-firma-encendido-20260904.md`, verificado por
  `node scripts/dwg/check-firma-package.mjs`. Lo que falta es que la ADR —el documento
  que el titular firma— **apunte** a él. La ADR no puede repetir sus cifras: eso las
  pondría a envejecer en dos sitios, que es justo lo que la regla 4 de la campaña de
  cimientos prohíbe y lo que este entregable construyó para evitar.
- **Cambio exacto:** añadir al FINAL del archivo, después de §9.5, esta sección
  completa. No toca ninguna sección existente y no cambia ningún gate:

  ```markdown
  ## 10. PROPUESTA — encendido de `DWG_IMPORT_FLAG` y `DWG_EXPORT_FLAG` — 2026-09-04 — SIN FIRMAR

  El frente F1 de la campaña «Superar a AutoCAD completo» dejó redactado el paquete
  que esta sección necesitaba: **`docs/cad/evidence/dwg-firma-encendido-20260904.md`**.
  Esta sección lo INCORPORA POR REFERENCIA y no copia una sola de sus cifras — están
  todas en bloques generados desde los artefactos de evidencia, y
  `node scripts/dwg/check-firma-package.mjs` falla si alguna se queda atrás. Una tabla
  duplicada aquí envejecería en silencio, que es exactamente el defecto que esa página
  existe para no cometer.

  Qué contiene ese paquete, y dónde:

  | Lo que esta ADR necesita | Sección del paquete |
  | --- | --- |
  | Qué se encendería y por qué la bandera no basta | §1 |
  | Las dos mediciones sobre material ajeno, con su corpus fijado | §2 |
  | Matriz de soporte por clase: lectura, perfil de producto, escritura, anclaje | §3 |
  | Límites declarados (cota, directriz, TABLE, familia moderna, xrefs, hoja) | §4 |
  | Riesgos legales y de seguridad, con el gate que cubre cada uno | §5 |
  | El segundo oráculo: qué se intentó, qué lo impidió y qué haría falta | §6 |
  | Los pasos exactos del titular, con la lista de casos derivada del arnés | §7 |
  | Dónde está hoy el oráculo externo | §8 |
  | El commit del encendido, paso por paso | §9 |

  **Lo que esta propuesta pide firmar**, si el titular decide hacerlo DESPUÉS de correr
  §7 del paquete en su máquina y de que `npm run check:dwg-oraculo` diga que la
  evidencia ya alcanza:

  1. **Autorizar** el encendido de las dos banderas con el alcance de la matriz de §3
     del paquete y los límites de §4, con rollout por organización y nunca activación
     global.
  2. **Aceptar** que sigue habiendo UN solo oráculo externo. La política pide dos
     (`DWG_REQUIRED_INDEPENDENT_VALIDATIONS`), y §6 del paquete declara por qué el
     segundo no se pudo cablear y qué haría falta. `independentValidations` no llega a
     su umbral sin él.
  3. **Mantener** `legalReviewCleared` en `false` hasta el dictamen externo, como ya
     decidió §6-bis.2. Encender las banderas no lo mueve.

  **Lo que NO autoriza:** disponibilidad general, afirmación de compatibilidad con
  AutoCAD real, escritura de la familia moderna, ni tratar el perfil de escritura como
  equivalente al de lectura.
  ```

  Y añadir, en la tabla de §5 «Checklist de gates», una fila nueva al final —sin tocar
  las existentes—:

  ```markdown
  | Paquete de firma del encendido | ✅ `docs/cad/evidence/dwg-firma-encendido-20260904.md`, verificado por `scripts/dwg/check-firma-package.mjs` |
  ```

- **Cómo se comprueba:** `node scripts/dwg/check-firma-package.mjs` sigue verde (la ADR
  no toca el paquete) y `npm run check:dwg-oraculo` sigue diciendo `false` (la ADR no
  toca ninguna bandera ni ningún gate). Si el coordinador prefiere que la ADR también
  quede vigilada, la comprobación natural es un aserto en el propio gate que exija que
  `docs/adr/0009-dwg-promotion-package.md` mencione la ruta del paquete: son tres líneas
  y el frente las escribe en cuanto la sección exista.
- **Estado:** aplicada (2026-09-04). §10 añadida al FINAL del archivo, después de §9.5, con el
  texto exacto de la petición; y la fila «Paquete de firma del encendido» al FINAL de la tabla de
  §5, sin tocar ninguna fila existente. Las nueve entradas del mapa de secciones se cotejaron una
  a una contra los encabezados reales del paquete y las nueve caen donde dicen; el paquete tiene
  además un §10 «Cómo se verifica esta página» que el mapa no cita, y no hace falta que lo cite.
  Verde: `npm run check:dwg-firma` → `50 comprobaciones · 5 bloques generados · 12 casos derivados
  de CASES` y «El paquete de firma no afirma nada que su evidencia no sostenga»; `npm run
  check:dwg-oraculo` sigue diciendo `externalOracleVerified = false`; `npm run typecheck` 8/8;
  `check:cad` y `check:dwg` completos en verde con el espejo del corpus. Las dos banderas siguen
  apagadas y el texto nuevo no insinúa lo contrario: **0 de 2 encendidas** —
  `dwg-interop-flag.ts:38` y `dwg-export-flag.ts:28` declaran ambas `: boolean = false`, cero
  ocurrencias de `= true`, y el propio gate lo reimprime («DWG_IMPORT_FLAG y DWG_EXPORT_FLAG
  apagadas»). La §10 se titula «PROPUESTA … SIN FIRMAR» y lo único que pide firmar es una decisión
  futura del titular. NO se añadió el aserto opcional que dejaría la ADR vigilada: la propia
  petición se lo reserva al frente («son tres líneas y el frente las escribe en cuanto la sección
  exista»). Consecuencia mientras no entre, dicha sin adornos: ningún gate lee esta ADR, así que si
  alguien mueve o renombra `docs/cad/evidence/dwg-firma-encendido-20260904.md`, la §10 apunta a un
  archivo que ya no existe y nada lo detecta.

### P-dwg-03 · Encadenar `check:dwg-firma` en `check:dwg`

- **Archivo:** `package.json` de la raíz (archivo COMPARTIDO por R2).
- **Por qué:** entrega 5/5. `scripts/dwg/check-firma-package.mjs` existe y pasa, pero un
  gate que nadie corre no es un gate. Sin encadenarlo, el paquete de firma envejece
  igual que si no tuviera verificación — sólo que con la ilusión de tenerla.
- **Cambio exacto:** dos ediciones en `"scripts"`, sin tocar nada más:

  1. Añadir la entrada:

     ```json
     "check:dwg-firma": "node scripts/dwg/check-firma-package.spec.mjs && node scripts/dwg/check-firma-package.mjs",
     ```

  2. En `"check:dwg"`, añadir ` && npm run check:dwg-firma` al FINAL de la cadena, justo
     después de `npm run check:dwg-oraculo`. El orden importa: el paquete de firma habla
     de la cobertura del oráculo, así que se verifica después de que el gate del oráculo
     haya dicho lo suyo.

  No necesita corpus ni red: el gate lee sólo artefactos committeados y fuentes del
  árbol, así que da el mismo resultado con espejo y sin él —al contrario que
  `check:dwg-evidence`, que hoy es dependiente del entorno—.
- **Cómo se comprueba:** `npm run check:dwg-firma` imprime el resumen y termina en cero;
  la spec pasa sus comprobaciones y está verificada por mutación (neutralizar el detector
  de cifras, el de casos inventados o la comparación de bloques la pone roja, las tres).
- **Estado:** aplicada (2026-09-04). `check:dwg-firma` en `scripts` y encadenado al FINAL de
  `check:dwg`, justo después de `npm run check:dwg-oraculo`. Verde sin espejo y con él:
  `50 comprobaciones · 5 bloques generados · 12 casos derivados de CASES` y «El paquete de firma
  no afirma nada que su evidencia no sostenga». Muerde y se propaga: añadida a mano la línea «El
  oráculo cubre 18 de 24 casos del corpus.» al paquete, `npm run check:dwg` sale 1 citando la
  cifra escrita a mano (`{ linea: 465, forma: «N de M», texto: «18 de 24» }`); deshecha la
  rotura, `npm run check:dwg` vuelve a verde en 57 s.
