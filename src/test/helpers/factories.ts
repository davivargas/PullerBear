import * as vscode from 'vscode';
import { CommitSummary } from '../../ExplainerViewProvider';
import { RepoMonitorState } from '../../gitTools/types';

export interface EventEmitterLike<T>
{
    fire: (value: T) => void;
    event: (listener: (value: T) => void) => { dispose: () => void };
}

export function createEventEmitter<T>(): EventEmitterLike<T>
{
    const listeners = new Set<(value: T) => void>();

    return {
        fire: (value: T): void =>
        {
            for (const listener of listeners)
            {
                listener(value);
            }
        },
        event: (listener: (value: T) => void) =>
        {
            listeners.add(listener);
            return {
                dispose: (): void =>
                {
                    listeners.delete(listener);
                }
            };
        }
    };
}

export function createRepoMonitorState(overrides: Partial<RepoMonitorState> = {}): RepoMonitorState
{
    return {
        commitTimestamps : [],
        lastBehindCount  : 0,
        isChecking       : false,
        ...overrides
    };
}

export function createCommitSummary(overrides: Partial<CommitSummary> = {}): CommitSummary
{
    return {
        hash      : 'abc1234',
        message   : '1 new commit(s) on origin/main',
        summary   : 'summary',
        timestamp : 1700000000000,
        ...overrides
    };
}

export function createRepository(overrides: any = {}): any
{
    const closeEmitter = createEventEmitter<void>();
    const refs = new Map<string, { behind?: number }>();

    return {
        state: {
            HEAD : {
                commit   : 'head-commit',
                name     : 'feature/test',
                behind   : 0,
                upstream : {
                    remote : 'origin',
                    name   : 'main'
                }
            },
            refs
        },
        fetch       : async (): Promise<void> => undefined,
        diff        : async (): Promise<string> => 'diff --git a/file.ts b/file.ts',
        onDidClose  : closeEmitter.event,
        __close     : (): void => closeEmitter.fire(),
        ...overrides
    };
}

export function createExtensionContext(overrides: Partial<vscode.ExtensionContext> = {}): vscode.ExtensionContext
{
    return {
        subscriptions  : [],
        workspaceState : {
            get    : <T>(_key: string): T | undefined => undefined,
            update : async (_key: string, _value: any): Promise<void> => undefined,
            keys   : (): readonly string[] => []
        } as unknown as vscode.Memento,
        extensionUri   : vscode.Uri.file('/tmp/pullerbear'),
        ...overrides
    } as vscode.ExtensionContext;
}
