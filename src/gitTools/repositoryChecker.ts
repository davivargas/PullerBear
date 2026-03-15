import * as vscode from 'vscode';
import { analyzeCode } from '../ai/aiClient';
import { ExplainerViewProvider, CommitSummary } from '../ExplainerViewProvider';
import { getPullerBearConfig } from '../config/pullerBearConfig';
import { RepoMonitorState, GitMonitorConfig } from './types';
import {
    pruneOldTimestamps,
    addNewCommitTimestamps,
    calculateNewCommits,
    getCommitsInWindow
} from './commitTracker';
import { writeToFile } from '../utl/fileWrite';
import { detectDefaultBranch, getBranchBehindCount, getConfiguredBranchBehindCount } from './gitState';

/**
 * Checks if the repository has an upstream branch configured
 */
export function hasUpstreamBranch(head: any): boolean
{
    return !!(head && head.upstream);
}

/**
 * Shows a message when no upstream is set
 */
export function showNoUpstreamMessage(): void
{
    vscode.window.showInformationMessage(
        '🐻‍❄️ PullerBear: No upstream branch set for the current branch.'
    );
}

/**
 * Shows a message when the repository is up to date
 */
export function showUpToDateMessage(): void
{
    vscode.window.showInformationMessage(
        '🐻‍❄️ PullerBear: You\'re up to date! No new commits on the remote.'
    );
}

/**
 * Shows the hard stop warning message
 */
export function showHardStopMessage(commitsInWindow: number, config: GitMonitorConfig): void
{
    vscode.window.showWarningMessage(
        `🐻‍❄️ PullerBear paused summarization. ` +
        `${commitsInWindow} incoming commit(s) were detected in the last ` +
        `${config.commitWindowMinutes} minute(s), reaching the hard stop threshold ` +
        `(${config.hardStopCommitThreshold}).`
    );
}

/**
 * Shows the warning message and returns whether to continue
 */
export async function showWarningMessage(
    commitsInWindow: number,
    config: GitMonitorConfig
): Promise<boolean>
{
    const selection = await vscode.window.showWarningMessage(
        `🐻‍❄️ PullerBear detected ${commitsInWindow} incoming commit(s) in the last ` +
        `${config.commitWindowMinutes} minute(s). This repository may be too active ` +
        `for a useful summary. Do you want to continue anyway?`,
        { modal: true },
        'Continue',
        'Cancel'
    );

    return selection === 'Continue';
}

/**
 * Shows the remote changes detected message
 */
export function showRemoteChangesMessage(behindCount: number): void
{
    vscode.window.showInformationMessage(
        `🐻‍❄️ PullerBear: Remote changes detected — you're behind by ${behindCount} commit(s).`
    );
}

/**
 * Creates a commit summary from the analysis results
 */
export function createCommitSummary(
    head: any,
    behindCount: number,
    summaryText: string
): CommitSummary
{
    return createCommitSummaryObject(
        head.commit ?? 'unknown',
        behindCount,
        head.upstream.remote,
        head.upstream.name,
        summaryText
    );
}

/**
 * Creates a new CommitSummary object with the given parameters
 */
export const createCommitSummaryObject = (
    commitHash: string,
    behindCount: number,
    remoteName: string,
    branchName: string,
    summaryText: string
): CommitSummary => ({
    hash: commitHash,
    message: `${behindCount} new commit(s) on ${remoteName}/${branchName}`,
    summary: summaryText,
    timestamp: Date.now()
});

/**
 * Creates a fallback commit summary when AI fails
 */
export function createFallbackSummary(head: any, behindCount: number): CommitSummary
{
    return {
        hash      : head.commit ?? 'unknown',
        message   : `${behindCount} new commit(s) on ` +
                    `${head.upstream.remote}/${head.upstream.name}`,
        summary   : `You are ${behindCount} commit(s) behind. ` +
                    `AI summary unavailable.`,
        timestamp : Date.now()
    };
}

/**
 * Runs AI analysis on the repository diff
 */
export async function runAIAnalysis(
    repository: any,
    head: any
): Promise<CommitSummary | null>
{
    try
    {
        // Compare HEAD with upstream branch to get incoming changes
        const upstreamRef = `${head.upstream.remote}/${head.upstream.name}`;
        const diffText = await repository.diff(`${upstreamRef}...HEAD`);
        
        // Check if diff is available
        if (!diffText || typeof diffText !== 'string')
        {
            console.warn('[PullerBear] No diff available for analysis');
            const behindCount = head.behind ?? 0;
            return createFallbackSummary(head, behindCount);
        }
        
        const analysis = await analyzeCode({
            branchName : head.name ?? 'unknown',
            diffText   : diffText
        });

        // Extract AI summary text from OpenRouter response
        const summaryText =
            analysis?.choices?.[0]?.message?.content ??
            JSON.stringify(analysis);

        const behindCount = head.behind ?? 0;
        const summary =  createCommitSummary(head, behindCount, summaryText);
        writeToFile(summary);
        return summary;
    }
    catch (aiError)
    {
        console.error('[PullerBear] AI analysis failed:', aiError);
        const behindCount = head.behind ?? 0;
        return createFallbackSummary(head, behindCount);
    }
}

/**
 * Checks if commits exceed the hard stop threshold
 */
export function exceedsHardStopThreshold(
    commitsInWindow: number,
    config: GitMonitorConfig
): boolean
{
    return commitsInWindow >= config.hardStopCommitThreshold;
}

/**
 * Checks if commits exceed the warning threshold
 */
export function exceedsWarningThreshold(
    commitsInWindow: number,
    config: GitMonitorConfig
): boolean
{
    return commitsInWindow > config.warningCommitThreshold;
}

/**
 * Main function to check a repository for new commits
 */
export async function checkRepository(
    repository: any,
    state: RepoMonitorState,
    provider: ExplainerViewProvider
): Promise<void>
{
    if (state.isChecking)
    {
        return;
    }

    state.isChecking = true;

    try
    {
        const config = getPullerBearConfig();
        const windowMs = config.commitWindowMinutes * 60 * 1000;
        const branchRef = config.branchRef || 'main';

        // Fetch all branches from all remotes
        await repository.fetch();
        console.log('[PullerBear] Fetched latest from remote.');

        // Use the configured branchRef to determine behind count
        const currentBehind = getConfiguredBranchBehindCount(repository);

        // If not behind the configured branch, only notify if we were previously behind
        if (currentBehind <= 0)
        {
            // Only show "up to date" if we were previously behind
            if (state.lastBehindCount > 0)
            {
                showUpToDateMessage();
            }
            state.lastBehindCount = currentBehind;
            return;
        }

        const newIncomingCommits = calculateNewCommits(currentBehind, state.lastBehindCount);

        state.lastBehindCount = currentBehind;

        // Add new commit timestamps
        addNewCommitTimestamps(state, newIncomingCommits);

        // Get commits in window (also prunes old ones)
        const commitsInWindow = getCommitsInWindow(state.commitTimestamps, windowMs);

        if (exceedsHardStopThreshold(commitsInWindow, config))
        {
            showHardStopMessage(commitsInWindow, config);
            return;
        }

        if (exceedsWarningThreshold(commitsInWindow, config))
        {
            const shouldContinue = await showWarningMessage(commitsInWindow, config);

            if (!shouldContinue)
            {
                return;
            }
        }

        const behindCount: number = currentBehind;

        showRemoteChangesMessage(behindCount);

        // Create a mock head object for runAIAnalysis that uses branchRef
        const head = {
            commit: repository.state?.HEAD?.commit ?? 'unknown',
            name: branchRef,
            upstream: {
                remote: 'origin',
                name: branchRef
            },
            behind: behindCount
        };

        // Run AI analysis and push results to the sidebar
        const summary = await runAIAnalysis(repository, head);

        if (summary)
        {
            provider.addSummary(summary);
        }
    }
    catch (error)
    {
        console.error('[PullerBear] Error fetching repository:', error);
        vscode.window.showErrorMessage('PullerBear: Error fetching repository.');
    }
    finally
    {
        state.isChecking = false;
    }
}