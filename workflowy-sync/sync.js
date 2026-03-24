const axios = require('axios');
const { authorize, syncPriority } = require('./manager.js');
const { google } = require('googleapis');
require('dotenv').config({ path: __dirname + '/.env' });

const SESSION_ID = process.env.WORKFLOWY_SESSION_ID;
const BRANCH_ID_SUFFIX = process.env.WORKFLOWY_BRANCH_SUFFIX;
const RAW_DUMP_SUFFIX = process.env.WORKFLOWY_RAW_DUMP_SUFFIX;
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

/**
 * Fetches all tree data from Workflowy.
 */
async function fetchWorkflowyData() {
  const response = await axios.get('https://workflowy.com/get_tree_data/', {
    headers: {
      Cookie: `sessionid=${SESSION_ID}`,
    },
  });
  return response.data.items;
}

/**
 * Pushes operations to Workflowy.
 */
async function pushToWorkflowy(operations, currentTransactionId = null) {
  if (operations.length === 0) return currentTransactionId;

  const initResponse = await axios.get('https://workflowy.com/get_initialization_data', {
    headers: { Cookie: `sessionid=${SESSION_ID}` }
  });
  const projectTreeData = initResponse.data.projectTreeData;
  const clientId = projectTreeData.clientId;
  const ownerId = projectTreeData.mainProjectTreeInfo.ownerId;
  const dateJoinedTimestamp = projectTreeData.dateJoinedTimestamp;

  // Use provided transaction ID or the one from initialization
  const lastId = currentTransactionId || projectTreeData.mainProjectTreeInfo.initialMostRecentOperationTransactionId;

  const pushPollData = [];
  if (projectTreeData.auxiliaryProjectTreeInfos) {
    projectTreeData.auxiliaryProjectTreeInfos.forEach(info => {
      pushPollData.push({
        most_recent_operation_transaction_id: info.initialMostRecentOperationTransactionId.toString(),
        share_id: info.shareId
      });
    });
  }

  pushPollData.push({
    most_recent_operation_transaction_id: lastId.toString(),
    operations: operations.map(op => ({
      ...op,
      client_timestamp: Math.floor(Date.now() / 1000) - dateJoinedTimestamp
    })),
  });

  const payload = new URLSearchParams();
  payload.append('client_id', clientId);
  payload.append('client_version', '28');
  payload.append('push_poll_id', Math.random().toString(36).substring(2, 10));
  payload.append('push_poll_data', JSON.stringify(pushPollData));
  payload.append('crosscheck_user_id', ownerId.toString());

  const response = await axios.post('https://workflowy.com/push_and_poll', payload, {
    headers: {
      Cookie: `sessionid=${SESSION_ID}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (response.data.results && response.data.results.includes('error')) {
    throw new Error('Workflowy push failed: ' + JSON.stringify(response.data.results));
  }

  // Return the new transaction ID for the next batch
  return response.data.results[0].new_most_recent_operation_transaction_id;
}

/**
 * Organizes tasks from the Raw Dump section into their respective rooms.
 */
async function organizeRawDump(items) {
  const root = items.find(i => i.id.endsWith(BRANCH_ID_SUFFIX));
  const rawDumpNode = items.find(i => i.id.endsWith(RAW_DUMP_SUFFIX));

  if (!root || !rawDumpNode) return;

  const rooms = items.filter(i => i.prnt === root.id);
  const roomMap = {};
  rooms.forEach(r => { roomMap[r.nm.toLowerCase()] = r.id; });
  roomMap['bedroom'] = roomMap['bed'];
  roomMap['errands'] = roomMap['errand'];

  const roomNames = rooms.map(r => r.nm).filter(n => n && n.trim()).sort((a, b) => b.length - a.length);
  if (!roomNames.includes('Bedroom')) roomNames.push('Bedroom');
  if (!roomNames.includes('Calls')) roomNames.push('Calls');
  if (!roomNames.includes('Errands')) roomNames.push('Errands');

  const roomMoves = {}; 
  const edits = []; 

  const childMap = {};
  items.forEach(i => { if (!childMap[i.prnt]) childMap[i.prnt] = []; childMap[i.prnt].push(i); });

  const processSubtree = (nodeId) => {
    const children = childMap[nodeId] || [];
    children.forEach(item => {
      let name = item.nm || '';
      if (name.includes('<time')) { processSubtree(item.id); return; }

      let priority = '';
      let targetRoomId = null;
      let roomExtracted = false;
      let priorityExtracted = false;

      const extract = (text) => {
        let currentText = text;
        for (const rn of roomNames) {
          const rMatch = currentText.match(new RegExp(`^${rn}\\s*:?\\s*(.*)`, 'i'));
          if (rMatch) { 
            targetRoomId = roomMap[rn.toLowerCase()]; 
            currentText = rMatch[1]; 
            roomExtracted = true; 
            break; 
          }
        }
        const pMatch = currentText.match(/^(\d+)\s*(.*)/);
        if (pMatch) { 
          priority = pMatch[1]; 
          currentText = pMatch[2]; 
          priorityExtracted = true; 
        }
        return currentText;
      };

      let cleanedName = extract(name);
      cleanedName = extract(cleanedName);
      cleanedName = cleanedName.trim();
      if (cleanedName) {
        cleanedName = cleanedName.charAt(0).toUpperCase() + cleanedName.slice(1);
      }

      if (!cleanedName && (childMap[item.id] || []).length === 0) return;

      if (!targetRoomId) targetRoomId = roomMap['office'];

      if (targetRoomId) {
        if (!roomMoves[targetRoomId]) roomMoves[targetRoomId] = [];
        roomMoves[targetRoomId].push(item.id);
        
        const finalName = priority ? `${priority} ${cleanedName}` : cleanedName;
        if (finalName !== item.nm) {
          edits.push({ type: 'edit', id: item.id, name: finalName });
        }
        item.prnt = targetRoomId; 
        item.nm = finalName;
      } else {
        processSubtree(item.id);
      }
    });
  };

  processSubtree(rawDumpNode.id);

  const operations = [];
  Object.keys(roomMoves).forEach(roomId => {
    const sortedItemIds = roomMoves[roomId].sort((aId, bId) => {
      const a = items.find(i => i.id === aId);
      const b = items.find(i => i.id === bId);
      const pA = (a.nm.match(/^(\d+)/) || [null, "999"])[1];
      const pB = (b.nm.match(/^(\d+)/) || [null, "999"])[1];
      return parseInt(pA) - parseInt(pB);
    });

    operations.push({
      type: 'bulk_move',
      data: {
        projectids_json: JSON.stringify(sortedItemIds),
        parentid: roomId,
        priority: 0
      }
    });
  });
  operations.push(...edits);

  if (operations.length > 0) {
    const BATCH_SIZE = 50;
    let lastTransactionId = null;
    for (let i = 0; i < operations.length; i += BATCH_SIZE) {
      lastTransactionId = await pushToWorkflowy(operations.slice(i, i + BATCH_SIZE), lastTransactionId);
    }
    return true;
  }
  return false;
}

/**
 * Parses Workflowy data into tasks recursively.
 */
function parseWorkflowyTasks(items) {
  const root = items.find(i => i.id.endsWith(BRANCH_ID_SUFFIX));
  if (!root) return [];

  const rooms = items.filter(i => i.prnt === root.id);
  const roomMap = {};
  rooms.forEach(r => { roomMap[r.id] = r.nm; });

  const childMap = {};
  items.forEach(i => { if (!childMap[i.prnt]) childMap[i.prnt] = []; childMap[i.prnt].push(i); });

  const tasks = [];

  const traverse = (nodeId, roomName, parentTaskName = '') => {
    const children = childMap[nodeId] || [];
    children.forEach(item => {
      let rawName = item.nm || '';
      let name = rawName;
      let priority = '';

      // 1. If this is a room node itself, just recurse into it
      if (nodeId === root.id && roomMap[item.id]) {
        traverse(item.id, roomMap[item.id], '');
        return;
      }

      // 2. Extract priority from name
      const pMatch = name.match(/^(\d+)\s*(.*)/);
      if (pMatch) {
        priority = pMatch[1];
        name = pMatch[2];
      }

      // 3. Prepend parent name if this is a subtask
      let displayName = parentTaskName ? `${parentTaskName} - ${name}` : name;
      displayName = displayName.trim();
      if (displayName) {
        displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
      }

      if (displayName) {
        tasks.push({
          id: item.id,
          name: displayName,
          room: roomName,
          priority: priority,
          status: item.cp ? 'Completed' : 'Pending',
          dateCreated: item.ct,
          notes: item.no || '',
        });
      }

      // 4. Recurse into children
      traverse(item.id, roomName, name.trim());
    });
  };

  traverse(root.id, 'Unknown');
  return tasks;
}

/**
 * Sorts tasks by Priority (asc, blanks last), Room (asc), then Name (asc).
 */
function sortTasks(tasks, priorityIndex = 3, roomIndex = 2, nameIndex = 1) {
  return tasks.sort((a, b) => {
    const pA = a[priorityIndex] || '999';
    const pB = b[priorityIndex] || '999';
    if (pA !== pB) return pA.localeCompare(pB, undefined, { numeric: true });

    const rA = a[roomIndex] || '';
    const rB = b[roomIndex] || '';
    if (rA !== rB) return rA.localeCompare(rB);

    const nA = a[nameIndex] || '';
    const nB = b[nameIndex] || '';
    return nA.localeCompare(nB);
  });
}

/**
 * Syncs Google Sheets and Workflowy.
 */
async function sync() {
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });

  // 1. Fetch current Sheet data from all relevant tabs
  const [allTasksRes, completedRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "'All Tasks'!A2:G1000" }),
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "'Completed'!A2:H1000" })
  ]);

  const allTasksRows = allTasksRes.data.values || [];
  const completedRows = completedRes.data.values || [];
  const allSheetRows = [...allTasksRows, ...completedRows];

  const sheetTaskMap = {};
  allSheetRows.forEach(row => {
    if (row[0]) sheetTaskMap[row[0]] = row;
  });

  // 2. Fetch current Workflowy data and organize Raw Dump
  let wfItems = await fetchWorkflowyData();
  const organized = await organizeRawDump(wfItems);
  if (organized) {
    // Re-fetch tree data if it was modified during organization
    wfItems = await fetchWorkflowyData();
  }
  const wfTasks = parseWorkflowyTasks(wfItems);
  const wfTaskMap = {};
  wfTasks.forEach(task => {
    wfTaskMap[task.id] = task;
  });

  // 3. Compare and generate operations for Workflowy
  const wfOps = [];
  
  // Track status changes from Sheets to Workflowy
  allSheetRows.forEach(row => {
    const id = row[0];
    const status = row[4];
    const wfTask = wfTaskMap[id];

    if (wfTask) {
      if (status === 'Complete' && wfTask.status === 'Pending') {
        wfOps.push({ type: 'complete', id: id });
        wfTask.status = 'Complete';
      } else if ((status === 'Pending' || status === 'In-progress') && wfTask.status === 'Completed') {
        wfOps.push({ type: 'uncomplete', id: id });
        wfTask.status = 'Pending';
      }
    }
  });

  // 4. Update Workflowy
  await pushToWorkflowy(wfOps);

  // 5. Categorize and sort tasks for Google Sheets
  const finalAllTasks = [];
  const finalCompletedTasks = [];
  const today = new Date().toISOString().split('T')[0];

  wfTasks.forEach(wfTask => {
    const sheetRow = sheetTaskMap[wfTask.id];
    let priority = wfTask.priority;
    let status = wfTask.status === 'Completed' ? 'Complete' : 'Pending';
    let dateCompleted = '';

    // Persist status and priority from sheet if available
    if (sheetRow) {
      priority = priority || sheetRow[3];
      status = sheetRow[4];
      // If moved to Complete and no date, set it to today
      if (status === 'Complete') {
        dateCompleted = sheetRow[6] || today;
      }
    }

    if (status === 'Complete') {
      finalCompletedTasks.push([
        wfTask.id, wfTask.name, wfTask.room, priority, status, today, dateCompleted, wfTask.notes
      ]);
    } else {
      finalAllTasks.push([
        wfTask.id, wfTask.name, wfTask.room, priority, status, today, wfTask.notes
      ]);
    }
  });

  // Sort: Priority (3), Room (2), Name (1)
  sortTasks(finalAllTasks);
  sortTasks(finalCompletedTasks);

  // 6. Update Google Sheets
  await Promise.all([
    sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: "'All Tasks'!A2:G1000" }),
    sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: "'Completed'!A2:H1000" })
  ]);

  const updates = [];
  if (finalAllTasks.length > 0) {
    updates.push(sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'All Tasks'!A2:G${finalAllTasks.length + 1}`,
      valueInputOption: 'RAW',
      resource: { values: finalAllTasks },
    }));
  }
  if (finalCompletedTasks.length > 0) {
    updates.push(sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'Completed'!A2:H${finalCompletedTasks.length + 1}`,
      valueInputOption: 'RAW',
      resource: { values: finalCompletedTasks },
    }));
  }

  await Promise.all(updates);

  // 7. Refresh Priority tab (based on All Tasks)
  await syncPriority(auth, SPREADSHEET_ID);

  console.log(`Sync complete. Pushed ${wfOps.length} updates to Workflowy. Sorted all tabs by Priority -> Room -> Task Name.`);
}

if (require.main === module) {
  sync().catch(console.error);
}

module.exports = { sync };
