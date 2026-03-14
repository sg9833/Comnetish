import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/db';

const waitlist = new Hono();

const createWaitlistSchema = z.object({
  email: z.string().email(),
  source: z.string().min(1).max(64).optional()
});

waitlist.post('/', zValidator('json', createWaitlistSchema), async (c) => {
  const payload = c.req.valid('json');

  const entry = await prisma.waitlistEntry.upsert({
    where: { email: payload.email.toLowerCase() },
    update: {
      source: payload.source ?? 'website',
      updatedAt: new Date()
    },
    create: {
      email: payload.email.toLowerCase(),
      source: payload.source ?? 'website'
    }
  });

  return c.json({ data: entry }, 201);
});

export { waitlist };
