import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('category') category?: string) {
    return this.templates.list(user, category);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.get(user, id);
  }

  /** Admin only — multipart with optional `package` zip (§10). */
  @Post()
  @UseInterceptors(
    FileInterceptor('package', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTemplateDto,
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admins can upload templates');
    }
    return this.templates.create(user, dto, file?.buffer);
  }

  @Patch(':id/deprecate')
  deprecate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admins can deprecate templates');
    }
    return this.templates.deprecate(user, id);
  }
}
