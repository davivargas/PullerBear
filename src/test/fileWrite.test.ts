import * as assert from 'assert/strict';
import * as vscode from 'vscode';
import { clearReviewFile, readReviewFile, writeToFile } from '../utl/fileWrite';
import { stubProperty } from './helpers/testUtils';

suite('fileWrite', () =>
{
    test('returns early when no workspace folder exists', async () =>
    {
        const restoreFolders = stubProperty(
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

    test('readReviewFile returns an empty array string when no workspace exists', async () =>
    {
        const restoreFolders = stubProperty(
            vscode.workspace,
            'workspaceFolders',
            undefined as typeof vscode.workspace.workspaceFolders
        );

        try
        {
            assert.equal(await readReviewFile(), '[]');
        }
        finally
        {
            restoreFolders();
        }
    });

    test('clearReviewFile writes an empty array to the review file', async () =>
    {
        const writes: Array<{ uri: vscode.Uri; data: Uint8Array }> = [];
        const workspaceFolder = {
            uri  : vscode.Uri.file('/tmp/workspace'),
            name : 'workspace',
            index: 0
        } as vscode.WorkspaceFolder;

        const restoreFolders = stubProperty(vscode.workspace, 'workspaceFolders', [workspaceFolder]);
        const restoreFs = stubProperty(vscode.workspace, 'fs', {
            ...vscode.workspace.fs,
            writeFile : async (uri: vscode.Uri, data: Uint8Array): Promise<void> =>
            {
                writes.push({ uri, data });
            }
        } as typeof vscode.workspace.fs);

        try
        {
            await clearReviewFile();

            assert.equal(writes.length, 1);
            assert.match(writes[0].uri.fsPath, /pullerBear_reviews\.json$/);
            assert.equal(new TextDecoder().decode(writes[0].data), '[]');
        }
        finally
        {
            restoreFs();
            restoreFolders();
        }
    });

    test('readReviewFile returns the stored review content when the file exists', async () =>
    {
        const workspaceFolder = {
            uri  : vscode.Uri.file('/tmp/workspace'),
            name : 'workspace',
            index: 0
        } as vscode.WorkspaceFolder;

        const restoreFolders = stubProperty(vscode.workspace, 'workspaceFolders', [workspaceFolder]);
        const restoreFs = stubProperty(vscode.workspace, 'fs', {
            ...vscode.workspace.fs,
            readFile : async (): Promise<Uint8Array> =>
                new TextEncoder().encode('[{"file":"src/a.ts"}]')
        } as typeof vscode.workspace.fs);

        try
        {
            assert.equal(await readReviewFile(), '[{"file":"src/a.ts"}]');
        }
        finally
        {
            restoreFs();
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

        const restoreFolders = stubProperty(vscode.workspace, 'workspaceFolders', [workspaceFolder]);
        const restoreFs = stubProperty(vscode.workspace, 'fs', {
            ...vscode.workspace.fs,
            readFile  : async (): Promise<Uint8Array> =>
            {
                throw new Error('missing');
            },
            writeFile : async (uri: vscode.Uri, data: Uint8Array): Promise<void> =>
            {
                writes.push({ uri, data });
            }
        } as typeof vscode.workspace.fs);

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
            restoreFs();
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

        const restoreFolders = stubProperty(vscode.workspace, 'workspaceFolders', [workspaceFolder]);
        const restoreFs = stubProperty(vscode.workspace, 'fs', {
            ...vscode.workspace.fs,
            readFile  : async (): Promise<Uint8Array> =>
                new TextEncoder().encode(JSON.stringify([{ id: 1 }, { id: 2 }])),
            writeFile : async (_uri: vscode.Uri, data: Uint8Array): Promise<void> =>
            {
                writes.push(data);
            }
        } as typeof vscode.workspace.fs);

        try
        {
            await writeToFile([{ id: 3 }, { id: 4 }]);

            const merged = JSON.parse(new TextDecoder().decode(writes[0]));
            assert.deepEqual(merged, [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
        }
        finally
        {
            restoreFs();
            restoreFolders();
        }
    });

    test('replaces non-array existing content with only the new reviews', async () =>
    {
        const writes: Uint8Array[] = [];
        const workspaceFolder = {
            uri  : vscode.Uri.file('/tmp/workspace'),
            name : 'workspace',
            index: 0
        } as vscode.WorkspaceFolder;

        const restoreFolders = stubProperty(vscode.workspace, 'workspaceFolders', [workspaceFolder]);
        const restoreFs = stubProperty(vscode.workspace, 'fs', {
            ...vscode.workspace.fs,
            readFile  : async (): Promise<Uint8Array> =>
                new TextEncoder().encode(JSON.stringify({ old: true })),
            writeFile : async (_uri: vscode.Uri, data: Uint8Array): Promise<void> =>
            {
                writes.push(data);
            }
        } as typeof vscode.workspace.fs);

        try
        {
            await writeToFile({ id: 9 });

            const merged = JSON.parse(new TextDecoder().decode(writes[0]));
            assert.deepEqual(merged, [{ id: 9 }]);
        }
        finally
        {
            restoreFs();
            restoreFolders();
        }
    });

    test('readReviewFile falls back to an empty array string when file reading fails', async () =>
    {
        const workspaceFolder = {
            uri  : vscode.Uri.file('/tmp/workspace'),
            name : 'workspace',
            index: 0
        } as vscode.WorkspaceFolder;

        const restoreFolders = stubProperty(vscode.workspace, 'workspaceFolders', [workspaceFolder]);
        const restoreFs = stubProperty(vscode.workspace, 'fs', {
            ...vscode.workspace.fs,
            readFile : async (): Promise<Uint8Array> =>
            {
                throw new Error('missing');
            }
        } as typeof vscode.workspace.fs);

        try
        {
            assert.equal(await readReviewFile(), '[]');
        }
        finally
        {
            restoreFs();
            restoreFolders();
        }
    });
});
