# Auditoría 15 · Seguridad: autenticación, secretos, multiusuario, OWASP

> Auditoría externa de inversión. Fecha del árbol: 2026-09-05.
> Ámbito: identidad y sesiones, contraseñas y segundo factor, autorización por
> recurso e inquilino, CSRF, XSS, inyección, subida de ficheros, secretos,
> cabeceras y CSP, dependencias, bitácora de auditoría, cifrado en reposo y en
> tránsito, y borrado de cuenta / derechos ARCO-RGPD.
>
> Todo lo que se afirma aquí se leyó en el árbol. Cada hueco lleva el fichero
> que se miró para poder decir que falta. Lo parcial se dice «todavía no».

---

## Veredicto

**El motor de seguridad de Valle Design está mejor construido que el de la
mayoría del SaaS que he auditado, y la superficie que un despacho realmente
evalúa antes de firmar —dar de baja a quien se va, ver quién abrió el plano de
un cliente, borrar sus datos— no existe.**

Nota: **5,5 / 10** contra AutoCAD completo.

Ese 5,5 es la media de dos números muy distintos, y conviene decirlos por
separado porque describen dos productos:

| | Nota | Por qué |
| --- | --- | --- |
| **Ingeniería de seguridad** (criptografía, sesiones, CSRF, aislamiento, cadena de suministro) | 8 / 10 | Argon2id con parámetros explícitos, sesión opaca con hash persistido, CSRF de doble envío ligado al hash de sesión, tenant derivado del servidor en cada petición y **barrido programático del router real contra PostgreSQL** que exige 403 en las ~30 rutas `/v1/cad`. Gitleaks sobre historial completo, SBOM, gate de licencias. Esto es de primera. |
| **Seguridad como función de producto** (ciclo de vida del usuario, gobernanza, cumplimiento) | 3 / 10 | No se puede expulsar a un miembro. No se puede degradar un rol. No hay bitácora visible para el cliente. No hay cambio de contraseña dentro de la sesión. No hay borrado de cuenta ni exportación de datos. No hay SSO. No hay aviso de privacidad publicado. |

La frase de una línea: **la criptografía y el aislamiento están al nivel de
AutoCAD; el ciclo de vida del usuario y la gobernanza no llegan al mínimo que
un despacho de diez personas necesita el primer día.**

### Una anomalía que hay que decir primero

`docs/competitive/rubric.json` tiene **36 categorías, 155 criterios y 271
puntos, y CERO miden seguridad**. El barrido lo confirma: la única aparición de
la palabra «seguridad» en un texto de criterio está dentro de la fila `dwg`
(«gates legal, de seguridad y de fidelidad»), hablando de otra cosa.

Consecuencia práctica: **nada en el sistema de puntuación del propio proyecto
se enteraría si mañana se cae el aislamiento entre inquilinos.** La rúbrica
gobierna qué se construye y qué se cobra; la seguridad está fuera de ella, y
por eso es la dimensión donde la ingeniería es excelente y el producto está
vacío. Es el hallazgo estructural de esta auditoría.

---

## 1 · Lo que ya está construido y está bien

No es cortesía: es material que un comprador técnico puede verificar en veinte
minutos y que sube el precio del activo.

### 1.1 · Contraseñas y sesiones

`apps/api/src/modules/identity/identity-security.ts`

- Argon2id con `m=19456 KiB, t=2, p=1, outLen=32, salt=16` explícitos
  (líneas 18-23) — los parámetros mínimos de la OWASP Password Storage Cheat
  Sheet, escritos, no heredados de un default de librería.
- `DUMMY_PASSWORD_HASH` (línea 34) con los MISMOS parámetros, para que el
  inicio de sesión de una cuenta inexistente cueste el mismo tiempo. Y vive en
  el módulo compartido precisamente para que no diverja entre el login y la
  confirmación de contraseña del MFA. Es el nivel de cuidado que casi nadie
  tiene.
- El valor de sesión es `<uuid>.<43 chars base64url>` (256 bits de `randomBytes`)
  y **sólo su SHA-256 se persiste** (`identity.service.ts:257-272`). Un volcado
  de `identity_sessions` no permite entrar.
- Cookie de producción `__Host-valle_session`, `HttpOnly`, `Secure`,
  `SameSite=Lax`, `path=/`, sin `Domain`
  (`identity.controller.ts:141-158, 288-309`). Y **falla cerrada**: si
  `req.secure` es falso en producción se responde 503 en vez de degradar la
  cookie (`getCookiePolicy`, líneas 270-286). Eso es exactamente lo contrario
  de lo que hace la mayoría.

### 1.2 · CSRF

`cad-auth.guard.ts:98-113` y `identity.controller.ts:330-350`.

Doble envío **ligado a la sesión**: no basta con que la cookie legible
`valle_csrf` y el header `X-CSRF-Token` coincidan; el SHA-256 del header tiene
que igualar `session.csrfHash`. Comparación en tiempo constante
(`common/security/constant-time.ts`), con un comentario que explica que las
seis copias anteriores cortocircuitaban por longitud. Esto cierra el «cookie
tossing» desde un subdominio, que es donde el doble envío ingenuo se rompe.

### 1.3 · Aislamiento entre inquilinos, con prueba de verdad

`apps/api/src/modules/cad/cad-tenant-isolation.pg.spec.ts`

Levanta el stack completo (guards + interceptor + TypeORM scoping) contra
PostgreSQL real, **enumera las rutas desde el router de Express** (líneas
387-407), comprueba que hay al menos 30, y exige que **cada una** responda 403
`entitlement_required` a una sesión sin entitlement, o 401 si es la superficie
de review (líneas 408-442). Además comprueba que la denegación quedó auditada
con el tenant correcto.

Este barrido es lo que convierte «se nos olvidó el decorador» en un fallo de
CI. Corre en CI (`.github/workflows/ci.yml:329-335`, `REQUIRE_POSTGRES_TESTS`,
sin salto silencioso). **Es la mejor pieza de seguridad del repositorio.**

### 1.4 · Review links

`cad-review-link.controller.ts` + `review-link.service.ts`

Se hizo bien, y es la parte donde más fácil habría sido fallar:

- El token viaja en header (`X-Review-Token`), nunca en la URL — no acaba en
  el `Referer` ni en el historial de un proxy.
- Se canjea en **cada** petición contra el hash: revocar la sesión mata el link
  al instante, sin credencial derivada que sobreviva.
- Los cuatro handlers usan `access.documentId` / `access.sessionId`, **jamás un
  id del cliente** — el único id que sí llega del cliente, `commentId`, se
  verifica contra el hilo de la sesión (`cad-review.repository.ts:249-260`).
- `PermissionsGuard` responde 403 `review_read_only` a cualquier ruta fuera de
  `@ReviewLinkSurface()` (líneas 69-81).
- Un hash desconocido **no escribe auditoría**, para no dar a un anónimo un
  amplificador de escritura (`review-link.service.ts:57-63`).

### 1.5 · Segundo factor

`identity-mfa.service.ts` / `identity-mfa.ts`

- TOTP escrito a mano contra RFC 6238, con **anti-repetición real**: se guarda
  el paso QUE CASÓ, no el paso actual, y el `UPDATE` es un compare-and-set
  sobre `lastUsedStep` (líneas 216-239). El comentario documenta el agujero de
  un minuto que la versión anterior tenía. Muy pocos productos llegan aquí.
- Códigos de respaldo de un solo uso consumidos con `UPDATE … WHERE
  consumedAt IS NULL` (líneas 243-252) — dos peticiones simultáneas no pueden
  ganar las dos.
- El secreto TOTP se guarda cifrado con AES-256-GCM
  (`identity-mfa.ts:338-351`), y producción **no arranca** sin
  `IDENTITY_MFA_ENCRYPTION_KEY` de ≥32 caracteres (`assertMfaConfiguration`).
- El desafío entre contraseña y código no es una sesión a medias: es un token
  de un solo uso, y se consume ANTES de validar el código, así que cada desafío
  vale exactamente un intento (`identity.service.ts:227-255`).

### 1.6 · Entradas hostiles

- **Detección por bytes, no por extensión**:
  `apps/web/src/components/cad/interop/cad-format-detect.ts` lee la cabecera
  `AC10xx` del byte 0 para distinguir DWG binario de DXF de texto. El `accept`
  del `<input type=file>` es sólo una comodidad.
- **Prototype pollution rechazada explícitamente**:
  `apps/web/src/lib/cad/document-import.ts:504` rechaza `__proto__`,
  `prototype` y `constructor` como claves, y hay un fuzzer dedicado
  (`document-import-fuzz.ts`) que lo ejercita.
- **Zip bomb acotada**: `cad-document-storage.ts:115-176`, `gunzipBounded`
  corta por bytes expandidos y además contrasta contra el manifiesto.
- **Límites de cardinalidad server-side**:
  `cad-document-validation.ts` aplica ~15 techos distintos (entidades, bloques,
  restricciones, hojas, viewports, publicaciones, profundidad de anidamiento)
  desde el contrato, no desde constantes locales.
- `ValidationPipe` global con `whitelist` + `forbidNonWhitelisted`
  (`main.ts:76-85`): mass assignment cerrada por defecto.

### 1.7 · XSS e inyección

- **Cero** `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval` o
  `new Function` en `apps/web/src`. Dos `dangerouslySetInnerHTML`: el script de
  tema del layout (constante) y `JsonLd.tsx`, que escapa `<` a `<` con un
  comentario que explica por qué (`</script>` dentro de una cadena JSON corta
  el bloque).
- **Cero** interpolación de SQL en código de producto. Los únicos template
  literals con `${}` en `.query()` están en migraciones (DDL) y en el harness
  de pruebas; el `LISTEN ${CAD_PRESENCE_CHANNEL}` de
  `cad-presence.bus.ts:122` interpola una constante del propio módulo.
- El intérprete AutoLISP (`apps/web/src/lib/lisp/`) es un **intérprete**, no un
  `eval`: no hay una sola construcción de código dinámico en todo el árbol.

### 1.8 · Cadena de suministro y secretos

- `.gitleaks.toml` + `.gitleaksignore` con allowlist **exacta** (regex + path)
  y un párrafo por entrada explicando por qué es un falso positivo. Gitleaks
  corre sobre historial completo en CI (`ci.yml:1167-1187`) con checksum del
  binario descargado. Esto es más disciplina que la de muchas empresas cotizadas.
- SBOM CycloneDX + gate de licencias en CI (`ci.yml:300-315`).
- Ningún secreto por defecto en código de producto: `IDENTITY_RATE_LIMIT_KEY_SECRET`
  e `IDENTITY_MFA_ENCRYPTION_KEY` hacen **fallar el arranque** en producción si
  faltan; `METRICS_TOKEN` ausente hace que el endpoint responda **404**, no 401
  (`observability/metrics-access.ts`).
- Los arneses `_development/*` tienen cuatro guardas (`harness-access.ts`) y
  responden 404 para no confirmar la ruta.

### 1.9 · Observabilidad sin fugas

`apps/api/src/observability/scrub.ts` redacta credenciales en URL, correos,
`Authorization`, JWT y cabeceras `Cookie` antes de que un texto salga hacia el
reporter, con un comentario que enumera los casos REALES del repo que lo
motivaron (`QueryFailedError` arrastra la sentencia con parámetros). El
`AllExceptionsFilter` nunca devuelve un stack al cliente.

---

## 2 · Defectos concretos del código

Con fichero y línea. Ordenados por lo que me haría bajar la valoración.

### D-1 · La página pública de seguridad afirma algo que el código contradice

**Fichero:** `apps/web/src/app/seguridad/page.tsx:55-63`

```
titulo: "Segundo factor de verdad",
cliente: "... Activarlo y desactivarlo pide la contraseña — una sesión robada
          no puede bajarte la defensa.",
tecnico: "... y el alta protegida por confirmación de contraseña."
```

**La realidad:** `apps/api/src/modules/identity/identity.controller.ts:536-570`.
`POST /v1/auth/mfa/setup` y `POST /v1/auth/mfa/activate` reciben `MfaCodeDto`,
que sólo declara `code`. No hay `PasswordConfirmationDto`. **Activarlo NO pide
la contraseña.** Sólo `mfa/disable` (línea 575) y `mfa/backup-codes` (línea 588)
la piden.

**Por qué es el defecto que más pesa:** este repositorio tiene una fila de
rúbrica de 13 puntos llamada «Integridad: el producto hace lo que dice» y un
arnés de veracidad que barre 190 comandos buscando éxitos falsos
(`scripts/cad/check-command-integrity.mjs`). La página que hace las
afirmaciones de seguridad **no tiene ningún spec que las verifique** —
`/seguridad` sólo aparece en `e2e/a11y/axe-superficies.spec.ts`, es decir, se
comprueba que sea accesible, no que sea cierta. El propio `BACKLOG.md` recoge
la asimetría como P1-F5 y nadie conectó el punto con la página que la niega.

Además, la misma tarjeta afirma (línea 51) que el algoritmo Argon2id «viaja
versionado con la credencial para poder endurecerlo sin invalidar cuentas».
Eso tampoco es cierto hoy: ver D-2.

**Arreglo:** o se corrige el texto a lo que el código hace, o se hace P1-F5 y
el texto pasa a ser verdad. Y, en los dos casos, un spec que lea `FACTS` de
`page.tsx` y falle si una afirmación no tiene su prueba nombrada — el mismo
patrón de `check-command-integrity.mjs`, aplicado a las promesas de seguridad.

### D-2 · Endurecer los parámetros de Argon2id cierra la puerta a todas las cuentas

**Fichero:** `apps/api/src/modules/identity/identity-security.ts:137-144`

```ts
if (
  version !== ARGON2_VERSION ||
  memory !== ARGON2_MEMORY_KIB ||
  time !== ARGON2_TIME_COST ||
  parallelism !== ARGON2_PARALLELISM
) {
  return false;
}
```

El verificador **rechaza** cualquier hash cuyos parámetros no sean exactamente
los compilados hoy. No hay rehash-on-login: un `grep -rn "rehash\|needsRehash"`
sobre `apps/api/src` no devuelve nada.

**Escenario de fallo:** el día que se suba `ARGON2_MEMORY_KIB` de 19 456 a
47 104 (la recomendación siguiente de OWASP), **todos los `passwordHash`
existentes dejan de verificar** y cada usuario recibe «Credenciales inválidas».
La columna `Credential.algorithm` existe pero sólo distingue `'argon2id'` de
«otra cosa», y «otra cosa» es un 401 garantizado
(`identity.service.ts:197-200`).

**Arreglo:** mantener una lista `ACCEPTED_ARGON2_PARAMS` (histórico + actual);
verificar contra cualquiera de ellos y, si el hash no está en los parámetros
CORRIENTES, rehashear con los nuevos dentro de la misma petición
(`credentials.update(userId, {passwordHash: await hashArgon2idPassword(password)})`).
Coste: medio día. Sin esto, el parámetro de coste es de facto inmutable.

### D-3 · Ocho horas por minuto para bloquear a cualquiera de tus usuarios

**Fichero:** `apps/api/src/modules/identity/identity.controller.ts:370-371`

```ts
await this.limit('login.ip', [req.ip || 'unknown'], 40);
await this.limit('login.account', [normalizedEmail]);   // max = 8, ventana 60 s
```

El presupuesto de cuenta se consume **antes** de saber si la contraseña era
correcta, así que un intento fallido y uno exitoso cuestan lo mismo.

**Escenario de fallo:** conozco el correo de un arquitecto (está en su firma de
email). Mando 8 peticiones `POST /v1/auth/login` con una contraseña cualquiera
cada 60 segundos, desde IPs rotatorias o incluso desde una sola —el límite por
cuenta no mira la IP—. **Ese arquitecto no puede entrar a su CAD nunca más**,
por el coste de 8 peticiones por minuto. No hay pantalla que le explique qué
pasa: recibe un 429 genérico.

**Arreglo:** (a) no consumir el presupuesto de cuenta cuando la contraseña es
correcta; (b) separar «intentos fallidos por cuenta» de «peticiones por cuenta»
y dar al fallido un techo mayor con backoff exponencial en vez de ventana fija;
(c) una cookie de dispositivo conocido que exima del techo de cuenta a un
navegador que ya inició sesión con éxito. Verificación: una `.pg.spec.ts` que
agote el presupuesto con contraseñas malas y luego compruebe que la contraseña
BUENA sigue entrando.

### D-4 · `x-request-id` del cliente se refleja sin validar

**Fichero:** `apps/api/src/common/filters/all-exceptions.filter.ts:61-64`

```ts
const requestId =
  (req.headers['x-request-id'] as string | undefined)?.trim() || randomUUID();
res.setHeader('x-request-id', requestId);
```

Sin longitud máxima ni validación de caracteres. `res.setHeader` de Node lanza
`ERR_INVALID_CHAR` para cualquier byte de control (`/[^\t\x20-\x7e\x80-\xff]/`).

**Escenario de fallo:** cualquier petición que produzca un error —incluido un
400 de validación corriente— con `X-Request-Id: <ESC>[31m` hace que el propio
filtro de excepciones lance dentro de `catch()`. La excepción sale del filtro y
cae en el manejador por defecto de Express, que no es el contrato de error de
la API. Un id de 100 KB, además, entra tal cual en la línea de log
(`this.logger.error(\`[${requestId}] …\`)`, línea 74) — inyección de log e
inflado del reporter.

**Arreglo:** `const raw = String(req.headers['x-request-id'] ?? '').trim();`
`const requestId = /^[A-Za-z0-9._-]{1,128}$/.test(raw) ? raw : randomUUID();`

### D-5 · `qs` vulnerable en el árbol de producción, y el gate de CI está calibrado para no verlo

**Ficheros:** `package-lock.json` (`qs@6.15.3`) y `.github/workflows/ci.yml:259`

```
run: npm audit --omit=dev --audit-level=high
```

Ejecutado sobre este árbol:

```
qs  2.2.5 - 6.15.3   Severity: moderate
  qs array-limit bypass via bracket-key comma parsing   GHSA-x5fp-wj9c-mxmx
  qs: Denial of Service via Attacker Controlled isBuffer GHSA-4mjr-xmp4-gh2g
fix available via `npm audit fix`
EXIT=0
```

`qs` es el parser de query string de Express, es decir, **está en el camino de
cada petición de la API**. El arreglo es no-breaking (`fixAvailable: true`, sin
salto de major). El gate pasa en verde porque `--audit-level=high` ignora
`moderate`.

`fast-uri@3.1.5` (high, `fixAvailable: true`) también está en el árbol; queda
fuera de `--omit=dev`, pero es la misma clase de deuda sin recoger.

**Arreglo:** `npm audit fix` para el lockfile, y bajar el gate a
`--audit-level=moderate` para producción. Si un `moderate` no se puede arreglar,
que quede como excepción declarada con fecha de caducidad —el mismo patrón de
`command-integrity-exemptions.json`— en vez de una barra de corte que lo tapa.

### D-6 · El atajo de `admin` puentea el mapa de permisos

**Fichero:** `apps/api/src/modules/auth/guards/permissions.guard.ts:160`

```ts
if ((user.role || '').toLowerCase() === 'admin') return true;
```

Hoy es inocuo: `ROLE_PERMISSIONS.admin === CAD_PERMISSIONS`
(`organization-permissions.ts:6`), así que el atajo no concede nada que el mapa
no conceda. Pero es una segunda fuente de verdad para la autorización, y las
segundas fuentes de verdad divergen. El día que exista un permiso que un admin
NO deba tener (borrado definitivo, exportación masiva, gestión de facturación),
esta línea lo concede en silencio y ninguna prueba lo verá, porque las pruebas
comprueban el mapa.

Nótese además que `owner` **no** está en el atajo: la asimetría no significa
nada hoy pero es exactamente la clase de detalle que confunde a quien lo lea
dentro de un año.

**Arreglo:** borrar la línea. El mapa ya hace el trabajo, y el barrido de
`cad-tenant-isolation.pg.spec.ts` demuestra que no hay ruta que dependa de ella.

### D-7 · La RLS existe, está probada, y está inerte

**Ficheros:** `apps/api/src/migrations/20260823120000-TenantRuntimeRoleAndDesignBlobsRls.ts`
y `docs/adr/0013-rol-runtime-valle-app-no-dueno.md`

Nueve tablas de inquilino tienen `ENABLE ROW LEVEL SECURITY` con política
`tenant_id = current_setting('app.tenant_id')`, y existe el rol de mínimo
privilegio `valle_app` (`NOSUPERUSER NOBYPASSRLS`, sólo DML sobre esas nueve
tablas). Pero:

1. Ninguna tabla lleva `FORCE ROW LEVEL SECURITY` (la migración lo dice y
   explica por qué: forzarlo hoy apagaría el producto).
2. La aplicación sigue conectando **como el rol dueño**, que con `ENABLE`
   simple ignora las políticas.
3. `grep -rn "app.tenant_id\|set_config\|SET LOCAL"` sobre `apps/api/src`
   excluyendo migraciones y specs: **cero resultados**. Nadie fija el ajuste
   en tiempo de ejecución.

Es decir: hoy la única defensa real de aislamiento sigue siendo
`TenantScopedRepository` en la capa de aplicación. El ADR lo declara con esas
palabras y la página `/seguridad` es honesta al decir «no es RLS». **No es una
mentira: es una defensa a medio construir con la mitad cara ya pagada**, y el
riesgo es que se olvide y se cobre como hecha.

### D-8 · La cobertura de `TenantScopedRepository` es parcial, y su propia cabecera lo dice

**Fichero:** `apps/api/src/common/tenant/tenant-scoped.repository.ts:22-33`

> NO cubiertos (delegan a Repository y salen SIN filtro de tenant):
> `findOneOrFail`, `findOneByOrFail`, `existsBy`, `countBy`, `findAndCountBy`,
> `update`, `delete`, `softDelete`, `restore`, `increment`, `decrement`, `sum`,
> `average`, `maximum`, `minimum` y todo `createQueryBuilder`.

La honestidad es ejemplar (la cabecera anterior llegó a prometer dos helpers
que no existían, y se corrigió). Los tres call sites actuales sí ponen el
predicado a mano y lo hacen bien —`mutationScope()` en
`cad-documents.repository.ts:669-676` cae a `IsNull()` cuando no hay tenant, que
es fallo cerrado—. **El problema es que la corrección depende de que cada autor
futuro lo recuerde**, y no hay gate que lo compruebe.

**Arreglo posible sin tocar el diseño:** una regla ESLint local
(`no-restricted-syntax`) que prohíba llamar a esos métodos sobre una propiedad
tipada `TenantScopedRepository<*>` salvo dentro de un fichero con una
anotación `// tenant-scope: manual — <razón>`. Media jornada, y convierte una
costumbre en un gate.

---

## 3 · Los huecos, por lo que más duelen

### H-1 · No se puede echar a nadie

**AutoCAD:** Autodesk Account → Usuarios → quitar asignación. El acceso muere
en minutos. Con Autodesk Docs, además, se revoca por proyecto y por carpeta.

**Valle hoy:** `apps/api/src/modules/organizations/organizations.controller.ts`
tiene **seis rutas y ninguna es `@Delete` ni `@Patch`** (verificado:
`grep -n "@Delete\|@Patch\|@Put"` no devuelve nada sobre 472 líneas). Se puede
crear organización, listar, activar, listar miembros, invitar y aceptar
invitación. No se puede **quitar** a un miembro, **cambiar** su rol, ni
**revocar** una invitación pendiente. El contrato OpenAPI
(`packages/contracts/specs/design-api.v1.yaml:536-579`) tiene las mismas tres
rutas. La pantalla `/equipo` (`apps/web/src/app/equipo/TeamRoom.tsx`) tampoco
las tiene.

**Flujo real que se rompe:** un delineante deja el despacho el viernes. Su
sesión dura 30 días (`identity.service.ts:265`) y su membresía es permanente.
El lunes sigue teniendo acceso de escritura a **todos** los planos de **todos**
los clientes del despacho. La única palanca del titular es pedirle por favor
que cierre sesión. Ningún despacho serio firma un contrato con eso — y es la
primera pregunta de cualquier checklist de compra.

**Severidad:** bloqueante. **Esfuerzo:** un día.

**Cómo se construye:**
- `DELETE /v1/organizations/:organizationId/memberships/:membershipId` y
  `PATCH .../memberships/:membershipId {role}`, ambas exigiendo
  `['owner','admin'].includes(access.membership.role)` como ya hace `invite`
  (línea 335).
- Invariantes: no se puede quitar ni degradar al último `owner`; un `admin` no
  puede tocar a un `owner`; nadie se quita a sí mismo el último rol de dueño.
- En la MISMA transacción que borra la membresía:
  `UPDATE identity_sessions SET revoked_at = now() WHERE user_id = :userId AND
  revoked_at IS NULL`, y `UPDATE cad_review_sessions SET revoked_at = now()
  WHERE created_by = :email AND tenant_id = :org`. Sin eso el borrado es
  cosmético: la cookie sigue viva 30 días.
- Asiento `DesignAuditLog.record({action:'membership_revoked', …})`.
- `DELETE .../invitations/:invitationId` marcando `consumedAt`.
- Regenerar OpenAPI + SDK (`check:cad-contract` verde) y añadir la fila y el
  botón en `TeamRoom.tsx`.

**Cómo se verifica:** `.pg.spec.ts` que (1) siembra dos usuarios en la misma
organización, (2) el miembro guarda un documento con éxito, (3) el owner lo
expulsa, (4) la MISMA cookie del expulsado recibe 401 en el siguiente guardado
y (5) el intento de quitar al último owner responde 409.

### H-2 · El cliente no puede ver quién tocó sus planos

**AutoCAD:** Autodesk Docs registra apertura, descarga, subida, cambio de
permiso y compartición por usuario y fecha, exportable a CSV, con retención.
Es la evidencia con la que un despacho responde a su cliente cuando pregunta
quién vio el plano.

**Valle hoy:** la bitácora **existe y se escribe**
(`apps/api/src/modules/audit-log/design-audit-log.service.ts`, tabla
`design_audit_log`, append-only, tenant y actor del contexto autenticado, nunca
del body). Hay asientos de guardado, archivado, canje de review link,
denegación de permiso y denegación de entitlement.

Y **no hay ningún sitio donde leerla**. `DesignAuditLog.recent()` (línea 46) no
tiene un solo llamador de producto: `grep -rn "\.recent("` sobre `apps/api/src`
excluyendo specs devuelve cero. No hay controller en `modules/audit-log/`. No
hay pantalla. Lo único que un usuario ve es `GET /v1/auth/activity`
(`identity.controller.ts:617`), que son sus propios sucesos de identidad, no la
actividad sobre los documentos de la organización.

**Flujo real:** el cliente del despacho llama: «¿quién ha visto el plano de mi
casa?». La respuesta está en la base de datos y el despacho no puede leerla.

**Severidad:** alta. **Esfuerzo:** un día.

**Cómo se construye:** `GET /v1/organizations/:organizationId/audit?
referenceType=&referenceId=&from=&to=&cursor=` con
`@RequirePermissions('cad:admin')` (o restringido a `owner`/`admin`), sirviendo
`DesignAuditLog.recent()` con paginación por cursor sobre
`idx_design_audit_scope (tenant_id, created_at)` que ya existe. El `payload`
JSON se filtra a una lista blanca de claves antes de salir. Añadir además el
asiento que hoy falta y es el que más se va a pedir:
`cad_document_opened` / `cad_document_exported` en
`cad-documents.repository.ts`. Pantalla: pestaña «Actividad» en `/equipo`, con
filtro por documento y exportación CSV.

**Cómo se verifica:** `.pg.spec.ts`: A abre y exporta un documento, la bitácora
lo refleja con el actor correcto; B (otro inquilino) recibe 404 sobre la misma
organización; un `member` recibe 403.

### H-3 · No se puede cambiar la contraseña estando dentro

**AutoCAD:** Autodesk Account → Seguridad → cambiar contraseña, pidiendo la
actual.

**Valle hoy:** no existe el endpoint. `apps/api/src/modules/identity/identity.controller.ts`
declara 19 rutas y ninguna es `password/change`; sólo `password/forgot` (línea
661) y `password/reset` (línea 672) con token de correo. La pantalla lo
confirma: `apps/web/src/app/cuenta/AccountSecurity.tsx:336-339` es un enlace
literal a `/forgot-password` bajo el rótulo «Cambiar mi contraseña».

**Por qué duele:**
1. **Prueba de posesión, no de conocimiento.** Quien controla el buzón cambia
   la contraseña; el dueño legítimo que conoce la actual no puede.
2. Sospechar que alguien te vio teclear la contraseña obliga a un viaje al
   correo, en el peor momento.
3. Sin `password/change` no hay **reautenticación reciente** que ofrecer a las
   operaciones sensibles (H-4).

**Severidad:** alta. **Esfuerzo:** horas.

**Cómo se construye:** `POST /v1/auth/password/change {currentPassword,
newPassword}` con `@Public()` + `current(req)` + `csrf()` como el resto del
controller; verifica con `verifyArgon2idPassword` contra `DUMMY_PASSWORD_HASH`
si no hay credencial (mismo coste temporal); dentro de una transacción actualiza
`Credential`, revoca todas las sesiones **salvo la actual**, escribe
`identity.password_changed` y encola el correo de aviso por el outbox. Techo
`limit('password-change.account', [userId], 5)`.

**Cómo se verifica:** spec: contraseña actual mala → 401 sin cambiar nada; buena
→ 200, la sesión actual sigue viva, una segunda sesión del mismo usuario recibe
401 en la siguiente petición.

### H-4 · Alta del segundo factor sin contraseña, y sin reautenticación reciente

**AutoCAD:** activar MFA en Autodesk Account exige reautenticarse.

**Valle hoy:** `identity.controller.ts:536-570`. `mfa/setup` y `mfa/activate`
sólo piden sesión + CSRF. Está en el backlog como **P1-F5** con el escenario ya
escrito. Lo que el backlog no dice y esta auditoría añade: **la página pública
afirma lo contrario** (ver D-1).

Falta además el concepto general del que P1-F5 es un caso: **no existe la
reautenticación reciente**. Nada en el árbol guarda «este usuario demostró su
contraseña hace menos de N minutos»; cada operación sensible pide la contraseña
otra vez o no la pide.

**Severidad:** alta. **Esfuerzo:** medio día (P1-F5) + medio día (el mecanismo).

**Cómo se construye:** columna `Session.passwordConfirmedAt`; un guard
`@RequireRecentAuth(600_000)` que responde `403 {code:'reauth_required'}` si el
sello es viejo; `POST /v1/auth/reauth {password}` que lo actualiza. Entonces las
seis operaciones sensibles (alta/baja de MFA, regenerar respaldos, cambio de
contraseña, expulsar a un miembro, borrar la cuenta) llevan el mismo decorador
en vez de seis comprobaciones distintas. Actualizar `/seguridad` **después**, no
antes.

**Cómo se verifica:** spec por operación: con sello fresco pasa, con sello
caducado 403 `reauth_required`; y un test que enumere las rutas marcadas y falle
si alguna de las seis pierde el decorador.

### H-5 · Los permisos son de organización entera; no hay proyecto ni carpeta

**AutoCAD:** Autodesk Docs da permisos por proyecto y por carpeta, con cinco
niveles (ver / ver+descargar / subir / editar / control total), heredables.

**Valle hoy:** el modelo tiene exactamente dos ejes: el inquilino
(`organization.id`) y el rol (`owner`/`admin`/`member`/`viewer` →
`organization-permissions.ts`). **No hay ninguna columna de ACL, visibilidad o
compartición en las entidades CAD**: revisadas
`apps/api/src/modules/cad-documents/entities/*.entity.ts`, sólo aparece
`created_by` heredado de `TenantBaseEntity`, y su único uso funcional es
autorizar el descarte del documento provisional
(`cad-documents.repository.ts:294-298`). `mutationScope()` filtra por
`{id, tenant_id, deleted_at}` y nada más.

**Flujo real:** despacho de doce personas. El proyecto de un cliente en litigio
sólo debería verlo el socio y dos arquitectos. Hoy, si están en la
organización, lo ven los doce. La única salida es crear una organización aparte
por proyecto, lo que multiplica la facturación y rompe el conmutador de
organización activa.

**Severidad:** alta. **Esfuerzo:** varios días.

**Cómo se construye (mínimo honesto, no el modelo completo de Docs):**
`cad_projects` ya existe (`entities/cad-project.entity.ts`). Añadir
`cad_project_members (project_id, user_id, level: 'view'|'edit', tenant_id)` con
la regla: **un proyecto sin filas de miembro es visible para toda la
organización** (compatibilidad hacia atrás, migración aditiva, ADR-0011); un
proyecto con al menos una fila es privado a esa lista más los `owner`. La
comprobación entra en `CadDocumentsRepository.getDocument()`, que es la única
puerta de lectura, y en `mutationScope()`. Comando de interfaz: casilla
«Restringir este proyecto» en la ficha del proyecto.

**Cómo se verifica:** `.pg.spec.ts` que extiende el barrido programático de
`cad-tenant-isolation.pg.spec.ts` a un tercer actor: mismo inquilino, sin fila
en el proyecto restringido, 404 en las rutas de documento de ese proyecto.

### H-6 · No hay borrado de cuenta, exportación de datos ni derechos ARCO

**AutoCAD:** Autodesk publica su aviso de privacidad, su lista de
subencargados, su DPA, el portal de derechos del interesado, y borra la cuenta
a petición.

**Valle hoy:** `grep -rn "deleteAccount\|account/delete\|gdpr\|rgpd\|ARCO\|
data-export"` sobre `apps/api/src` y `apps/web/src`: **cero resultados**. Existe
el registro versionado de documentos legales
(`apps/api/src/modules/legal/legal-documents.ts`, muy bien hecho) pero su propia
cabecera declara que **las páginas `/terms` y `/privacy` no lo consumen** y que
ningún flujo del web pide la aceptación. `docs/legal/CHECKLIST_PENDIENTES_LEGALES.md`
lo confirma fila por fila: aviso de privacidad LFPDPPP en plantilla, responsable
sin RFC, «medio para ejercer derechos ARCO» pendiente, plazo de conservación
pendiente, y ninguna pantalla llama a `GET /v1/legal/documents`.

**Flujo real:** el despacho es responsable de los datos personales que aparecen
en los planos y en el cajetín. Su cliente le pide ejercer sus derechos ARCO. El
despacho pide a Valle borrar/exportar. No hay a quién ni cómo, y el aviso de
privacidad que debería decirlo es una plantilla sin rellenar.

**Severidad:** alta (bloqueante para vender a cualquier cliente institucional o
europeo). **Esfuerzo:** varios días, más una decisión no técnica.

**Cómo se construye:** `POST /v1/auth/account/delete` con reautenticación
reciente (H-4) y ventana de gracia de 30 días: marca `User.deletionRequestedAt`,
revoca todas las sesiones, y un job del outbox al vencer la ventana anonimiza
`email`/`displayName`, borra credenciales, factores, respaldos, tokens y
membresías, y **conserva** los documentos de la organización (son del despacho,
no de la persona) reasignando `created_by` a un centinela. Un
`GET /v1/auth/account/export` que produzca un ZIP con sus sucesos de identidad,
sus membresías y los DXF de los documentos que creó — el mismo camino de
exportación que ya existe. Conectar `/privacy` y `/terms` a
`GET /v1/legal/documents` y exigir la aceptación en el registro.

**Cómo se verifica:** `.pg.spec.ts`: tras el borrado, el correo ya no existe,
`login` responde igual que para una cuenta inexistente, y los documentos de la
organización siguen abriéndose para el resto del equipo.

### H-7 · No hay SSO empresarial

**AutoCAD:** SSO SAML/OIDC con el directorio del cliente, aprovisionamiento
SCIM, y por tanto **baja automática** cuando IT desactiva la cuenta en el
directorio. Es la respuesta industrial a H-1.

**Valle hoy:** `AuthModule` está vacío de proveedores; 19 rutas `/v1/auth` y
ninguna federada; ni botón, ni bandera, ni dependencia. `BACKLOG.md` P1-F3 lo
documenta con precisión, incluida la decisión de titular que lo bloquea (qué
hacer cuando el correo del proveedor coincide con una cuenta de contraseña ya
verificada).

**Severidad:** media hoy (bloqueante para vender a una constructora de 200
personas). **Esfuerzo:** semanas — es una campaña, como dice el backlog.

**Cómo se construye:** el orden correcto es SSO **después** de H-1 y H-4, no
antes: sin expulsión de miembros ni reautenticación, el SSO añade un segundo
camino de autenticación con menos defensas que el primero, que es exactamente
lo que el backlog razona para no hacerlo a medias.

**Cómo se verifica:** suite contra los dos proveedores reales, con las cinco
decisiones (fusión, verificación heredada, revocación, desconfirmación, MFA
duplicado) probadas una a una.

### H-8 · La CSP del editor permite `unsafe-inline` y `connect-src *`

**AutoCAD:** no aplica (aplicación de escritorio), pero el equivalente sí:
AutoCAD tiene `SECURELOAD` y `TRUSTEDPATHS` para acotar qué código se ejecuta.

**Valle hoy:** `apps/web/next.config.ts:34-46`

```
script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'
connect-src *
```

El comentario justifica cada permiso con honestidad. Y las dos decisiones tienen
coste real:

- `'unsafe-inline'` significa que **cualquier** sink de XSS futuro es
  ejecutable. Hoy el árbol está limpio (sección 1.7), pero la CSP existe
  precisamente para el día en que no lo esté.
- `connect-src *` significa que un script inyectado puede **exfiltrar el plano
  entero a cualquier host**. La justificación («la API vive en otro origen
  configurable») es cierta y tiene arreglo: `NEXT_PUBLIC_API_URL` ya se inlinea
  en el build (`apps/web/Dockerfile`), así que el origen de la API es conocido
  en tiempo de build.

**Severidad:** media. **Esfuerzo:** un día.

**Cómo se construye:** (a) `connect-src 'self' ${new URL(process.env.NEXT_PUBLIC_API_URL).origin} blob: data:`
computado en `next.config.ts` — el mismo sitio donde ya se lee la variable, sin
romper builds reutilizados si se acepta una lista separada por comas; (b) para
`script-src`, nonce por petición desde `middleware.ts` (Next 16 lo soporta para
rutas dinámicas) y dejar `'unsafe-inline'` sólo como fallback de las rutas
estáticas, documentando cuáles; (c) añadir `upgrade-insecure-requests` y
`Cross-Origin-Opener-Policy: same-origin`.

**Cómo se verifica:** un spec que levante `next start`, haga `curl -I` y afirme
la cabecera exacta; más una prueba de navegador que compruebe que un
`fetch('https://ejemplo-externo.invalid')` desde la página es bloqueado.

### H-9 · Los planos viven siete días en el navegador, y cerrar sesión no los borra

**AutoCAD:** los archivos de recuperación (`.sv$`, `.bak`) viven en el disco del
usuario, bajo su perfil de Windows, protegidos por la sesión del sistema
operativo.

**Valle hoy:** `apps/web/src/lib/cad/cad-recovery.ts` guarda checkpoints del
`CadDocument` **completo** en IndexedDB (`cad-recovery`, store `journal`), con
retención de siete días (`cad-recovery-journal.ts:30`,
`MAX_RECOVERY_AGE_MS = 7 * 24 * 60 * 60 * 1000`). Además,
`Layout3DEditor.tsx:1791, 1813, 2090` guarda historial de comandos, marcadores
de vista y preferencias en `localStorage`.

Las claves se namespacan por `tenantId`/`userId`, pero **el almacenamiento es
por origen del navegador, no por usuario**. Y el cierre de sesión no borra nada:
`apps/web/src/contexts/DesignAuthContext.tsx:67-73` llama al endpoint y hace
`setSession(null)`; `grep -rn "localStorage.removeItem\|localStorage.clear"`
sobre `apps/web/src` devuelve **una** ocurrencia, y es la migración de la clave
de tema.

**Flujo real:** ordenador compartido en el despacho (el del plotter, el de
recepción). El socio revisa el plano del cliente en litigio y cierra sesión. El
becario entra en el mismo navegador y, con la consola abierta o simplemente
inspeccionando `Application → IndexedDB`, tiene el documento entero durante una
semana.

**Severidad:** media. **Esfuerzo:** horas.

**Cómo se construye:** en `logout` del `DesignAuthContext`, y también al
detectar en `refresh()` que el `userId` cambió: `indexedDB.deleteDatabase('cad-recovery')`
y barrido de las claves de `localStorage` cuyo prefijo lleve el `tenantId`/`userId`
anterior. Ofrecer además una casilla «este ordenador es compartido» en el login
que desactive por completo el journal de recuperación para esa sesión (y lo
diga: sin recuperación tras un cierre inesperado).

**Cómo se verifica:** Playwright: sesión A dibuja, cierra sesión, sesión B entra
en el mismo contexto de navegador y `indexedDB.databases()` no contiene
`cad-recovery`, ni `localStorage` claves del tenant A.

### H-10 · El cifrado en reposo depende del proveedor y de que el operador se acuerde

**AutoCAD:** Autodesk declara cifrado AES-256 en reposo y TLS en tránsito, con
SOC 2 Tipo II e ISO 27001 auditadas por un tercero.

**Valle hoy:**
- **Blobs en S3:** `apps/api/src/modules/blob-store/s3-blob.store.ts` **no emite
  nunca** `x-amz-server-side-encryption` (`grep -n "sse\|ServerSideEncryption\|
  x-amz-server-side\|kms"` → cero). El cifrado depende enteramente del default
  del bucket, que ninguna prueba ni ningún gate comprueba.
- **Respaldos:** `scripts/ops/backup.mjs` produce `.dump`, `.sha256`,
  `.contents` y `.manifest.json` **en claro**. `docs/guides/backup-restore.md:180-182`
  dice «Cifra backup, checksum e inventario; contienen hashes de credenciales,
  sesiones, PII, tokens pendientes y planos de clientes» — es una instrucción en
  prosa, no un paso del script.
- **TLS a PostgreSQL:** bien resuelto. `orm.options.ts:107-115` valida el
  certificado por defecto en producción y la válvula de escape
  (`DB_SSL_STRICT=false`) es explícita y queda escrita en la configuración.
- **Sin certificaciones ni DPA:** no hay SOC 2, ISO 27001, lista de
  subencargados, ni acuerdo de tratamiento de datos. Para un cliente
  institucional eso es un «no» automático.

**Severidad:** media. **Esfuerzo:** horas para lo técnico; meses para lo
certificable.

**Cómo se construye:** (a) añadir la cabecera `x-amz-server-side-encryption:
AES256` (o `aws:kms` con `x-amz-server-side-encryption-aws-kms-key-id`) a cada
`PUT` de `s3-blob.store.ts`, y una comprobación de arranque que haga `HEAD` a un
objeto conocido y avise si vuelve sin cifrado; (b) `--encrypt` en `backup.mjs`
que envuelva el `.dump` con `age` o `gpg --symmetric` y **falle** si no se le
pasa clave en producción, con `restore-verify.mjs` descifrando; (c) una página
`/seguridad/subencargados` con la lista real (proveedor de correo, pasarela de
pago, PaaS, almacenamiento), que es la mitad de un DPA y cuesta una tarde.

**Cómo se verifica:** el spec de arranque productivo
(`scripts/deploy/production-startup-smoke.mjs`) comprueba que un `PUT` de prueba
vuelve con `ServerSideEncryption`; y `backup.mjs --encrypt` sin clave termina en
código distinto de cero.

### H-11 · Sesiones de 30 días sin caducidad por inactividad ni límite por dispositivo

**AutoCAD:** los tokens de Autodesk Identity caducan y se refrescan; una
política empresarial puede forzar reautenticación.

**Valle hoy:** `identity.service.ts:265`, `expiresAt = now + 30 días`, absoluto.
`authenticate()` (líneas 274-299) no toca `lastUsedAt`, no desliza la ventana y
no vuelve a comprobar nada más que revocación y caducidad. La cookie lleva
`maxAge` de 30 días (`identity.controller.ts:300`). `listSessions` corta en 100.

Consecuencia: una cookie robada vale **treinta días** salvo que el dueño se dé
cuenta y la revoque desde `/cuenta`. Y como no hay `password/change` (H-3), la
única revocación masiva es el flujo de correo.

Mérito: la pantalla de sesiones **sí existe y está bien**
(`AccountSecurity.tsx`), con dispositivo aproximado, revocación individual y
«cerrar las demás». Y hay aviso por correo de inicio de sesión nuevo
(`identity.service.ts:537-555`), que es más de lo que hacen muchos.

**Severidad:** media. **Esfuerzo:** horas.

**Cómo se construye:** columna `Session.lastSeenAt`, actualizada como mucho una
vez por minuto (comparación en memoria antes del `UPDATE`, para no escribir en
cada petición); `authenticate()` rechaza si `now - lastSeenAt > IDLE_TTL`
(configurable, 14 días por defecto para no molestar al dibujante que vuelve tras
vacaciones, 8 horas si el operador lo endurece). Techo de sesiones vivas por
usuario (p. ej. 10) revocando la más antigua.

**Cómo se verifica:** spec con reloj falso: sesión sin uso más allá del umbral
→ 401; sesión usada cada día → sigue viva hasta el absoluto de 30 días.

### H-12 · Nada impide una contraseña débil ni una filtrada

**AutoCAD:** Autodesk exige complejidad y comprueba contra listas de
contraseñas comprometidas.

**Valle hoy:** el servidor sólo valida longitud 12-128
(`identity-security.ts:97-106`, `LoginDto`/`RegisterDto`). `123456789012` se
acepta. El medidor de entropía del cliente
(`apps/web/src/lib/password-strength.ts`) es **excelente** —estima bits, castiga
secuencias, repeticiones y sustituciones obvias, y su cabecera explica por qué
no cuenta clases de caracteres— pero es **puramente informativo**: se usa en
`PasswordField.tsx` para pintar una barra y no bloquea el envío.

Y ese medidor **no está en `/reset-password`** (backlog P1-F1), es decir, falta
justo en la pantalla donde alguien elige contraseña después de haber olvidado la
anterior.

**Severidad:** media. **Esfuerzo:** horas.

**Cómo se construye:** mover `assessPassword` a `packages/contracts` (es puro,
sin DOM) y llamarlo también en el servidor: rechazar con
`400 {code:'password_too_weak', bits, minimo}` por debajo de un umbral
declarado. Añadir comprobación k-anonymity contra HIBP
(`GET https://api.pwnedpasswords.com/range/<primeros 5 del SHA-1>`) **desde el
servidor**, con timeout corto y **fallo abierto** (si HIBP no responde, no se
bloquea el registro: la disponibilidad de un tercero no puede impedir darse de
alta). Y arreglar P1-F1 de paso.

**Cómo se verifica:** spec del servidor: `'123456789012'` → 400
`password_too_weak`; una contraseña de 60 bits → 202. Y un doble de HIBP que
devuelva 500 no impide el alta.

### H-13 · La superficie protegida por el barrido programático es sólo `/v1/cad`

**Valle hoy:** `cad-tenant-isolation.pg.spec.ts:408` filtra
`routes.filter(r => r.path.startsWith('/v1/cad'))`. Es una defensa magnífica y
está acotada a un prefijo. Fuera quedan `/v1/organizations`, `/v1/calls`,
`/v1/feedback`, `/v1/support`, `/v1/commercial`, `/v1/legal`.

Y hay un segundo eje sin barrer: **el rol**. El barrido usa un actor «sin
entitlement»; no hay ninguno que use un actor `viewer` y exija 403 en todas las
rutas de escritura. La cobertura de rol hoy es un único caso a mano
(`cad.controller.spec.ts:113`, «un viewer no puede escribir aunque falsifique
headers»).

Esto importa porque `PermissionsGuard:95` devuelve `true` cuando no hay
`@RequirePermissions`: el default es **abierto**. Dentro de `/v1/cad` el barrido
lo compensa; fuera, no hay red.

**Severidad:** media. **Esfuerzo:** un día.

**Cómo se construye:** extraer el barrido a un helper
(`common/testing/route-sweep.ts`) y escribir dos specs nuevas: (1) toda ruta
`/v1/*` que no esté en una lista blanca declarada de rutas públicas responde
401 sin sesión; (2) toda ruta mutante (`POST|PUT|PATCH|DELETE`) responde 403 a
un actor con rol `viewer`. Ambas con el mismo guardarraíl de sanidad
(`expect(routes.length).toBeGreaterThanOrEqual(N)`) que ya usa el barrido
actual, para que no se vuelvan verdes barriendo cero.

### H-14 · La confianza en el proxy es un supuesto del operador que nada verifica

**Valle hoy:** `main.ts:69`, `app.getHttpAdapter().getInstance().set('trust proxy', 1)`.
`DEPLOYMENT.md` §5 lo declara correctamente («TLS termina en un proxy confiable
que sobrescribe `X-Forwarded-Proto` y `X-Forwarded-For`»).

Si ese supuesto se rompe —el contenedor queda alcanzable directamente, o alguien
mete un segundo proxy— entonces `X-Forwarded-For` lo escribe el atacante:
`req.ip` pasa a ser arbitrario y **todos los techos por IP dejan de existir**
(`login.ip` 40/min, `register.ip`, `password-forgot.ip`…). Y `req.secure` pasa a
ser controlable, lo que afecta a la emisión de la cookie.

Nada en el arranque lo comprueba. Está bien documentado y no verificado, que es
la peor combinación: se cumple hasta el día que alguien mueve el despliegue.

Segundo supuesto sin verificar, éste ni siquiera documentado: la cookie es
`SameSite=Lax` y el web llama a la API con `credentials: 'include'` **desde otro
origen**. Eso sólo funciona si web y API comparten **dominio registrable**
(`app.valledesign.com` / `api.valledesign.com`). Si el operador deja la API en
un `*.up.railway.app` y el web en el dominio propio, el navegador no manda la
cookie y la autenticación se cae entera — y el arreglo que todo el mundo busca
en Stack Overflow es `SameSite=None`, que reabre la superficie CSRF que
`assertCsrf` está cerrando. `DEPLOYMENT.md` §5 no lo menciona.

**Severidad:** baja-media. **Esfuerzo:** horas.

**Cómo se construye:** una comprobación de arranque en producción que (a) exija
`TRUSTED_PROXY_HOPS` explícito y lo use en lugar del `1` fijo; (b) compare el
dominio registrable de cada `ALLOWED_ORIGIN` con el del propio servicio y
**falle el arranque** si no coinciden, con el mensaje que explica por qué
(`SameSite=Lax` + `credentials:'include'`). Es el mismo patrón que ya usan
`assertIdentitySecurityConfiguration` y `assertMfaConfiguration`.

### H-15 · Los códigos de respaldo se guardan con SHA-256 sin sal ni clave

**Valle hoy:** `identity-mfa.ts:293-295`

```ts
export function hashBackupCode(code: string): string {
  return createHash('sha256').update(normalizeBackupCode(code)).digest('hex');
}
```

Los códigos tienen ~49 bits (`generateBackupCode`, alfabeto de 31 símbolos, 10
posiciones) y son de un solo uso, así que no es una emergencia. Pero el hash es
**sin sal**: con un volcado de `identity_backup_codes`, un atacante precomputa
una vez y contrasta contra **todos** los usuarios a la vez. El repositorio ya
tiene la pieza que lo arregla y no la usa aquí:
`IDENTITY_MFA_ENCRYPTION_KEY`.

**Severidad:** baja. **Esfuerzo:** horas.

**Cómo se construye:** `createHmac('sha256', mfaKey()).update(normalized)` en
lugar de `createHash`, con prefijo de versión en la columna (`v2:<hex>`) y
verificación que acepte `v1` (SHA-256 pelado) mientras queden filas antiguas —
la misma disciplina de versionado que `encryptMfaSecret` ya aplica al secreto
TOTP. Migración aditiva, sin invalidar códigos existentes.

**Cómo se verifica:** spec que confirma que un código emitido bajo `v1` sigue
canjeándose y que uno nuevo se guarda como `v2`.

---

## 4 · Dónde Valle está MEJOR que AutoCAD

Hay que decirlo porque es la parte comercializable.

1. **No hay macros ejecutables que lleguen dentro de un plano.** AutoCAD carga
   automáticamente `acad.lsp` y `acaddoc.lsp` desde el directorio del dibujo, y
   `ObjectARX` es código nativo con acceso completo a la máquina. El «virus de
   CAD» es un fenómeno de veinte años. En Valle, el intérprete AutoLISP
   (`apps/web/src/lib/lisp/`) es un evaluador escrito a mano: no hay `eval`, no
   hay `new Function`, no hay sistema de ficheros, no hay red, y cada ejecución
   gasta de un presupuesto (`LispMeter`). Los plugins JS declaran cuatro
   permisos que **se hacen cumplir** (`plugins/permissions.ts`) y la escritura
   sólo sale por `host.apply`. **AutoCAD estructuralmente no puede prometer
   esto.**
2. **No hay instalación.** Ni administrador local, ni DLL en el sistema, ni
   parche mensual que IT tenga que desplegar en cuarenta puestos. La superficie
   de ataque del puesto de trabajo es un navegador actualizado.
3. **El aislamiento entre organizaciones está probado sobre el router real y
   PostgreSQL real, en CI.** Autodesk no publica un artefacto equivalente; aquí
   un comprador puede leer el fichero.
4. **Los límites se declaran.** `docs/legal/CHECKLIST_PENDIENTES_LEGALES.md`
   dice, fila por fila, qué falta para operar legalmente. Es incómodo y es
   exactamente lo que un comprador quiere ver. `/seguridad` sería el mejor
   ejemplo de esta cultura si no tuviera la afirmación de D-1.

---

## 5 · La apuesta ganadora

**«El plano que no puede infectarte»: garantía verificable de ejecución cero.**

No es una función nueva: es hacer visible, medible y firmable algo que Valle ya
hace por construcción y que AutoCAD no puede hacer.

Todo despacho que lleva años trabajando ha recibido un DWG de un cliente con un
`acaddoc.lsp` dentro. Es la razón por la que existen `SECURELOAD`,
`TRUSTEDPATHS` y una industria de limpiadores de CAD. Y todas esas defensas de
AutoCAD comparten un defecto fatal: **se pueden apagar**, y el usuario que tiene
prisa las apaga.

La propuesta, concreta:

1. **Certificado de ejecución cero por archivo.** Cada importación emite un
   asiento firmado —el mismo HMAC del outbox
   (`modules/commercial/outbox-signature.ts`)— con el SHA-256 del archivo
   recibido, la lista de secciones interpretadas, la lista de **secciones
   ignoradas por contener código o macros**, y la afirmación «no se ejecutó
   ningún byte de este archivo». Se guarda en `design_audit_log` y se puede
   descargar como PDF de una página.
2. **El manifiesto de pérdidas ya existe** (`integrity.no-silent-loss` en la
   rúbrica, `host-requests.ts`, `dxf-export-losses.spec.ts`). Esto es su
   hermano: **manifiesto de amenazas**. La misma máquina, distinto eje.
3. **Un panel «Procedencia» en el editor** que, para el dibujo abierto, diga:
   de dónde vino, quién lo subió, qué se ignoró, y quién lo ha abierto desde
   entonces (que es H-2 convertido en función visible en vez de en tabla).
4. **La promesa que no se puede apagar**, y decirlo con esas palabras: no hay
   `SECURELOAD 0` en Valle Design porque no hay carga que asegurar.

Por qué gana y no sólo empata:

- **Convierte una limitación en una ventaja.** «No ejecutamos AutoLISP nativo»
  suena a carencia; «tu plano no puede infectarte, y aquí está el certificado»
  es una razón de compra.
- **Es la única afirmación de seguridad que un dibujante entiende sin traducción.**
  Argon2id no vende. «El DWG del cliente no te va a meter un virus» vende, y lo
  cuenta él mismo en la comida del colegio de arquitectos.
- **Es barata**: el asiento firmado, el registro y el panel son días, no meses,
  porque el outbox firmado, la bitácora y el manifiesto de pérdidas ya están
  construidos.
- **Encaja con la cultura de la casa**: es una afirmación con evidencia,
  verificable por un tercero, y se cae sola si deja de ser cierta.

Y una condición para poder decirla: **primero hay que arreglar D-1 y H-1**. Una
página de seguridad que afirma algo que el código niega, en un producto donde no
se puede expulsar a un empleado, no puede permitirse hacer una promesa de
seguridad nueva. El orden es: cerrar el ciclo de vida del usuario, poner un gate
de veracidad sobre las afirmaciones de seguridad, y **entonces** hacer la
apuesta.

---

## 6 · Orden de trabajo recomendado

| # | Trabajo | Severidad | Esfuerzo |
| --- | --- | --- | --- |
| 1 | H-1 · Expulsar y degradar miembros, revocando sesiones en la misma transacción | bloqueante | 1 día |
| 2 | D-1 · Corregir `/seguridad` y añadir el gate de veracidad de sus afirmaciones | alta | horas |
| 3 | H-3 + H-4 · Cambio de contraseña en sesión y reautenticación reciente (cierra P1-F5) | alta | 1 día |
| 4 | D-2 · Lista de parámetros Argon2id aceptados + rehash-on-login | alta | medio día |
| 5 | H-2 · Bitácora visible para el cliente | alta | 1 día |
| 6 | D-3 · Que el techo de login no se convierta en bloqueo de cuenta | alta | horas |
| 7 | D-5 · `npm audit fix` y bajar el gate a `moderate` | media | horas |
| 8 | H-9 · Purgar IndexedDB y `localStorage` al cerrar sesión | media | horas |
| 9 | H-10 · SSE en S3 y `--encrypt` en el respaldo | media | horas |
| 10 | D-4, D-6, H-11, H-12, H-13, H-14, H-15 | media/baja | 2-3 días |
| 11 | H-5 · Permisos por proyecto | alta | varios días |
| 12 | H-6 · Borrado de cuenta, exportación y ARCO | alta | varios días + decisión |
| 13 | **Añadir un grupo `seguridad` a `rubric.json`** con estas filas y su evidencia | — | horas |
| 14 | La apuesta: certificado de ejecución cero | — | días |

La fila 13 es la que hace que las demás no se vuelvan a perder: mientras la
seguridad esté fuera de la rúbrica, seguirá siendo la dimensión donde el motor
es excelente y el producto está vacío.
