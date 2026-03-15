import * as assert from 'assert/strict';
import * as vscode from 'vscode';
import { getPullerBearConfig } from '../config/pullerBearConfig';
import { stubMethod } from './helpers/testUtils';

suite('pullerBearConfig', () =>
{
    test('returns configured values with expected fallback defaults', () =>
    {
        const getCalls: Array<[string, unknown]> = [];
        const mockConfig = {
            get<T>(key: string, fallback: T): T
            {
                getCalls.push([key, fallback]);

                const values: Record<string, unknown> = {
                    fetchIntervalMinutes    : 15,
                    commitWindowMinutes     : 90,
                    warningCommitThreshold  : 4,
                    hardStopCommitThreshold : 8,
                    branchRef               : 'develop'
                };

                return values[key] as T;
            }
        } as vscode.WorkspaceConfiguration;

        const restore = stubMethod(
            vscode.workspace,
            'getConfiguration',
            (() => mockConfig) as typeof vscode.workspace.getConfiguration
        );

        try
        {
            const config = getPullerBearConfig();

            assert.deepEqual(config, {
                fetchIntervalMinutes    : 15,
                commitWindowMinutes     : 90,
                warningCommitThreshold  : 4,
                hardStopCommitThreshold : 8,
                branchRef               : 'develop'
            });

            assert.deepEqual(getCalls, [
                ['fetchIntervalMinutes', 5],
                ['commitWindowMinutes', 60],
                ['warningCommitThreshold', 2],
                ['hardStopCommitThreshold', 5],
                ['branchRef', 'main']
            ]);
        }
        finally
        {
            restore();
        }
    });
});
