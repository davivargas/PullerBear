import React, { useEffect, useState } from 'react';

interface CommitSummary {
    hash: string;
    message: string;
    summary: string;
    timestamp: number;
}

// Acquire VS Code API for postMessage communication
declare function acquireVsCodeApi(): {
    postMessage: (msg: unknown) => void;
    getState: () => unknown;
    setState: (state: unknown) => void;
};
const vscode = acquireVsCodeApi();

export function App() {
    const [summaries, setSummaries] = useState<CommitSummary[]>([]);

    useEffect(() => {
        // Tell the extension we are ready to receive data
        vscode.postMessage({ type: 'ready' });

        const handler = (event: MessageEvent) => {
            const msg = event.data;
            if (msg.type === 'summaries') {
                setSummaries(msg.data as CommitSummary[]);
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <span style={styles.bear}>🐻‍❄️</span>
                <h1 style={styles.title}>What's New</h1>
            </header>

            {summaries.length === 0 ? (
                <div style={styles.empty}>
                    <p>All caught up! PullerBear will notify you when new commits arrive.</p>
                </div>
            ) : (
                <ul style={styles.list}>
                    {summaries.map((s) => (
                        <li key={s.hash} style={styles.card}>
                            <div style={styles.cardHeader}>
                                <code style={styles.hash}>{s.hash.slice(0, 7)}</code>
                                <span style={styles.date}>
                                    {new Date(s.timestamp).toLocaleString()}
                                </span>
                            </div>
                            <p style={styles.commitMsg}>{s.message}</p>
                            <div
                                style={styles.summary}
                                dangerouslySetInnerHTML={{ __html: markdownToHtml(s.summary) }}
                            />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/** Minimal inline markdown → HTML converter for the summary field */
function markdownToHtml(md: string): string {
    return md
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gms, '<ul>$1</ul>')
        .replace(/\n/g, '<br/>');
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        fontFamily: 'var(--vscode-font-family)',
        color: 'var(--vscode-foreground)',
        padding: '12px',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '16px',
        borderBottom: '1px solid var(--vscode-panel-border)',
        paddingBottom: '8px',
    },
    bear: {
        fontSize: '20px',
    },
    title: {
        margin: 0,
        fontSize: '14px',
        fontWeight: 600,
        color: 'var(--vscode-foreground)',
    },
    empty: {
        color: 'var(--vscode-descriptionForeground)',
        fontSize: '12px',
        textAlign: 'center',
        marginTop: '24px',
    },
    list: {
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
    },
    card: {
        background: 'var(--vscode-editor-background)',
        border: '1px solid var(--vscode-panel-border)',
        borderRadius: '6px',
        padding: '10px 12px',
    },
    cardHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '4px',
    },
    hash: {
        color: 'var(--vscode-textLink-foreground)',
        fontSize: '11px',
        fontFamily: 'var(--vscode-editor-font-family)',
    },
    date: {
        color: 'var(--vscode-descriptionForeground)',
        fontSize: '10px',
    },
    commitMsg: {
        margin: '4px 0 8px',
        fontSize: '12px',
        fontWeight: 600,
    },
    summary: {
        fontSize: '12px',
        color: 'var(--vscode-descriptionForeground)',
        lineHeight: 1.6,
    },
};
