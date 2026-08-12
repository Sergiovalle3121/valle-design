# Directiva del propietario para DWG-1

- Propietario y autorizante: Sergio Valle Zárate.
- Fecha de adopción: 2026-08-09.
- Alcance autorizado: diseñar y construir un reader y un writer DWG originales,
  first-party y clean-room para Valle Design.
- Objetivo de conformidad: una matriz v1 explícita para `AC1009`, `AC1012`,
  `AC1014`, `AC1015`, `AC1018`, `AC1021`, `AC1024`, `AC1027` y `AC1032`, en
  las direcciones de lectura y escritura y para cada propiedad registrada
  dentro de su familia.
- Disponibilidad: `productionAvailable:false` permanece obligatorio. Ninguna
  versión se habilita en el producto hasta que las nueve satisfagan sus gates de
  procedencia, seguridad, fidelidad, integración y revisión.
- Propiedad: la implementación de Valle se mantiene propietaria, `UNLICENSED` y
  no publicable como paquete. Esta directiva no concede derechos sobre formatos,
  marcas, implementaciones ni material de terceros.
- Clean-room: no se copian, traducen, portan ni adaptan codecs, SDKs, tablas,
  tests o documentación restringida. Ningún hecho técnico entra a código,
  tests, constantes o fixtures hasta quedar identificado, hasheado, autorizado
  y revisado en los registros del laboratorio.
- Corpus: los fixtures publicables se limitan a material sintético de Valle,
  material creado o poseído por Sergio con permiso expreso de redistribución,
  o material de terceros con términos permisivos explícitos. El corpus de
  conformidad no redistribuible vive en un repositorio compañero privado y sólo
  entra a CI mediante bundles inmutables, hasheados y de mínimo privilegio.
- Revisión: la promoción de facts, corpus o capacidades requiere revisión humana
  registrada. El segundo revisor y el corpus independiente siguen siendo
  prerequisitos externos para promover compatibilidad real.
- Dependencias: el núcleo conserva cero dependencias runtime de codecs ajenos.
  Tooling de desarrollo sólo entra con licencia permisiva, versión fijada,
  SBOM, inventario de licencias y revisión.

Esta directiva autoriza el programa de ingeniería; no afirma que el reader, el
writer, una versión, familia o propiedad ya estén implementados o sean
compatibles.
