# Recepción de soporte para VALLECAD

**Pendiente de activación por Sergio.** El código ya muestra «Reportar un fallo»
y encola el incidente para `SUPPORT_EMAIL`, pero eso no prueba que exista un
buzón que reciba los mensajes. El pie sólo enseña la dirección configurada en
`NEXT_PUBLIC_BRAND_SUPPORT_EMAIL`; tampoco verifica su entrega. No marcar este
canal como operativo hasta realizar la prueba de extremo a extremo de abajo.

## Activar `soporte@vallecad.com` en Cloudflare

Según la [guía oficial de Cloudflare Email Routing](https://developers.cloudflare.com/email-service/get-started/route-emails/),
el dominio debe usar Cloudflare DNS. En el panel, Sergio debe abrir **Compute →
Email Service → Email Routing**, incorporar `vallecad.com` y revisar los
registros MX y TXT que Cloudflare propone. Si ya hay otro proveedor recibiendo
correo para el dominio, revisar sus MX antes de cambiarlos.

Después, en **Destination Addresses**, debe agregar su Gmail de destino y
verificarlo desde el mensaje que Cloudflare envía. En **Routing Rules** debe
crear la dirección `soporte@vallecad.com` con acción **Send to an email** y
destino en ese Gmail ya verificado. Una regla con destino sin verificar queda
deshabilitada. La [documentación de reglas y destinos](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/)
describe esa condición. No guardar la dirección personal de destino en este
repositorio.

Enviar un correo de prueba **desde otra cuenta** a `soporte@vallecad.com` y
confirmar su llegada al Gmail de destino, también en spam si no aparece en
entrada. Cloudflare recomienda una cuenta de origen distinta porque algunos
proveedores descartan el mensaje si origen y destino coinciden. Guardar la fecha
UTC y el resultado de la prueba operativa fuera del repositorio; no incluir el
contenido del correo ni datos personales en un PR.

Email Routing reenvía correo entrante; no configura por sí solo el envío de
respuestas desde `soporte@vallecad.com`. Definir por separado cómo responderá
Sergio y verificar que los usuarios puedan recibir esas respuestas.

## Conectar el producto y comprobarlo

1. Después de probar el reenvío, configurar `SUPPORT_EMAIL=soporte@vallecad.com`
   en la API y `BRAND_SUPPORT_EMAIL` con la misma dirección. Configurar además
   el proveedor de correo saliente y el dispatcher del outbox según
   [VARIABLES-LANZAMIENTO.md](VARIABLES-LANZAMIENTO.md); un outbox encolado no
   demuestra entrega.
2. Configurar `NEXT_PUBLIC_BRAND_SUPPORT_EMAIL=soporte@vallecad.com` **antes de
   reconstruir la web**. Comprobar que el pie y `/support` muestran la dirección
   correcta. Mantener esa dirección alineada con `SUPPORT_EMAIL`.
3. Desde una cuenta de prueba autenticada, enviar «Reportar un fallo» en modo
   Esencial y en Pro. Comprobar en el correo recibido versión, navegador, modo,
   comando y ausencia de identificador de plano sin autorización. Confirmar
   también que la respuesta al usuario no enseña mensajes internos del servidor.
4. Registrar fecha UTC, versión desplegada, recepción y respuesta de prueba.
   Hasta completar esos pasos, el soporte de lanzamiento sigue pendiente.

Si `SUPPORT_EMAIL` falta, la API responde 503 y no acepta el reporte. El cuadro
conserva el texto para reintentar cuando el canal esté disponible; no promete
que otra página lo entregará sin un buzón configurado.
