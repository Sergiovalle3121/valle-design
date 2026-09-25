# Borradores legales para revisión de Sergio — 23-09-2026

Los borradores viven en este directorio —[aviso de privacidad](BORRADOR-AVISO-PRIVACIDAD-2026-09-23.md) y [términos](BORRADOR-TERMINOS-2026-09-23.md)— y **no se publican** como páginas: un texto con «pendiente de Sergio» a la vista de quien se registra resta confianza en el lanzamiento (decisión del 24-09-2026, al cerrar el PR #244). No sustituyen las versiones que la API entrega en `GET /v1/legal/documents`. Esas versiones permanecen intactas en `/privacy` y `/terms`, con su hash y su aceptación histórica. No se cambia el registro legal hasta que Sergio y su asesor validen el texto definitivo; entonces habrá que publicar una nueva versión y exigir la aceptación correspondiente.

## Fundamento consultado

- [Ley Federal de Protección de Datos Personales en Posesión de los Particulares, texto vigente](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf), Cámara de Diputados, arts. 14–16 (información y contenido del aviso), 27–31 (ARCO y procedimiento). El art. 15 exige identidad y domicilio del responsable, datos y finalidades, opciones para limitar uso/divulgación, medios ARCO y cambios al aviso. El art. 16 exige modalidad simplificada al recabar datos por medios electrónicos, con enlace al aviso integral. **El borrador no cumple aún por faltar datos del responsable y el canal ARCO.**
- [Ley Federal de Protección al Consumidor, texto vigente](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPC.pdf), Cámara de Diputados, art. 76 BIS, frs. III, V, VIII y IX: medios de reclamación, condiciones y costos antes de la transacción, aviso y consentimiento sobre cobro recurrente, y mecanismo de cancelación. La interfaz de checkout actual remite el importe al catálogo y al proveedor, pero **no lo muestra numéricamente en su propia pantalla de elección de medio de pago**; verificar con asesor y corregir el flujo antes del cobro público.

Estas referencias orientan el borrador; no constituyen dictamen jurídico.

## Datos y decisiones que Sergio debe completar

1. Identidad exacta, RFC, domicilio físico y medios de reclamación del prestador; comprobarlos con documentación del negocio, no deducirlos del nombre de marca.
2. Correo y procedimiento ARCO operativo; persona o equipo que atiende solicitudes y medio para comunicar cambios. El aviso simplificado en el alta sigue pendiente de validación jurídica y de producto.
3. Inventario de proveedores de alojamiento, correo, pago y facturación; su papel, ubicación, transferencias y plazos de conservación.
4. Finalidades secundarias, si existen, y mecanismo de consentimiento separado; no asumir que la casilla de términos las cubre.
5. Condiciones del plan educativo, periodicidad y reembolso; acceso/exportación de planos tras cancelar, plazo de retención, soporte y jurisdicción.
6. Revisión del abogado, fecha de vigencia y publicación de nueva versión en la API y en el web, conservando evidencia del texto aceptado.

La fila de «aviso y términos revisados» de la puerta de lanzamiento sigue pendiente de Sergio. La existencia de estos borradores no la pone en verde.
