# Desplegar Valle Design en una tarde

Escrito 2026-08-27, campaña Paridad (OLA 3.1). No repite lo que ya
documentan `DEPLOYMENT.md` (imágenes, digests, orden de despliegue),
`RUNBOOK.md` (operación día a día) y `docs/ops/railway.md` (la plataforma
concreta hoy) — esos tres son la referencia completa y la que gana si algo
aquí discrepa. Esto es el CAMINO CONDENSADO para alguien que nunca lo ha
hecho: qué leer, en qué orden, y dónde para si algo no cuadra. Si un paso
de esta página no funciona como dice, ESO es un defecto — repórtalo,
igual que pide `PRIMER-DIA.md`.

## Antes de empezar: `npm run doctor`

```bash
npm run doctor
```

Corre en segundos, no toca nada (sólo lee). Confirma Node ≥22, que los
tres workspaces están instalados, si PostgreSQL declarado responde (o si
vas a usar SQLite — válido en desarrollo, NUNCA en producción, ver
abajo), que los puertos 3000/4000 están libres, si el espejo del corpus
DWG está configurado (opcional, no bloquea) y — en Windows — el aviso de
Control de aplicaciones que ya bloqueó builds a más de una persona. Un
`❌ FALTA` hay que resolverlo antes de seguir; un `⚠️ AVISO` es
informativo.

## El camino, en cuatro tramos

### 1 · Local, con Postgres real (30–45 min)

El primer día (`PRIMER-DIA.md`) arranca con SQLite porque es más rápido
para tocar código. Desplegar exige el camino real:

1. `cp .env.example .env` y completa `DATABASE_URL` apuntando a un
   PostgreSQL 16 real (local o un contenedor) — nunca despliegues sin
   esto, `SYNCHRONIZE` no es una opción en producción.
2. `npm run doctor` de nuevo: confirma que `DATABASE_URL` ahora sí
   responde.
3. `npm run build` (3–6 min) y `npm test` (4–8 min) — los mismos que
   corren en CI; si fallan aquí, fallarán allá.

### 2 · Imágenes, en tu máquina (15–20 min)

`DEPLOYMENT.md` tiene el detalle byte a byte (multi-stage, non-root,
dumb-init, digests). Aquí sólo el orden: construir las dos imágenes
(`apps/api/Dockerfile`, `apps/web/Dockerfile`) contra la RAÍZ del
monorepo como contexto de build —no contra `apps/api`/`apps/web`
sueltos, los Dockerfiles ya esperan ese contexto—, y correr
`npm run check:deploy` (`scripts/deploy/validate-dockerfiles.mjs`) antes
de subir nada: valida lo que `DEPLOYMENT.md` exige de cada imagen sin
necesidad de un registro remoto.

### 3 · La plataforma (variable — Railway hoy, 20–30 min si la cuenta ya existe)

`docs/ops/railway.md` es el mapa completo para la plataforma que este
proyecto usa hoy: dos servicios (`valle-api`, `valle-web`) apuntando al
mismo repositorio, un plugin PostgreSQL 16, migraciones en
`preDeployCommand` (fail-closed: si una migración falla, el despliegue
NO sigue adelante con un esquema a medias), y el outbox corriendo dentro
del proceso de la API sin servicio aparte. Si el destino es otra
plataforma, ese documento sigue siendo el punto de partida correcto —
la topología de dos servicios + Postgres + migraciones pre-deploy es
independiente de Railway específicamente, sólo el `railway.json` no
aplica.

### 4 · Después de encender: el runbook, no la memoria

`RUNBOOK.md` es la referencia para TODO lo que pasa después de que algo
ya está en producción — salud, rollback, incidentes. No lo memorices
antes de desplegar; señálalo desde donde sea que el equipo guarda "qué
hacer si algo se cae", para que la primera vez que haga falta no sea la
primera vez que alguien lo lee.

## Las dos trampas más caras

- **SQLite en producción.** El primer día lo usa a propósito porque es
  más rápido para editar código; en producción es una promesa que el
  producto no sostiene (sin pool de conexiones real, sin las garantías
  que `ormOptions()` exige). `npm run doctor` sólo avisa cuando
  `DATABASE_URL`/`DB_HOST` no responden — no impide desplegar sin ellos.
  Verifica a mano que `.env` de producción los tiene antes de la
  tarde de despliegue, no durante.
- **Root Directory mal apuntado en Railway.** Ambos servicios comparten
  repositorio; el «Root Directory» de la plataforma debe quedar en `/`
  (no en `apps/api` ni `apps/web`) porque las imágenes se construyen
  desde la raíz del monorepo. `docs/ops/railway.md` lo dice explícito
  porque ya causó un despliegue fallido antes de documentarse.

## Si algo no cuadra

En este orden: el mensaje del comando que falló (`npm run doctor`,
`check:deploy`, la migración) casi siempre dice qué arreglar; luego
`DEPLOYMENT.md`/`RUNBOOK.md`/`docs/ops/railway.md` para el detalle
completo; luego `docs/adr/` si la pregunta es "por qué está diseñado
así" y no "qué comando corro". Sergio Valle Zárate (`@Sergiovalle3121`)
es el titular único para lo que ninguno de esos responda.
