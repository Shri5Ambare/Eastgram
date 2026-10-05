const { JwtService } = require('@nestjs/jwt');
const { authenticateSocket } = require('../src/realtime/ws-auth');
const { RealtimeGateway } = require('../src/realtime/realtime.gateway');

describe('socket sessions', () => {
  const jwt = new JwtService();
  const secret = 'socket-fixture-only';
  test('requires a subject and a future expiry', async () => {
    const token = payload => jwt.sign(payload, { secret });
    const auth = raw => authenticateSocket({ handshake: { auth: { token: raw } } }, jwt, secret);
    expect(await auth(token({ sub: 'user', exp: Math.floor(Date.now() / 1000) + 60 }))).toMatchObject({ userId: 'user' });
    expect(await auth(token({ sub: 'user' }))).toBeNull();
    expect(await auth(token({ sub: '', exp: Math.floor(Date.now() / 1000) + 60 }))).toBeNull();
    expect(await auth(token({ sub: 'user', exp: Math.floor(Date.now() / 1000) - 1 }))).toBeNull();
  });

  test('disconnects at token expiry and clears its timer', async () => {
    jest.useFakeTimers();
    try {
      const client = {
        connected: true, id: 'socket-fixture', handshake: { auth: { token: jwt.sign({ sub: 'user' }, { secret, expiresIn: '1s' }) } },
        join: jest.fn().mockResolvedValue(undefined), emit: jest.fn(),
        disconnect: jest.fn(function () { this.connected = false; }),
      };
      const gateway = new RealtimeGateway(
        { emitToUser: jest.fn().mockResolvedValue(undefined) }, jwt, { get: () => secret },
        { setOnline: jest.fn().mockResolvedValue(undefined), setOffline: jest.fn().mockResolvedValue(1) },
        { user: { findFirst: jest.fn().mockResolvedValue({ id: 'user' }) } },
      );
      await gateway.handleConnection(client);
      expect(client.connected).toBe(true);
      jest.advanceTimersByTime(1100);
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.emit).toHaveBeenCalledWith('session:expired');
      await gateway.handleDisconnect(client);
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });

  test('revocation during room joining does not leave a connected socket', async () => {
    const client = {
      connected: true, id: 'socket-fixture', handshake: { auth: { token: jwt.sign({ sub: 'user' }, { secret, expiresIn: '1m' }) } },
      join: jest.fn().mockResolvedValue(undefined), emit: jest.fn(), disconnect: jest.fn(),
    };
    const setOnline = jest.fn();
    const gateway = new RealtimeGateway(
      {}, jwt, { get: () => secret }, { setOnline },
      { user: { findFirst: jest.fn().mockResolvedValueOnce({ id: 'user' }).mockResolvedValueOnce(null) } },
    );
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(setOnline).not.toHaveBeenCalled();
  });
});
