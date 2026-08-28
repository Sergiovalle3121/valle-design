import {
  BACKUP_CODE_COUNT,
  decodeBase32,
  decryptMfaSecret,
  encodeBase32,
  encryptMfaSecret,
  generateBackupCode,
  generateTotpSecret,
  hashBackupCode,
  hotp,
  normalizeBackupCode,
  totp,
  totpUri,
  verifyTotp,
} from './identity-mfa';

/**
 * EL SEGUNDO FACTOR, CONTRA ORÁCULOS EXTERNOS.
 *
 * La regla del repositorio: una implementación criptográfica escrita en casa no
 * cuenta por existir ni por pasar sus propios goldens. Cuenta si reproduce los
 * vectores que publicó QUIEN definió el estándar — un oráculo que no puede
 * heredar nuestros errores porque se escribió antes que nuestro código.
 *
 * Por eso las dos primeras suites no son «pruebas de TOTP»: son la comprobación
 * de que esto ES TOTP. Si un día alguien toca el truncamiento dinámico o el
 * relleno de base32, estos vectores lo dicen en la misma corrida.
 */
describe('base32 (RFC 4648 §10)', () => {
  // Los siete vectores de la sección 10 del RFC 4648, literales.
  const VECTORES: ReadonlyArray<readonly [string, string]> = [
    ['', ''],
    ['f', 'MY======'],
    ['fo', 'MZXQ===='],
    ['foo', 'MZXW6==='],
    ['foob', 'MZXW6YQ='],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI======'],
  ];

  it.each(VECTORES)('codifica %j como %j', (plano, esperado) => {
    expect(encodeBase32(Buffer.from(plano, 'utf8'))).toBe(esperado);
  });

  it.each(VECTORES)('descodifica el vector de %j', (plano, codificado) => {
    expect(decodeBase32(codificado)?.toString('utf8')).toBe(plano);
  });

  it('rechaza el alfabeto equivocado en vez de inventarse bytes', () => {
    // 0, 1, 8 y 9 no existen en base32: son justo las figuras que el estándar
    // excluye para que nadie las confunda al teclear.
    expect(decodeBase32('MZXW6YTB0')).toBeNull();
    expect(decodeBase32('no es base32')).toBeNull();
  });

  it('sobrevive a la ida y vuelta con datos arbitrarios', () => {
    for (let longitud = 1; longitud <= 40; longitud += 1) {
      const datos = Buffer.alloc(longitud, longitud);
      expect(decodeBase32(encodeBase32(datos))?.equals(datos)).toBe(true);
    }
  });
});

describe('TOTP (RFC 6238, apéndice B)', () => {
  /**
   * La semilla del RFC para HMAC-SHA1: los veinte octetos ASCII
   * "12345678901234567890". Los códigos del apéndice B son de OCHO dígitos, así
   * que las comprobaciones piden ocho: es el único modo de contrastar contra el
   * documento en vez de contra una versión recortada de él.
   */
  const SEMILLA = Buffer.from('12345678901234567890', 'utf8');
  const VECTORES: ReadonlyArray<readonly [number, string]> = [
    [59, '94287082'],
    [1_111_111_109, '07081804'],
    [1_111_111_111, '14050471'],
    [1_234_567_890, '89005924'],
    [2_000_000_000, '69279037'],
    [20_000_000_000, '65353130'],
  ];

  it.each(VECTORES)('en T=%d da %s', (segundos, esperado) => {
    const contador = Math.floor(segundos / 30);
    expect(hotp(SEMILLA, contador, 8)).toBe(esperado);
  });

  it('el código de seis dígitos es el de ocho recortado por el módulo', () => {
    // No es una redundancia: demuestra que cambiar `digits` no altera el
    // truncamiento dinámico, que es el paso donde una implementación mal
    // escrita se desvía sin que los vectores de ocho dígitos lo noten.
    const base32 = encodeBase32(SEMILLA);
    expect(totp(base32, 59_000)).toBe('94287082'.slice(-6));
  });
});

describe('verificación con ventana', () => {
  const secreto = encodeBase32(Buffer.from('12345678901234567890', 'utf8'));
  const AHORA = 1_700_000_000_000;

  it('acepta el código del paso vigente', () => {
    expect(verifyTotp(secreto, totp(secreto, AHORA) as string, AHORA)).toBe(
      true,
    );
  });

  it('acepta un paso de deriva a cada lado', () => {
    for (const desfase of [-30_000, 30_000]) {
      const codigo = totp(secreto, AHORA + desfase) as string;
      expect(verifyTotp(secreto, codigo, AHORA)).toBe(true);
    }
  });

  it('RECHAZA dos pasos de deriva', () => {
    // Sin esta prueba, una ventana accidentalmente enorme pasaría por buena:
    // las de arriba sólo comprueban que acepta, nunca que se detiene.
    for (const desfase of [-90_000, 90_000]) {
      const codigo = totp(secreto, AHORA + desfase) as string;
      expect(verifyTotp(secreto, codigo, AHORA)).toBe(false);
    }
  });

  it('rechaza lo que no es un código de seis dígitos', () => {
    for (const basura of ['', '12345', '1234567', 'abcdef', '12 34 56 78']) {
      expect(verifyTotp(secreto, basura, AHORA)).toBe(false);
    }
  });

  it('tolera los espacios con los que la gente copia el código', () => {
    const codigo = totp(secreto, AHORA) as string;
    expect(
      verifyTotp(secreto, `${codigo.slice(0, 3)} ${codigo.slice(3)}`, AHORA),
    ).toBe(true);
  });

  it('un secreto vacío o corrupto nunca valida', () => {
    expect(totp('', AHORA)).toBeNull();
    expect(verifyTotp('', '000000', AHORA)).toBe(false);
    expect(verifyTotp('no-es-base32-!', '000000', AHORA)).toBe(false);
  });
});

describe('la URI que escanea la aplicación', () => {
  it('lleva emisor, cuenta y parámetros, todo codificado', () => {
    const uri = totpUri({
      issuer: 'Valle Design',
      account: 'sergio+prueba@ejemplo.mx',
      secretBase32: 'MZXW6YTBOI======',
    });
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    // El `+` de un correo y el espacio del emisor tienen que viajar escapados o
    // la URI se parte en silencio y el QR escanea mal.
    expect(uri).toContain('Valle%20Design:sergio%2Bprueba%40ejemplo.mx');
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });
});

describe('códigos de respaldo', () => {
  it('el secreto generado es base32 válido y de 160 bits', () => {
    const secreto = generateTotpSecret();
    expect(decodeBase32(secreto)?.length).toBe(20);
  });

  it('tienen la forma que se puede copiar a mano', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateBackupCode()).toMatch(
        /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/u,
      );
    }
  });

  it('no contienen las figuras que se confunden al copiar', () => {
    // 0/O y 1/I/L son el motivo por el que un código de respaldo «no funciona»
    // cuando en realidad se tecleó otro carácter.
    const muestra = Array.from({ length: 200 }, () =>
      generateBackupCode(),
    ).join('');
    for (const ambigua of ['0', 'O', '1', 'I', 'L']) {
      expect(muestra).not.toContain(ambigua);
    }
  });

  it('no se repiten en una tanda', () => {
    const tanda = new Set(
      Array.from({ length: BACKUP_CODE_COUNT * 20 }, () =>
        generateBackupCode(),
      ),
    );
    expect(tanda.size).toBe(BACKUP_CODE_COUNT * 20);
  });

  it('el hash ignora guiones, espacios y mayúsculas', () => {
    const codigo = 'ABCDE-FGHJK';
    expect(hashBackupCode(codigo)).toBe(hashBackupCode('abcde fghjk'));
    expect(hashBackupCode(codigo)).toBe(hashBackupCode('ABCDEFGHJK'));
    expect(normalizeBackupCode(' abc-de ')).toBe('ABCDE');
  });

  it('códigos distintos dan hashes distintos', () => {
    expect(hashBackupCode('ABCDE-FGHJK')).not.toBe(
      hashBackupCode('ABCDE-FGHJM'),
    );
  });
});

describe('cifrado del secreto en reposo', () => {
  it('va y vuelve', () => {
    const secreto = generateTotpSecret();
    expect(decryptMfaSecret(encryptMfaSecret(secreto))).toBe(secreto);
  });

  it('el texto cifrado NO contiene el secreto', () => {
    // La comprobación que de verdad importa: si esto fallara, el cifrado sería
    // decorativo y un volcado de la tabla seguiría entregando el factor.
    const secreto = generateTotpSecret();
    expect(encryptMfaSecret(secreto)).not.toContain(secreto);
  });

  it('cifrar dos veces el mismo secreto da textos distintos', () => {
    const secreto = generateTotpSecret();
    expect(encryptMfaSecret(secreto)).not.toBe(encryptMfaSecret(secreto));
  });

  it('un texto manipulado falla al descifrar en vez de devolver basura', () => {
    // GCM autentica: sin esto, un byte cambiado en la tabla produciría códigos
    // silenciosamente equivocados que el usuario viviría como «mi teléfono
    // dejó de funcionar».
    const cifrado = encryptMfaSecret(generateTotpSecret());
    const partes = cifrado.split('.');
    const alterado = `${partes[0]}.${partes[1]}.${partes[2]}.${partes[3].slice(0, -2)}AA`;
    expect(decryptMfaSecret(alterado)).toBeNull();
  });

  it('rechaza formatos que no reconoce', () => {
    for (const basura of ['', 'v2.a.b.c', 'sin-puntos', 'v1.a.b']) {
      expect(decryptMfaSecret(basura)).toBeNull();
    }
  });
});
