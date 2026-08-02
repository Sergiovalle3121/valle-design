# `legacy/` — identificadores persistidos que todavía no se pueden renombrar

Este módulo agrupa los literales que **no son nombres de código**. Cada uno de
ellos ya existe fuera de este repositorio: en filas de la base de datos de
tenants reales, dentro de archivos DXF guardados en discos de clientes, o
dentro de credenciales que Platform ya firmó y distribuyó.

La regla es una sola:

> Renombrar un identificador de este módulo **no es un refactor**: es una
> migración de datos o un cambio de formato de archivo. El renombre del
> *paquete* (`@axos/contracts` → `@valle-design/contracts`) es libre y ya se
> hizo; el renombre de *estos valores* no lo es.

Están aquí, y no dispersos por el código, para que la próxima limpieza los
encuentre agrupados, documentados y con su condición de retiro escrita —
en lugar de encontrarlos como cadenas sueltas con aspecto de nomenclatura
heredada y borrarlas de buena fe.

---

## 1. `cad-studio-identifiers.ts` — centinelas del CAD Studio universal

| Constante | Valor | Dónde vive el valor |
| --- | --- | --- |
| `LEGACY_CAD_STUDIO_MODEL` | `AXOS-CAD-STUDIO` | columna `cad_documents.model` (antes `sf_line_layouts.model`) |
| `LEGACY_CAD_STUDIO_REVISION` | `UNIVERSAL` | columna `cad_documents.revision` |

**Qué es.** El estudio en modo universal (`/studio`) no cuelga de un modelo de
ingeniería; sus dibujos se persisten bajo este par centinela. Todo documento
creado desde el CAD Studio desde el día uno está guardado así.

**Por qué no puede cambiarse.** Es un valor de datos, no un nombre. Cambiarlo
hace que los documentos existentes dejen de encontrarse: el estudio abriría un
lienzo vacío y el usuario concluiría, con razón, que perdió su trabajo. No hay
error visible que avise; simplemente no hay filas que coincidan.

**Qué haría falta para retirarlo.**

1. Migración de datos hacia el identificador nuevo, con **lectura
   bidireccional** durante la ventana de despliegue (el backend nuevo debe
   entender el valor viejo y el viejo el nuevo, porque durante el despliegue
   conviven las dos versiones).
2. Backfill verificado por conteo (`COUNT(*)` por valor antes y después) y
   plan de reversión probado, no solo escrito.
3. Retirar la lectura del valor viejo únicamente cuando el conteo de filas con
   el valor viejo sea cero en **todos** los entornos.

**Estado / condición de retiro.** Bloqueado indefinidamente. No hay fecha: la
condición es la de arriba (migración ejecutada + conteo cero), no el paso del
tiempo.

**Red de seguridad.** `apps/web/src/lib/cad/persisted-identifiers.spec.ts`.

---

## 2. `dxf-xdata-apps.ts` — nombres de aplicación XDATA del DXF

| Constante | Valor | Qué marca |
| --- | --- | --- |
| `LEGACY_DXF_XDATA_APP_DIMENSION` | `AXOS_DIM` | cotas semánticas (`DIMENSION`) |
| `LEGACY_DXF_XDATA_APP_MLEADER` | `AXOS_MLEADER` | directrices múltiples (`MLEADER`) |
| `LEGACY_DXF_XDATA_APP_BLOCK` | `AXOS_BLOCK` | bloques y atributos (`BLOCK`/`INSERT`) |

**Qué es.** DXF no modela la semántica que el editor necesita conservar
(qué tipo de cota es, con qué unidades y precisión se formatea, qué atributos
lleva un bloque). Valle Design la guarda como XDATA registrada bajo estos
nombres de aplicación: se declaran en la tabla `APPID` y se marcan con el
código de grupo `1001` en cada entidad.

**Por qué no puede cambiarse.** Forman parte del **formato del archivo**, no
del código. Un archivo `.dxf` exportado el mes pasado y guardado en el disco de
un cliente contiene estas cadenas. Y el modo de fallo es especialmente
traicionero: si alguien renombra la constante en exportador **e** importador a
la vez, todos los tests de ida y vuelta siguen en verde — porque generan el
archivo con el nombre nuevo y lo leen con el nombre nuevo — mientras el
producto pierde en silencio la capacidad de leer todo lo exportado hasta hoy.
La cota se degrada a geometría anónima y los atributos de bloque desaparecen.

**Qué haría falta para retirarlo.**

1. Importador **bidireccional**: leer el nombre nuevo y el viejo, con
   preferencia por el nuevo, durante al menos un ciclo de versiones largo.
2. **Bump de la versión de formato** del documento (`meta.schema` en
   `CAD_DOCUMENT_LIMITS`) para que el archivo declare qué convención usa, y
   migración de los documentos canónicos ya persistidos.
3. Mantener el golden congelado del nombre viejo mientras el lector viejo
   exista. Solo cuando se decida romper compatibilidad con archivos antiguos
   —decisión de producto, no de refactor— se retira el nombre y el golden.

**Estado / condición de retiro.** Bloqueado. Requiere las tres condiciones de
arriba; ninguna está en curso.

**Red de seguridad.** `apps/web/src/lib/cad/dxf-xdata-golden.spec.ts` congela
un DXF real con los tres nombres y exige que el importador lo siga leyendo sin
regenerarlo.

---

## 3. `rbac-transition.ts` — mapa `engineering:* → cad:*`

| Permiso legado | Concede |
| --- | --- |
| `engineering:read` | `cad:view` |
| `engineering:write` | `cad:edit`, `cad:review`, `cad:publish` |

**Qué es.** Design tiene su propio espacio de permisos (`cad:*`) para no
arrastrar el RBAC del producto industrial. Los tokens que Platform emitió
—y los que sigue emitiendo durante la transición— traen los permisos legados
`engineering:*`. Este mapa es lo que hace que un token ya emitido siga
abriendo lo que abría.

**Por qué no puede cambiarse.** El valor vive dentro de credenciales ya
firmadas, fuera del alcance de este repositorio: no se puede reescribir un JWT
que ya está en el navegador de alguien. Recortar el mapa quita accesos en
silencio a tenants reales; ampliarlo concede accesos que nadie contrató.
Nótese que ningún permiso legado concede `cad:admin`: la expansión solo agrega
lo declarado.

**Qué haría falta para retirarlo.**

1. Que Platform emita **exclusivamente** permisos `cad:*` en todos los
   entornos, y que se haya cumplido la vida máxima de los tokens ya emitidos
   con permisos `engineering:*` (nadie con un token viejo vigente).
2. Métrica de uso: contar en la bitácora cuántas autorizaciones se resolvieron
   por la vía legada. Retirar cuando sea cero durante una ventana completa de
   expiración de tokens.

**Estado / condición de retiro.** Bloqueado hasta que la métrica de uso legado
sea cero durante una ventana completa de expiración de tokens.

**Red de seguridad.**
`apps/api/src/modules/auth/cad-permission-map.spec.ts`.

---

## Cómo se retira algo de aquí

1. Cumplir la condición de retiro específica del alias (arriba).
2. Escribir la migración/lector bidireccional **antes** de tocar el valor.
3. Ejecutarla y verificar por conteo, no por inspección.
4. Solo entonces borrar la constante, su re-exportación `@deprecated` y su
   red de seguridad — en ese orden y en un cambio propio, nunca de paso.

Mientras alguna de esas condiciones no se cumpla, el valor se queda. Que un
identificador parezca heredado de otra marca no es razón suficiente para
cambiarlo: eso es exactamente lo que estas notas existen para impedir.
