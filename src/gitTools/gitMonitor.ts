import * as vscode from 'vscode';
import { analyzeCode } from '../ai/aiClient';
import { ExplainerViewProvider, CommitSummary } from '../ExplainerViewProvider';

export function gitMonitor(
    context: vscode.ExtensionContext,
    provider: ExplainerViewProvider
) {
    const gitExtension = vscode.extensions.getExtension('vscode.git');

    // Check if the Git extension is available
    if (!gitExtension) {
        vscode.window.showErrorMessage(
            'Git extension not found. Please install the Git extension to use PullerBear.'
        );
        return;
    }

    // Get the Git API
    const git = gitExtension.exports.getAPI(1);

    const checkRepository = async (repository: any) => {
        try {
            // Fetch all branches from all remotes
            await repository.fetch();
            console.log('[PullerBear] Fetched latest from remote.');

            const head = repository.state.HEAD;

            // If the branch has no upstream, warn and exit
            if (!head || !head.upstream) {
                console.log('[PullerBear] No upstream branch set.');
                vscode.window.showInformationMessage(
                    '🐻‍❄️ PullerBear: No upstream branch set for the current branch.'
                );
                return;
            }

            if (!head.behind || head.behind === 0) {
                // Explicitly notify the user that they are up to date
                vscode.window.showInformationMessage(
                    '🐻‍❄️ PullerBear: You\'re up to date! No new commits on the remote.'
                );
                return;
            }

            const behindCount: number = head.behind;
            vscode.window.showInformationMessage(
                `🐻‍❄️ PullerBear: Remote changes detected — you're behind by ${behindCount} commit(s).`
            );

            // Run AI analysis and push results to the sidebar
            try {
                const diffText = await repository.diff(true); // staged + unstaged
                const analysis = await analyzeCode({
                    branchName: head.name,
                    diffText: typeof diffText === 'string' ? diffText : '',
                });

                // Extract AI summary text from OpenRouter response
                const summaryText =
                    analysis?.choices?.[0]?.message?.content ??
                    JSON.stringify(analysis);

                const summary: CommitSummary = {
                    hash: head.commit ?? 'unknown',
                    message: `${behindCount} new commit(s) on ${head.upstream.remote}/${head.upstream.name}`,
                    summary: summaryText,
                    timestamp: Date.now(),
                };
                provider.addSummary(summary);
            } catch (aiError) {
                console.error('[PullerBear] AI analysis failed:', aiError);
                // Still show a basic summary in the sidebar even if AI fails
                const fallback: CommitSummary = {
                    hash: head.commit ?? 'unknown',
                    message: `${behindCount} new commit(s) on ${head.upstream.remote}/${head.upstream.name}`,
                    summary: `You are ${behindCount} commit(s) behind. AI summary unavailable.`,
                    timestamp: Date.now(),
                };
                provider.addSummary(fallback);
            }
        } catch (error) {
            console.error('[PullerBear] Error fetching repository:', error);
            vscode.window.showErrorMessage('PullerBear: Error fetching repository.');
        }
    };

    git.onDidOpenRepository((repository: any) => {
        // Run immediately when the repo is opened
        checkRepository(repository);

        // Then poll every 5 minutes
        const pullRate = setInterval(() => {
            checkRepository(repository);
        }, 5 * 60 * 1000);

        // Clean up the interval when the repository is closed
        repository.onDidClose(() => {
            clearInterval(pullRate);
        });
    });

    // Also check repositories that are already open
    for (const repo of git.repositories) {
        checkRepository(repo);
    }
}