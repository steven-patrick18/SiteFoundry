import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { AuthUser, CurrentUser } from './current-user.decorator';

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

class RefreshDto {
  @IsString()
  refresh_token!: string;
}

class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  current_password!: string;

  @IsString()
  @MinLength(8)
  new_password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // §13: 5/min/IP
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refresh_token);
  }

  /** Authenticated self-service password change. */
  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.auth.changePassword(
      user.userId, user.tenantId, dto.current_password, dto.new_password,
    );
  }
}
