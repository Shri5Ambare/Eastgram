import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  Poll,
  PollStatus,
  PollType,
  Role,
} from '@prisma/client';
import { AuthUser } from '@common/decorators/current-user.decorator';
import { paginate, PaginationDto } from '@common/dto/pagination.dto';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePollDto, VoteDto } from './dto/poll.dto';

const ELECTION_CREATORS: Role[] = [Role.TEACHER, Role.ADMIN, Role.PRINCIPAL];
const QUICK_CREATORS: Role[] = [
  Role.AUTHORIZED_STUDENT,
  Role.TEACHER,
  Role.ADMIN,
  Role.PRINCIPAL,
];

@Injectable()
export class PollsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(user: AuthUser, dto: CreatePollDto) {
    const type = dto.type ?? PollType.QUICK;
    this.assertCanCreate(user, type);

    if (type === PollType.QUICK) {
      if (!dto.options || dto.options.length < 2) {
        throw new BadRequestException('Quick polls need at least 2 options');
      }
    } else if (!dto.candidates || dto.candidates.length < 1) {
      throw new BadRequestException(
        'Election / pageant polls need at least one candidate',
      );
    }

    const opensAt = dto.opensAt ? new Date(dto.opensAt) : new Date();
    const status =
      opensAt > new Date() ? PollStatus.SCHEDULED : PollStatus.OPEN;

    return this.prisma.poll.create({
      data: {
        creatorId: user.id,
        type,
        status,
        question: dto.question,
        description: dto.description,
        allowMultiple: dto.allowMultiple ?? false,
        maxSelections: dto.maxSelections ?? 1,
        isAnonymous: dto.isAnonymous ?? true,
        groupId: dto.groupId,
        opensAt,
        closesAt: dto.closesAt ? new Date(dto.closesAt) : null,
        options:
          type === PollType.QUICK
            ? {
                create: dto.options!.map((o, i) => ({
                  label: o.label,
                  position: i,
                })),
              }
            : undefined,
        candidates:
          type !== PollType.QUICK
            ? {
                create: dto.candidates!.map((c) => ({
                  displayName: c.displayName,
                  userId: c.userId,
                  category: c.category,
                  photoUrl: c.photoUrl,
                  manifesto: c.manifesto,
                })),
              }
            : undefined,
      },
      include: { options: true, candidates: true },
    });
  }

  async list(user: AuthUser, dto: PaginationDto) {
    const where = {
      creator: { schoolId: user.schoolId },
      ...(dto.q
        ? { question: { contains: dto.q, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.poll.findMany({
        where,
        include: { _count: { select: { votes: true } } },
        orderBy: { createdAt: 'desc' },
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.poll.count({ where }),
    ]);
    return paginate(items, total, dto.page, dto.limit);
  }

  async findOne(user: AuthUser, id: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { id },
      include: {
        options: { orderBy: { position: 'asc' } },
        candidates: { orderBy: { voteCount: 'desc' } },
        creator: { select: { id: true, username: true, fullName: true } },
      },
    });
    if (!poll) throw new NotFoundException('Poll not found');

    const myVotes = await this.prisma.vote.findMany({
      where: { pollId: id, voterId: user.id },
      select: { optionId: true, candidateId: true, category: true },
    });
    return { ...poll, myVotes };
  }

  async vote(user: AuthUser, pollId: string, dto: VoteDto) {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: true, candidates: true },
    });
    if (!poll) throw new NotFoundException('Poll not found');

    this.assertOpen(poll);

    const category = dto.category ?? '';

    if (poll.type === PollType.QUICK) {
      const option = poll.options.find((o) => o.id === dto.optionId);
      if (!option) throw new BadRequestException('Invalid option');
      return this.castVote(user.id, poll, { optionId: option.id, category });
    }

    // ELECTION / PAGEANT — vote for a candidate, one per category.
    const candidate = poll.candidates.find((c) => c.id === dto.candidateId);
    if (!candidate) throw new BadRequestException('Invalid candidate');
    if (poll.type === PollType.PAGEANT && !category && candidate.category) {
      // pageant votes are scoped to the candidate's category automatically
      return this.castVote(user.id, poll, {
        candidateId: candidate.id,
        category: candidate.category,
      });
    }
    return this.castVote(user.id, poll, {
      candidateId: candidate.id,
      category,
    });
  }

  async results(id: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { id },
      include: {
        options: { orderBy: { voteCount: 'desc' } },
        candidates: { orderBy: { voteCount: 'desc' } },
      },
    });
    if (!poll) throw new NotFoundException('Poll not found');

    const totalVotes = await this.prisma.vote.count({ where: { pollId: id } });
    return {
      id: poll.id,
      type: poll.type,
      status: poll.status,
      question: poll.question,
      totalVotes,
      options: poll.options,
      candidates: poll.candidates,
    };
  }

  async open(user: AuthUser, id: string) {
    await this.requireCreatorOrStaff(user, id);
    return this.prisma.poll.update({
      where: { id },
      data: { status: PollStatus.OPEN, opensAt: new Date() },
    });
  }

  async close(user: AuthUser, id: string) {
    const poll = await this.requireCreatorOrStaff(user, id);
    const closed = await this.prisma.poll.update({
      where: { id },
      data: { status: PollStatus.CLOSED, closesAt: new Date() },
    });
    // Notify the creator's followers? Keep it simple: notify creator.
    await this.notifications.notify({
      recipientId: poll.creatorId,
      type: NotificationType.POLL_RESULT,
      title: 'Your poll has closed — results are ready',
      data: { pollId: id },
    });
    return closed;
  }

  // ───────────────────────── helpers ─────────────────────────

  private async castVote(
    voterId: string,
    poll: Poll,
    target: { optionId?: string; candidateId?: string; category: string },
  ) {
    // Unique (pollId, voterId, category) prevents double voting per category.
    const already = await this.prisma.vote.findUnique({
      where: {
        pollId_voterId_category: {
          pollId: poll.id,
          voterId,
          category: target.category,
        },
      },
    });
    if (already) {
      throw new BadRequestException(
        target.category
          ? `You have already voted in "${target.category}"`
          : 'You have already voted in this poll',
      );
    }

    await this.prisma.$transaction([
      this.prisma.vote.create({
        data: {
          pollId: poll.id,
          voterId,
          optionId: target.optionId,
          candidateId: target.candidateId,
          category: target.category,
        },
      }),
      ...(target.optionId
        ? [
            this.prisma.pollOption.update({
              where: { id: target.optionId },
              data: { voteCount: { increment: 1 } },
            }),
          ]
        : []),
      ...(target.candidateId
        ? [
            this.prisma.pollCandidate.update({
              where: { id: target.candidateId },
              data: { voteCount: { increment: 1 } },
            }),
          ]
        : []),
    ]);

    return { success: true };
  }

  private assertCanCreate(user: AuthUser, type: PollType) {
    const allowed =
      type === PollType.QUICK
        ? QUICK_CREATORS.includes(user.role as Role)
        : ELECTION_CREATORS.includes(user.role as Role);
    if (!allowed) {
      throw new ForbiddenException(
        `You are not permitted to create ${type.toLowerCase()} polls`,
      );
    }
  }

  private assertOpen(poll: Poll) {
    const now = new Date();
    if (poll.status !== PollStatus.OPEN) {
      throw new BadRequestException('This poll is not open for voting');
    }
    if (poll.opensAt && poll.opensAt > now) {
      throw new BadRequestException('Voting has not started yet');
    }
    if (poll.closesAt && poll.closesAt < now) {
      throw new BadRequestException('Voting has closed');
    }
  }

  private async requireCreatorOrStaff(user: AuthUser, id: string) {
    const poll = await this.prisma.poll.findUnique({ where: { id } });
    if (!poll) throw new NotFoundException('Poll not found');
    const isStaff = ['ADMIN', 'PRINCIPAL', 'TEACHER'].includes(user.role);
    if (poll.creatorId !== user.id && !isStaff) {
      throw new ForbiddenException('You cannot manage this poll');
    }
    return poll;
  }
}
