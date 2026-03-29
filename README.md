# Fireworks AI - Firepass Provider

> **A production-ready provider for OpenCode** with built-in token counting and context window management for Fireworks AI models.

A wrapper around `@ai-sdk/openai-compatible` that provides:
- **Token counting** using gpt-tokenizer
- **Context window management** with automatic truncation
- **Cost estimation** per request
- **Field sanitization** for strict OpenAI-compatible endpoints
- **Response normalization** for finish reasons

## Installation

```bash
npm install @tafeen/fireworks-firepass-provider
```

## Usage

### As an OpenCode Provider

Add to your `opencode.json`:

```json
{
  "provider": {
    "fireworks-firepass": {
      "npm": "@tafeen/fireworks-firepass-provider",
      "name": "Fireworks AI - Firepass",
      "options": {
        "baseURL": "https://api.fireworks.ai/inference/v1",
        "apiKey": "{env:FIREWORKS_API_KEY}"
      },
      "models": {
        "accounts/fireworks/routers/kimi-k2p5-turbo": {
          "name": "Kimi K2.5 Turbo"
        }
      }
    }
  }
}
```

### As a Node.js Module

```javascript
const { createFireworksFirepassProvider } = require('@tafeen/fireworks-firepass-provider');

const provider = createFireworksFirepassProvider({
  baseURL: 'https://api.fireworks.ai/inference/v1',
  apiKey: process.env.FIREWORKS_API_KEY
});

const model = provider.languageModel('accounts/fireworks/routers/kimi-k2p5-turbo', {
  temperature: 0.7
});

// Token counting
const text = "Hello, how are you?";
const tokens = model.countTokens(text);
console.log(`Tokens: ${tokens}`);

// Count tokens in messages
const messages = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'What is the weather?' }
];
const messageTokens = model.countMessageTokens(messages);
console.log(`Message tokens: ${messageTokens}`);

// Get context window
const contextWindow = model.getContextWindow();
console.log(`Context window: ${contextWindow}`);

// Truncate messages to fit context
const truncated = model.truncateMessages(messages);
console.log(`Truncated: ${truncated.truncated}`);

// Estimate cost
const inputTokens = 1000;
const outputTokens = 500;
const cost = model.estimateCost(inputTokens, outputTokens);
console.log(`Estimated cost: $${cost.total.toFixed(6)}`);
```

## Features

### Token Counting

Uses `gpt-tokenizer` for accurate token estimation:

```javascript
// Count tokens in text
const tokens = model.countTokens("Your text here");

// Count tokens in messages array
const messageTokens = model.countMessageTokens([
  { role: 'user', content: 'Hello!' }
]);

// Provider-level utility
const providerTokens = provider.countTokens("Some text");
```

### Context Window Management

Automatically truncate messages to fit within model limits:

```javascript
const result = model.truncateMessages(messages, maxTokens);
// Returns:
// {
//   messages: [...],      // Truncated messages
//   truncated: true,       // Whether truncation occurred
//   originalTokens: 50000, // Original token count
//   finalTokens: 255000,   // Final token count
//   removedCount: 10       // Number of messages removed
// }
```

### Cost Estimation

Calculate expected costs before making API calls:

```javascript
// Get model pricing
const pricing = model.getPricing();
console.log(`Input: $${pricing.input}/1M tokens`);
console.log(`Output: $${pricing.output}/1M tokens`);

// Estimate cost
const cost = model.estimateCost(1000, 500);
console.log(`Total cost: $${cost.total}`);
```

### Supported Models

| Model | Context Window | Input Price | Output Price |
|-------|----------------|-------------|--------------|
| accounts/fireworks/routers/kimi-k2p5-turbo | 256,000 | $1.00/1M | $4.00/1M |
| accounts/fireworks/routers/kimi-k2p5 | 256,000 | $1.00/1M | $4.00/1M |
| accounts/fireworks/routers/kimi-k2p5-pro | 256,000 | $1.00/1M | $4.00/1M |
| accounts/fireworks/routers/kimi-k2 | 256,000 | $1.00/1M | $4.00/1M |
| accounts/fireworks/routers/kimi-k1.5 | 256,000 | $1.00/1M | $4.00/1M |
| accounts/fireworks/models/qwen2p5-coder-32b-instruct | 128,000 | $0.80/1M | $0.80/1M |
| accounts/fireworks/models/qwq-32b | 128,000 | $0.80/1M | $0.80/1M |
| accounts/fireworks/models/deepseek-v3 | 64,000 | $0.90/1M | $0.90/1M |
| accounts/fireworks/models/deepseek-r1 | 64,000 | $0.90/1M | $0.90/1M |
| accounts/fireworks/models/deepseek-v3-0324 | 64,000 | $0.90/1M | $0.90/1M |

### Field Sanitization

The provider automatically removes restricted fields from requests:
- `id`
- `category`
- `type`
- `version`
- `author`
- `reason`, `reasoning`, `reasoning_content`

### Response Normalization

Converts object-based `finishReason` and `reason` fields to strings for compatibility.

## Debugging

Enable debug logging:

```bash
DEBUG_FIREWORKS_FIREPASS=1 node your-app.js
```

## Testing

```bash
npm test              # Run tests once
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage
```

## Migration from v1.x

The old `fireworks-tafeen-provider` package name is deprecated. Update your imports:

```javascript
// Old (deprecated)
const { createFireworksTafeenProvider } = require('fireworks-tafeen-provider');

// New
const { createFireworksFirepassProvider } = require('@tafeen/fireworks-firepass-provider');
```

## Compatibility

- OpenCode: 1.3.3+
- Node.js: 18+
- @ai-sdk/openai-compatible: 1.0.21

## License

MIT

## Repository

https://github.com/Tafeen/fireworks-tafeen-provider
