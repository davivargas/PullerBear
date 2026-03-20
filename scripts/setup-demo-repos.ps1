[CmdletBinding()]
param(
    [string]$Root = (Join-Path $HOME 'Desktop\PullerBearDemo'),
    [string]$ApiKey = '',
    [string]$GitUserName = 'PullerBear Demo',
    [string]$GitUserEmail = 'pullerbear-demo@example.com',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Write-Section {
    param([string]$Message)
    Write-Host ""
    Write-Host "== $Message ==" -ForegroundColor Cyan
}

function Write-File {
    param(
        [string]$Path,
        [string]$Content
    )

    $directory = Split-Path -Parent $Path
    if ($directory) {
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }

    Set-Content -Path $Path -Value $Content -Encoding utf8
}

function Invoke-Git {
    param(
        [string]$RepositoryPath,
        [string[]]$Arguments
    )

    Push-Location $RepositoryPath
    try {
        & git @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "git $($Arguments -join ' ') failed in $RepositoryPath"
        }
    }
    finally {
        Pop-Location
    }
}

function Ensure-GitIdentity {
    param(
        [string]$RepositoryPath,
        [string]$DefaultName,
        [string]$DefaultEmail
    )

    $currentName = [string](& git -C $RepositoryPath config --get user.name 2>$null)
    $currentEmail = [string](& git -C $RepositoryPath config --get user.email 2>$null)

    if ([string]::IsNullOrWhiteSpace($currentName)) {
        Invoke-Git -RepositoryPath $RepositoryPath -Arguments @('config', 'user.name', $DefaultName)
    }

    if ([string]::IsNullOrWhiteSpace($currentEmail)) {
        Invoke-Git -RepositoryPath $RepositoryPath -Arguments @('config', 'user.email', $DefaultEmail)
    }
}

function Initialize-TeammateBranch {
    param([string]$RepositoryPath)

    $currentBranch = [string](& git -C $RepositoryPath branch --show-current 2>$null)

    if ($currentBranch.Trim() -eq 'main') {
        Invoke-Git -RepositoryPath $RepositoryPath -Arguments @('branch', '--set-upstream-to=origin/main', 'main')
        return
    }

    $hasLocalMain = [string](& git -C $RepositoryPath rev-parse --verify refs/heads/main 2>$null)
    if (-not [string]::IsNullOrWhiteSpace($hasLocalMain)) {
        Invoke-Git -RepositoryPath $RepositoryPath -Arguments @('switch', 'main')
        Invoke-Git -RepositoryPath $RepositoryPath -Arguments @('branch', '--set-upstream-to=origin/main', 'main')
        return
    }

    Invoke-Git -RepositoryPath $RepositoryPath -Arguments @('switch', '--track', 'origin/main')
}

function Write-InitialRepoFiles {
    param([string]$RepositoryPath)

    Write-File -Path (Join-Path $RepositoryPath '.gitignore') -Content @'
.vscode/
pullerBear_reviews.json
node_modules/
dist/
'@

    Write-File -Path (Join-Path $RepositoryPath 'README.md') -Content @'
# Task API Demo

A tiny hand-written TypeScript repo for PullerBear demos.

## Features

- List tasks
- Create a task
- Validate title length

## API shape

### `getTasks()`

Returns an array of tasks.

### `postTask(title)`

Creates a task using the provided title.
'@

    Write-File -Path (Join-Path $RepositoryPath 'package.json') -Content @'
{
  "name": "task-api-demo",
  "version": "1.0.0",
  "private": true,
  "description": "Tiny TypeScript repo for PullerBear demos"
}
'@

    Write-File -Path (Join-Path $RepositoryPath 'src\types.ts') -Content @'
export interface Task {
  id: string;
  title: string;
  completed: boolean;
}

export interface CreateTaskInput {
  title: string;
}
'@

    Write-File -Path (Join-Path $RepositoryPath 'src\validation.ts') -Content @'
import { CreateTaskInput } from "./types";

const MIN_TITLE_LENGTH = 3;
const MAX_TITLE_LENGTH = 60;

export function validateTaskInput(input: CreateTaskInput): void {
  const title = input.title.trim();

  if (title.length < MIN_TITLE_LENGTH) {
    throw new Error(`Title must be at least ${MIN_TITLE_LENGTH} characters.`);
  }

  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(`Title must be at most ${MAX_TITLE_LENGTH} characters.`);
  }
}
'@

    Write-File -Path (Join-Path $RepositoryPath 'src\taskService.ts') -Content @'
import { CreateTaskInput, Task } from "./types";
import { validateTaskInput } from "./validation";

const tasks: Task[] = [
  { id: "1", title: "Draft demo outline", completed: false },
  { id: "2", title: "Record walkthrough", completed: false }
];

export function listTasks(): Task[] {
  return tasks;
}

export function createTask(input: CreateTaskInput): Task {
  validateTaskInput(input);

  const task: Task = {
    id: String(tasks.length + 1),
    title: input.title.trim(),
    completed: false
  };

  tasks.push(task);
  return task;
}
'@

    Write-File -Path (Join-Path $RepositoryPath 'src\index.ts') -Content @'
import { createTask, listTasks } from "./taskService";

export function getTasks() {
  return listTasks();
}

export function postTask(title: string) {
  return createTask({ title });
}
'@
}

function Write-WorkspaceSettings {
    param(
        [string]$RepositoryPath,
        [string]$ApiKeyValue
    )

    $settingsPath = Join-Path $RepositoryPath '.vscode\settings.json'
    $apiKeyLine = if ([string]::IsNullOrWhiteSpace($ApiKeyValue)) {
        '  "pullerBear.apiKey": "replace-with-your-openrouter-key"'
    }
    else {
        "  `"pullerBear.apiKey`": `"$ApiKeyValue`""
    }

    Write-File -Path $settingsPath -Content @"
{
  "pullerBear.branchRef": "main",
  "pullerBear.fetchIntervalMinutes": 60,
  "pullerBear.warningCommitThreshold": 10,
  "pullerBear.hardStopCommitThreshold": 20,
$apiKeyLine
}
"@
}

function Write-CommitScripts {
    param(
        [string]$RootPath,
        [string]$TeammatePath
    )

    $commitOnePath = Join-Path $RootPath 'apply-demo-commit-1.ps1'
    $commitTwoPath = Join-Path $RootPath 'apply-demo-commit-2.ps1'

    Write-File -Path $commitOnePath -Content @"
[CmdletBinding()]
param()

`$ErrorActionPreference = 'Stop'
`$repo = '$TeammatePath'

function Write-File {
    param([string]`$Path, [string]`$Content)
    Set-Content -Path `$Path -Value `$Content -Encoding utf8
}

Push-Location `$repo
try {
    Write-File -Path (Join-Path `$repo 'src\types.ts') -Content @'
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: TaskPriority;
}

export interface CreateTaskInput {
  title: string;
  priority: TaskPriority;
}
'@

    Write-File -Path (Join-Path `$repo 'src\validation.ts') -Content @'
import { CreateTaskInput, TaskPriority } from "./types";

const MIN_TITLE_LENGTH = 3;
const MAX_TITLE_LENGTH = 60;
const VALID_PRIORITIES: TaskPriority[] = ["low", "medium", "high"];

export function validateTaskInput(input: CreateTaskInput): void {
  const title = input.title.trim();

  if (title.length < MIN_TITLE_LENGTH) {
    throw new Error(`Title must be at least ${MIN_TITLE_LENGTH} characters.`);
  }

  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(`Title must be at most ${MAX_TITLE_LENGTH} characters.`);
  }

  if (!VALID_PRIORITIES.includes(input.priority)) {
    throw new Error("Priority must be low, medium, or high.");
  }
}
'@

    Write-File -Path (Join-Path `$repo 'src\taskService.ts') -Content @'
import { CreateTaskInput, Task } from "./types";
import { validateTaskInput } from "./validation";

const tasks: Task[] = [
  { id: "1", title: "Draft demo outline", completed: false, priority: "high" },
  { id: "2", title: "Record walkthrough", completed: false, priority: "medium" }
];

export function listTasks(): Task[] {
  return tasks;
}

export function createTask(input: CreateTaskInput): Task {
  validateTaskInput(input);

  const task: Task = {
    id: String(tasks.length + 1),
    title: input.title.trim(),
    completed: false,
    priority: input.priority
  };

  tasks.push(task);
  return task;
}
'@

    Write-File -Path (Join-Path `$repo 'src\index.ts') -Content @'
import { createTask, listTasks } from "./taskService";
import { TaskPriority } from "./types";

export function getTasks() {
  return listTasks();
}

export function postTask(title: string, priority: TaskPriority) {
  return createTask({ title, priority });
}
'@

    & git add README.md package.json src
    if (`$LASTEXITCODE -ne 0) { throw 'git add failed' }

    & git commit -m 'Add task priority support'
    if (`$LASTEXITCODE -ne 0) { throw 'git commit failed' }

    & git push origin main
    if (`$LASTEXITCODE -ne 0) { throw 'git push failed' }
}
finally {
    Pop-Location
}
"@

    Write-File -Path $commitTwoPath -Content @"
[CmdletBinding()]
param()

`$ErrorActionPreference = 'Stop'
`$repo = '$TeammatePath'

function Write-File {
    param([string]`$Path, [string]`$Content)
    Set-Content -Path `$Path -Value `$Content -Encoding utf8
}

Push-Location `$repo
try {
    Write-File -Path (Join-Path `$repo 'README.md') -Content @'
# Task API Demo

A tiny hand-written TypeScript repo for PullerBear demos.

## Features

- List tasks
- Create a task
- Validate title length
- Track task priority

## API shape

### `getTasks()`

Returns an object with `items` and `count`.

### `postTask(title, priority)`

Creates a task using the provided title and priority.
'@

    Write-File -Path (Join-Path `$repo 'src\index.ts') -Content @'
import { createTask, listTasks } from "./taskService";
import { TaskPriority } from "./types";

export function getTasks() {
  const items = listTasks();

  return {
    items,
    count: items.length
  };
}

export function postTask(title: string, priority: TaskPriority) {
  return createTask({ title, priority });
}
'@

    & git add README.md src\index.ts
    if (`$LASTEXITCODE -ne 0) { throw 'git add failed' }

    & git commit -m 'Change task list response shape'
    if (`$LASTEXITCODE -ne 0) { throw 'git commit failed' }

    & git push origin main
    if (`$LASTEXITCODE -ne 0) { throw 'git push failed' }
}
finally {
    Pop-Location
}
"@
}

function Write-NextSteps {
    param(
        [string]$RootPath,
        [string]$WorkPath,
        [string]$TeammatePath
    )

    Write-File -Path (Join-Path $RootPath 'NEXT-STEPS.txt') -Content @"
1. In PullerBear, press F5 to open the Extension Development Host.
2. In that new VS Code window, open:
   $WorkPath
3. Confirm workspace settings in:
   $WorkPath\.vscode\settings.json
4. In the demo repo, open the PullerBear sidebar and click refresh.
5. When you want new remote commits, run these from PowerShell:
   & '$RootPath\apply-demo-commit-1.ps1'
   & '$RootPath\apply-demo-commit-2.ps1'
6. In the work clone, ask PullerBear questions such as:
   - Which files changed?
   - Is there any breaking change before I pull?
   - Summarize this in one sentence.
7. In the work clone terminal, run:
   git pull
8. Verify PullerBear clears the summary cards and resets pullerBear_reviews.json.

Repositories:
- Remote:   $RootPath\pullerbear-demo-remote.git
- Work:     $WorkPath
- Teammate: $TeammatePath
"@
}

$remotePath = Join-Path $Root 'pullerbear-demo-remote.git'
$workPath = Join-Path $Root 'pullerbear-demo-work'
$teammatePath = Join-Path $Root 'pullerbear-demo-teammate'

Write-Section "Preparing demo root"

if (Test-Path $Root) {
    if (-not $Force) {
        throw "The path '$Root' already exists. Re-run with -Force to replace it."
    }

    Remove-Item -Recurse -Force $Root
}

New-Item -ItemType Directory -Force -Path $Root | Out-Null

Write-Section "Creating bare remote"
& git init --bare $remotePath
if ($LASTEXITCODE -ne 0) {
    throw "git init --bare failed"
}

Write-Section "Cloning working repo"
& git clone $remotePath $workPath
if ($LASTEXITCODE -ne 0) {
    throw "git clone for work repo failed"
}

Ensure-GitIdentity -RepositoryPath $workPath -DefaultName $GitUserName -DefaultEmail $GitUserEmail
Invoke-Git -RepositoryPath $workPath -Arguments @('switch', '-c', 'main')
Write-InitialRepoFiles -RepositoryPath $workPath
Invoke-Git -RepositoryPath $workPath -Arguments @('add', '.')
Invoke-Git -RepositoryPath $workPath -Arguments @('commit', '-m', 'Initial task API demo')
Invoke-Git -RepositoryPath $workPath -Arguments @('push', '-u', 'origin', 'main')
& git --git-dir=$remotePath symbolic-ref HEAD refs/heads/main
if ($LASTEXITCODE -ne 0) {
    throw "failed to set bare remote HEAD to main"
}

Write-WorkspaceSettings -RepositoryPath $workPath -ApiKeyValue $ApiKey

Write-Section "Cloning teammate repo"
& git clone $remotePath $teammatePath
if ($LASTEXITCODE -ne 0) {
    throw "git clone for teammate repo failed"
}

Ensure-GitIdentity -RepositoryPath $teammatePath -DefaultName $GitUserName -DefaultEmail $GitUserEmail
Initialize-TeammateBranch -RepositoryPath $teammatePath

Write-Section "Writing helper scripts"
Write-CommitScripts -RootPath $Root -TeammatePath $teammatePath
Write-NextSteps -RootPath $Root -WorkPath $workPath -TeammatePath $teammatePath

Write-Section "Demo repos are ready"
Write-Host "Remote   : $remotePath"
Write-Host "Work     : $workPath"
Write-Host "Teammate : $teammatePath"
Write-Host ""
Write-Host "Open NEXT-STEPS.txt in $Root for the exact demo flow."
