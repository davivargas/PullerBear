import * as assert from 'assert/strict';
import {
    addNewCommitTimestamps,
    calculateNewCommits,
    createCheckResult,
    getCommitsInWindow,
    pruneOldTimestamps
} from '../gitTools/commitTracker';
import { withFixedDateNow } from './helpers/testUtils';

suite('commitTracker', () =>
{
    test('pruneOldTimestamps removes only entries outside the rolling window', () =>
    {
        const timestamps = [1000, 2000, 3000, 8000];

        withFixedDateNow(10000, () =>
        {
            pruneOldTimestamps(timestamps, 5000);
        });

        assert.deepEqual(timestamps, [8000]);
    });

    test('addNewCommitTimestamps appends one timestamp per new commit', () =>
    {
        const state = { commitTimestamps: [1, 2] };

        withFixedDateNow(123456789, () =>
        {
            addNewCommitTimestamps(state, 3);
        });

        assert.deepEqual(state.commitTimestamps, [1, 2, 123456789, 123456789, 123456789]);
    });

    test('calculateNewCommits returns only positive deltas', () =>
    {
        assert.equal(calculateNewCommits(7, 3), 4);
        assert.equal(calculateNewCommits(2, 2), 0);
        assert.equal(calculateNewCommits(1, 5), 0);
    });

    test('getCommitsInWindow prunes first and then returns the remaining count', () =>
    {
        const timestamps = [1000, 3000, 9000];

        const count = withFixedDateNow(10000, () => getCommitsInWindow(timestamps, 2500));

        assert.equal(count, 1);
        assert.deepEqual(timestamps, [9000]);
    });

    test('createCheckResult creates a continue-ready check state', () =>
    {
        assert.deepEqual(createCheckResult(5), {
            shouldContinue : true,
            behindCount    : 5,
            newCommits     : 0
        });
    });
});
