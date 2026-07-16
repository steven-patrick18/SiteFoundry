import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsIn(['admin', 'builder', 'viewer']) role!: string;
}

class UpdateUserDto {
  @IsOptional() @IsIn(['admin', 'builder', 'viewer']) role?: string;
  @IsOptional() @IsString() @MinLength(8) password?: string;
}

/** §12 Settings: users/roles. Admin-only; the last admin is protected. */
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    this.requireAdmin(user);
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.user.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true, role: true, lastLoginAt: true, createdAt: true },
      }),
    );
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    this.requireAdmin(user);
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.admin.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('A user with that email already exists');
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const created = await tx.user.create({
        data: {
          tenantId: user.tenantId,
          email,
          passwordHash: bcrypt.hashSync(dto.password, 10),
          role: dto.role,
        },
        select: { id: true, email: true, role: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, userId: user.userId,
          action: 'user.create', entityType: 'user', entityId: created.id,
          after: { email, role: dto.role },
        },
      });
      return created;
    });
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    this.requireAdmin(user);
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const target = await tx.user.findFirst({ where: { id } });
      if (!target) throw new NotFoundException('User not found');
      if (dto.role && dto.role !== 'admin' && target.role === 'admin') {
        await this.assertNotLastAdmin(tx, user.tenantId);
      }
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(dto.role ? { role: dto.role } : {}),
          ...(dto.password ? { passwordHash: bcrypt.hashSync(dto.password, 10) } : {}),
        },
        select: { id: true, email: true, role: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, userId: user.userId,
          action: 'user.update', entityType: 'user', entityId: id,
          before: { role: target.role },
          after: { role: updated.role, password_changed: !!dto.password },
        },
      });
      return updated;
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.requireAdmin(user);
    if (id === user.userId) {
      throw new BadRequestException('You cannot delete your own account');
    }
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const target = await tx.user.findFirst({ where: { id } });
      if (!target) throw new NotFoundException('User not found');
      if (target.role === 'admin') await this.assertNotLastAdmin(tx, user.tenantId);
      await tx.user.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, userId: user.userId,
          action: 'user.delete', entityType: 'user', entityId: id,
          before: { email: target.email, role: target.role },
        },
      });
    });
  }

  private async assertNotLastAdmin(tx: any, _tenantId: string) {
    const admins = await tx.user.count({ where: { role: 'admin' } });
    if (admins <= 1) {
      throw new BadRequestException('Cannot remove the last admin');
    }
  }

  private requireAdmin(user: AuthUser) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admins can manage users');
    }
  }
}
