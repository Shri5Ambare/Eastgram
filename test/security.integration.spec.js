// Requires a disposable PostgreSQL database; never points at production by default.
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { JwtService } = require('@nestjs/jwt');
const { PostsService } = require('../src/modules/posts/posts.service');
const { PostAccessService } = require('../src/modules/posts/post-access.service');
const { CommentsService } = require('../src/modules/posts/comments.service');
const { ReactionsService } = require('../src/modules/posts/reactions.service');
const { UsersService } = require('../src/modules/users/users.service');
const { AuthService } = require('../src/modules/auth/auth.service');

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('security regression with PostgreSQL', () => {
  let db, schools, actors, classes, records, posts, access, comments, reactions, users, auth;
  const notify = { notify: jest.fn().mockResolvedValue(undefined) };
  const realtime = { disconnectUser: jest.fn() };
  const pagination = { page: 1, limit: 100, skip: 0 };
  const jwt = new JwtService();
  const config = { get: key => ({
    'jwt.accessSecret': 'integration-access-secret-only',
    'jwt.refreshSecret': 'integration-refresh-secret-only',
    'jwt.accessTtl': '15m', 'jwt.refreshTtl': '1d',
  })[key] };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
    const suffix = randomUUID();
    schools = await Promise.all(['a', 'b'].map(name => db.school.create({ data: { name, slug: `${name}-${suffix}` } })));
    classes = await Promise.all([
      db.schoolClass.create({ data: { schoolId: schools[0].id, name: 'A' } }),
      db.schoolClass.create({ data: { schoolId: schools[0].id, name: 'B' } }),
      db.schoolClass.create({ data: { schoolId: schools[1].id, name: 'C' } }),
    ]);
    actors = await Promise.all([
      [0, 0, 'STUDENT'], [0, 0, 'STUDENT'], [0, 1, 'STUDENT'], [1, 2, 'ADMIN'], [0, null, 'ADMIN'],
    ].map(([school, cls, role], i) => db.user.create({ data: {
      schoolId: schools[school].id, classId: cls == null ? null : classes[cls].id,
      username: `security-${i}-${suffix}`, email: `${i}-${suffix}@example.test`, fullName: `Fixture ${i}`,
      passwordHash: 'not-used-for-login', role, status: 'ACTIVE',
    } })));
    records = {};
    for (const visibility of ['SCHOOL', 'CLASS', 'PRIVATE']) {
      records[visibility] = await db.post.create({ data: { authorId: actors[0].id, visibility } });
    }
    const group = await db.group.create({ data: {
      schoolId: schools[0].id, ownerId: actors[0].id, name: 'Club', slug: `club-${suffix}`,
      members: { create: [{ userId: actors[0].id, role: 'OWNER' }, { userId: actors[1].id, isApproved: false }] },
    } });
    records.CLUB = await db.post.create({ data: { authorId: actors[0].id, visibility: 'CLUB', groupId: group.id } });
    records.STORY = await db.post.create({ data: { authorId: actors[0].id, type: 'STORY', expiresAt: new Date(Date.now() - 1000) } });
    await db.follow.create({ data: { followerId: actors[2].id, followingId: actors[0].id } });
    access = new PostAccessService(db);
    posts = new PostsService(db, access);
    comments = new CommentsService(db, notify, access);
    reactions = new ReactionsService(db, notify, access);
    users = new UsersService(db, realtime);
    auth = new AuthService(db, jwt, config);
  }, 30000);

  afterAll(async () => {
    if (schools) await db.school.deleteMany({ where: { id: { in: schools.map(s => s.id) } } });
    if (db) await db.$disconnect();
  });

  test('direct reads deny other schools, private outsiders and expired stories', async () => {
    await expect(posts.findOne(actors[3], records.SCHOOL.id)).rejects.toThrow('Post not found');
    await expect(posts.findOne(actors[1], records.PRIVATE.id)).rejects.toThrow('Post not found');
    await expect(posts.findOne(actors[4], records.PRIVATE.id)).rejects.toThrow('Post not found');
    await expect(posts.findOne(actors[0], records.PRIVATE.id)).resolves.toMatchObject({ id: records.PRIVATE.id });
    await expect(posts.findOne(actors[0], records.STORY.id)).rejects.toThrow('Post not found');
  });

  test('following does not bypass private or class visibility in feed/profile/reels/stories', async () => {
    const feed = await posts.feed(actors[2], pagination);
    expect(feed.items.map(p => p.id)).toContain(records.SCHOOL.id);
    expect(feed.items.map(p => p.id)).not.toContain(records.PRIVATE.id);
    expect(feed.items.map(p => p.id)).not.toContain(records.CLASS.id);
    const profile = await posts.userPosts(actors[2], actors[0].username, 'POST', pagination);
    expect(profile.items.map(p => p.id)).toEqual([records.SCHOOL.id]);
    await expect(posts.userPosts(actors[3], actors[0].username, 'POST', pagination)).rejects.toThrow('User not found');
    const reel = await db.post.create({ data: { authorId: actors[0].id, type: 'REEL', visibility: 'PRIVATE' } });
    expect((await posts.reels(actors[2], pagination)).items.map(p => p.id)).not.toContain(reel.id);
    const story = await db.post.create({ data: { authorId: actors[0].id, type: 'STORY', visibility: 'PRIVATE', expiresAt: new Date(Date.now() + 60000) } });
    expect((await posts.stories(actors[2])).map(p => p.id)).not.toContain(story.id);
  });

  test('class and club membership are enforced by real database predicates', async () => {
    await expect(posts.findOne(actors[1], records.CLASS.id)).resolves.toMatchObject({ id: records.CLASS.id });
    await expect(posts.findOne(actors[2], records.CLASS.id)).rejects.toThrow('Post not found');
    await expect(posts.findOne(actors[1], records.CLUB.id)).rejects.toThrow('Post not found');
    await db.groupMember.update({ where: { groupId_userId: { groupId: records.CLUB.groupId, userId: actors[1].id } }, data: { isApproved: true } });
    await expect(posts.findOne(actors[1], records.CLUB.id)).resolves.toMatchObject({ id: records.CLUB.id });
  });

  test('other-school staff cannot update/delete posts or change users/classes', async () => {
    await expect(posts.update(actors[3], records.SCHOOL.id, { caption: 'blocked' })).rejects.toThrow('Post not found');
    await expect(posts.remove(actors[3], records.SCHOOL.id)).rejects.toThrow('Post not found');
    await expect(users.adminUpdate(actors[3], actors[0].id, { role: 'ADMIN' })).rejects.toThrow('User not found');
    await expect(users.adminUpdate(actors[4], actors[0].id, { classId: classes[2].id })).rejects.toThrow('Class not found');
    await expect(users.adminUpdate(actors[0], actors[1].id, { role: 'ADMIN' })).rejects.toThrow('Only school administrators');
    await expect(users.getProfile(actors[0].username, actors[3])).rejects.toThrow('User not found');
  });

  test('comments/replies/reactions and view counts cannot bypass post access', async () => {
    await expect(comments.create(actors[1], records.PRIVATE.id, { body: 'blocked' })).rejects.toThrow('Post not found');
    await expect(comments.list(actors[3], records.SCHOOL.id, pagination)).rejects.toThrow('Post not found');
    await expect(reactions.togglePost(actors[1], records.PRIVATE.id, 'LIKE')).rejects.toThrow('Post not found');
    await expect(posts.registerView(actors[3], records.SCHOOL.id)).rejects.toThrow('Post not found');
    const parent = await db.comment.create({ data: { authorId: actors[0].id, postId: records.PRIVATE.id, body: 'private' } });
    await expect(comments.replies(actors[1], parent.id, pagination)).rejects.toThrow('Post not found');
    await expect(reactions.toggleComment(actors[1], parent.id, 'LIKE')).rejects.toThrow('Post not found');
    await expect(comments.remove(actors[3], parent.id)).rejects.toThrow('Comment not found');
    await expect(comments.create(actors[0], records.SCHOOL.id, { body: 'wrong parent', parentId: parent.id })).rejects.toThrow('Parent comment not found');
    expect((await db.post.findUnique({ where: { id: records.SCHOOL.id } })).viewCount).toBe(0);
  });

  test('group association and class posts cannot borrow other-school resources', async () => {
    await expect(posts.create(actors[3], { groupId: records.CLUB.groupId, visibility: 'CLUB' })).rejects.toThrow('Group not found');
    await expect(posts.create(actors[4], { visibility: 'CLASS' })).rejects.toThrow('Class posts require');
    await expect(posts.create(actors[1], { visibility: 'CLUB' })).rejects.toThrow('Club posts require');
  });

  test('refresh rotation has one winner under concurrent real database transactions', async () => {
    // Direct invocation of the service's token helper seeds a valid test session.
    const session = await auth.issueTokens(actors[1], {});
    const attempts = await Promise.allSettled([
      auth.refresh({ refreshToken: session.refreshToken }, {}),
      auth.refresh({ refreshToken: session.refreshToken }, {}),
    ]);
    expect(attempts.filter(a => a.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(a => a.status === 'rejected')).toHaveLength(1);
    await expect(auth.refresh({ refreshToken: session.refreshToken }, {})).rejects.toThrow();
  });

  test('pending/suspended/deactivated accounts cannot refresh and suspension revokes tokens', async () => {
    for (const status of ['PENDING', 'SUSPENDED', 'DEACTIVATED']) {
      const session = await auth.issueTokens(actors[2], {});
      await db.user.update({ where: { id: actors[2].id }, data: { status } });
      await expect(auth.refresh({ refreshToken: session.refreshToken }, {})).rejects.toThrow('Account is not active');
      await db.user.update({ where: { id: actors[2].id }, data: { status: 'ACTIVE' } });
    }
    const session = await auth.issueTokens(actors[2], {});
    await users.adminUpdate(actors[4], actors[2].id, { status: 'SUSPENDED' });
    expect(await db.refreshToken.count({ where: { userId: actors[2].id, revokedAt: null } })).toBe(0);
    expect(realtime.disconnectUser).toHaveBeenCalledWith(actors[2].id);
    await expect(auth.refresh({ refreshToken: session.refreshToken }, {})).rejects.toThrow('Account is not active');
  });
});
