import { RepoMonitorState, BranchState } from './types';
import { getPullerBearConfig } from '../config/pullerBearConfig';

/**
 * Detects the default branch name from repository refs
 * Checks common default branch names: main, master, mainline
 */
export function detectDefaultBranch(repository: any): string | null
{
    const refs = repository.state?.refs;
    if (!refs)
    {
        return null;
    }

    // Common default branch names to check in order of preference
    const defaultBranchNames = ['main', 'master', 'mainline'];

    for (const branchName of defaultBranchNames)
    {
        // Check for origin/<branchName> reference
        if (refs.has(`origin/${branchName}`))
        {
            return branchName;
        }
    }

    return null;
}

/**
 * Gets the behind count for a specific branch
 */
export function getBranchBehindCount(repository: any, branchName: string): number
{
    const refs = repository.state?.refs;
    if (!refs)
    {
        return 0;
    }

    // Try to get the ref for the branch
    const refKey = `refs/heads/${branchName}`;
    const ref = refs.get(refKey);

    if (ref)
    {
        return ref.behind ?? 0;
    }

    return 0;
}

/**
 * Gets the behind count for the configured branch (from pullerBearConfig.branchRef)
 * Compares the current HEAD to the configured branch (e.g., origin/main)
 */
export function getConfiguredBranchBehindCount(repository: any): number
{
    const config = getPullerBearConfig();
    const branchRef = config.branchRef || 'main';
    
    const refs = repository.state?.refs;
    if (!refs)
    {
        return 0;
    }

    // Check for origin/<branchRef> reference (most common case)
    const originRefKey = `origin/${branchRef}`;
    const originRef = refs.get(originRefKey);
    
    if (originRef)
    {
        return originRef.behind ?? 0;
    }

    // Also check refs/heads/<branchRef> for local branch comparison
    const localRefKey = `refs/heads/${branchRef}`;
    const localRef = refs.get(localRefKey);
    
    if (localRef)
    {
        return localRef.behind ?? 0;
    }

    return 0;
}

/**
 * Creates a new repository monitor state
 */
export function createRepoState(repository: any): RepoMonitorState
{
    const defaultBranch = detectDefaultBranch(repository);

    return {
        commitTimestamps : [],
        lastBehindCount  : repository.state?.HEAD?.behind ?? 0,
        isChecking       : false,
        mainBranch       : defaultBranch ? {
            name            : defaultBranch,
            lastBehindCount : getBranchBehindCount(repository, defaultBranch),
            commitTimestamps: []
        } : undefined
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