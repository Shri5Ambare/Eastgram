/* eslint-disable no-console */
import {
  MessagePermission,
  PollStatus,
  PollType,
  PostType,
  PrismaClient,
  Role,
  UserStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding EduGram...');

  const school = await prisma.school.upsert({
    where: { slug: 'greenwood-high' },
    update: {},
    create: { name: 'Greenwood High School', slug: 'greenwood-high' },
  });

  const class10A = await prisma.schoolClass.upsert({
    where: {
      schoolId_name_year: { schoolId: school.id, name: 'Grade 10 - A', year: 2026 },
    },
    update: {},
    create: {
      schoolId: school.id,
      name: 'Grade 10 - A',
      grade: '10',
      section: 'A',
      year: 2026,
    },
  });

  const password = await argon2.hash('Password123!');

  async function makeUser(
    username: string,
    fullName: string,
    role: Role,
    extra: Partial<{ classId: string; messagePermission: MessagePermission }> = {},
  ) {
    return prisma.user.upsert({
      where: { username },
      update: {},
      create: {
        schoolId: school.id,
        email: `${username}@greenwood.edu`,
        username,
        fullName,
        passwordHash: password,
        role,
        status: UserStatus.ACTIVE,
        isVerified: role !== Role.STUDENT,
        ...extra,
      },
    });
  }

  const principal = await makeUser('principal', 'Dr. Anita Rao', Role.PRINCIPAL, {
    messagePermission: MessagePermission.FULL,
  });
  const teacher = await makeUser('msverma', 'Ms. Verma', Role.TEACHER, {
    messagePermission: MessagePermission.FULL,
  });
  const captain = await makeUser('rahul_10a', 'Rahul Sharma', Role.AUTHORIZED_STUDENT, {
    classId: class10A.id,
    messagePermission: MessagePermission.FULL,
  });
  const student1 = await makeUser('priya_10a', 'Priya Patel', Role.STUDENT, {
    classId: class10A.id,
    messagePermission: MessagePermission.CLASSMATES,
  });
  const student2 = await makeUser('arjun_10a', 'Arjun Singh', Role.STUDENT, {
    classId: class10A.id,
    messagePermission: MessagePermission.REPLY_ONLY,
  });

  // A welcome post
  await prisma.post.create({
    data: {
      authorId: principal.id,
      type: PostType.POST,
      caption: 'Welcome to EduGram, Greenwood High! 🎓',
    },
  });

  // A quick poll
  await prisma.poll.create({
    data: {
      creatorId: captain.id,
      type: PollType.QUICK,
      status: PollStatus.OPEN,
      question: 'Theme for this year’s annual day?',
      opensAt: new Date(),
      options: {
        create: [
          { label: 'Retro', position: 0 },
          { label: 'Futuristic', position: 1 },
          { label: 'Bollywood', position: 2 },
        ],
      },
    },
  });

  // A pageant: Mister & Miss School
  await prisma.poll.create({
    data: {
      creatorId: teacher.id,
      type: PollType.PAGEANT,
      status: PollStatus.OPEN,
      question: 'Mister & Miss Greenwood 2026',
      opensAt: new Date(),
      candidates: {
        create: [
          { displayName: 'Rahul Sharma', userId: captain.id, category: 'Mister School' },
          { displayName: 'Arjun Singh', userId: student2.id, category: 'Mister School' },
          { displayName: 'Priya Patel', userId: student1.id, category: 'Miss School' },
        ],
      },
    },
  });

  console.log('✅ Seed complete.');
  console.log('   Login with username "principal" / password "Password123!"');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
