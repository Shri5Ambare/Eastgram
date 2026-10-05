import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role, User, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';

interface TokenContext {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    if (dto.classId) {
      const schoolClass = await this.prisma.schoolClass.findFirst({ where: { id: dto.classId, schoolId: dto.schoolId }, select: { id: true } });
      if (!schoolClass) throw new BadRequestException('Class does not belong to this school');
    }
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email.toLowerCase() }, { username: dto.username }] },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Email or username already in use');
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        username: dto.username,
        fullName: dto.fullName,
        passwordHash,
        schoolId: dto.schoolId,
        classId: dto.classId,
        role: Role.STUDENT,
        // New students start PENDING; an admin/teacher activates them.
        status: UserStatus.PENDING,
      },
    });

    return this.sanitize(user);
  }

  async login(dto: LoginDto, ctx: TokenContext) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.identifier.toLowerCase() },
          { username: dto.identifier },
        ],
      },
    });

    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status === UserStatus.PENDING) {
      throw new UnauthorizedException('Account is pending approval');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    return this.issueTokens(user, ctx);
  }

  async refresh(dto: RefreshDto, ctx: TokenContext) {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(dto.refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const tokenHash = this.hashToken(dto.refreshToken);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: payload.sub } });
        if (!user || user.status !== UserStatus.ACTIVE) {
          throw new UnauthorizedException('Account is not active');
        }
        // Compare-and-set: exactly one request can consume this token. Issuing
        // its replacement in the same transaction rolls consumption back on failure.
        const consumed = await tx.refreshToken.updateMany({
          where: { tokenHash, userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
          data: { revokedAt: new Date() },
        });
        if (consumed.count !== 1) throw new UnauthorizedException('Refresh token expired or revoked');
        return this.issueTokens(user, ctx, tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new UnauthorizedException('Refresh token already used; sign in again');
      }
      throw error;
    }
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  // ───────────────────────── helpers ─────────────────────────

  private async issueTokens(user: User, ctx: TokenContext, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: this.config.get<string>('jwt.accessTtl'),
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti: randomBytes(16).toString('hex') },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>('jwt.refreshTtl'),
      },
    );

    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    await db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        userAgent: ctx.userAgent,
        ip: ctx.ip,
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: this.sanitize(user),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private sanitize(user: User) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
