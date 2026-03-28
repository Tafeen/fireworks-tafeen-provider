# Fireworks Tafeen Provider

> **This is a fully ad-hoc, vibe-coded implementation** for OpenCode version 1.3.3. It was built quickly to solve an immediate problem—sanitizing agent configs for Fireworks AI's strict OpenAI-compatible endpoint. No formal testing, no rigorous edge-case handling. Use at your own risk, or fork and improve.

A wrapper around `@ai-sdk/openai-compatible` that sanitizes agent configurations before sending them to Fireworks AI. Specifically designed to handle strict OpenAI-compatible providers that reject extra fields like `id`, `category`, `type`, `version`, and `author`.

## Installation

```bash
npm install fireworks-tafeen-provider
```

## Usage

### As an OpenCode Provider

Add to your `opencode.json`:

```json
{
  "provider": {
    "fireworks-tafeen": {
      "npm": "fireworks-tafeen-provider",
      "name": "Fireworks Tafeen (Kimi-compatible)",
      "options": {
        "baseURL": "https://api.fireworks.ai/inference/v1",
        "apiKey": "{env:FIREWORKS_API_KEY}"
      },
      "models": {
        "accounts/fireworks/routers/kimi-k2p5-turbo": {
          "name": "Kimi2.5 Turbo (Sanitized)"
        }
      }
    }
  }
}
```

### As a Node.js Module

```javascript
const { createFireworksTafeenProvider } = require('fireworks-tafeen-provider');

const provider = createFireworksTafeenProvider({
  baseURL: 'https://api.fireworks.ai/inference/v1',
  apiKey: process.env.FIREWORKS_API_KEY
});

const model = provider.languageModel('accounts/fireworks/routers/kimi-k2p5-turbo', {
  // These fields will be automatically removed:
  // id, category, type, version, author
  temperature: 0.7
});
```

## What It Does

This provider wrapper:

1. **Intercepts all model creation calls** to the underlying `@ai-sdk/openai-compatible` provider
2. **Removes restricted fields** from agent configurations:
   - `id`
   - `category`
   - `type`
   - `version`
   - `author`
3. **Normalizes response fields** (`finishReason`, `reason`) from objects to strings for compatibility
4. **Passes all other options through** unchanged
5. **Logs sanitization actions** when `DEBUG_FIREWORKS_TAFEEN` environment variable is set

## Debugging

Enable debug logging:

```bash
DEBUG_FIREWORKS_TAFEEN=1 node your-app.js
```

## Why This Exists

Fireworks AI's Kimi models through their OpenAI-compatible endpoint are strict about rejecting unknown fields in the request body. OpenCode sometimes includes metadata fields like `id`, `category`, `type`, etc. in agent configurations, which causes Fireworks to return errors like:

```
Unknown argument: 'id' is not a valid request argument
```

This wrapper ensures only valid OpenAI-compatible options are passed through.

## Compatibility

- OpenCode: 1.3.3+
- Node.js: 18+
- @ai-sdk/openai-compatible: 1.0.21

## License

MIT
