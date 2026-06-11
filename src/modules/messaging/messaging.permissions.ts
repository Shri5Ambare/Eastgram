import { MessagePermission, Role } from '@prisma/client';

export interface MessagingActor {
  id: string;
  role: Role;
  classId: string | null;
  messagePermission: MessagePermission;
}

const STAFF_ROLES: Role[] = [Role.TEACHER, Role.ADMIN, Role.PRINCIPAL];

export function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

/**
 * Encodes the PRD rule: "Students cannot freely message others. Messaging is
 * permission-controlled." Determines whether `sender` may START a new direct
 * conversation with `recipient`.
 */
export function canInitiateConversation(
  sender: MessagingActor,
  recipient: MessagingActor,
): { allowed: boolean; reason?: string } {
  // Staff can always initiate to anyone in the school.
  if (isStaff(sender.role)) return { allowed: true };

  switch (sender.messagePermission) {
    case MessagePermission.FULL:
      return { allowed: true };

    case MessagePermission.CLASSMATES:
      // May message classmates, or any staff member (teachers/admins).
      if (isStaff(recipient.role)) return { allowed: true };
      if (sender.classId && sender.classId === recipient.classId) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'You may only message classmates or teachers',
      };

    case MessagePermission.REPLY_ONLY:
      // Can only message staff (e.g. ask a teacher); cannot DM peers.
      if (isStaff(recipient.role)) return { allowed: true };
      return {
        allowed: false,
        reason: 'You can only start conversations with teachers or staff',
      };

    case MessagePermission.NONE:
    default:
      return {
        allowed: false,
        reason: 'Messaging is disabled for your account',
      };
  }
}

/**
 * Whether `sender` may send a message into an EXISTING conversation they are a
 * member of. REPLY_ONLY users may reply once a conversation exists; NONE users
 * may not send at all.
 */
export function canSendInExisting(sender: MessagingActor): {
  allowed: boolean;
  reason?: string;
} {
  if (isStaff(sender.role)) return { allowed: true };
  if (sender.messagePermission === MessagePermission.NONE) {
    return { allowed: false, reason: 'Messaging is disabled for your account' };
  }
  return { allowed: true };
}
