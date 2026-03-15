import { CheckResult } from './types';

/**
 * Prunes old timestamps that are outside the time window
 */
export function pruneOldTimestamps(timestamps: number[], windowMs: number): void
{
    const cutoff = Date.now() - windowMs;

    while (timestamps.length > 0 && timestamps[0] < cutoff)
    {
        timestamps.shift();
    }
}

/**
 * Adds new commit timestamps for incoming commits
 */
export function addNewCommitTimestamps(
    state: { commitTimestamps: number[] },
    newCommitCount: number
): void
{
    if (newCommitCount > 0)
    {
        const now = Date.now();

        for (let i = 0; i < newCommitCount; i++)
        {
            state.commitTimestamps.push(now);
        }
    }
}

/**
 * Calculates the number of new incoming commits compared to last check
 */
export function calculateNewCommits(
    currentBehind: number,
    lastBehindCount: number
): number
{
    if (currentBehind > lastBehindCount)
    {
        return currentBehind - lastBehindCount;
    }

    return 0;
}

/**
 * Gets the count of commits within the time window
 */
export function getCommitsInWindow(
    timestamps: number[],
    windowMs: number
): number
{
    pruneOldTimestamps(timestamps, windowMs);
    return timestamps.length;
}

/**
 * Creates initial check result
 */
export function createCheckResult(behindCount: number): CheckResult
{
    return {
        shouldContinue : true,
        behindCount,
        newCommits     : 0
    };
}