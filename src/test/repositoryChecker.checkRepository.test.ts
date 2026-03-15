import * as assert from 'assert/strict';
import * as vscode from 'vscode';
import * as aiClient from '../ai/aiClient';
import * as fileWrite from '../utl/fileWrite';
import * as configModule from '../config/pullerBearConfig';
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
        branchRef               : 'main',
        apiKey                  : ''
    };

    function createProvider(overrides: Partial<ExplainerViewProvider> = {}): ExplainerViewProvider
    {
        return {
            addSummary    : (): void => undefined,
            clearSummaries: (): void => undefined,
            hasSummary    : (): boolean => false,
            ...overrides
        } as unknown as ExplainerViewProvider;
    }

    test('returns immediately when a check is already queued', async () =>
    {
        let resolveQueue: (() => void) | undefined;
        const checkQueue = new Promise<void>((resolve) =>
        {
            resolveQueue = resolve;
        });
        const repository = createRepository({
            fetch: async (): Promise<void> =>
            {
                assert.fail('fetch should not run when a check is already queued');
            }
        });
        const state = createRepoMonitorState({ checkQueue });

        try
        {
            await repositoryChecker.checkRepository(repository, state, createProvider());

            assert.equal(state.checkQueue, checkQueue);
            assert.equal(state.isChecking, false);
        }
        finally
        {
            resolveQueue?.();
        }
    });

    test('shows manual caught-up message and exits when upstream is not behind', async () =>
    {
        const repository = createRepository({
            fetch    : async (): Promise<void> => undefined,
            getBranch: async (): Promise<{ commit: string }> => ({ commit: 'origin-main-1' })
        });
        const state = createRepoMonitorState({ lastBehindCount: 0 });
        const infoMessages: string[] = [];

        const restoreConfig = stubMethod(
            configModule,
            'getPullerBearConfig',
            (() => baseConfig) as typeof configModule.getPullerBearConfig
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
            await repositoryChecker.checkRepository(repository, state, createProvider(), true);

            assert.equal(state.isChecking, false);
            assert.equal(infoMessages.length, 1);
            assert.match(infoMessages[0], /all caught up/i);
        }
        finally
        {
            restoreInfo();
            restoreConfig();
        }
    });

    test('stops at hard threshold and does not summarize', async () =>
    {
        const repository = createRepository({
            fetch    : async (): Promise<void> => undefined,
            getBranch: async (): Promise<{ commit: string }> => ({ commit: 'origin-main-1' }),
            state    : {
                HEAD : {
                    commit   : 'head-commit',
                    name     : 'feature/test',
                    behind   : 1,
                    upstream : { remote: 'origin', name: 'main' }
                }
            }
        });
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
        const restoreWarn = stubMethod(
            vscode.window,
            'showWarningMessage',
            ((message: string) =>
            {
                warningMessages.push(message);
                return Promise.resolve(undefined);
            }) as typeof vscode.window.showWarningMessage
        );

        try
        {
            await repositoryChecker.checkRepository(repository, state, createProvider({
                addSummary: (): void =>
                {
                    addSummaryCalls += 1;
                }
            }));

            assert.equal(addSummaryCalls, 0);
            assert.equal(state.isChecking, false);
            assert.equal(warningMessages.length, 1);
            assert.match(warningMessages[0], /paused summarization/i);
        }
        finally
        {
            restoreWarn();
            restoreConfig();
        }
    });

    test('respects warning cancellation and stops before AI analysis', async () =>
    {
        const repository = createRepository({
            fetch    : async (): Promise<void> => undefined,
            getBranch: async (): Promise<{ commit: string }> => ({ commit: 'origin-main-1' }),
            state    : {
                HEAD : {
                    commit   : 'head-commit',
                    name     : 'feature/test',
                    behind   : 3,
                    upstream : { remote: 'origin', name: 'main' }
                }
            }
        });
        const state = createRepoMonitorState({
            lastBehindCount  : 2,
            commitTimestamps : [Date.now(), Date.now()]
        });

        const restoreConfig = stubMethod(
            configModule,
            'getPullerBearConfig',
            (() => baseConfig) as typeof configModule.getPullerBearConfig
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

        try
        {
            await repositoryChecker.checkRepository(repository, state, createProvider({
                addSummary: (): void =>
                {
                    assert.fail('summary should not be added');
                }
            }));

            assert.equal(state.isChecking, false);
        }
        finally
        {
            restoreWarn();
            restoreConfig();
        }
    });

    test('summarizes and pushes results when remote changes pass thresholds', async () =>
    {
        const repository = createRepository({
            fetch    : async (): Promise<void> => undefined,
            getBranch: async (ref: string): Promise<{ commit: string }> =>
            {
                assert.equal(ref, 'origin/main');
                return { commit: 'remote-commit-3' };
            },
            diffWith : async (): Promise<string> => '+ const safe = true;',
            state    : {
                HEAD : {
                    commit   : 'head-commit',
                    name     : 'feature/test',
                    behind   : 3,
                    upstream : { remote: 'origin', name: 'main' }
                }
            }
        });
        const state = createRepoMonitorState({ lastBehindCount: 1 });
        const infoMessages: string[] = [];
        const summaries: any[] = [];

        const restoreConfig = stubMethod(
            configModule,
            'getPullerBearConfig',
            (() => baseConfig) as typeof configModule.getPullerBearConfig
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
        const restoreAnalyze = stubMethod(
            aiClient,
            'analyzeCode',
            (async (context) =>
            {
                assert.equal(context.branchName, 'feature/test');
                assert.match(context.diffText, /safe = true/);
                return {
                    choices: [
                        {
                            message: { content: 'AI says pull now.' }
                        }
                    ]
                };
            }) as typeof aiClient.analyzeCode
        );
        const restoreWrite = stubMethod(
            fileWrite,
            'writeToFile',
            ((_: unknown): void => undefined) as typeof fileWrite.writeToFile
        );

        try
        {
            await repositoryChecker.checkRepository(repository, state, createProvider({
                addSummary: (summary): void =>
                {
                    summaries.push(summary);
                }
            }));

            assert.equal(state.lastBehindCount, 3);
            assert.equal(state.commitTimestamps.length, 2);
            assert.equal(summaries.length, 1);
            assert.equal(summaries[0].hash, 'remote-commit-3');
            assert.equal(summaries[0].summary, 'AI says pull now.');
            assert.equal(state.isChecking, false);
            assert.equal(infoMessages.some((message) => /behind by 3/.test(message)), true);
        }
        finally
        {
            restoreWrite();
            restoreAnalyze();
            restoreInfo();
            restoreConfig();
        }
    });

    test('skips summarizing when the provider already has the target summary', async () =>
    {
        const repository = createRepository({
            fetch    : async (): Promise<void> => undefined,
            getBranch: async (): Promise<{ commit: string }> => ({ commit: 'remote-commit-3' })
        });
        let addSummaryCalls = 0;

        const restoreConfig = stubMethod(
            configModule,
            'getPullerBearConfig',
            (() => baseConfig) as typeof configModule.getPullerBearConfig
        );

        try
        {
            await repositoryChecker.checkRepository(repository, createRepoMonitorState(), createProvider({
                hasSummary: (hash: string): boolean =>
                {
                    assert.equal(hash, 'remote-commit-3');
                    return true;
                },
                addSummary: (): void =>
                {
                    addSummaryCalls += 1;
                }
            }), true);

            assert.equal(addSummaryCalls, 0);
        }
        finally
        {
            restoreConfig();
        }
    });

    test('shows a warning when fetch fails unexpectedly', async () =>
    {
        const repository = createRepository({
            fetch: async (): Promise<void> =>
            {
                throw new Error('fetch broke');
            }
        });
        const state = createRepoMonitorState();
        const warnings: string[] = [];

        const restoreConfig = stubMethod(
            configModule,
            'getPullerBearConfig',
            (() => baseConfig) as typeof configModule.getPullerBearConfig
        );
        const restoreWarning = stubMethod(
            vscode.window,
            'showWarningMessage',
            ((message: string) =>
            {
                warnings.push(message);
                return Promise.resolve(undefined);
            }) as typeof vscode.window.showWarningMessage
        );

        try
        {
            await repositoryChecker.checkRepository(repository, state, createProvider());

            assert.equal(warnings.length, 1);
            assert.match(warnings[0], /failed to fetch/i);
            assert.equal(state.isChecking, false);
        }
        finally
        {
            restoreWarning();
            restoreConfig();
        }
    });
});
