import * as assert from 'assert';
import * as vscode from 'vscode';
import { buildPrompt, diffContext } from '../ai/promptBuilder.js';

suite('AI Prompt Builder Test Suite', () => {
	vscode.window.showInformationMessage('Start AI tests.');

	test('buildPrompt should return correct structure', () => {
		const context: diffContext = {
			branchName: 'feature/test-branch',
			diffText: '+ const newFeature = true;\n- const oldFeature = false;'
		};

		const result = buildPrompt(context);

		// Should return an array with 2 messages
		assert.strictEqual(result.length, 2, 'Should have system and user messages');

		// First message should be system role
		assert.strictEqual(result[0].role, 'system', 'First message should be system');

		// Second message should be user role
		assert.strictEqual(result[1].role, 'user', 'Second message should be user');
	});

	test('buildPrompt should include branch name in user message', () => {
		const context: diffContext = {
			branchName: 'feature/new-feature',
			diffText: '+ console.log("hello");'
		};

		const result = buildPrompt(context);

		assert.ok(
			result[1].content.includes('feature/new-feature'),
			'User message should contain branch name'
		);
	});

	test('buildPrompt should include diff text in user message', () => {
		const context: diffContext = {
			branchName: 'main',
			diffText: '+ function add(a: number, b: number): number {\n+   return a + b;\n+ }'
		};

		const result = buildPrompt(context);

		assert.ok(
			result[1].content.includes('function add'),
			'User message should contain diff text'
		);
	});

	test('buildPrompt should have proper system prompt', () => {
		const context: diffContext = {
			branchName: 'test',
			diffText: 'test'
		};

		const result = buildPrompt(context);

		const systemPrompt = result[0].content;
		
		// Check system prompt contains key instructions
		assert.ok(
			systemPrompt.includes('code review'),
			'System prompt should mention code review'
		);
		assert.ok(
			systemPrompt.includes('JSON'),
			'System prompt should mention JSON output'
		);
		assert.ok(
			systemPrompt.includes('bugs') || systemPrompt.includes('security'),
			'System prompt should mention issues to look for'
		);
	});

	test('buildPrompt should handle empty diff', () => {
		const context: diffContext = {
			branchName: 'main',
			diffText: ''
		};

		const result = buildPrompt(context);

		assert.strictEqual(result.length, 2);
		assert.ok(result[1].content.includes('main'));
	});

	test('buildPrompt should handle special characters in branch name', () => {
		const context: diffContext = {
			branchName: 'feature/fix-bug-#123',
			diffText: '+ // Fixed issue'
		};

		const result = buildPrompt(context);

		assert.ok(
			result[1].content.includes('feature/fix-bug-#123'),
			'Should handle special characters in branch name'
		);
	});

	test('buildPrompt should handle multiline diff', () => {
		const context: diffContext = {
			branchName: 'main',
			diffText: '+ line 1\n+ line 2\n+ line 3\n- old line'
		};

		const result = buildPrompt(context);

		assert.ok(
			result[1].content.includes('line 1'),
			'Should include first line of diff'
		);
		assert.ok(
			result[1].content.includes('line 3'),
			'Should include last line of diff'
		);
		assert.ok(
			result[1].content.includes('old line'),
			'Should include removed lines'
		);
	});
});
