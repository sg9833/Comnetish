import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { env } from '../config/env';
import { HttpError } from '../lib/http-error';

const generateSDLRequestSchema = z.object({
  prompt: z.string().min(10),
  constraints: z.array(z.string()).optional()
});

const ai = new Hono();

ai.post('/generate-sdl', zValidator('json', generateSDLRequestSchema), async (c) => {
  if (!env.ANTHROPIC_API_KEY) {
    throw new HttpError(503, 'ANTHROPIC_API_KEY is not configured');
  }

  const { prompt, constraints } = c.req.valid('json');
  const instruction = [
    'Generate a valid Akash/Comnetish SDL YAML file.',
    'Return only SDL YAML with no markdown formatting.',
    constraints && constraints.length > 0 ? `Constraints: ${constraints.join('; ')}` : undefined,
    `User request: ${prompt}`
  ]
    .filter(Boolean)
    .join('\n');

  const response = await fetch(env.ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 1200,
      messages: [
        {
          role: 'user',
          content: instruction
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new HttpError(502, 'Claude proxy request failed', { status: response.status, body });
  }

  const result = (await response.json()) as {
    id?: string;
    content?: Array<{ type: string; text?: string }>;
  };

  const sdl = result.content?.find((item) => item.type === 'text' && item.text)?.text?.trim() ?? 'services: {}';

  return c.json({
    data: {
      sdl,
      provider: 'claude',
      requestId: result.id ?? null
    }
  });
});

export { ai };
