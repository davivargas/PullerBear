import * as assert from 'assert/strict';
import { buildPrompt, buildQAPrompt } from '../ai/promptBuilder';

suite('promptBuilder', () =>
{
    test('buildPrompt returns a system message and a user diff-analysis request', () =>
    {
        const prompt = buildPrompt({
            branchName : 'feature/auth',
            diffText   : '+ const token = unsafe()'
        });

        assert.equal(prompt.length, 2);
        assert.equal(prompt[0].role, 'system');
        assert.match(prompt[0].content, /valid JSON/i);
        assert.match(prompt[0].content, /\[\]/);
        assert.equal(prompt[1].role, 'user');
        assert.match(prompt[1].content, /feature\/auth/);
        assert.match(prompt[1].content, /unsafe\(\)/);
    });

    test('buildQAPrompt returns a system message and a user QA request', () =>
    {
        const prompt = buildQAPrompt({
            question   : 'What changed in auth?',
            reviewJson : '[{"file":"src/auth.ts","summary":"Auth changed"}]'
        });

        assert.equal(prompt.length, 2);
        assert.equal(prompt[0].role, 'system');
        assert.match(prompt[0].content, /helpful assistant/i);
        assert.equal(prompt[1].role, 'user');
        assert.match(prompt[1].content, /What changed in auth/);
        assert.match(prompt[1].content, /src\/auth\.ts/);
    });
});
