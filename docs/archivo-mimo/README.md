# Archivo de MiMo (13 al 19 de septiembre de 2026)

MiMo Code trabajó en VALLECAD del 13 al 19 de septiembre de 2026, en la rama
`claude/noche-mimo-razones-para-pagar` (PR #209). La gobernaba un lanzador en
PowerShell y Claude supervisaba. El 19-sep se detuvo y su rama se integró en `main`. Esta
carpeta guarda lo que solo vivía en la laptop, para poder borrarla sin perder nada.

## Qué leer primero

1. **[AUDITORIA-MIMO-20260919.md](AUDITORIA-MIMO-20260919.md)**. Cuánto avanzó de verdad cada
   frente (comandos, 3D, cinta y UX, calidad y los 7 toolsets), con cifras medidas, defectos,
   verificación escéptica y parches propuestos para los fallos de uso más graves. Es el punto de
   partida para quien siga.
2. **[cola/cola-vallecad.md](cola/cola-vallecad.md)**. El índice de trabajo que MiMo leía en cada vuelta.
3. **[cola/MISION-48H.md](cola/MISION-48H.md)** y **[cola/bloqueos-actuales.md](cola/bloqueos-actuales.md)**.
   Las últimas órdenes del supervisor y los bloqueos abiertos.

## Contenido

| Carpeta | Qué es |
|---|---|
| `cola/` | La carpeta `.mimocode/` del repo, que estaba en `.gitignore`: cola, campañas (`CAMPANA-*.md`), 109 tareas en `tareas/`, inventario del código en `inventario/`, hoja de ruta frente a AutoCAD, revisiones de Claude y el recorrido de la casa de prueba (`recorrido-casa/`). |
| `lanzador/` | Los scripts de `D:\dev\_mimo` que sostenían a MiMo: `noche-mimo.ps1` (vigilancia, candados locales, push, PR y auto-merge), `specs-afectados.mjs` y demás, más el resumen del lanzador. |
| `parches/` | Trabajo que no llegó a ninguna rama: un stash de MiMo del 16-sep (textos DWG antes de T9) y el trabajo sin commitear de los frentes `vc-correo` (pantalla «Revisa tu correo») y `vc-demo3d` (presentación de vanos y extensión del documento). Nada de esto está probado. |

Los scripts y el código van con sufijo `.txt` para que ninguna herramienta del repo (lint,
typecheck, gates) los tome por código vivo. Para reutilizarlos, quita el sufijo.

## Lecciones que conviene no repetir

- **Un agente que construye infla sus cifras si nadie lo audita.** El 17-sep, de 62 comandos
  nuevos, 57 eran relleno. El 19-sep, de una muestra al azar de 12 comandos nuevos, 8 eran relleno.
  Mide siempre con la sonda (`apps/web/scripts/command-integrity-probe.mts`) y con specs que
  comprueben la geometría. No te fíes de los mensajes de commit.
- **Una rama gigante no entra.** La #209 llegó a 464 commits y pasó días en rojo porque cada vuelta
  añadía un comando que rompía algo. Lo que sí llegó a producción fueron PRs chicas desde `main`.
- **Los candados locales tienen que correr sobre el commit exacto que se sube**, no sobre el árbol de
  trabajo con cambios sin commitear.
