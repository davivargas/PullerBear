export interface diffContext {
    branchName: string;
    diffText: string;
}

export function buildPrompt(context: diffContext): { role: string; content: string }[] {
    return [
        {
            role: 'system',
            content: getSystemPrompt()
        },
        {   
            role: 'user',
            content: `Analyze the following changes in branch ${context.branchName} and provide a summary of the changes, their purpose, and any potential impacts:\n\n${context.diffText}`
        }
    ];
}

function getSystemPrompt(): string {
    return `You are an expert senior software engineer performing a code review. 
Your task is to analyze the provided Git diff for bugs, security vulnerabilities, and performance issues.

RULES:
1. Only comment on actual issues. Do not compliment the code or explain what it does.
2. Focus on the added lines (+). 
3. You MUST respond entirely in valid JSON. Do not include markdown formatting like \`\`\`json. 
4. If there are no issues, return an empty array: []

OUTPUT FORMAT:
Return an array of objects with the following exact structure:
[
  {
    "file": "path/to/file.ext",
    "line": 42,
    "severity": "error" | "warning" | "info",
    "message": "A concise description of the issue."
  }
]`;
}