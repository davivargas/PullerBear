import * as assert from 'assert/strict';
import * as configModule from '../config/pullerBearConfig';
import {
    clearMonitorInterval,
    createRepoState,
    createRepoStateMap,
    detectDefaultBranch,
    getBranchBehindCount,
    getConfiguredBranchBehindCount,
    getOrCreateRepoState,
    isRepositoryMonitored,
    setChecking,
    setMonitorInterval,
    updateBehindCount
} from '../gitTools/gitState';
import { createRepoMonitorState, createRepository } from './helpers/factories';
import { stubMethod } from './helpers/testUtils';

suite('gitState', () =>
{
    test('detectDefaultBranch prefers main then master then mainline', () =>
    {
        const repository = createRepository();
        repository.state.refs.set('origin/master', { behind: 1 });
        repository.state.refs.set('origin/main', { behind: 2 });
        repository.state.refs.set('origin/mainline', { behind: 3 });

        assert.equal(detectDefaultBranch(repository), 'main');
    });

    test('getBranchBehindCount reads local branch ref and falls back to zero', () =>
    {
        const repository = createRepository();
        repository.state.refs.set('refs/heads/develop', { behind: 9 });

        assert.equal(getBranchBehindCount(repository, 'develop'), 9);
        assert.equal(getBranchBehindCount(repository, 'missing'), 0);
    });

    test('getConfiguredBranchBehindCount prefers origin ref then local ref', () =>
    {
        const repository = createRepository();
        repository.state.refs.set('origin/release', { behind: 4 });
        repository.state.refs.set('refs/heads/release', { behind: 7 });

        const restore = stubMethod(
            configModule,
            'getPullerBearConfig',
            (() => ({
                fetchIntervalMinutes    : 5,
                commitWindowMinutes     : 60,
                warningCommitThreshold  : 2,
                hardStopCommitThreshold : 5,
                branchRef               : 'release'
            })) as typeof configModule.getPullerBearConfig
        );

        try
        {
            assert.equal(getConfiguredBranchBehindCount(repository), 4);
            repository.state.refs.delete('origin/release');
            assert.equal(getConfiguredBranchBehindCount(repository), 7);
        }
        finally
        {
            restore();
        }
    });

    test('createRepoState uses HEAD and detected default branch data', () =>
    {
        const repository = createRepository({
            state: {
                HEAD : {
                    behind   : 6,
                    commit   : 'commit',
                    name     : 'feature/a',
                    upstream : { remote: 'origin', name: 'main' }
                },
                refs : new Map<string, { behind?: number }>([
                    ['origin/main', { behind: 6 }],
                    ['refs/heads/main', { behind: 3 }]
                ])
            }
        });

        const state = createRepoState(repository);

        assert.equal(state.lastBehindCount, 6);
        assert.equal(state.isChecking, false);
        assert.deepEqual(state.commitTimestamps, []);
        assert.deepEqual(state.mainBranch, {
            name            : 'main',
            lastBehindCount : 3,
            commitTimestamps: []
        });
    });

    test('repo state map helpers create, retrieve, and inspect monitoring state', () =>
    {
        const repoStates = createRepoStateMap();
        const repository = createRepository();
        const created = createRepoMonitorState({ lastBehindCount: 11 });

        const first = getOrCreateRepoState(repoStates, repository, () => created);
        const second = getOrCreateRepoState(repoStates, repository, () =>
            createRepoMonitorState({ lastBehindCount: 1 })
        );

        assert.equal(first, created);
        assert.equal(second, created);
        assert.equal(isRepositoryMonitored(repoStates, repository), true);
    });

    test('state mutators update fields and clear existing intervals', () =>
    {
        const state = createRepoMonitorState();
        let cleared: NodeJS.Timeout | undefined;
        const fakeHandle = setTimeout(() => undefined, 1000);
        const originalClearInterval = clearInterval;

        (globalThis as typeof globalThis & { clearInterval: typeof clearInterval }).clearInterval =
            ((handle: NodeJS.Timeout) =>
            {
                cleared = handle;
                originalClearInterval(handle);
            }) as typeof clearInterval;

        try
        {
            updateBehindCount(state, 12);
            setChecking(state, true);
            setMonitorInterval(state, fakeHandle);
            clearMonitorInterval(state);

            assert.equal(state.lastBehindCount, 12);
            assert.equal(state.isChecking, true);
            assert.equal(cleared, fakeHandle);
            assert.equal(state.intervalHandle, undefined);
        }
        finally
        {
            globalThis.clearInterval = originalClearInterval;
        }
    });
});
