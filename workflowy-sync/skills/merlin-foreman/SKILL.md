---
name: merlin-foreman
description: Practical job management, prioritization, and estimation for the Merlin sync system. Use this skill to perform daily check-ins as a "Party Briefing" (Warrior, Vizier, King, Lover, Rogue), pulling tasks from Google Sheets and events from Google Calendar to shorthand them for a Workflowy HUD and record stats back to the Daily tab.
---

# Merlin-Foreman (The Party Briefing)

This skill manages your daily "Combat Plan" by assigning your top 5 goals to a specialized D&D-style party. 

## The Merlin Party
- **Warrior (Goal 1):** Action, Execution, Discipline.
- **Vizier (Goal 2):** Strategy, Technology, Wisdom.
- **King (Goal 3):** Order, Legacy, Stewardship.
- **Lover (Goal 4):** Heart, Connection, Joy.
- **Rogue (Goal 5):** Opportunity, Resources, Job Leads.

## Interaction Workflow

### 1. Preparation (Context & Review)
- **Identify Target Day:** Ask "Today or Tomorrow?" (Default: Tomorrow).
- **Review Yesterday's Combat:**
    - Each "Class" asks for their own **% Completion** and **Actual Time Spent** (hours).
    - **Rogue** specifically prompts for **Job Leads** and **Bank Balance**.
    - **Lover** prompts for **Sleep Score** and **Exercise**.
- **Calculate Win %:** Average completion across all 5 classes.

### 2. Planning (The "Tactical Briefing")
- **Calendar Mining:** Fetch from `Appt` and `VB/Fun MD`. Shorthand the events.
- **Class Assignments:** 
    - The **Warrior** suggests the top action task.
    - The **Vizier** suggests the top systems/learning task.
    - ...and so on, shorthanding each to < 30 chars.
- **Estimation:** Ask for **Estimated Time** (hours) for each class mission.

### 3. Execution (Update HUD)
- **Update Sheets:** Write to the **Daily** tab using Class columns (e.g., `Warrior`, `War Est`, `War Act`).
- **Update Workflowy (The HUD):** 
    - Find `!MERLIN-RAW-INBOX-BEFORE-SYNC!`.
    - Overwrite with:
        - `#ForemanReport [Date]`
        - `#PartyStats` (Sleep, Leads, Bank, etc.)
        - `#Schedule` (Shorthand events)
        - `#CombatPlan` (Class-tagged goals: `#Warrior`, `#Vizier`, etc.)

## Prioritization & Estimation Guidelines
- **Priority:** Always align Daily Goals with the highest-ranking Weekly/Monthly goals.
- **Estimation:** Use **hours** (e.g., 0.5h, 1.5h).
- **Shorthand:** Keep names under 30 characters. Strip "Complete", "Finish", etc. (e.g., "Complete quarterly tax filing" -> "Q3 Tax Filing").

## Key Files & Resources
- **`scripts/foreman_sync.js`:** The main engine for interacting with APIs.
- **`references/prioritization_logic.md`:** Detailed rules for ranking tasks.
