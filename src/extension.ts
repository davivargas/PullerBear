import * as vscode from 'vscode';
import { update } from './update';
import { ExplainerViewProvider } from './ExplainerViewProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('[PullerBear] Extension activated.');

    // Register the "What's New" sidebar webview
    const provider = new ExplainerViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ExplainerViewProvider.viewType,
            provider
        )
    );

    // Start the git fetch & summarize loop
    update(context, provider);
}

export function deactivate() {}
