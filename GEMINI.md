# workflowy-sync

## Project Overview
This project is a specialized Node.js automation tool designed to provide a bidirectional synchronization between **Workflowy** and **Google Sheets**. It serves as a custom task management system that leverages Workflowy's flexible outlining for capture and Google Sheets' structured data for prioritization and reporting.

**Key Features:**
*   **Two-Way Sync:**
    *   **Pull:** Fetches tasks from specific "Room" nodes in a Workflowy outline.
    *   **Push:** Updates task completion status in Workflowy when marked as "Complete" in Google Sheets.
*   **Smart Organization (Raw Dump):**
    *   Automatically processes items from a "Raw Dump" node (`7da491bf25ab`).
    *   Recursively sorts items into "Room" nodes based on prefixes (e.g., "Office", "Garage").
    *   Defaults unassigned tasks to the **Office** room.
    *   Cleans task names by removing room prefixes while maintaining priority numbers.
    *   Physically sorts items in Workflowy by priority number (Ascending).
*   **Recursive Subtask Parsing:**
    *   Detects nested Workflowy items and syncs them as individual rows in Google Sheets.
    *   Automatically prepends the parent task name to subtasks (e.g., "Parent Task - Subtask").
*   **Google Sheet Management:**
    *   **All Tasks Tab:** The master list of active tasks.
    *   **Priority Tab:** An auto-generated view of high-priority, pending items.
    *   **Completed Tab:** Archives finished tasks with a "Date Completed" timestamp.
    *   **Sorting:** Automatically sorts all tabs by Priority -> Room -> Task Name.
    *   **Dropdowns:** Includes rooms (Office, Garage, Temple, Shop, Kitchen, Dining, Bath, Bed, Living, Errand, Yard, Calls) and status.

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
