import { strict as assert } from "node:assert";
import { assessPassword } from "./password-strength";

/**
 * LAS PRUEBAS DEL MEDIDOR, escritas como acusaciones.
 *
 * Un medidor de contraseñas se prueba mal casi siempre: se comprueba que una
 * contraseña larga puntúa alto y se da por bueno. Lo que hay que demostrar es
 * lo contrario — que NO felicita a las contraseñas que un atacante prueba
 * primero, aunque cumplan todas las reglas de clase de carácter.
 */

/* ── 1 · LAS QUE PARECEN FUERTES Y NO LO SON ──────────────────────────────── */
{
  // El ejemplo canónico: mayúscula, minúscula, número y símbolo en diez
  // caracteres. Cualquier medidor de clases de carácter la pinta verde; está en
  // la primera página de cualquier lista de crackeo.
  const evaluada = assessPassword("P@ssw0rd12");
  assert.equal(
    evaluada.verdict,
    "muy-debil",
    `«P@ssw0rd12» no puede salir como ${evaluada.verdict}: es «password» disfrazada`,
  );
  assert.match(evaluada.advice ?? "", /más usadas/u);
}

{
  // Sustitución obvia deshecha: el atacante no paga por el `@` ni por el `0`.
  assert.equal(assessPassword("C0ntr@sena2024").verdict, "muy-debil");
}

{
  // Secuencia pura, larga: dieciséis caracteres que no valen dieciséis
  // decisiones porque cada uno se deduce del anterior.
  const secuencia = assessPassword("abcdefghijklmnop");
  assert.ok(
    secuencia.bits < 45,
    `una secuencia de 16 letras no puede medir ${secuencia.bits} bits`,
  );
}

{
  // Un carácter repetido veinte veces.
  const repetida = assessPassword("aaaaaaaaaaaaaaaaaaaa");
  assert.ok(repetida.bits <= 8, `repetición mide ${repetida.bits} bits`);
  assert.match(repetida.advice ?? "", /repetido/u);
}

/* ── 2 · LAS QUE PARECEN DÉBILES Y SÍ LO SON ──────────────────────────────── */
{
  // Cuatro palabras sin relación: sin mayúsculas, sin números, sin símbolos, y
  // muy por encima de cualquier cosa de doce caracteres con variedad.
  const frase = assessPassword("caballo grapa bateria correcto");
  assert.equal(
    frase.verdict,
    "fuerte",
    `una frase de 30 caracteres salió como ${frase.verdict} (${frase.bits} bits)`,
  );
  const conVariedad = assessPassword("Xk9#mQ2$vL");
  assert.ok(
    frase.bits > conVariedad.bits,
    "la frase larga tiene que medir más que diez caracteres con variedad",
  );
}

/* ── 3 · LA ESCALA ────────────────────────────────────────────────────────── */
{
  assert.equal(assessPassword("").bits, 0);
  assert.equal(assessPassword("").ratio, 0);
  assert.equal(assessPassword("").verdict, "muy-debil");
}

{
  // El aviso del mínimo aparece por debajo de doce, que es lo que exige el API.
  assert.match(assessPassword("corta1234").advice ?? "", /12 caracteres/u);
  assert.doesNotMatch(
    assessPassword("una frase larga y sin relacion").advice ?? "",
    /12 caracteres/u,
  );
}

{
  // La barra nunca se sale de su carril.
  for (const password of [
    "a",
    "P@ssw0rd12",
    "x".repeat(200),
    "correcto caballo grapa bateria elefante",
  ]) {
    const { ratio } = assessPassword(password);
    assert.ok(
      ratio >= 0 && ratio <= 1,
      `ratio fuera de rango para ${password}`,
    );
  }
}

{
  // Monotonía en el caso sano: alargar una contraseña sin patrones no puede
  // bajar la puntuación. Si esto falla, alguna penalización se aplica mal.
  let previo = 0;
  for (const password of [
    "kw",
    "kwtz",
    "kwtzr9",
    "kwtzr9mv",
    "kwtzr9mvq7",
    "kwtzr9mvq7bn",
  ]) {
    const { bits } = assessPassword(password);
    assert.ok(bits >= previo, `alargar bajó la puntuación en «${password}»`);
    previo = bits;
  }
}

{
  // Determinismo: la misma entrada, la misma salida.
  assert.deepEqual(
    assessPassword("una frase de prueba"),
    assessPassword("una frase de prueba"),
  );
}

console.log(
  "password-strength: 8 grupos verdes — disfraces deshechos, secuencias y repeticiones penalizadas, frases largas premiadas, escala acotada y monótona",
);
