import * as assert from 'assert/strict';
import {
    clearMonitorInterval,
    createRepoState,
    createRepoStateMap,
    getOrCreateRepoState,
    isRepositoryMonitored,
    setChecking,
    setMonitorInterval,
    updateBehindCount
} from '../gitTools/gitState';
import { createRepoMonitorState, createRepository } from './helpers/factories';

suite('gitState', () =>
{
    test('createRepoState seeds tracking state from HEAD', () =>
    {
        const repository = createRepository({
            state: {
                HEAD : {
                    behind : 6,
                    commit : 'commit-123'
                }
            }
        });

        const state = createRepoState(repository);

        assert.equal(state.lastBehindCount, 6);
        assert.equal(state.lastHeadCommit, 'commit-123');
        assert.equal(state.isChecking, false);
        assert.deepEqual(state.commitTimestamps, []);
    });

    test('repo state helpers create, retrieve, and inspect monitoring state', () =>
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
