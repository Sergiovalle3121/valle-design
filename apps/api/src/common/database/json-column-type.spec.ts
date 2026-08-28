import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LA FRONTERA ENTRE LOS DOS MOTORES, fijada por una prueba.
 *
 * `JSON_COLUMN_TYPE` y `DATE_COLUMN_TYPE` se resuelven al cargarse el módulo y
 * gobiernan el mapeo de TODAS las entidades del proceso. Ampliar la condición
 * para que reconozca `TEST_DATABASE_URL` parece un arreglo obvio —y se intentó
 * durante la campaña de firma propia— pero rompe 51 suites: `TEST_DATABASE_URL`
 * significa «hay PostgreSQL disponible para las suites que lo exigen», no «este
 * proceso habla PostgreSQL», y el resto de las suites del mismo proceso siguen
 * sobre SQLite en memoria.
 *
 * Esta prueba no ejecuta el módulo con entornos distintos (no puede: la
 * constante se congela al importarse). Comprueba la FORMA de la condición, que
 * es lo que hay que impedir que cambie, y deja la explicación donde la va a
 * leer quien intente cambiarla.
 */
describe('la frontera de motor de las columnas', () => {
  const leer = (archivo: string) =>
    readFileSync(join(__dirname, archivo), 'utf8');

  it.each(['json-column-type.ts', 'date-column-type.ts'])(
    '%s decide SÓLO con DATABASE_URL y DB_HOST',
    (archivo) => {
      const fuente = leer(archivo);
      const condicion = fuente.slice(fuente.lastIndexOf('export const'));
      expect(condicion).toContain('process.env.DATABASE_URL');
      expect(condicion).toContain('process.env.DB_HOST');
      // Las tres que NO pueden entrar aquí. Ver la cabecera de cada módulo.
      for (const prohibida of [
        'TEST_DATABASE_URL',
        'TEST_PG_URL',
        'DATABASE_URL_TEST',
      ]) {
        expect(condicion).not.toContain(prohibida);
      }
    },
  );

  it('el lanzador de las suites de PostgreSQL sí define DATABASE_URL', () => {
    // La otra mitad de la frontera: el comando documentado tiene que seguir
    // funcionando. Si alguien quitara esta línea del lanzador, las migraciones
    // volverían a morir con un error que no menciona ninguna variable.
    const lanzador = readFileSync(
      join(__dirname, '..', '..', '..', 'scripts', 'jest-postgres.js'),
      'utf8',
    );
    expect(lanzador).toContain('DATABASE_URL: url');
  });
});
