import * as vscode from 'vscode';
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

  const runRequest = async (
    timeoutMs: number,
    onSlowRequestAtMs?: number
  ): Promise<any> =>
  {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort('timeout'), timeoutMs);
    const slowRequestHandle = onSlowRequestAtMs
      ? setTimeout(() =>
        {
          void vscode.window.showInformationMessage(
            'PullerBear: AI summary is taking longer than expected. Still waiting...'
          );
        }, onSlowRequestAtMs)
      : undefined;

    try
    {
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
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(describeOpenRouterStatus(response.status));
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content ?? '';
    }
    finally
    {
      clearTimeout(timeoutHandle);
      if (slowRequestHandle)
      {
        clearTimeout(slowRequestHandle);
      }
    }
  };

  try {
    return await runRequest(30000);
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      void vscode.window.showInformationMessage(
        'PullerBear: AI request timed out after 30 seconds. Retrying once and waiting longer before giving up.'
      );
      try
      {
        return await runRequest(5 * 60 * 1000, 2 * 60 * 1000);
      }
      catch (retryError)
      {
        if (retryError instanceof Error && (retryError.name === 'TimeoutError' || retryError.name === 'AbortError'))
        {
          throw new Error('OpenRouter request timed out after 5 minutes.');
        }
        throw retryError;
      }
    }
    if (error instanceof Error && /fetch failed|network|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(error.message)) {
      throw new Error('Could not reach OpenRouter. Check your internet connection or firewall.');
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
