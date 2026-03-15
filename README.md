# PullerBear

A VS Code extension that notifies you to do a git pull when you first open a project. It also explains what you just pulled and warns about any potential errors.

## Features

- **Automatic Pull Notifications**: Get notified when you open a project that has remote changes to pull
- **Pull Explanation**: Understand what changes were pulled with AI-powered explanations
- **Error Warnings**: Get warned about potential conflicts or issues before pulling
- **Sidebar Integration**: View pull details in a dedicated sidebar panel
- **Configurable Monitoring**: Adjust how often PullerBear checks for remote changes

## Requirements

- Visual Studio Code ^1.110.0
- Git extension (built into VS Code)
- An OpenRouter API key (for AI-powered explanations)

## Extension Settings

PullerBear contributes the following settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `pullerbear.fetchIntervalMinutes` | 5 | How often PullerBear checks the remote repository for changes (in minutes) |
| `pullerbear.commitWindowMinutes` | 60 | Rolling time window, in minutes, used to count incoming commits |
| `pullerbear.warningCommitThreshold` | 2 | If incoming commits exceed this value, PullerBear asks for confirmation before summarizing |
| `pullerbear.hardStopCommitThreshold` | 5 | If incoming commits reach this value, PullerBear pauses summarization until the time window resets |

## Getting Started

1. Install PullerBear from the VS Code Marketplace
2. Open a Git repository in VS Code
3. PullerBear will automatically start monitoring for remote changes
4. When changes are detected, you'll receive a notification to pull
5. After pulling, view the explanation in the PullerBear sidebar

## Architecture

PullerBear consists of several components:

- **Git Monitor** (`src/gitTools/gitMonitor.ts`): Monitors remote repositories for changes
- **Repository Checker** (`src/gitTools/repositoryChecker.ts`): Checks repository status and detects incoming commits
- **Git State** (`src/gitTools/gitState.ts`): Manages git state and tracks changes
- **AI Client** (`src/ai/aiClient.ts`): Provides AI-powered explanations of pulled changes
- **Webview** (`src/webview/App.tsx`): Sidebar UI for displaying pull information

## Release Notes

### 0.0.1

Initial release of PullerBear

---

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests on the GitHub repository.

## License

MIT

**Enjoy!**
