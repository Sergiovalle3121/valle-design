import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThan, Not, Repository } from 'typeorm';
import {
  getTenantRepositoryToken,
  TenantScopedRepository,
} from '../../common/tenant/tenant-scoped.repository';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { User } from '../identity/entities/identity.entity';
import { CadProject } from '../cad-documents/entities/cad-project.entity';
import { assertCadCommentAnchor } from '../cad/cad-comment-anchor';
import { MessagingChannel } from './entities/messaging-channel.entity';
import { MessagingChannelMember } from './entities/messaging-channel-member.entity';
import { MessagingMessage } from './entities/messaging-message.entity';
import { MessagingEventBus } from './messaging-event-bus';
import type { CreateChannelDto, CreateMessageDto } from './dto/messaging.dto';

/** Tope de canales listados por persona y de mensajes por página. */
export const MAX_CHANNELS_LISTED = 200;
export const DEFAULT_MESSAGE_PAGE_SIZE = 50;
export const MAX_MESSAGE_PAGE_SIZE = 200;

export interface AuthorView {
  userId: string;
  email: string;
  displayName: string | null;
}

export interface ChannelView {
  channel: MessagingChannel;
  unreadCount: number;
  lastMessageAt: Date | null;
  /** Sólo canales 'direct': la otra persona de la conversación. */
  otherMember: AuthorView | null;
}

export interface MessagePage {
  items: MessagingMessage[];
  nextCursor: string | null;
}

/** Frontera de paginación por cursor: (created_at, id) del mensaje más viejo de la página. */
interface MessageCursor {
  createdAt: string;
  id: string;
}

/**
 * Ciclo de vida de canales y mensajes de equipo (WP mensajería). Toda
 * lectura/escritura va por repositorios TENANT-SCOPED — el tenant sale
 * siempre del contexto autenticado, nunca del cliente.
 *
 * Visibilidad de canal (ver comentario de `MessagingChannelMember`):
 * - PROYECTO: visible a cualquier miembro de la organización sin fila de
 *   membresía previa — la fila se crea perezosamente para guardar
 *   `last_read_at`.
 * - DIRECTO: sólo visible con fila de membresía (es la lista de control de
 *   acceso).
 */
@Injectable()
export class MessagingService {
  constructor(
    @Inject(getTenantRepositoryToken(MessagingChannel))
    private readonly channels: TenantScopedRepository<MessagingChannel>,
    @Inject(getTenantRepositoryToken(MessagingChannelMember))
    private readonly members: TenantScopedRepository<MessagingChannelMember>,
    @Inject(getTenantRepositoryToken(MessagingMessage))
    private readonly messages: TenantScopedRepository<MessagingMessage>,
    @Inject(getTenantRepositoryToken(CadProject))
    private readonly projects: TenantScopedRepository<CadProject>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly tenantCtx: TenantContextService,
    private readonly eventBus: MessagingEventBus,
  ) {}

  /* ────────────────────────────────── Canales ─────────────────────────────── */

  async listChannels(userId: string): Promise<ChannelView[]> {
    const { projectChannels, directChannels, memberRows } =
      await this.resolveVisibleChannels(userId);
    const all = [...projectChannels, ...directChannels];
    if (!all.length) return [];

    const memberByChannel = new Map(
      memberRows.map((row) => [row.channelId, row]),
    );

    // La OTRA persona de cada canal directo: una sola consulta de TODAS las
    // filas de membresía de esos canales (no sólo las del llamante), y de
    // ahí se descarta la propia por canal.
    const directChannelIds = directChannels.map((c) => c.id);
    const otherMemberByChannel = new Map<string, string>();
    if (directChannelIds.length) {
      const allMemberRows = await this.members.find({
        where: { channelId: In(directChannelIds) },
      });
      for (const row of allMemberRows) {
        if (row.userId !== userId) otherMemberByChannel.set(row.channelId, row.userId);
      }
    }
    const otherAuthors = await this.resolveAuthors([
      ...otherMemberByChannel.values(),
    ]);

    // Una consulta acotada POR CANAL (no un `take` global de mensajes
    // recientes): con un `take` global, un canal silencioso con actividad
    // vieja podía quedar sin `lastMessageAt` si otros canales empujaban sus
    // mensajes fuera del tope compartido. El número de canales de una
    // persona está acotado (MAX_CHANNELS_LISTED), así que el costo es lineal
    // y predecible.
    return Promise.all(
      all.map(async (channel) => {
        // `null` = nunca leído: cuenta TODO lo ajeno, sin comparar contra
        // ninguna fecha. Usar `channel.created_at` como sustituto de "desde
        // siempre" parece equivalente pero no lo es — un mensaje creado en el
        // MISMO instante que el canal (rutas de alta, importaciones, o
        // simplemente SQLite con precisión de segundo) empataría con
        // `MoreThan` y quedaría fuera del conteo sin que nadie lo leyera.
        const since = memberByChannel.get(channel.id)?.lastReadAt ?? null;
        const [unreadCount, lastMessage] = await Promise.all([
          this.messages.count({
            where: {
              channelId: channel.id,
              ...(since ? { created_at: MoreThan(since) } : {}),
              authorUserId: Not(userId),
            },
          }),
          this.messages.findOne({
            where: { channelId: channel.id },
            order: { created_at: 'DESC' },
          }),
        ]);
        const otherUserId = otherMemberByChannel.get(channel.id);
        return {
          channel,
          unreadCount,
          lastMessageAt: lastMessage?.created_at ?? null,
          otherMember: otherUserId
            ? (otherAuthors.get(otherUserId) ?? null)
            : null,
        };
      }),
    );
  }

  async createChannel(
    userId: string,
    input: CreateChannelDto,
  ): Promise<MessagingChannel> {
    return input.kind === 'project'
      ? this.createProjectChannel(userId, input)
      : this.createDirectChannel(userId, input);
  }

  /* ─────────────────────────────── Mensajes ────────────────────────────────── */

  async listMessages(
    channelId: string,
    userId: string,
    options: { cursor?: string; limit?: number },
  ): Promise<MessagePage> {
    await this.assertChannelAccess(channelId, userId);
    const take = Math.min(
      options.limit ?? DEFAULT_MESSAGE_PAGE_SIZE,
      MAX_MESSAGE_PAGE_SIZE,
    );
    const cursor = options.cursor ? decodeCursor(options.cursor) : null;

    const where = cursor
      ? [
          { channelId, created_at: LessThan(new Date(cursor.createdAt)) },
          {
            channelId,
            created_at: new Date(cursor.createdAt),
            id: LessThan(cursor.id),
          },
        ]
      : { channelId };

    const rows = await this.messages.find({
      where,
      order: { created_at: 'DESC', id: 'DESC' },
      take: take + 1,
    });
    const hasMore = rows.length > take;
    const page = rows.slice(0, take).reverse();
    const nextCursor =
      hasMore && page.length
        ? encodeCursor({
            createdAt: page[0].created_at.toISOString(),
            id: page[0].id,
          })
        : null;
    return { items: page, nextCursor };
  }

  async sendMessage(
    channelId: string,
    userId: string,
    input: CreateMessageDto,
  ): Promise<MessagingMessage> {
    const channel = await this.assertChannelAccess(channelId, userId);
    await this.ensureMembership(channelId, userId);

    const body = input.body?.trim();
    if (!body) {
      throw new BadRequestException('El mensaje no puede estar vacío.');
    }
    if (input.parentMessageId) {
      const parent = await this.messages.findOne({
        where: { id: input.parentMessageId },
      });
      if (!parent || parent.channelId !== channelId) {
        throw new BadRequestException(
          'El mensaje al que responde no pertenece a este canal.',
        );
      }
    }
    const anchor = assertCadCommentAnchor(input.anchor);

    const row = this.messages.create({
      channelId,
      authorUserId: userId,
      body: body.slice(0, 4000),
      parentMessageId: input.parentMessageId ?? null,
      anchor,
      created_by: this.tenantCtx.getUserEmail(),
    });
    row.organization_id = channel.organization_id;
    const saved = await this.messages.save(row);

    const tenantId = this.tenantCtx.requireTenantId('enviar un mensaje');
    this.eventBus.publish({
      tenantId,
      channelId,
      channelKind: channel.kind,
      message: saved,
    });
    return saved;
  }

  async markRead(channelId: string, userId: string): Promise<void> {
    await this.assertChannelAccess(channelId, userId);
    const member = await this.ensureMembership(channelId, userId);
    member.lastReadAt = new Date();
    await this.members.save(member);
  }

  /**
   * Ids de canal DIRECTOS del usuario (para el filtro de `@Sse('events')`:
   * los de proyecto se resuelven por tenant, sin necesidad de membresía).
   */
  async listMyDirectChannelIds(userId: string): Promise<Set<string>> {
    const { directChannels } = await this.resolveVisibleChannels(userId);
    return new Set(directChannels.map((c) => c.id));
  }

  /** Resuelve autores en bloque (email/displayName) para proyectar mensajes. */
  async resolveAuthors(userIds: string[]): Promise<Map<string, AuthorView>> {
    const unique = [...new Set(userIds)];
    if (!unique.length) return new Map();
    const rows = await this.users.findBy({ id: In(unique) });
    return new Map(
      rows.map((user) => [
        user.id,
        { userId: user.id, email: user.email, displayName: user.displayName },
      ]),
    );
  }

  /* ─────────────────────────────────── Interno ─────────────────────────────── */

  private async resolveVisibleChannels(userId: string): Promise<{
    projectChannels: MessagingChannel[];
    directChannels: MessagingChannel[];
    memberRows: MessagingChannelMember[];
  }> {
    const projectChannels = await this.channels.find({
      where: { kind: 'project' },
      order: { created_at: 'ASC' },
      take: MAX_CHANNELS_LISTED,
    });
    const memberRows = await this.members.find({
      where: { userId },
      take: MAX_CHANNELS_LISTED,
    });
    const memberChannelIds = memberRows.map((row) => row.channelId);
    const directChannels = memberChannelIds.length
      ? await this.channels.find({
          where: { id: In(memberChannelIds), kind: 'direct' },
          order: { created_at: 'ASC' },
          take: MAX_CHANNELS_LISTED,
        })
      : [];
    return { projectChannels, directChannels, memberRows };
  }

  private async createProjectChannel(
    userId: string,
    input: CreateChannelDto,
  ): Promise<MessagingChannel> {
    if (!input.projectId || !input.name) {
      throw new BadRequestException(
        'Un canal de proyecto necesita projectId y name.',
      );
    }
    const project = await this.projects.findOne({
      where: { id: input.projectId },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado.');

    const row = this.channels.create({
      kind: 'project',
      projectId: input.projectId,
      name: input.name.trim(),
      directKey: null,
      created_by: this.tenantCtx.getUserEmail(),
    });
    row.organization_id = project.organization_id;
    const saved = await this.channels.save(row);
    await this.ensureMembership(saved.id, userId);
    return saved;
  }

  private async createDirectChannel(
    userId: string,
    input: CreateChannelDto,
  ): Promise<MessagingChannel> {
    if (!input.memberUserId) {
      throw new BadRequestException(
        'Un canal directo necesita memberUserId.',
      );
    }
    if (input.memberUserId === userId) {
      throw new BadRequestException(
        'No puedes abrir un canal directo contigo mismo.',
      );
    }
    const directKey = [userId, input.memberUserId].sort().join(':');
    const existing = await this.channels.findOne({
      where: { kind: 'direct', directKey },
    });
    if (existing) return existing;

    try {
      const row = this.channels.create({
        kind: 'direct',
        projectId: null,
        name: null,
        directKey,
        created_by: this.tenantCtx.getUserEmail(),
      });
      row.organization_id = this.tenantCtx.getOrganizationId();
      const saved = await this.channels.save(row);
      await this.ensureMembership(saved.id, userId);
      await this.ensureMembership(saved.id, input.memberUserId);
      return saved;
    } catch (err) {
      // Carrera: dos peticiones simultáneas abriendo el mismo par. El índice
      // único (tenant_id, direct_key) gana; aquí sólo se recupera la fila
      // ganadora en vez de propagar el 500 de la violación.
      const again = await this.channels.findOne({
        where: { kind: 'direct', directKey },
      });
      if (again) return again;
      throw err;
    }
  }

  /** Fila de membresía de (channelId, userId), creándola si falta (perezosa). */
  private async ensureMembership(
    channelId: string,
    userId: string,
  ): Promise<MessagingChannelMember> {
    const existing = await this.members.findOne({
      where: { channelId, userId },
    });
    if (existing) return existing;
    try {
      const row = this.members.create({ channelId, userId, lastReadAt: null });
      return await this.members.save(row);
    } catch (err) {
      const again = await this.members.findOne({ where: { channelId, userId } });
      if (again) return again;
      throw err;
    }
  }

  private async assertChannelAccess(
    channelId: string,
    userId: string,
  ): Promise<MessagingChannel> {
    const channel = await this.channels.findOne({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Canal no encontrado.');
    if (channel.kind === 'project') return channel;
    const member = await this.members.findOne({ where: { channelId, userId } });
    if (!member) {
      throw new ForbiddenException('No perteneces a este canal.');
    }
    return channel;
  }
}

/* ──────────────────────────── Cursor de paginación ─────────────────────────── */

function encodeCursor(cursor: MessageCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): MessageCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as Partial<MessageCursor>;
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
      throw new Error('shape');
    }
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    throw new BadRequestException('El cursor de paginación es inválido.');
  }
}
