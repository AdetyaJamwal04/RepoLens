import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiProvider } from '../../../src/core/ai/gemini-provider';
import { OpenAIProvider } from '../../../src/core/ai/openai-provider';
import { AIProviderError, ChatMessage } from '../../../src/core/ai/types';

// Helper to create a mock ReadableStream for SSE testing
function createSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

describe('AI Providers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GeminiProvider', () => {
    const apiKey = 'test-gemini-key';

    it('generates structured JSON using Gemini API with responseSchema', async () => {
      const mockResult = { purpose: 'Test Project', count: 42 };
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(mockResult) }],
              },
            },
          ],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const provider = new GeminiProvider(apiKey, 'gemini-1.5-flash');
      const schema = { type: 'object', properties: { purpose: { type: 'string' } } };

      const result = await provider.generateStructured<typeof mockResult>(
        'Explain repository',
        schema,
        'System prompt'
      );

      expect(result).toEqual(mockResult);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
      );
      expect(url).not.toContain('key=');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          'x-goog-api-key': 'test-gemini-key',
        })
      );

      const body = JSON.parse(options.body as string);
      expect(body.contents[0].parts[0].text).toBe('Explain repository');
      expect(body.systemInstruction.parts[0].text).toBe('System prompt');
      expect(body.generationConfig.responseMimeType).toBe('application/json');
      expect(body.generationConfig.responseSchema).toEqual(schema);
    });

    it('streams chat using Gemini SSE endpoint and translates assistant role to model', async () => {
      const sseData = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello "}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"world!"}]}}]}\n\n',
      ];

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: createSSEStream(sseData),
      });
      vi.stubGlobal('fetch', fetchMock);

      const provider = new GeminiProvider(apiKey);
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello there' },
        { role: 'user', content: 'How are you?' },
      ];

      const chunks: string[] = [];
      const onChunk = (chunk: string) => chunks.push(chunk);

      const fullText = await provider.streamChat(messages, onChunk, 'You are an assistant');

      expect(fullText).toBe('Hello world!');
      expect(chunks).toEqual(['Hello ', 'world!']);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse'
      );
      expect(url).not.toContain('key=');
      expect(options.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          'x-goog-api-key': 'test-gemini-key',
        })
      );

      const body = JSON.parse(options.body as string);
      expect(body.contents).toEqual([
        { role: 'user', parts: [{ text: 'Hi' }] },
        { role: 'model', parts: [{ text: 'Hello there' }] },
        { role: 'user', parts: [{ text: 'How are you?' }] },
      ]);
    });

    it('throws AIProviderError with friendly message on 401/403 invalid key', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'API_KEY_INVALID',
      });
      vi.stubGlobal('fetch', fetchMock);

      const provider = new GeminiProvider('bad-key');
      await expect(
        provider.generateStructured('prompt', {})
      ).rejects.toThrow(AIProviderError);

      try {
        await provider.generateStructured('prompt', {});
      } catch (err) {
        expect(err).toBeInstanceOf(AIProviderError);
        const providerErr = err as AIProviderError;
        expect(providerErr.status).toBe(401);
        expect(providerErr.provider).toBe('gemini');
        expect(providerErr.friendlyMessage).toContain('Invalid');
      }
    });

    it('throws AIProviderError with friendly message on 429 quota exceeded', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Resource has been exhausted',
      });
      vi.stubGlobal('fetch', fetchMock);

      const provider = new GeminiProvider(apiKey);
      await expect(
        provider.generateStructured('prompt', {})
      ).rejects.toThrow(AIProviderError);

      try {
        await provider.generateStructured('prompt', {});
      } catch (err) {
        const providerErr = err as AIProviderError;
        expect(providerErr.status).toBe(429);
        expect(providerErr.friendlyMessage).toContain('Rate limit');
      }
    });
  });

  describe('OpenAIProvider', () => {
    const apiKey = 'test-openai-key';

    it('generates structured JSON using OpenAI chat completions API', async () => {
      const mockResult = { answer: 'Valid JSON output', score: 100 };
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(mockResult),
              },
            },
          ],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const provider = new OpenAIProvider(apiKey, 'gpt-4o-mini');
      const schema = { type: 'object', properties: { answer: { type: 'string' } } };

      const result = await provider.generateStructured<typeof mockResult>(
        'Summarize',
        schema,
        'Be concise'
      );

      expect(result).toEqual(mockResult);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-openai-key',
        })
      );

      const body = JSON.parse(options.body as string);
      expect(body.model).toBe('gpt-4o-mini');
      expect(body.messages[0]).toEqual({ role: 'system', content: 'Be concise' });
      expect(body.messages[1]).toEqual({ role: 'user', content: 'Summarize' });
      expect(body.response_format).toBeDefined();
    });

    it('streams chat completions using SSE and calls onChunk', async () => {
      const sseData = [
        'data: {"choices":[{"delta":{"content":"Thinking "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"deeply..."}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: createSSEStream(sseData),
      });
      vi.stubGlobal('fetch', fetchMock);

      const provider = new OpenAIProvider(apiKey);
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Explain life' },
      ];

      const chunks: string[] = [];
      const onChunk = (chunk: string) => chunks.push(chunk);

      const fullText = await provider.streamChat(messages, onChunk, 'Philosophy prompt');

      expect(fullText).toBe('Thinking deeply...');
      expect(chunks).toEqual(['Thinking ', 'deeply...']);

      const [, options] = fetchMock.mock.calls[0];
      const body = JSON.parse(options.body as string);
      expect(body.stream).toBe(true);
      expect(body.messages[0]).toEqual({ role: 'system', content: 'Philosophy prompt' });
      expect(body.messages[1]).toEqual({ role: 'user', content: 'Explain life' });
    });

    it('throws AIProviderError on 401 unauthorized', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { message: 'Incorrect API key' } }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const provider = new OpenAIProvider('bad-key');
      try {
        await provider.generateStructured('prompt', {});
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AIProviderError);
        const providerErr = err as AIProviderError;
        expect(providerErr.status).toBe(401);
        expect(providerErr.provider).toBe('openai');
        expect(providerErr.friendlyMessage).toContain('Invalid');
      }
    });

    it('throws AIProviderError on 429 rate limit exceeded', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: 'Rate limit reached' } }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const provider = new OpenAIProvider(apiKey);
      try {
        await provider.streamChat([{ role: 'user', content: 'hi' }], () => {});
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AIProviderError);
        const providerErr = err as AIProviderError;
        expect(providerErr.status).toBe(429);
        expect(providerErr.friendlyMessage).toContain('Rate limit');
      }
    });
  });
});
