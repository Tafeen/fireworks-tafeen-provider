const openaiCompatible = require('@ai-sdk/openai-compatible');
const gptTokenizer = require('gpt-tokenizer');

const FIELDS_TO_REMOVE = [
  'id',
  'category',
  'type',
  'version',
  'author',
  'reason',
  'reasoning',
  'reasoning_content',
];

// Fireworks AI model context window configurations
const MODEL_CONTEXT_WINDOWS = {
  // Kimi models via Fireworks
  'accounts/fireworks/routers/kimi-k2p5-turbo': 256000,
  'accounts/fireworks/routers/kimi-k2p5': 256000,
  'accounts/fireworks/routers/kimi-k2p5-pro': 256000,
  'accounts/fireworks/routers/kimi-k2': 256000,
  'accounts/fireworks/routers/kimi-k1.5': 256000,
  // Qwen models via Fireworks
  'accounts/fireworks/models/qwen2p5-coder-32b-instruct': 128000,
  'accounts/fireworks/models/qwq-32b': 128000,
  // DeepSeek models via Fireworks
  'accounts/fireworks/models/deepseek-v3': 64000,
  'accounts/fireworks/models/deepseek-r1': 64000,
  'accounts/fireworks/models/deepseek-v3-0324': 64000,
  // Default fallback
  'default': 128000,
};

// Fireworks AI model token pricing (per 1M tokens) - for reference
const MODEL_PRICING = {
  'accounts/fireworks/routers/kimi-k2p5-turbo': { input: 1.0, output: 4.0 },
  'accounts/fireworks/routers/kimi-k2p5': { input: 1.0, output: 4.0 },
  'accounts/fireworks/routers/kimi-k2p5-pro': { input: 1.0, output: 4.0 },
  'accounts/fireworks/routers/kimi-k2': { input: 1.0, output: 4.0 },
  'accounts/fireworks/routers/kimi-k1.5': { input: 1.0, output: 4.0 },
  'accounts/fireworks/models/qwen2p5-coder-32b-instruct': { input: 0.8, output: 0.8 },
  'accounts/fireworks/models/qwq-32b': { input: 0.8, output: 0.8 },
  'accounts/fireworks/models/deepseek-v3': { input: 0.9, output: 0.9 },
  'accounts/fireworks/models/deepseek-r1': { input: 0.9, output: 0.9 },
  'accounts/fireworks/models/deepseek-v3-0324': { input: 0.9, output: 0.9 },
};

function log(...args) {
  if (process.env.DEBUG_FIREWORKS_FIREPASS) {
    console.log('[fireworks-firepass]', ...args);
  }
}

function sanitizeRequestBody(body) {
  if (typeof body !== 'object' || body === null) return body;

  const sanitized = {};
  for (const [key, value] of Object.entries(body)) {
    if (!FIELDS_TO_REMOVE.includes(key)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function toLegacyReason(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    if (typeof value.unified === 'string') return value.unified;
    if (typeof value.raw === 'string') return value.raw;
    if (typeof value.reason === 'string') return value.reason;
  }
  return 'stop';
}

function normalizePart(part) {
  if (!part || typeof part !== 'object') return part;

  let out = part;

  if ('finishReason' in out && typeof out.finishReason === 'object' && out.finishReason !== null) {
    out = { ...out, finishReason: toLegacyReason(out.finishReason) };
    log('Normalized stream finishReason object -> string');
  }

  if ('reason' in out && typeof out.reason === 'object' && out.reason !== null) {
    out = { ...out, reason: toLegacyReason(out.reason) };
    log('Normalized stream reason object -> string');
  }

  if (out.type === 'finish') {
    const legacy = toLegacyReason(out.reason ?? out.finishReason ?? out.finish);
    out = { ...out, reason: legacy, finish: legacy, finishReason: legacy };
    log('Normalized stream finish part reason fields -> string');
  }

  return out;
}

function wrapStream(stream) {
  if (!stream) return stream;

  if (typeof stream.pipeThrough === 'function') {
    const transform = new TransformStream({
      transform(part, controller) {
        controller.enqueue(normalizePart(part));
      },
    });
    return stream.pipeThrough(transform);
  }

  if (typeof stream[Symbol.asyncIterator] === 'function') {
    return {
      async *[Symbol.asyncIterator]() {
        for await (const part of stream) {
          yield normalizePart(part);
        }
      },
    };
  }

  return stream;
}

function wrapModel(model, modelId) {
  if (!model || typeof model !== 'object') return model;

  const contextWindow = MODEL_CONTEXT_WINDOWS[modelId] || MODEL_CONTEXT_WINDOWS['default'];
  const pricing = MODEL_PRICING[modelId] || { input: 0, output: 0 };

  // Add metadata to the model
  const wrappedModel = Object.create(model);
  
  // Store original methods
  const originalDoGenerate = model.doGenerate?.bind(model);
  const originalDoStream = model.doStream?.bind(model);

  // Token counting utilities
  wrappedModel.countTokens = function(text) {
    if (typeof text !== 'string') {
      throw new Error('Text must be a string');
    }
    try {
      return gptTokenizer.encode(text).length;
    } catch (error) {
      log('Token counting error:', error.message);
      // Fallback: approximate token count (1 token ≈ 4 characters for English)
      return Math.ceil(text.length / 4);
    }
  };

  wrappedModel.countMessageTokens = function(messages) {
    if (!Array.isArray(messages)) {
      throw new Error('Messages must be an array');
    }
    
    let totalTokens = 0;
    // Base tokens for the format
    totalTokens += 3; // Every message follows <|start|>{role/name}\n{content}<|end|>\n
    
    for (const message of messages) {
      totalTokens += 4; // Every message follows <|start|>role\ncontent<|end|>\n
      if (message.role) {
        totalTokens += this.countTokens(message.role);
      }
      if (message.content) {
        if (typeof message.content === 'string') {
          totalTokens += this.countTokens(message.content);
        } else if (Array.isArray(message.content)) {
          // Handle multi-part content
          for (const part of message.content) {
            if (typeof part === 'string') {
              totalTokens += this.countTokens(part);
            } else if (part && typeof part === 'object') {
              if (part.text) {
                totalTokens += this.countTokens(part.text);
              }
            }
          }
        }
      }
      if (message.name) {
        totalTokens += this.countTokens(message.name);
      }
    }
    
    // Every reply is primed with <|start|>assistant<|message|>
    totalTokens += 3;
    
    return totalTokens;
  };

  wrappedModel.getContextWindow = function() {
    return contextWindow;
  };

  wrappedModel.getPricing = function() {
    return pricing;
  };

  wrappedModel.estimateCost = function(inputTokens, outputTokens) {
    const inputCost = (inputTokens / 1000000) * pricing.input;
    const outputCost = (outputTokens / 1000000) * pricing.output;
    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost,
    };
  };

  wrappedModel.truncateMessages = function(messages, maxTokens = null) {
    const limit = maxTokens || (contextWindow - 1000); // Leave buffer for response
    const totalTokens = this.countMessageTokens(messages);
    
    if (totalTokens <= limit) {
      return {
        messages,
        truncated: false,
        originalTokens: totalTokens,
        finalTokens: totalTokens,
      };
    }

    // Truncate from the middle, keeping system message and recent context
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    
    const systemTokens = systemMessages.reduce((sum, m) => 
      sum + 4 + this.countTokens(m.content || ''), 0);
    const availableTokens = limit - systemTokens - 10; // Buffer

    // Keep most recent messages that fit
    const truncated = [];
    let currentTokens = 0;
    
    // Start from most recent and work backwards
    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      const msg = nonSystemMessages[i];
      const msgTokens = 4 + this.countTokens(msg.content || '');
      
      if (currentTokens + msgTokens <= availableTokens) {
        truncated.unshift(msg);
        currentTokens += msgTokens;
      } else {
        break;
      }
    }

    const finalMessages = [...systemMessages, ...truncated];
    
    return {
      messages: finalMessages,
      truncated: true,
      originalTokens: totalTokens,
      finalTokens: this.countMessageTokens(finalMessages),
      removedCount: messages.length - finalMessages.length,
    };
  };

  // Wrap doGenerate to add token counting
  if (typeof originalDoGenerate === 'function') {
    wrappedModel.doGenerate = async function(options) {
      // Count input tokens if messages provided
      let inputTokens = 0;
      if (options.prompt) {
        inputTokens = this.countTokens(options.prompt);
      } else if (options.messages) {
        inputTokens = this.countMessageTokens(options.messages);
      }

      log(`Estimated input tokens: ${inputTokens}`);

      const result = await originalDoGenerate(options);
      
      if (!result || typeof result !== 'object') return result;

      let out = result;

      // Normalize finish reason
      if ('finishReason' in out && typeof out.finishReason === 'object' && out.finishReason !== null) {
        out = { ...out, finishReason: toLegacyReason(out.finishReason) };
        log('Normalized generate finishReason object -> string');
      }

      if ('reason' in out && typeof out.reason === 'object' && out.reason !== null) {
        out = { ...out, reason: toLegacyReason(out.reason) };
        log('Normalized generate reason object -> string');
      }

      // Enhance usage with calculated tokens if not provided
      if (out.usage && typeof out.usage === 'object') {
        out.usage.estimatedInputTokens = inputTokens;
        if (!out.usage.inputTokens && inputTokens > 0) {
          out.usage.inputTokens = inputTokens;
        }
      }

      return out;
    };
  }

  // Wrap doStream to add token counting
  if (typeof originalDoStream === 'function') {
    wrappedModel.doStream = async function(options) {
      // Count input tokens if messages provided
      let inputTokens = 0;
      if (options.prompt) {
        inputTokens = this.countTokens(options.prompt);
      } else if (options.messages) {
        inputTokens = this.countMessageTokens(options.messages);
      }

      log(`Estimated input tokens for stream: ${inputTokens}`);

      const streamResult = await originalDoStream(options);

      if (!streamResult || typeof streamResult !== 'object') {
        return streamResult;
      }

      // Add input token info to the stream result
      if (streamResult.usage && typeof streamResult.usage === 'object') {
        streamResult.usage.estimatedInputTokens = inputTokens;
      }

      return {
        ...streamResult,
        stream: wrapStream(streamResult.stream),
      };
    };
  }

  return wrappedModel;
}

function createSanitizedFetch(originalFetch) {
  return async function sanitizedFetch(url, options = {}) {
    const urlStr = typeof url === 'string' ? url : (url && typeof url.toString === 'function' ? url.toString() : '');

    if (urlStr.includes('/chat/completions') || urlStr.includes('/completions')) {
      try {
        if (options.body && typeof options.body === 'string') {
          const body = JSON.parse(options.body);
          const sanitized = sanitizeRequestBody(body);

          const removed = FIELDS_TO_REMOVE.filter((f) => Object.prototype.hasOwnProperty.call(body, f));
          if (removed.length > 0) {
            log('Removed from request:', removed.join(', '));
          }

          options.body = JSON.stringify(sanitized);
        }
      } catch (_e) {
        // If body isn't JSON, pass through unchanged
      }
    }

    return originalFetch(url, options);
  };
}

function createFireworksFirepassProvider(options = {}) {
  const originalFetch = options.fetch || globalThis.fetch;
  const sanitizedFetch = createSanitizedFetch(originalFetch);

  const baseProvider = openaiCompatible.createOpenAICompatible({
    ...options,
    name: 'fireworks-firepass',
    fetch: sanitizedFetch,
  });

  const wrappedProvider = function wrappedProvider(modelId) {
    const model = baseProvider(modelId);
    return wrapModel(model, modelId);
  };

  Object.assign(wrappedProvider, baseProvider);

  // Expose utility functions on the provider
  wrappedProvider.countTokens = function(text) {
    if (typeof text !== 'string') {
      throw new Error('Text must be a string');
    }
    try {
      return gptTokenizer.encode(text).length;
    } catch (_error) {
      return Math.ceil(text.length / 4);
    }
  };

  wrappedProvider.getContextWindow = function(modelId) {
    return MODEL_CONTEXT_WINDOWS[modelId] || MODEL_CONTEXT_WINDOWS['default'];
  };

  wrappedProvider.getModelPricing = function(modelId) {
    return MODEL_PRICING[modelId] || { input: 0, output: 0 };
  };

  wrappedProvider.estimateCost = function(modelId, inputTokens, outputTokens) {
    const pricing = MODEL_PRICING[modelId] || { input: 0, output: 0 };
    const inputCost = (inputTokens / 1000000) * pricing.input;
    const outputCost = (outputTokens / 1000000) * pricing.output;
    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost,
    };
  };

  if (typeof baseProvider.languageModel === 'function') {
    wrappedProvider.languageModel = function patchedLanguageModel(modelId, config) {
      const model = baseProvider.languageModel(modelId, config);
      return wrapModel(model, modelId);
    };
  }

  if (typeof baseProvider.chatModel === 'function') {
    wrappedProvider.chatModel = function patchedChatModel(modelId) {
      const model = baseProvider.chatModel(modelId);
      return wrapModel(model, modelId);
    };
  }

  if (typeof baseProvider.completionModel === 'function') {
    wrappedProvider.completionModel = function patchedCompletionModel(modelId) {
      const model = baseProvider.completionModel(modelId);
      return wrapModel(model, modelId);
    };
  }

  return wrappedProvider;
}

// Also export under the old name for backward compatibility
function createFireworksTafeenProvider(options = {}) {
  console.warn('createFireworksTafeenProvider is deprecated. Use createFireworksFirepassProvider instead.');
  return createFireworksFirepassProvider(options);
}

// Main exports
module.exports = createFireworksFirepassProvider;
module.exports.createFireworksFirepassProvider = createFireworksFirepassProvider;
module.exports.createFireworksTafeenProvider = createFireworksTafeenProvider;
module.exports.createOpenAICompatible = createFireworksFirepassProvider;
module.exports.createProvider = createFireworksFirepassProvider;

// Internal exports for testing
module.exports.createSanitizedFetch = createSanitizedFetch;
module.exports.MODEL_CONTEXT_WINDOWS = MODEL_CONTEXT_WINDOWS;
module.exports.MODEL_PRICING = MODEL_PRICING;
module.exports.FIELDS_TO_REMOVE = FIELDS_TO_REMOVE;
