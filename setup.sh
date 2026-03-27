#!/bin/bash
set -e

echo ""
echo "  Claude for Designers — Setup"
echo "  ──────────────────────────────"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "  ✗ Node.js is not installed."
  echo "    Download it from https://nodejs.org (v18 or newer)"
  echo ""
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "  ✗ Node.js v18+ is required (you have $(node -v))"
  echo "    Download a newer version from https://nodejs.org"
  echo ""
  exit 1
fi

echo "  ✓ Node.js $(node -v)"

# Install dependencies
echo ""
echo "  Installing dependencies..."
npm install --silent
echo "  ✓ Dependencies installed"

# Check for API key
echo ""
if [ -n "$ANTHROPIC_API_KEY" ]; then
  echo "  ✓ ANTHROPIC_API_KEY is set"
else
  echo "  Your Anthropic API key is needed to use Claude."
  echo "  Get one at https://console.anthropic.com"
  echo ""
  read -p "  Paste your API key (or press Enter to skip): " api_key
  if [ -n "$api_key" ]; then
    export ANTHROPIC_API_KEY="$api_key"

    # Offer to save it
    SHELL_RC="$HOME/.zshrc"
    if [ -n "$BASH_VERSION" ]; then
      SHELL_RC="$HOME/.bashrc"
    fi

    echo ""
    read -p "  Save to $SHELL_RC so you don't have to enter it again? (y/n) " save
    if [ "$save" = "y" ] || [ "$save" = "Y" ]; then
      echo "" >> "$SHELL_RC"
      echo "export ANTHROPIC_API_KEY=\"$api_key\"" >> "$SHELL_RC"
      echo "  ✓ Saved to $SHELL_RC"
    fi
    echo "  ✓ API key set for this session"
  else
    echo ""
    echo "  No problem — set it later with:"
    echo "    export ANTHROPIC_API_KEY=sk-ant-..."
  fi
fi

echo ""
echo "  ─────────────────────────"
echo "  Setup complete! Run the app with:"
echo ""
echo "    npm run dev"
echo ""
echo "  Then open http://localhost:5173"
echo ""
