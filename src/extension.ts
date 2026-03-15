import * as vscode from 'vscode';
import { gitMonitor } from './gitTools/gitMonitor';
import { ExplainerViewProvider } from './ExplainerViewProvider';
import { getPullerBearConfig } from './config/pullerBearConfig';

export function activate(context: vscode.ExtensionContext) {
    console.log('[PullerBear] Extension activated.');

    // Check if API key is configured
    const config = getPullerBearConfig();
    const hasShownWarning = context.workspaceState.get<boolean>('hasShownApiKeyWarning', false);
    if (!config.apiKey && !hasShownWarning) {
        vscode.window.showWarningMessage(
            '🐻‍❄️ PullerBear: No API key configured. ' +
            'Please set pullerBear.apiKey in VS Code settings to enable AI summaries. ' +
            'Get your free API key at https://openrouter.ai/settings/keys'
        );
        // Only show the warning once per workspace
        context.workspaceState.update('hasShownApiKeyWarning', true);
    }

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

export function deactivate() {}
