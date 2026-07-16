// Creates the initial tenant and admin user (§15). Stock templates land with M2.
// Runs as the DB owner (bypasses RLS) — dev/bootstrap only.
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@sitefoundry.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';

  let tenant = await prisma.tenant.findFirst({ where: { name: 'SiteFoundry' } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: 'SiteFoundry', plan: 'internal' },
    });
    console.log(`Created tenant ${tenant.id}`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        passwordHash: bcrypt.hashSync(password, 10),
        role: 'admin',
      },
    });
    console.log(`Created admin user: ${email} / ${password}`);
  } else {
    console.log(`Admin user already exists: ${email}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
