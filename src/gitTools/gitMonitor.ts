import * as vscode from 'vscode';
import { ExplainerViewProvider } from '../ExplainerViewProvider';
import { getPullerBearConfig } from '../config/pullerBearConfig';
import { RepoMonitorState } from './types';
import { createRepoState, createRepoStateMap, isRepositoryMonitored, setMonitorInterval, clearMonitorInterval } from './gitState';
import { checkRepository } from './repositoryChecker';
import { clearReviewFile } from '../utl/fileWrite';

/**
 * Starts the monitoring interval for a repository
 */
function startMonitor(
    repository: any,
    state: RepoMonitorState,
    checkFn: (repo: any, state: RepoMonitorState) => Promise<void>
): void
{
    const config = getPullerBearConfig();
    const intervalMs = config.fetchIntervalMinutes * 60 * 1000;

    if (state.intervalHandle)
    {
        clearMonitorInterval(state);
    }

    void checkFn(repository, state);

    state.intervalHandle = setInterval(() =>
    {
        void checkFn(repository, state);
    }, intervalMs);
}

/**
 * Initializes monitoring for a single repository
 */
function initializeRepositoryMonitor(
    repository: any,
    repoStates: WeakMap<any, RepoMonitorState>,
    provider: ExplainerViewProvider,
    context: vscode.ExtensionContext
): void
{
    if (isRepositoryMonitored(repoStates, repository))
    {
        return;
    }

    const state = createRepoState(repository);
    repoStates.set(repository, state);

    const checkFn = async (repo: any, repoState: RepoMonitorState): Promise<void> =>
    {
        await checkRepository(repo, repoState, provider);
    };

    // Start the monitor
    startMonitor(repository, state, checkFn);

    // Detect git pull by monitoring HEAD commit changes
    const stateChangeDisposable = repository.state.onDidChange(() =>
    {
        const currentHead = repository.state?.HEAD;
        const currentCommit = currentHead?.commit;
        const currentBehind = currentHead?.behind ?? 0;

        if (currentCommit && currentCommit !== state.lastHeadCommit)
        {
            // HEAD moved forward — if we were behind, this is likely a pull/merge
            // Also detect if behind went to 0 (user manually pulled)
            const wasBehind = state.lastBehindCount > 0;
            const behindDecreased = currentBehind < state.lastBehindCount;
            const nowUpToDate = currentBehind === 0 && wasBehind;

            if (behindDecreased || nowUpToDate)
            {
                console.log(
                    `[PullerBear] Pull detected: HEAD moved from ${state.lastHeadCommit} to ${currentCommit}. ` +
                    `Behind count: ${state.lastBehindCount} → ${currentBehind}`
                );
                provider.clearSummaries();
                void clearReviewFile();
                vscode.window.showInformationMessage(
                    '🐻‍❄️ PullerBear: Pull detected! Summaries cleared.'
                );
            }

            state.lastHeadCommit = currentCommit;
            state.lastBehindCount = currentBehind;
        }
    });

    // Handle configuration changes with debounce
    let configTimeout: NodeJS.Timeout | undefined;
    const configChangeDisposable = vscode.workspace.onDidChangeConfiguration((event) =>
    {
        if (event.affectsConfiguration('pullerbear'))
        {
            // Debounce config changes to avoid creating multiple intervals
            if (configTimeout)
            {
                clearTimeout(configTimeout);
            }
            configTimeout = setTimeout(() =>
            {
                startMonitor(repository, state, checkFn);
            }, 500);
        }
    });

    // Handle repository close (some repository objects don't expose onDidClose)
    let closeDisposable: vscode.Disposable = { dispose: (): void => undefined };

    if (typeof repository.onDidClose === 'function')
    {
        closeDisposable = repository.onDidClose(() => {
            clearMonitorInterval(state);
            stateChangeDisposable.dispose();
            configChangeDisposable.dispose();
            closeDisposable.dispose();
        });
    };

    context.subscriptions.push(stateChangeDisposable, configChangeDisposable, closeDisposable);
}

/**
 * Main entry point for Git monitoring
 * Sets up repository change listeners and initializes monitors for existing repos
 */
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
    const repoStates = createRepoStateMap();

    const initRepo = (repository: any) => {
        if (isRepositoryMonitored(repoStates, repository))
        {
            return;
        }
        initializeRepositoryMonitor(repository, repoStates, provider, context);
    };

    // Listen for new repositories being opened
    git.onDidOpenRepository((repository: any) =>
    {
        initRepo(repository);
    });

    // Also check repositories that are already open
    for (const repo of git.repositories)
    {
        initRepo(repo);
    }
}