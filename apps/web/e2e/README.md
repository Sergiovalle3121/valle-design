# Goldens y modo de interfaz (Esencial / Pro)

Desde la Tanda 1 «Modo Esencial» (22-sep-2026) el estudio arranca en **Esencial**
para `/demo` y para una cuenta que nunca abrió el estudio en ese navegador, y en
**Pro** para quien ya lo abrió. Cómo lo ven los specs:

- Todo golden que llama a `loginAsStandaloneOwner` (fixtures/standalone-identity.ts)
  arranca en **Pro**: la fixture siembra `valle:cad:ui-mode:v1:<OWNER_USER_ID>`
  antes de la primera navegación. Ninguna aserción de esos goldens cambió.
- Los specs que abren `/demo` y miden la interfaz completa usan `/demo?cadUi=pro`.
  `?cadUi=pro|esencial` gana a la preferencia y **no se persiste**; sirve para
  arrancar cualquier golden en el modo que necesite.
- Los goldens del propio modo Esencial (227–231) abren `/demo` sin parámetro con
  contexto limpio: es exactamente lo que verá una visita nueva a vallecad.com/demo.
- `scripts/cad/essential-mode-evidence.mjs --check` (dentro de `check:cad`) deja
  escrito que la barra esencial tiene doce herramientas del registro y que Ctrl+K
  sigue alcanzando cada comando; `ui-command-reach.json` (alcance de la cinta en
  Pro) no se toca.
