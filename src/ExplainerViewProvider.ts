import * as vscode from 'vscode';
import { askAboutCommit } from './ai/aiClient';
import { readReviewFile } from './utl/fileWrite';

export interface CommitSummary {
    hash: string;
    message: string;
    summary: string;
    timestamp: number;
    status?: 'success' | 'error';
    errorKind?: string;
    retriable?: boolean;
    retryTargetRef?: string;
    retryBehindCount?: number;
}

export class ExplainerViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'pullerbear.explainerView';
    public static readonly defaultLoadingMessage =
        'Reading diff and generating summary...';

    private _view?: vscode.WebviewView;
    private _summaries: CommitSummary[] = [];
    private _refreshHandler?: () => Promise<void>;
    private _retryActions = new Map<string, () => Promise<void>>();
    private _isLoading = false;
    private _loadingText = ExplainerViewProvider.defaultLoadingMessage;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public setRefreshHandler(handler: () => Promise<void>): void {
        this._refreshHandler = handler;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            if (data.type === 'ready') {
                // Send current summaries on load
                this._pushSummaries();
                this._pushLoadingState();
                return;
            }

            if (data.type === 'refresh') {
                this.setLoadingState(true, 'Refreshing commits...');
                try
                {
                    await this._refreshHandler?.();
                }
                finally
                {
                    this.setLoadingState(false);
                }
            }
            if (data.type === 'retrySummary') {
                const hash = typeof data.hash === 'string' ? data.hash : '';
                const summary = hash ? this.getSummary(hash) : undefined;
                const retryAction = hash ? this._retryActions.get(hash) : undefined;

                if (!summary || !summary.retriable || !retryAction)
                {
                    return;
                }

                await retryAction();
            }
            if (data.type === 'askQuestion') {
                const question = data.question;
                if (!question || typeof question !== 'string') {
                    return;
                }

                try {
                    const reviewJson = await readReviewFile();
                    const answer = await askAboutCommit(question, reviewJson);
                    webviewView.webview.postMessage({
                        type: 'answerQuestion',
                        answer,
                    });
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[PullerBear] Q&A failed:', error);
                    webviewView.webview.postMessage({
                        type: 'answerQuestion',
                        answer: `Error: ${errorMsg}`,
                    });
                }
            }
        });
    }

    /**
     * Adds a new commit summary and pushes it to the webview.
     * Only adds the summary if a commit with the same hash isn't already present.
     */
    /**
     * Returns true if a summary with the given hash already exists.
     */
    public hasSummary(hash: string): boolean {
        return this._summaries.some(s => s.hash === hash);
    }

    public addSummary(summary: CommitSummary) {
        if (!this.hasSummary(summary.hash)) {
            this._summaries.unshift(summary); // newest first
            if (!summary.retriable)
            {
                this._retryActions.delete(summary.hash);
            }
            this._pushSummaries();
        }
    }

    public upsertSummary(summary: CommitSummary): void
    {
        const index = this._summaries.findIndex((item) => item.hash === summary.hash);
        if (index >= 0)
        {
            this._summaries[index] = summary;
        }
        else
        {
            this._summaries.unshift(summary);
        }
        if (!summary.retriable)
        {
            this._retryActions.delete(summary.hash);
        }
        this._pushSummaries();
    }

    public getSummary(hash: string): CommitSummary | undefined
    {
        return this._summaries.find((summary) => summary.hash === hash);
    }

    public registerRetryAction(hash: string, action: () => Promise<void>): void
    {
        this._retryActions.set(hash, action);
    }

    public clearRetryAction(hash: string): void
    {
        this._retryActions.delete(hash);
    }

    /**
     * Clears all summaries and updates the webview.
     * Called when a git pull is detected, since the incoming changes
     * have been integrated and the summaries are no longer relevant.
     */
    public clearSummaries() {
        this._summaries = [];
        this._retryActions.clear();
        this._pushSummaries();
    }

    public setLoadingState(
        isLoading: boolean,
        text: string = ExplainerViewProvider.defaultLoadingMessage
    ): void
    {
        this._isLoading = isLoading;
        if (isLoading)
        {
            this._loadingText = text;
        }
        this._pushLoadingState();
    }

    private _pushSummaries() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'summaries',
                data: this._summaries,
            });
        }
    }

    private _pushLoadingState() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'loadingState',
                loading: this._isLoading,
                text: this._loadingText,
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
        );

        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
    <title>PullerBear</title>
</head>
<body>
    <div id="root"></div>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
