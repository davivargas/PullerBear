# Test Overview

This file is a quick human-readable map of what the current test suite covers after the latest expansion.

## Overall Coverage

The suite now covers:

- Extension activation and registration behavior
- Webview provider setup, summary rendering, deduping, refresh, and Q&A message flow
- Webview app initial render contract
- Review-file write, read, and clear behavior
- Git monitor initialization, manual refresh, and pull-detection side effects
- Repository monitor state helpers
- Commit tracking helpers
- Configuration loading defaults
- Prompt construction for both diff review and Q&A
- AI client request behavior for both analysis and commit questions
- AI response parsing and formatting
- Repository-check orchestration, thresholds, deduping, fetch failure, and summarize/publish flow
- Repository helper utilities like target resolution, diff normalization, and fallback summaries
- Workspace state helpers for explained commits
- A user-workflow integration test that simulates activation, summary delivery, refresh, and asking a question

The suite is now a mix of:

- Unit tests for pure helpers
- Integration-style tests around the VS Code extension runtime boundaries
- Workflow-oriented tests that simulate how a user actually interacts with the extension

## Per-File Summary

### `App.test.ts`

Tests:

- Initial render of the webview app using server-side rendering
- Presence of the key empty-state workflow UI

Coverage note:

- Light frontend coverage only. This validates the render contract, not full browser interaction.

### `aiClient.test.ts`

Tests:

- `analyzeCode()` throws when the API key is missing
- `analyzeCode()` sends the expected request and returns model output
- `askAboutCommit()` throws on HTTP failure
- `askAboutCommit()` falls back when the model response is empty

Coverage note:

- Good client-side API behavior coverage without hitting the network.

### `commitTracker.test.ts`

Tests:

- Rolling-window pruning of timestamps
- Adding one timestamp per detected new commit
- Positive-delta commit counting
- Combined prune-and-count behavior
- Default check-result object creation
- No-op behavior when zero commits are added

Coverage note:

- Strong unit coverage for the small helper functions in `src/gitTools/commitTracker.ts`.

### `ExplainerViewProvider.test.ts`

Tests:

- Webview setup during `resolveWebviewView()`
- Sending summaries when the webview sends a `ready` message
- New summaries being prepended in newest-first order
- `hasSummary()` correctness
- Duplicate-summary suppression in `addSummary()`
- `clearSummaries()` pushing an empty list
- Refresh-message handling via `setRefreshHandler()`
- Q&A success path using stored review data
- Q&A error path when AI lookup fails

Coverage note:

- This now covers most extension-side user interactions with the sidebar.

### `extension.test.ts`

Tests:

- Activation registers the sidebar provider
- Activation starts git monitoring
- Activation shows the API-key warning when the key is missing
- Activation stores the one-time API-key warning flag
- Activation wires the refresh handler returned by `gitMonitor()`
- `deactivate()` remains a no-op

Coverage note:

- Good high-level extension wiring coverage.

### `fileWrite.test.ts`

Tests:

- Early return when no workspace is open
- Creating a new review file when no previous file exists
- Appending new review entries onto an existing array
- Recovering safely when the existing JSON content is not an array
- `readReviewFile()` with no workspace
- `readReviewFile()` success path
- `readReviewFile()` failure fallback
- `clearReviewFile()` success path

Coverage note:

- Good coverage for the current review-file lifecycle in `src/utl/fileWrite.ts`.

### `gitMonitor.test.ts`

Tests:

- Error path when the built-in Git extension is unavailable
- Initial monitor setup for already-open repositories
- Monitor setup for repositories opened later
- Re-check scheduling on configuration changes
- Manual refresh across all monitored repositories
- Pull-detection behavior clearing summaries and review data

Coverage note:

- Good integration-style coverage around repository monitoring and user refresh workflow.

### `gitState.test.ts`

Tests:

- Creating initial repo state from `HEAD`
- Creating and reusing repo state entries in the `WeakMap`
- Updating state fields through helper mutators
- Clearing active interval handles

Coverage note:

- Aligned with the current `gitState.ts` API surface.

### `parser.test.ts`

Tests:

- Empty-response fallback message
- Formatting info/warning/error analysis entries for human-readable output

Coverage note:

- Covers the current parsing and display-format behavior in `src/ai/parser.ts`.

### `promptBuilder.test.ts`

Tests:

- Diff-review prompt shape contains system and user messages
- System message includes the JSON-output contract
- User prompt includes branch name and diff text
- Q&A prompt shape and content

Coverage note:

- Good coverage for both prompt-building entry points.

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
- Target commit hash lookup via branch and refs fallback
- Diff normalization for string/array/object payloads
- Warning/hard-stop threshold helpers
- API-key-specific fallback summary messaging

Coverage note:

- Good helper-level coverage around the branch-target and summary plumbing.

### `repositoryChecker.runAIAnalysis.test.ts`

Tests:

- Successful AI-analysis path using JSON-string model output
- Diff range generation for target-branch comparison
- Fallback summary creation when AI analysis fails
- Behavior when only normalized API diff output is available

Coverage note:

- Covers the key analysis success/failure branches without requiring a live API call.

### `stateManager.test.ts`

Tests:

- Reading empty explained-commit state
- Appending new explained commit hashes
- Filtering out already-explained hashes
- Avoiding duplicate state writes for an already-known hash

Coverage note:

- Good lightweight coverage for workspace-state persistence helpers.

### `userWorkflow.e2e.test.ts`

Tests:

- Activation capturing the real provider
- Resolving the webview
- Delivering a summary to the UI
- Triggering a manual refresh through the sidebar
- Asking a question about commits and receiving an answer

Coverage note:

- This is the closest current test to a real user workflow inside the extension host.

## What Is Covered Well

- Core business logic
- Most repository-checking branches
- Sidebar summary lifecycle
- Review-file persistence lifecycle
- API-client error handling and request shape
- Extension activation wiring
- Manual refresh and question-asking workflow

## Remaining Gaps

These areas still deserve attention before calling coverage “complete”:

- Real browser-level interaction tests for the React webview app
- A true end-to-end test using an actual Git repository on disk instead of repository mocks
- A live extension-host workflow test proving config changes reconfigure timers correctly end to end
- More direct tests for `gitMonitor` repository-close cleanup
- More direct tests for `clearReviewFile()` and `writeToFile()` error logging branches
- More direct tests for malformed AI JSON beyond the current parser and fallback cases
- Real network-contract tests for OpenRouter responses, if you want pre-release confidence beyond mocks
- A deployment-time smoke test in a packaged VSIX, not just the development extension host

## Practical Confidence Level

- High confidence in helper logic and most orchestration branches
- Medium-high confidence in extension-side user workflow, because we now simulate refresh and Q&A flows
- Medium confidence in frontend runtime behavior, because we only validate initial render and extension-side messaging
- Medium confidence in full end-to-end Git integration, because repository behavior is still mocked rather than exercised against a real repo
