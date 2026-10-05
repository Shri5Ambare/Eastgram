// Requires a disposable PostgreSQL database; never points at production by default.
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { JwtService } = require('@nestjs/jwt');
const { PostsService } = require('../src/modules/posts/posts.service');
const { PostAccessService } = require('../src/modules/posts/post-access.service');
const { CommentsService } = require('../src/modules/posts/comments.service');
const { ReactionsService } = require('../src/modules/posts/reactions.service');
const { UsersService } = require('../src/modules/users/users.service');
const { MessagingService } = require('../src/modules/messaging/messaging.service');
const { MediaService } = require('../src/modules/media/media.service');
const { RealtimeService } = require('../src/realtime/realtime.service');
const { GroupsService } = require('../src/modules/groups/groups.service');
const { EventsService } = require('../src/modules/events/events.service');
const { PollsService } = require('../src/modules/polls/polls.service');
const { FollowsService } = require('../src/modules/follows/follows.service');
const { AchievementsService } = require('../src/modules/achievements/achievements.service');
const { AuthService } = require('../src/modules/auth/auth.service');

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('security regression with PostgreSQL', () => {
  let db, schools, actors, classes, records, posts, access, comments, reactions, users, auth, groups, events, polls, follows, achievements, catalog, messaging, media;
  const notify = { notify: jest.fn().mockResolvedValue(undefined), notifyMany: jest.fn().mockResolvedValue(undefined) };
  const realtime = { disconnectUser: jest.fn(), joinConversation: jest.fn(), emitToConversation: jest.fn().mockResolvedValue(undefined) };
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
    posts = new PostsService(db, access, { signedReadUrl: jest.fn(async key => 'https://signed.example.test/' + key) });
    comments = new CommentsService(db, notify, access);
    reactions = new ReactionsService(db, notify, access);
    users = new UsersService(db, realtime);
    auth = new AuthService(db, jwt, config);
    messaging = new MessagingService(db, realtime, notify);
    media = new MediaService(db, { get: key => ({
      'r2.endpoint': 'https://account.r2.cloudflarestorage.com', 'r2.bucket': 'test-private-bucket',
      'r2.accessKeyId': 'test-key', 'r2.secretAccessKey': 'test-secret', 'r2.presignTtl': 900,
      'r2.publicUrl': 'https://old-public.example.test',
    })[key] });
    groups = new GroupsService(db, notify);
    events = new EventsService(db);
    polls = new PollsService(db, notify);
    follows = new FollowsService(db, notify);
    achievements = new AchievementsService(db, notify);
  }, 30000);

  afterAll(async () => {
    if (records?.conversations?.length) await db.conversation.deleteMany({ where: { id: { in: records.conversations } } });
    if (catalog) await db.achievement.delete({ where: { id: catalog.id } });
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

  test('groups isolate reads, joining and management even for other-school staff', async () => {
    const group = await db.group.findUnique({ where: { id: records.CLUB.groupId } });
    await expect(groups.findOne(actors[3], group.slug)).rejects.toThrow('Group not found');
    await expect(groups.join(actors[3], group.id)).rejects.toThrow('Group not found');
    await expect(groups.leave(actors[3], group.id)).rejects.toThrow('Group not found');
    await expect(groups.members(actors[3], group.id, pagination)).rejects.toThrow('Group not found');
    await expect(groups.update(actors[3], group.id, { name: 'blocked' })).rejects.toThrow('Group not found');
    await db.groupMember.update({ where: { groupId_userId: { groupId: group.id, userId: actors[1].id } }, data: { role: 'MODERATOR', isApproved: false } });
    await expect(groups.update(actors[1], group.id, { name: 'blocked' })).rejects.toThrow('not a manager');
    await expect(groups.findOne(actors[0], group.slug)).resolves.toMatchObject({ id: group.id });
  });

  test('events enforce school/group access for detail, RSVP, attendees and management', async () => {
    const event = await events.create(actors[4], { title: 'School event', startsAt: new Date().toISOString() });
    for (const attempt of [
      () => events.findOne(actors[3], event.id), () => events.rsvp(actors[3], event.id, { status: 'GOING' }),
      () => events.attendees(actors[3], event.id, pagination), () => events.update(actors[3], event.id, { title: 'blocked' }),
    ]) await expect(attempt()).rejects.toThrow('Event not found');
    await expect(events.create(actors[3], { title: 'blocked', startsAt: new Date().toISOString(), groupId: records.CLUB.groupId })).rejects.toThrow('Group not found');
    await db.groupMember.create({ data: { groupId: records.CLUB.groupId, userId: actors[4].id } });
    const clubEvent = await events.create(actors[4], { title: 'Club event', startsAt: new Date().toISOString(), groupId: records.CLUB.groupId });
    await expect(events.findOne(actors[1], clubEvent.id)).rejects.toThrow('Event not found');
    expect((await events.list(actors[1], pagination)).items.map(e => e.id)).not.toContain(clubEvent.id);
    await db.event.update({ where: { id: event.id }, data: { status: 'DRAFT' } });
    await expect(events.findOne(actors[0], event.id)).rejects.toThrow('Event not found');
    await expect(events.findOne(actors[4], event.id)).resolves.toMatchObject({ id: event.id });
  });

  test('poll school/group/post scope and list response are consistent', async () => {
    const poll = await polls.create(actors[4], { question: 'Choose', options: [{ label: 'A' }, { label: 'B' }] });
    records.POLL = poll;
    await expect(polls.findOne(actors[3], poll.id)).rejects.toThrow('Poll not found');
    await expect(polls.results(actors[3], poll.id)).rejects.toThrow('Poll not found');
    await expect(polls.vote(actors[3], poll.id, { optionId: poll.options[0].id })).rejects.toThrow('Poll not found');
    await expect(polls.close(actors[3], poll.id)).rejects.toThrow('Poll not found');
    await expect(polls.create(actors[3], { question: 'blocked', groupId: records.CLUB.groupId, options: [{ label: 'A' }, { label: 'B' }] })).rejects.toThrow('Group not found');
    await expect(polls.create(actors[4], { type: 'ELECTION', question: 'blocked', candidates: [{ displayName: 'Foreign', userId: actors[3].id }] })).rejects.toThrow('Candidate not found');
    const clubPoll = await polls.create(actors[4], { question: 'Club', groupId: records.CLUB.groupId, options: [{ label: 'A' }, { label: 'B' }] });
    await expect(polls.results(actors[1], clubPoll.id)).rejects.toThrow('Poll not found');
    const list = await polls.list(actors[1], pagination);
    expect(list.items.find(p => p.id === poll.id)).toMatchObject({ options: expect.any(Array), myVotes: [] });
    expect(list.items.map(p => p.id)).not.toContain(clubPoll.id);
    await db.poll.update({ where: { id: clubPoll.id }, data: { groupId: null, postId: records.PRIVATE.id } });
    await expect(polls.findOne(actors[1], clubPoll.id)).rejects.toThrow('Poll not found');
  });

  test('changing the vote category cannot bypass one vote per poll/category', async () => {
    const poll = records.POLL;
    await polls.vote(actors[1], poll.id, { optionId: poll.options[0].id });
    await expect(polls.vote(actors[1], poll.id, { optionId: poll.options[1].id, category: 'again' })).rejects.toThrow('Invalid category');
    await expect(polls.vote(actors[1], poll.id, { optionId: poll.options[1].id })).rejects.toThrow('already voted');
    const pageant = await polls.create(actors[4], { type: 'PAGEANT', question: 'Choose', candidates: [
      { displayName: 'A', category: 'Arts' }, { displayName: 'B', category: 'Arts' },
      { displayName: 'C', category: 'Sports' },
    ] });
    await polls.vote(actors[1], pageant.id, { candidateId: pageant.candidates[0].id });
    await expect(polls.vote(actors[1], pageant.id, { candidateId: pageant.candidates[1].id, category: 'fake' })).rejects.toThrow('Invalid category');
    await expect(polls.vote(actors[1], pageant.id, { candidateId: pageant.candidates[1].id })).rejects.toThrow('already voted');
    await expect(polls.vote(actors[1], pageant.id, { candidateId: pageant.candidates[2].id })).resolves.toMatchObject({ success: true });
    expect(await db.vote.count({ where: { pollId: poll.id, voterId: actors[1].id } })).toBe(1);
  });

  test('concurrent votes produce one count and a controlled duplicate error', async () => {
    const poll = records.POLL;
    const results = await Promise.allSettled([
      polls.vote(actors[0], poll.id, { optionId: poll.options[0].id }),
      polls.vote(actors[0], poll.id, { optionId: poll.options[1].id }),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find(r => r.status === 'rejected');
    expect(failed.reason.getStatus()).toBe(400);
    const total = await polls.results(actors[0], poll.id);
    expect(total.totalVotes).toBe(2);
    expect(total.options.reduce((sum, o) => sum + o.voteCount, 0)).toBe(2);
  });

  test('follows deny foreign users and filter legacy cross-school relations', async () => {
    await expect(follows.follow(actors[0], actors[3].username)).rejects.toThrow('User not found');
    await expect(follows.unfollow(actors[0], actors[3].username)).rejects.toThrow('User not found');
    await expect(follows.followers(actors[3], actors[0].username, pagination)).rejects.toThrow('User not found');
    await db.follow.create({ data: { followerId: actors[3].id, followingId: actors[0].id, status: 'PENDING' } });
    await expect(follows.acceptRequest(actors[0], actors[3].id)).rejects.toThrow('No pending request');
    expect((await follows.pendingRequests(actors[0], pagination)).items).toHaveLength(0);
    await db.follow.update({ where: { followerId_followingId: { followerId: actors[3].id, followingId: actors[0].id } }, data: { status: 'ACCEPTED' } });
    expect((await follows.followers(actors[0], actors[0].username, pagination)).items.map(u => u.id)).not.toContain(actors[3].id);
    expect((await follows.following(actors[3], actors[3].username, pagination)).items).toHaveLength(0);
  });

  test('achievement awards require school staff and same-school recipients', async () => {
    expect(() => achievements.createCatalog(actors[0], { name: 'blocked' })).toThrow('Only school staff');
    catalog = await achievements.createCatalog(actors[4], { name: 'Fixture badge' });
    await expect(achievements.award(actors[0], { achievementId: catalog.id, recipientId: actors[1].id })).rejects.toThrow('Only school staff');
    await expect(achievements.award(actors[3], { achievementId: catalog.id, recipientId: actors[1].id })).rejects.toThrow('User not found');
    await expect(achievements.award(actors[4], { achievementId: catalog.id, recipientId: actors[1].id })).resolves.toMatchObject({ recipientId: actors[1].id });
    await expect(achievements.userAchievements(actors[3], actors[1].username, pagination)).rejects.toThrow('User not found');
    expect((await achievements.userAchievements(actors[0], actors[1].username, pagination)).items).toHaveLength(1);
  });

  test('messaging enforces tenant/group access, attachment ownership and reply thread', async () => {
    records.conversations = [];
    const create = async (memberIds, groupId) => {
      const conversation = await db.conversation.create({ data: { groupId, members: { create: memberIds.map(userId => ({ userId })) } } });
      records.conversations.push(conversation.id);
      return conversation;
    };
    const direct = await create([actors[0].id, actors[1].id]);
    const other = await create([actors[0].id, actors[4].id]);
    const foreign = await create([actors[0].id, actors[3].id]);
    const club = await create([actors[0].id, actors[1].id], records.CLUB.groupId);
    records.DIRECT = direct;
    records.CLUB_CHAT = club;
    await expect(messaging.getConversation(actors[0], foreign.id)).rejects.toThrow('not part');
    await expect(messaging.listMessages(actors[3], direct.id, pagination)).rejects.toThrow('not part');
    await expect(messaging.markRead(actors[1], club.id)).rejects.toThrow('not part');
    expect((await messaging.listConversations(actors[0], pagination)).items.map(c => c.id)).not.toContain(foreign.id);
    const attachment = await db.media.create({ data: { ownerId: actors[1].id, type: 'IMAGE', key: 'fixture/' + randomUUID(), url: 'https://legacy.example.test' } });
    await expect(messaging.send(actors[0], direct.id, { mediaId: attachment.id })).rejects.toThrow('Attachment not found');
    const parent = await db.message.create({ data: { senderId: actors[0].id, conversationId: other.id, body: 'other thread' } });
    await expect(messaging.send(actors[0], direct.id, { body: 'wrong reply', replyToId: parent.id })).rejects.toThrow('Reply message not found');
    await expect(messaging.send(actors[1], direct.id, { mediaId: attachment.id, body: 'mine' })).resolves.toMatchObject({ mediaId: attachment.id });
    await db.user.update({ where: { id: actors[4].id }, data: { status: 'SUSPENDED' } });
    await expect(messaging.startDirect(actors[0], { recipientId: actors[4].id })).rejects.toThrow('Recipient not found');
    await db.user.update({ where: { id: actors[4].id }, data: { status: 'ACTIVE' } });
  });

  test('realtime delivery ignores stale rooms and rechecks active club members', async () => {
    const service = new RealtimeService(db);
    const emit = jest.fn();
    const server = { to: jest.fn(() => ({ emit })) };
    service.bind(server);
    await service.emitToConversation(records.CLUB_CHAT.id, 'message:new', { body: 'club' });
    expect(server.to).toHaveBeenLastCalledWith([`user:${actors[0].id}`]);
    await db.groupMember.update({ where: { groupId_userId: { groupId: records.CLUB.groupId, userId: actors[1].id } }, data: { isApproved: true } });
    await service.emitToConversation(records.CLUB_CHAT.id, 'message:new', { body: 'approved' });
    expect(server.to.mock.calls.at(-1)[0]).toEqual(expect.arrayContaining([`user:${actors[0].id}`, `user:${actors[1].id}`]));
    await db.user.update({ where: { id: actors[1].id }, data: { status: 'SUSPENDED' } });
    await service.emitToConversation(records.CLUB_CHAT.id, 'message:new', { body: 'revoked' });
    expect(server.to).toHaveBeenLastCalledWith([`user:${actors[0].id}`]);
    await db.user.update({ where: { id: actors[1].id }, data: { status: 'ACTIVE' } });
    await db.groupMember.update({ where: { groupId_userId: { groupId: records.CLUB.groupId, userId: actors[1].id } }, data: { isApproved: false } });
    await db.group.update({ where: { id: records.CLUB.groupId }, data: { isArchived: true } });
    const before = emit.mock.calls.length;
    await service.emitToConversation(records.CLUB_CHAT.id, 'message:new', {});
    expect(emit.mock.calls.length).toBe(before);
    await db.group.update({ where: { id: records.CLUB.groupId }, data: { isArchived: false } });
  });

  test('upload confirmation verifies object ownership, actual metadata and idempotency', async () => {
    const key = `image/${actors[0].id}/1234567890-abcdefghijklmnop.png`;
    media.s3.send = jest.fn().mockResolvedValue({ Metadata: { ownerid: actors[0].id, mediatype: 'IMAGE' }, ContentType: 'image/png', ContentLength: 12 });
    await expect(media.confirmUpload(actors[1].id, { key, type: 'IMAGE' })).rejects.toThrow('does not belong');
    expect(media.s3.send).not.toHaveBeenCalled();
    await expect(media.confirmUpload(actors[0].id, { key, type: 'IMAGE', sizeBytes: 13 })).rejects.toThrow('size does not match');
    media.s3.send.mockResolvedValueOnce({ Metadata: { ownerid: actors[1].id, mediatype: 'IMAGE' }, ContentType: 'image/png', ContentLength: 12 });
    await expect(media.confirmUpload(actors[0].id, { key, type: 'IMAGE' })).rejects.toThrow('ownership');
    const confirmed = await media.confirmUpload(actors[0].id, { key, type: 'IMAGE', mimeType: 'image/png', sizeBytes: 12 });
    expect(confirmed.url).toContain('X-Amz-Signature=');
    expect(confirmed.thumbnailUrl).toBeNull();
    expect((await media.confirmUpload(actors[0].id, { key, type: 'IMAGE' })).id).toBe(confirmed.id);
    records.MEDIA = confirmed;
    await expect(media.createPresignedUpload(actors[0].id, { type: 'IMAGE', mimeType: 'image/svg+xml', fileName: 'unsafe.svg' })).rejects.toThrow('Unsupported');
  });

  test('media URLs require owning post/message audience and cannot leak via moderation', async () => {
    const privatePost = await posts.create(actors[0], { visibility: 'PRIVATE', mediaIds: [records.MEDIA.id] });
    expect(privatePost.media[0].media.url).toContain('signed.example.test');
    await expect(media.access(actors[1], records.MEDIA.id)).rejects.toThrow('Media not found');
    await expect(media.access(actors[3], records.MEDIA.id)).rejects.toThrow('Media not found');
    expect((await posts.update(actors[4], privatePost.id, { caption: 'moderated' })).media).toEqual([]);
    await db.message.create({ data: { conversationId: records.DIRECT.id, senderId: actors[0].id, mediaId: records.MEDIA.id } });
    await expect(media.access(actors[1], records.MEDIA.id)).resolves.toMatchObject({ expiresIn: 300, url: expect.stringContaining('X-Amz-Signature=') });
    await db.conversationMember.delete({ where: { conversationId_userId: { conversationId: records.DIRECT.id, userId: actors[1].id } } });
    await expect(media.access(actors[1], records.MEDIA.id)).rejects.toThrow('Media not found');
  });

  test('deleting a comment counts all cascaded replies and handles concurrent deletions', async () => {
    const post = await posts.create(actors[0], { visibility: 'SCHOOL' });
    const root = await comments.create(actors[0], post.id, { body: 'root' });
    const reply = await comments.create(actors[1], post.id, { body: 'reply', parentId: root.id });
    await comments.create(actors[0], post.id, { body: 'nested reply', parentId: reply.id });
    const other = await comments.create(actors[0], post.id, { body: 'keep' });
    expect((await db.post.findUnique({ where: { id: post.id } })).commentCount).toBe(4);
    await comments.remove(actors[0], root.id);
    expect((await db.post.findUnique({ where: { id: post.id } })).commentCount).toBe(1);
    expect(await db.comment.count({ where: { postId: post.id } })).toBe(1);
    const another = await comments.create(actors[0], post.id, { body: 'second' });
    await Promise.all([comments.remove(actors[0], other.id), comments.remove(actors[0], another.id)]);
    expect((await db.post.findUnique({ where: { id: post.id } })).commentCount).toBe(0);
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
