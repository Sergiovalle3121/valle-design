# ADR-0011: La migración aditiva del documento canónico es invariante del producto

- Estado: aceptado
- Fecha: 2026-08-22 (campaña de cimientos; eleva a invariante la doctrina ya
  practicada desde el esquema 4)

## Contexto

El documento canónico (`apps/web/src/lib/cad/cad-document.ts`) va por el
esquema 9. La práctica desde el principio: un documento viejo se abre entero,
`migrateCadDocument` lo normaliza y SÓLO cambia `meta.schema`; ningún campo se
pierde ni se reinterpreta. Esa doctrina estaba escrita en comentarios y
probada en `cad-document-migrate.spec.ts`, pero no declarada como compromiso
del producto — y es el activo de veinte años: es lo que permitirá abrir en
2036 un plano dibujado en 2026. Cada vertical futura (sólidos exactos, objetos
de arquitectura, instalaciones, GIS) entrará como TIPOS NUEVOS; sin esta
disciplina, cada una sería un evento de migración con riesgo de perder planos
de clientes.

## Decisión

1. **Subir de esquema es SIEMPRE aditivo.** Se permite: añadir secciones
   opcionales, añadir tipos de entidad nuevos, añadir campos opcionales a
   tipos existentes. Exige migración con spec propio: dar significado nuevo a
   un campo existente (se hace con campo nuevo + lectura de compatibilidad,
   nunca reinterpretando). PROHIBIDO sin excepción: eliminar o renombrar
   campos o tipos persistidos (la lista congelada es ADR-0010 e
   `IDENTITY.md`), y cualquier cambio que haga que un documento N−k pierda
   información al abrirse en N.
2. **Procedimiento exacto para subir de esquema:** (a) el tipo/campo nuevo se
   declara OPCIONAL en `CadDocument`; (b) `migrateCadDocument` aprende a
   normalizar los esquemas anteriores SIN inventar datos; (c)
   `cad-document-migrate.spec.ts` gana el caso «documento de esquema N−1..4 se
   abre en N con cero pérdida» ANTES del merge; (d) la serialización canónica
   de un documento que no usa la sección nueva queda BYTE-IDÉNTICA a la del
   esquema anterior (es lo que protege goldens y hashes); (e) si el cambio
   puede perder algo en ALGÚN camino (p. ej. exportar a un formato menor), esa
   pérdida entra al manifiesto de pérdidas del documento, nunca al silencio.
3. **Compatibilidad hacia atrás MEDIDA:** la rúbrica competitiva incluye una
   fila de compatibilidad que sólo puntúa con evidencia ejecutable de abrir
   documentos de cada esquema anterior con cero pérdida (el spec de migración
   es esa evidencia mientras cubra TODOS los esquemas).

## Consecuencias

- Un PR que toque `cad-document.ts` o `cad-document-migrate.ts` sin su caso de
  migración es un PR incompleto, no un detalle de estilo.
- Las verticales futuras son adiciones de tipos, no reescrituras: el costo de
  crecer queda acotado por diseño.
- El día que una ruptura sea inevitable (no se conoce ninguna), exigirá su
  propia ADR que sustituya a ésta, un migrador con manifiesto de pérdidas
  explícito y la firma del titular.
