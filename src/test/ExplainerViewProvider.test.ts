import * as assert from 'assert/strict';
import * as vscode from 'vscode';
import { ExplainerViewProvider } from '../ExplainerViewProvider';
import { createCommitSummary } from './helpers/factories';

suite('ExplainerViewProvider', () =>
{
    test('resolveWebviewView configures the webview and pushes summaries on ready', async () =>
    {
        const postedMessages: any[] = [];
        let messageHandler: ((data: any) => void) | undefined;

        const webview = {
            options             : undefined,
            html                : '',
            asWebviewUri        : (uri: vscode.Uri): vscode.Uri => uri,
            postMessage         : async (message: any): Promise<boolean> =>
            {
                postedMessages.push(message);
                return true;
            },
            onDidReceiveMessage : (listener: (data: any) => void) =>
            {
                messageHandler = listener;
                return { dispose: () => undefined };
            }
        } as unknown as vscode.Webview;

        const webviewView = { webview } as vscode.WebviewView;
        const provider = new ExplainerViewProvider(vscode.Uri.file('/tmp/pullerbear'));
        provider.addSummary(createCommitSummary({ hash: 'old-one' }));

        provider.resolveWebviewView(
            webviewView,
            {} as vscode.WebviewViewResolveContext,
            {} as vscode.CancellationToken
        );

        assert.equal(webview.options?.enableScripts, true);
        assert.match(webview.html, /Content-Security-Policy/);
        assert.match(webview.html, /dist\/webview\.js/);

        messageHandler?.({ type: 'ready' });

        assert.equal(postedMessages.length, 1);
        assert.equal(postedMessages[0].type, 'summaries');
        assert.equal(postedMessages[0].data[0].hash, 'old-one');
    });

    test('addSummary prepends newest summaries and pushes immediately when mounted', async () =>
    {
        const postedMessages: any[] = [];
        let messageHandler: ((data: any) => void) | undefined;

        const webview = {
            options             : undefined,
            html                : '',
            asWebviewUri        : (uri: vscode.Uri): vscode.Uri => uri,
            postMessage         : async (message: any): Promise<boolean> =>
            {
                postedMessages.push(message);
                return true;
            },
            onDidReceiveMessage : (listener: (data: any) => void) =>
            {
                messageHandler = listener;
                return { dispose: () => undefined };
            }
        } as unknown as vscode.Webview;

        const provider = new ExplainerViewProvider(vscode.Uri.file('/tmp/pullerbear'));
        provider.resolveWebviewView(
            { webview } as vscode.WebviewView,
            {} as vscode.WebviewViewResolveContext,
            {} as vscode.CancellationToken
        );

        provider.addSummary(createCommitSummary({ hash: 'first' }));
        provider.addSummary(createCommitSummary({ hash: 'second' }));
        messageHandler?.({ type: 'ready' });

        const latestPush = postedMessages[postedMessages.length - 1];
        assert.equal(latestPush.data[0].hash, 'second');
        assert.equal(latestPush.data[1].hash, 'first');
    });
});
