import * as vscode from 'vscode';
import { summarizeCommits } from './aiService';
import { getUnexplainedCommits, markCommitAsExplained } from './stateManager';
import { ExplainerViewProvider, CommitSummary } from './ExplainerViewProvider';

export function update(
    context: vscode.ExtensionContext,
    provider: ExplainerViewProvider
) {
    const gitExtension = vscode.extensions.getExtension('vscode.git');

    if (!gitExtension) {
        vscode.window.showErrorMessage(
            'Git extension not found. Please install the Git extension to use PullerBear.'
        );
        return;
    }

    const git = gitExtension.exports.getAPI(1);

    const handleRepository = async (repository: any) => {
        try {
            // Fetch from remote
            await repository.fetch();
            console.log('[PullerBear] Fetched latest from remote.');

            const head = repository.state.HEAD;
            if (!head || !head.behind || head.behind === 0) {
                console.log('[PullerBear] Already up to date.');
                return;
            }

            const behindCount: number = head.behind;

            // Get the list of commits we are behind
            const log: { hash: string; message: string }[] =
                await repository.log({
                    maxEntries: behindCount,
                    range: `HEAD..${head.upstream}`,
                });

            if (!log || log.length === 0) {
                return;
            }

            // Filter to only commits we haven't summarized yet
            const hashes = log.map(c => c.hash);
            const newHashes = getUnexplainedCommits(context, hashes);

            if (newHashes.length === 0) {
                // Already summarized — just prompt the user to pull
                promptPull(repository, behindCount);
                return;
            }

            const newCommits = log.filter(c => newHashes.includes(c.hash));
            const messages = newCommits.map(c => c.message);

            // Get diffs for the new commits (best-effort)
            const diffs: string[] = [];
            for (const commit of newCommits.slice(0, 3)) {
                try {
                    const diff: string = await repository.show(commit.hash);
                    diffs.push(diff.slice(0, 500));
                } catch (_) {
                    // diff unavailable for this commit
                }
            }

            // Summarize using AI
            const summaryText = await summarizeCommits(messages, diffs);

            // Store in state and show in sidebar
            for (const commit of newCommits) {
                await markCommitAsExplained(context, commit.hash);
                const summary: CommitSummary = {
                    hash: commit.hash,
                    message: commit.message,
                    summary: summaryText,
                    timestamp: Date.now(),
                };
                provider.addSummary(summary);
            }

            // Notify the user
            const action = await vscode.window.showInformationMessage(
                `🐻 PullerBear: You are ${behindCount} commit(s) behind. See the "What's New" panel for a summary.`,
                'Git Pull',
                'Dismiss'
            );

            if (action === 'Git Pull') {
                await vscode.commands.executeCommand('git.pull');
            }

        } catch (error) {
            console.error('[PullerBear] Error during update:', error);
            vscode.window.showErrorMessage('PullerBear: Error checking for updates.');
        }
    };

    // Trigger on new repository open
    git.onDidOpenRepository((repository: any) => {
        handleRepository(repository);
    });

    // Also trigger for already-open repositories
    for (const repo of git.repositories) {
        handleRepository(repo);
    }
}

function promptPull(repository: any, behindCount: number) {
    vscode.window.showInformationMessage(
        `🐻 PullerBear: You are ${behindCount} commit(s) behind the remote.`,
        'Git Pull',
        'Dismiss'
    ).then(action => {
        if (action === 'Git Pull') {
            vscode.commands.executeCommand('git.pull');
        }
    });
}