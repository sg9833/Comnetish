import type { AgentStatus } from '@comnetish/types';

const port = Number(process.env.AI_AGENT_PORT ?? 3010);
const anthropicKey = process.env.ANTHROPIC_API_KEY;

function resolveModel(model?: string) {
  if (!model) return 'claude-3-5-sonnet-latest';
  if (model === 'claude-3-opus') return 'claude-3-opus-20240229';
  if (model === 'claude-3-sonnet') return 'claude-3-5-sonnet-latest';
  return model;
}

async function runInference(prompt: string, model?: string, maxTokens = 1024) {
  if (!anthropicKey) {
    throw new Error('ANTHROPIC_API_KEY is required for inference');
  }

  const selectedModel = resolveModel(model);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: selectedModel,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic request failed (${response.status}): ${errorText}`);
  }

  const payload = (await response.json()) as {
    id: string;
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const resultText = (payload.content ?? [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
    .join('\n')
    .trim();

  return {
    id: payload.id,
    model: selectedModel,
    prompt,
    result: resultText,
    tokensUsed: (payload.usage?.input_tokens ?? 0) + (payload.usage?.output_tokens ?? 0),
    timestamp: new Date().toISOString()
  };
}

const server = Bun.serve({
  port,
  async fetch(req: Request) {
    const url = new URL(req.url);

    // Health endpoint
    if (url.pathname === '/health') {
      const status: AgentStatus = {
        service: 'ai-agent',
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        ready: true
      };

      return Response.json(status);
    }

    // Get available models
    if (url.pathname === '/models' && req.method === 'GET') {
      return Response.json({
        data: [
          {
            id: 'claude-3-sonnet',
            name: 'Claude 3 Sonnet',
            description: 'Fast and efficient model for deployment planning',
            type: 'text-generation',
            maxTokens: 4096
          },
          {
            id: 'claude-3-opus',
            name: 'Claude 3 Opus',
            description: 'Most capable model for complex deployments',
            type: 'text-generation',
            maxTokens: 200000
          }
        ]
      });
    }

    // Inference endpoint
    if (url.pathname === '/inference' && req.method === 'POST') {
      try {
        const body = (await req.json()) as {
          prompt: string;
          model?: string;
          maxTokens?: number;
        };

        const { prompt, model = 'claude-3-sonnet', maxTokens = 1024 } = body;

        if (!prompt || prompt.length === 0) {
          return Response.json(
            { error: { message: 'Prompt is required' } },
            { status: 400 }
          );
        }

        const result = await runInference(prompt, model, maxTokens);

        return Response.json({ data: result });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to process inference request';
        const status = message.includes('ANTHROPIC_API_KEY') ? 501 : 500;
        return Response.json(
          { error: { message } },
          { status }
        );
      }
    }

    // Batch inference endpoint
    if (url.pathname === '/batch' && req.method === 'POST') {
      try {
        const body = (await req.json()) as {
          prompts: string[];
          model?: string;
        };

        const { prompts, model = 'claude-3-sonnet' } = body;

        if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
          return Response.json(
            { error: { message: 'Prompts array is required' } },
            { status: 400 }
          );
        }

        const results = await Promise.all(prompts.map((prompt) => runInference(prompt, model, 1024)));

        return Response.json({
          data: {
            batchId: `batch-${Date.now()}`,
            model,
            count: results.length,
            results
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to process batch request';
        const status = message.includes('ANTHROPIC_API_KEY') ? 501 : 500;
        return Response.json(
          { error: { message } },
          { status }
        );
      }
    }

    return new Response('Comnetish AI agent running', { status: 200 });
  }
});

console.log(`@comnetish/ai-agent listening on :${server.port}`);