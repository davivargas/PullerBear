import * as vscode from 'vscode';

export interface PullerBearConfig
{
    fetchIntervalMinutes      : number;
    commitWindowMinutes       : number;
    warningCommitThreshold    : number;
    hardStopCommitThreshold   : number;
}

export function getPullerBearConfig(): PullerBearConfig
{
    const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('pullerBear');

    return {
        fetchIntervalMinutes    : config.get<number>('fetchIntervalMinutes', 5),
        commitWindowMinutes     : config.get<number>('commitWindowMinutes', 60),
        warningCommitThreshold  : config.get<number>('warningCommitThreshold', 2),
        hardStopCommitThreshold : config.get<number>('hardStopCommitThreshold', 5)
    };
}