const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readablePostWhere } = require('../src/modules/posts/post-access.policy.ts');

// Evaluate a query against domain fixtures. Database execution is covered by
// the separate PostgreSQL integration suite, not this dependency-free check.
function matches(record, where) {
  if (record == null) return false;
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'AND') return expected.every(part => matches(record, part));
    if (key === 'OR') return expected.some(part => matches(record, part));
    const value = record[key];
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if ('not' in expected) return value !== expected.not;
      if ('gt' in expected) return value != null && value > expected.gt;
      if ('some' in expected) return Array.isArray(value) && value.some(item => matches(item, expected.some));
      return matches(value, expected);
    }
    return value === expected;
  });
}
const now = new Date('2026-10-05T12:00:00Z');
const viewer = { id: 'student-a', schoolId: 'school-a', classId: 'class-a', role: 'STUDENT' };
const post = { authorId: 'author-a', author: { schoolId: 'school-a', classId: 'class-a' }, type: 'POST', isArchived: false, visibility: 'SCHOOL' };
const can = (value, actor = viewer) => matches(value, readablePostWhere(actor, now));

test('school posts are readable only inside the school, including staff and owners', () => {
  assert.equal(can(post), true);
  assert.equal(can(post, { ...viewer, schoolId: 'school-b', role: 'PRINCIPAL' }), false);
  assert.equal(can({ ...post, authorId: viewer.id, author: { schoolId: 'school-b' } }), false);
});
test('private posts remain author-only; following or staff status does not bypass privacy', () => {
  const value = { ...post, visibility: 'PRIVATE' };
  assert.equal(can(value), false);
  assert.equal(can(value, { ...viewer, role: 'TEACHER' }), false);
  assert.equal(can(value, { ...viewer, id: post.authorId }), true);
});
test('class posts require the same non-null class or ownership', () => {
  const value = { ...post, visibility: 'CLASS' };
  assert.equal(can(value), true);
  assert.equal(can(value, { ...viewer, classId: 'class-b' }), false);
  assert.equal(can(value, { ...viewer, classId: null }), false);
  assert.equal(can({ ...value, author: { ...post.author, classId: null } }, { ...viewer, classId: null }), false);
});
test('club posts require approved membership of a non-archived same-school group', () => {
  const group = { schoolId: viewer.schoolId, isArchived: false, members: [{ userId: viewer.id, isApproved: true }] };
  const value = { ...post, visibility: 'CLUB', group };
  assert.equal(can(value), true);
  assert.equal(can({ ...value, group: { ...group, members: [] } }), false);
  assert.equal(can({ ...value, group: { ...group, members: [{ userId: viewer.id, isApproved: false }] } }), false);
  assert.equal(can({ ...value, group: { ...group, isArchived: true } }), false);
  assert.equal(can({ ...value, group: { ...group, schoolId: 'school-b' } }), false);
  assert.equal(can({ ...value, group: null }), false);
});
test('archived posts and expired or undated stories are not readable', () => {
  assert.equal(can({ ...post, isArchived: true }), false);
  assert.equal(can({ ...post, type: 'STORY', expiresAt: new Date(now.getTime() + 1000) }), true);
  assert.equal(can({ ...post, type: 'STORY', expiresAt: now }), false);
  assert.equal(can({ ...post, type: 'STORY', expiresAt: null }), false);
});
