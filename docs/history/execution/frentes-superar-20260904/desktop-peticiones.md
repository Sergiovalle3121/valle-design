# Peticiones de F10 · Escritorio, sin internet e inglés

Lo que este frente necesita **fuera de su territorio** (R1) o en un **archivo compartido**
(R2). El coordinador las aplica en la ventana de integración; el frente **no** las toca.

Formato de cada petición:

```
### P-desktop-NN · <título>
- **Archivo:** <ruta exacta>
- **Por qué:** <qué entrega de la cola lo necesita>
- **Cambio exacto:** <diseño completo — el coordinador no adivina>
- **Cómo se comprueba:** <la spec o el gate que lo demuestra>
- **Estado:** pendiente | aplicada | rechazada (<motivo>)
```

## Peticiones

### P-desktop-01 · Montar el registro del service worker en el layout raíz

- **Archivo:** `apps/web/src/app/layout.tsx`
- **Por qué:** la entrega 1 de la cola («PWA instalable con service worker que sirve el
  estudio sin red»). El worker ya existe, se sirve en `/sw` con las cabeceras que el
  navegador exige y su política está probada sobre los bytes servidos
  (`apps/web/src/app/(sw)/service-worker-harness.spec.ts`, 12 bloques verdes). Desde la
  entrega 3 (2026-09-04) también existe el componente que lo registra y su ciclo de
  actualización, con la máquina de estados probada
  (`apps/web/src/app/(sw)/update-lifecycle.spec.ts`, 13 bloques). Lo que falta es la
  llamada: hoy **ningún** navegador lo instala, porque nadie monta el componente. El
  layout raíz es el único punto que atraviesan por igual el estudio, el tablero y las
  páginas públicas, y está fuera del territorio de este frente (R1).
- **Cambio exacto:** dos líneas, y **ninguna otra**. En el bloque de imports, junto a los
  demás `@/components/...`:

  ```tsx
  import { ServiceWorkerRegistrar } from "./(sw)/ServiceWorkerRegistrar";
  ```

  y **dentro de `<I18nProvider>`, como hermano posterior de `<ThemeProvider>`**:

  ```tsx
        <I18nProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <DesignAuthProvider>
              <ToastProvider>{children}</ToastProvider>
            </DesignAuthProvider>
          </ThemeProvider>
          <ServiceWorkerRegistrar />
        </I18nProvider>
  ```

  **Dónde va, y por qué ahí y no fuera de todo** (esto CORRIGE la versión anterior de esta
  petición, que lo colgaba de `<body>` como hermano del proveedor): el componente pinta un
  aviso de «hay una versión nueva» con un botón para recargar, y este frente no escribe
  copy suelta en un `.tsx` — el texto sale del namespace `appUpdate` por claves, así que
  necesita el contexto de next-intl. `I18nProvider` es el proveedor MÁS EXTERNO y el único
  del que depende: no consume tema, ni sesión, ni toasts, y por eso va dentro de ése y
  fuera de los otros tres. El registro en sí no depende de nada —vive en un `useEffect` y
  el aviso está en un subcomponente aparte—, de modo que el worker se registra igual
  aunque el aviso no llegue a pintarse nunca.

  El componente ya existe y no hay que escribir nada más:
  `apps/web/src/app/(sw)/ServiceWorkerRegistrar.tsx` (nótese el nombre: la versión anterior
  de esta petición lo llamaba `RegistroServiceWorker`, que nunca llegó a existir; los
  componentes de este árbol se nombran en inglés — `I18nProvider`, `LanguageSwitcher`,
  `CadWorkspaceDock`). Su contrato: es `"use client"`; devuelve `null` mientras no haya
  versión nueva; registra `/sw` con `scope: "/"` dentro de un `useEffect` enganchado al
  evento `load` —para no competir por ancho de banda con el primer render del estudio—; se
  abstiene si `!("serviceWorker" in navigator)`; y **desregistra** lo que hubiera si
  `NODE_ENV !== "production"` y no está la bandera `NEXT_PUBLIC_SW_EN_DESARROLLO`, para que
  un worker instalado en desarrollo no se quede sirviendo un cascarón viejo en `localhost`
  durante meses.
- **Cómo se comprueba:** `service-worker-harness.spec.ts` y `update-lifecycle.spec.ts`
  siguen verdes (no los toca), y un spec del frente lee `layout.tsx` y exige que el
  componente esté importado y montado dentro de `<I18nProvider>` — la mitad que ningún test
  de unidad puede cubrir, porque un componente perfecto que nadie monta pasa todas sus
  pruebas. Ese spec se escribe **cuando esta petición esté aplicada**: hoy fallaría por
  diseño, y un spec rojo a propósito en la rama es exactamente lo que la casa prohíbe.
- **Estado:** pendiente (ya no bloqueada: el componente existe desde 2026-09-04)

### P-desktop-02 · Documentar la bandera `NEXT_PUBLIC_SW_EN_DESARROLLO`

- **Archivo:** `.env.example` (raíz del repositorio)
- **Por qué:** `ServiceWorkerRegistrar` **desregistra** el service worker cuando
  `NODE_ENV !== "production"` y la bandera no está. Es lo correcto por defecto —un worker
  instalado una tarde en `localhost` sobrevive a todos los `next dev` siguientes y sirve el
  cascarón de aquella tarde, sin error visible, sólo con cambios que «no se aplican»—, pero
  deja sin salida a quien QUIERA probar el worker antes de desplegar. La salida existe y
  está probada (`debeRegistrar` en `apps/web/src/app/(sw)/update-lifecycle.ts`, bloque 11
  de `update-lifecycle.spec.ts`); lo que falta es que alguien pueda enterarse de que
  existe. Una bandera que sólo conoce quien leyó el código no es una bandera.
- **Cambio exacto:** añadir estas cuatro líneas al final del bloque de banderas
  `NEXT_PUBLIC_*`, justo ANTES del comentario `# Enlaces públicos opcionales;`:

  ```
  # Service worker en desarrollo. Por defecto sólo se registra en producción, y en
  # desarrollo se DESREGISTRA lo que hubiera: un worker instalado en localhost sirve
  # el cascarón del día que se instaló hasta que alguien se acuerda de borrarlo a mano.
  # Con esto a 1 se registra también en `next build && next start` local, para probarlo.
  # NEXT_PUBLIC_SW_EN_DESARROLLO=0
  ```

  Comentada, como el resto de las opcionales del archivo: el valor por defecto (ausente) es
  el correcto para todo el mundo salvo quien esté depurando el worker.
- **Cómo se comprueba:** `npm run check:doctor` (que parsea `.env.example`) sigue verde, y
  el bloque 11 de `update-lifecycle.spec.ts` ya cubre la semántica de los valores
  aceptados (`1` y `true` encienden; `0`, vacío y ausente no).
- **Estado:** pendiente

### P-desktop-03 · Ofrecer el borrador local cuando el documento no se puede pedir al servidor

- **Archivo:** `apps/web/src/components/cad/editor/Layout3DEditor.tsx` (rama `catch` del
  efecto de carga, hoy en la línea 2880) y un módulo nuevo bajo
  `apps/web/src/components/cad/document-lifecycle/`. Ambos fuera del territorio de este
  frente (R1).
- **Por qué:** es el veredicto más incómodo de la matriz de la entrega 4
  (`apps/web/src/app/(sw)/offline-capability-matrix.ts`, fila `abrir-el-dibujo`), y el
  único de los 34 que describe un defecto y no una imposibilidad. Hoy el journal de
  recuperación **tiene el trabajo** en IndexedDB y aun así abrir sin red no ofrece nada:
  el efecto que propone el borrador arranca con `if (!open || !data || !recoveryScope ||
  dirty) return`, o sea que sólo corre DESPUÉS de que `GET /v1/cad/documents/:id` haya
  devuelto el documento. Sin red ese GET falla, se entra por el `catch` que pone
  `setConnectionState("offline")` y `setError("No se pudo cargar el layout.")`, y el
  borrador que está a dos milímetros del usuario no se llega a mirar. La consecuencia
  exacta: alguien que perdió el wifi, cerró la pestaña y la vuelve a abrir ve un error,
  no su trabajo — que sigue ahí.
- **Cambio exacto:** tres piezas, y la tercera es una restricción dura.

  1. **Una cuarta clasificación en `apps/web/src/lib/cad/cad-recovery-journal.ts`.**
     `classifyCadRecoveryCandidate(record, { serverVersion, savedGeneration })` devuelve
     hoy `'confirmed' | 'current' | 'divergent'`, y las tres se deciden COMPARANDO contra
     el servidor. Sin servidor no hay contra qué comparar, y pasarle `serverVersion: 0`
     haría que casi todo candidato saliera `divergent` —una mentira con forma de aviso—.
     Hace falta admitir la ausencia:

     ```ts
     // valor de retorno:
     'confirmed' | 'current' | 'divergent' | 'sin-servidor'
     ```

     `CadRecoveryServerState.serverVersion` pasa a `number | null`; con `null` la función
     devuelve `'sin-servidor'` sin mirar `savedGeneration` (ese contador arranca en 0 al
     abrir y sólo tiene sentido dentro de una sesión que abrió con red). Los llamantes
     actuales —el monolito y `cad-recovery-lane-clear.spec.ts`— pasan un número y no
     cambian.

  2. **Un módulo puro nuevo** —p. ej. `document-lifecycle/offline-open.ts`— que decida qué
     hacer con el fallo de carga, sin tocar el DOM:

     ```ts
     export interface AperturaSinRed {
       /** El borrador que se ofrece, o null si no hay ninguno utilizable. */
       candidato: CadRecoveryRecord | null;
       /** Versión CAS base del checkpoint. Es la que viaja en el primer guardado. */
       versionBase: number;
       /** Qué se le dice a la persona. Nunca se abre un borrador en silencio. */
       aviso: "sin-borrador" | "borrador-sin-servidor";
     }
     export function planearAperturaSinRed(
       candidato: CadRecoveryRecord | null,
       ahoraMs: number,
     ): AperturaSinRed;
     ```

     Con su spec al lado, en el estilo de la casa (node assert + `console.log` final).

  3. **La restricción dura: el monolito sólo puede ENCOGER.**
     `scripts/cad/monolith-budget.json` fija `Layout3DEditor.tsx` en 18 454 líneas y el
     gate falla si crece una sola. Así que esto NO se puede hacer añadiendo un bloque al
     `catch`: hay que **extraer** el manejo de la carga fallida al módulo nuevo y dejar en
     el monolito una llamada más corta que lo que se llevó. Si la extracción baja 200
     líneas o más, además hay que correr
     `node scripts/cad/check-monolith-budget.mjs --update` para que el techo diga la
     verdad.

  **Tres invariantes que no se pueden romper al aplicarlo**, y son la razón de que esto
  sea una petición con diseño y no un «arreglo obvio»:

  - **Nunca en silencio.** El dibujo abierto desde un borrador local se marca sucio desde
    el primer instante y la pantalla tiene que decir que el servidor no se consultó. Un
    plano que parece cargado y no lo está es peor que un error honesto.
  - **El primer guardado va por el CAS de siempre**, con la `expectedCadDocumentVersion`
    del checkpoint. Si el servidor avanzó mientras tanto, eso es un 409 y lo atiende el
    registro de conflictos que ya existe. Jamás se resuelve inventando una versión.
  - **Sólo lectura sigue siendo sólo lectura.** Si el documento se abrió en modo revisión
    (`drawingReadOnly`), no se ofrece nada: el borrador de un invitado no existe.
- **Cómo se comprueba:** el spec del módulo nuevo (los tres casos: sin candidato,
  candidato vigente, candidato caducado por `MAX_RECOVERY_AGE_MS`), el spec existente
  `apps/web/src/lib/cad/cad-recovery-journal.spec.ts` para la clasificación nueva, y
  `node scripts/cad/check-monolith-budget.mjs` en verde (que es lo que demuestra que la
  extracción se hizo de verdad). El día que esto exista, la fila `abrir-el-dibujo` de
  `offline-capability-matrix.ts` pasa de `requiere-backend` a `degrada-y-reintenta` con su
  `reintento` apuntando al módulo nuevo, y el spec de la matriz lo exige.
- **Estado:** pendiente
