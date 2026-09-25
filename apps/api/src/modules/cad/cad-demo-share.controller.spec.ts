import { BadRequestException } from '@nestjs/common';
import { CadDemoShareClaimController } from './cad-demo-share-claim.controller';
import type { CadDemoShareService } from './cad-demo-share.service';
import type { CadReviewRepository } from './cad-review.repository';

/**
 * RECLAMAR un enlace de la demostración: el orden es la garantía.
 *
 * La sesión de revisión se crea ANTES de retirar la copia temporal. Si crearla
 * falla (p. ej. el documento ya tiene el máximo de sesiones abiertas), el
 * enlace que el destinatario ya tiene en su celular sigue abriendo la copia en
 * vez de morir sin aviso.
 */
describe('CadDemoShareClaimController', () => {
  const DOCUMENT_ID = '8d0a1f5e-3c1b-4c55-9f1e-2b7a6c9d4e11';
  const order: string[] = [];
  const completeClaim = jest.fn(async () => {
    order.push('complete');
  });
  const createSessionForExistingToken = jest.fn(async () => {
    order.push('session');
    return session;
  });
  const demoShares = {
    findForClaim: jest.fn(async () => {
      order.push('find');
      return {
        id: 'share-1',
        tokenHash: 'a'.repeat(64),
        expiresAt: new Date(),
      };
    }),
    completeClaim,
  } as unknown as CadDemoShareService;
  const session = {
    id: 'session-1',
    documentId: DOCUMENT_ID,
    status: 'open',
    tokenHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 1_000),
    revokedAt: null,
    allowComments: true,
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const reviews = {
    createSessionForExistingToken,
  } as unknown as CadReviewRepository;

  beforeEach(() => {
    order.length = 0;
    jest.clearAllMocks();
  });

  it('crea la sesión con el mismo hash y sólo después retira la copia', async () => {
    const controller = new CadDemoShareClaimController(demoShares, reviews);
    await controller.claim(DOCUMENT_ID, {
      manageToken: 'vddm_token-de-gestion-de-prueba',
    });
    expect(order).toEqual(['find', 'session', 'complete']);
    expect(createSessionForExistingToken).toHaveBeenCalledWith(
      DOCUMENT_ID,
      'a'.repeat(64),
      expect.objectContaining({ allowComments: true }),
    );
  });

  it('si la sesión no se puede crear, la copia sigue viva', async () => {
    createSessionForExistingToken.mockImplementationOnce(async () => {
      throw new BadRequestException('Máximo de sesiones abiertas');
    });
    const controller = new CadDemoShareClaimController(demoShares, reviews);
    await expect(
      controller.claim(DOCUMENT_ID, {
        manageToken: 'vddm_token-de-gestion-de-prueba',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(completeClaim).not.toHaveBeenCalled();
  });
});
