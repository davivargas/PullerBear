import * as vscode from 'vscode';

/**
 * Returns the URI for the pullerBear_reviews.json file in the first workspace folder.
 */
function getReviewFileUri(): vscode.Uri | undefined {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        return undefined;
    }
    const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    return vscode.Uri.file(`${workspacePath}/pullerBear_reviews.json`);
}

/**
 * Clears the pullerBear_reviews.json file by resetting it to an empty array.
 */
export async function clearReviewFile(): Promise<void> {
    const fileUri = getReviewFileUri();
    if (!fileUri) {
        return;
    }

    try {
        const emptyData = new TextEncoder().encode('[]');
        await vscode.workspace.fs.writeFile(fileUri, emptyData);
        console.log('[PullerBear] Cleared pullerBear_reviews.json');
    } catch (error) {
        console.error('[PullerBear] Failed to clear reviews file:', error);
    }
}

/**
 * Reads and returns the contents of pullerBear_reviews.json as a string.
 */
export async function readReviewFile(): Promise<string> {
    const fileUri = getReviewFileUri();
    if (!fileUri) {
        return '[]';
    }

    try {
        const fileData = await vscode.workspace.fs.readFile(fileUri);
        return new TextDecoder().decode(fileData);
    } catch {
        return '[]';
    }
}

export async function writeToFile(reviews: any) : Promise<void>
{
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0)
    {
        return;
    }

    const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const filePath = `${workspacePath}/pullerBear_reviews.json`;
    const fileUri = vscode.Uri.file(filePath);

    try {
        // Try to read existing file content
        let existingData: any[] = [];
        try {
            const existingFileData = await vscode.workspace.fs.readFile(fileUri);
            const existingContent = new TextDecoder().decode(existingFileData);
            existingData = JSON.parse(existingContent);
            if (!Array.isArray(existingData)) {
                existingData = [];
            }
        } catch {
            // File doesn't exist yet, start with empty array
            existingData = [];
        }

        // Append new reviews to existing data
        const newReviews = Array.isArray(reviews) ? reviews : [reviews];
        const mergedData = [...existingData, ...newReviews];

        const data = JSON.stringify(mergedData, null, 2);
        const fileData = new TextEncoder().encode(data);

        await vscode.workspace.fs.writeFile(fileUri, fileData);
    }
    catch (error)
    {
        console.error('[PullerBear] Failed to write reviews to file:', error);
    }
}