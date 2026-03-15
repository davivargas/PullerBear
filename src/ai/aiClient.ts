import * as vscode from 'vscode';
import { diffContext } from "./promptBuilder";
import { buildPrompt } from "./promptBuilder";
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
      model: 'minimax/minimax-m2.5',
      messages: prompt,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data;
}


