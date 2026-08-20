# Política de extensiones de terceros

**No existe un proceso de revisión de extensiones, ni un mercado, ni una firma
de código, ni un programa de desarrolladores.** Quien lea este documento
buscando a quién enviar su plugin para que lo aprobemos: hoy no hay a quién.
Lo que sí hay son cuatro superficies de extensión reales, con límites técnicos
que se pueden verificar en el código, y este documento dice exactamente hasta
dónde llega cada una.

Se publica así porque la alternativa —prometer un programa de partners que no
existe— se descubre a la primera pregunta concreta, y un integrador que
descubre eso deja de creer también lo que sí era cierto.

## Las cuatro superficies

| Superficie                         | Dónde corre           | Quién la puede usar hoy                  | Estado                         |
| ---------------------------------- | --------------------- | ---------------------------------------- | ------------------------------ |
| API HTTP `/v1/*` + SDK generado    | Servidor              | Cualquiera con una sesión y entitlement  | Publicada y versionada         |
| Webhooks del outbox                | Receptor del cliente  | El operador del despliegue               | Publicada, firmada HMAC        |
| Rutinas AutoLISP (`.lsp`) y DCL    | Navegador del usuario | Cualquier usuario del editor             | Publicada, con presupuesto     |
| Plugins JavaScript (`CadPlugin`)   | Navegador del usuario | Nadie fuera del producto todavía         | **No cableada** — ver más abajo |

### 1. API HTTP y SDK

Es la superficie principal y la única pensada para integraciones de servidor a
servidor.

- **Contrato**: `packages/contracts/specs/design-api.v1.yaml`, OpenAPI 3.1, con
  73 operaciones (43 bajo `/v1/cad`). El contrato manda: el SDK de TypeScript se
  genera de él y el enrutador del servidor se verifica contra él en cada
  cambio (`scripts/cad/check-design-contract.mjs`).
- **Consola pública**: `/docs/api` lista las operaciones y permite lanzarlas.
- **Autenticación**: cookie de sesión propia. Las mutaciones exigen
  `X-CSRF-Token`. **No hay claves de API todavía**: una integración desatendida
  tiene que mantener viva una sesión, lo cual es una limitación real y no un
  descuido de documentación. Es el hueco más citado por quien evalúa
  automatizar, y está anotado como tal.
- **Autorización**: entitlement `design.cad` vigente más un permiso `cad:*`
  derivado en el servidor de la membresía activa. Ningún permiso enviado por el
  cliente se acepta.
- **Límites**: ver `docs/cad/evidence/api-load-tests.json`. Lo medido:
  limitador de tasa por cuenta e IP sobre PostgreSQL, con `429` y
  `retryAfterSeconds` accionable; documento canónico inline hasta 8 000 000
  bytes y archivo comprimido hasta 128 MiB.
- **Compatibilidad**: `v1` es el prefijo de versión. No hay política de
  deprecación escrita todavía; cuando la haya, vivirá aquí.

### 2. Webhooks

El producto entrega eventos de dominio y de correo a un receptor HTTPS que
declara el operador del despliegue.

- Entrega **al menos una vez**, con clave de idempotencia estable entre
  reintentos. El receptor debe deduplicar.
- Firma HMAC-SHA256 sobre `timestamp.cuerpo`, en `X-Valle-Signature`. **Se
  verifica sobre los bytes crudos**, nunca sobre el JSON reparseado.
- Reintentos con retroceso exponencial y jitter, cola muerta al agotar
  intentos.
- Auditoría de reproducción publicada en
  `docs/cad/evidence/webhook-replay-audit.json`.
- **Límite honesto**: el receptor lo configura el operador por variable de
  entorno; no hay panel para que un tercero se dé de alta solo.

### 3. Rutinas AutoLISP y DCL

Un usuario puede cargar un `.lsp` y ejecutarlo en su navegador. Es la
superficie más abierta del producto y la que más se parece a lo que un despacho
ya tiene escrito para su herramienta anterior.

Lo que la sujeta no es una revisión humana, es un presupuesto de ejecución
(`apps/web/src/lib/lisp/budget.ts`):

- **Pasos**: 2 000 000 evaluaciones. Corta `(while T)`.
- **Celdas**: 4 000 000 asignaciones, cobrando las cadenas por carácter. Corta
  el `(strcat s s)` repetido antes de que agote la memoria del navegador.
- **Profundidad**: 400 marcos. Corta la recursión infinita con un error propio
  en vez de un desbordamiento de pila a medio camino.
- **Tiempo**: 5 000 ms de reloj.

Y una garantía estructural más fuerte que cualquier contador: **el subsistema
no importa nada del navegador**. No hay `fetch`, ni `eval` de JavaScript, ni
`XMLHttpRequest`, ni DOM, ni almacenamiento, ni `process` en ningún módulo de
`lib/lisp/`. Eso no se promete en un comentario:
`apps/web/src/lib/lisp/sandbox-surface.spec.ts` lo comprueba leyendo el código
fuente e imprime el inventario completo de dependencias externas en cada
corrida, de forma que añadir una nueva rompe el gate y obliga a justificarla.

Lo que esto **no** garantiza:

- Una rutina puede modificar el dibujo del usuario que la ejecuta, borrar
  entidades incluidas. El presupuesto acota el consumo, no la intención.
- No hay aislamiento entre rutinas: dos `.lsp` cargados en la misma sesión
  comparten entorno.
- No firmamos ni verificamos la procedencia de un `.lsp`. Cargar el archivo de
  un tercero es una decisión del usuario, con el mismo riesgo que en cualquier
  CAD de escritorio.

### 4. Plugins JavaScript

Existe una API de plugins (`apps/web/src/lib/lisp/plugins/api.ts`) con reglas
sensatas —un plugin no puede pisar un comando del producto, no recibe el
documento mutable y escribe por el mismo puerto que todo lo demás—, pero
**ningún código fuera de `lib/lisp/` la importa todavía**: no hay forma de que
un tercero cargue un plugin JavaScript en el producto. Se documenta porque
existe y porque su diseño es la respuesta a «¿cómo lo haréis cuando lo hagáis?»,
no porque esté disponible.

## Lo que garantizamos y lo que no

**Garantizamos**:

- Que el contrato OpenAPI y el enrutador no divergen: hay un gate que falla.
- Que la firma de los webhooks se verifica sobre bytes crudos.
- Que el presupuesto del intérprete se aplica y que su superficie de imports
  está comprobada por spec.
- Que las cifras de carga publicadas se regeneran por script, con la máquina
  declarada.

**No garantizamos**:

- Estabilidad de nada que no esté en el contrato OpenAPI. Los módulos internos
  cambian sin aviso.
- Revisión, firma ni distribución de código de terceros.
- Un plazo de deprecación de operaciones. No lo hemos escrito, así que no lo
  prometemos.
- Aislamiento entre extensiones que corren en el mismo navegador.

## Si quieres integrar hoy

1. Lee el contrato en `packages/contracts/specs/design-api.v1.yaml` o abre
   `/docs/api`.
2. Usa el SDK generado (`@valle/design-sdk`) en vez de escribir el cliente a
   mano: se regenera con el contrato.
3. Prepara tu receptor de webhooks para entregas duplicadas y verifica la firma
   sobre el cuerpo crudo.
4. Cuenta con el limitador de tasa: respeta `retryAfterSeconds` en lugar de
   reintentar en bucle.
5. Escríbenos si necesitas una clave de API para integración desatendida. Hoy
   no existe; saber cuánta gente la necesita es lo que decidirá si se construye.
