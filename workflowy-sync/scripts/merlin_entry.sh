#!/bin/bash
# Merlin Entry Point Script
# Ensures NVM/Node environment is loaded correctly and sets background color

# Load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

MODE=$1
PROJECT_PATH="/home/chrisw/merlin"

case $MODE in
  vizier)
    echo -ne "\033]11;#300A24\007" # Purple Background
    cd "$PROJECT_PATH"
    npx @google/gemini-cli
    ;;
  commander)
    echo -ne "\033]11;#4E0000\007" # Red Background
    cd "$PROJECT_PATH"
    node workflowy-sync/merlin_commander.js
    ;;
  foreman)
    echo -ne "\033]11;#002B00\007" # Green Background
    cd "$PROJECT_PATH"
    node workflowy-sync/sync.js
    ;;
  temp)
    echo -ne "\033]11;#2B1B17\007" # Dark Brown Background
    cd /tmp
    npx @google/gemini-cli
    ;;
  *)
    echo "Unknown mode: $MODE"
    ;;
esac

# Keep the shell open if the command exits
exec bash
