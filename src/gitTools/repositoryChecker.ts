import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { analyzeCode } from '../ai/aiClient';
import { parseAIResponse } from '../ai/parser';
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

interface ReviewEntry
{
    file: string;
    line: number;
    severity: string;
    summary: string;
}

function isReviewEntry(value: unknown): value is ReviewEntry
{
    if (!value || typeof value !== 'object')
    {
        return false;
    }

    const candidate = value as Partial<ReviewEntry>;

    return typeof candidate.file === 'string' &&
        typeof candidate.line === 'number' &&
        typeof candidate.severity === 'string' &&
        typeof candidate.summary === 'string';
}

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
    const dedupKey = targetSha;
    const [remoteName, ...branchParts] = targetRef.split('/');
    const branchName = branchParts.join('/');

    return createCommitSummaryObject(
        dedupKey,
        behindCount,
        remoteName || 'origin',
        branchName || 'main',
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

function getFriendlyAiErrorMessage(error?: string): string
{
    if (!error)
    {
        return 'AI summary unavailable because the request failed for an unknown reason.';
    }

    if (error.includes('API key not configured'))
    {
        return 'AI summary unavailable because no API key is configured. Set pullerBear.apiKey in VS Code settings.';
    }

    if (error.includes('authentication failed'))
    {
        return 'AI summary unavailable because OpenRouter rejected your API key. Update pullerBear.apiKey.';
    }

    if (error.includes('billing or credit limit'))
    {
        return 'AI summary unavailable because the OpenRouter account has no available credits or billing is blocked.';
    }

    if (error.includes('rejected access'))
    {
        return 'AI summary unavailable because OpenRouter denied access to this request. Check API key permissions.';
    }

    if (error.includes('endpoint or model was not found'))
    {
        return 'AI summary unavailable because the configured OpenRouter endpoint or model could not be found.';
    }

    if (error.includes('request timed out') || error.includes('timed out after 30 seconds'))
    {
        return 'AI summary unavailable because the OpenRouter request timed out. Try again or reduce the diff size.';
    }

    if (error.includes('diff was too large'))
    {
        return 'AI summary unavailable because the diff was too large for the AI request. Try reviewing a smaller change set.';
    }

    if (error.includes('rate limit'))
    {
        return 'AI summary unavailable because OpenRouter rate-limited the request. Try again in a moment.';
    }

    if (error.includes('temporarily unavailable'))
    {
        return 'AI summary unavailable because OpenRouter is temporarily unavailable. Try again later.';
    }

    if (error.includes('Could not reach OpenRouter'))
    {
        return 'AI summary unavailable because PullerBear could not reach OpenRouter. Check your internet connection, VPN, or firewall.';
    }

    return `AI summary unavailable because the AI request failed: ${error}`;
}

/**
 * Creates a fallback commit summary when AI fails
 */
export function createFallbackSummary(head: any, behindCount: number, upstreamSha: string, error?: string): CommitSummary
{
    const dedupKey = upstreamSha;
    const errorMessage = getFriendlyAiErrorMessage(error);

    const targetRef = resolveTargetBranchRef(head, getPullerBearConfig().branchRef);
    const [remoteName, ...branchParts] = targetRef.split('/');
    const branchName = branchParts.join('/') || 'main';
    
    return {
        hash        : dedupKey,
        message     : `${behindCount} new commit(s) on ` + `${remoteName || 'origin'}/${branchName}`,
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

        // Parse the AI response and format it
        let parsedAnalysis: unknown = [];
        try {
            // Sometimes the AI returns markdown or extra text, try to extract the JSON array
            const jsonMatch = typeof analysis === 'string' ? analysis.match(/\[[\s\S]*\]/) : null;
            if (jsonMatch) {
                parsedAnalysis = JSON.parse(jsonMatch[0]);
            } else {
                parsedAnalysis = JSON.parse(analysis);
            }
        } catch (e) {
            console.error('[PullerBear] Failed to parse AI JSON:', e);
            // Fallback to raw string if parsing fails
        }

        const reviewEntries = Array.isArray(parsedAnalysis)
            ? parsedAnalysis.filter(isReviewEntry)
            : [];

        const summaryText = reviewEntries.length > 0
            ? parseAIResponse(reviewEntries)
            : (typeof analysis === 'string' ? analysis : JSON.stringify(analysis));

        const summary = createCommitSummary(targetRef, behindCount, summaryText, targetSha);
        await writeToFile(reviewEntries);
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
    if (state.isChecking)
    {
        console.log('[PullerBear] checkRepository skipped: already checking');
        return;
    }

    state.isChecking = true;

    try
    {
        const config = getPullerBearConfig();
        const windowMs = config.commitWindowMinutes * 60 * 1000;

        // Fetch all branches from all remotes
        await repository.fetch();
        console.log('[PullerBear] Fetched latest from remote.');

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
        provider.setLoadingState?.(true, ExplainerViewProvider.defaultLoadingMessage);
        let summary: CommitSummary | null = null;
        try
        {
            summary = await runAIAnalysis(repository, head, targetRef, targetSha, behindCount);
        }
        finally
        {
            provider.setLoadingState?.(false);
        }

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
