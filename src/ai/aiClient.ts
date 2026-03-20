import { diffContext } from "./promptBuilder";
import { buildPrompt, buildQAPrompt, QAContext } from "./promptBuilder";
import { getPullerBearConfig } from "../config/pullerBearConfig";

export async function analyzeCode(context: diffContext): Promise<any> {
  const config = getPullerBearConfig();
  const apiKey = config.apiKey;

  if (!apiKey) {
    throw new Error('API key not configured. Please set pullerBear.apiKey in VS Code settings.');
  }

  const prompt = buildPrompt(context);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openrouter/free',
      messages: prompt,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

export async function askAboutCommit(question: string, reviewJson: string): Promise<string> {
  const config = getPullerBearConfig();
  const apiKey = config.apiKey;

  if (!apiKey) {
    throw new Error('API key not configured. Please set pullerBear.apiKey in VS Code settings.');
  }

  const qaContext: QAContext = { question, reviewJson };
  const prompt = buildQAPrompt(qaContext);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openrouter/free',
      messages: prompt,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? 'No response from AI.';
}
