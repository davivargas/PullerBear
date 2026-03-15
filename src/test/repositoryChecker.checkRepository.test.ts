import * as assert from 'assert/strict';
import * as vscode from 'vscode';
import * as configModule from '../config/pullerBearConfig';
import * as gitState from '../gitTools/gitState';
import * as repositoryChecker from '../gitTools/repositoryChecker';
import { ExplainerViewProvider } from '../ExplainerViewProvider';
import { createRepoMonitorState, createRepository } from './helpers/factories';
import { stubMethod } from './helpers/testUtils';

suite('repositoryChecker checkRepository', () =>
{
    const baseConfig = {
        commitWindowMinutes     : 60,
        fetchIntervalMinutes    : 5,
        hardStopCommitThreshold : 5,
        warningCommitThreshold  : 2,
        branchRef               : 'main'
    };

    test('returns immediately when a check is already in progress', async () =>
    {
        const repository = createRepository({
            fetch: async (): Promise<void> =>
            {
                assert.fail('fetch should not run when the repo is already being checked');
            }
        });
        const state = createRepoMonitorState({ isChecking: true });
        const provider = {
            addSummary: (_summary: any): void =>
            {
                assert.fail('provider should not be called');
            }
        } as ExplainerViewProvider;

        await repositoryChecker.checkRepository(repository, state, provider);
        assert.equal(state.isChecking, true);
    });

    test('shows up-to-date message and exits when behind count is zero', async () =>
    {
        const repository = createRepository({ fetch: async (): Promise<void> => undefined });
        const state = createRepoMonitorState({ lastBehindCount: 0 });
        const infoMessages: string[] = [];

        const restoreConfig = stubMethod(
            configModule,
            'getPullerBearConfig',
            (() => baseConfig) as typeof configModule.getPullerBearConfig
        );
        const restoreBehind = stubMethod(
            gitState,
            'getConfiguredBranchBehindCount',
            (() => 0) as typeof gitState.getConfiguredBranchBehindCount
        );
        const restoreInfo = stubMethod(
            vscode.window,
            'showInformationMessage',
            ((message: string) =>
            {
                infoMessages.push(message);
                return Promise.resolve(undefined);
            }) as typeof vscode.window.showInformationMessage
        );

        try
        {
            await repositoryChecker.checkRepository(repository, state, {
                addSummary: (): void => undefined
            } as unknown as ExplainerViewProvider);

            assert.equal(state.isChecking, false);
            assert.equal(infoMessages.length, 1);
            assert.match(infoMessages[0], /up to date/i);
        }
        finally
        {
            restoreInfo();
            restoreBehind();
            restoreConfig();
        }
    });

    test('stops at hard threshold and does not summarize', async () =>
    {
        const repository = createRepository();
        const state = createRepoMonitorState({
            lastBehindCount  : 0,
            commitTimestamps : [Date.now(), Date.now(), Date.now(), Date.now()]
        });
        let addSummaryCalls = 0;
        const warningMessages: string[] = [];

        const restoreConfig = stubMethod(
            configModule,
            'getPullerBearConfig',
            (() => baseConfig) as typeof configModule.getPullerBearConfig
        );
        const restoreBehind = stubMethod(
            gitState,
            'getConfiguredBranchBehindCount',
            (() => 1) as typeof gitState.getConfiguredBranchBehindCount
        );
        const restoreWarn = stubMethod(
            vscode.window,
            'showWarningMessage',
            ((message: string) =>
            {
                warningMessages.push(message);
                return Promise.resolve(undefined);
            }) as typeof vscode.window.showWarningMessage
        );
        const restoreRunAi = stubMethod(
            repositoryChecker,
            'runAIAnalysis',
            (async () =>
            {
                assert.fail('AI analysis should not run after hard stop');
            }) as typeof repositoryChecker.runAIAnalysis
        );

        try
        {
            await repositoryChecker.checkRepository(repository, state, {
                addSummary: (): void =>
                {
                    addSummaryCalls += 1;
                }
            } as unknown as ExplainerViewProvider);

            assert.equal(addSummaryCalls, 0);
            assert.equal(state.isChecking, false);
            assert.equal(warningMessages.length, 1);
            assert.match(warningMessages[0], /paused summarization/i);
        }
        finally
        {
            restoreRunAi();
            restoreWarn();
            restoreBehind();
            restoreConfig();
        }
    });

    test('respects warning cancellation and stops before AI analysis', async () =>
    {
        const repository = createRepository();
        const state = createRepoMonitorState({
            lastBehindCount  : 0,
            commitTimestamps : [Date.now(), Date.now()]
        });

        const restoreConfig = stubMethod(
            configModule,
            'getPullerBearConfig',
            (() => baseConfig) as typeof configModule.getPullerBearConfig
        );
        const restoreBehind = stubMethod(
            gitState,
            'getConfiguredBranchBehindCount',
            (() => 1) as typeof gitState.getConfiguredBranchBehindCount
        );
        const restoreWarn = stubMethod(
            vscode.window,
            'showWarningMessage',
            ((message: string, ...items: any[]) =>
            {
                if (items.some((item) => item === 'Continue'))
                {
                    return Promise.resolve('Cancel');
                }

                return Promise.resolve(undefined);
            }) as typeof vscode.window.showWarningMessage
        );
        const restoreRunAi = stubMethod(
            repositoryChecker,
            'runAIAnalysis',
            (async () =>
            {
                assert.fail('AI analysis should not run when the warning is cancelled');
            }) as typeof repositoryChecker.runAIAnalysis
        );

        try
        {
            await repositoryChecker.checkRepository(repository, state, {
                addSummary: (): void =>
                {
                    assert.fail('summary should not be added');
                }
            } as unknown as ExplainerViewProvider);

            assert.equal(state.isChecking, false);
        }
        finally
        {
            restoreRunAi();
            restoreWarn();
            restoreBehind();
            restoreConfig();
        }
    });

    test('summarizes and pushes results when remote changes pass thresholds', async () =>
    {
        const repository = createRepository({
            state: {
                HEAD : {
                    commit   : 'head-commit',
                    name     : 'feature/test',
                    behind   : 0,
                    upstream : { remote: 'origin', name: 'main' }
                },
                refs : new Map<string, { behind?: number }>()
            },
            fetch: async (): Promise<void> => undefined
        });
        const state = createRepoMonitorState({ lastBehindCount: 1 });
        const infoMessages: string[] = [];
        const summaries: any[] = [];

        const restoreConfig = stubMethod(
            configModule,
            'getPullerBearConfig',
            (() => baseConfig) as typeof configModule.getPullerBearConfig
        );
        const restoreBehind = stubMethod(
            gitState,
            'getConfiguredBranchBehindCount',
            (() => 3) as typeof gitState.getConfiguredBranchBehindCount
        );
        const restoreInfo = stubMethod(
            vscode.window,
            'showInformationMessage',
            ((message: string) =>
            {
                infoMessages.push(message);
                return Promise.resolve(undefined);
            }) as typeof vscode.window.showInformationMessage
        );
        const restoreWarn = stubMethod(
            vscode.window,
            'showWarningMessage',
            ((message: string, ...items: any[]) =>
            {
                if (items.some((item) => item === 'Continue'))
                {
                    return Promise.resolve('Continue');
                }

                return Promise.resolve(undefined);
            }) as typeof vscode.window.showWarningMessage
        );
        const restoreRunAi = stubMethod(
            repositoryChecker,
            'runAIAnalysis',
            (async (_repo, head) =>
            {
                assert.equal(head.name, 'main');
                assert.equal(head.behind, 3);
                return {
                    hash      : 'summary-1',
                    message   : '3 new commit(s) on origin/main',
                    summary   : 'AI says pull now.',
                    timestamp : 100
                };
            }) as typeof repositoryChecker.runAIAnalysis
        );

        try
        {
            await repositoryChecker.checkRepository(repository, state, {
                addSummary: (summary): void =>
                {
                    summaries.push(summary);
                }
            } as ExplainerViewProvider);

            assert.equal(state.lastBehindCount, 3);
            assert.equal(state.commitTimestamps.length, 2);
            assert.equal(summaries.length, 1);
            assert.equal(summaries[0].hash, 'summary-1');
            assert.equal(state.isChecking, false);
            assert.equal(infoMessages.some((message) => /behind by 3/.test(message)), true);
        }
        finally
        {
            restoreRunAi();
            restoreWarn();
            restoreInfo();
            restoreBehind();
            restoreConfig();
        }
    });

    test('shows an error when repository checking fails unexpectedly', async () =>
    {
        const repository = createRepository({
            fetch: async (): Promise<void> =>
            {
                throw new Error('fetch broke');
            }
        });
        const state = createRepoMonitorState();
        const errors: string[] = [];

        const restoreConfig = stubMethod(
            configModule,
            'getPullerBearConfig',
            (() => baseConfig) as typeof configModule.getPullerBearConfig
        );
        const restoreError = stubMethod(
            vscode.window,
            'showErrorMessage',
            ((message: string) =>
            {
                errors.push(message);
                return Promise.resolve(undefined);
            }) as typeof vscode.window.showErrorMessage
        );

        try
        {
            await repositoryChecker.checkRepository(repository, state, {
                addSummary: (): void => undefined
            } as unknown as ExplainerViewProvider);

            assert.equal(errors.length, 1);
            assert.match(errors[0], /Error fetching repository/);
            assert.equal(state.isChecking, false);
        }
        finally
        {
            restoreError();
            restoreConfig();
        }
    });
});
