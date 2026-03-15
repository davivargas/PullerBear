interface AIResponse {
    file: string;
    line: number;
    severity: string;
    summary: string;
}

export function parseAIResponse(response: AIResponse[]): string {
    if (!Array.isArray(response) || response.length === 0) {
        return "No issues or summaries found.";
    }

    console.log(response);
    let summary = "";
    response.forEach(item => {
        if (item.severity === "error" || item.severity === "warning") {
            summary += `File: ${item.file}\nSeverity: ${item.severity}\nLine: ${item.line}\nSummary: ${item.summary}\n\n`;
        } else if (item.severity === "info") {
            summary += `File: ${item.file}\nSummary: ${item.summary}\n\n`;
        }
    });
    return summary;
}