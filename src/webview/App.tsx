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
    const [isReloadHovered, setIsReloadHovered] = useState(false);

    useEffect(() => {
        // Tell the extension we are ready to receive data
        vscode.postMessage({ type: 'ready' });

        const handler = (event: MessageEvent) => {
            const msg = event.data;
            if (msg.type === 'summaries') {
                setSummaries(msg.data);
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    return (
        <div style={styles.container}>
            <div style={styles.content}>
                <header style={styles.header}>
                    <div style={styles.headerLeft}>
                        <span style={styles.bear}>🐻‍❄️</span>
                        <h1 style={styles.title}>What's New</h1>
                    </div>
                    <button
                        type="button"
                        style={{
                            ...styles.reloadButton,
                            border: isReloadHovered
                                ? '1px solid var(--vscode-panel-border)'
                                : '1px solid transparent'
                        }}
                        onMouseEnter={() => setIsReloadHovered(true)}
                        onMouseLeave={() => setIsReloadHovered(false)}
                        onClick={() => vscode.postMessage({ type: 'refresh' })}
                        title="Refresh commits"
                        aria-label="Refresh commits"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                            <polyline points="21 3 21 9 15 9" />
                        </svg>
                    </button>
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

{/* Input functionality reserved for future implementation
            <div style={styles.inputContainer}>
                <input
                    type="text"
                    placeholder="Ask a question about the commits"
                    style={styles.input}
                />
                <button style={styles.button}>Send</button>
            </div>
            */}
        </div>
    );
}

/** Minimal inline markdown → HTML converter for the summary field */
function escapeHtml(text: string): string
{
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
}

function markdownToHtml(md: string): string {
    // First escape HTML to prevent XSS
    let escaped = escapeHtml(md);
    // Then apply markdown transformations
    return escaped
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
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        boxSizing: 'border-box',
    },
    content: {
        flex: 1,
        overflowY: 'auto',
        padding: '12px',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
        borderBottom: '1px solid var(--vscode-panel-border)',
        paddingBottom: '8px',
    },
    headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    bear: {
        fontSize: '20px',
        lineHeight: 1,
    },
    title: {
        margin: 0,
        fontSize: '14px',
        fontWeight: 600,
        color: 'var(--vscode-foreground)',
    },
    reloadButton: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '24px',
        height: '24px',
        padding: 0,
        border: '1px solid transparent',
        borderRadius: '4px',
        background: 'transparent',
        color: 'var(--vscode-foreground)',
        cursor: 'pointer',
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
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: 3,
        textOverflow: 'ellipsis',
    },
    summary: {
        fontSize: '12px',
        color: 'var(--vscode-descriptionForeground)',
        lineHeight: 1.6,
    },
    inputContainer: {
        padding: '12px',
        borderTop: '1px solid var(--vscode-panel-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        background: 'var(--vscode-sideBar-background)',
    },
    input: {
        background: 'var(--vscode-input-background)',
        color: 'var(--vscode-input-foreground)',
        border: '1px solid var(--vscode-input-border)',
        padding: '6px 8px',
        fontSize: '12px',
        fontFamily: 'inherit',
        borderRadius: '2px',
        outline: 'none',
    },
    button: {
        background: 'var(--vscode-button-background)',
        color: 'var(--vscode-button-foreground)',
        border: 'none',
        padding: '6px 12px',
        fontSize: '12px',
        cursor: 'pointer',
        borderRadius: '2px',
        fontWeight: 600,
    }
};

