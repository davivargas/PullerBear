import { getPullerBearConfig } from "../config/pullerBearConfig";
import { buildPrompt, buildQAPrompt, diffContext, QAContext } from "./promptBuilder";

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'openrouter/free';

interface OpenRouterChatResponse
{
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface OpenRouterErrorResponse
{
  error?: {
    code?: number;
    message?: string;
    metadata?: Record<string, unknown>;
  };
}

function getApiKey(): string
{
  const apiKey = getPullerBearConfig().apiKey;

  if (!apiKey) {
    throw new Error('API key not configured. Please set pullerBear.apiKey in VS Code settings.');
  }

  return apiKey;
}

function resolveModel(): string
{
  const configuredModel = getPullerBearConfig().model?.trim();
  return configuredModel || DEFAULT_OPENROUTER_MODEL;
}

async function parseOpenRouterError(response: Response): Promise<string | undefined>
{
  const jsonSource = typeof response.clone === 'function'
    ? response.clone()
    : response;

  if (typeof jsonSource.json === 'function') {
    try {
      const payload = await jsonSource.json() as OpenRouterErrorResponse;
      const message = payload.error?.message?.trim();

      if (message) {
        return message;
      }
    } catch {
      // Fall through to text parsing below.
    }
  }

  if (typeof response.text === 'function') {
    try {
      const text = (await response.text()).trim();
      return text || undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function buildOpenRouterError(status: number, model: string, detail?: string): Error
{
  const baseMessage = detail
    ? `OpenRouter error (${status}): ${detail}`
    : `OpenRouter error (${status}).`;

  if (status === 402) {
    const modelHint = model === DEFAULT_OPENROUTER_MODEL
      ? 'Check your OpenRouter credits page and API key credit limit.'
      : `Check your OpenRouter credits page and API key credit limit, or try setting pullerBear.model to "${DEFAULT_OPENROUTER_MODEL}".`;

    return new Error(
      `${baseMessage} OpenRouter uses 402 for insufficient credits or API key credit-limit issues, and that can still happen on free models. ${modelHint}`
    );
  }

  if (status === 429) {
    return new Error(
      `${baseMessage} OpenRouter is rate-limiting this key right now. Free-model keys are especially limited.`
    );
  }

  return new Error(baseMessage);
}

async function sendChatCompletion(messages: unknown[]): Promise<string>
{
  const apiKey = getApiKey();
  const model = resolveModel();

  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization       : 'Bearer ' + apiKey,
      'Content-Type'      : 'application/json',
      'HTTP-Referer'      : 'https://github.com/davivargas/PullerBear',
      'X-OpenRouter-Title': 'PullerBear'
    },
    body: JSON.stringify({
      model,
      messages
    }),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const detail = await parseOpenRouterError(response);
    throw buildOpenRouterError(response.status, model, detail);
  }

  const data = await response.json() as OpenRouterChatResponse;
  return data.choices?.[0]?.message?.content ?? '';
}

export async function analyzeCode(context: diffContext): Promise<string> {
  const prompt = buildPrompt(context);
  return sendChatCompletion(prompt);
}

export async function askAboutCommit(question: string, reviewJson: string): Promise<string> {
  const qaContext: QAContext = { question, reviewJson };
  const prompt = buildQAPrompt(qaContext);
  const response = await sendChatCompletion(prompt);
  return response || 'No response from AI.';
}
