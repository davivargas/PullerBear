import * as assert from 'assert/strict';
import * as vscode from 'vscode';
import * as extension from '../extension';
import * as gitMonitorModule from '../gitTools/gitMonitor';
import { ExplainerViewProvider } from '../ExplainerViewProvider';
import { createDisposable, stubMethod } from './helpers/testUtils';
import { createExtensionContext } from './helpers/factories';

suite('extension activation', () =>
{
    test('activate registers the sidebar provider and starts monitoring', () =>
    {
        const registrations: Array<{ viewType: string; provider: unknown }> = [];
        const monitorCalls: Array<{ context: vscode.ExtensionContext; provider: unknown }> = [];

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
        }
    });

    test('deactivate is a no-op', () =>
    {
        assert.equal(extension.deactivate(), undefined);
    });
});
