import * as vscode from 'vscode';
import { analyzeCode } from '../ai/aiClient';
import { getPullerBearConfig } from '../config/pullerBearConfig';

interface RepoMonitorState
{
    commitTimestamps : number[];
    lastBehindCount  : number;
    intervalHandle?  : NodeJS.Timeout;
    isChecking       : boolean;
}

export function gitMonitor(context: vscode.ExtensionContext): void
{
    const gitExtension = vscode.extensions.getExtension('vscode.git');

    if (!gitExtension)
    {
        vscode.window.showErrorMessage(
            'Git extension not found. Please install the Git extension to use PullerBear.'
        );
        return;
    }

    const git = gitExtension.exports.getAPI(1);
    const repoStates = new WeakMap<any, RepoMonitorState>();

    git.onDidOpenRepository((repository: any) =>
    {
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

            state.intervalHandle = setInterval(async () =>
            {
                await handleRepositoryCheck(repository, state);
            }, intervalMs);
        };

        startMonitor();

        const configChangeDisposable = vscode.workspace.onDidChangeConfiguration((event) =>
        {
            if (event.affectsConfiguration('pullerBear'))
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
    });
}

async function handleRepositoryCheck(repository: any, state: RepoMonitorState): Promise<void>
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

        await repository.fetch();

        const head = repository.state?.HEAD;

        if (!head)
        {
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

        if (commitsInWindow >= config.hardStopCommitThreshold)
        {
            vscode.window.showWarningMessage(
                `PullerBear paused summarization for this repository. ` +
                `${commitsInWindow} new commits were detected in the last ` +
                `${config.commitWindowMinutes} minutes, which reached the hard stop threshold ` +
                `(${config.hardStopCommitThreshold}).`
            );
            return;
        }

        if (currentBehind <= 0)
        {
            return;
        }

        if (commitsInWindow > config.warningCommitThreshold)
        {
            const selection = await vscode.window.showWarningMessage(
                `This repository received ${commitsInWindow} new commits in the last ` +
                `${config.commitWindowMinutes} minutes. It may be too active for useful summarization. ` +
                `Do you want PullerBear to continue anyway?`,
                { modal: true },
                'Continue',
                'Cancel'
            );

            if (selection !== 'Continue')
            {
                return;
            }
        }

        vscode.window.showInformationMessage(
            `Remote changes detected. You are behind by ${currentBehind} commits.`
        );

        const diffText = await getRepositoryDiff(repository);

        const analysis = await analyzeCode({
            branchName : head.name ?? 'unknown',
            diffText
        });

        console.log('Analysis results:', analysis);

        vscode.window.showInformationMessage(
            'Code analysis completed. Check the console for details.'
        );
    }
    catch (error)
    {
        console.error('Error checking repository:', error);
        vscode.window.showErrorMessage('Error fetching repository or analyzing changes.');
    }
    finally
    {
        state.isChecking = false;
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

async function getRepositoryDiff(repository: any): Promise<string>
{
    try
    {
        const diffResult = repository.diff();

        if (typeof diffResult === 'string')
        {
            return diffResult;
        }

        if (diffResult instanceof Promise)
        {
            return await diffResult;
        }

        return '';
    }
    catch (error)
    {
        console.error('Error getting repository diff:', error);
        return '';
    }
}