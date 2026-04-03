# workflowy-sync

## Engineering Standards
- **CRLF Mandate:** All project files MUST use **CRLF** line endings for Windows compatibility.
- **Wrap-up Protocol:** After completing any major task, cleanup, or standup, the agent MUST ask the user: "Should we wrap up the session now?"

## Session Startup
At the beginning of every session in this project:
1. Read `SESSION.md` and output a concise bulleted summary of "Last Steps" and "Next Steps."
2. Verify that the foreman agent (`workflowy-sync/sync.js`) is running (check `pgrep -f sync.js`) and report its status.
3. Check `workflowy-sync/merlin_state.json` to confirm the current day's initialization status.
4. **Blocker Management (Scrum Standup):** Prompt the user for any potential blocks on missions or tasks. Record these in the "Blocked" section of the `Daily` tab and offer tactical suggestions to overcome them.

## Background Tasking Mandate
To maintain high-speed interactivity during standups and strategy sessions:
1. **Asynchronous Research:** If a user request involves deep research (e.g., product comparisons, technical deep-dives), the agent MUST NOT perform it in the main thread. Instead, the agent must either:
    - Delegate the task to the `generalist` sub-agent.
    - Add the directive to the `!MERLIN-COMMANDS!` node in Workflowy for the background `merlin_commander.js` to handle.
    - Prompt the user to move the request to the Command Console.
2. **Refactor Workflow (Plan then Delegate):** For any code refactor or architectural change:
    - The agent MUST first ask the user: "Should we plan and design this refactor now?"
    - Once the design is approved, the agent MUST delegate the implementation to the `generalist` sub-agent.
3. **Batch Operations:** Any task involving more than 3 file edits should be delegated to the `generalist`.

## Project Overview
This project is a specialized Node.js automation tool designed to provide a bidirectional synchronization between **Workflowy** and **Google Sheets**. It serves as a custom task management system that leverages Workflowy's flexible outlining for capture and Google Sheets' structured data for prioritization and reporting.

## Persistence and Crash-Recovery Protocol (CRITICAL)
To prevent context loss during sessions:
1. **Immediate Task Initialization:** For any new research, problem-solving, or deep-dive task, the agent MUST create a new task in Workflowy via the `!MERLIN-COMMANDS!` node for the background Commander to process.
2. **Assignment Prompt:** The agent MUST prompt the user for: **Priority**, **Room**, and **Mission Lead**.
3. **Local Scratchpad:** Use the local `/home/chrisw/.gemini/tmp/merlin/` directory for all transient context, research logs, and draft data. DO NOT use Workflowy for temporary storage.
4. **Batching Mandate:** All Google Sheets updates MUST be batched into a single `batchUpdate` call per session to minimize write requests and avoid quota issues.
5. **Session Reconstruction:** If a crash occurs, the agent's first priority is to re-sync from the local scratchpad or Workflowy to rebuild the active state.

**Key Features:**
*   **Two-Way Sync:**
    *   **Pull:** Fetches tasks from specific "Room" nodes in a Workflowy outline.
    *   **Push:** Updates task completion status in Workflowy when marked as "Complete" in Google Sheets.
*   **Smart Organization (Raw Dump):**
    *   Automatically processes items from a "Raw Dump" node (`7da491bf25ab`).
    *   Recursively sorts items into "Room" nodes based on prefixes (e.g., "Office", "Garage").
    *   Defaults unassigned tasks to the **Office** room.
    *   Cleans task names by removing room prefixes while maintaining priority numbers.
    *   **Priority Parsing:** 
        *   Leading digits (1-9) are parsed as priority.
        *   "to" (e.g., "to Task") is parsed as priority 2.
        *   Leading number words (One, Two, etc.) and "number" are stripped and ignored.
    *   **Formatting:** The first word of a task (after any leading numbers/rooms) is automatically capitalized.
    *   **Smart Re-categorization:** Items are automatically moved to the correct room if a room prefix is detected in their name.
    *   **Category Mapping:** 
        *   Handles singular and plural room names (e.g., "Errand" or "Errands").
        *   Maps "Studio" to the "Shop" room.
        *   **Entity Mappings:**
            *   **Joyce:** The Yard (Astronomy/Nature/Cosmos).
            *   **Gurpreet:** The Temple (Spirituality/Internal reflection).
            *   **Boni (The Navigator):** The Bridge (Centralized control/Dashboard).
            *   **Dan (The Vizier):** The Office (Work/Productivity).
            *   **Haley (The Tinker):** The Dining Room (Gaming/Socialization).
            *   **Nyx (The Bard):** Global/Play (Morale/Music/Dance).
        *   Matches room names case-insensitively.
    *   Physically sorts items in Workflowy by **Priority** (ascending) and then **Alphabetically**.
*   **Recursive Subtask Parsing:**
    *   Detects nested Workflowy items and syncs them as individual rows in Google Sheets.
    *   Automatically prepends the parent task name to subtasks (e.g., "Parent Task - Subtask").
*   **Google Sheet Management:**
    *   **All Tasks Tab:** The master list of active tasks.
    *   **Priority Tab:** An auto-generated view of tasks with a specified priority of **1**, sorted by Room -> Task Name.
    *   **Room Tabs:** Individual tabs for each category (Office, Garage, etc.) showing their respective active tasks.
    *   **Completed Tab:** Archives finished tasks with a "Date Completed" timestamp.
    *   **Persistence:** The **"Date Created"** field remains permanent once a task is added to the sheet, even if the task name or other details are modified.
    *   **Two-Way Sync from Any Tab:** Status changes (like marking a task "Complete") made on *any* room tab or the master list are automatically detected and synced back to Workflowy and moved to the Completed tab.
    *   **Header-Driven Mapping:** The system automatically identifies columns by their names (ID, Pri, Room, etc.), allowing you to move or rename columns without breaking the sync.
    *   **Visual Synchronization:** Automatically synchronizes column widths and header coloring from the "All Tasks" tab to all room-specific tabs.
    *   **Clean View:** The "ID" column is automatically hidden on all active task tabs to keep the interface focused on priorities and task names.
    *   **Sorting:** Automatically sorts all tabs by Priority -> Room -> Task Name (except the Priority tab which sorts by Room -> Task Name).
    *   **Dropdowns:** Includes rooms (Office, Garage, Temple, Shop, Kitchen, Dining, Bath, Bed, Living, Errand, Yard, Calls, Fun, Bridge) and status.

## Mission Management Architecture (CRITICAL)
1. **The Authority (Daily Tab):** The manual entries on the Google Sheets **Daily** tab are the primary "Source of Truth." The system MUST synchronize *from* the Sheet to the JSON state.
2. **The Reflection (MissionBriefing):** The Workflowy **#MissionBriefing** node is a display-focused reflection of the JSON state.
3. **The Vault (merlin_state.json):** The central hub for state storage. It must never overwrite the "Authority" (Sheet) without explicit user confirmation.
4. **Unity Backend Mandate:** The Google Sheet serves as the prototype data-layer for the future Unity app. All Sheets logic MUST be encapsulated in `MerlinFactory` or `DashboardManager` methods.
5. **Offset KPI Reporting Rule:** KPIs (Win %, Sleep, etc.) recorded on a specific date row in the Sheet and Workflowy Briefing MUST represent the results of the **previous calendar day**.
6. **Green-Locked Sync Rule:** If a mission cell in the **Daily** tab is colored **Green**, the system MUST mark the mission as `GREEN` (Complete) in JSON and Workflowy. Once Green, the mission is "Locked"—it cannot be deleted or deferred, and only minor text renames are permitted.
7. **Shorthand Mandate:** When the agent adds *new* missions to the **Daily** tab, it MUST shorten the names to 20-25 characters. Existing manual entries or renames MUST NOT be automatically shortened or altered.
8. **Commander Pre-Flight Protocol:** The background Commander MUST perform a "Read-Compare-Log" sync from the **Daily** tab before executing any task. This protects manual user edits from race conditions. Discrepancies MUST be logged to the `state_changes.log`.

## Conflict Resolution Protocol
1. **Sheet-First Priority:** If the Sheet changes, update the JSON state immediately.
2. **Briefing Monitoring:** The system MUST monitor the Workflowy Briefing node for user edits.
3. **Smart Renaming:** If a task name in the Briefing or Sheet changes but the Role (Warrior, King, etc.) remains the same, treat it as a rename and sync the change across all platforms.
4. **Complex Conflicts:** If a role is moved or a task is replaced with a completely different objective, the agent MUST notify the user and suggest a **Merge** or **Deferral**.
5. **Information Preservation:** Never delete a mission from the state unless it is marked "DONE." Any displaced mission MUST be moved to the next available day or returned to the **Inbox** node (`📥`).
6. **Mandatory Confirmation:** Always obtain user approval before resolving complex conflicts or changing the mission structure.

## Architecture & Key Files

### Core Scripts (`/home/chrisw/merlin/workflowy-sync/`)
*   **`sync.js`**: The main entry point. Handles Workflowy organization, recursive parsing, and bidirectional sync.
*   **`manager.js`**: Manages Google Sheets schema, headers, data validation (dropdowns), and token refresh logic.
*   **`auth.js`**: Manages Google OAuth2 authentication flow. Generates the initial `token.json`.
*   **`organize.js`**: Standalone script for Workflowy organization logic.

### Configuration & Auth
*   **`credentials.json`**: Google Cloud OAuth2 client secrets.
*   **`token.json`**: Stored Google API access/refresh tokens. Automatically refreshed and saved by `manager.js`.
*   **`package.json`**: Node.js dependencies (`axios`, `googleapis`, `workflowy`).

## Setup & Usage

### Prerequisites
*   Node.js (v24.14.0 or compatible).
*   Google Cloud Project in **Production** mode with Sheets API enabled.
*   Workflowy Account (requires `sessionid` cookie).

### Running the Sync
The system runs recursively:
```bash
node workflowy-sync/sync.js
```

### Initialization
```bash
node workflowy-sync/manager.js
```

## Development Notes
*   **Workflowy Auth:** Relies on `SESSION_ID` in `sync.js`.
*   **API Protocol:** Uses `bulk_move` and relative timestamps (`dateJoinedTimestamp`) to match modern Workflowy requirements.
*   **Multi-Tree Support:** Automatically includes auxiliary/shared trees in sync payloads to prevent server errors.
