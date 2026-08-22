# ADR-0010: Identificadores persistidos congelados del producto de origen

- Estado: aceptado
- Fecha: 2026-08-22

## Contexto

Valle Design nació dentro de un ERP industrial —primero _Axos OS_, después _Valle
Enterprise_— que incluía un planificador de plantas de manufactura. El editor de
dibujo de ese planificador creció hasta volverse un CAD de propósito general y en
2026 se separó a este repositorio como producto standalone. La campaña de
identidad del 2026-08-22 (`docs/execution/INFORME_CAMPANA_IDENTIDAD_20260822.md`)
retiró la última funcionalidad industrial del código de producto.

Lo que no se puede retirar borrando código son los identificadores que **ya se
escribieron en datos que no controlamos**: filas de la base de datos de clientes,
cookies y `localStorage` de sus navegadores, y —el caso más delicado— bytes
dentro de archivos DXF que los usuarios exportaron y ya intercambiaron con
terceros.

Cada campaña de limpieza vuelve a tropezar con la misma tentación: son cadenas
feas, con el nombre de un producto muerto, y borrarlas parece higiene. No lo es.

## Decisión

Los siguientes identificadores quedan **congelados**. Su valor no se renombra;
su superficie de creación sí se retira.

| Identificador                               | Dónde vive el dato                                            | Definido en                                               |
| ------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| `AXOS-CAD-STUDIO` / `UNIVERSAL`             | columnas `model` / `revision` de todo documento CAD existente | `packages/contracts/src/legacy/cad-studio-identifiers.ts` |
| `AXOS_DIM`, `AXOS_MLEADER`, `AXOS_BLOCK`    | tabla `APPID` y XDATA **dentro de los DXF ya exportados**     | `packages/contracts/src/legacy/dxf-xdata-apps.ts`         |
| `axos_theme`                                | `localStorage` del navegador de cada usuario                  | `ThemeContext.tsx`, `app/layout.tsx`                      |
| `axos_locale`                               | cookie de idioma                                              | `i18n/config.ts`                                          |
| claves de sesión de comandos y de workspace | `localStorage` por usuario                                    | `lib/cad/command-session.ts`, `lib/cad/cad-workspace.ts`  |
| tipo de entidad `"station"`                 | documentos CAD guardados                                      | `lib/cad/cad-document.ts`                                 |
| tipo de zona `"forklift_path"`              | documentos CAD guardados                                      | `lib/cad/safety-zones.ts`                                 |
| id de capa `flow`                           | objetos colocados en esa capa dentro de documentos            | `lib/cad/layers.ts`                                       |

Se distinguen dos regímenes:

**Congelado y en uso** — los valores de datos (`AXOS-CAD-STUDIO`, `axos_theme`,
las claves de `localStorage`). Se leen y se escriben tal cual. Son valores
opacos: el producto no los interpreta, sólo los transporta.

**Congelado y oculto** — los tipos del esquema (`station`, `forklift_path`). Se
**leen** para que un documento viejo siga abriendo, pero **ninguna superficie del
producto crea uno nuevo**: no hay comando, paleta, plantilla ni símbolo que los
genere, y la interfaz los nombra en vocabulario de dibujo («punto», «pasillo de
circulación»). Su declaración lleva un comentario que dice esto y apunta a
`IDENTITY.md`.

**Escritura ya retirada, lectura viva** — los nombres XDATA del DXF. El
exportador emite `VALLE_*` desde hace tiempo; el importador sigue aceptando los
`AXOS_*` porque los archivos que los llevan están en discos que no son nuestros.

### Regla general

> Si una cadena se escribe en disco, en una cookie, en `localStorage` o dentro de
> un archivo que el usuario descarga, no se renombra por estética. Se migra —con
> versión de esquema y plan— o se deja quieta.

## Cómo se sostiene

- `apps/web/src/lib/cad/persisted-identifiers.spec.ts` afirma activamente que los
  valores siguen exactamente como están: quien los «limpie» se pone rojo.
- `apps/web/src/lib/cad/dxf-xdata-golden.spec.ts` congela un archivo DXF **real**
  con los nombres históricos y exige que el importador lo siga leyendo. Un
  round-trip generado no detectaría la regresión, porque sólo produce archivos
  nuevos.
- `apps/web/e2e/golden/35-cad-legacy-mutation-boundary.spec.ts` recorre en
  navegador el comportamiento del tipo `station` congelado.
- `scripts/cad/check-no-industrial-domain.mjs` exceptúa explícitamente
  `packages/contracts/src/legacy/` y `lib/cad/safety-zones.ts`, con el motivo
  escrito en el propio gate.

## Plan de migración, para el día que se decida

Ninguno de estos retiros es un renombre; todos son migraciones de datos. La
condición de retiro por familia:

1. **Centinelas `model`/`revision`.** Escribir el lector bidireccional, hacer el
   backfill verificado con conteos por valor, comprobar cero filas viejas en
   **todos** los entornos, y sólo entonces retirar el alias. Rollback: el lector
   bidireccional se queda hasta que el conteo confirmado sea cero.
2. **XDATA de DXF.** No depende de nosotros: depende de que los archivos de los
   clientes estén migrados de forma verificable, cosa que el producto no
   controla. Retirar la LECTURA deja ilegible material que ya salió del producto.
   La condición honesta es «nunca, salvo decisión explícita del dueño con aviso a
   clientes».
3. **Claves de navegador.** Migración perezosa: leer la clave vieja una vez,
   escribir la nueva, borrar la vieja. Ver `apps/web/src/lib/storage-rename.ts`.
4. **Tipos del esquema (`station`, `forklift_path`, capa `flow`).** Exige subir
   la versión del esquema del documento, escribir la migración hacia el tipo
   sustituto (`station` → objeto genérico; `forklift_path` → `aisle`), migrar
   todos los documentos guardados con verificación por conteo, y mantener el
   lector del tipo viejo hasta confirmar cero. Mientras tanto, el régimen
   «congelado y oculto» ya da el 90 % del beneficio —ningún usuario nuevo crea
   uno— con cero riesgo para los datos.

## Consecuencias

- El repositorio conserva cadenas con el nombre de un producto muerto, y eso se
  ve raro al leerlo por primera vez. `IDENTITY.md` explica por qué en los
  primeros treinta segundos, que es exactamente el problema que resuelve.
- Cualquier campaña futura de limpieza —humana o de IA— encuentra la lista, el
  motivo y la condición de retiro antes de tocar nada.
- El coste de mantener los alias es una capa `legacy/` pequeña y bien probada.
  El coste de quitarlos sin plan sería romper documentos y archivos de clientes.
