import { diffContext } from "./promptBuilder";
import { buildPrompt, buildQAPrompt, QAContext } from "./promptBuilder";
import { getPullerBearConfig } from "../config/pullerBearConfig";

function describeOpenRouterStatus(status: number): string
{
  switch (status) {
  case 400:
    return 'OpenRouter request was invalid. Check the configured model or request payload.';
  case 401:
    return 'OpenRouter authentication failed. Check pullerBear.apiKey.';
  case 402:
    return 'OpenRouter billing or credit limit blocked the request.';
  case 403:
    return 'OpenRouter rejected access to this request. Check your API key permissions.';
  case 404:
    return 'OpenRouter endpoint or model was not found.';
  case 408:
    return 'OpenRouter request timed out.';
  case 413:
    return 'The diff was too large for the AI request. Try a smaller change set.';
  case 429:
    return 'OpenRouter rate limit reached. Try again in a moment.';
  case 500:
  case 502:
  case 503:
  case 504:
    return 'OpenRouter is temporarily unavailable. Try again later.';
  default:
    return `OpenRouter request failed with status ${status}.`;
  }
}

async function requestOpenRouter(messages: unknown): Promise<any>
{
  const config = getPullerBearConfig();
  const apiKey = config.apiKey;

  if (!apiKey) {
    throw new Error('API key not configured. Please set pullerBear.apiKey in VS Code settings.');
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        messages,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(describeOpenRouterStatus(response.status));
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? '';
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error('OpenRouter request timed out after 30 seconds.');
      }

      if (/fetch failed|network|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(error.message)) {
        throw new Error('Could not reach OpenRouter. Check your internet connection or firewall.');
      }
    }

    throw error;
  }
}

export async function analyzeCode(context: diffContext): Promise<any> {
  const prompt = buildPrompt(context);
  return requestOpenRouter(prompt);
}

export async function askAboutCommit(question: string, reviewJson: string): Promise<string> {
  const qaContext: QAContext = { question, reviewJson };
  const prompt = buildQAPrompt(qaContext);
  const response = await requestOpenRouter(prompt);
  return response ?? 'No response from AI.';
}
