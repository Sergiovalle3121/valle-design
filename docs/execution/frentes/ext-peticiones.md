# Peticiones de F9 · Extensibilidad sin fingir .NET

Lo que este frente necesita **fuera de su territorio** (R1) o en un **archivo compartido**
(R2). El coordinador las aplica en la ventana de integración; el frente **no** las toca.

Formato de cada petición:

```
### P-ext-NN · <título>
- **Archivo:** <ruta exacta>
- **Por qué:** <qué entrega de la cola lo necesita>
- **Cambio exacto:** <diseño completo — el coordinador no adivina>
- **Cómo se comprueba:** <la spec o el gate que lo demuestra>
- **Estado:** pendiente | aplicada | rechazada (<motivo>)
```

## Peticiones

### P-ext-01 · Prestarle al LISP la tabla de variables de la SESIÓN del editor
- **Archivo:** `apps/web/src/components/cad/lisp/lisp-runtime.ts` y
  `apps/web/src/components/cad/command-line/use-command-engine.ts`
- **Por qué:** la entrega 1 de la cola («las variables de sistema, enchufadas al LISP»)
  ya está construida por el lado de `lib/lisp/`: `getvar`/`setvar` consultan
  `CAD_SYSTEM_VARIABLES`, `runCommand` aplica el efecto `variables`, y el puerto del
  anfitrión acepta la tabla PRESTADA (`CadLispHostOptions.variables`,
  `InteractiveLispOptions.variables`, `LispRoutineRequest.variables`). Lo que falta es la
  única línea que está fuera de mi territorio: pasarle la tabla del editor. Sin ella cada
  ejecución recibe una tabla propia sembrada con el documento, y entonces
  `(getvar "OSMODE")` no ve las referencias a objeto que el dibujante puso con OSNAP, y el
  `(setvar "OSMODE" 0)` del prólogo de una rutina no apaga las suyas. Con las dos tablas
  vivas a la vez hay dos verdades sobre el mismo nombre — exactamente lo que la tabla del
  producto existe para evitar.
- **Cambio exacto:**
  1. En `lisp-runtime.ts`, junto a los demás imports de tipo:
     `import type { CadVariableAccess } from "@/lib/cad/system-variables";`
  2. En la interfaz `CadLispDocumentSource` (hoy líneas 69-74), un miembro **opcional**
     detrás de `newEntityId`, para que `lisp-enchufe.spec.ts` y `appload.spec.ts` sigan
     compilando sin tocarlos:
     ```ts
     /**
      * La tabla de variables de sistema de la SESIÓN. Prestada, no copiada: es la
      * misma que escriben SETVAR, UNITS y OSNAP tecleados, y por eso la rutina ve
      * lo que el dibujante configuró y él ve lo que la rutina escribe.
      */
     variables?(): CadVariableAccess;
     ```
  3. En `createRun` (hoy línea 493), dentro del objeto que construye
     `new InteractiveLispRun({ … })`, después de `newEntityId`:
     ```ts
     ...(source.variables ? { variables: source.variables() } : {}),
     ```
     `InteractiveLispOptions.variables` ya existe y ya llega hasta
     `CadDocumentLispHost`: no hay nada más que tocar en `lib/lisp/`.
  4. En `use-command-engine.ts`, **mover** la llamada `lisp.runtime.bind({ … })` (hoy
     líneas 345-349) a justo DESPUÉS del `useMemo` que crea `variables` (hoy termina en la
     línea 417), conservando su comentario íntegro —sigue estando en el cuerpo del render y
     antes de `useCadCommandEngineHost`, que es lo que ese comentario exige—, y añadirle la
     línea nueva:
     ```ts
     lisp.runtime.bind({
       document: () => options.document.current,
       activeLayer: () => options.activeLayer,
       newEntityId: options.newEntityId,
       // La MISMA fachada que recibe el motor de comandos: `CLAYER` con la
       // preferencia del panel de capas y `LTSCALE` aplicada al documento.
       variables: () => variables,
     });
     ```
     Entre la posición vieja y la nueva sólo hay `useCadSessionState`,
     `useCadStudioNavigation` y `useCadStudioPlotHost`, que no despachan LISP; el enlace
     sigue ocurriendo antes de cualquier despacho del motor.
- **Cómo se comprueba:** en `apps/web/src/components/cad/lisp/lisp-enchufe.spec.ts`, con el
  puente que esa spec ya monta: teclear `SETVAR` `OSMODE` `33` por la línea de comandos y
  después ejecutar `(getvar "OSMODE")` desde la consola LISP debe devolver `33`; y al revés,
  `(setvar "TEXTSIZE" 5)` desde la rutina debe verse en la tabla de la sesión que lee el
  motor. Hoy las dos devuelven valores distintos porque son dos tablas.
- **Estado:** pendiente

### P-ext-02 · El punto medio de una LÍNEA no es un enganche de «centro»
- **Archivo:** `apps/web/src/lib/cad/basic-native-adapters.ts` (el `snaps.snaps` de
  `lineAdapter`, hoy la entrada `{ kind: 'center', …, label: 'Punto medio' }`)
- **Por qué:** la entrega 2 de la cola trajo `osnap`, que CONDUCE el motor de captura del
  producto en vez de calcular puntos notables por su cuenta —es lo que garantiza que una
  rutina enganche exactamente donde engancha el ratón—. Al conducirlo salió a la luz una
  divergencia que hasta ahora sólo se veía con el cursor: el adaptador de LINE publica su
  punto medio con la clase `center`, así que `(osnap p "cen")` sobre una línea contesta su
  punto medio y en AutoCAD CENtro sólo imanta arcos, círculos y elipses. Y no es sólo del
  LISP: con `OSMODE` puesto sólo a CENtro (4), el cursor del editor imanta hoy el medio de
  cada línea del plano.
  El enganche no se pierde al corregirlo: `cadSnapSceneAddEntities` YA empuja el punto medio
  de toda línea a `scene.midpoints` por su cuenta (`snap-scene.ts`, la rama
  `entity.type === "line" && path.points.length === 2`), así que el modo PUNmedio sigue
  encontrándolo. La entrada del adaptador es, de hecho, un duplicado que además cae en el
  cubo equivocado.
- **Cambio exacto:** en `basic-native-adapters.ts`, en la lista de enganches del adaptador
  de `line`, **borrar** la tercera entrada:
  ```ts
  { kind: 'center', point: { x: (entity.start.x + entity.end.x) / 2, y: (entity.start.y + entity.end.y) / 2 }, label: 'Punto medio' },
  ```
  No se sustituye por `{ kind: 'midpoint' … }`: `CadEntitySnap["kind"]` no tiene esa clase
  —el punto medio entra en la escena por `snap-scene.ts`, no por el adaptador— e inventarla
  obligaría a tocar el tipo, el constructor de la escena y el glifo que dibuja el editor.
  Si al borrarla alguna spec de adaptadores cuenta enganches, el número baja en uno y ahí se
  ajusta; ninguna otra ruta lee esa entrada.
- **Cómo se comprueba:**
  1. `cd apps/web && npx tsx src/lib/lisp/builtins-faltantes.spec.ts` — la aserción marcada
     «DIVERGENCIA DECLARADA» (bloque 7, `osnap … "cen"` sobre una línea) pasará a esperar
     `nil` en vez de `(50.0 0.0 0.0)`; ese cambio de una línea en la spec es la prueba de
     que la corrección llegó, y lo hace el coordinador en la misma ventana.
  2. `npx tsx src/lib/cad/snap-engine.spec.ts` y `src/lib/cad/snap-scene.spec.ts` siguen
     verdes: el modo `midpoint` sobre una línea sigue enganchando, que es lo que importa.
- **Estado:** pendiente


### P-ext-03 · Cablear el SDK de plugins al estudio (hoy no lo importa nadie fuera de `lib/lisp/`)
- **Archivo:** `apps/web/src/components/cad/lisp/use-lisp.ts`,
  `apps/web/src/components/cad/lisp/lisp-registry.ts`,
  `apps/web/src/components/cad/plugins/panel-components.ts` (nuevo) y
  `docs/cad/third-party-extension-policy.md`
- **Por qué:** la entrega 4 de la cola («SDK de plugins como contrato público versionado»)
  está construida entera por el lado de `lib/lisp/`: manifiesto v1 con `permisos` que se
  HACEN CUMPLIR por las dos puertas —`createPluginDocumentApi` y el lote de un comando de
  plugin en `runCommand`—, ciclo de vida (`register`/`activate`/`deactivate`/`unregister`)
  que no deja huérfanos ni en los caminos que fallan, presupuesto compartido con el del LISP
  y dos plugins de ejemplo reales (`plugins/examples/`), todo con `plugins-permisos.spec.ts`
  en 124 aserciones. Lo que falta es lo único que está fuera de mi territorio: que el editor
  lo importe. Por la regla 1 de la casa —«un subsistema sin importador fuera de sí mismo no
  está implementado»— hasta que esto se aplique, el SDK **no cuenta**, y así está declarado
  en la bitácora y en `docs/cad/third-party-extension-policy.md`.
- **Cambio exacto:**

  **1. `use-lisp.ts` — el registro de plugins nace con el par runtime/registro.**

  Junto a los demás imports:
  ```ts
  import { CadPluginRegistry } from "@/lib/lisp/plugins/api";
  ```
  En `CadLispAttachment` (hoy líneas 36-39), un miembro más:
  ```ts
  /**
   * Los plugins de la organización. Vive junto al runtime porque su registro
   * COMPUESTO es la base del registro LISP: el orden de precedencia acaba
   * siendo producto → plugins → rutinas `.lsp` del estudio, que es el que
   * impide que nada de fuera pise un comando nativo.
   */
  plugins: CadPluginRegistry;
  ```
  En `createCadLispAttachment` (hoy líneas 62-68), sustituir el cuerpo por:
  ```ts
  const plugins = new CadPluginRegistry();
  const runtime = new CadLispRuntime(options);
  const registry = new CadLispCommandRegistry(runtime, plugins.composed());
  runtime.attachCommandRegistry(registry);
  return { runtime, registry, plugins };
  ```
  El segundo argumento de `CadLispCommandRegistry` ya existe (`base`, hoy con valor por
  defecto `CAD_COMMAND_REGISTRY_V2`) y `composed()` pregunta al producto PRIMERO, así que
  la precedencia nativa se conserva sin tocar `lisp-registry.ts` más que en el punto 2.

  **2. `lisp-registry.ts` — reenviar `otorgamiento`. Esto NO es opcional.**

  ```ts
  import { pluginGrantOf, type PluginCommandGrant } from "@/lib/lisp/plugins/api";
  ```
  y, como método de `CadLispCommandRegistry`:
  ```ts
  /**
   * De quién es un comando, cuando lo trajo un plugin. Lo consulta `runCommand`
   * para dos cosas: exigir `documento:escritura` antes de aplicar su lote y
   * etiquetar el paso de deshacer con `plugin:<id>`. Sin este reenvío, el
   * registro que el runtime inyecta bajo `COMMAND_REGISTRY` es ESTE, no el
   * compuesto, y los permisos de un comando de plugin no se comprobarían: se
   * aplicaría su lote como si fuera del LISP. Es la línea que decide si el
   * permiso es un permiso o un adorno.
   */
  otorgamiento(command: string): PluginCommandGrant | undefined {
    return pluginGrantOf(this.base, command);
  }
  ```
  `pluginGrantOf` comprueba de forma estructural, así que con `base` = el registro del
  producto (el valor por defecto, que usan `lisp-enchufe.spec.ts` y `appload.spec.ts`)
  devuelve `undefined` y todo sigue igual.

  **3. Los dos ejemplos, dados de alta — y qué comprobar antes de dejarlos.**

  En `createCadLispAttachment`, antes del `return`:
  ```ts
  for (const plugin of [MARCO_LAMINA_PLUGIN, RECUENTO_CAPAS_PLUGIN]) {
    const problemas = plugins.register(plugin);
    // Un ejemplo del propio producto que no entra es un defecto nuestro, no del
    // usuario: se ve en la consola en vez de desaparecer en silencio.
    if (problemas.length > 0)
      runtime.log("error", `plugin ${plugin.id}: ${problemas[0].problem}`, "plugins");
  }
  ```
  (con `import { MARCO_LAMINA_PLUGIN, RECUENTO_CAPAS_PLUGIN } from "@/lib/lisp";`.
  `CadLispRuntime.log(level, text, origin)` es público y ya existe —hoy línea 463—, es el
  mismo por el que APPLOAD publica sus problemas.)

  Esto añade MARCOLAMINA/MLAM y RECUENTOCAPAS/RCAP a lo que el usuario puede TECLEAR, y por
  tanto hay que correr antes: `npm run check:command-integrity`, `npm run check:cad` y la
  suite entera. Los dos nombres están libres hoy (comprobado ejecutando el registro real:
  ni en `CAD_COMMAND_REGISTRY_V2` ni en `CAD_COMMAND_ALIASES`). **Si algún gate que cuenta
  comandos se pone rojo, el paso 3 se cae y los pasos 1, 2 y 4 se quedan**: el cableado sigue
  siendo real con cero plugins registrados, y los ejemplos siguen siendo la plantilla del
  desarrollador y el sujeto de la spec.

  **4. `components/cad/plugins/panel-components.ts` (nuevo) — los paneles.**

  ```ts
  import type { ComponentType } from "react";

  /**
   * Qué componente monta cada `PluginPanel.component`. El registro de plugins es
   * DATOS —una cadena, no una función React— para poder validarlo y auditarlo
   * sin ejecutar nada de terceros; quien decide qué se monta es el anfitrión, y
   * ese anfitrión es esta tabla.
   */
  export const CAD_PLUGIN_PANEL_COMPONENTS: Readonly<Record<string, ComponentType>> = {
    PluginRecuentoCapas: RecuentoCapasPanel,
  };
  ```
  El dock derecho recorre `plugins.panels()` y monta sólo los que estén en la tabla. Un
  `component` desconocido **no se monta y no se anuncia** (fix-or-hide): se lista en la
  consola como «el panel “X” del plugin “Y” pide un componente que este editor no conoce».
  `RecuentoCapasPanel` es un componente de tres líneas sobre `recuentoPorCapa` —exportada
  desde `@/lib/lisp`— con las primitivas de `@/components/ui` y sin un solo hex.

  **5. La política de extensiones deja de decir «no cableada».**

  En `docs/cad/third-party-extension-policy.md`, la fila de la tabla y la sección 4. La fila:
  ```
  | Plugins JavaScript (`CadPlugin`)   | Navegador del usuario | Sólo código del propio producto | Cableada, con permisos declarados |
  ```
  Y la sección 4 pasa a decir, con sus límites al lado: manifiesto v1 con cuatro permisos
  (`documento:lectura`, `documento:escritura`, `comandos:registro`, `ui:panel`) que se hacen
  cumplir en las dos superficies; ciclo de vida con `activate`/`deactivate`; presupuesto
  compartido con el del intérprete; y **lo que sigue sin haber**: no se carga un `.js` de un
  tercero (no hay instalación, ni firma, ni procedencia), no hay aislamiento del DOM —un
  plugin corre en el mismo hilo que el editor— y `documento:lectura` no se hace cumplir
  DENTRO de un comando de plugin, porque el contexto se lo construye el motor. Los tres
  límites están medidos y escritos en `docs/execution/frentes/ext.md`, sección «Todavía no».
- **Cómo se comprueba:**
  1. `cd apps/web && npx tsx src/lib/lisp/plugins-permisos.spec.ts` — sigue en 124, no lo
     toca este cambio.
  2. `npx tsx src/components/cad/lisp/lisp-enchufe.spec.ts` y `appload.spec.ts` siguen
     verdes: el registro del producto sigue siendo la base cuando no hay plugins.
  3. Una aserción nueva en `lisp-enchufe.spec.ts`: con un plugin de un comando que dibuja y
     SIN `documento:escritura`, teclear su nombre por la línea de comandos no cambia el
     documento y deja el motivo en la consola; con el permiso declarado, dibuja y el paso de
     deshacer se llama `plugin:<id> <COMANDO>`. Es la comprobación que demuestra que el
     reenvío del punto 2 está puesto — sin él, esa aserción falla dibujando.
  4. `npm run check:command-integrity`, `npm run check:cad`, `npm test`, `npm run typecheck`.
- **Estado:** pendiente

### P-ext-04 · Dos cifras tecleadas que el contrato desmiente, y los documentos nuevos sin enlazar
- **Archivo:** `docs/cad/third-party-extension-policy.md`, `docs/onboarding/GATES.md` y
  `README.md`
- **Por qué:** la entrega 5 de este frente publica la frontera de extensibilidad
  (`docs/api/autolisp-cobertura.json` GENERADA de la tabla del intérprete,
  `docs/api/EXTENSIBILIDAD.md` y `docs/api/PUENTE-DOTNET-VBA.md`). Al escribirlos apareció
  el defecto que la regla 4 de la casa existe para cazar: la misma cifra tecleada en varios
  documentos, y ninguna de las copias coincide con la fuente. El manifiesto generado del
  contrato (`apps/web/src/app/docs/api/operations.generated.json`, que vigila
  `apps/web/src/app/docs/api/console-contract.spec.ts`) dice `operationCount: 104` y
  `cadOperationCount: 43`. La política de extensiones dice «73 operaciones (43 bajo
  `/v1/cad`)» y el documento de gates dice «79 operaciones»: 79 es el número de RUTAS del
  YAML, no de operaciones, y 73 no coincide con nada. Sólo la mitad `43` es correcta.
  `docs/api/POLITICA-API-PUBLICA.md` llevaba la misma cifra equivocada y ya está arreglado
  en esta entrega, porque `docs/api/**` sí es territorio de este frente.
- **Cambio exacto:**
  1. En `docs/cad/third-party-extension-policy.md`, sección «1. API HTTP y SDK», sustituir
     el primer punto por:
     ```
     - **Contrato**: `packages/contracts/specs/design-api.v1.yaml`, OpenAPI 3.1. Cuántas
       operaciones tiene no se escribe aquí: lo cuenta
       `apps/web/src/app/docs/api/operations.generated.json`, generado del propio contrato.
       El contrato manda: el SDK de TypeScript se genera de él y el enrutador del servidor
       se verifica contra él en cada cambio (`scripts/cad/check-design-contract.mjs`).
     ```
  2. En el mismo documento, al final de la sección «3. Rutinas AutoLISP y DCL», añadir:
     ```
     La cobertura del lenguaje, función por función y en tres columnas —implementada, con
     límite declarado, y todavía no con su motivo—, se genera de la tabla viva del
     intérprete y vive en `docs/api/autolisp-cobertura.json`. La guía para portar rutinas
     es `docs/api/EXTENSIBILIDAD.md`.
     ```
  3. En el mismo documento, en la sección «4. Plugins JavaScript», añadir al final:
     ```
     Cómo se escribe uno, con sus permisos y su ciclo de vida: `docs/api/EXTENSIBILIDAD.md`.
     Por qué no habrá `.NET`, VBA ni ObjectARX, y cuál es el camino para cada familia:
     `docs/api/PUENTE-DOTNET-VBA.md`.
     ```
  4. En `docs/onboarding/GATES.md`, en la fila `check:cad-contract`, sustituir
     «(79 operaciones, byte a byte)» por «(byte a byte; el recuento lo publica
     `apps/web/src/app/docs/api/operations.generated.json`)».
  5. En `README.md`, en la línea de límites declarados que ya dice «hay intérprete AutoLISP
     con biblioteca de rutinas y plugins JS con manifiesto versionado (no hay .NET ni VBA)»,
     añadir al final de esa oración: «— la cobertura exacta del lenguaje, con sus límites y
     lo que todavía no está, se genera en `docs/api/autolisp-cobertura.json`, y el porqué
     del `.NET` en `docs/api/PUENTE-DOTNET-VBA.md`».
- **Cómo se comprueba:**
  1. `grep -rn "73 operaciones\|79 operaciones" docs/ README.md` no devuelve nada fuera de
     `docs/history/` (los informes archivados describen lo que pasó y no se reescriben).
  2. `cd apps/web && npx tsx src/lib/lisp/cobertura.spec.ts` sigue verde: la matriz y sus
     dos documentos no cambian con esta petición.
  3. `npm run check:cad` y `npm test`.
- **Estado:** pendiente

### P-ext-05 · Marcar `x-visibility` operación por operación en el contrato
- **Archivo:** `packages/contracts/specs/design-api.v1.yaml` (las 104 operaciones) y
  `scripts/cad/check-design-contract.mjs` (el gate que lo exige). El sitio donde se PINTA
  —`apps/web/src/app/docs/api/`— sí es territorio de F9 y lo hace F9 después, no el
  coordinador.
- **Por qué:** la entrega 4 de la cola («marcar visibilidad por operación en el contrato»,
  P1-5 del mapa de brechas) no se pudo construir por R1: el YAML no es de este frente.
  `docs/api/POLITICA-API-PUBLICA.md` ya declara los tres niveles y sus reglas de cambio,
  y ya declara la deuda: «mientras el contrato no lleve la marca por operación, la regla
  por defecto es TODO es `internal` salvo que la documentación pública lo nombre». Esa
  regla por defecto protege al producto pero no ayuda al integrador: no puede leer del
  contrato qué puede congelar. Y el sidecar dentro de `docs/api/` está prohibido por la
  regla 4 de la casa (la clasificación viviría en dos lugares); el único sitio correcto es
  la operación misma, junto a `x-required-permission` y `x-required-entitlement`, que ya
  viven ahí con esta misma forma.
- **Cambio exacto:**
  1. En cada una de las 104 operaciones de `design-api.v1.yaml`, añadir una línea
     `x-visibility: <nivel>` con la misma indentación que el `operationId` que ya tiene
     (seis espacios), inmediatamente DEBAJO de `operationId`. El vocabulario es el de la
     política, sin cuarto valor: `public | internal | experimental`.
  2. **La clasificación completa.** La regla que la produce, para que una operación nueva
     se pueda clasificar sin preguntar: `public` es lo que
     `docs/api/POLITICA-API-PUBLICA.md` ya nombra hoy como lista inicial —documentos CAD
     (CRUD + CAS + versiones), publicaciones y enlaces de revisión—; `experimental` es el
     resto de `/v1/cad` que un integrador llamaría y que funciona, pero cuya forma no está
     congelada; `internal` es todo lo demás, que es plomería web↔api. Identidad y comercial
     quedan `internal` porque la política lo dice con esas palabras, y que dos operaciones
     comerciales sean alcanzables sin sesión (`listPublicCommercialPlans`,
     `listSatTaxCatalogs`) no las convierte en contrato: alcanzable y prometido no son lo
     mismo.

     **`public` — 15 operaciones:**
     `listCadDocuments`, `createCadDocument`, `openCadDocument`, `updateCadDocumentMeta`,
     `archiveCadDocument`, `saveCadDocumentContent`, `saveCadDocumentArchive`,
     `listCadDocumentVersions`, `getCadDocumentVersion`, `listCadPublications`,
     `recordCadPublication`, `redeemReviewLinkContext`, `listReviewLinkComments`,
     `createReviewLinkComment`, `resolveReviewLinkComment`.

     **`experimental` — 25 operaciones:**
     proyectos (`listCadProjects`, `createCadProject`, `getCadProject`, `updateCadProject`,
     `archiveCadProject`); conjuntos de planos (`listCadSheetSets`, `createCadSheetSet`,
     `getCadSheetSet`, `saveCadSheetSet`, `deleteCadSheetSet`); bloques (`listCadBlocks`,
     `createCadBlock`, `getCadBlock`, `updateCadBlock`, `removeCadBlock`); DXF
     (`getCadDxfBackground`, `importCadDxfBackground`, `removeCadDxfBackground`,
     `exportCadDocumentDxf`); comentarios (`listCadComments`, `createCadComment`,
     `resolveCadComment`); sesiones de revisión (`listCadReviewSessions`,
     `createCadReviewSession`, `closeCadReviewSession`).

     **`internal` — 64 operaciones:** las 19 de `/v1/auth/*`, las 6 de
     `/v1/organizations/*`, las 18 de `/v1/commercial/*` (incluido
     `receiveStripeWebhook`, que es un buzón de entrada del proveedor, no una operación de
     nadie), las 3 de `/v1/legal/*`, `reportSupportIncident`, las 4 de `/v1/feedback/*`,
     las 4 de `/v1/calls/*`, las 6 de `/v1/messaging/*` y, dentro de `/v1/cad`,
     `discardProvisionalCadDocument`, `publishCadPresenceBeat` y `streamCadPresence`
     —las tres son ciclo de vida del estudio en el navegador: un documento provisional que
     se tira si el usuario se va sin dibujar, y los latidos de presencia—.

     15 + 25 + 64 = 104. El reparto es exhaustivo y sin solapes a propósito: si al
     aplicarlo la suma no da 104, es que el contrato cambió y hay que reclasificar lo
     nuevo, no repartir lo que sobra.
  3. En `scripts/cad/check-design-contract.mjs`, al lado de la comprobación de la biyección
     OpenAPI↔SDK↔Nest que ya hace, exigir la marca: recorrer las operaciones del YAML y
     fallar nombrando el `operationId` cuando falte `x-visibility` o cuando su valor no sea
     uno de los tres. El mensaje tiene que decir qué hacer, no sólo qué falta:
     ```
     `${operationId} no declara x-visibility. Los valores son public | internal |
      experimental y su significado está en docs/api/POLITICA-API-PUBLICA.md. Una
      operación sin marca es una promesa que nadie decidió hacer.`
     ```
     Es el mismo trato que ya reciben `x-required-permission` y `x-required-entitlement`:
     obligatorias, no opcionales, porque un campo de seguridad o de contrato que se puede
     omitir se omite.
  4. En `docs/api/POLITICA-API-PUBLICA.md`, sección «Deuda declarada (backlog)»: borrar los
     dos puntos, que dejan de ser deuda. **Este paso lo hace F9**, no el coordinador —el
     archivo es de su territorio—, en cuanto los pasos 1-3 estén aplicados; se anota aquí
     sólo para que no se quede una deuda declarada describiendo algo ya hecho.
- **Cómo se comprueba:**
  1. `npm run check:cad-contract` en verde con la comprobación nueva, y rojo si se le quita
     la marca a una operación cualquiera (comprobarlo mutando una, que es lo único que
     demuestra que el gate muerde).
  2. `node scripts/cad/build-api-console.mjs --check` sigue en verde: el generador no lee
     `x-visibility` todavía, así que el JSON de la consola no cambia con esta petición.
     Pintarlo es la entrega siguiente de F9 y lleva su propia spec de contrato.
  3. `npm run typecheck` y `npm test` (el SDK se regenera del mismo YAML: hay que verificar
     la igualdad byte a byte que el gate ya exige, porque una extensión `x-` no debe
     cambiar ni un carácter del tipado generado — si lo cambia, es que se coló en el sitio
     equivocado del documento).
- **Estado:** pendiente

### P-ext-06 · Tokens de API por organización (una máquina no puede autenticarse hoy)
- **Archivo:** `apps/api/src/modules/identity/entities/`, `apps/api/src/migrations/`,
  `apps/api/src/modules/auth/guards/cad-auth.guard.ts`,
  `apps/api/src/modules/organizations/`, `packages/contracts/specs/design-api.v1.yaml`.
  Todo fuera del territorio de F9, y las migraciones expresamente prohibidas por R2.
- **Por qué:** la entrega 3 de la cola («tokens de API por organización») es la que
  convierte la API en algo que un tercero puede usar de verdad.
  `docs/competitive/distancia-autocad-completo-20260901.md` lo mide sin ambigüedad: «89 de
  104 operaciones exigen `sessionCookie`; cero API keys o tokens de servicio; un script en
  un servidor no puede autenticarse». Mientras eso siga así, el SDK generado sólo sirve
  dentro de un navegador con sesión de una persona, y toda la superficie que P-ext-05
  clasifica como `public` es inalcanzable para lo único que consume una API pública: una
  máquina. Es la mitad que le falta a la fila de automatización.
- **Cambio exacto:**
  1. **Entidad** `apps/api/src/modules/identity/entities/api-token.entity.ts`, tabla
     `api_tokens`, tenant-owned como las demás (`organization_id` NOT NULL, que es el
     tenant de este release):
     - `id` uuid PK; `organization_id` uuid NOT NULL; `name` varchar(120) NOT NULL (lo que
       el usuario ve en la lista: «CI de planos», «exportador nocturno»);
     - `token_prefix` char(8) NOT NULL — los ocho primeros caracteres del token en claro,
       para poder ENSEÑAR cuál es cuál en la lista sin guardar el secreto;
     - `token_hash` char(64) NOT NULL UNIQUE — `hashOpaqueToken` de
       `apps/api/src/modules/identity/identity-security.ts`, que ya es sha256 hex y ya es
       la implementación canónica. **No se inventa un hash nuevo y no se guarda el token.**
     - `scopes` text[] NOT NULL — subconjunto de los permisos que el servidor ya deriva
       (`permissions.guard.ts`), nunca un vocabulario paralelo;
     - `created_by` uuid NOT NULL (la identidad que lo creó), `created_at`, `last_used_at`
       nullable, `expires_at` NOT NULL, `revoked_at` nullable.
     - Índice `(organization_id, revoked_at)` para la lista, y el UNIQUE de `token_hash`
       para la búsqueda de autenticación, que es por hash y nunca por prefijo.
  2. **Dos migraciones, separadas por el mismo motivo que
     `20260831090000-TeamMessaging` y `20260831093000-CadPresenceBeatsRls`:** una que crea
     la tabla y otra que activa RLS. La de RLS repite exactamente la política de las otras
     tablas tenant —`ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` sobre
     `current_setting('app.tenant_id', true)`, sin `FORCE`— y **tiene que otorgar a
     `valle_app`** los mismos privilegios mínimos que ya tiene sobre las demás tablas
     tenant; sin ese GRANT, `api_tokens` sería la única tabla donde el rol runtime choca
     con «permission denied» en vez de quedar vacío por RLS, que es un fallo de PERMISO y
     no de AISLAMIENTO. `tenant-rls-coverage.pg.spec.ts` escanea justo eso y lo detecta.
  3. **Autenticación** en `CadAuthGuard`: antes de leer la cookie de sesión, si viene
     `Authorization: Bearer vd_<48 caracteres base64url>`, resolver por token en vez de por
     cookie. El token se genera con `randomBytes(36).toString('base64url')` y se PREFIJA
     con `vd_` para que sea reconocible en un secret scanner (y para que
     `.gitleaks.toml` pueda tener su regla). La resolución:
     `hashOpaqueToken(token)` → búsqueda por `token_hash` → si no existe, está revocado o
     está caducado, `UnauthorizedException` **con el mismo cuerpo y el mismo tiempo que un
     token válido de otra organización**, para no convertir el error en un oráculo de
     existencia. De ahí salen `organizationId` (el tenant), `scopes` y una identidad de
     servicio; el `AuthenticatedUser` que se construye lleva marca de que es máquina.
  4. **Lo que un token NO puede hacer, y esto es la mitad del diseño:**
     - No pasa por `/v1/auth/*` ni por `/v1/organizations/*`: un token no crea
       organizaciones, no invita, no cambia contraseñas y no lee la actividad de nadie.
       El guard lo rechaza por prefijo de ruta, no por permiso, porque un fallo de
       configuración de scopes no debe poder abrir identidad.
     - No pasa por `/v1/commercial/*`: una máquina no compra ni cancela una suscripción.
     - **No exime del `entitlement`**: `design.cad` se sigue comprobando contra la
       organización dueña del token, igual que para una persona. Un token de una
       organización con la prueba vencida no dibuja.
     - CSRF no aplica (no hay cookie), y por eso mismo el guard debe RECHAZAR una petición
       que traiga cookie de sesión y `Authorization` a la vez, en vez de elegir una: dos
       credenciales en la misma petición es exactamente la confusión que produce un
       confused deputy.
  5. **Superficie de gestión**, cuatro operaciones nuevas en el contrato bajo
     `/v1/organizations/api-tokens`, todas `x-visibility: internal` (se administran desde
     el estudio, con sesión de persona, nunca con un token):
     `listOrganizationApiTokens` (GET; devuelve `id`, `name`, `token_prefix`, `scopes`,
     `created_at`, `last_used_at`, `expires_at` — **jamás el token**),
     `createOrganizationApiToken` (POST; **única respuesta de la vida del token que lo
     incluye en claro**, con `expires_at` obligatorio y un tope de 365 días),
     `revokeOrganizationApiToken` (DELETE `{tokenId}`), y
     `rotateOrganizationApiToken` (POST `{tokenId}/rotate`; emite el nuevo y marca el
     viejo con `revoked_at` a 24 h vista, para que una rotación no tire la integración a
     mitad de una noche). Las cuatro exigen rol `owner` o `admin`.
  6. **Límite de tasa**: los tokens usan el mismo `api-rate-limit.service.ts` que ya
     existe, con la clave por `token_hash` y no por IP: una integración detrás de un NAT
     no debe poder gastarse el cupo de otra.
- **Cómo se comprueba:**
  1. `apps/api/src/modules/identity/api-token.pg.spec.ts` nueva, con
     `REQUIRE_POSTGRES_TESTS=true`: un token de la organización A no ve ni un documento de
     la B (aislamiento por RLS, no sólo por scoping de aplicación); un token caducado y uno
     revocado fallan igual que uno inexistente; el token en claro aparece exactamente una
     vez en toda la vida de la API (la respuesta de creación) y nunca en la de listado.
  2. `apps/api/src/migrations/tenant-rls-coverage.pg.spec.ts` sigue verde: `api_tokens`
     entra en su escaneo como una tabla tenant más, con su GRANT a `valle_app`.
  3. Una prueba de que el guard rechaza cookie + `Authorization` juntos, y otra de que un
     token contra `/v1/auth/session` devuelve 401 por prefijo de ruta aunque sus scopes
     dijeran que sí.
  4. `npm run check:cad-contract` (las cuatro operaciones nuevas con su
     `x-required-permission`, su `x-required-entitlement` y su `x-visibility` de P-ext-05)
     y `npm test --workspace=@valle/design-sdk` con el SDK regenerado.
  5. `npm run check:legal` y `npm run check:authz`, que auditan handlers y exenciones: las
     cuatro operaciones nuevas no pueden entrar como exención imperativa.
- **Estado:** pendiente
