export interface DemoSummary
{
    title: string;
    bullets: string[];
}

/**
 * Builds a short demo summary for sample UI or documentation flows.
 */
export function buildDemoSummary(): DemoSummary
{
    return {
        title   : 'PullerBear demo',
        bullets : [
            'Checks incoming commits before pull',
            'Summarizes changes in plain language',
            'Supports follow-up questions in chat'
        ]
    };
}
