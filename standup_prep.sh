#!/bin/bash
# Merlin Standup Prep: Forces a sync and rotation refresh
cd "$(dirname "$0")"
echo "Initializing Merlin Standup Prep..."
node workflowy-sync/sync.js
echo "Standup Prep Complete. Check Workflowy for the updated Mission Briefing."
