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

### Especificación consultada vs. implementación prohibida

Esta distinción se escribe aparte porque su ausencia ya costó tiempo real: el
informe de cierre de 2026-08-24 (§11.7) leyó la sección «Material prohibido»
como si excluyera *toda* fuente que llevara el nombre ODA, y declaró bloqueado
el trabajo de las versiones 2010/2013/2018 por falta de fuente. No era así.

- Lo **prohibido** es la *implementación*: código, headers, bindings, tablas
  generadas, comentarios o tests de ODA SDK, RealDWG, Autodesk, LibreDWG u otro
  codec, incluso traducidos, portados o adaptados. Eso no cambia.
- Lo **permitido**, cuando sus términos lo consienten y el hecho queda
  registrado antes de derivar, es un *documento de especificación* del formato,
  bajo la categoría «documentación pública cuyos términos permitan extraer los
  hechos técnicos mínimos registrados» de la lista de arriba.

El caso ya resuelto y en vigor es la entrada `ODA-ODS-DWG-5.4.1-PUBLIC` del
registro: `status: allowed`, revisada el 2026-08-14, con sus términos («facts
only, no redistribution») y sus hechos anotados uno a uno. De ella salieron —
como hechos, jamás como código— los cimientos del laboratorio: los bit-codes,
el CRC-16, el contenedor R2000, el contenedor R2004 y los decodificadores por
tipo. Un total de 54 archivos derivados la enlazan, y 80 hechos anotados uno a uno.

De modo que la pregunta correcta ante una fuente nunca es «¿lleva el nombre de
un codec ajeno?», sino las dos que esta política ya exige: **¿qué es —
documento o implementación—?** y **¿sus términos permiten la actividad concreta,
y está registrada antes de derivar?**

Sigue vigente todo lo demás: un documento no queda autorizado por ser público,
no se copia prosa extensa ni tablas, y la promoción de cualquier capacidad más
allá de investigación experimental sigue exigiendo la revisión legal externa que
fijan ADR-0004 y ADR-0007.

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
autorización expresa de publicación o de terceros con licencia explícita de uso
y redistribución. Cada uno debe cumplir `fixtures/manifest.schema.json` y su
SHA-256 se verifica contra los bytes versionados.

Cada fixture enlaza mediante `sourceIds` sólo entradas `allowed` del registro.
Los gates que se implementen en PR 2 deben resolver paths dentro de la raíz
esperada, comparar tamaño/hash y rechazar IDs, paths o hashes duplicados; estas
relaciones entre archivos no se delegan únicamente al JSON Schema.

Los generadores sintéticos son first-party y deterministas. Sus archivos sólo
prueban límites, errores, budgets y consistencia interna; no prueban
compatibilidad con software o dibujos reales. Los binarios se guardan como
archivos, nunca ocultos en base64 o snapshots.

## Checklist de PR

Todo PR del laboratorio declara:

- fuentes consultadas y sus IDs del registro;
- hechos técnicos usados y archivos derivados;
- fixtures añadidos o modificados, con permiso y hash;
- dependencias añadidas y sus licencias;
- que no se copió, tradujo, portó ni adaptó implementación externa; y
- capabilities promovidas o mantenidas, con evidencia y límites.
