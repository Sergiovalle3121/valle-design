# Histórico de la rúbrica competitiva

Un archivo por corte, `<fecha>-<commit-corto>.json`, escrito por
`node scripts/cad/rubric.mjs --history`.

La pregunta que estos archivos existen para responder es «¿cuánto hemos avanzado
este mes?», y sin serie temporal no se responde. Una foto sola dice dónde
estamos; sólo la serie dice si nos movemos y hacia dónde.

## Formato

```jsonc
{
  "schemaVersion": 1,
  "measuredAt": "2026-08-09T19:02:57.732Z", // cuándo se midió
  "commit": "8be49a55…", // qué árbol se midió
  "totalPoints": 200, // denominador publicado
  "earned": 131,
  "percentage": 65.5,
  "categories": [
    {
      "id": "hatch",
      "name": "HATCH asociativo",
      "points": 10,
      "earned": 5,
      "notGranted": ["hatch.command", "hatch.islands"], // qué faltó, no sólo cuánto
    },
  ],
}
```

Se guarda el desglose por categoría y **qué criterios concretos quedaron sin
otorgar**, no sólo el total. Un total plano puede esconder que una categoría
subió cuatro puntos mientras otra se caía cuatro, y esa es justamente la
situación que hay que poder ver.

## Reglas

- **No se editan a mano.** Un histórico retocado deja de ser evidencia. Si una
  corrida salió mal, se borra el archivo y se vuelve a correr.
- **No se borran los cortes malos.** Una bajada de puntuación es un dato, y
  esconderla convierte la serie en publicidad.
- El denominador puede cambiar de un corte a otro si la rúbrica se reparte
  distinto; por eso cada entrada guarda su propio `totalPoints` y comparar
  porcentajes entre repartos distintos exige decirlo.
