import * as vscode from 'vscode';

const EXPLAINED_COMMITS_KEY = 'pullerbear.explainedCommits';

/**
 * Returns the set of commit hashes that have already been explained.
 */
export function getExplainedCommits(context: vscode.ExtensionContext): string[] {
    return context.workspaceState.get<string[]>(EXPLAINED_COMMITS_KEY) ?? [];
}

/**
 * Marks a commit hash as explained so it won't be re-processed.
 */
export async function markCommitAsExplained(
    context: vscode.ExtensionContext,
    hash: string
): Promise<void> {
    const existing = getExplainedCommits(context);
    if (!existing.includes(hash)) {
        await context.workspaceState.update(EXPLAINED_COMMITS_KEY, [...existing, hash]);
    }
}

/**
 * Returns only the commit hashes that have NOT yet been explained.
 */
export function getUnexplainedCommits(
    context: vscode.ExtensionContext,
    hashes: string[]
): string[] {
    const explained = new Set(getExplainedCommits(context));
    return hashes.filter(h => !explained.has(h));
}
