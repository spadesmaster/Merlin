@echo off
:: Merlin Multi-Tab Console Launcher
set PROJECT_PATH=~/merlin
set GEMINI_CMD=npx @google/gemini-cli

start wt -p "Ubuntu" --title "🧙 VIZIER" wsl -d Ubuntu -e bash -c "cd %PROJECT_PATH% && %GEMINI_CMD%; exec bash" ^
; new-tab -p "Ubuntu" --title "🕵️ COMMANDER" wsl -d Ubuntu -e bash -c "cd %PROJECT_PATH% && node workflowy-sync/merlin_commander.js; exec bash" ^
; new-tab -p "Ubuntu" --title "🤖 FOREMAN" wsl -d Ubuntu -e bash -c "cd %PROJECT_PATH% && node workflowy-sync/sync.js; exec bash" ^
; new-tab -p "PowerShell" --title "🪟 WINDOWS" ^
; new-tab -p "Ubuntu" --title "📋 TEMP" wsl -d Ubuntu -e bash -c "cd /tmp && %GEMINI_CMD%; exec bash"
