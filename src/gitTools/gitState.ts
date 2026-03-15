import { RepoMonitorState } from './types';

/**
 * Creates a new repository monitor state
 */
export function createRepoState(repository: any): RepoMonitorState
{
    return {
        commitTimestamps : [],
        lastBehindCount  : repository.state?.HEAD?.behind ?? 0,
        isChecking       : false
    };
}

/**
 * Creates a WeakMap to store repository states
 */
export function createRepoStateMap(): WeakMap<any, RepoMonitorState>
{
    return new WeakMap<any, RepoMonitorState>();
}

/**
 * Gets or creates state for a repository
 */
export function getOrCreateRepoState(
    repoStates: WeakMap<any, RepoMonitorState>,
    repository: any,
    createState: (repo: any) => RepoMonitorState
): RepoMonitorState
{
    if (repoStates.has(repository))
    {
        return repoStates.get(repository)!;
    }

    const state = createState(repository);
    repoStates.set(repository, state);
    return state;
}

/**
 * Checks if a repository is already being monitored
 */
export function isRepositoryMonitored(
    repoStates: WeakMap<any, RepoMonitorState>,
    repository: any
): boolean
{
    return repoStates.has(repository);
}

/**
 * Updates the last behind count in state
 */
export function updateBehindCount(
    state: RepoMonitorState,
    behindCount: number
): void
{
    state.lastBehindCount = behindCount;
}

/**
 * Sets the checking flag
 */
export function setChecking(state: RepoMonitorState, isChecking: boolean): void
{
    state.isChecking = isChecking;
}

/**
 * Clears the interval handle
 */
export function clearMonitorInterval(state: RepoMonitorState): void
{
    if (state.intervalHandle)
    {
        clearInterval(state.intervalHandle);
        state.intervalHandle = undefined;
    }
}

/**
 * Sets the interval handle
 */
export function setMonitorInterval(
    state: RepoMonitorState,
    handle: NodeJS.Timeout
): void
{
    state.intervalHandle = handle;
}