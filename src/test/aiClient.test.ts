import * as assert from 'assert';
import * as vscode from 'vscode';
import { diffContext } from '../ai/promptBuilder';

// Mock fetch globally for testing
const mockFetch = async (url: string, options?: any): Promise<any> => {
	// Return mock successful response
	return {
		ok: true,
		json: async () => ({
			choices: [
				{
					message: {
						content: '[{"file": "test.ts", "line": 10, "severity": "warning", "message": "Potential null pointer"}]'
					}
				}
			]
		})
	};
};

// Store original fetch
const originalFetch = global.fetch;

suite('AI Client Test Suite', () => {
	vscode.window.showInformationMessage('Start AI client tests.');

	setup(() => {
		// Replace global fetch with mock
		(global as any).fetch = mockFetch;
	});

	teardown(() => {
		// Restore original fetch
		global.fetch = originalFetch;
	});

	test('analyzeCode should be defined as a function', async () => {
		// Dynamic import to get the module
		const { analyzeCode } = await import('../ai/aiClient.js');
		
		assert.strictEqual(
			typeof analyzeCode,
			'function',
			'analyzeCode should be a function'
		);
	});

	test('analyzeCode should call fetch with correct URL', async () => {
		let fetchCalled = false;
		let fetchUrl = '';
		
		const testFetch = async (url: string, options?: any): Promise<any> => {
			fetchCalled = true;
			fetchUrl = url;
			return {
				ok: true,
				json: async () => ({ choices: [{ message: { content: '[]' } }] })
			};
		};
		
		(global as any).fetch = testFetch;
		
		const { analyzeCode } = await import('../ai/aiClient.js');
		
		const context: diffContext = {
			branchName: 'test-branch',
			diffText: '+ const x = 1;'
		};
		
		await analyzeCode(context);
		
		assert.ok(fetchCalled, 'fetch should be called');
		assert.ok(
			fetchUrl.includes('openrouter.ai'),
			'Should call openrouter.ai API'
		);
	});

	test('analyzeCode should include Authorization header', async () => {
		let authHeader = '';
		
		const testFetch = async (url: string, options?: any): Promise<any> => {
			authHeader = options?.headers?.Authorization || '';
			return {
				ok: true,
				json: async () => ({ choices: [{ message: { content: '[]' } }] })
			};
		};
		
		(global as any).fetch = testFetch;
		
		const { analyzeCode } = await import('../ai/aiClient.js');
		
		const context: diffContext = {
			branchName: 'test',
			diffText: '+ test'
		};
		
		await analyzeCode(context);
		
		assert.ok(
			authHeader.startsWith('Bearer '),
			'Should include Bearer token in Authorization header'
		);
	});

	test('analyzeCode should use correct model', async () => {
		let requestBody: any = null;
		
		const testFetch = async (url: string, options?: any): Promise<any> => {
			requestBody = JSON.parse(options?.body || '{}');
			return {
				ok: true,
				json: async () => ({ choices: [{ message: { content: '[]' } }] })
			};
		};
		
		(global as any).fetch = testFetch;
		
		const { analyzeCode } = await import('../ai/aiClient.js');
		
		const context: diffContext = {
			branchName: 'test',
			diffText: '+ test'
		};
		
		await analyzeCode(context);
		
		assert.strictEqual(
			requestBody?.model,
			'minimax/minimax-m2.5',
			'Should use minimax model'
		);
	});

	test('analyzeCode should pass prompt in request', async () => {
		let requestBody: any = null;
		
		const testFetch = async (url: string, options?: any): Promise<any> => {
			requestBody = JSON.parse(options?.body || '{}');
			return {
				ok: true,
				json: async () => ({ choices: [{ message: { content: '[]' } }] })
			};
		};
		
		(global as any).fetch = testFetch;
		
		const { analyzeCode } = await import('../ai/aiClient.js');
		
		const context: diffContext = {
			branchName: 'feature/test',
			diffText: '+ const newCode = true;'
		};
		
		await analyzeCode(context);
		
		assert.ok(
			requestBody?.messages,
			'Should include messages in request'
		);
		assert.strictEqual(
			requestBody?.messages?.length,
			2,
			'Should have system and user messages'
		);
	});

	test('analyzeCode should throw on HTTP error', async () => {
		const errorFetch = async (): Promise<any> => {
			return {
				ok: false,
				status: 500
			};
		};
		
		(global as any).fetch = errorFetch;
		
		const { analyzeCode } = await import('../ai/aiClient.js');
		
		const context: diffContext = {
			branchName: 'test',
			diffText: '+ test'
		};
		
		let threwError = false;
		try {
			await analyzeCode(context);
		} catch (error: any) {
			threwError = true;
			assert.ok(
				error.message.includes('500'),
				'Error should include status code'
			);
		}
		
		assert.ok(threwError, 'Should throw on HTTP error');
	});

	test('analyzeCode should return parsed response', async () => {
		const { analyzeCode } = await import('../ai/aiClient.js');
		
		const context: diffContext = {
			branchName: 'test',
			diffText: '+ const x = 1;'
		};
		
		const result = await analyzeCode(context);
		
		assert.ok(result, 'Should return result');
		assert.ok(result.choices, 'Should have choices array');
	});
});
