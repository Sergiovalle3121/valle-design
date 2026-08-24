# ADR-0014: DWG a vía única propia — se retira el proveedor licenciado

- Estado: Aceptada
- Fecha: 2026-08-24
- Decide sobre: retirar la vía de proveedor licenciado que ADR-0012 dejaba
  abierta para vender DWG a corto plazo
- Sustituye a: ADR-0012, Decisión §1 («Para VENDER: proveedor licenciado»)
  únicamente. El resto de ADR-0012 —el activo propio, el corpus, el
  criterio de cambio de §3— permanece vigente y esta ADR lo relee como la
  única vía, no como un umbral para apagar una licencia.
- Relacionadas: ADR-0004, ADR-0007, ADR-0009, ADR-0012

## Contexto

ADR-0012 (aceptada 2026-08-22) decidió avanzar DWG por dos vías
simultáneas: pagar un proveedor licenciado (ODA/RealDWG/otro SDK
comercial) para poder vender lectura DWG en semanas, mientras el códec
propio maduraba en el laboratorio sin fecha impuesta por marketing, con un
criterio de reemplazo escrito y medible en su §3.

El 2026-08-24, en conversación directa registrada en la sesión de trabajo
de esa fecha, el titular (Sergio Valle Zárate, @sergiovalle3121) instruyó
explícitamente: no hay presupuesto para licencias ODA/RealDWG ni ningún
SDK comercial de terceros, el producto debe usar códec first-party, y no
debe construirse una ruta de proveedor licenciado. Se registra aquí para
que ningún agente futuro reintroduzca la vía licenciada sin otra ADR que
nombre y sustituya ésta.

## Decisión

1. Se retira, sin fecha de reconsideración, la vía «proveedor licenciado»
   de ADR-0012 §1. Ningún trabajo de producto debe integrar ODA SDK,
   RealDWG, ni otro codec DWG comercial de terceros como dependencia
   runtime, ahora ni como opción de diseño latente.
2. Todo el esfuerzo de lectura/escritura DWG del producto proviene
   exclusivamente del códec propio clean-room (`packages/dwg-codec`),
   gobernado por ADR-0007 y promovido caso por caso según ADR-0009.
3. Consecuencia aceptada explícitamente por el titular: el alcance DWG
   real del producto crece a la velocidad del códec propio, no a la de un
   proveedor comercial maduro. Cada capacidad de producto se declara por
   versión y por entidad exacta — nunca «compatible con AutoCAD» sin
   calificar, y nunca «DWG propio» de forma general antes de que
   ADR-0012 §3 se cumpla completo.
4. ADR-0012 sigue vigente en todo lo demás: el activo propio, el corpus de
   conformidad y el criterio de cambio escrito de su §3 pasan a ser, con
   esta ADR, el ÚNICO camino posible.
5. Esta ADR no promueve por sí misma ninguna capacidad al producto: eso lo
   resuelve ADR-0009, caso por caso y con su propio checklist de gates.

## Consecuencias

- Se cierra la ambigüedad de a qué vía dedicar ingeniería: toda la
  capacidad DWG futura es del códec propio.
- El producto no ofrecerá DWG de forma amplia ni inmediata: la cobertura
  real (versiones, entidades, escritura) queda atada al ritmo del
  laboratorio y su corpus, no a un contrato de licencia. Esto es un costo
  consciente, no un descuido.
- Cualquier reconsideración de esta decisión —por ejemplo, ante una
  necesidad comercial urgente que el códec propio no alcance a cubrir—
  requiere una ADR posterior que nombre y sustituya ésta, nunca una
  excepción de código o una dependencia añadida sin ADR.

## Alternativas rechazadas

- Mantener ambas vías de ADR-0012 «por si acaso»: rechazada explícitamente
  por el titular, por costo.
- Reescribir ADR-0012 como si nunca hubiera existido: se prefiere
  sustitución nombrada de una sección concreta, como exige
  `docs/adr/README.md`.
