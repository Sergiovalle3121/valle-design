# CAMPANA 3D — «el modelo dibuja los planos» (16-sep-2026, version final con escepticos)

Esta campana dura DIAS. Se recorre en este orden, una ficha por sesion, un commit por ficha.
Cada ficha vive en `.mimocode/tareas/Cxx.md`. Abre SOLO la que vas a hacer.

**La tesis:** en AutoCAD el 3D es un accesorio y los planos se dibujan a mano. En VALLECAD el modelo
DIBUJA los planos. Ya existe y esta verificado con sonda real: SOLVIEW + SOLDRAW producen trazos
VIS/HID/HAT desde solidos puros; el kernel tiene NURBS completas y 5 superficies analiticas
(`apps/web/src/lib/brep/nurbs.ts`); 3DMOVE/3DROTATE conservan traslacion; el PDF es vectorial y
exacto (2,8e-14 mm). Lo que falta esta en las fichas. Cada una fue revisada por un esceptico
independiente; 0 propuestas fueron refutadas y NO estan aqui.


## Frente: viewbase

- **C01** (una-sesion) Identidad estable de los trazos derivados
- **C02** (una-sesion) SOLDRAW deja de dibujar en silencio
- **C03** (una-sesion) SOLDRAW no reescribe la vista que no ha cambiado  ← Identidad estable de los trazos derivados
- **C04** (una-sesion) Trazar y publicar avisan de las vistas obsoletas
- **C05** (varias-sesiones) VIEWEDIT: cambiar una vista ya creada  ← Identidad estable de los trazos derivados
- **C06** (varias-sesiones) Los alzados se alinean con la planta en el papel
- **C07** (campana) Acotación automática de la planta derivada  ← Identidad estable de los trazos derivados

## Frente: entregable

- **C08** (una-sesion) El sólido 3D deja de desaparecer del DXF
- **C09** (una-sesion) La pérdida de las presentaciones en el DXF se declara SIEMPRE
- **C10** (una-sesion) STEP e IGES escriben la unidad del dibujo, no milímetros a pelo
- **C11** (una-sesion) Los caracteres que el PDF no sabe escribir se declaran
- **C12** (varias-sesiones) ETRANSMIT empaqueta lo que el cliente puede abrir
- **C13** (campana) El DXF escribe las presentaciones: LAYOUT, *Paper_Space y VIEWPORT  ← La pérdida de las presentaciones en el DXF se decl
- **C14** (una-sesion) Una cota heredada no se cae del DXF en silencio

## Frente: transformar-visualizar

- **C15** (una-sesion) Spec que conduce 3DMOVE y 3DROTATE de verdad
- **C16** (una-sesion) Iconos para los cinco comandos mudos
- **C17** (una-sesion) La cota del muro se lee y se escribe
- **C18** (una-sesion) 3DMOVE mueve muros en Z  ← La cota del muro se lee y se escribe
- **C19** (una-sesion) WALL nace a la cota del plano de trabajo
- **C20** (una-sesion) 3DMOVE y 3DROTATE dicen qué dejaron atrás  ← 3DMOVE mueve muros en Z
- **C21** (varias-sesiones) 3DALIGN: asentar un objeto sobre una cara  ← Spec que conduce 3DMOVE y 3DROTATE de verdad
- **C22** (varias-sesiones) Plano de corte vivo (SECTIONPLANE)
- **C23** (una-sesion) ROTATE3D resuelve a 3DROTATE
- **C24** (una-sesion) El ViewCube dice desde dónde miras

## Frente: confianza

- **C25** (una-sesion) Caché de sólidos: quitar el techo de 128 que tira el visor a 0,6 fps
- **C26** (una-sesion) Reanimar la prueba de guardar y reabrir un sólido con historial
- **C27** (una-sesion) Probar UNDO sobre una booleana con el historial de producción  ← Reanimar la prueba de guardar y reabrir un sólido 
- **C28** (una-sesion) Suite 3D en verification/: booleanas a escala de obra contra oráculo analítico
- **C29** (una-sesion) AUDIT cuenta los sólidos cuyo árbol no evalúa

## Frente: superficies-mallas

- **C30** (una-sesion) REVOLVE: facetar por tolerancia de cuerda, no con 32 fijo
- **C31** (una-sesion) Perfiles: el arco y el círculo con 64 lados fijos falsean superficies  ← REVOLVE: facetar por tolerancia de cuerda, no con 
- **C32** (una-sesion) Delaunay 2.5D en el kernel: el triangulador que el terreno necesita
- **C33** (varias-sesiones) TERRAIN: del levantamiento COGO al sólido de sitio que se corta  ← Delaunay 2.5D en el kernel: el triangulador que el


## CUANDO SE ACABE ESTA LISTA — NUNCA TE QUEDES SIN TRABAJO

1. Vuelve a `.mimocode/tareas/INDICE.md` (las 49 D) y cierra lo que quede abierto.
2. Despues, la tabla de cobertura 3D frente a AutoCAD (Superficies 0/14, Mallas 0/15, Render 1/13,
   Visualizacion 10/20, Transformar 3/8): elige UN comando que un ARQUITECTO use en su primer dia,
   implementalo con un spec que lo conduzca contra el motor real, y commitea. Uno por sesion.
   Prioridad: lo que sirve a plantas, cortes, alzados y entregables; nunca relleno mecanico.
3. Anota en la bitacora cada eleccion y por que. Nunca declares la mision terminada.
