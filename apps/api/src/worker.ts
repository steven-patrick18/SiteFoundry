import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

// Deploy/build worker entrypoint. BullMQ queue processors (install pipeline,
// base provisioning, SSL renewal checks) register here starting with M3.
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  Logger.log('Worker ready — no queue processors registered yet', 'Worker');
}

bootstrap();
