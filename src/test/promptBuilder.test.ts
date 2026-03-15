import * as assert from 'assert/strict';
import { buildPrompt } from '../ai/promptBuilder';

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
        assert.equal(prompt[1].role, 'user');
        assert.match(prompt[1].content, /feature\/auth/);
        assert.match(prompt[1].content, /unsafe\(\)/);
    });
});
