# ADR-0002: API `/v1` y SDK contract-first

- Estado: aceptado
- Fecha: 2026-08-02

## Contexto

La API NestJS, el frontend, los tipos compartidos y `@valle/design-sdk` pueden
divergirse si cada capa mantiene rutas o shapes manualmente. El producto expone
identidad, organizaciones, comercial y CAD; verificar sólo que el YAML sea
válido no demuestra que el router real implemente el contrato.

## Decisión

`packages/contracts/specs/design-api.v1.yaml` es la fuente pública autoritativa.
Todas las rutas standalone viven literalmente bajo `/v1`; CAD usa
`/v1/cad/*`. Un cambio contractual debe:

1. ser aditivo o introducir una versión/deprecación explícita;
2. pasar lint OpenAPI;
3. regenerar `packages/design-sdk/src/generated/design-api.ts`;
4. mantener igualdad byte-for-byte con la salida del generador;
5. pasar tests de compatibilidad de tipos y cliente; y
6. demostrar que el router Nest ofrece cada operación, método y path.

El SDK usa cookies first-party con `credentials: "include"` y CSRF para
mutaciones. No acepta tenant u organización para lecturas comerciales porque el
servidor los deriva de la sesión activa. Adaptadores de rutas históricas quedan
encapsulados en `legacy/` y no son una segunda API pública.

AsyncAPI expresa el shape de eventos, pero sólo una escritura outbox y una
entrega verificada demuestran que un evento se produjo.

## Consecuencias

Un endpoint sin spec, un spec sin router o un SDK editado a mano rompe el gate.
Los consumidores tienen una superficie estable y errores CAS/CSRF tipados. Los
cambios rompientes requieren migración de cliente y ventana de compatibilidad.

## Alternativas rechazadas

- Clientes fetch manuales como fuente de verdad.
- Validar sólo el YAML sin comparar el router.
- Generar el contrato desde decoradores como flujo paralelo.
- Reutilizar rutas históricas como API pública permanente.
