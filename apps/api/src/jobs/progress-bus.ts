import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

export interface InstallEvent {
  step: string;
  title: string;
  status: 'start' | 'ok' | 'fail' | 'done' | 'skipped';
  detail?: string;
  at?: string;
}

/**
 * In-process pub/sub for install progress. SSE endpoints subscribe per site.
 * In JOBS_MODE=bullmq the worker process bridges these events over Redis
 * pub/sub (channel sf:install:<siteId>) so API-process subscribers still
 * receive them.
 */
@Injectable()
export class ProgressBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  publish(siteId: string, event: InstallEvent) {
    this.emitter.emit(`install:${siteId}`, { ...event, at: new Date().toISOString() });
  }

  subscribe(siteId: string, listener: (event: InstallEvent) => void): () => void {
    const channel = `install:${siteId}`;
    this.emitter.on(channel, listener);
    return () => this.emitter.off(channel, listener);
  }
}
