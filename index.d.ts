export interface FireworksFirepassProviderOptions {
  baseURL?: string;
  apiKey?: string;
  fetch?: typeof fetch;
}

export interface TokenCountResult {
  messages: Array<{role: string; content: string}>;
  truncated: boolean;
  originalTokens: number;
  finalTokens: number;
  removedCount?: number;
}

export interface CostEstimate {
  input: number;
  output: number;
  total: number;
}

export interface FireworksFirepassModel {
  (prompt: string): any;
  doGenerate(options: any): Promise<any>;
  doStream(options: any): Promise<any>;
  
  /**
   * Count tokens in a text string
   */
  countTokens(text: string): number;
  
  /**
   * Count tokens in an array of messages
   */
  countMessageTokens(messages: Array<{role: string; content: string; name?: string}>): number;
  
  /**
   * Get the context window size for this model
   */
  getContextWindow(): number;
  
  /**
   * Get pricing information for this model
   */
  getPricing(): { input: number; output: number };
  
  /**
   * Estimate cost for a request
   */
  estimateCost(inputTokens: number, outputTokens: number): CostEstimate;
  
  /**
   * Truncate messages to fit within context window
   */
  truncateMessages(
    messages: Array<{role: string; content: string}>,
    maxTokens?: number
  ): TokenCountResult;
}

export interface FireworksFirepassProvider {
  (modelId: string): FireworksFirepassModel;
  languageModel(modelId: string, config?: any): FireworksFirepassModel;
  chatModel(modelId: string): FireworksFirepassModel;
  completionModel(modelId: string): FireworksFirepassModel;
  
  /**
   * Count tokens in a text string (provider-level utility)
   */
  countTokens(text: string): number;
  
  /**
   * Get context window size for a model
   */
  getContextWindow(modelId: string): number;
  
  /**
   * Get pricing information for a model
   */
  getModelPricing(modelId: string): { input: number; output: number };
  
  /**
   * Estimate cost for a request
   */
  estimateCost(modelId: string, inputTokens: number, outputTokens: number): CostEstimate;
}

/**
 * Create a Fireworks Firepass provider instance
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

/**
 * Alias for createFireworksFirepassProvider
 */
export function createOpenAICompatible(
  options?: FireworksFirepassProviderOptions
): FireworksFirepassProvider;

/**
 * Alias for createFireworksFirepassProvider
 */
export function createProvider(
  options?: FireworksFirepassProviderOptions
): FireworksFirepassProvider;

export default createFireworksFirepassProvider;
