import type { AgentStatus } from '@comnetish/types';

const port = Number(process.env.AI_AGENT_PORT ?? 3010);

const server = Bun.serve({
  port,
  async fetch(req) {
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

        // In production, call actual Claude API here
        const result = {
          id: `inference-${Date.now()}`,
          model,
          prompt,
          result: `Processed: ${prompt.substring(0, 100)}...`,
          tokensUsed: Math.floor(prompt.length / 4),
          timestamp: new Date().toISOString()
        };

        return Response.json({ data: result });
      } catch (error) {
        return Response.json(
          { error: { message: 'Failed to process inference request' } },
          { status: 500 }
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

        const results = prompts.map((prompt, idx) => ({
          id: `batch-${Date.now()}-${idx}`,
          prompt,
          result: `Processed: ${prompt.substring(0, 50)}...`,
          model
        }));

        return Response.json({
          data: {
            batchId: `batch-${Date.now()}`,
            model,
            count: results.length,
            results
          }
        });
      } catch (error) {
        return Response.json(
          { error: { message: 'Failed to process batch request' } },
          { status: 500 }
        );
      }
    }

    return new Response('Comnetish AI agent running', { status: 200 });
  }
});

console.log(`@comnetish/ai-agent listening on :${server.port}`);