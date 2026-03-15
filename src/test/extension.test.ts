import * as assert from 'assert/strict';
import * as vscode from 'vscode';
import * as extension from '../extension';
import * as gitMonitorModule from '../gitTools/gitMonitor';
import * as configModule from '../config/pullerBearConfig';
import { ExplainerViewProvider } from '../ExplainerViewProvider';
import { createDisposable, stubMethod } from './helpers/testUtils';
import { createExtensionContext } from './helpers/factories';

suite('extension activation', () =>
{
    test('activate registers the sidebar provider and starts monitoring', () =>
    {
        const registrations: Array<{ viewType: string; provider: unknown }> = [];
        const monitorCalls: Array<{ context: vscode.ExtensionContext; provider: unknown }> = [];

        const restoreConfig = stubMethod(
            configModule,
            'getPullerBearConfig',
            (() => ({
                fetchIntervalMinutes    : 1,
                commitWindowMinutes     : 60,
                warningCommitThreshold  : 2,
                hardStopCommitThreshold : 5,
                branchRef               : 'main',
                apiKey                  : 'configured'
            })) as typeof configModule.getPullerBearConfig
        );
        const restoreRegister = stubMethod(
            vscode.window,
            'registerWebviewViewProvider',
            ((viewType: string, provider: unknown) =>
            {
                registrations.push({ viewType, provider });
                return createDisposable();
            }) as typeof vscode.window.registerWebviewViewProvider
        );
        const restoreMonitor = stubMethod(
            gitMonitorModule,
            'gitMonitor',
            ((context: vscode.ExtensionContext, provider: unknown) =>
            {
                monitorCalls.push({ context, provider });
            }) as typeof gitMonitorModule.gitMonitor
        );

        try
        {
            const context = createExtensionContext();
            extension.activate(context);

            assert.equal(registrations.length, 1);
            assert.equal(registrations[0].viewType, ExplainerViewProvider.viewType);
            assert.equal(monitorCalls.length, 1);
            assert.equal(monitorCalls[0].context, context);
            assert.equal(monitorCalls[0].provider, registrations[0].provider);
            assert.equal(context.subscriptions.length, 1);
        }
        finally
        {
            restoreMonitor();
            restoreRegister();
            restoreConfig();
        }
    });

    test('activate shows and stores the api key warning once when no key is configured', () =>
    {
        const warnings: string[] = [];
        const updates: Array<{ key: string; value: boolean }> = [];

        const restoreConfig = stubMethod(
            configModule,
            'getPullerBearConfig',
            (() => ({
                fetchIntervalMinutes    : 1,
                commitWindowMinutes     : 60,
                warningCommitThreshold  : 2,
                hardStopCommitThreshold : 5,
                branchRef               : 'main',
                apiKey                  : ''
            })) as typeof configModule.getPullerBearConfig
        );
        const restoreWarning = stubMethod(
            vscode.window,
            'showWarningMessage',
            ((message: string) =>
            {
                warnings.push(message);
                return Promise.resolve(undefined);
            }) as typeof vscode.window.showWarningMessage
        );
        const restoreRegister = stubMethod(
            vscode.window,
            'registerWebviewViewProvider',
            (() => createDisposable()) as typeof vscode.window.registerWebviewViewProvider
        );
        const restoreMonitor = stubMethod(
            gitMonitorModule,
            'gitMonitor',
            ((_: vscode.ExtensionContext, __: unknown): void => undefined) as typeof gitMonitorModule.gitMonitor
        );

        try
        {
            const context = createExtensionContext({
                workspaceState: {
                    get    : <T>(_key: string, defaultValue?: T): T => (defaultValue ?? false as T),
                    update : async (key: string, value: boolean): Promise<void> =>
                    {
                        updates.push({ key, value });
                    },
                    keys   : (): readonly string[] => []
                } as unknown as vscode.Memento
            });

            extension.activate(context);

            assert.equal(warnings.length, 1);
            assert.match(warnings[0], /No API key configured/i);
            assert.deepEqual(updates, [{ key: 'hasShownApiKeyWarning', value: true }]);
        }
        finally
        {
            restoreMonitor();
            restoreRegister();
            restoreWarning();
            restoreConfig();
        }
    });

    test('deactivate is a no-op', () =>
    {
        assert.equal(extension.deactivate(), undefined);
    });
});
