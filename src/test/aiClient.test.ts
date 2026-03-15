import * as assert from 'assert/strict';
import { analyzeCode } from '../ai/aiClient';
import { stubGlobal } from './helpers/testUtils';

suite('aiClient', () =>
{
    test('analyzeCode sends the expected OpenRouter request and returns JSON', async () =>
    {
        const fetchCalls: any[] = [];
        const restoreFetch = stubGlobal(
            'fetch',
            (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
            {
                fetchCalls.push([input, init]);

                return {
                    ok   : true,
                    json : async () => ({ id: 'result-1', choices: [] })
                } as Response;
            }) as typeof fetch
        );

        const originalApiKey = process.env.API_KEY;
        process.env.API_KEY = 'secret-key';

        try
        {
            const result = await analyzeCode({
                branchName : 'feature/qa',
                diffText   : '+ console.log(test)'
            });

            assert.deepEqual(result, { id: 'result-1', choices: [] });
            assert.equal(fetchCalls.length, 1);
            assert.equal(fetchCalls[0][0], 'https://openrouter.ai/api/v1/chat/completions');

            const init = fetchCalls[0][1] as RequestInit;
            const body = JSON.parse(String(init.body));

            assert.equal(init.method, 'POST');
            assert.deepEqual(init.headers, {
                Authorization  : 'Bearer secret-key',
                'Content-Type' : 'application/json'
            });
            assert.equal(body.model, 'minimax/minimax-m2.5');
            assert.equal(body.messages[1].role, 'user');
        }
        finally
        {
            restoreFetch();
            process.env.API_KEY = originalApiKey;
        }
    });

    test('analyzeCode throws when the upstream response is not OK', async () =>
    {
        const restoreFetch = stubGlobal(
            'fetch',
            (async (): Promise<Response> => ({ ok: false, status: 503 } as Response)) as typeof fetch
        );

        try
        {
            await assert.rejects(
                () => analyzeCode({ branchName: 'main', diffText: '' }),
                /503/
            );
        }
        finally
        {
            restoreFetch();
        }
    });
});
