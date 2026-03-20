import * as assert from 'assert/strict';
import * as aiClient from '../ai/aiClient';
import * as fileWrite from '../utl/fileWrite';
import { runAIAnalysis } from '../gitTools/repositoryChecker';
import { createRepository } from './helpers/factories';
import { stubMethod } from './helpers/testUtils';

suite('repositoryChecker runAIAnalysis', () =>
{
    test('returns a commit summary using AI response content when available', async () =>
    {
        const repository = createRepository({
            diffWith : async (range: string): Promise<string> =>
            {
                assert.equal(range, 'HEAD...origin/main');
                return '+ const safe = true;';
            }
        });
        const head = {
            name     : 'feature/summary',
            commit   : 'commit-123',
            upstream : { remote: 'origin', name: 'main' },
            behind   : 2
        };
        const writes: any[] = [];
        let writeCompleted = false;

        const restoreAnalyze = stubMethod(
            aiClient,
            'analyzeCode',
            (async (context) =>
            {
                assert.equal(context.branchName, 'feature/summary');
                assert.match(context.diffText, /safe = true/);
                return '[{"file":"src/a.ts","line":0,"severity":"info","summary":"AI review result"}]';
            }) as typeof aiClient.analyzeCode
        );
        const restoreWrite = stubMethod(
            fileWrite,
            'writeToFile',
            (async (reviews): Promise<void> =>
            {
                writes.push(reviews);
                writeCompleted = true;
            }) as typeof fileWrite.writeToFile
        );

        try
        {
            const summary = await runAIAnalysis(repository, head, 'origin/main', 'target-commit', 2);

            assert.equal(summary?.hash, 'target-commit');
            assert.match(String(summary?.summary), /AI review result/);
            assert.equal(writes.length, 1);
            assert.equal(writeCompleted, true);
            assert.deepEqual(writes[0], [
                {
                    file     : 'src/a.ts',
                    line     : 0,
                    severity : 'info',
                    summary  : 'AI review result'
                }
            ]);
        }
        finally
        {
            restoreWrite();
            restoreAnalyze();
        }
    });

    test('falls back to a generic summary when AI analysis fails', async () =>
    {
        const repository = createRepository();
        const restoreAnalyze = stubMethod(
            aiClient,
            'analyzeCode',
            (async () =>
            {
                throw new Error('network down');
            }) as typeof aiClient.analyzeCode
        );

        try
        {
            const summary = await runAIAnalysis(repository, {
                name     : 'main',
                commit   : 'commit-404',
                upstream : { remote: 'origin', name: 'main' },
                behind   : 4
            }, 'origin/main', 'target-404', 4);

            assert.equal(summary?.hash, 'target-404');
            assert.match(String(summary?.summary), /AI summary unavailable/);
        }
        finally
        {
            restoreAnalyze();
        }
    });

    test('uses normalized API diff text when no patch is available and no git CLI fallback can run', async () =>
    {
        const repository = createRepository({
            rootUri  : undefined,
            diffWith : async (): Promise<unknown> =>
                [
                    {
                        status : 'M',
                        uri    : { fsPath: '/tmp/a.ts' }
                    }
                ]
        });
        const restoreAnalyze = stubMethod(
            aiClient,
            'analyzeCode',
            (async (context) =>
            {
                assert.match(context.diffText, /a\.ts/);
                return '[]';
            }) as typeof aiClient.analyzeCode
        );
        const restoreWrite = stubMethod(
            fileWrite,
            'writeToFile',
            ((_: unknown): void => undefined) as typeof fileWrite.writeToFile
        );

        try
        {
            const summary = await runAIAnalysis(repository, {
                name     : 'main',
                commit   : 'commit-123',
                upstream : { remote: 'origin', name: 'main' },
                behind   : 1
            }, 'origin/main', 'target-123', 1);

            assert.equal(summary?.hash, 'target-123');
            assert.match(String(summary?.summary), /No issues or summaries found|^\[\]$/);
        }
        finally
        {
            restoreWrite();
            restoreAnalyze();
        }
    });
});
