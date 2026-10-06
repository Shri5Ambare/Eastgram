// Boots the compiled production entry point against disposable PostgreSQL/Redis.
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const integration = process.env.TEST_HTTP_BOOT === 'true' ? describe : describe.skip;

integration('compiled HTTP application', () => {
  let child, db, schools, users, tokens, post;
  let output = '';
  const port = 34567;
  const base = `http://127.0.0.1:${port}/api/v1`;
  async function request(path, token, method = 'GET', body) {
    const result = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(5000),
    });
    return { status: result.status, body: await result.json() };
  }

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) throw new Error('HTTP checks require a disposable TEST_DATABASE_URL');
    db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
    const suffix = randomUUID();
    schools = await Promise.all(['a', 'b'].map(name => db.school.create({ data: { name, slug: 'http-' + name + '-' + suffix } })));
    const passwordHash = await argon2.hash('integration-password');
    users = await Promise.all(schools.map((school, i) => db.user.create({ data: {
      schoolId: school.id, username: 'http-' + i + '-' + suffix, email: i + '-' + suffix + '@example.test',
      fullName: 'HTTP fixture', passwordHash, role: 'ADMIN', status: 'ACTIVE',
    } })));
    child = spawn(process.execPath, ['dist/main.js'], {
      env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DATABASE_URL: process.env.TEST_DATABASE_URL,
        JWT_ACCESS_SECRET: 'http-test-access-secret-only', JWT_REFRESH_SECRET: 'http-test-refresh-secret-only',
        APP_SCHOOL_ID: schools[0].id, REDIS_ADAPTER_ENABLED: 'false', FCM_ENABLED: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const capture = chunk => { output = (output + chunk.toString()).slice(-20000); };
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error('Compiled app exited during startup: ' + output);
      try {
        const health = await request('/health');
        if (health.status === 200 && health.body.data.status === 'ok') { ready = true; break; }
      } catch (_) {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error('Compiled app readiness failed: ' + output);
    tokens = [];
    for (const user of [users[0]]) {
      const login = await request('/auth/login', null, 'POST', { identifier: user.email, password: 'integration-password' });
      expect(login.status).toBe(201);
      tokens.push(login.body.data.accessToken);
    }
    const { JwtService } = require('@nestjs/jwt');
    tokens.push(new JwtService().sign({ sub: users[1].id, email: users[1].email, role: users[1].role },
      { secret: 'http-test-access-secret-only', expiresIn: '5m' }));
    post = await db.post.create({ data: { authorId: users[0].id, visibility: 'PRIVATE', caption: 'private' } });
  }, 30000);

  afterAll(async () => {
    if (child && child.exitCode === null) {
      await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
    }
    if (schools) await db.school.deleteMany({ where: { id: { in: schools.map(s => s.id) } } });
    if (db) await db.$disconnect();
  }, 15000);

  test('production entry point loads aliases, health dependencies and Swagger', async () => {
    expect((await request('/health')).body.data.services).toEqual({ database: 'up', redis: 'up' });
    const docs = await fetch(base + '/docs-json');
    expect(docs.status).toBe(200);
    const schema = await docs.json();
    expect(schema.paths['/api/v1/users/me']).toBeDefined();
    expect(schema.paths['/api/v1/schools']).toBeUndefined();
    expect(schema.paths['/api/v1/school'].post).toBeUndefined();
  });

  test('guards and route order preserve /users/me and reject anonymous/foreign reads', async () => {
    expect((await request('/users/me')).status).toBe(401);
    expect((await request('/users/me', tokens[0])).body.data.id).toBe(users[0].id);
    expect((await request('/posts/' + post.id, tokens[1])).status).toBe(401);
    expect((await request('/posts/' + post.id, tokens[0])).body.data.id).toBe(post.id);
  });

  test('query conversion and strict DTO validation work through the HTTP pipeline', async () => {
    const feed = await request('/feed?page=1&limit=2', tokens[0]);
    expect(feed.status).toBe(200);
    expect(feed.body.meta.limit).toBe(2);
    expect((await request('/feed?page=invalid', tokens[0])).status).toBe(400);
    expect((await request('/posts', tokens[0], 'POST', { caption: 'bad', unexpected: true })).status).toBe(400);
    expect((await request('/auth/login', null, 'POST', { identifier: users[0].email, password: 'integration-password', role: 'ADMIN' })).status).toBe(400);
  });

  test('multi-school administration is removed and classes belong to this school', async () => {
    expect((await request('/schools', tokens[0], 'POST', { name: 'new', slug: 'new' })).status).toBe(404);
    expect((await request('/schools')).status).toBe(404);
    expect((await request('/school')).body.data.id).toBe(schools[0].id);
    expect((await request('/school/classes', tokens[0], 'POST', { name: 'bad', schoolId: schools[1].id })).status).toBe(400);
    const foreign = await request('/schools/' + schools[1].id + '/classes', tokens[0], 'POST', { name: 'blocked' });
    expect(foreign.status).toBe(404);
    const own = await request('/school/classes', tokens[0], 'POST', { name: 'allowed' });
    expect(own.status).toBe(201);
    expect(own.body.data.schoolId).toBe(schools[0].id);
  });

  test('registration assigns this school and legacy foreign accounts cannot log in', async () => {
    const suffix = randomUUID();
    const registration = { email: suffix + '@example.test', username: 'u' + suffix.replaceAll('-', '').slice(0, 20),
      fullName: 'New student', password: 'integration-password' };
    expect((await request('/auth/register', null, 'POST', { ...registration, schoolId: schools[1].id })).status).toBe(400);
    const created = await request('/auth/register', null, 'POST', registration);
    expect(created.status).toBe(201);
    expect(created.body.data.schoolId).toBe(schools[0].id);
    expect(created.body.data.status).toBe('PENDING');
    expect((await request('/auth/login', null, 'POST', { identifier: users[1].email, password: 'integration-password' })).status).toBe(401);
    const { JwtService } = require('@nestjs/jwt');
    const { createHash } = require('node:crypto');
    const legacyRefresh = new JwtService().sign({ sub: users[1].id, jti: randomUUID() },
      { secret: 'http-test-refresh-secret-only', expiresIn: '5m' });
    await db.refreshToken.create({ data: { userId: users[1].id,
      tokenHash: createHash('sha256').update(legacyRefresh).digest('hex'), expiresAt: new Date(Date.now() + 300000) } });
    expect((await request('/auth/refresh', null, 'POST', { refreshToken: legacyRefresh })).status).toBe(401);
    const foreignClass = await db.schoolClass.create({ data: { schoolId: schools[1].id, name: 'legacy class' } });
    expect((await request('/auth/register', null, 'POST', { ...registration, username: 'other' + suffix.replaceAll('-', '').slice(0, 20),
      email: 'other' + suffix + '@example.test', classId: foreignClass.id })).status).toBe(400);
    expect((await request('/school/classes', tokens[1], 'POST', { name: 'blocked' })).status).toBe(401);
  });

  test('refresh/reuse behavior and inactive-user rejection survive the real guards', async () => {
    const login = await request('/auth/login', null, 'POST', { identifier: users[0].email, password: 'integration-password' });
    const rotated = await request('/auth/refresh', null, 'POST', { refreshToken: login.body.data.refreshToken });
    expect(rotated.status).toBe(201);
    expect((await request('/auth/refresh', null, 'POST', { refreshToken: login.body.data.refreshToken })).status).toBe(401);
    await db.user.update({ where: { id: users[0].id }, data: { status: 'SUSPENDED' } });
    expect((await request('/users/me', rotated.body.data.accessToken)).status).toBe(401);
  });
});
