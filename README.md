# Claude Code GUI

A browser-based coding assistant powered by Claude. Point it at any project folder and chat with Claude to read files, write code, run commands, search the web, and more — all through a clean UI instead of a terminal.

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

When you open the app, you'll see a welcome screen asking you to pick a project folder. This tells Claude where to work — it can read and edit files, run commands, and navigate within that folder.

Once a folder is selected, you're in a chat. Type a message, press Enter, and Claude will respond. It can:

- **Read and edit your code** — Claude sees your files and can make changes directly.
- **Run shell commands** — things like `npm install`, `git status`, tests, etc.
- **Search your codebase** — find files by name or search contents by keyword.
- **Search the web** — look things up when it needs current information.

### Tips

- **Enter** sends a message. **Shift+Enter** adds a new line.
- **Esc** stops Claude mid-response.
- **⌘N** (or Ctrl+N) starts a new conversation.
- **⌘B** (or Ctrl+B) toggles the sidebar.
- Click the folder path at the top of the chat to change which folder Claude is working in.
- Claude's responses include **syntax-highlighted code blocks** with a copy button.
- **Tool calls** (file reads, shell commands, etc.) appear as collapsible blocks — click to see details.
- Conversations auto-save and persist across restarts.
- Use the **light/dark mode toggle** in the sidebar.

## Important to Know

Claude runs with full permissions in whatever folder you point it at. It can read, create, edit, and delete files, and run any shell command. This is by design — it makes for a smooth coding experience — but be aware of it.

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

Conversations are saved as JSON files in `data/conversations/`. You can back them up or delete them. They're gitignored so they won't be committed.

## Project Structure

```
claude-code-gui/
├── server/                  # Backend (Express + Claude Agent SDK)
│   ├── index.ts             # API routes and SSE streaming
│   ├── agent-session.ts     # Claude Agent SDK wrapper
│   ├── conversation-store.ts# Conversation persistence
│   ├── session-manager.ts   # Active session tracking
│   └── types.ts
├── src/                     # Frontend (React + Vite + TypeScript)
│   ├── App.tsx
│   ├── App.css
│   ├── components/          # UI components
│   ├── hooks/               # React hooks
│   ├── types/               # TypeScript types
│   └── utils/               # Helpers
├── data/conversations/      # Saved conversations (gitignored)
├── package.json
├── vite.config.ts
└── tsconfig.json
```
