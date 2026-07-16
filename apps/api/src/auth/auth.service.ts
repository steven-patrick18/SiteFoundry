import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string; role: string; tenantId: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<TokenPair> {
    // Pre-auth: no tenant context exists yet, so this single lookup uses the
    // admin client. Everything after authentication is tenant-scoped.
    const user = await this.prisma.admin.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
    );

    return this.issueTokens(user.id, user.tenantId, user.email, user.role);
  }

  /** Self-service password change — verifies the current password first. */
  async changePassword(
    userId: string,
    tenantId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (newPassword.length < 8) {
      throw new UnauthorizedException('New password must be at least 8 characters');
    }
    const user = await this.prisma.admin.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.update({
        where: { id: userId },
        data: { passwordHash: bcrypt.hashSync(newPassword, 10) },
      }),
    );
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Not a refresh token');
    }
    const user = await this.prisma.withTenant(payload.tenantId, (tx) =>
      tx.user.findFirst({ where: { id: payload.sub } }),
    );
    if (!user) throw new UnauthorizedException('User no longer exists');
    return this.issueTokens(user.id, user.tenantId, user.email, user.role);
  }

  private async issueTokens(
    userId: string,
    tenantId: string,
    email: string,
    role: string,
  ): Promise<TokenPair> {
    const base = { sub: userId, tenantId, email, role };
    const [access_token, refresh_token] = await Promise.all([
      this.jwt.signAsync({ ...base, type: 'access' }, { expiresIn: '1h' }),
      this.jwt.signAsync({ ...base, type: 'refresh' }, { expiresIn: '7d' }),
    ]);
    return {
      access_token,
      refresh_token,
      user: { id: userId, email, role, tenantId },
    };
  }
}
