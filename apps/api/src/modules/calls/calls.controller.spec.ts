import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { CallsController } from './calls.controller';
import {
  CallParticipantNotFoundError,
  CallRoomFullError,
  CallRoomNotFoundError,
} from './call-room-store';
import type { CallsService } from './calls.service';
import type { ApiRateLimitService } from '../identity/api-rate-limit.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.types';

const usuario: AuthenticatedUser = {
  userId: '11111111-2222-4333-8444-555555555555',
  email: 'arquitecta@ejemplo.mx',
  role: 'member',
  tenant_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  organization_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  plant_id: null,
  permissions: ['cad:view'],
  scopes: null,
};

function conControlador() {
  const join = jest.fn();
  const leave = jest.fn();
  const signal = jest.fn();
  const connect = jest.fn();
  const calls = { join, leave, signal, connect } as unknown as CallsService;
  const rateLimits = {
    enforce: jest.fn(async () => undefined),
  } as unknown as ApiRateLimitService;
  return {
    controlador: new CallsController(calls, rateLimits),
    join,
    leave,
    signal,
  };
}

const peticion = (user?: AuthenticatedUser) => ({ user }) as unknown as Request;

describe('CallsController · el actor sale del usuario del guard', () => {
  it('sin organización activa, 403 explícito en vez de un tenant vacío', async () => {
    const { controlador } = conControlador();
    const sinTenant: AuthenticatedUser = { ...usuario, tenant_id: null };
    await expect(
      controlador.join({ documentId: 'doc-1' }, peticion(sinTenant)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('join delega tenantId, userId y correo del usuario del guard, no de lo que mande el body', async () => {
    const { controlador, join } = conControlador();
    join.mockResolvedValue({ roomId: 'sala-1' });
    await controlador.join(
      { documentId: 'doc-1', displayName: 'Arq. Pérez' },
      peticion(usuario),
    );
    expect(join).toHaveBeenCalledWith(usuario.tenant_id, 'doc-1', {
      userId: usuario.userId,
      email: usuario.email,
      displayName: 'Arq. Pérez',
    });
  });
});

describe('CallsController · errores del store se traducen a HTTP', () => {
  it('sala llena → 409, no un 500 genérico', async () => {
    const { controlador, join } = conControlador();
    join.mockRejectedValue(new CallRoomFullError('sala-1'));
    await expect(
      controlador.join({ documentId: 'doc-1' }, peticion(usuario)),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('sala inexistente en leave → 404', () => {
    const { controlador, leave } = conControlador();
    leave.mockImplementation(() => {
      throw new CallRoomNotFoundError('sala-x');
    });
    expect(() =>
      controlador.leave(
        '11111111-1111-4111-8111-111111111111',
        { participantId: '22222222-2222-4222-8222-222222222222' },
        peticion(usuario),
      ),
    ).toThrow(NotFoundException);
  });

  it('participante inexistente en signal → 404', async () => {
    const { controlador, signal } = conControlador();
    signal.mockImplementation(() => {
      throw new CallParticipantNotFoundError('fantasma');
    });
    await expect(
      controlador.signal(
        '11111111-1111-4111-8111-111111111111',
        {
          fromParticipantId: '22222222-2222-4222-8222-222222222222',
          toParticipantId: '33333333-3333-4333-8333-333333333333',
          kind: 'offer',
          payload: {},
        },
        peticion(usuario),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
