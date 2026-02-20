import { getApiAuthContext } from '@/lib/supabase/api-auth';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return new Response(JSON.stringify({ error: 'Chat service not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { transcript?: string; summary?: string; messages?: ChatMessage[]; question?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { transcript, summary, messages = [], question } = body;

  if (!transcript || !question) {
    return new Response(JSON.stringify({ error: 'transcript and question are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const isMultiVideo = transcript.includes('=== Video ');
  const systemPrompt = `You are a helpful assistant that answers questions about ${isMultiVideo ? 'multiple YouTube videos' : 'a YouTube video'} based on ${isMultiVideo ? 'their transcripts' : 'its transcript'}. Be specific and reference details from the transcript${isMultiVideo ? 's. When relevant, reference which video (Video 1, Video 2, etc.) information comes from' : ''}. If the answer isn't in the transcript${isMultiVideo ? 's' : ''}, say so.

VIDEO TRANSCRIPT${isMultiVideo ? 'S' : ''}:
${transcript.slice(0, 30000)}

${summary ? `COMBINED SUMMARY:\n${summary}\n` : ''}
Answer questions concisely and accurately based on this content.`;

  // Build conversation history
  const claudeMessages: ChatMessage[] = [
    ...messages.slice(-10), // Keep last 10 messages for context
    { role: 'user', content: question },
  ];

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        temperature: 0.3,
        stream: true,
        system: systemPrompt,
        messages: claudeMessages,
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('[youtube-chat] Claude error:', claudeRes.status, errText);
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Forward the SSE stream, extracting text deltas
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = claudeRes.body!.getReader();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const event = JSON.parse(data);
                if (event.type === 'content_block_delta' && event.delta?.text) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
                }
              } catch {
                // Skip unparseable lines
              }
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          console.error('[youtube-chat] Stream error:', err);
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('[youtube-chat] Error:', err);
    return new Response(JSON.stringify({ error: 'Failed to get response' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
