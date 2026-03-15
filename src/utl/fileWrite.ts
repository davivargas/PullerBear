import * as fs from 'fs';
import { vscode } from '../gitTools/types';

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
        } catch (e) {
            // File doesn't exist or is corrupted, start with empty array
            console.warn('[PullerBear] Could not parse existing reviews file, starting fresh:', e);
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