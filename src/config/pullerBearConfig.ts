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
        apiKey                  : config.get<string>('apiKey', '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')
    };
}