import * as vscode from 'vscode';
import { ExplainerViewProvider, CommitSummary } from '../ExplainerViewProvider';

export interface BranchState
{
    name           : string;
    lastBehindCount: number;
    commitTimestamps: number[];
}

export interface RepoMonitorState
{
    commitTimestamps : number[];
    lastBehindCount  : number;
    intervalHandle?  : NodeJS.Timeout;
    isChecking       : boolean;
    // Background tracking for main branch
    mainBranch?      : BranchState;
}

export interface GitMonitorConfig
{
    commitWindowMinutes      : number;
    hardStopCommitThreshold : number;
    warningCommitThreshold  : number;
    fetchIntervalMinutes     : number;
    branchRef                : string;
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

export { CommitSummary };
export { ExplainerViewProvider };
export { vscode };