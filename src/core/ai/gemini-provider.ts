import { AIProvider, AIProviderError, ChatMessage } from './types';

export class GeminiProvider implements AIProvider {
  constructor(
    private apiKey: string,
    private model: string = 'gemini-1.5-flash'
  ) {}

  async generateStructured<T>(prompt: string, schema: object, systemInstruction?: string): Promise<T> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const body: Record<string, unknown> = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AIProviderError(`Network request failed: ${msg}`, undefined, 'gemini');
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new AIProviderError(
        `Gemini API request failed with status ${response.status}: ${errText}`,
        response.status,
        'gemini'
      );
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new AIProviderError('Gemini API returned an empty or invalid candidate response.', response.status, 'gemini');
    }

    try {
      return JSON.parse(rawText) as T;
    } catch {
      throw new AIProviderError(`Failed to parse structured JSON from Gemini output: ${rawText}`, response.status, 'gemini');
    }
  }

  async streamChat(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    systemInstruction?: string
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`;

    const systemParts: string[] = [];
    if (systemInstruction) {
      systemParts.push(systemInstruction);
    }

    const geminiContents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemParts.push(msg.content);
      } else {
        geminiContents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    const body: Record<string, unknown> = {
      contents: geminiContents,
    };

    if (systemParts.length > 0) {
      body.systemInstruction = {
        parts: [{ text: systemParts.join('\n\n') }],
      };
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AIProviderError(`Network request failed: ${msg}`, undefined, 'gemini');
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new AIProviderError(
        `Gemini streaming request failed with status ${response.status}: ${errText}`,
        response.status,
        'gemini'
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
              const chunkText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (chunkText) {
                accumulated += chunkText;
                onChunk(chunkText);
              }
            } catch {
              // Ignore partial or unparseable SSE frame
            }
          }
        }
      }

      if (buffer.trim().startsWith('data: ')) {
        const jsonStr = buffer.trim().slice(6).trim();
        if (jsonStr !== '[DONE]') {
          try {
            const parsed = JSON.parse(jsonStr);
            const chunkText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (chunkText) {
              accumulated += chunkText;
              onChunk(chunkText);
            }
          } catch {
            // Ignore trailing unparseable frame
          }
        }
      }
    } else {
      // Fallback for non-streaming response body
      const text = await response.text();
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const chunkText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (chunkText) {
              accumulated += chunkText;
              onChunk(chunkText);
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
