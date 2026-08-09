# Desarrollo asistido y adopción humana

## Principio

Codex, Claude y otras herramientas pueden asistir con análisis o propuestas,
pero no se registran como autoras, contribuidoras, empleadas, cesionarias ni
copropietarias. Una persona con autoridad revisa la propuesta, decide si la
adopta y asume responsabilidad por el cambio incorporado.

## Registro obligatorio

Todo cambio material asistido añade o actualiza una entrada en
`assisted-development-log.json` con:

- identificador estable, fecha, iniciativa y rama;
- herramienta usada y alcance concreto;
- autoridad e inputs first-party entregados;
- fuentes externas consultadas y sus términos, o una declaración expresa de
  que no las hubo;
- áreas derivadas, fixtures y dependencias;
- mecanismo de revisión/adopción humana; y
- confirmación de que no se usaron trailers de coautoría para la IA.

No se guardan prompts con secretos, corpus, contratos, datos personales ni
documentación confidencial. Los registros no sustituyen los acuerdos de cesión
de contribuidores humanos.

## Adopción

Una entrada puede empezar como `proposed`. La aprobación y merge del PR por
Sergio constituye la decisión de adoptar exactamente el diff revisado cuando la
entrada así lo declara. Si otra persona adopta el cambio, se registra su nombre,
autoridad y evidencia. Un cambio rechazado queda como `rejected` o se elimina
antes del merge si nunca formó parte del historial aceptado.

Los commits futuros no usan `Co-authored-by` para una IA. La trazabilidad vive
en este registro y en el PR; los contribuidores humanos conservan la atribución
que corresponda a sus acuerdos.
