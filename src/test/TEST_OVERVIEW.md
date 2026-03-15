# Test Overview

This file is a quick map of what the current test suite covers.

## Overall Coverage

The suite currently covers:

- Core commit-tracking helpers
- Sidebar/webview summary behavior
- Extension activation behavior
- File persistence behavior for review output
- Git monitor initialization behavior
- Repository monitor state helpers
- Prompt construction
- Configuration loading
- Repository checking flow, including warning and hard-stop paths
- Repository helper functions and AI-analysis flow
- Workspace state helpers for explained commits

The suite is strongest around pure logic and orchestration behavior. It uses mocks heavily for VS Code APIs and repository objects.

## Per-File Summary

### `commitTracker.test.ts`

Tests:

- Rolling-window pruning of timestamps
- Adding one timestamp per detected new commit
- Positive-delta commit counting
- Combined prune-and-count behavior
- Default check-result object creation
- No-op behavior when zero commits are added

Coverage note:

- Good unit coverage for the small helper functions in `src/gitTools/commitTracker.ts`.

### `ExplainerViewProvider.test.ts`

Tests:

- Webview setup during `resolveWebviewView`
- Sending summaries when the webview sends a `ready` message
- New summaries being prepended in newest-first order
- `hasSummary()` correctness
- Duplicate-summary suppression in `addSummary()`

Coverage note:

- Covers the main summary-list behavior and the dedupe path that other features depend on.

### `extension.test.ts`

Tests:

- Activation registers the sidebar provider
- Activation starts git monitoring
- Activation shows the API-key warning when the key is missing
- Activation stores the one-time API-key warning flag
- `deactivate()` remains a no-op

Coverage note:

- Good high-level activation coverage without requiring a full VS Code runtime.

### `fileWrite.test.ts`

Tests:

- Early return when no workspace is open
- Creating a new review file when no previous file exists
- Appending new review entries onto an existing array
- Recovering safely when the existing JSON content is not an array

Coverage note:

- Good coverage for the current success and recovery paths in `src/utl/fileWrite.ts`.

### `gitMonitor.test.ts`

Tests:

- Error path when the built-in Git extension is unavailable
- Initial monitor setup for already-open repositories
- Monitor setup for repositories opened later
- Re-check scheduling on configuration changes

Coverage note:

- Covers monitor bootstrapping and event wiring, using mocked repository events and timers.

### `gitState.test.ts`

Tests:

- Creating initial repo state from `HEAD`
- Creating and reusing repo state entries in the `WeakMap`
- Updating state fields through helper mutators
- Clearing active interval handles

Coverage note:

- Aligned with the current `gitState.ts` API surface.

### `promptBuilder.test.ts`

Tests:

- Prompt shape contains system and user messages
- System message includes the JSON-output contract
- User prompt includes branch name and diff text

Coverage note:

- Good sanity coverage for prompt structure, though not deep semantic validation.

### `pullerBearConfig.test.ts`

Tests:

- Reading expected settings from VS Code config
- Using the current fallback defaults
- Returning the `apiKey` field alongside monitor settings

Coverage note:

- Covers config shape and default values well.

### `repositoryChecker.checkRepository.test.ts`

Tests:

- Skipping when a check is already queued
- Manual “all caught up” path
- Hard-stop threshold path
- Warning prompt cancel path
- Successful summarize-and-publish flow
- Dedup skip when a summary already exists
- Warning path when fetch fails

Coverage note:

- This is one of the most important files in the suite because it covers the main orchestration flow in `src/gitTools/repositoryChecker.ts`.

### `repositoryChecker.helpers.test.ts`

Tests:

- Upstream detection
- Target-branch resolution helpers
- Current-upstream matching
- User-facing information/warning helper messages
- Summary object builders
- Target commit hash lookup
- Warning/hard-stop threshold helpers

Coverage note:

- Good helper-level coverage around the branch-target and summary plumbing.

### `repositoryChecker.runAIAnalysis.test.ts`

Tests:

- Successful AI-analysis path using returned content
- Diff range generation for target branch comparison
- Fallback summary creation when AI analysis fails

Coverage note:

- Covers the key success/failure behavior without requiring a live API call.

### `stateManager.test.ts`

Tests:

- Reading empty explained-commit state
- Appending new explained commit hashes
- Filtering out already-explained hashes
- Avoiding duplicate state writes for an already-known hash

Coverage note:

- Good lightweight coverage for workspace-state persistence helpers.

## Potential Gaps

These are areas that still look worth testing more deeply:

- `gitMonitor` pull-detection behavior when `HEAD` changes and summaries should be cleared
- Manual checks against configured non-upstream branches
- `getTargetCommitHash()` fallback behavior when `repository.getBranch()` fails and refs must be searched
- `normalizeDiffPayload()` behavior for array/object diff payloads beyond the current happy path
- `getDiffFromGitCli()` fallback behavior when Git returns a real patch versus an error
- `repositoryChecker` behavior when `provider.addSummary()` or `writeToFile()` throws
- API-key-specific fallback messaging in `createFallbackSummary()`
- `ExplainerViewProvider.clearSummaries()` explicitly clearing and pushing an empty list
- `fileWrite()` behavior when JSON parsing fails entirely, not just when content is a non-array object

## Practical Confidence Level

- High confidence in helper logic and most orchestration branches
- Medium confidence in VS Code event integration, because those tests rely on mocks
- Medium confidence in end-to-end Git/VS Code host behavior, because the suite is not a full integration test of a real repository and real extension host state transitions
