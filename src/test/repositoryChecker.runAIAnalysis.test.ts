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

        const restoreAnalyze = stubMethod(
            aiClient,
            'analyzeCode',
            (async (context) =>
            {
                assert.equal(context.branchName, 'feature/summary');
                assert.match(context.diffText, /safe = true/);
                return {
                    choices: [
                        {
                            message: { content: 'AI review result' }
                        }
                    ]
                };
            }) as typeof aiClient.analyzeCode
        );
        const restoreWrite = stubMethod(
            fileWrite,
            'writeToFile',
            ((summary): void =>
            {
                writes.push(summary);
            }) as typeof fileWrite.writeToFile
        );

        try
        {
            const summary = await runAIAnalysis(repository, head, 'origin/main', 'target-commit', 2);

            assert.equal(summary?.hash, 'target-commit');
            assert.equal(summary?.summary, 'AI review result');
            assert.equal(writes.length, 1);
            assert.equal(writes[0].hash, 'target-commit');
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
});
