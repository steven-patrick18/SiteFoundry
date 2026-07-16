import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ServersService } from './servers.service';
import { CreateServerDto, RotateCredentialDto, UpdateServerDto } from './dto';

@Controller('servers')
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateServerDto) {
    this.requireBuilder(user);
    return this.servers.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.servers.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.servers.get(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServerDto,
  ) {
    this.requireBuilder(user);
    return this.servers.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.requireBuilder(user);
    await this.servers.remove(user, id);
  }

  @Post(':id/test-connection')
  testConnection(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.requireBuilder(user);
    return this.servers.testConnection(user, id);
  }

  @Post(':id/rotate-credential')
  rotate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RotateCredentialDto,
  ) {
    this.requireBuilder(user);
    return this.servers.rotateCredential(user, id, dto);
  }

  /** Streams provisioning progress as Server-Sent Events over POST. */
  @Post(':id/provision-base')
  async provisionBase(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    this.requireBuilder(user);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      for await (const event of this.servers.provisionBase(user, id)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err: any) {
      res.write(
        `data: ${JSON.stringify({
          step: 'internal', title: 'Provisioning',
          status: 'fail', detail: String(err?.message ?? err),
        })}\n\n`,
      );
    }
    res.end();
  }

  private requireBuilder(user: AuthUser) {
    if (user.role === 'viewer') {
      throw new ForbiddenException('Viewers cannot modify servers');
    }
  }
}
