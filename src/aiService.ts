import * as vscode from 'vscode';

/**
 * Summarizes a list of commits using the VS Code Language Model API.
 * Returns a human-readable markdown summary of the incoming changes.
 */
export async function summarizeCommits(
    commitMessages: string[],
    diffs: string[]
): Promise<string> {
    // Try to access VS Code's LM API
    let [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });

    // Fallback to any available model if gpt-4o not found
    if (!model) {
        const allModels = await vscode.lm.selectChatModels();
        model = allModels[0];
    }

    if (!model) {
        // No AI model available — return a plain summary
        const lines = commitMessages.map((m, i) => `- ${m}`).join('\n');
        return `**Incoming changes (${commitMessages.length} commits):**\n${lines}`;
    }

    const commitBlock = commitMessages.map((m, i) => `${i + 1}. ${m}`).join('\n');
    const diffBlock = diffs.length > 0
        ? `\n\nDiff preview (first 2000 chars):\n${diffs.join('\n---\n').slice(0, 2000)}`
        : '';

    const prompt = `You are a code change explainer for developers. 
Summarize the following incoming git commits in clear, concise bullet points that a developer can quickly understand.
Focus on: what changed, why it matters, and any potential impacts.
Respond in markdown.

Commits:
${commitBlock}${diffBlock}`;

    const messages = [vscode.LanguageModelChatMessage.User(prompt)];

    try {
        const response = await model.sendRequest(messages, {});
        let text = '';
        for await (const chunk of response.text) {
            text += chunk;
        }
        return text;
    } catch (err) {
        console.error('[PullerBear] AI summarization failed:', err);
        return commitMessages.map(m => `- ${m}`).join('\n');
    }
}
