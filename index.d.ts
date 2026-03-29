export interface FireworksFirepassProviderOptions {
  baseURL?: string;
  apiKey?: string;
  fetch?: typeof fetch;
}

export interface FireworksFirepassProvider {
  (modelId: string): any;
  languageModel(modelId: string, config?: any): any;
  chatModel(modelId: string): any;
  completionModel(modelId: string): any;
}

/**
 * Create a Fireworks Firepass provider instance
 * 
 * This provider wraps @ai-sdk/fireworks and automatically strips
 * incompatible fields (id, category, type, version, author, reason, reasoning, reasoning_content)
 * from chat/completion requests.
 */
export function createFireworksFirepassProvider(
  options?: FireworksFirepassProviderOptions
): FireworksFirepassProvider;

/**
 * @deprecated Use createFireworksFirepassProvider instead
 */
export function createFireworksTafeenProvider(
  options?: FireworksFirepassProviderOptions
): FireworksFirepassProvider;

export default createFireworksFirepassProvider;
