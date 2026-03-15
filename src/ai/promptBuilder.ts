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

export interface QAContext {
    question: string;
    reviewJson: string;
}

export function buildQAPrompt(context: QAContext): { role: string; content: string }[] {
    return [
        {
            role: 'system',
            content: getQASystemPrompt()
        },
        {
            role: 'user',
            content: `Here is the commit review data:\n\n${context.reviewJson}\n\nUser question: ${context.question}`
        }
    ];
}

function getQASystemPrompt(): string {
    return `You are a helpful assistant for the PullerBear VS Code extension.
You have access to a JSON array of commit review data. Each object in the array contains:
- "file": the file that was changed
- "line": the line number of the change
- "severity": "error", "warning", or "info"
- "summary": a description of the change or issue

Your job is to answer the user's question about these commits clearly and concisely.
Base your answer strictly on the provided review data. If the data does not contain enough information to answer the question, say so.
Keep responses short and developer-friendly. Do not use markdown formatting.`;
}

function getSystemPrompt(): string {
    return `You are an expert senior software engineer performing a code review.
            Your task is to analyze the provided Git diff for bugs, security vulnerabilities,
            performance issues, and changes that may negatively affect the current HEAD when
            the branch is pulled or merged.

            ANALYSIS ORDER:
            1. Determine whether the incoming changes are likely to affect the current HEAD.
            Check for likely merge/conflict hotspots, overlapping responsibilities, changed
            interfaces, renamed fields/functions, altered return types, changed config keys,
            changed side effects, or behavior changes that could break current local code.
            2. Form a concise technical understanding of what changed.
            3. Report only actual issues supported by the diff.

            RULES:
            1. Base your response only on the additions (+), deletions (-), and the immediate
                surrounding context shown in the diff.
            2. You MUST respond entirely in valid JSON. Do not include markdown formatting like \`\`\`json.
            3. Evaluate each changed file independently.
            4. For EVERY changed file, always return exactly one file-level summary object using:
               - "severity": "info"
               - "line": 0  
               - "summary": string
            5. The summary object must concisely describe the file's changes in technical, 
                human-readable language for a developer.
            6. If supported by the diff, the summary object should also state whether the file
                is likely to affect the current HEAD after pull/merge/rebase.
            7. After the summary object for a file, return additional objects for any concrete
                bugs, security vulnerabilities, performance issues, integration risks, or likely conflicts.
            8. Prefer one issue per object.
            9. Only report issue objects when there is a real concern supported by the diff.
            10. Do not speculate. If the diff does not support the concern, do not report it.
            11. If multiple files are present, attribute each issue to the most appropriate filename
                using the --- a/ and +++ b/ headers, while considering cross-file impact when supported by the diff.
            12. You will receive a standard Unified Diff format. Do not hallucinate code that is not shown.
            13. Use the most relevant changed target-file line number when it is clear from the diff hunk;
                otherwise use the closest identifiable changed line.
            14. Order the output by file. For each file, put the summary object first, followed by any issue objects.

            SEVERITY GUIDANCE:
            - "error": likely bug, breakage, or strong conflict risk
            - "warning": meaningful risk, maintainability issue, or possible integration problem
            - "info": minor but real issue with low impact

            OUTPUT FORMAT:
            Return an array of objects with the following exact structure:
            [
            {
                "file": "path/to/file.ext",
                "line": 42,
                "severity": "error" | "warning" | "info",
                "summary": "A concise description of the issue. DO NOT INCLUDE Message: or Summary: in the summary."
            }
            ]`;
}