import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
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

const execFileAsync = promisify(execFile);

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
 * Shows message for configured non-upstream branch updates.
 */
export function showConfiguredBranchChangesMessage(targetRef: string): void
{
    vscode.window.showInformationMessage(
        `🐻‍❄️ PullerBear: Remote changes detected on ${targetRef}.`
    );
}

/**
 * Resolves configured target branch ref for comparison.
 */
export function resolveTargetBranchRef(head: any, branchRef: string): string
{
    const configuredRef = branchRef.trim();
    if (!configuredRef || configuredRef.toLowerCase() === 'upstream')
    {
        if (head?.upstream?.remote && head?.upstream?.name)
        {
            return `${head.upstream.remote}/${head.upstream.name}`;
        }

        return 'origin/main';
    }

    if (configuredRef.includes('/'))
    {
        return configuredRef;
    }

    const remoteName = head?.upstream?.remote ?? 'origin';
    return `${remoteName}/${configuredRef}`;
}

/**
 * Checks whether target ref is the current branch's tracked upstream.
 */
export function isCurrentUpstreamTarget(head: any, targetRef: string): boolean
{
    if (!hasUpstreamBranch(head))
    {
        return false;
    }

    const upstreamRef = `${head.upstream.remote}/${head.upstream.name}`;
    return upstreamRef === targetRef;
}

/**
 * Looks up the upstream HEAD commit SHA from repository refs.
 */
export async function getTargetCommitHash(repository: any, targetRef: string): Promise<string> {
    
    try {
        const branch = await repository.getBranch(targetRef);
        if (branch && branch.commit) {
            return branch.commit;
        }
    } catch (e) {
        console.warn(`[PullerBear] Failed to get branch for ${targetRef}:`, e);
    }

    const refs: any[] = repository.state?.refs ?? [];
    const [remoteName, ...branchParts] = targetRef.split('/');
    const branchName = branchParts.join('/');
    const match = refs.find((r: any) =>
        r.name === targetRef ||
        r.name === `refs/remotes/${targetRef}` ||
        (r.remote === remoteName && r.name === branchName)
    );
    return match?.commit ?? 'unknown';
}

/**
 * Creates a commit summary from the analysis results
 */
export function createCommitSummary(
    targetRef: string,
    behindCount: number,
    summaryText: string,
    targetSha: string
): CommitSummary
{
    const [remoteName, ...branchParts] = targetRef.split('/');
    const branchName = branchParts.join('/');
    const dedupKey = targetSha;
    return createCommitSummaryObject(
        dedupKey,
        behindCount,
        remoteName,
        branchName,
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
export function createFallbackSummary(head: any, behindCount: number, upstreamSha: string, error?: string): CommitSummary
{
    const dedupKey = upstreamSha;
    const errorMessage = error?.includes('API key not configured')
        ? 'Please set pullerBear.apiKey in VS Code settings to enable AI summaries.'
        : 'AI summary unavailable.';

    const remoteName = head?.upstream?.remote ?? 'origin';
    const branchName = head?.upstream?.name ?? 'main';
    
    return {
        hash        : dedupKey,
        message     : `${behindCount} new commit(s) on ` + `${remoteName}/${branchName}`,
        summary     : `You are ${behindCount} commit(s) behind. ${errorMessage}`,
        timestamp   : Date.now()
    };
}

/**
 * Normalizes the Git API diff payload into plain text for AI input.
 */
export function normalizeDiffPayload(rawDiff: unknown): string
{
    if (typeof rawDiff === 'string')
    {
        return rawDiff;
    }

    if (Array.isArray(rawDiff))
    {
        const entries = rawDiff.map((item: any, index: number) =>
        {
            if (typeof item === 'string')
            {
                return item;
            }

            const uri = item?.uri?.fsPath ?? item?.uri?.path ?? 'unknown';
            const originalUri = item?.originalUri?.fsPath ?? item?.originalUri?.path;
            const status = item?.status ?? 'unknown';
            const renameInfo = originalUri && originalUri !== uri
                ? ` (from ${originalUri})`
                : '';

            return `- [${index + 1}] status=${status} file=${uri}${renameInfo}`;
        });

        return entries.join('\n');
    }

    if (rawDiff && typeof rawDiff === 'object')
    {
        try
        {
            return JSON.stringify(rawDiff, null, 2);
        }
        catch
        {
            return '';
        }
    }
    return '';
}

/**
 * Fallback path to obtain a real unified patch directly from git CLI.
 */
export async function getDiffFromGitCli(repository: any, range: string): Promise<string>
{
    const cwd = repository?.rootUri?.fsPath;
    if (!cwd || typeof cwd !== 'string')
    {
        return '';
    }

    try
    {
        const { stdout } = await execFileAsync(
            'git',
            ['diff', '--no-color', '--patch', range],
            { cwd, maxBuffer: 10 * 1024 * 1024 }
        );

        return typeof stdout === 'string' ? stdout : '';
    }
    catch (error)
    {
        console.warn('[PullerBear] git diff fallback failed:', error);
        return '';
    }
}

/*
 * Runs AI analysis on the repository diff
*/
export async function runAIAnalysis(
    repository: any,
    head: any,
    targetRef: string,
    targetSha: string,
    behindCount: number
): Promise<CommitSummary | null>
{
    try
    {
        // Compare HEAD with configured target branch to get incoming changes
        const range = `HEAD...${targetRef}`;

        let rawDiff: unknown;
        if (typeof repository.diffWith === 'function')
        {
            rawDiff = await repository.diffWith(range);
        }
        else
        {
            rawDiff = await repository.diff(range);
        }

        const apiDiffText = normalizeDiffPayload(rawDiff);
        const looksLikePatch = apiDiffText.includes('diff --git') || apiDiffText.includes('@@');
        const cliDiffText = looksLikePatch ? '' : await getDiffFromGitCli(repository, range);
        const diffText = cliDiffText || apiDiffText;
        const analysis = await analyzeCode({
            branchName : head.name ?? 'unknown',
            diffText
        });

        // Extract AI summary text from OpenRouter response
        const summaryText =
            analysis?.choices?.[0]?.message?.content ??
            JSON.stringify(analysis);

        const summary = createCommitSummary(targetRef, behindCount, summaryText, targetSha);
        writeToFile(summary);
        return summary;
    }
    catch (aiError)
    {
        console.error('[PullerBear] AI analysis failed:', aiError);
        const errorMessage = aiError instanceof Error ? aiError.message : String(aiError);
        return createFallbackSummary(head, behindCount, targetSha, errorMessage);
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
    provider: ExplainerViewProvider,
    isManual: boolean = false
): Promise<void>
{
    // Use a queue to prevent race conditions between interval and manual checks
    if (state.checkQueue)
    {
        // If a check is already queued or running, skip this one
        // unless it's a manual check, which should wait for the current one to complete
        if (!isManual)
        {
            console.log('[PullerBear] checkRepository skipped: check already queued');
            return;
        }
        // For manual checks, wait for the current check to finish then run
        await state.checkQueue;
    }

    const runCheck = async (): Promise<void> =>
    {
        try
        {
            if (state.isChecking)
            {
                console.log('[PullerBear] checkRepository skipped: already checking');
                return;
            }

            state.isChecking = true;

            const config = getPullerBearConfig();
            const windowMs = config.commitWindowMinutes * 60 * 1000;

            // Fetch all branches from all remotes
            try
            {
                await repository.fetch();
                console.log('[PullerBear] Fetched latest from remote.');
            }
            catch (fetchError)
            {
                console.error('[PullerBear] Fetch failed:', fetchError);
                vscode.window.showWarningMessage(
                    '🐻‍❄️ PullerBear: Failed to fetch from remote. Check your network connection.'
                );
                state.isChecking = false;
                return;
            }

            const head = repository.state?.HEAD;

            const targetRef = resolveTargetBranchRef(head, config.branchRef);
            const isUpstreamTarget = isCurrentUpstreamTarget(head, targetRef);

            if (!isUpstreamTarget && isManual)
            {
                showConfiguredBranchChangesMessage(targetRef);
            }

            const targetSha = await getTargetCommitHash(repository, targetRef);
            const dedupKey = targetSha;

            if (provider.hasSummary(dedupKey))
            {
                console.log(`[PullerBear] checkRepository skipped: dedup hit for ${dedupKey}`);
                if (isManual)
                {
                    vscode.window.showInformationMessage(
                        '🐻‍❄️ PullerBear: No new commits to summarize.'
                    );
                }
                return;
            }

            const currentBehind = isUpstreamTarget ? (head?.behind ?? 0) : 1;
            const newIncomingCommits = calculateNewCommits(currentBehind, state.lastBehindCount);

            state.lastBehindCount = currentBehind;

            // Add new commit timestamps
            addNewCommitTimestamps(state, newIncomingCommits);

            // Get commits in window (also prunes old ones)
            const commitsInWindow = getCommitsInWindow(state.commitTimestamps, windowMs);

            if (isUpstreamTarget && currentBehind <= 0)
            {
                console.log('[PullerBear] checkRepository skipped: upstream target not behind');
                if (isManual)
                {
                    vscode.window.showInformationMessage(
                        '🐻‍❄️ PullerBear: You\'re all caught up! No new commits to summarize.'
                    );
                }
                return;
            }

            if (exceedsHardStopThreshold(commitsInWindow, config))
            {
                console.log('[PullerBear] checkRepository skipped: hard stop threshold exceeded');
                showHardStopMessage(commitsInWindow, config);
                return;
            }

            if (exceedsWarningThreshold(commitsInWindow, config))
            {
                const shouldContinue = await showWarningMessage(commitsInWindow, config);

                if (!shouldContinue)
                {
                    console.log('[PullerBear] checkRepository skipped: user canceled warning prompt');
                    return;
                }
            }

            const behindCount: number = currentBehind;

            if (isUpstreamTarget)
            {
                showRemoteChangesMessage(behindCount);
            }
            else
            {
                showConfiguredBranchChangesMessage(targetRef);
            }

            // Run AI analysis and push results to the sidebar
            console.log(`[PullerBear] Running AI analysis with target ${targetRef} and sha ${targetSha}`);
            const summary = await runAIAnalysis(repository, head, targetRef, targetSha, behindCount);

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
    };

    // Store the promise in the queue
    state.checkQueue = runCheck();
    await state.checkQueue;
    state.checkQueue = undefined;
}