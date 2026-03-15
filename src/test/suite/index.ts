import * as fs from 'fs';
import * as path from 'path';
import Mocha from 'mocha';

function collectTestFiles(directory: string): string[]
{
    const files: string[] = [];
    const entries = fs.readdirSync(directory, { withFileTypes: true });

    for (const entry of entries)
    {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory())
        {
            files.push(...collectTestFiles(fullPath));
            continue;
        }

        if (entry.isFile() && entry.name.endsWith('.test.js'))
        {
            files.push(fullPath);
        }
    }

    return files;
}

export async function run(): Promise<void>
{
    const mocha = new Mocha({
        ui      : 'tdd',
        color   : true,
        timeout : 10000
    });

    const testsRoot = path.resolve(__dirname, '..');
    const files = collectTestFiles(testsRoot);

    for (const file of files)
    {
        mocha.addFile(file);
    }

    await new Promise<void>((resolve, reject) =>
    {
        mocha.run((failures) =>
        {
            if (failures > 0)
            {
                reject(new Error(`${failures} test(s) failed.`));
                return;
            }

            resolve();
        });
    });
}
