---
name: merlin-foreman
description: Practical job management, prioritization, and estimation for the Merlin sync system. Use this skill to perform daily check-ins, plan today/tomorrow by pulling tasks from Google Sheets (Priority tab) and events from Google Calendar, shorthand them for a Workflowy HUD (the !MERLIN-RAW-INBOX-BEFORE-SYNC! node), and record stats (Sleep, Job Leads, Exercise, Bank) back to a Daily tab in Sheets.
---

# Merlin-Foreman

This skill provides a structured, interactive workflow for managing your daily tasks, schedule, and goals. It bridges Google Sheets (blueprint), Google Calendar (schedule), and Workflowy (execution).

## Daily Check-in Workflow

Follow this sequence for every check-in:

### 1. Preparation (Context & Review)
- **Identify Target Day:** Ask "Is this check-in for Today ([Date]) or Tomorrow ([Date])?" (Default: Tomorrow).
- **Review Yesterday's Performance:**
    - Read the **Daily** tab from Google Sheets for the *previous* entry.
    - Ask for **% Completion** (0-100%) for each of the 5 Goals from that day.
    - Ask for **Actual Time Spent** (in hours) for each of those goals.
    - **Rollover Decision:** If a goal was < 80% complete, ask: "Should [Task Name] be moved to tomorrow as a top priority?"
    - **Record Stats:** Prompt for **Sleep Score**, **Job Leads**, **Exercise Mins**, **Bank Balance**, **Extra Wins**, and **Blocked Items**.
    - **Calculate Win %:** Automatically calculate the average % completion of the 5 goals.
    - **Save:** Write these "Actuals" and "Stats" back to the row for the previous day in the **Daily** tab.

### 2. Planning (The "Foreman's" Strategy)
- **Calendar Mining:** 
    - Fetch events from `Appt` and `VB/Fun MD` calendars for the target day.
    - **Shorthand:** Present a condensed list (e.g., `Piano@9, Meter@9:30, Jeff@10`). Ask: "Should I add these to the schedule?"
- **Task Selection:** 
    - Read the **Priority** tab in Google Sheets.
    - **Shorthand Prompting:** For each top task, suggest a shorthand name (< 30 chars). Ask: "Add [Shorthand] as a Goal for [Date]?"
- **Strategic Alignment & Ranking:**
    - Read the **Weekly** and **Monthly** tabs for alignment context.
    - **Foreman Suggestion:** Propose a 1-5 ranking. *Example: "I suggest G1: [Task A] because it aligns with Weekly Goal 1. Confirm or Re-rank?"*
- **Estimation:** 
    - For each selected Goal (G1-G5), ask for an **Estimated Time** (in hours).

### 3. Execution (Update Systems)
- **Update Sheets:** Write the new row (Date, Shorthand Events, G1-G5 Names, G1-G5 Estimates) to the **Daily** tab.
- **Update Workflowy (The HUD):** 
    - Find the node named `!MERLIN-RAW-INBOX-BEFORE-SYNC!`.
    - Overwrite it with a structured report:
        - `#ForemanReport [Date]`
        - `#Stats` (Today's metrics: Sleep, Leads, Bank, etc.)
        - `#Schedule` (The shorthand events list)
        - `#DailyGoals` (The 5 ranked goals with `#G1` tags and `#Est:Xh` tags)
        - `#Inbox` (Empty node for new items)

## Prioritization & Estimation Guidelines
- **Priority:** Always align Daily Goals with the highest-ranking Weekly/Monthly goals.
- **Estimation:** Use **hours** (e.g., 0.5h, 1.5h).
- **Shorthand:** Keep names under 30 characters. Strip "Complete", "Finish", etc. (e.g., "Complete quarterly tax filing" -> "Q3 Tax Filing").

## Key Files & Resources
- **`scripts/foreman_sync.js`:** The main engine for interacting with APIs.
- **`references/prioritization_logic.md`:** Detailed rules for ranking tasks.
