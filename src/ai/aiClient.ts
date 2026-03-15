import 'dotenv/config';
import { diffContext } from "./promptBuilder";
import { buildPrompt } from "./promptBuilder";

export async function analyzeCode(context: diffContext): Promise<any> {
  const prompt = buildPrompt(context);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.API_KEY,
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


