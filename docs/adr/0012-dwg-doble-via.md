# ADR-0012: DWG a doble vía — licenciar para vender, códec propio para poseer

- **Nota 2026-08-24**: la vía «proveedor licenciado» de la Decisión §1
  queda SUSTITUIDA por [ADR-0014](0014-dwg-via-propia-unica.md) (numerada
  0014 y no 0013 para no chocar con la ADR de rol runtime `valle_app`,
  registrada el mismo día por otro frente de trabajo). El resto
  de esta ADR —el activo propio, el corpus, el criterio de cambio de
  §3— sigue vigente y es ahora la única vía.
- Estado: aceptado
- Fecha: 2026-08-22 (campaña de cimientos, por directiva del anexo de
  crecimiento del titular)
- Relacionadas: ADR-0004 (proveedor autorizado), ADR-0007 (laboratorio
  clean-room), ADR-0009 (paquete de promoción del códec, propuesta)

## Contexto

DWG condiciona cinco años. El códec propio (`packages/dwg-codec` + repositorio
de conformidad) ya lee los formatos 2000 y 2004 con cero discrepancias contra
su oráculo y escribe archivos que un lector externo acepta: es un activo real,
defendible y NUESTRO. Pero el camino completo —2010/2013/2018, escritura sin
pérdida, objetos proxy preservados, validación contra AutoCAD real— es de
años. Mientras tanto, los despachos reciben DWG a diario y el producto que no
los abre pierde la venta. Decidir por presupuesto («sólo lo propio») o por
orgullo cerraría una puerta; decidir por prisa («sólo licencia, para siempre»)
regalaría el margen y la propiedad.

## Decisión

La ruta es por SECUENCIA, no por bando, y las dos vías avanzan a la vez:

1. **Para VENDER (cuando haya clientes que lo exijan): proveedor licenciado**
   de lectura DWG, detrás del adaptador de interoperabilidad
   (`docs/interop/CONTRATO-INTEROP.md`), con el archivo ORIGINAL siempre
   preservado como adjunto intacto y manifiesto de pérdidas obligatorio. El
   proveedor es intercambiable por diseño: quien lo llama no sabe cuál es.
2. **Para POSEER: el códec propio sigue** en el laboratorio con su corpus y
   sus gates, versión a versión, sin fecha impuesta por marketing.
3. **Criterio de cambio, escrito y medible.** La licencia se apaga módulo a
   módulo (lectura primero) cuando el códec propio cumpla TODO esto sobre el
   corpus de conformidad VIGENTE en ese momento: (a) lee las versiones que la
   licencia cubría (mínimo 2000/2004/2010/2013/2018) con cero discrepancias
   contra al menos DOS oráculos externos independientes; (b) preserva objetos
   proxy sin pérdida byte a byte; (c) la matriz de fidelidad corre en CI
   contra material NO fabricado por el proyecto (donaciones de clientes,
   ADR del corpus); y (d) el titular firma la promoción (ADR-0009).
4. **Ninguna venta se ata a la vía.** Precios, contratos y material público
   hablan de «abrir DWG», nunca del proveedor. Cambiar de vía debe ser
   invisible para el cliente.

## Consecuencias

- Se puede lanzar lectura DWG comercial en semanas (evaluación de proveedor +
  adaptador) sin cancelar el activo propio.
- El costo de la licencia es temporal por diseño: el día que (3) se cumpla, el
  margen vuelve a casa sin migración de clientes.
- Lo que está PROHIBIDO por esta ADR: acoplar el runtime al proveedor fuera
  del adaptador; publicitar «DWG propio» antes de (3)+(d); y contar el
  detectar-y-rechazar DWG como soporte en cualquier material o rúbrica.
