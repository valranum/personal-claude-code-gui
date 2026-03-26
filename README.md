# Claude for Designers

Chat and code with Claude. Point it at any project folder and use Claude to read files, write code, run commands, search the web, and more — all through a clean UI instead of a terminal.

## Get Started

You need **Node.js 18+** and an **Anthropic API key**. If you don't have Node.js, download it from [nodejs.org](https://nodejs.org). Get an API key at [console.anthropic.com](https://console.anthropic.com).

### Quick Setup

```bash
git clone https://github.com/valranum/personal-claude-code-gui.git
cd personal-claude-code-gui
./setup.sh
```

The setup script installs dependencies and walks you through setting your API key. Once it's done, run:

```bash
npm run dev
```

Then open **http://localhost:5173** in your browser.

### Manual Setup

If you prefer to do it step by step:

```bash
git clone https://github.com/valranum/personal-claude-code-gui.git
cd personal-claude-code-gui
npm install
export ANTHROPIC_API_KEY=sk-ant-...    # your key here
npm run dev
```

To make the API key permanent so you don't have to set it every time, add `export ANTHROPIC_API_KEY=sk-ant-...` to your `~/.zshrc` (Mac) or `~/.bashrc` (Linux) file.

## How It Works

When you open the app, you'll see a welcome screen asking you to pick a project folder. This tells Claude where to work — it can read and edit files, run commands, and navigate within that folder. You can also skip this and start chatting without a folder.

Once a folder is selected, you're in a chat. Type a message, press Enter, and Claude will respond. It can:

- **Read and edit your code** — Claude sees your files and can make changes directly.
- **Run shell commands** — things like `npm install`, `git status`, tests, etc.
- **Search your codebase** — find files by name or search contents by keyword.
- **Search the web** — look things up when it needs current information.

## Features

### Models

Switch between Claude models using the model selector at the bottom of the chat input box. Available models include Opus 4.6, Sonnet 4.6, Sonnet 4, and Haiku 4.5. The default is Opus 4.6.

### Image Upload

Attach images to your messages by clicking the image icon at the bottom-left of the chat input, or drag and drop images directly into the text area.

### Code Artifacts

When Claude includes code blocks in a response, they appear as clickable cards. Click a card to open the code in a side panel with full syntax highlighting, line numbers, and a copy button — similar to artifacts on Claude's web interface.

### File Tree

The sidebar has a **Files** tab that shows the project's file and folder structure. Directories are expandable and lazy-loaded. The tree skips hidden files and `node_modules`.

### Favorites

Favorite important conversations to keep them at the top of the sidebar. Hover over a conversation and click the star icon. Favorites appear in a "Starred" group above the rest.

### Settings

Click the gear icon in the top-right to access settings: toggle light/dark mode and visit the GitHub repo.

### Streaming Markdown

Claude's responses stream in as formatted Markdown with a pulsing cursor, so you see headings, bold text, lists, and code blocks forming in real time rather than raw text.

### Slash Commands

Type `/` in the chat input to see available commands:

- `/clear` — Reset conversation context and start fresh.
- `/compact` — Summarize the conversation to free up context window space.
- `/usage` — Check token usage. Supports scopes: `/usage week`, `/usage month`, `/usage 14` (custom number of days), or just `/usage` for the current conversation.

### Command Palette

Press **⌘K** (or Ctrl+K) to open the command palette for quick access to actions: new chat, toggle sidebar, toggle theme, switch models, export conversations, share, and jump to recent conversations.

### Sharing

Click the **Share** button next to Retry at the bottom of a conversation to create a read-only snapshot link. The link is copied to your clipboard and anyone with access to the server can view the shared conversation in their browser.

### Export

Export any conversation as Markdown or JSON. Available from the sidebar (hover over a conversation to see the export icon) or through the command palette.

### Search

The sidebar search searches across both conversation titles and message content. Results show where the match was found, with a context snippet for message-content matches.

### Auto-Compact Suggestion

When a conversation uses more than 75% of the context window (~150k tokens), a banner suggests compacting the conversation to free up space. Click "Compact now" or dismiss it.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Enter** | Send message |
| **Shift+Enter** | New line |
| **Esc** | Stop generation |
| **⌘N** / Ctrl+N | New conversation |
| **⌘B** / Ctrl+B | Toggle sidebar |
| **⌘K** / Ctrl+K | Command palette |

### Other

- Click the folder path at the top of the chat to change which folder Claude is working in.
- **Tool calls** (file reads, shell commands, etc.) appear as collapsible blocks — click to see details.
- Conversations auto-save and persist across restarts.
- **Diff viewer** for file edits shows changes as syntax-highlighted diffs.
- **Error boundaries** and **toast notifications** surface issues instead of failing silently.

## Important to Know

Claude runs with full permissions in whatever folder you point it at. It can read, create, edit, and delete files, and run any shell command. This is by design — it makes for a smooth coding experience — but be aware of it. Avoid pointing it at its own project folder if you're asking it to build something, as it may overwrite the app's own files.

## Available Tools

| Tool | What it does |
|------|-------------|
| Read | Read file contents |
| Write | Create new files |
| Edit | Make precise edits to existing files |
| Bash | Run shell commands |
| Glob | Find files by name pattern |
| Grep | Search file contents |
| WebSearch | Search the web |
| WebFetch | Fetch and read web pages |

## Troubleshooting

**The server won't start** — Make sure port 3001 isn't in use (`lsof -i :3001`) and your API key is set (`echo $ANTHROPIC_API_KEY`).

**Messages aren't sending** — Check the terminal for errors. Verify your API key is valid and has credits.

**How do I stop it?** — Press Ctrl+C in the terminal.

## Where Is My Data?

- **Conversations** are saved as JSON files in `data/conversations/`. They're gitignored so they won't be committed.
- **Shared conversation snapshots** are saved in `data/shared/`. Also gitignored.
- You can back up or delete either folder freely.

## Project Structure

```
claude-for-designers/
├── server/                  # Backend (Express + Claude Agent SDK)
│   ├── index.ts             # API routes, SSE streaming, share/export/search endpoints
│   ├── agent-session.ts     # Claude Agent SDK wrapper with abort support
│   ├── conversation-store.ts# Conversation persistence
│   ├── session-manager.ts   # Active session tracking
│   └── types.ts
├── src/                     # Frontend (React + Vite + TypeScript)
│   ├── App.tsx              # Main app with command palette, theme, layout
│   ├── App.css              # All styles
│   ├── components/          # UI components
│   │   ├── ArtifactPanel    # Side panel for viewing code artifacts
│   │   ├── ChatInput        # Message input with slash commands, image upload, model selector
│   │   ├── ChatView         # Main chat area with artifact split layout
│   │   ├── CommandPalette   # ⌘K command palette
│   │   ├── CompactSuggestionBanner
│   │   ├── DiffViewer       # Syntax-highlighted diff display
│   │   ├── FileTree         # Workspace file/folder tree viewer
│   │   ├── MessageBubble    # Message rendering with code cards
│   │   ├── MessageList      # Message list with retry/share actions
│   │   ├── Sidebar          # Conversation list, search, export, favorites, file tree
│   │   ├── ToolCallBlock    # Collapsible tool call display
│   │   └── WorkspaceBar     # Folder selector, settings dropdown
│   ├── hooks/               # React hooks (useChat, useConversations, useToast)
│   ├── types/               # TypeScript types
│   └── utils/               # Helpers (SSE, time formatting)
├── data/conversations/      # Saved conversations (gitignored)
├── data/shared/             # Shared conversation snapshots (gitignored)
├── package.json
├── vite.config.ts
└── tsconfig.json
```
