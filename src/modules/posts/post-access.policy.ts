import type { Prisma } from '@prisma/client';
import type { AuthUser } from '@common/decorators/current-user.decorator';

/** Following and staff roles never enlarge a post's audience. */
export function readablePostWhere(user: AuthUser, now = new Date()): Prisma.PostWhereInput {
  const audiences: Prisma.PostWhereInput[] = [
    { authorId: user.id },
    { visibility: 'SCHOOL' },
    {
      visibility: 'CLUB',
      group: {
        schoolId: user.schoolId, isArchived: false,
        members: { some: { userId: user.id, isApproved: true } },
      },
    },
  ];
  if (user.classId) audiences.push({ visibility: 'CLASS', author: { classId: user.classId } });
  return {
    author: { schoolId: user.schoolId },
    isArchived: false,
    AND: [
      { OR: [{ type: { not: 'STORY' } }, { expiresAt: { gt: now } }] },
      { OR: audiences },
    ],
  };
}
