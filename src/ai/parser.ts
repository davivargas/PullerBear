interface AIResponse {
    file: string;
    line: number;
    severity: string;
    summary: string;
}

export function parseAIResponse(response: AIResponse[]): string {
    if (response.length === 0) {
        return "Error generating a summary.";
    }

    console.log(response);
    let summary = "";
    response.forEach(item => {
        if (item.severity === "error" || item.severity === "warning") {
            summary += `File: ${item.file}\nLine: ${item.line}\nSeverity: ${item.severity}\n${item.summary}\n\n`;
        } else {
            summary += `File: ${item.file}\n${item.summary}\n\n`;
        }
    });
    return summary;
}