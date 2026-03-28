const openaiCompatible = require('@ai-sdk/openai-compatible');

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

function log(...args) {
  if (process.env.DEBUG_FIREWORKS_TAFEEN) {
    console.log('[fireworks-tafeen]', ...args);
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

function wrapModel(model) {
  if (!model || typeof model !== 'object') return model;

  if (typeof model.doGenerate === 'function') {
    const originalDoGenerate = model.doGenerate.bind(model);
    model.doGenerate = async function patchedDoGenerate(options) {
      const result = await originalDoGenerate(options);
      if (!result || typeof result !== 'object') return result;

      let out = result;

      if ('finishReason' in out && typeof out.finishReason === 'object' && out.finishReason !== null) {
        out = { ...out, finishReason: toLegacyReason(out.finishReason) };
        log('Normalized generate finishReason object -> string');
      }

      if ('reason' in out && typeof out.reason === 'object' && out.reason !== null) {
        out = { ...out, reason: toLegacyReason(out.reason) };
        log('Normalized generate reason object -> string');
      }

      return out;
    };
  }

  if (typeof model.doStream === 'function') {
    const originalDoStream = model.doStream.bind(model);
    model.doStream = async function patchedDoStream(options) {
      const streamResult = await originalDoStream(options);

      if (!streamResult || typeof streamResult !== 'object') {
        return streamResult;
      }

      return {
        ...streamResult,
        stream: wrapStream(streamResult.stream),
      };
    };
  }

  return model;
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

function createFireworksTafeenProvider(options = {}) {
  const originalFetch = options.fetch || globalThis.fetch;
  const sanitizedFetch = createSanitizedFetch(originalFetch);

  const baseProvider = openaiCompatible.createOpenAICompatible({
    ...options,
    name: 'fireworks-tafeen',
    fetch: sanitizedFetch,
  });

  const wrappedProvider = function wrappedProvider(modelId) {
    return wrapModel(baseProvider(modelId));
  };

  Object.assign(wrappedProvider, baseProvider);

  if (typeof baseProvider.languageModel === 'function') {
    wrappedProvider.languageModel = function patchedLanguageModel(modelId, config) {
      return wrapModel(baseProvider.languageModel(modelId, config));
    };
  }

  if (typeof baseProvider.chatModel === 'function') {
    wrappedProvider.chatModel = function patchedChatModel(modelId) {
      return wrapModel(baseProvider.chatModel(modelId));
    };
  }

  if (typeof baseProvider.completionModel === 'function') {
    wrappedProvider.completionModel = function patchedCompletionModel(modelId) {
      return wrapModel(baseProvider.completionModel(modelId));
    };
  }

  return wrappedProvider;
}

module.exports = createFireworksTafeenProvider;
module.exports.createFireworksTafeenProvider = createFireworksTafeenProvider;
module.exports.createOpenAICompatible = createFireworksTafeenProvider;
module.exports.createProvider = createFireworksTafeenProvider;
