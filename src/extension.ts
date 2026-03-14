import * as vscode from 'vscode';
import { gitMonitor } from './gitTools/gitMonitor';
import { ExplainerViewProvider } from './ExplainerViewProvider';

export function activate(context: vscode.ExtensionContext): void
{
    console.log('[PullerBear] Extension activated.');

    // Register the "What's New" sidebar webview
    const provider = new ExplainerViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ExplainerViewProvider.viewType,
            provider
        )
    );

    // Start the git monitor (fetch + summarize + notify)
    gitMonitor(context, provider);
}

export function deactivate(): void {}
