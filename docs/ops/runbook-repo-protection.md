# Runbook: protección de repositorios (ejecución manual por Sergio)

Este runbook lo prepara la campaña de ingeniería pero **no lo ejecuta**: cambiar visibilidad de un repositorio,
rotar secretos o inventariar forks/clones son acciones que esta sesión no está autorizada a realizar por
automatización. Sergio (o quien tenga permisos de owner en GitHub) debe ejecutar cada paso manualmente.

## 1. Confirmar estado actual

```bash
gh repo view Sergiovalle3121/valle-design --json visibility,isPrivate
gh repo view Sergiovalle3121/valle-design-dwg-conformance --json visibility,isPrivate
```

`LICENSE`/`NOTICE` en ambos repos ya declaran "proprietary, closed-source, all rights reserved" — si `isPrivate` da
`false`, hay una divergencia entre la gobernanza declarada en el código y la visibilidad real en GitHub que debe
cerrarse cuanto antes.

## 2. Convertir a privado

En GitHub: Settings → General → Danger Zone → Change repository visibility → Private, para cada uno de los dos
repos. Confirmar con el nombre del repo cuando lo pida.

## 3. Preservar protecciones existentes

Antes y después del cambio de visibilidad, verificar que sigan intactas:
- Branch protection de `main` (reviews requeridos, checks requeridos, no force-push).
- CODEOWNERS si existe.
- Secret scanning y Dependabot alerts (en repos privados requieren plan pagado de GitHub para estar activos —
  confirmar que la cuenta lo tenga antes de asumir que siguen corriendo).

## 4. Rotar secretos históricos

Correr un escáner de secretos autorizado (ej. `gitleaks`, ya está en `D:\dev\tools` según la configuración local)
sobre el historial completo, no solo HEAD:

```bash
gitleaks detect --source . --log-opts="--all" --no-git
```

Cualquier hallazgo: rotar la credencial en el proveedor correspondiente (no basta con quitarla del código; el
historial de git la sigue teniendo). No pegar el valor del secreto en ningún reporte, log o chat — solo su
ubicación (archivo/commit) y confirmación de que ya fue rotado.

## 5. Inventariar superficie ya expuesta

Mientras el repo fue público, pudo haber sido clonado, forkeado, o indexado. Repos privados en GitHub **no
revocan** clones/forks que ya existen:

```bash
gh api repos/Sergiovalle3121/valle-design/forks
gh release list --repo Sergiovalle3121/valle-design
gh api repos/Sergiovalle3121/valle-design/packages 2>/dev/null
```

Asumir que cualquier fork o clon previo a la fecha de este runbook sigue teniendo el contenido público que existía
en ese momento — no hay forma de revocarlo retroactivamente, solo de rotar lo que haya de valor (secretos,
credenciales) y de tener presente esa exposición al decidir qué tan sensible es el contenido que se agregue de
ahora en adelante.

## 6. Fixtures de clientes / corpus DWG

Confirmar (no delegar a automatización) que ningún archivo de cliente real haya entrado al corpus DWG o a
fixtures de test mientras el repo era público. `CORPUS_POLICY.md` en `valle-design-dwg-conformance` ya prohíbe
esto por diseño (100% sintético hasta ahora, ver bitácora de campaña §3), pero conviene una revisión humana antes
de convertir a privado, no después, por si hay algo fuera del corpus versionado (ej. en un branch viejo o un
adjunto de PR).

## Estado

- [ ] Visibilidad confirmada como pública (pendiente que Sergio corra el paso 1).
- [ ] Convertidos a privados.
- [ ] Branch protection / CODEOWNERS verificados post-cambio.
- [ ] Escaneo de secretos corrido y rotaciones completadas.
- [ ] Forks/releases/packages inventariados.
- [ ] Revisión humana de fixtures previa al cambio de visibilidad.
