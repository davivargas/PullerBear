import * as assert from 'assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

suite('webview App', () =>
{
    test('renders the initial empty-state workflow UI', async () =>
    {
        const originalAcquire = (globalThis as typeof globalThis & { acquireVsCodeApi?: unknown }).acquireVsCodeApi;
        Object.defineProperty(globalThis, 'acquireVsCodeApi', {
            configurable : true,
            value        : () => ({
                postMessage : (_msg: unknown): void => undefined,
                getState    : (): unknown => undefined,
                setState    : (_state: unknown): void => undefined
            })
        });

        try
        {
            const { App } = await import('../webview/App.js');
            const markup = renderToStaticMarkup(React.createElement(App));

            assert.match(markup, /What&#x27;s New|What&#39;s New|What&apos;s New|What's New/);
            assert.match(markup, /All caught up!/);
            assert.match(markup, /Ask about commits/);
            assert.match(markup, /Send/);
        }
        finally
        {
            if (originalAcquire === undefined)
            {
                delete (globalThis as typeof globalThis & { acquireVsCodeApi?: unknown }).acquireVsCodeApi;
            }
            else
            {
                Object.defineProperty(globalThis, 'acquireVsCodeApi', {
                    configurable : true,
                    value        : originalAcquire
                });
            }
        }
    });
});
