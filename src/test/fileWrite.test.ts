import * as assert from 'assert/strict';
import * as vscode from 'vscode';
import { writeToFile } from '../utl/fileWrite';
import { stubMethod } from './helpers/testUtils';

suite('fileWrite', () =>
{
    test('returns early when no workspace folder exists', async () =>
    {
        const restoreFolders = stubMethod(
            vscode.workspace,
            'workspaceFolders',
            undefined as typeof vscode.workspace.workspaceFolders
        );

        try
        {
            await assert.doesNotReject(() => writeToFile({ review: 1 }));
        }
        finally
        {
            restoreFolders();
        }
    });

    test('creates a new review file when one does not already exist', async () =>
    {
        const writes: Array<{ uri: vscode.Uri; data: Uint8Array }> = [];
        const workspaceFolder = {
            uri  : vscode.Uri.file('/tmp/workspace'),
            name : 'workspace',
            index: 0
        } as vscode.WorkspaceFolder;

        const restoreFolders = stubMethod(vscode.workspace, 'workspaceFolders', [workspaceFolder]);
        const restoreRead = stubMethod(
            vscode.workspace.fs,
            'readFile',
            (async (): Promise<Uint8Array> =>
            {
                throw new Error('missing');
            }) as typeof vscode.workspace.fs.readFile
        );
        const restoreWrite = stubMethod(
            vscode.workspace.fs,
            'writeFile',
            (async (uri: vscode.Uri, data: Uint8Array): Promise<void> =>
            {
                writes.push({ uri, data });
            }) as typeof vscode.workspace.fs.writeFile
        );

        try
        {
            await writeToFile({ id: 1, summary: 'first' });

            assert.equal(writes.length, 1);
            assert.match(writes[0].uri.fsPath, /pullerBear_reviews\.json$/);
            assert.deepEqual(JSON.parse(new TextDecoder().decode(writes[0].data)), [
                { id: 1, summary: 'first' }
            ]);
        }
        finally
        {
            restoreWrite();
            restoreRead();
            restoreFolders();
        }
    });

    test('appends incoming reviews to an existing array in the file', async () =>
    {
        const writes: Uint8Array[] = [];
        const workspaceFolder = {
            uri  : vscode.Uri.file('/tmp/workspace'),
            name : 'workspace',
            index: 0
        } as vscode.WorkspaceFolder;

        const restoreFolders = stubMethod(vscode.workspace, 'workspaceFolders', [workspaceFolder]);
        const restoreRead = stubMethod(
            vscode.workspace.fs,
            'readFile',
            (async (): Promise<Uint8Array> =>
                new TextEncoder().encode(JSON.stringify([{ id: 1 }, { id: 2 }]))
            ) as typeof vscode.workspace.fs.readFile
        );
        const restoreWrite = stubMethod(
            vscode.workspace.fs,
            'writeFile',
            (async (_uri: vscode.Uri, data: Uint8Array): Promise<void> =>
            {
                writes.push(data);
            }) as typeof vscode.workspace.fs.writeFile
        );

        try
        {
            await writeToFile([{ id: 3 }, { id: 4 }]);

            const merged = JSON.parse(new TextDecoder().decode(writes[0]));
            assert.deepEqual(merged, [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
        }
        finally
        {
            restoreWrite();
            restoreRead();
            restoreFolders();
        }
    });
});
