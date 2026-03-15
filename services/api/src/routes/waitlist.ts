import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/db';

const waitlist = new Hono();

const createWaitlistSchema = z.object({
  email: z.string().email(),
  source: z.string().min(1).max(64).optional()
});

const createWaitlistFormSchema = createWaitlistSchema.extend({
  successUrl: z.string().url().optional(),
  errorUrl: z.string().url().optional()
});

async function upsertWaitlistEntry(payload: { email: string; source?: string }) {
  return prisma.waitlistEntry.upsert({
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
}

waitlist.post('/', zValidator('json', createWaitlistSchema), async (c) => {
  const payload = c.req.valid('json');

  const entry = await upsertWaitlistEntry(payload);

  return c.json({ data: entry }, 201);
});

waitlist.post('/form', async (c) => {
  const body = await c.req.parseBody();
  const payloadResult = createWaitlistFormSchema.safeParse({
    email: typeof body.email === 'string' ? body.email : '',
    source: typeof body.source === 'string' ? body.source : undefined,
    successUrl: typeof body.successUrl === 'string' ? body.successUrl : undefined,
    errorUrl: typeof body.errorUrl === 'string' ? body.errorUrl : undefined
  });

  if (!payloadResult.success) {
    const fallbackErrorUrl = typeof body.errorUrl === 'string' ? body.errorUrl : undefined;
    if (fallbackErrorUrl) {
      return c.redirect(fallbackErrorUrl, 303);
    }

    return c.json(
      {
        error: {
          message: 'Validation failed',
          details: payloadResult.error.flatten()
        }
      },
      400
    );
  }

  const payload = payloadResult.data;

  try {
    await upsertWaitlistEntry(payload);

    if (payload.successUrl) {
      return c.redirect(payload.successUrl, 303);
    }

    return c.json({ ok: true }, 201);
  } catch {
    if (payload.errorUrl) {
      return c.redirect(payload.errorUrl, 303);
    }

    return c.json({ error: { message: 'Failed to create waitlist entry' } }, 500);
  }
});

export { waitlist };
