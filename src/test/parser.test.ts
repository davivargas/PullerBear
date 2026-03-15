import * as assert from 'assert/strict';
import { parseAIResponse } from '../ai/parser';

suite('parser', () =>
{
    test('returns a default message when the AI response is empty', () =>
    {
        assert.equal(parseAIResponse([]), 'No issues or summaries found.');
    });

    test('formats info, warning, and error entries for display', () =>
    {
        const summary = parseAIResponse([
            {
                file     : 'src/a.ts',
                line     : 0,
                severity : 'info',
                summary  : 'General file summary'
            },
            {
                file     : 'src/b.ts',
                line     : 12,
                severity : 'warning',
                summary  : 'Potential problem'
            },
            {
                file     : 'src/c.ts',
                line     : 99,
                severity : 'error',
                summary  : 'Actual breakage'
            }
        ]);

        assert.match(summary, /File: src\/a\.ts/);
        assert.match(summary, /General file summary/);
        assert.match(summary, /Severity: warning/);
        assert.match(summary, /Line: 12/);
        assert.match(summary, /Actual breakage/);
    });
});
