import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { SitesService } from './sites.service';
import { CreateSiteDto, UpdateSiteDto } from './dto';

@Controller('sites')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.sites.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sites.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSiteDto) {
    this.requireBuilder(user);
    return this.sites.create(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSiteDto,
  ) {
    this.requireBuilder(user);
    return this.sites.update(user, id, dto);
  }

  @Post(':id/validate')
  validate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sites.validate(user, id);
  }

  @Post(':id/archive')
  archive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.requireBuilder(user);
    return this.sites.archive(user, id);
  }

  private requireBuilder(user: AuthUser) {
    if (user.role === 'viewer') {
      throw new ForbiddenException('Viewers cannot modify sites');
    }
  }
}
