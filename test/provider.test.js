import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  createFireworksFirepassProvider, 
  createSanitizedFetch,
  MODEL_CONTEXT_WINDOWS,
  MODEL_PRICING,
  FIELDS_TO_REMOVE
} from '../index.js';

// Mock @ai-sdk/openai-compatible
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => {
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
            yield { type: 'finish', finishReason: 'stop' };
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
  let model;

  beforeEach(() => {
    provider = createFireworksFirepassProvider({
      baseURL: 'https://api.fireworks.ai/inference/v1',
      apiKey: 'test-api-key'
    });
    model = provider('accounts/fireworks/routers/kimi-k2p5-turbo');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Token Counting', () => {
    it('should count tokens in a text string', () => {
      const text = 'Hello, world!';
      const count = model.countTokens(text);
      
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should count tokens in messages array', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' }
      ];
      
      const count = model.countMessageTokens(messages);
      
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should throw error for invalid input to countTokens', () => {
      expect(() => model.countTokens(null)).toThrow('Text must be a string');
      expect(() => model.countTokens(123)).toThrow('Text must be a string');
    });

    it('should throw error for invalid messages to countMessageTokens', () => {
      expect(() => model.countMessageTokens(null)).toThrow('Messages must be an array');
      expect(() => model.countMessageTokens('not an array')).toThrow('Messages must be an array');
    });

    it('should handle multi-part content in messages', () => {
      const messages = [
        { 
          role: 'user', 
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'image', image: 'base64...' }
          ]
        }
      ];
      
      const count = model.countMessageTokens(messages);
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('Context Window', () => {
    it('should return correct context window for known models', () => {
      const kimiModel = provider('accounts/fireworks/routers/kimi-k2p5-turbo');
      expect(kimiModel.getContextWindow()).toBe(256000);

      const qwenModel = provider('accounts/fireworks/models/qwen2p5-coder-32b-instruct');
      expect(qwenModel.getContextWindow()).toBe(128000);

      const deepseekModel = provider('accounts/fireworks/models/deepseek-v3');
      expect(deepseekModel.getContextWindow()).toBe(64000);
    });

    it('should return default context window for unknown models', () => {
      const unknownModel = provider('unknown-model');
      expect(unknownModel.getContextWindow()).toBe(128000);
    });

    it('should expose provider-level getContextWindow', () => {
      expect(provider.getContextWindow('accounts/fireworks/routers/kimi-k2p5-turbo')).toBe(256000);
      expect(provider.getContextWindow('unknown-model')).toBe(128000);
    });
  });

  describe('Pricing', () => {
    it('should return correct pricing for known models', () => {
      const kimiModel = provider('accounts/fireworks/routers/kimi-k2p5-turbo');
      const pricing = kimiModel.getPricing();
      
      expect(pricing).toEqual({ input: 1.0, output: 4.0 });
    });

    it('should return zero pricing for unknown models', () => {
      const unknownModel = provider('unknown-model');
      const pricing = unknownModel.getPricing();
      
      expect(pricing).toEqual({ input: 0, output: 0 });
    });

    it('should expose provider-level getModelPricing', () => {
      expect(provider.getModelPricing('accounts/fireworks/routers/kimi-k2p5-turbo')).toEqual({ input: 1.0, output: 4.0 });
      expect(provider.getModelPricing('unknown-model')).toEqual({ input: 0, output: 0 });
    });
  });

  describe('Cost Estimation', () => {
    it('should calculate cost correctly', () => {
      const cost = model.estimateCost(1000000, 1000000);
      
      expect(cost.input).toBe(1.0);
      expect(cost.output).toBe(4.0);
      expect(cost.total).toBe(5.0);
    });

    it('should handle zero tokens', () => {
      const cost = model.estimateCost(0, 0);
      
      expect(cost.input).toBe(0);
      expect(cost.output).toBe(0);
      expect(cost.total).toBe(0);
    });

    it('should expose provider-level estimateCost', () => {
      const cost = provider.estimateCost('accounts/fireworks/routers/kimi-k2p5-turbo', 1000000, 1000000);
      
      expect(cost.input).toBe(1.0);
      expect(cost.output).toBe(4.0);
      expect(cost.total).toBe(5.0);
    });
  });

  describe('Message Truncation', () => {
    it('should not truncate messages that fit within context', () => {
      const messages = [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello!' }
      ];
      
      const result = model.truncateMessages(messages);
      
      expect(result.truncated).toBe(false);
      expect(result.messages).toEqual(messages);
      expect(result.originalTokens).toBeGreaterThan(0);
      expect(result.finalTokens).toBe(result.originalTokens);
    });

    it('should keep system messages when truncating', () => {
      // Create many messages that exceed context
      const messages = [
        { role: 'system', content: 'Important system prompt that must be preserved.' }
      ];
      
      // Add many user messages
      for (let i = 0; i < 100; i++) {
        messages.push({ role: 'user', content: 'Message ' + i + ' ' + 'a'.repeat(1000) });
      }
      
      const result = model.truncateMessages(messages);
      
      // System message should always be present
      const systemMessages = result.messages.filter(m => m.role === 'system');
      expect(systemMessages.length).toBe(1);
      expect(systemMessages[0].content).toBe('Important system prompt that must be preserved.');
    });

    it('should respect custom maxTokens parameter', () => {
      const messages = [
        { role: 'user', content: 'Hello!' }
      ];
      
      const result = model.truncateMessages(messages, 10);
      
      expect(result.finalTokens).toBeLessThanOrEqual(10 + 10); // + buffer
    });
  });

  describe('Provider API', () => {
    it('should support languageModel method', () => {
      const langModel = provider.languageModel('accounts/fireworks/routers/kimi-k2p5-turbo');
      
      expect(typeof langModel.countTokens).toBe('function');
      expect(typeof langModel.getContextWindow).toBe('function');
    });

    it('should support chatModel method', () => {
      const chatModel = provider.chatModel('accounts/fireworks/routers/kimi-k2p5-turbo');
      
      expect(typeof chatModel.countTokens).toBe('function');
      expect(typeof chatModel.getContextWindow).toBe('function');
    });

    it('should support completionModel method', () => {
      const completionModel = provider.completionModel('accounts/fireworks/models/deepseek-v3');
      
      expect(typeof completionModel.countTokens).toBe('function');
      expect(typeof completionModel.getContextWindow).toBe('function');
    });

    it('should expose provider-level countTokens', () => {
      const count = provider.countTokens('Test text');
      
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('Backward Compatibility', () => {
    it('should still export createFireworksTafeenProvider', async () => {
      const { createFireworksTafeenProvider } = await import('../index.js');
      
      expect(typeof createFireworksTafeenProvider).toBe('function');
      
      // Should warn about deprecation
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      createFireworksTafeenProvider({});
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('deprecated')
      );
      consoleSpy.mockRestore();
    });
  });
});

describe('Model Configurations', () => {
  describe('Context Windows', () => {
    it('should have context windows for all Kimi models', () => {
      const kimiModels = [
        'accounts/fireworks/routers/kimi-k2p5-turbo',
        'accounts/fireworks/routers/kimi-k2p5',
        'accounts/fireworks/routers/kimi-k2p5-pro',
        'accounts/fireworks/routers/kimi-k2',
        'accounts/fireworks/routers/kimi-k1.5'
      ];

      for (const model of kimiModels) {
        expect(MODEL_CONTEXT_WINDOWS[model]).toBeDefined();
        expect(MODEL_CONTEXT_WINDOWS[model]).toBe(256000);
      }
    });

    it('should have context windows for all Qwen models', () => {
      const qwenModels = [
        'accounts/fireworks/models/qwen2p5-coder-32b-instruct',
        'accounts/fireworks/models/qwq-32b'
      ];

      for (const model of qwenModels) {
        expect(MODEL_CONTEXT_WINDOWS[model]).toBeDefined();
        expect(MODEL_CONTEXT_WINDOWS[model]).toBe(128000);
      }
    });

    it('should have context windows for all DeepSeek models', () => {
      const deepseekModels = [
        'accounts/fireworks/models/deepseek-v3',
        'accounts/fireworks/models/deepseek-r1',
        'accounts/fireworks/models/deepseek-v3-0324'
      ];

      for (const model of deepseekModels) {
        expect(MODEL_CONTEXT_WINDOWS[model]).toBeDefined();
        expect(MODEL_CONTEXT_WINDOWS[model]).toBe(64000);
      }
    });

    it('should have a default context window', () => {
      expect(MODEL_CONTEXT_WINDOWS['default']).toBeDefined();
      expect(MODEL_CONTEXT_WINDOWS['default']).toBe(128000);
    });

    it('should have valid context window values', () => {
      for (const [model, window] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
        expect(typeof window).toBe('number');
        expect(window).toBeGreaterThan(0);
        expect(window).toBeLessThan(1000000); // Sanity check
      }
    });
  });

  describe('Pricing', () => {
    it('should have pricing for all supported models', () => {
      const supportedModels = Object.keys(MODEL_CONTEXT_WINDOWS).filter(m => m !== 'default');
      
      for (const model of supportedModels) {
        expect(MODEL_PRICING[model]).toBeDefined();
        expect(typeof MODEL_PRICING[model].input).toBe('number');
        expect(typeof MODEL_PRICING[model].output).toBe('number');
        expect(MODEL_PRICING[model].input).toBeGreaterThanOrEqual(0);
        expect(MODEL_PRICING[model].output).toBeGreaterThanOrEqual(0);
      }
    });

    it('should have reasonable pricing values', () => {
      for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
        // Pricing should be between 0 and 100 per 1M tokens
        expect(pricing.input).toBeLessThan(100);
        expect(pricing.output).toBeLessThan(100);
      }
    });
  });

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
