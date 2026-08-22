# Política de la API pública

La API HTTP `/v1` (79 operaciones OpenAPI, SDK generado) existe y funciona.
Lo que NO existía era la declaración de cuáles operaciones son un CONTRATO con
terceros y cuáles son plomería interna del producto. Esta política lo declara,
ANTES de que la primera integración de un cliente congele por accidente una
API que nunca se decidió publicar.

## Los tres niveles

| Nivel | Significado | Se puede romper |
| --- | --- | --- |
| `public` | Contrato con terceros. Versionada, documentada, con SDK. | Sólo con versión nueva (`/v2`) o tras el aviso de abajo. |
| `internal` | La usa el producto (web ↔ api). Terceros NO deben depender de ella. | En cualquier release, sin aviso. |
| `experimental` | Pública a prueba, marcada así en la doc. | Con aviso corto (30 días) mientras dure la marca. |

Mientras el contrato OpenAPI no lleve la marca por operación (deuda declarada
abajo), la regla por defecto es: **TODO es `internal` salvo que la
documentación pública lo nombre**. Nadie puede reclamar estabilidad de una
operación que la doc del producto no anuncia.

## Reglas de cambio para `public`

1. **Aditivo, sin aviso**: campos de respuesta nuevos y opcionales,
   operaciones nuevas, valores nuevos en enums MARCADOS como abiertos.
2. **Con aviso de 90 días y encabezado de deprecación**: retirar u
   obligar campos, cambiar semántica, endurecer validaciones que rechacen lo
   que antes entraba.
3. **Sólo con `/v2`**: cambios de forma incompatibles. `/v1` sigue viva al
   menos 12 meses tras el nacimiento de `/v2`.
4. Los errores son parte del contrato: código estable + `code` legible por
   máquina (patrón ya vigente, p. ej. `entitlement_required`,
   `cad_publications_server_managed`).

## El manifiesto de plugins LISP/JS es un formato con versión

La otra superficie de extensión no es HTTP: son las rutinas `.lsp` y los
plugins JS del estudio. Su contrato ya existe en código
(`apps/web/src/lib/lisp/plugins/api.ts`) y ESTA política lo declara formato
estable v1:

- Un plugin es `{ id, name, version, commands?, panels? }`; `id` en
  minúsculas-con-guiones, comandos `MAYÚSCULAS[A-Z0-9-]`.
- Tres garantías del anfitrión, congeladas: (1) los comandos de plugin son
  `CadCommandDescriptor` corrientes — máquina de estados pura, mismo registro
  compuesto; (2) un plugin NUNCA pisa un nombre del producto (rechazo al
  alta, todo-o-nada); (3) la escritura sale sólo por
  `apply(CadEntityCommand[])` — no hay acceso al documento mutable.
- Cambios a este formato siguen las mismas reglas de arriba (aditivo libre;
  romper exige versión de manifiesto nueva con lectura de la vieja).

## Deuda declarada (backlog)

- Marcar operación por operación en `design-api.v1.yaml` con
  `x-visibility: public|internal|experimental` y hacer que el gate del
  contrato exija la marca en operaciones nuevas.
- Publicar la lista `public` inicial (propuesta: documentos CAD CRUD + CAS +
  publicación + review links; identidad y comercial quedan `internal`).
