import * as assert from 'assert/strict';
import * as vscode from 'vscode';
import {
    getExplainedCommits,
    getUnexplainedCommits,
    markCommitAsExplained
} from '../stateManager';
import { createExtensionContext } from './helpers/factories';

suite('stateManager', () =>
{
    test('getExplainedCommits returns empty array when nothing has been stored', () =>
    {
        const context = createExtensionContext({
            workspaceState: {
                get    : <T>(_key: string): T | undefined => undefined,
                update : async (): Promise<void> => undefined,
                keys   : (): readonly string[] => []
            } as unknown as vscode.Memento
        });

        assert.deepEqual(getExplainedCommits(context), []);
    });

    test('markCommitAsExplained appends only new hashes', async () =>
    {
        let stored = ['a1'];
        const updates: string[][] = [];

        const context = createExtensionContext({
            workspaceState: {
                get    : <T>(_key: string): T | undefined => stored as T,
                update : async (_key: string, value: string[]): Promise<void> =>
                {
                    updates.push(value);
                    stored = value;
                },
                keys   : (): readonly string[] => []
            } as unknown as vscode.Memento
        });

        await markCommitAsExplained(context, 'b2');
        await markCommitAsExplained(context, 'b2');

        assert.deepEqual(updates, [['a1', 'b2']]);
        assert.deepEqual(stored, ['a1', 'b2']);
    });

    test('getUnexplainedCommits filters hashes already present in state', () =>
    {
        const context = createExtensionContext({
            workspaceState: {
                get    : <T>(_key: string): T | undefined => ['one', 'three'] as T,
                update : async (): Promise<void> => undefined,
                keys   : (): readonly string[] => []
            } as unknown as vscode.Memento
        });

        assert.deepEqual(
            getUnexplainedCommits(context, ['one', 'two', 'three', 'four']),
            ['two', 'four']
        );
    });
});