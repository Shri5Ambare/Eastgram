import type { Prisma } from '@prisma/client';

/** A stale conversation membership never enlarges a school's or club's audience. */
export function readableConversationWhere(user: { id: string; schoolId: string }): Prisma.ConversationWhereInput {
  return {
    members: {
      some: { userId: user.id, user: { schoolId: user.schoolId, status: 'ACTIVE' } },
      every: { user: { schoolId: user.schoolId } },
    },
    OR: [
      { groupId: null },
      { group: {
        schoolId: user.schoolId, isArchived: false,
        members: { some: { userId: user.id, isApproved: true } },
      } },
    ],
  };
}
