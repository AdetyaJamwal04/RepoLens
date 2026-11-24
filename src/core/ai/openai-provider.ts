import { AIProvider, AIProviderError, ChatMessage } from './types';

export class OpenAIProvider implements AIProvider {
  constructor(
    private apiKey: string,
    private model: string = 'gpt-4o-mini'
  ) {}

  async generateStructured<T>(prompt: string, schema: object, systemInstruction?: string): Promise<T> {
    const url = 'https://api.openai.com/v1/chat/completions';

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }

    messages.push({ role: 'user', content: prompt });

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'structured_output',
          schema,
        },
      },
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AIProviderError(`Network request failed: ${msg}`, undefined, 'openai');
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new AIProviderError(
        `OpenAI API request failed with status ${response.status}: ${errText}`,
        response.status,
        'openai'
      );
    }

    const data = await response.json();
    const rawContent = data?.choices?.[0]?.message?.content;

    if (!rawContent) {
      throw new AIProviderError('OpenAI API returned an empty or invalid completion response.', response.status, 'openai');
    }

    try {
      return JSON.parse(rawContent) as T;
    } catch {
      throw new AIProviderError(`Failed to parse structured JSON from OpenAI output: ${rawContent}`, response.status, 'openai');
    }
  }

  async streamChat(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    systemInstruction?: string
  ): Promise<string> {
    const url = 'https://api.openai.com/v1/chat/completions';

    const formattedMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    if (systemInstruction) {
      formattedMessages.push({ role: 'system', content: systemInstruction });
    }

    for (const msg of messages) {
      formattedMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    const body = {
      model: this.model,
      messages: formattedMessages,
      stream: true,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AIProviderError(`Network request failed: ${msg}`, undefined, 'openai');
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new AIProviderError(
        `OpenAI streaming request failed with status ${response.status}: ${errText}`,
        response.status,
        'openai'
      );
    }

    let accumulated = '';

    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (delta) {
                accumulated += delta;
                onChunk(delta);
              }
            } catch {
              // Ignore incomplete frame
            }
          }
        }
      }

      if (buffer.trim().startsWith('data: ')) {
        const jsonStr = buffer.trim().slice(6).trim();
        if (jsonStr !== '[DONE]') {
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (delta) {
              accumulated += delta;
              onChunk(delta);
            }
          } catch {
            // Ignore trailing unparseable frame
          }
        }
      }
    } else {
      const text = await response.text();
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (delta) {
              accumulated += delta;
              onChunk(delta);
            }
          } catch {
            // Ignore
          }
        }
      }
    }

    return accumulated;
  }
}
