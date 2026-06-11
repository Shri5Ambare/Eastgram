import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const apiPrefix = config.get<string>('app.apiPrefix')!;
  const port = config.get<number>('app.port')!;
  const corsOrigins = config.get<string[]>('app.corsOrigins')!;

  app.setGlobalPrefix(apiPrefix);
  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: corsOrigins.includes('*') ? true : corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Redis-backed Socket.IO adapter for multi-instance realtime.
  const redisAdapterEnabled = config.get<boolean>('redis.adapterEnabled', true);
  if (redisAdapterEnabled) {
    const redisAdapter = new RedisIoAdapter(app);
    redisAdapter.connect();
    app.useWebSocketAdapter(redisAdapter);
  }

  // Swagger / OpenAPI docs at /<prefix>/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('EduGram API')
    .setDescription('School social media platform backend')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');
  logger.log(`EduGram API listening on http://0.0.0.0:${port}/${apiPrefix}`);
  logger.log(`Swagger docs at http://localhost:${port}/${apiPrefix}/docs`);
}

bootstrap();
