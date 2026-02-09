/**
 * LLM Type Definitions for AI Abstraction Layer
 * 
 * This module defines types for the LLM provider abstraction used throughout Jarvis OS.
 */

export enum LLMProvider {
  OpenAI = "openai",
  Anthropic = "anthropic",
  Ollama = "ollama",
  LlamaCpp = "llamacpp"
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  provider: LLMProvider;
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  metadata?: Record<string, unknown>;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  content: string;
  usage?: LLMUsage;
  model: string;
  provider: LLMProvider;
  finishReason?: "stop" | "length" | "content_filter" | "tool_calls";
  raw?: unknown;
}

export interface LLMConfig {
  enabled: boolean;
  provider: LLMProvider;
  model: string;
  fallbackToStatic: boolean;
  maxTokensPerRequest: number;
  costGuardUsd: number;
  temperature?: number;
}

export interface LLMProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  organizationId?: string;
  timeout?: number;
}

export type LLMModelConfig = Record<string, {
  maxTokens?: number;
  costPerInputToken?: number;
  costPerOutputToken?: number;
}>;
