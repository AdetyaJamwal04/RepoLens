export type EvidenceType = 'source' | 'manifest' | 'config' | 'documentation' | 'api_metadata';

export interface EvidenceItem {
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  commitSha: string;
  type: EvidenceType;
  snippet?: string;
  confidence: 'verified' | 'inferred' | 'unknown';
}

export interface OverviewOutput {
  purpose: string;
  technologies: Array<{ name: string; category: string; evidence: EvidenceItem }>;
  keyModules: Array<{ name: string; description: string; path: string }>;
  executionSummary: string;
  observations: string[];
}

export interface ArchitectureComponent {
  id: string;
  name: string;
  responsibility: string;
  importantFiles: string[];
  dependencies: string[];
}

export interface ExecutionFlowStep {
  stepNumber: number;
  title: string;
  description: string;
  sourceReference: EvidenceItem;
  confidence: 'verified' | 'inferred';
}

export interface ArchitectureOutput {
  pattern: string;
  components: ArchitectureComponent[];
  dataFlow: string[];
  externalIntegrations: string[];
  executionFlow: ExecutionFlowStep[];
}

export interface CodebaseExplorerEntry {
  path: string;
  type: 'dir' | 'file';
  significance: 'critical' | 'important' | 'supporting';
  responsibility: string;
  reason: string;
}

export interface CodebaseExplorerOutput {
  entries: CodebaseExplorerEntry[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIProvider {
  generateStructured<T>(prompt: string, schema: object, systemInstruction?: string): Promise<T>;
  streamChat(messages: ChatMessage[], onChunk: (chunk: string) => void, systemInstruction?: string): Promise<string>;
}

export class AIProviderError extends Error {
  public status?: number;
  public provider: 'gemini' | 'openai' | 'unknown';
  public friendlyMessage: string;

  constructor(
    message: string,
    status?: number,
    provider: 'gemini' | 'openai' | 'unknown' = 'unknown',
    friendlyMessage?: string
  ) {
    super(message);
    this.name = 'AIProviderError';
    this.status = status;
    this.provider = provider;
    this.friendlyMessage = friendlyMessage || AIProviderError.buildFriendlyMessage(status, provider, message);
  }

  private static buildFriendlyMessage(status?: number, provider: string = 'unknown', rawMessage: string = ''): string {
    if (status === 401 || status === 403) {
      return `Invalid or unauthorized API key for ${provider}. Please check your API key in settings.`;
    }
    if (status === 429) {
      return `Rate limit or quota exceeded for ${provider}. Please check your usage limits or try again later.`;
    }
    if (status && status >= 500) {
      return `${provider} service is currently unavailable. Please try again later.`;
    }
    return rawMessage || `An unexpected error occurred while communicating with ${provider}.`;
  }
}
