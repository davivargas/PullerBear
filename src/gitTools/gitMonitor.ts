import * as vscode from 'vscode';
import { analyzeCode } from '../ai/aiClient';

let pullRate = 5 * 60 * 1000; // 5 minutes in milliseconds

// Internal helper function to get the current repository
function getRepo(git: any): any {
    const repos = git.repositories;
    if (!repos || repos.length === 0) {
        vscode.window.showErrorMessage('No Git repository found. Please open a folder with a Git repository to use PullerBear.');
        return null;
    }
    return repos[0];
}

export function gitMonitor(context: vscode.ExtensionContext) {

    const gitExtension = vscode.extensions.getExtension('vscode.git');

    // Check if the Git extension is available
    if (!gitExtension) {
        vscode.window.showErrorMessage('Git extension not found. Please install the Git extension to use PullerBear.');
        return;
    }

    // Get the Git API
    const git = gitExtension.exports.getAPI(1);

    // Use getRepo to check for existing repositories
    const existingRepo = getRepo(git);
    if (existingRepo) {
        startMonitoring(existingRepo);
    }

    // Also listen for new repositories being opened
    git.onDidOpenRepository((repository: any) => {
        startMonitoring(repository);
    });
}

function startMonitoring(repository: any) {
    // Start pulling at a regular interval (e.g., every 5 minutes)
    const intervalId = setInterval(() => {
        try {
            repository.fetch();

            const head = repository.state.HEAD;
            if (head && head.behind > 0) {
                vscode.window.showInformationMessage('Remote changes detected, you\'re behind by ' + head.behind + ' commits. Pulling changes...');
                
                analyzeCode({
                    branchName: head.name,
                    diffText: repository.diff()
                }).then((analysis) => {
                    // Process the analysis results and display them to the user
                    console.log('Analysis results:', analysis);
                    vscode.window.showInformationMessage('Code analysis completed. Check the console for details.');
                }).catch((error) => {
                    console.error('Error analyzing code:', error);
                    vscode.window.showErrorMessage('Error analyzing code changes');
                });
            }

        }
        catch (error) {
            vscode.window.showErrorMessage('Error fetching repository');
        }
    }, pullRate); // 5 minutes

    // Clean up the interval when the repository is closed
    repository.onDidClose(() => {
        clearInterval(intervalId);
    });
}
