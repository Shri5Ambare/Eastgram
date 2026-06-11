import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { existsSync } from 'fs';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Firebase Cloud Messaging wrapper. Push is optional in dev — when
 * FCM_ENABLED=false or the service-account file is missing, sends are no-ops.
 */
@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private app?: admin.app.App;
  private enabled = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const enabled = this.config.get<boolean>('fcm.enabled');
    const path = this.config.get<string>('fcm.serviceAccountPath');

    if (!enabled) {
      this.logger.warn('FCM disabled (FCM_ENABLED=false) — push is a no-op');
      return;
    }
    if (!path || !existsSync(path)) {
      this.logger.warn(`FCM service account not found at ${path} — push disabled`);
      return;
    }

    this.app = admin.apps.length
      ? admin.app()
      : admin.initializeApp({
          credential: admin.credential.cert(require(require('path').resolve(path))),
        });
    this.enabled = true;
    this.logger.log('FCM initialised');
  }

  async sendToUser(
    userId: string,
    payload: { title: string; body?: string; data?: Record<string, string> },
  ): Promise<void> {
    if (!this.enabled || !this.app) return;

    const devices = await this.prisma.device.findMany({
      where: { userId },
      select: { fcmToken: true },
    });
    if (!devices.length) return;

    const tokens = devices.map((d) => d.fcmToken);
    try {
      const res = await this.app.messaging().sendEachForMulticast({
        tokens,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
      });
      await this.pruneInvalidTokens(res.responses, tokens);
    } catch (err) {
      this.logger.error(`FCM send failed: ${(err as Error).message}`);
    }
  }

  private async pruneInvalidTokens(
    responses: admin.messaging.SendResponse[],
    tokens: string[],
  ) {
    const dead = responses
      .map((r, i) => (!r.success ? tokens[i] : null))
      .filter((t): t is string => Boolean(t));
    if (dead.length) {
      await this.prisma.device.deleteMany({
        where: { fcmToken: { in: dead } },
      });
    }
  }
}
