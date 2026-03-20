import * as assert from 'assert/strict';
import * as configModule from '../config/pullerBearConfig';
import { analyzeCode, askAboutCommit } from '../ai/aiClient';
import { stubGlobal, stubMethod } from './helpers/testUtils';

suite('aiClient', () =>
{
    test('analyzeCode throws when the API key is not configured', async () =>
    {
        const restoreConfig = stubMethod(
            configModule,
            'getPullerBearConfig',
            (() => ({
                fetchIntervalMinutes    : 1,
                commitWindowMinutes     : 60,
                warningCommitThreshold  : 2,
                hardStopCommitThreshold : 5,
                branchRef               : 'main',
                apiKey                  : ''
            })) as typeof configModule.getPullerBearConfig
        );

        try
        {
            await assert.rejects(
                () => analyzeCode({ branchName: 'feature/test', diffText: '+ change' }),
                /API key not configured/
            );
        }
        finally
        {
            restoreConfig();
        }
    });

    test('analyzeCode sends the expected request and returns the AI content', async () =>
    {
        const fetchCalls: any[] = [];
        const restoreConfig = stubMethod(
            configModule,
            'getPullerBearConfig',
            (() => ({
                fetchIntervalMinutes    : 1,
                commitWindowMinutes     : 60,
                warningCommitThreshold  : 2,
                hardStopCommitThreshold : 5,
                branchRef               : 'main',
                apiKey                  : 'secret'
            })) as typeof configModule.getPullerBearConfig
        );
        const restoreFetch = stubGlobal(
            'fetch',
            (async (url: string, init?: RequestInit): Promise<Response> =>
            {
                fetchCalls.push({ url, init });
                return {
                    ok   : true,
                    json : async (): Promise<unknown> => ({
                        choices: [
                            {
                                message: { content: '[{"file":"a.ts","line":0,"severity":"info","summary":"ok"}]' }
                            }
                        ]
                    })
                } as Response;
            }) as typeof fetch
        );

        try
        {
            const result = await analyzeCode({
                branchName : 'feature/test',
                diffText   : '+ const value = 1;'
            });

            assert.match(String(result), /a\.ts/);
            assert.equal(fetchCalls.length, 1);
            assert.match(fetchCalls[0].url, /openrouter/i);
            assert.match(String(fetchCalls[0].init?.headers && JSON.stringify(fetchCalls[0].init.headers)), /secret/);
            assert.match(String(fetchCalls[0].init?.body), /feature\/test/);
            assert.match(String(fetchCalls[0].init?.body), /openrouter\/free/);
        }
        finally
        {
            restoreFetch();
            restoreConfig();
        }
    });

    test('askAboutCommit surfaces OpenRouter error details for payment failures', async () =>
    {
        const restoreConfig = stubMethod(
            configModule,
            'getPullerBearConfig',
            (() => ({
                fetchIntervalMinutes    : 1,
                commitWindowMinutes     : 60,
                warningCommitThreshold  : 2,
                hardStopCommitThreshold : 5,
                branchRef               : 'main',
                apiKey                  : 'secret'
            })) as typeof configModule.getPullerBearConfig
        );
        const restoreFetch = stubGlobal(
            'fetch',
            (async (): Promise<Response> =>
            {
                return {
                    ok     : false,
                    status : 402,
                    json   : async (): Promise<unknown> => ({
                        error: {
                            message: 'Insufficient credits'
                        }
                    })
                } as Response;
            }) as typeof fetch
        );

        try
        {
            await assert.rejects(
                () => askAboutCommit('What changed?', '[{"file":"a.ts"}]'),
                /Insufficient credits/
            );
        }
        finally
        {
            restoreFetch();
            restoreConfig();
        }
    });

    test('askAboutCommit returns a fallback string when the AI response is empty', async () =>
    {
        const restoreConfig = stubMethod(
            configModule,
            'getPullerBearConfig',
            (() => ({
                fetchIntervalMinutes    : 1,
                commitWindowMinutes     : 60,
                warningCommitThreshold  : 2,
                hardStopCommitThreshold : 5,
                branchRef               : 'main',
                apiKey                  : 'secret'
            })) as typeof configModule.getPullerBearConfig
        );
        const restoreFetch = stubGlobal(
            'fetch',
            (async (): Promise<Response> =>
            {
                return {
                    ok   : true,
                    json : async (): Promise<unknown> => ({ choices: [] })
                } as Response;
            }) as typeof fetch
        );

        try
        {
            const answer = await askAboutCommit('What changed?', '[{"file":"a.ts"}]');
            assert.equal(answer, 'No response from AI.');
        }
        finally
        {
            restoreFetch();
            restoreConfig();
        }
    });
});
