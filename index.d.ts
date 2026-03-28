export interface FireworksTafeenProviderOptions {
  baseURL?: string;
  apiKey?: string;
  fetch?: typeof fetch;
}

export interface FireworksTafeenProvider {
  (modelId: string): any;
  languageModel(modelId: string, config?: any): any;
  chatModel(modelId: string): any;
  completionModel(modelId: string): any;
}

export function createFireworksTafeenProvider(
  options?: FireworksTafeenProviderOptions
): FireworksTafeenProvider;

export function createOpenAICompatible(
  options?: FireworksTafeenProviderOptions
): FireworksTafeenProvider;

export function createProvider(
  options?: FireworksTafeenProviderOptions
): FireworksTafeenProvider;

export default createFireworksTafeenProvider;
