import { Controller, ForbiddenException, Get, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateService } from './update.service';

/** §12 Software update — admin only. */
@Controller('settings/update')
export class UpdateController {
  constructor(
    private readonly update: UpdateService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  version(@CurrentUser() user: AuthUser) {
    this.requireAdmin(user);
    return this.update.version();
  }

  @Post()
  async run(@CurrentUser() user: AuthUser) {
    this.requireAdmin(user);
    const result = await this.update.update();
    await this.prisma.admin.auditLog.create({
      data: {
        tenantId: user.tenantId, userId: user.userId,
        action: 'panel.update', entityType: 'panel', entityId: null,
        after: { from: result.from, to: result.to },
      },
    });
    return result;
  }

  private requireAdmin(user: AuthUser) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admins can update the panel');
    }
  }
}
