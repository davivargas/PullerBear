# 🐻‍❄️ PullerBear

PullerBear is a VS Code extension that watches your Git remote, summarizes incoming commits with AI, and gives you a chat interface to ask follow-up questions before you pull.

## What it does

- Monitors your repository on an interval and fetches remote updates.
- Detects when your branch is behind a target remote branch.
- Generates an AI summary of incoming changes.
- Shows summaries in a dedicated sidebar view: **PullerBear → What's New**.
- Lets you manually refresh with the reload button.
- Provides a chat box to ask questions about recent commit reviews.
- Clears summaries/chat review data after a detected pull/update.

## Requirements

- VS Code `1.110.0` or newer.
- Built-in Git extension enabled (`vscode.git`).
- Network access to `https://openrouter.ai`.
- OpenRouter API key (set in `pullerBear.apiKey`).

## IMPORTANT NOTE

This application uses "openrouter/free" as default AI model from openrouter, but for better performance,
you should use a more recent and capable model (have in mind that these are paid).

## Installation

1. Paste your ApiKey into the pullerBearConfig.ts file now or set it on settings.json later (extension settings)
2. Package the extension:
   - `npm install`
   - `npx vsce package`
     Note: If see **WARNING LICENSE, LICENSE.md, or LICENSE.txt not found**, please answer **y** to continue.
3. Download the packaged link to your local device.
4. In VS Code, open Extensions view.
5. Click `...` (top-right) → **Install from VSIX...**
6. Select the downloaded `.vsix` file.
7. In the left side bar, still on Extensions tab, look for **PullerBear** on search bar and click it.

## Quick start

1. Open a Git repository in VS Code.
2. Open the PullerBear activity bar icon.
3. In **What's New**, wait for automatic checks or click the reload icon.
4. When remote commits are detected, read the generated summary cards.
5. Use the chat box at the bottom to ask questions about the latest reviews.

## Extension settings

Configure in **Settings** (`Ctrl + ,`), by searching `PullerBear` in extensions section, or in `settings.json`.

| Setting                              | Type     |  Default | Description                                                                       |
| ------------------------------------ | -------- | -------: | --------------------------------------------------------------------------------- |
| `pullerBear.fetchIntervalMinutes`    | `number` |     `10` | How often PullerBear checks for remote updates.                                   |
| `pullerBear.commitWindowMinutes`     | `number` |     `60` | Time window used to measure incoming commit volume.                               |
| `pullerBear.warningCommitThreshold`  | `number` |      `2` | Shows a warning prompt above this commit volume.                                  |
| `pullerBear.hardStopCommitThreshold` | `number` |      `5` | Stops summarization at/above this commit volume.                                  |
| `pullerBear.branchRef`               | `string` | `"main"` | Target remote branch to compare against (e.g. `main`, `upstream`, `origin/main`). |
| `pullerBear.apiKey`                  | `string` |     `""` | OpenRouter API key used for AI summarization/Q&A.                                 |

### Example `settings.json`

```json
{
  "pullerBear.fetchIntervalMinutes": 5,
  "pullerBear.commitWindowMinutes": 60,
  "pullerBear.warningCommitThreshold": 3,
  "pullerBear.hardStopCommitThreshold": 8,
  "pullerBear.branchRef": "main",
  "pullerBear.apiKey": "sk-or-v1-..."
}
```

## How PullerBear behaves

### Automatic monitoring

- PullerBear fetches remote data at your configured interval.
- If you're behind the target branch, it computes incoming changes and generates a summary.

### Manual refresh

- Click the reload icon in the **What's New** header.
- This triggers an immediate manual check for all monitored repositories.

### Threshold protection

- If incoming activity is too high, PullerBear warns or stops summarization based on your thresholds.
- This avoids low-signal AI output during very high commit volume periods.

### Pull detection and cleanup

- When PullerBear detects your local `HEAD` moved forward and behind count dropped, it treats it as a pull/sync.
- It clears current summary cards and resets `pullerBear_reviews.json`.

### Chat/Q&A

- The input at the bottom sends your question to PullerBear.
- PullerBear answers based on stored review data.
- If AI fails or the API key is missing, an error is shown in chat.

## Data and privacy notes

- Diff content and questions are sent to OpenRouter for AI processing.
- PullerBear writes review data to `pullerBear_reviews.json` in your workspace root.
- Treat this file as generated data; decide whether to add it to `.gitignore` based on your workflow.

## Troubleshooting

### "No API key configured"

- Set `pullerBear.apiKey` in VS Code settings.
- Reload VS Code window after updating if needed.

### "Failed to fetch from remote"

- Check network connectivity and Git authentication.
- Run `git fetch` manually in terminal to confirm credentials.

### No summaries appear

- Ensure your branch is behind `pullerBear.branchRef`.
- Click reload to force a manual check.
- Lower thresholds if summaries are being blocked by activity limits.

### PullerBear view does not show

- Confirm built-in Git extension is enabled.
- Ensure you're in a folder/workspace with a Git repository.

## Development

```bash
npm install
npm run compile
npm test
```

Useful scripts:

- `npm run compile` – typecheck + lint + bundle.
- `npm run watch` – watch TypeScript and bundle rebuilds.
- `npm run package` – production bundle.
- `npm run test` – run extension tests.

Run extension locally:

1. Open this project in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. Open a Git repo in the new window and use PullerBear.

## Packaging and publishing

```bash
npx vsce package
```

For Marketplace publishing, set a `publisher` in `package.json`, authenticate with `vsce`, and run `npx vsce publish`.

## Known limitations

- Summary quality depends on diff quality and AI response consistency.
- Large/high-frequency repos may hit threshold stops by design.
- Network/API outages will fall back to non-AI status messaging.

---

If you find issues or want feature enhancements, open an issue in the project repository.
