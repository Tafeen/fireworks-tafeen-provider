const { createFireworks } = require('@ai-sdk/fireworks');

// Fields that Fireworks API rejects - must be stripped from requests
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

function createSanitizedFetch(originalFetch) {
  return async function sanitizedFetch(url, options = {}) {
    const urlStr = typeof url === 'string' ? url : (url && typeof url.toString === 'function' ? url.toString() : '');

    // Only sanitize chat/completion requests
    if ((urlStr.includes('/chat/completions') || urlStr.includes('/completions')) && options.body) {
      try {
        if (typeof options.body === 'string') {
          const body = JSON.parse(options.body);
          const sanitized = sanitizeRequestBody(body);
          options.body = JSON.stringify(sanitized);
        }
      } catch (_e) {
        // If body isn't valid JSON, pass through unchanged
      }
    }

    return originalFetch(url, options);
  };
}

function createFireworksFirepassProvider(options = {}) {
  // Create sanitized fetch to strip incompatible fields
  const fetch = createSanitizedFetch(options.fetch || globalThis.fetch);

  // Use official @ai-sdk/fireworks provider with sanitized fetch
  return createFireworks({
    ...options,
    fetch,
  });
}

// Backward compatibility - deprecated alias
function createFireworksTafeenProvider(options = {}) {
  console.warn('Deprecated: Use createFireworksFirepassProvider instead.');
  return createFireworksFirepassProvider(options);
}

module.exports = createFireworksFirepassProvider;
module.exports.createFireworksFirepassProvider = createFireworksFirepassProvider;
module.exports.createFireworksTafeenProvider = createFireworksTafeenProvider;
module.exports.createSanitizedFetch = createSanitizedFetch;
module.exports.FIELDS_TO_REMOVE = FIELDS_TO_REMOVE;
