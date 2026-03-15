import * as assert from 'assert/strict';
import * as vscode from 'vscode';
import * as extension from '../extension';
import * as gitMonitorModule from '../gitTools/gitMonitor';
import * as configModule from '../config/pullerBearConfig';
import * as aiClient from '../ai/aiClient';
import * as fileWrite from '../utl/fileWrite';
import { ExplainerViewProvider } from '../ExplainerViewProvider';
import { createCommitSummary, createExtensionContext } from './helpers/factories';
import { createDisposable, stubMethod } from './helpers/testUtils';

suite('user workflow e2e', () =>
{
    test('simulates open view, receive summary, refresh, and ask a question', async () =>
    {
        const postedMessages: any[] = [];
        let messageHandler: ((data: any) => void) | undefined;
        const refreshCalls: number[] = [];
        let capturedProvider: ExplainerViewProvider | undefined;

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
            ((_: string, provider: ExplainerViewProvider) =>
            {
                capturedProvider = provider;
                return createDisposable();
            }) as typeof vscode.window.registerWebviewViewProvider
        );
        const restoreMonitor = stubMethod(
            gitMonitorModule,
            'gitMonitor',
            ((_: vscode.ExtensionContext, __: ExplainerViewProvider) =>
            {
                return async (): Promise<void> =>
                {
                    refreshCalls.push(Date.now());
                };
            }) as typeof gitMonitorModule.gitMonitor
        );
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
                return 'The logic in src/a.ts changed.';
            }) as typeof aiClient.askAboutCommit
        );

        try
        {
            const context = createExtensionContext();
            extension.activate(context);

            assert.ok(capturedProvider);

            capturedProvider!.resolveWebviewView(
                { webview } as vscode.WebviewView,
                {} as vscode.WebviewViewResolveContext,
                {} as vscode.CancellationToken
            );

            capturedProvider!.addSummary(createCommitSummary({
                hash    : 'workflow-1',
                summary : 'Workflow summary'
            }));

            messageHandler?.({ type: 'ready' });
            messageHandler?.({ type: 'refresh' });
            await Promise.resolve();
            await messageHandler?.({ type: 'askQuestion', question: 'What changed?' });

            assert.equal(postedMessages.some((message) =>
                message.type === 'summaries' &&
                message.data.some((item: { hash: string }) => item.hash === 'workflow-1')
            ), true);
            assert.equal(refreshCalls.length, 1);
            assert.equal(postedMessages.some((message) =>
                message.type === 'answerQuestion' &&
                /src\/a\.ts/.test(message.answer)
            ), true);
        }
        finally
        {
            restoreAsk();
            restoreRead();
            restoreMonitor();
            restoreRegister();
            restoreConfig();
        }
    });
});
