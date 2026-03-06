# Claude Code GUI

A web-based chat interface for Claude Code. Provides a modern UI with markdown rendering, syntax-highlighted code blocks, and tool call visibility — backed by the Claude Agent SDK.

## Prerequisites

- **Node.js 18+** — Check with `node --version`. Download from https://nodejs.org if needed.
- **Anthropic API key** — Get one at https://console.anthropic.com. You need this for Claude to work.

## Setup

1. **Clone or navigate to the project:**

   ```bash
   cd claude-code-gui
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set your API key:**

   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

   To make this permanent, add the line above to your `~/.zshrc` or `~/.bashrc` file.

4. **Start the app:**

   ```bash
   npm run dev
   ```

5. **Open your browser to** http://localhost:5173

That's it. You should see the Claude Code GUI.

## How to Use

### Starting a Conversation

1. Click the **+** button in the top-left sidebar.
2. A new conversation appears in the sidebar. It's automatically selected.
3. Type a message in the text box at the bottom and press **Enter**.

### Setting a Working Directory

By default, Claude works in the directory where the server was started. To change this:

1. Click the **...** button next to the **+** button in the sidebar.
2. A text field appears — type the full path to the directory you want Claude to work in (e.g., `/Users/you/projects/my-app`).
3. Click **+** to create the conversation with that working directory.

This is important because Claude's file tools (Read, Edit, Bash, etc.) operate relative to this directory.

### Sending Messages

- **Enter** sends your message.
- **Shift+Enter** inserts a newline (for multi-line messages).
- While Claude is responding, a **Stop** button appears to cancel the current request.

### Reading Responses

- Claude's responses render as **Markdown** — headings, lists, bold, links, tables all display properly.
- **Code blocks** have syntax highlighting and a **Copy** button in the top-right corner.
- **Tool calls** (when Claude reads files, runs commands, etc.) appear as collapsible blocks. Click them to see the input and output.

### Managing Conversations

- Click any conversation in the sidebar to switch to it.
- Hover over a conversation and click **×** to delete it.
- Conversation history is saved automatically and persists across browser refreshes and server restarts.

## FAQ

### Where is my data stored?

Conversations are saved as JSON files in the `data/conversations/` folder inside the project directory. Each conversation is one file. You can back them up, delete them manually, or move them.

### Can Claude edit files on my computer?

Yes. The app runs with `permissionMode: "acceptEdits"`, which means Claude can read, write, and edit files in the working directory without asking for confirmation. It can also run shell commands. This is by design for a smooth coding experience, but be aware of it.

### What tools does Claude have access to?

| Tool | What it does |
|------|-------------|
| Read | Read file contents |
| Write | Create new files |
| Edit | Make precise edits to existing files |
| Bash | Run shell commands |
| Glob | Find files by pattern |
| Grep | Search file contents |
| WebSearch | Search the web |
| WebFetch | Fetch and read web pages |

### What model does it use?

It uses whatever model the Claude Agent SDK defaults to (currently Claude's most capable model). You can change this by modifying `server/agent-session.ts` and adding `model: "claude-sonnet-4-6"` (or another model ID) to the options.

### The server won't start / I see connection errors

- Make sure port 3001 is not already in use: `lsof -i :3001`
- Make sure your `ANTHROPIC_API_KEY` is set: `echo $ANTHROPIC_API_KEY`
- Check the terminal where `npm run dev` is running for error messages.

### The page loads but nothing happens when I send a message

- Open browser DevTools (F12) → Console tab. Look for errors.
- Check the terminal running the server for errors.
- Verify your API key is valid and has available credits.

### Can I use this with a proxy or VPN?

If you need to route API calls through a proxy, set the standard environment variables before starting:

```bash
export HTTPS_PROXY=http://your-proxy:port
npm run dev
```

### How do I stop the app?

Press **Ctrl+C** in the terminal where `npm run dev` is running. This stops both the frontend and backend.

## Project Structure

```
claude-code-gui/
├── server/                  # Backend (Express + Agent SDK)
│   ├── index.ts             # HTTP routes and SSE streaming
│   ├── agent-session.ts     # Wraps the Claude Agent SDK
│   ├── conversation-store.ts# JSON file persistence
│   ├── session-manager.ts   # Tracks active sessions
│   └── types.ts
├── src/                     # Frontend (React + Vite)
│   ├── App.tsx              # Main layout
│   ├── App.css              # Dark theme styles
│   ├── components/          # UI components
│   ├── hooks/               # React hooks
│   ├── types/               # TypeScript types
│   └── utils/               # SSE helper
├── data/conversations/      # Saved conversations (gitignored)
├── package.json
├── vite.config.ts
└── tsconfig.json
```
