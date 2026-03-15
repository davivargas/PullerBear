import * as assert from 'assert/strict';
import * as vscode from 'vscode';
import * as repositoryChecker from '../gitTools/repositoryChecker';
import { gitMonitor } from '../gitTools/gitMonitor';
import { createDisposable, stubMethod } from './helpers/testUtils';
import {
    createEventEmitter,
    createExtensionContext,
    createRepository
} from './helpers/factories';

suite('gitMonitor', () =>
{
    test('shows an error when the built-in Git extension is unavailable', () =>
    {
        const errors: string[] = [];

        const restoreExtension = stubMethod(
            vscode.extensions,
            'getExtension',
            (() => undefined) as typeof vscode.extensions.getExtension
        );
        const restoreError = stubMethod(
            vscode.window,
            'showErrorMessage',
            ((message: string) =>
            {
                errors.push(message);
                return Promise.resolve(undefined);
            }) as typeof vscode.window.showErrorMessage
        );

        try
        {
            gitMonitor(
                createExtensionContext(),
                { addSummary: (): void => undefined } as any
            );

            assert.equal(errors.length, 1);
            assert.match(errors[0], /Git extension not found/i);
        }
        finally
        {
            restoreError();
            restoreExtension();
        }
    });

    test('initializes monitors for open repositories and for repositories opened later', () =>
    {
        const repositoryA = createRepository();
        const repositoryB = createRepository();
        const openEmitter = createEventEmitter<any>();
        const configEmitter = createEventEmitter<vscode.ConfigurationChangeEvent>();
        const intervalCalls: Array<{ delay: number; fn: () => void }> = [];
        const checkCalls: any[] = [];

        const restoreGitExtension = stubMethod(
            vscode.extensions,
            'getExtension',
            (() =>
            {
                return {
                    id            : 'vscode.git',
                    extensionUri  : {} as vscode.Uri,
                    extensionPath : '',
                    isActive      : true,
                    packageJSON   : {},
                    exports       : {
                        getAPI: () => ({
                            repositories        : [repositoryA],
                            onDidOpenRepository : openEmitter.event
                        })
                    },
                    activate      : async () => undefined,
                    extensionKind : vscode.ExtensionKind.Workspace
                } as unknown as vscode.Extension<any>;
            }) as typeof vscode.extensions.getExtension
        );

        const onDidChangeConfigurationMock =
            ((listener: (event: vscode.ConfigurationChangeEvent) => void) =>
                configEmitter.event(listener)) as typeof vscode.workspace.onDidChangeConfiguration;

        const restoreConfigListener = stubMethod(
            vscode.workspace,
            'onDidChangeConfiguration',
            onDidChangeConfigurationMock
        );

        const restoreCheck = stubMethod(
            repositoryChecker,
            'checkRepository',
            (async (repository, state) =>
            {
                checkCalls.push({ repository, state });
            }) as typeof repositoryChecker.checkRepository
        );

        const originalSetInterval = globalThis.setInterval;
        const originalClearInterval = globalThis.clearInterval;

        globalThis.setInterval = (((fn: () => void, delay?: number): NodeJS.Timeout =>
        {
            intervalCalls.push({ fn, delay: Number(delay) });
            return createDisposable() as unknown as NodeJS.Timeout;
        }) as typeof setInterval);

        globalThis.clearInterval =
            (((_handle: NodeJS.Timeout): void => undefined) as typeof clearInterval);

        try
        {
            const context = createExtensionContext();

            gitMonitor(
                context,
                { addSummary: (): void => undefined } as any
            );

            assert.equal(checkCalls.length, 1);
            assert.equal(checkCalls[0].repository, repositoryA);
            assert.equal(intervalCalls.length, 1);

            openEmitter.fire(repositoryB);
            assert.equal(checkCalls.length, 2);
            assert.equal(checkCalls[1].repository, repositoryB);
            assert.equal(intervalCalls.length, 2);

            configEmitter.fire({
                affectsConfiguration: (section: string): boolean => section === 'pullerbear'
            } as vscode.ConfigurationChangeEvent);

            assert.equal(checkCalls.length, 4);

            repositoryA.__close();
            repositoryB.__close();
            assert.ok(context.subscriptions.length >= 2);
        }
        finally
        {
            globalThis.clearInterval = originalClearInterval;
            globalThis.setInterval = originalSetInterval;
            restoreCheck();
            restoreConfigListener();
            restoreGitExtension();
        }
    });
});