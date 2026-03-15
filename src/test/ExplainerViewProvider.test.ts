import * as assert from 'assert/strict';
import * as vscode from 'vscode';
import * as aiClient from '../ai/aiClient';
import * as fileWrite from '../utl/fileWrite';
import { ExplainerViewProvider } from '../ExplainerViewProvider';
import { createCommitSummary } from './helpers/factories';
import { stubMethod } from './helpers/testUtils';

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

    test('hasSummary tracks stored hashes and addSummary ignores duplicates', () =>
    {
        const postedMessages: any[] = [];
        const webview = {
            options             : undefined,
            html                : '',
            asWebviewUri        : (uri: vscode.Uri): vscode.Uri => uri,
            postMessage         : async (message: any): Promise<boolean> =>
            {
                postedMessages.push(message);
                return true;
            },
            onDidReceiveMessage : (_listener: (data: any) => void) =>
                ({ dispose: () => undefined })
        } as unknown as vscode.Webview;

        const provider = new ExplainerViewProvider(vscode.Uri.file('/tmp/pullerbear'));
        provider.resolveWebviewView(
            { webview } as vscode.WebviewView,
            {} as vscode.WebviewViewResolveContext,
            {} as vscode.CancellationToken
        );

        const summary = createCommitSummary({ hash: 'dup-hash' });
        provider.addSummary(summary);
        provider.addSummary(summary);

        assert.equal(provider.hasSummary('dup-hash'), true);
        assert.equal(provider.hasSummary('missing-hash'), false);
        assert.equal(postedMessages.length, 1);
        assert.equal(postedMessages[0].data.length, 1);
        assert.equal(postedMessages[0].data[0].hash, 'dup-hash');
    });

    test('clearSummaries pushes an empty list when mounted', () =>
    {
        const postedMessages: any[] = [];
        const webview = {
            options             : undefined,
            html                : '',
            asWebviewUri        : (uri: vscode.Uri): vscode.Uri => uri,
            postMessage         : async (message: any): Promise<boolean> =>
            {
                postedMessages.push(message);
                return true;
            },
            onDidReceiveMessage : (_listener: (data: any) => void) =>
                ({ dispose: () => undefined })
        } as unknown as vscode.Webview;

        const provider = new ExplainerViewProvider(vscode.Uri.file('/tmp/pullerbear'));
        provider.resolveWebviewView(
            { webview } as vscode.WebviewView,
            {} as vscode.WebviewViewResolveContext,
            {} as vscode.CancellationToken
        );

        provider.addSummary(createCommitSummary({ hash: 'to-clear' }));
        provider.clearSummaries();

        const latestPush = postedMessages[postedMessages.length - 1];
        assert.deepEqual(latestPush.data, []);
    });

    test('refresh message invokes the registered refresh handler', async () =>
    {
        let messageHandler: ((data: any) => void | Promise<void>) | undefined;
        const refreshCalls: number[] = [];
        const webview = {
            options             : undefined,
            html                : '',
            asWebviewUri        : (uri: vscode.Uri): vscode.Uri => uri,
            postMessage         : async (): Promise<boolean> => true,
            onDidReceiveMessage : (listener: (data: any) => void | Promise<void>) =>
            {
                messageHandler = listener;
                return { dispose: () => undefined };
            }
        } as unknown as vscode.Webview;

        const provider = new ExplainerViewProvider(vscode.Uri.file('/tmp/pullerbear'));
        provider.setRefreshHandler(async (): Promise<void> =>
        {
            refreshCalls.push(Date.now());
        });
        provider.resolveWebviewView(
            { webview } as vscode.WebviewView,
            {} as vscode.WebviewViewResolveContext,
            {} as vscode.CancellationToken
        );

        await messageHandler?.({ type: 'refresh' });

        assert.equal(refreshCalls.length, 1);
    });

    test('askQuestion reads the review file and posts the AI answer', async () =>
    {
        const postedMessages: any[] = [];
        let messageHandler: ((data: any) => void | Promise<void>) | undefined;

        const restoreRead = stubMethod(
            fileWrite,
            'readReviewFile',
            (async (): Promise<string> => '[{"file":"src/a.ts","summary":"Changed logic"}]') as typeof fileWrite.readReviewFile
        );
        const restoreAsk = stubMethod(
            aiClient,
            'askAboutCommit',
            (async (question: string, reviewJson: string): Promise<string> =>
            {
                assert.match(question, /what changed/i);
                assert.match(reviewJson, /src\/a\.ts/);
                return 'src/a.ts changed logic.';
            }) as typeof aiClient.askAboutCommit
        );

        const webview = {
            options             : undefined,
            html                : '',
            asWebviewUri        : (uri: vscode.Uri): vscode.Uri => uri,
            postMessage         : async (message: any): Promise<boolean> =>
            {
                postedMessages.push(message);
                return true;
            },
            onDidReceiveMessage : (listener: (data: any) => void | Promise<void>) =>
            {
                messageHandler = listener;
                return { dispose: () => undefined };
            }
        } as unknown as vscode.Webview;

        try
        {
            const provider = new ExplainerViewProvider(vscode.Uri.file('/tmp/pullerbear'));
            provider.resolveWebviewView(
                { webview } as vscode.WebviewView,
                {} as vscode.WebviewViewResolveContext,
                {} as vscode.CancellationToken
            );

            await messageHandler?.({ type: 'askQuestion', question: 'What changed?' });

            assert.equal(postedMessages.length, 1);
            assert.equal(postedMessages[0].type, 'answerQuestion');
            assert.match(postedMessages[0].answer, /src\/a\.ts changed logic/);
        }
        finally
        {
            restoreAsk();
            restoreRead();
        }
    });

    test('askQuestion posts an error message when the AI request fails', async () =>
    {
        const postedMessages: any[] = [];
        let messageHandler: ((data: any) => void | Promise<void>) | undefined;

        const restoreRead = stubMethod(
            fileWrite,
            'readReviewFile',
            (async (): Promise<string> => '[{"file":"src/a.ts","summary":"Changed logic"}]') as typeof fileWrite.readReviewFile
        );
        const restoreAsk = stubMethod(
            aiClient,
            'askAboutCommit',
            (async (): Promise<string> =>
            {
                throw new Error('service unavailable');
            }) as typeof aiClient.askAboutCommit
        );

        const webview = {
            options             : undefined,
            html                : '',
            asWebviewUri        : (uri: vscode.Uri): vscode.Uri => uri,
            postMessage         : async (message: any): Promise<boolean> =>
            {
                postedMessages.push(message);
                return true;
            },
            onDidReceiveMessage : (listener: (data: any) => void | Promise<void>) =>
            {
                messageHandler = listener;
                return { dispose: () => undefined };
            }
        } as unknown as vscode.Webview;

        try
        {
            const provider = new ExplainerViewProvider(vscode.Uri.file('/tmp/pullerbear'));
            provider.resolveWebviewView(
                { webview } as vscode.WebviewView,
                {} as vscode.WebviewViewResolveContext,
                {} as vscode.CancellationToken
            );

            await messageHandler?.({ type: 'askQuestion', question: 'What changed?' });

            assert.equal(postedMessages.length, 1);
            assert.equal(postedMessages[0].type, 'answerQuestion');
            assert.match(postedMessages[0].answer, /Error: service unavailable/);
        }
        finally
        {
            restoreAsk();
            restoreRead();
        }
    });
});
