import * as vscode from 'vscode';

export function update(context: vscode.ExtensionContext) {

    const gitExtension = vscode.extensions.getExtension('vscode.git');

    // Check if the Git extension is available
    if (!gitExtension) {
        vscode.window.showErrorMessage('Git extension not found. Please install the Git extension to use PullerBear.');
        return;
    }

    // Get the Git API
    const git = gitExtension.exports.getAPI(1);

    git.onDidOpenRepository((repository: any) => {

        // Start pulling at a regular interval (e.g., every 5 minutes)
        const pullRate = setInterval(() => {
            try {
                repository.fetch();

                const head = repository.state.HEAD;
                if (head && head.behind > 0) {
                    vscode.window.showInformationMessage('Remote changes detected, you\'re behind by ' + head.behind + ' commits. Pulling changes...');
                }

            }
            catch (error) {
                vscode.window.showErrorMessage('Error fetching repository');
            }
        }, 5 * 60 * 1000); // 5 minutes

        // Clean up the interval when the repository is closed
        repository.onDidClose(() => {
            clearInterval(pullRate);
        });

    });
}