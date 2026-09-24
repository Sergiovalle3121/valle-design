# Aviso de privacidad — BORRADOR para revisión de Sergio y su abogado

> Redactado el 23-09-2026 (OpenAI Codex, PR #244) y completado el 24-09-2026
> con el enlace temporal de la demostración. **No está publicado**: el aviso
> vigente sigue siendo `/privacy` (`apps/web/src/app/privacy/page.tsx`), con
> su versión y hash en `apps/api/src/modules/legal/legal-documents.ts`. Este
> texto se publica sólo como nueva versión aprobada, nunca como borrador
> visible a las personas usuarias. Fuentes y pendientes:
> [`BORRADORES-LANZAMIENTO-2026-09-23.md`](BORRADORES-LANZAMIENTO-2026-09-23.md).

## Quién trata los datos

VALLECAD es el nombre del servicio. La identidad jurídica del responsable y su
domicilio deben verificarse antes de aprobar este aviso.

- **Identidad o razón social del responsable: pendiente de Sergio.**
- **Domicilio del responsable: pendiente de Sergio.**

## Qué datos se tratan

Para crear y usar una cuenta: nombre visible, correo electrónico, datos
necesarios para verificar la identidad y mantener la sesión, organización y
membresías.

Para operar el dibujo: proyectos, documentos, planos y contenido que la persona
usuaria decida guardar o compartir. Si se solicitan comprobantes fiscales, se
tratan los datos fiscales que proporcione la organización.

Para atender incidencias: el reporte que la persona envíe y los datos técnicos
que se le muestren antes de enviarlo. **Datos personales sensibles:** este
servicio no los solicita como requisito de alta; falta confirmar si algún flujo
específico podría recibirlos de forma incidental.

## Enlace temporal de la demostración (sin cuenta)

Quien dibuja en `/demo` sin cuenta puede pulsar «Compartir» para mandar su
plano a otra persona. Hechos que el texto final debe recoger (verificados en el
código: `apps/api/src/modules/cad/cad-demo-share.service.ts`):

- **Finalidad:** que otra persona vea una copia de sólo lectura del dibujo.
- **Qué se guarda:** una copia del dibujo, sin historial, imágenes insertadas,
  publicaciones ni referencias externas, y con los secretos redactados. Del
  enlace sólo se guarda el sha256 de sus dos tokens.
- **Qué NO se guarda:** la dirección IP ni nada que identifique al visitante.
  Los límites de uso por IP usan una clave HMAC opaca que no se puede revertir.
- **Plazo:** siete días. La lectura comprueba la caducidad y un barrido cada
  15 minutos borra lo vencido.
- **Borrado:** el visitante lo borra con «Borrar enlace»; soporte puede
  retirarlo a petición (`RUNBOOK.md`).
- **Si crea cuenta:** el enlace pasa a ser un enlace de revisión de su documento
  (90 días como máximo) y la copia temporal se borra.
- **Uso aceptable:** la pantalla pide no incluir datos personales de terceros, y
  el visor ofrece «Reportar este plano».

## Para qué se usan

Las finalidades necesarias para prestar el servicio son crear y proteger la
cuenta, aplicar permisos, guardar y mostrar los documentos, atender soporte,
gestionar pagos cuando estén habilitados y cumplir obligaciones fiscales cuando
correspondan.

**Finalidades opcionales:** pendiente de Sergio confirmar si habrá
comunicaciones comerciales u otros usos no necesarios. Si se activan, se
deberán explicar y obtener el consentimiento que corresponda antes de tratar
los datos para ese fin.

## Proveedores y transferencias

La operación puede requerir servicios de alojamiento, correo transaccional,
pagos y facturación. **Lista de proveedores, funciones, ubicación y
transferencias internacionales: pendiente de verificar antes de aprobar el
aviso.** Este borrador no presume consentimiento para transferencias que lo
requieran.

## Cómo limitar el uso y ejercer derechos ARCO

La persona titular puede solicitar acceso, rectificación, cancelación u
oposición respecto de sus datos. La solicitud deberá identificar a la persona o
representante, describir los datos y señalar el derecho que desea ejercer.

**Correo o medio para ejercer derechos ARCO: pendiente de Sergio.** También
quedan pendientes el procedimiento operativo, la persona responsable de
atenderlo y las opciones para limitar usos no necesarios. No se presenta un
correo no verificado como canal activo.

## Conservación, cancelación y cambios

**Plazos de conservación y eliminación por tipo de dato: pendientes de
definir.** La política deberá explicar cómo se recuperan o exportan los planos
al cancelar y qué datos se conservan por obligación legal.

Los cambios de este aviso requerirán una versión nueva y un medio para
comunicarlos a las personas titulares. **Medio de notificación y fecha de
entrada en vigor: pendientes de Sergio.**
