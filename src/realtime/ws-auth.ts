import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

/** Extracts and verifies the JWT from a socket handshake (auth.token or
 *  Authorization header). Returns the userId or null. */
export async function authenticateSocket(
  socket: Socket,
  jwt: JwtService,
  secret: string,
): Promise<{ userId: string; expiresAt: number } | null> {
  const raw =
    (socket.handshake.auth?.token as string) ||
    socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

  if (!raw || typeof raw !== 'string') return null;

  try {
    const payload = await jwt.verifyAsync<{ sub: string; exp: number }>(raw, { secret });
    if (typeof payload.sub !== 'string' || !payload.sub || !Number.isFinite(payload.exp) || payload.exp * 1000 <= Date.now()) return null;
    return { userId: payload.sub, expiresAt: payload.exp * 1000 };
  } catch {
    return null;
  }
}
