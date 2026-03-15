import * as vscode from 'vscode';
import { ExplainerViewProvider } from '../ExplainerViewProvider';
import { getPullerBearConfig } from '../config/pullerBearConfig';
import { RepoMonitorState } from './types';
import { createRepoState, createRepoStateMap, isRepositoryMonitored, setMonitorInterval, clearMonitorInterval } from './gitState';
import { checkRepository } from './repositoryChecker';

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

    // Handle configuration changes
    const configChangeDisposable = vscode.workspace.onDidChangeConfiguration((event) =>
    {
        if (event.affectsConfiguration('pullerbear'))
        {
            startMonitor(repository, state, checkFn);
        }
    });

    // Handle repository close
    const closeDisposable = repository.onDidClose(() =>
    {
        clearMonitorInterval(state);
        configChangeDisposable.dispose();
        closeDisposable.dispose();
    });

    context.subscriptions.push(configChangeDisposable, closeDisposable);
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

    // Listen for new repositories being opened
    git.onDidOpenRepository((repository: any) =>
    {
        initializeRepositoryMonitor(repository, repoStates, provider, context);
    });

    // Also check repositories that are already open
    for (const repo of git.repositories)
    {
        initializeRepositoryMonitor(repo, repoStates, provider, context);
    }
}