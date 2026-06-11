import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GroupJoinPolicy,
  GroupRole,
  NotificationType,
  Role,
} from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { AuthUser } from '@common/decorators/current-user.decorator';
import { paginate, PaginationDto } from '@common/dto/pagination.dto';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateGroupDto, UpdateGroupDto } from './dto/group.dto';

const slugId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 6);

// PRD: "group creation is permission-controlled".
const GROUP_CREATORS: Role[] = [
  Role.AUTHORIZED_STUDENT,
  Role.TEACHER,
  Role.ADMIN,
  Role.PRINCIPAL,
];

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(user: AuthUser, dto: CreateGroupDto) {
    if (!GROUP_CREATORS.includes(user.role as Role)) {
      throw new ForbiddenException(
        'You are not permitted to create groups. Ask a teacher or admin.',
      );
    }

    const slug = `${this.slugify(dto.name)}-${slugId()}`;

    return this.prisma.group.create({
      data: {
        schoolId: user.schoolId,
        ownerId: user.id,
        name: dto.name,
        slug,
        type: dto.type,
        joinPolicy: dto.joinPolicy,
        description: dto.description,
        avatarUrl: dto.avatarUrl,
        coverUrl: dto.coverUrl,
        members: {
          create: { userId: user.id, role: GroupRole.OWNER, isApproved: true },
        },
      },
      include: { _count: { select: { members: true } } },
    });
  }

  async list(user: AuthUser, dto: PaginationDto) {
    const where = {
      schoolId: user.schoolId,
      isArchived: false,
      ...(dto.q
        ? { name: { contains: dto.q, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.group.findMany({
        where,
        include: { _count: { select: { members: true } } },
        orderBy: { createdAt: 'desc' },
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.group.count({ where }),
    ]);
    return paginate(items, total, dto.page, dto.limit);
  }

  async findOne(slug: string) {
    const group = await this.prisma.group.findUnique({
      where: { slug },
      include: {
        owner: { select: { id: true, username: true, fullName: true } },
        _count: { select: { members: true, posts: true } },
      },
    });
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  async update(user: AuthUser, id: string, dto: UpdateGroupDto) {
    await this.requireManager(user, id);
    return this.prisma.group.update({ where: { id }, data: dto });
  }

  async join(user: AuthUser, id: string) {
    const group = await this.prisma.group.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('Group not found');
    if (group.joinPolicy === GroupJoinPolicy.INVITE) {
      throw new ForbiddenException('This group is invite-only');
    }

    const existing = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: user.id } },
    });
    if (existing) throw new BadRequestException('Already a member or pending');

    const isApproved = group.joinPolicy === GroupJoinPolicy.OPEN;
    const member = await this.prisma.groupMember.create({
      data: { groupId: id, userId: user.id, isApproved },
    });

    if (!isApproved) {
      await this.notifications.notify({
        recipientId: group.ownerId,
        actorId: user.id,
        type: NotificationType.GROUP_JOIN_REQUEST,
        title: `New join request for ${group.name}`,
        data: { groupId: id },
      });
    }
    return member;
  }

  async leave(user: AuthUser, id: string) {
    const group = await this.prisma.group.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!group) throw new NotFoundException('Group not found');
    if (group.ownerId === user.id) {
      throw new BadRequestException('Owner cannot leave; transfer ownership first');
    }
    await this.prisma.groupMember.deleteMany({
      where: { groupId: id, userId: user.id },
    });
    return { success: true };
  }

  async approveMember(user: AuthUser, id: string, memberUserId: string) {
    await this.requireManager(user, id);
    const updated = await this.prisma.groupMember.updateMany({
      where: { groupId: id, userId: memberUserId, isApproved: false },
      data: { isApproved: true },
    });
    if (updated.count === 0) {
      throw new NotFoundException('No pending request for this user');
    }
    await this.notifications.notify({
      recipientId: memberUserId,
      actorId: user.id,
      type: NotificationType.GROUP_INVITE,
      title: 'Your join request was approved',
      data: { groupId: id },
    });
    return { success: true };
  }

  async members(id: string, dto: PaginationDto) {
    const where = { groupId: id, isApproved: true };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.groupMember.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
              role: true,
            },
          },
        },
        orderBy: { joinedAt: 'asc' },
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.groupMember.count({ where }),
    ]);
    return paginate(items, total, dto.page, dto.limit);
  }

  // ───────────────────────── helpers ─────────────────────────

  /** Owner / moderator of the group, or school staff. */
  private async requireManager(user: AuthUser, groupId: string) {
    if (['ADMIN', 'PRINCIPAL'].includes(user.role)) return;
    const member = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: user.id } },
      select: { role: true },
    });
    if (!member || member.role === GroupRole.MEMBER) {
      throw new ForbiddenException('You are not a manager of this group');
    }
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }
}
