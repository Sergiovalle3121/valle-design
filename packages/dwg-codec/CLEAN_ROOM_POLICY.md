# Política clean-room del laboratorio DWG

## Propósito

Valle busca una implementación original que interopere con archivos, no
apropiarse del formato ni de la marca DWG. Esta política es una regla de
ingeniería y procedencia; no emite conclusiones jurídicas.

## Separación del trabajo

1. Antes de consultar una fuente para derivar trabajo, registra su metadata y
   términos en `SOURCE_REGISTER.json`.
2. Un revisor clasifica la fuente como `allowed`, `quarantined` o `prohibited`.
3. La persona o agente que implementa recibe sólo los hechos técnicos mínimos
   anotados de fuentes `allowed`; no recibe ni reproduce código, tablas,
   comentarios o tests externos.
4. Cada archivo derivado enlaza sus fuentes permitidas mediante el registro y
   cada PR declara fuentes, derivados, fixtures y dependencias.
5. Si aparece ambigüedad, se detiene esa línea de trabajo. No se conserva el
   material bloqueado dentro del repositorio.

En una sesión donde la misma persona investiga e implementa, la separación se
aplica por artefactos: primero se congela y revisa la entrada estructurada del
registro; después se implementa únicamente desde los hechos permitidos que esa
entrada enumera. Una revisión humana posterior sigue siendo necesaria antes de
promover una capacidad más allá de investigación experimental.

El contenido legacy DWG-0 se congela además mediante un manifest versionado de
path, SHA-256 y tamaño contra el commit `98a5b18`. Una modificación o path nuevo
requiere admisión exacta sin globs en un cambio previo de tooling y el fact
concreto que autoriza ese artefacto; el candidate no puede autoampliar su
admisión actualizando sólo registros de fuentes o facts.

## Fuentes permitidas

Una fuente sólo puede ser `allowed` cuando su propietario, origen exacto,
versión/fecha, términos de acceso/uso y hechos consultados están documentados y
esos términos permiten la actividad concreta. Ejemplos potenciales, sujetos a
revisión individual:

- decisiones y código first-party ya existentes en Valle;
- instrucciones escritas del propietario dentro de su autoridad;
- mediciones originales realizadas sobre fixtures autorizados;
- documentación pública cuyos términos permitan extraer los hechos técnicos
  mínimos registrados; y
- fixtures de terceros con permiso explícito de uso y redistribución.

Que una URL sea pública, gratuita o accesible sin login no basta. No se copia
prosa extensa ni tablas; se registra el hecho mínimo necesario y su origen.

## Material en cuarentena

`quarantined` significa que no se ha demostrado permiso suficiente o que falta
una revisión. Sólo se conserva metadata segura para identificar el bloqueo. No
se descarga, copia, commitea, transforma, resume en detalle ni usa para crear
código, tests, fixtures o constantes.

Resolver una cuarentena requiere actualizar el registro con evidencia de
términos y revisión. Nunca se cambia el estado sólo porque la implementación
parece útil o el material es común en Internet.

## Material prohibido

- Código, headers, bindings, tablas generadas, comentarios o tests de ODA SDK,
  RealDWG, Autodesk, LibreDWG u otra implementación, incluso traducidos,
  portados o adaptados.
- Binarios descompilados, material obtenido eludiendo protecciones,
  filtraciones, SDKs sin autorización o contenido con procedencia incierta.
- GPL, AGPL, LGPL, MPL, SSPL, BUSL, source-available, o material/codecs de
  terceros bajo licencias comerciales/restringidas, desconocidas,
  `NOASSERTION` o incompatibles con la política propietaria. El material
  first-party autorizado por el propietario conserva los términos del
  repositorio.
- Planos de clientes, ejemplos instalados con AutoCAD, archivos encontrados al
  azar, corpus privado, secretos, tokens, datos personales o confidenciales.

No se usa el nombre “TrustedDWG”, fingerprints o sellos ajenos, ni se afirma
certificación, afiliación, paridad o compatibilidad total.

## Dependencias

El núcleo parte con cero dependencias runtime. Una excepción permisiva requiere
justificación técnica, versión fijada, lockfile reproducible, inventario SBOM,
notices, revisión de transitivas y gate de licencias. La allowlist general del
monorepo no relaja esta política scoped.

## Fixtures

Los únicos fixtures publicables son sintéticos de Valle, creados por Sergio con
autorización expresa de publicación, mediciones originales autorizadas o de
terceros con licencia explícita de uso y redistribución. Cada uno debe completar
el intake de `CORPUS_INTAKE.md`, cumplir `fixtures/manifest.schema.json` y
verificar su SHA-256 contra los bytes versionados.

Cada fixture enlaza mediante `sourceIds` sólo entradas `allowed` del registro.
Los gates resuelven paths dentro de la raíz esperada, comparan tamaño/hash y
rechazan IDs, paths o hashes duplicados; estas relaciones entre archivos no se
delegan únicamente al JSON Schema. El conteo y tamaño actuales no son constantes
de aceptación: aplican budgets reales por fixture y corpus.

Los generadores sintéticos son first-party y deterministas. Sus archivos sólo
prueban límites, errores, budgets y consistencia interna; no prueban
compatibilidad con software o dibujos reales. Los binarios se guardan como
archivos, nunca ocultos en base64 o snapshots.

Un `parseOutcome:"ok"` sólo entra como ground truth de un fixture no sintético
con intake y oracle hasheados; no declara que el reader actual ya lo procese ni
promueve una capability por sí solo. El corpus no redistribuible vive en
`valle-design-dwg-conformance`, se consume mediante bundles inmutables y nunca
se copia a este repositorio.

## Checklist de PR

Todo PR del laboratorio declara:

- fuentes consultadas y sus IDs del registro;
- hechos técnicos usados y archivos derivados;
- fixtures añadidos o modificados, con permiso y hash;
- dependencias añadidas y sus licencias;
- que no se copió, tradujo, portó ni adaptó implementación externa; y
- capabilities promovidas o mantenidas, con evidencia y límites.
