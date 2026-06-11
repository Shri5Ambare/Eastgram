import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

/** Extracts and verifies the JWT from a socket handshake (auth.token or
 *  Authorization header). Returns the userId or null. */
export async function authenticateSocket(
  socket: Socket,
  jwt: JwtService,
  secret: string,
): Promise<{ userId: string } | null> {
  const raw =
    (socket.handshake.auth?.token as string) ||
    socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

  if (!raw) return null;

  try {
    const payload = await jwt.verifyAsync<{ sub: string }>(raw, { secret });
    return { userId: payload.sub };
  } catch {
    return null;
  }
}
