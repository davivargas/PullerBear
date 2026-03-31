export interface RepoMonitorState
{
    commitTimestamps : number[];
    lastBehindCount  : number;
    lastHeadCommit?  : string;
    lastBranchName?  : string;
    intervalHandle?  : NodeJS.Timeout;
    isChecking       : boolean;
    checkQueue?      : Promise<void>;
}

export interface GitMonitorConfig
{
    commitWindowMinutes      : number;
    hardStopCommitThreshold : number;
    warningCommitThreshold  : number;
    fetchIntervalMinutes     : number;
}

export interface RepositoryContext
{
    repository : any;
    state      : RepoMonitorState;
    config     : GitMonitorConfig;
}

export interface CheckResult
{
    shouldContinue : boolean;
    behindCount    : number;
    newCommits     : number;
}
