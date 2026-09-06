# F10 · Buzón de peticiones

Cada petición: qué archivo, qué cambio exacto, por qué, y qué prueba lo
verifica. El coordinador las aplica, regenera el censo
(`cd apps/web && VALLE_ESCRIBIR_CENSO=1 npx tsx src/lib/cad/verification/independencia-rubrica.spec.ts`)
y vuelve a medir con `node scripts/cad/rubric.mjs`.

---

## P-F10-01 · `geo.crs` gana su evidencia independiente

**Qué archivo:** `docs/competitive/rubric.json`, criterio `geo.crs` (fila
`geo`, grupo `frontier`).

**Qué cambio exacto:** añadir a `evidence` (o a la lista de evidencias del
criterio, según la forma que tenga hoy en el JSON) un elemento:

```json
{
  "kind": "spec",
  "path": "apps/web/src/lib/geo/crs-pyproj.spec.ts",
  "independent": true,
  "note": "PROJ (envuelto por pyproj 3.7.2) reproyecta la misma malla de control de México que crs.spec.ts genera con su propia fórmula. Artefacto congelado: docs/cad/corpus/oraculos/pyproj-3.7.2.json."
}
```

**Por qué:** `docs/cad/evidence/independencia-por-fila.json` nombraba
`pyproj` como el candidato «más barato y más sólido» de las 25 filas sin
evidencia independiente para el criterio `geo.crs`. Hoy los tres caminos de
`crs.spec.ts` (cuadratura, Snyder, diferencias finitas) los escribe y ejecuta
este mismo repositorio. `pyproj` es la implementación de referencia del mundo
GIS, sin una línea de código en común con `crs.ts`.

**Qué prueba lo verifica:** `apps/web/src/lib/geo/crs-pyproj.spec.ts`, 687
comprobaciones, peor error medido 2,5×10⁻⁹ m contra una tolerancia declarada
de 10⁻³ m. Corre dentro de `npm test` (recogido por `run-specs.mjs`, patrón
`src/**/*.spec.ts`).

**Qué mueve:** la fila `geo` (grupo `frontier`, alcance `destino`) deja de
retener 1 punto. **+1 pt.**

---

## P-F10-02 · `toolset-map3d.georreferencia` gana su evidencia independiente

**Qué archivo:** `docs/competitive/rubric.json`, criterio
`toolset-map3d.georreferencia` (fila `toolset-map3d`, grupo `toolsets`).

**Qué cambio exacto:** añadir a la evidencia del criterio:

```json
{
  "kind": "spec",
  "path": "apps/web/src/lib/geo/shapefile-pyproj.spec.ts",
  "independent": true,
  "note": "Un shapefile PÚBLICO de terceros (Natural Earth, dominio público, ne_110m_populated_places_simple) leído por el lector de producción (readShapefile) y reproyectado por reprojectGeoPoint contra PROJ. Manifiesto de derechos: docs/cad/corpus/terceros-gis-manifest.json. Comparte oráculo con geo.crs (P-F10-01), tal como preveía independencia-por-fila.json."
}
```

**Por qué:** mismo motivo que P-F10-01, pero con material de terceros de
verdad (no sintético) y ejercitando el lector de producción completo
(`readShapefile` → `parseGeoCrsWkt` → `reprojectGeoPoint`), que es justo lo
que la fila de toolsets pide y `geo.crs` no alcanza a probar por sí sola.

**Qué prueba lo verifica:** `apps/web/src/lib/geo/shapefile-pyproj.spec.ts`,
80 comprobaciones, incluida la puerta de derechos completa (sha256 de los 5
archivos del shapefile y de la licencia de Natural Earth). Peor error medido:
8×10⁻⁹ m.

**Qué mueve:** la fila `toolset-map3d` (grupo `toolsets`, alcance `destino`)
deja de retener 1 punto. **+1 pt.**

**Advertencia para quien aplique esto:** las dos peticiones (P-F10-01 y
P-F10-02) comparten oráculo pero son evidencias de CRITERIOS distintos en
FILAS distintas: no son la misma petición duplicada. Aplíquense las dos.

---

## P-F10-03 · `api-sdk.contract` gana su evidencia independiente

**Qué archivo:** `docs/competitive/rubric.json`, criterio `api-sdk.contract`
(fila `api-sdk`, grupo `ext`).

**Qué cambio exacto:**

```json
{
  "kind": "spec",
  "path": "apps/web/src/lib/cad/verification/api-sdk-openapi.spec.ts",
  "independent": true,
  "note": "openapi-spec-validator 0.9.0 (PyPI, Apache-2.0) dictamina design-api.v1.yaml VÁLIDO contra el esquema OFICIAL de OpenAPI 3.1, no contra check-design-contract.mjs (que es nuestro). Artefacto congelado: docs/cad/corpus/oraculos/openapi-spec-validator-0.9.0.json, anclado al sha256 del YAML."
}
```

**Por qué:** hoy el único validador del contrato es
`scripts/cad/check-design-contract.mjs`, escrito por este proyecto, contra el
SDK que este mismo proyecto genera desde el mismo YAML.
`openapi-spec-validator` valida sintaxis contra el esquema público de la
especificación, sin compartir código con el validador propio.

**Qué prueba lo verifica:**
`apps/web/src/lib/cad/verification/api-sdk-openapi.spec.ts`, 13
comprobaciones.

**Qué mueve:** la fila `api-sdk` (grupo `ext`, alcance `destino`) deja de
retener 1 punto. **+1 pt.**

---

## P-F10-04 · `events.operational` gana su evidencia independiente

**Qué archivo:** `docs/competitive/rubric.json`, criterio
`events.operational` (fila `events`, grupo `ext`).

**Qué cambio exacto:**

```json
{
  "kind": "spec",
  "path": "apps/web/src/lib/cad/verification/events-hmac.spec.ts",
  "independent": true,
  "note": "La biblioteca ESTÁNDAR de Python (hmac + hashlib, sin instalar nada) recalcula desde cero HMAC-SHA256 sobre timestamp + \".\" + rawBody y llega al mismo X-Valle-Signature que el emisor real produce, sobre una fixture fiel al contrato (verificada contra el verificador real, verifyOutboxSignature, sin modificarlo). Rechaza la firma sobre un cuerpo alterado en un byte. Artefacto congelado: docs/cad/corpus/oraculos/hmac-stdlib.json."
}
```

**Por qué:** `webhook-replay-audit.json` (la evidencia operativa existente de
esta fila) tiene al emisor y al receptor de este mismo proyecto a los dos
lados del cable. `outbox-signature.spec.ts` prueba a fondo el verificador
real, pero en el mismo lenguaje y la misma biblioteca de criptografía
(`node:crypto`). Python, con su propia implementación de HMAC-SHA256, es el
testigo ajeno que faltaba.

**Qué prueba lo verifica:**
`apps/web/src/lib/cad/verification/events-hmac.spec.ts`, 12 comprobaciones.
Nota para quien revise: este spec importa dinámicamente (vía
`import() + pathToFileURL`, nunca un `import` estático) el módulo REAL
`apps/api/src/modules/outbox-receiver/outbox-signature.ts` **sin modificarlo**,
sólo para comprobar que la fixture generada aquí es fiel al contrato real —
exactamente el mismo patrón que `independencia-rubrica.spec.ts` ya usa para
leer `scripts/cad/rubric.mjs`. No se ha tocado ni un byte de `apps/api/src/`.

**Qué mueve:** la fila `events` (grupo `ext`, alcance `destino`) deja de
retener 1 punto. **+1 pt.**

---

## P-F10-05 · Corrección de dato en `PROMPT_MAESTRO_FABLE.md`

**Qué archivo:** `docs/execution/auditoria-fable/PROMPT_MAESTRO_FABLE.md`,
tabla de la ficha T-03 (Ola 0), fila «Importación de JSON canónico».

**Qué cambio exacto:** el oráculo sugerido para `json-import.fuzzing` dice
«Fuzzer ajeno: `radamsa`, `atheris` o `hypothesis` en PyPI». **`hypothesis` es
MPL-2.0**, verificado contra el índice de PyPI el 2026-09-06
(`curl -sS https://pypi.org/pypi/hypothesis/6.167.1/json` →
`license_expression: "MPL-2.0"`). `CORPUS_POLICY.md` del repositorio de
conformidad —que `docs/cad/corpus/oraculos/HERRAMIENTAS.md` ya usa como
estándar de licencias para TODA herramienta oráculo de este proyecto, no sólo
el corpus DWG (así excluyó LibreDWG por GPL e IfcOpenShell/pythonocc-core por
LGPL)— prohíbe MPL «sin excepción y sin discusión». Sugerir `hypothesis` sin
marcar esa exclusión es un dato que, de seguirse sin comprobar, habría
introducido material inadmisible.

**Qué se propone en su lugar:** `atheris` (Google, Apache-2.0, confirmado con
el texto de licencia dentro de la rueda `atheris-3.0.0-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl`,
que SÍ tiene build para Python 3.11 en esta máquina — `atheris==3.0.0`, no la
3.1.0 más reciente, que sólo publica ruedas cp312+). No se llegó a cablearlo
en esta sesión (ver `F10.md`, «Lo que sigue»); queda anotado para quien
retome `json-import.fuzzing`.

**Por qué esto es una petición y no una corrección directa:** este documento
es territorio prohibido para F10 según su propia §3 (sólo el coordinador lo
edita), aunque el error esté DENTRO de la ficha de este mismo frente.

**Qué prueba lo verifica:** el hallazgo de licencia es reproducible con el
comando citado arriba; no hay spec porque `hypothesis` nunca llegó a
instalarse con este propósito en el árbol (sólo se instaló, se detectó el
problema y se desinstaló de la máquina — nunca entró a ningún artefacto
comprometido).
