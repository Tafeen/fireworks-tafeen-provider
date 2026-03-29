import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFireworksFirepassProvider,
  createSanitizedFetch,
  FIELDS_TO_REMOVE,
} from '../index.js';

// Mock @ai-sdk/fireworks
vi.mock('@ai-sdk/fireworks', () => ({
  createFireworks: vi.fn((options) => {
    const mockModel = {
      doGenerate: vi.fn(async () => ({
        text: 'Test response',
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
      })),
      doStream: vi.fn(async () => ({
        stream: {
          async *[Symbol.asyncIterator]() {
            yield { type: 'text-delta', textDelta: 'Test' };
            yield { type: 'finish', finishReason: 'stop', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
          }
        },
        usage: { inputTokens: 10, outputTokens: 5 }
      }))
    };

    const provider = vi.fn((modelId) => mockModel);
    provider.languageModel = vi.fn((modelId) => mockModel);
    provider.chatModel = vi.fn((modelId) => mockModel);
    provider.completionModel = vi.fn((modelId) => mockModel);

    return provider;
  })
}));

describe('Fireworks Firepass Provider', () => {
  let provider;

  beforeEach(() => {
    provider = createFireworksFirepassProvider({
      apiKey: 'test-api-key'
    });
  });

  describe('Provider Configuration', () => {
    it('should create provider successfully', () => {
      expect(provider).toBeDefined();
      expect(typeof provider).toBe('function');
    });

    it('should pass through options to base provider', () => {
      const customProvider = createFireworksFirepassProvider({
        apiKey: 'custom-key',
        headers: { 'X-Custom': 'value' }
      });

      expect(customProvider).toBeDefined();
    });
  });

  describe('Provider API', () => {
    it('should support languageModel method', () => {
      expect(typeof provider.languageModel).toBe('function');
    });

    it('should support chatModel method', () => {
      expect(typeof provider.chatModel).toBe('function');
    });

    it('should support completionModel method', () => {
      expect(typeof provider.completionModel).toBe('function');
    });
  });

  describe('Backward Compatibility', () => {
    it('should still export createFireworksTafeenProvider', async () => {
      const { createFireworksTafeenProvider } = await import('../index.js');

      expect(typeof createFireworksTafeenProvider).toBe('function');

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      createFireworksTafeenProvider({});
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

describe('Request Sanitization', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Test' } }] })
    }));
  });

  it('should remove restricted fields from chat completions request', async () => {
    const sanitizedFetch = createSanitizedFetch(mockFetch);

    const body = {
      model: 'test-model',
      messages: [{ role: 'user', content: 'Hello' }],
      id: 'should-be-removed',
      category: 'should-be-removed',
      type: 'should-be-removed',
      version: 'should-be-removed',
      author: 'should-be-removed',
      reason: 'should-be-removed',
      reasoning: 'should-be-removed',
      reasoning_content: 'should-be-removed'
    };

    await sanitizedFetch('https://api.fireworks.ai/inference/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);

    expect(calledBody.model).toBe('test-model');
    expect(calledBody.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    expect(calledBody.id).toBeUndefined();
    expect(calledBody.category).toBeUndefined();
    expect(calledBody.type).toBeUndefined();
    expect(calledBody.version).toBeUndefined();
    expect(calledBody.author).toBeUndefined();
    expect(calledBody.reason).toBeUndefined();
    expect(calledBody.reasoning).toBeUndefined();
    expect(calledBody.reasoning_content).toBeUndefined();
  });

  it('should pass through non-restricted fields', async () => {
    const sanitizedFetch = createSanitizedFetch(mockFetch);

    const body = {
      model: 'test-model',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.7,
      max_tokens: 100,
      stream: false
    };

    await sanitizedFetch('https://api.fireworks.ai/inference/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);

    expect(calledBody.temperature).toBe(0.7);
    expect(calledBody.max_tokens).toBe(100);
    expect(calledBody.stream).toBe(false);
  });

  it('should not modify non-JSON bodies', async () => {
    const sanitizedFetch = createSanitizedFetch(mockFetch);

    const body = 'plain text body';

    await sanitizedFetch('https://api.fireworks.ai/inference/v1/chat/completions', {
      method: 'POST',
      body: body
    });

    expect(mockFetch.mock.calls[0][1].body).toBe(body);
  });

  it('should not modify non-chat endpoints', async () => {
    const sanitizedFetch = createSanitizedFetch(mockFetch);

    const body = {
      id: 'should-not-be-removed',
      data: 'test'
    };

    await sanitizedFetch('https://api.fireworks.ai/inference/v1/models', {
      method: 'GET',
      body: JSON.stringify(body)
    });

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(calledBody.id).toBe('should-not-be-removed');
  });
});

describe('Configuration', () => {
  describe('FIELDS_TO_REMOVE', () => {
    it('should have the correct restricted fields', () => {
      expect(FIELDS_TO_REMOVE).toContain('id');
      expect(FIELDS_TO_REMOVE).toContain('category');
      expect(FIELDS_TO_REMOVE).toContain('type');
      expect(FIELDS_TO_REMOVE).toContain('version');
      expect(FIELDS_TO_REMOVE).toContain('author');
      expect(FIELDS_TO_REMOVE).toContain('reason');
      expect(FIELDS_TO_REMOVE).toContain('reasoning');
      expect(FIELDS_TO_REMOVE).toContain('reasoning_content');
    });
  });
});
