import * as assert from 'assert/strict';
import * as vscode from 'vscode';
import * as repositoryChecker from '../gitTools/repositoryChecker';
import { createRepository } from './helpers/factories';
import { stubMethod, withFixedDateNow } from './helpers/testUtils';

suite('repositoryChecker helper functions', () =>
{
    const baseConfig = {
        commitWindowMinutes     : 60,
        fetchIntervalMinutes    : 5,
        hardStopCommitThreshold : 5,
        warningCommitThreshold  : 2,
        branchRef               : 'main'
    };

    test('branch helpers resolve configured targets and detect upstream matches', () =>
    {
        const head = {
            upstream : { remote: 'origin', name: 'main' }
        };

        assert.equal(repositoryChecker.hasUpstreamBranch(head), true);
        assert.equal(repositoryChecker.hasUpstreamBranch({}), false);
        assert.equal(repositoryChecker.hasUpstreamBranch(undefined), false);
        assert.equal(repositoryChecker.resolveTargetBranchRef(head, 'upstream'), 'origin/main');
        assert.equal(repositoryChecker.resolveTargetBranchRef(head, 'release'), 'origin/release');
        assert.equal(repositoryChecker.resolveTargetBranchRef(head, 'upstream/next'), 'upstream/next');
        assert.equal(repositoryChecker.isCurrentUpstreamTarget(head, 'origin/main'), true);
        assert.equal(repositoryChecker.isCurrentUpstreamTarget(head, 'origin/release'), false);
    });

    test('notification helpers send user-facing information and warnings', async () =>
    {
        const infoMessages: string[] = [];
        const warningMessages: Array<{ message: string; items: string[] }> = [];

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
                warningMessages.push({
                    message,
                    items: items.filter((item) => typeof item === 'string')
                });
                return Promise.resolve('Continue');
            }) as typeof vscode.window.showWarningMessage
        );

        try
        {
            repositoryChecker.showNoUpstreamMessage();
            repositoryChecker.showUpToDateMessage();
            repositoryChecker.showRemoteChangesMessage(3);
            repositoryChecker.showConfiguredBranchChangesMessage('origin/release');
            repositoryChecker.showHardStopMessage(6, baseConfig);

            const shouldContinue = await repositoryChecker.showWarningMessage(3, baseConfig);

            assert.equal(shouldContinue, true);
            assert.equal(infoMessages.length, 4);
            assert.match(infoMessages[0], /No upstream/);
            assert.match(infoMessages[1], /up to date/i);
            assert.match(infoMessages[2], /behind by 3/);
            assert.match(infoMessages[3], /origin\/release/);
            assert.match(warningMessages[0].message, /paused summarization/);
            assert.deepEqual(warningMessages[1].items, ['Continue', 'Cancel']);
        }
        finally
        {
            restoreWarn();
            restoreInfo();
        }
    });

    test('summary builders, target hash lookup, and thresholds produce expected outputs', async () =>
    {
        const head = {
            commit   : 'abc999',
            upstream : { remote: 'origin', name: 'main' }
        };

        const summary = withFixedDateNow(42, () =>
            repositoryChecker.createCommitSummary('origin/main', 2, 'AI text', 'target-123')
        );
        const fallback = withFixedDateNow(77, () =>
            repositoryChecker.createFallbackSummary(head, 5, 'abc999')
        );
        const repository = createRepository({
            getBranch : async (ref: string): Promise<{ commit: string }> =>
            {
                assert.equal(ref, 'origin/main');
                return { commit: 'remote-commit' };
            }
        });

        assert.deepEqual(summary, {
            hash      : 'target-123',
            message   : '2 new commit(s) on origin/main',
            summary   : 'AI text',
            timestamp : 42,
            status    : 'success',
            retriable : false
        });
        assert.deepEqual(fallback, {
            hash            : 'abc999',
            message         : '5 new commit(s) on origin/main',
            summary         : 'You are 5 commit(s) behind. AI summary unavailable because the request failed for an unknown reason.',
            timestamp       : 77,
            status          : 'error',
            errorKind       : 'unknown',
            retriable       : false,
            retryTargetRef  : 'origin/main',
            retryBehindCount: 5
        });
        assert.equal(await repositoryChecker.getTargetCommitHash(repository, 'origin/main'), 'remote-commit');
        assert.equal(repositoryChecker.exceedsHardStopThreshold(5, baseConfig), true);
        assert.equal(repositoryChecker.exceedsWarningThreshold(2, baseConfig), false);
    });

    test('getTargetCommitHash falls back to repository refs when getBranch fails', async () =>
    {
        const repository = createRepository({
            getBranch : async (): Promise<void> =>
            {
                throw new Error('branch lookup failed');
            },
            state     : {
                HEAD : {
                    commit   : 'head-commit',
                    name     : 'feature/test',
                    behind   : 1,
                    upstream : { remote: 'origin', name: 'main' }
                },
                refs : [
                    {
                        name   : 'main',
                        remote : 'origin',
                        commit : 'refs-commit'
                    }
                ]
            }
        });

        assert.equal(await repositoryChecker.getTargetCommitHash(repository, 'origin/main'), 'refs-commit');
    });

    test('normalizeDiffPayload handles string, array, and object payloads', () =>
    {
        assert.equal(repositoryChecker.normalizeDiffPayload('diff --git a/x b/x'), 'diff --git a/x b/x');
        assert.match(
            repositoryChecker.normalizeDiffPayload([
                {
                    status      : 'M',
                    uri         : { fsPath: '/tmp/a.ts' },
                    originalUri : { fsPath: '/tmp/old-a.ts' }
                }
            ]),
            /old-a\.ts/
        );
        assert.match(
            repositoryChecker.normalizeDiffPayload({ changed: true }),
            /"changed": true/
        );
    });

    test('createFallbackSummary maps common AI failures to actionable messages', () =>
    {
        const missingKey = repositoryChecker.createFallbackSummary(
            {
                upstream : { remote: 'origin', name: 'main' }
            },
            2,
            'sha-1',
            'API key not configured. Please set pullerBear.apiKey in VS Code settings.'
        );
        const authFailure = repositoryChecker.createFallbackSummary(
            {
                upstream : { remote: 'origin', name: 'main' }
            },
            2,
            'sha-2',
            'OpenRouter authentication failed. Check pullerBear.apiKey.'
        );
        const networkFailure = repositoryChecker.createFallbackSummary(
            {
                upstream : { remote: 'origin', name: 'main' }
            },
            2,
            'sha-3',
            'Could not reach OpenRouter. Check your internet connection or firewall.'
        );
        const timeoutFailure = repositoryChecker.createFallbackSummary(
            {
                upstream : { remote: 'origin', name: 'main' }
            },
            2,
            'sha-4',
            'OpenRouter request timed out after 30 seconds.'
        );

        assert.match(missingKey.summary, /no API key is configured/i);
        assert.match(authFailure.summary, /rejected your API key/i);
        assert.match(networkFailure.summary, /could not reach OpenRouter/i);
        assert.match(timeoutFailure.summary, /request timed out/i);
        assert.equal(missingKey.status, 'error');
        assert.equal(missingKey.retriable, false);
    });

    test('createFallbackSummary marks retry metadata for retriable failures', () =>
    {
        const summary = repositoryChecker.createFallbackSummary(
            {
                upstream : { remote: 'origin', name: 'main' }
            },
            2,
            'sha-1',
            'OpenRouter rate limit reached. Try again in a moment.'
        );

        assert.equal(summary.status, 'error');
        assert.equal(summary.errorKind, 'rate_limit');
        assert.equal(summary.retriable, true);
    });
});
