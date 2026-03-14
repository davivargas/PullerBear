import * as vscode from 'vscode';
import { analyzeCode } from '../ai/aiClient';
import { ExplainerViewProvider, CommitSummary } from '../ExplainerViewProvider';
import { getPullerBearConfig } from '../config/pullerBearConfig';

interface RepoMonitorState
{
    commitTimestamps : number[];
    lastBehindCount  : number;
    intervalHandle?  : NodeJS.Timeout;
    isChecking       : boolean;
}

export function gitMonitor(
    context: vscode.ExtensionContext,
    provider: ExplainerViewProvider
): void
{
    const gitExtension = vscode.extensions.getExtension('vscode.git');

    // Check if the Git extension is available
    if (!gitExtension)
    {
        vscode.window.showErrorMessage(
            'Git extension not found. Please install the Git extension to use PullerBear.'
        );
        return;
    }

    // Get the Git API
    const git = gitExtension.exports.getAPI(1);
    const repoStates = new WeakMap<any, RepoMonitorState>();

    const checkRepository = async (
        repository: any,
        state: RepoMonitorState
    ): Promise<void> =>
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

            // Fetch all branches from all remotes
            await repository.fetch();
            console.log('[PullerBear] Fetched latest from remote.');

            const head = repository.state?.HEAD;

            // If the branch has no upstream, warn and exit
            if (!head || !head.upstream)
            {
                console.log('[PullerBear] No upstream branch set.');
                vscode.window.showInformationMessage(
                    '🐻‍❄️ PullerBear: No upstream branch set for the current branch.'
                );
                return;
            }

            const currentBehind = head.behind ?? 0;
            let newIncomingCommits = 0;

            if (currentBehind > state.lastBehindCount)
            {
                newIncomingCommits = currentBehind - state.lastBehindCount;
            }

            state.lastBehindCount = currentBehind;

            if (newIncomingCommits > 0)
            {
                const now = Date.now();

                for (let i = 0; i < newIncomingCommits; i++)
                {
                    state.commitTimestamps.push(now);
                }
            }

            pruneOldTimestamps(state.commitTimestamps, windowMs);

            const commitsInWindow = state.commitTimestamps.length;

            if (currentBehind <= 0)
            {
                // Explicitly notify the user that they are up to date
                vscode.window.showInformationMessage(
                    '🐻‍❄️ PullerBear: You\'re up to date! No new commits on the remote.'
                );
                return;
            }

            if (commitsInWindow >= config.hardStopCommitThreshold)
            {
                vscode.window.showWarningMessage(
                    `🐻‍❄️ PullerBear paused summarization. ` +
                    `${commitsInWindow} incoming commit(s) were detected in the last ` +
                    `${config.commitWindowMinutes} minute(s), reaching the hard stop threshold ` +
                    `(${config.hardStopCommitThreshold}).`
                );
                return;
            }

            if (commitsInWindow > config.warningCommitThreshold)
            {
                const selection = await vscode.window.showWarningMessage(
                    `🐻‍❄️ PullerBear detected ${commitsInWindow} incoming commit(s) in the last ` +
                    `${config.commitWindowMinutes} minute(s). This repository may be too active ` +
                    `for a useful summary. Do you want to continue anyway?`,
                    { modal: true },
                    'Continue',
                    'Cancel'
                );

                if (selection !== 'Continue')
                {
                    return;
                }
            }

            const behindCount: number = currentBehind;

            vscode.window.showInformationMessage(
                `🐻‍❄️ PullerBear: Remote changes detected — you're behind by ${behindCount} commit(s).`
            );

            // Run AI analysis and push results to the sidebar
            try
            {
                const diffText = await repository.diff(true); // staged + unstaged
                const analysis = await analyzeCode({
                    branchName : head.name ?? 'unknown',
                    diffText   : typeof diffText === 'string' ? diffText : ''
                });

                // Extract AI summary text from OpenRouter response
                const summaryText =
                    analysis?.choices?.[0]?.message?.content ??
                    JSON.stringify(analysis);

                const summary: CommitSummary = {
                    hash      : head.commit ?? 'unknown',
                    message   : `${behindCount} new commit(s) on ` +
                                `${head.upstream.remote}/${head.upstream.name}`,
                    summary   : summaryText,
                    timestamp : Date.now()
                };

                provider.addSummary(summary);
            }
            catch (aiError)
            {
                console.error('[PullerBear] AI analysis failed:', aiError);

                // Still show a basic summary in the sidebar even if AI fails
                const fallback: CommitSummary = {
                    hash      : head.commit ?? 'unknown',
                    message   : `${behindCount} new commit(s) on ` +
                                `${head.upstream.remote}/${head.upstream.name}`,
                    summary   : `You are ${behindCount} commit(s) behind. ` +
                                `AI summary unavailable.`,
                    timestamp : Date.now()
                };

                provider.addSummary(fallback);
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

    const initializeRepositoryMonitor = (repository: any): void =>
    {
        if (repoStates.has(repository))
        {
            return;
        }

        const state: RepoMonitorState = {
            commitTimestamps : [],
            lastBehindCount  : repository.state?.HEAD?.behind ?? 0,
            isChecking       : false
        };

        repoStates.set(repository, state);

        const startMonitor = (): void =>
        {
            const config = getPullerBearConfig();
            const intervalMs = config.fetchIntervalMinutes * 60 * 1000;

            if (state.intervalHandle)
            {
                clearInterval(state.intervalHandle);
            }

            void checkRepository(repository, state);

            state.intervalHandle = setInterval(() =>
            {
                void checkRepository(repository, state);
            }, intervalMs);
        };

        startMonitor();

        const configChangeDisposable = vscode.workspace.onDidChangeConfiguration((event) =>
        {
            if (event.affectsConfiguration('pullerbear'))
            {
                startMonitor();
            }
        });

        const closeDisposable = repository.onDidClose(() =>
        {
            if (state.intervalHandle)
            {
                clearInterval(state.intervalHandle);
            }

            configChangeDisposable.dispose();
            closeDisposable.dispose();
        });

        context.subscriptions.push(configChangeDisposable, closeDisposable);
    };

    git.onDidOpenRepository((repository: any) =>
    {
        initializeRepositoryMonitor(repository);
    });

    // Also check repositories that are already open
    for (const repo of git.repositories)
    {
        initializeRepositoryMonitor(repo);
    }
}

function pruneOldTimestamps(timestamps: number[], windowMs: number): void
{
    const cutoff = Date.now() - windowMs;

    while (timestamps.length > 0 && timestamps[0] < cutoff)
    {
        timestamps.shift();
    }
}
