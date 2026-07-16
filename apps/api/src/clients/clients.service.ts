import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { CreateClientDto, UpdateClientDto } from './dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.client.findMany({
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { sites: true } } },
      }),
    );
  }

  async get(user: AuthUser, id: string) {
    const client = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.client.findFirst({
        where: { id },
        include: {
          sites: {
            select: {
              id: true, name: true, domain: true,
              status: true, installStatus: true,
            },
          },
        },
      }),
    );
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  create(user: AuthUser, dto: CreateClientDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const client = await tx.client.create({
        data: { tenantId: user.tenantId, ...dto },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, userId: user.userId,
          action: 'client.create', entityType: 'client', entityId: client.id,
          after: { name: client.name },
        },
      });
      return client;
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateClientDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const before = await tx.client.findFirst({ where: { id } });
      if (!before) throw new NotFoundException('Client not found');
      const after = await tx.client.update({ where: { id }, data: dto });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, userId: user.userId,
          action: 'client.update', entityType: 'client', entityId: id,
          before: before as any, after: after as any,
        },
      });
      return after;
    });
  }

  async remove(user: AuthUser, id: string) {
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const client = await tx.client.findFirst({
        where: { id },
        include: { _count: { select: { sites: true } } },
      });
      if (!client) throw new NotFoundException('Client not found');
      if (client._count.sites > 0) {
        throw new ConflictException(
          `Client has ${client._count.sites} site(s) — archive or delete them first`,
        );
      }
      await tx.client.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, userId: user.userId,
          action: 'client.delete', entityType: 'client', entityId: id,
          before: { name: client.name },
        },
      });
    });
  }
}
