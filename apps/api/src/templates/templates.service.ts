import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuthUser } from '../auth/current-user.decorator';
import { CreateTemplateDto } from './dto';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Global stock templates (tenant_id NULL) + this tenant's own. */
  list(user: AuthUser, category?: string) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.template.findMany({
        where: {
          status: 'active',
          ...(category ? { category } : {}),
        },
        orderBy: [{ tenantId: 'asc' }, { name: 'asc' }],
        select: {
          id: true, tenantId: true, name: true, category: true,
          description: true, version: true, previewImageUrl: true,
          thumbnailUrl: true, status: true,
        },
      }),
    );
  }

  async get(user: AuthUser, id: string) {
    const template = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.template.findFirst({ where: { id } }),
    );
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async create(
    user: AuthUser,
    dto: CreateTemplateDto,
    packageZip?: Buffer,
  ) {
    let paramSchema: unknown;
    try {
      paramSchema =
        typeof dto.param_schema === 'string'
          ? JSON.parse(dto.param_schema)
          : dto.param_schema;
    } catch {
      throw new BadRequestException('param_schema is not valid JSON');
    }
    if (
      !paramSchema ||
      typeof paramSchema !== 'object' ||
      (paramSchema as any).type !== 'object'
    ) {
      throw new BadRequestException(
        'param_schema must be a JSON Schema object with type "object"',
      );
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const template = await tx.template.create({
        data: {
          tenantId: user.tenantId,
          name: dto.name,
          category: dto.category,
          description: dto.description ?? null,
          paramSchema: paramSchema as any,
          repoPath: 'pending',
          previewImageUrl: dto.preview_image_url ?? null,
        },
      });
      const repoPath = `templates/${template.id}/v1/package.zip`;
      if (packageZip) await this.storage.put(repoPath, packageZip);
      const updated = await tx.template.update({
        where: { id: template.id },
        data: { repoPath: packageZip ? repoPath : `templates/${template.id}/v1/` },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, userId: user.userId,
          action: 'template.create', entityType: 'template', entityId: template.id,
          after: { name: dto.name, category: dto.category },
        },
      });
      return updated;
    });
  }

  async deprecate(user: AuthUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const template = await tx.template.findFirst({ where: { id } });
      if (!template) throw new NotFoundException('Template not found');
      if (!template.tenantId) {
        throw new BadRequestException('Stock templates cannot be deprecated per-tenant');
      }
      return tx.template.update({
        where: { id },
        data: { status: 'deprecated' },
      });
    });
  }
}
