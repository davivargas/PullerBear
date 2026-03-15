import * as vscode from 'vscode';

export interface PullerBearConfig
{
    fetchIntervalMinutes      : number;
    commitWindowMinutes       : number;
    warningCommitThreshold    : number;
    hardStopCommitThreshold   : number;
    branchRef                 : string;
    apiKey                    : string;
}

export function getPullerBearConfig(): PullerBearConfig
{
    const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('pullerBear');

    return {
        fetchIntervalMinutes    : config.get<number>('fetchIntervalMinutes', 1),
        commitWindowMinutes     : config.get<number>('commitWindowMinutes', 60),
        warningCommitThreshold  : config.get<number>('warningCommitThreshold', 2),
        hardStopCommitThreshold : config.get<number>('hardStopCommitThreshold', 5),
        branchRef               : config.get<string>('branchRef', 'main'),
        apiKey                  : config.get<string>('apiKey', '')
    };
}