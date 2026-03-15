import * as vscode from 'vscode';

export interface CommitSummary {
    hash: string;
    message: string;
    summary: string;
    timestamp: number;
}

export class ExplainerViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'pullerbear.explainerView';

    private _view?: vscode.WebviewView;
    private _summaries: CommitSummary[] = [];
    private _refreshHandler?: () => Promise<void>;

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
        webviewView.webview.onDidReceiveMessage(data => {
            if (data.type === 'ready') {
                // Send current summaries on load
                this._pushSummaries();
                return;
            }

            if (data.type === 'refresh') {
                void this._refreshHandler?.();
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
            this._pushSummaries();
        }
    }

    /**
     * Clears all summaries and updates the webview.
     * Called when a git pull is detected, since the incoming changes
     * have been integrated and the summaries are no longer relevant.
     */
    public clearSummaries() {
        this._summaries = [];
        this._pushSummaries();
    }

    private _pushSummaries() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'summaries',
                data: this._summaries,
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
