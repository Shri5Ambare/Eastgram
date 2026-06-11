import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventStatus, Role } from '@prisma/client';
import { AuthUser } from '@common/decorators/current-user.decorator';
import { paginate, PaginationDto } from '@common/dto/pagination.dto';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateEventDto, RsvpDto, UpdateEventDto } from './dto/event.dto';

const EVENT_CREATORS: Role[] = [
  Role.AUTHORIZED_STUDENT,
  Role.TEACHER,
  Role.ADMIN,
  Role.PRINCIPAL,
];

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, dto: CreateEventDto) {
    if (!EVENT_CREATORS.includes(user.role as Role)) {
      throw new ForbiddenException('You are not permitted to create events');
    }
    return this.prisma.event.create({
      data: {
        schoolId: user.schoolId,
        organizerId: user.id,
        groupId: dto.groupId,
        title: dto.title,
        description: dto.description,
        location: dto.location,
        coverUrl: dto.coverUrl,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        status: EventStatus.PUBLISHED,
      },
    });
  }

  async list(user: AuthUser, dto: PaginationDto) {
    const where = {
      schoolId: user.schoolId,
      status: EventStatus.PUBLISHED,
      ...(dto.q
        ? { title: { contains: dto.q, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        include: {
          organizer: { select: { id: true, username: true, fullName: true } },
          _count: { select: { rsvps: true } },
        },
        orderBy: { startsAt: 'asc' },
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.event.count({ where }),
    ]);
    return paginate(items, total, dto.page, dto.limit);
  }

  async findOne(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        organizer: { select: { id: true, username: true, fullName: true } },
        _count: { select: { rsvps: true } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async update(user: AuthUser, id: string, dto: UpdateEventDto) {
    await this.requireOrganizerOrStaff(user, id);
    return this.prisma.event.update({
      where: { id },
      data: {
        ...dto,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });
  }

  async rsvp(user: AuthUser, id: string, dto: RsvpDto) {
    await this.findOne(id);
    return this.prisma.eventRsvp.upsert({
      where: { eventId_userId: { eventId: id, userId: user.id } },
      create: { eventId: id, userId: user.id, status: dto.status },
      update: { status: dto.status },
    });
  }

  async attendees(id: string, dto: PaginationDto) {
    const where = { eventId: id };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.eventRsvp.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.eventRsvp.count({ where }),
    ]);
    return paginate(items, total, dto.page, dto.limit);
  }

  private async requireOrganizerOrStaff(user: AuthUser, id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    const isStaff = ['ADMIN', 'PRINCIPAL'].includes(user.role);
    if (event.organizerId !== user.id && !isStaff) {
      throw new ForbiddenException('You cannot manage this event');
    }
    return event;
  }
}
