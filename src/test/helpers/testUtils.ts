import * as assert from 'assert/strict';

type AnyFn = (...args: any[]) => any;

export interface Spy<TArgs extends any[] = any[], TResult = any>
{
    calls: TArgs[];
    implementation: (...args: TArgs) => TResult;
}

export function createSpy<TArgs extends any[] = any[], TResult = any>(
    implementation?: (...args: TArgs) => TResult
): Spy<TArgs, TResult>
{
    const calls: TArgs[] = [];

    return {
        calls,
        implementation: (...args: TArgs): TResult =>
        {
            calls.push(args);
            return implementation ? implementation(...args) : undefined as TResult;
        }
    };
}

export function stubMethod<T extends object, K extends keyof T>(
    target: T,
    key: K,
    replacement: T[K]
): () => void
{
    const original: T[K] = target[key];
    target[key] = replacement;
    return (): void =>
    {
        target[key] = original;
    };
}

export function stubProperty<T extends object, K extends keyof T>(
    target: T,
    key: K,
    value: T[K]
): () => void
{
    const descriptor = Object.getOwnPropertyDescriptor(target, key);

    Object.defineProperty(target, key, {
        configurable : true,
        enumerable   : descriptor?.enumerable ?? true,
        get          : (): T[K] => value
    });

    return (): void =>
    {
        if (descriptor)
        {
            Object.defineProperty(target, key, descriptor);
            return;
        }

        delete target[key];
    };
}

export function stubGlobal<K extends keyof typeof globalThis>(
    key: K,
    replacement: (typeof globalThis)[K]
): () => void
{
    const original = globalThis[key];
    Object.defineProperty(globalThis, key, {
        configurable : true,
        writable     : true,
        value        : replacement
    });

    return (): void =>
    {
        Object.defineProperty(globalThis, key, {
            configurable : true,
            writable     : true,
            value        : original
        });
    };
}

export function withFixedDateNow<T>(value: number, run: () => T): T
{
    const restore = stubMethod(Date, 'now', (() => value) as DateConstructor['now']);

    try
    {
        return run();
    }
    finally
    {
        restore();
    }
}

export function assertCalledTimes(spy: Spy<any[], any>, expected: number): void
{
    assert.equal(spy.calls.length, expected);
}

export function assertCalledWith(spy: Spy<any[], any>, index: number, ...expected: any[]): void
{
    assert.deepEqual(spy.calls[index], expected);
}

export function createDisposable(onDispose?: () => void): { dispose: () => void }
{
    return {
        dispose: (): void =>
        {
            onDispose?.();
        }
    };
}
