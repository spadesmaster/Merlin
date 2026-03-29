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
    headers: { Cookie: `sessionid=${SESSION_ID}` },
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

  const lastId = currentTransactionId || projectTreeData.mainProjectTreeInfo.initialMostRecentOperationTransactionId;

  const pushPollData = [];
  if (projectTreeData.auxiliaryProjectTreeInfos) {
    projectTreeData.auxiliaryProjectTreeInfos.forEach(info => {
      pushPollData.push({ most_recent_operation_transaction_id: info.initialMostRecentOperationTransactionId.toString(), share_id: info.shareId });
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
    headers: { Cookie: `sessionid=${SESSION_ID}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (response.data.results && response.data.results.includes('error')) {
    throw new Error('Workflowy push failed: ' + JSON.stringify(response.data.results));
  }

  return response.data.results[0].new_most_recent_operation_transaction_id;
}

/**
 * Gets the room mapping and sorted room names (including aliases).
 */
function getRoomContext(items) {
  const root = items.find(i => i.id === BRANCH_ID_SUFFIX || i.id.endsWith(BRANCH_ID_SUFFIX));
  if (!root) return { roomMap: {}, roomNames: [], idToRoomName: {} };

  const rooms = items.filter(i => i.prnt === root.id);
  const roomMap = {}; 
  const idToRoomName = {};

  rooms.forEach(r => { 
    const cleanRoomName = (r.nm || '').replace(/<\/?[^>]+(>|$)/g, "").trim();
    const lowerName = cleanRoomName.toLowerCase();
    roomMap[lowerName] = r.id; 
    idToRoomName[r.id] = cleanRoomName;
  });

  const aliases = {
    'bedroom': 'bed', 'errands': 'errand', 'errand': 'errands', 'call': 'calls', 'calls': 'call',
    'studio': 'shop', 'shops': 'shop', 'yards': 'yard', 'gardens': 'yard', 'garden': 'yard', 'funs': 'fun'
  };

  Object.keys(aliases).forEach(alias => {
    const target = aliases[alias];
    if (roomMap[target] && !roomMap[alias]) { roomMap[alias] = roomMap[target]; }
  });

  const roomNames = Object.keys(roomMap).filter(n => n && n.trim()).sort((a, b) => b.length - a.length);

  return { roomMap, roomNames, idToRoomName, rootId: root.id };
}

/**
 * Organizes tasks from the Raw Dump section into their respective rooms.
 */
async function organizeRawDump(items) {
  const { roomMap, roomNames, rootId } = getRoomContext(items);
  const rawDumpNode = items.find(i => i.id === RAW_DUMP_SUFFIX || i.id.endsWith(RAW_DUMP_SUFFIX));

  if (!rootId || !rawDumpNode) return;

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

      const extract = (text) => {
        let currentText = text.trim();
        let changed = true;
        
        while (changed) {
          changed = false;
          
          const checkMatch = (regex) => {
            const cleanText = currentText.replace(/<\/?[^>]+(>|$)/g, "");
            const trimmedClean = cleanText.trimStart();
            const match = trimmedClean.match(regex);
            
            if (match && trimmedClean.indexOf(match[0]) === 0) {
              let textToStrip = match[0];
              let newName = currentText.trimStart();
              while (textToStrip.length > 0 && newName.length > 0) {
                if (newName.startsWith('<')) {
                  const tag = newName.match(/^<[^>]+>/);
                  if (tag) { newName = newName.slice(tag[0].length); continue; }
                }
                if (newName[0].toLowerCase() === textToStrip[0].toLowerCase()) {
                  newName = newName.slice(1);
                  textToStrip = textToStrip.slice(1);
                } else if (newName[0].match(/[\s-:]/)) {
                  newName = newName.slice(1);
                } else {
                  currentText = trimmedClean.slice(match[0].length).trim();
                  return match;
                }
              }
              currentText = newName.trim();
              return match;
            }
            return null;
          };

          const toMatch = checkMatch(/^to([\s-:]+|$)/i);
          if (toMatch) { priority = '2'; changed = true; }

          const pMatch = checkMatch(/^(\d+)([\s-:]+|$)/);
          if (pMatch) { priority = pMatch[1]; changed = true; }

          if (checkMatch(/^(one|two|three|four|five|six|seven|eight|nine|ten|number)([\s-:]+|$)/i)) {
            changed = true;
          }

          for (const rn of roomNames) {
            if (checkMatch(new RegExp(`^${rn}([\\s-:]+|$|\\b)`, 'i'))) { 
              targetRoomId = roomMap[rn.toLowerCase()]; 
              changed = true; 
              break; 
            }
          }
        }
        return currentText;
      };

      let cleanedName = extract(name);
      if (cleanedName) { cleanedName = cleanedName.charAt(0).toUpperCase() + cleanedName.slice(1); }

      if (!cleanedName && (childMap[item.id] || []).length === 0) return;

      if (!targetRoomId) targetRoomId = roomMap['office'];

      if (targetRoomId) {
        const finalName = priority ? `${priority} ${cleanedName}` : cleanedName;
        if (finalName !== item.nm) {
          edits.push({ type: 'edit', data: { projectid: item.id, name: finalName } });
          item.nm = finalName;
        }
        
        if (item.prnt !== targetRoomId) {
          if (!roomMoves[targetRoomId]) roomMoves[targetRoomId] = [];
          roomMoves[targetRoomId].push(item.id);
          item.prnt = targetRoomId; 
        }
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
      const pA = parseInt((a.nm.match(/^(\d+)/) || [null, "999"])[1]);
      const pB = parseInt((b.nm.match(/^(\d+)/) || [null, "999"])[1]);
      if (pA !== pB) return pA - pB;
      const nA = a.nm.replace(/^(\d+)\s*/, "").toLowerCase();
      const nB = b.nm.replace(/^(\d+)\s*/, "").toLowerCase();
      return nA.localeCompare(nB);
    });

    operations.push({ type: 'bulk_move', data: { projectids_json: JSON.stringify(sortedItemIds), parentid: roomId, priority: 0 } });
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
  const { roomMap, roomNames, idToRoomName, rootId } = getRoomContext(items);
  if (!rootId) return [];

  const childMap = {};
  items.forEach(i => { if (!childMap[i.prnt]) childMap[i.prnt] = []; childMap[i.prnt].push(i); });

  const tasks = [];

  const traverse = (nodeId, roomName, parentTaskName = '') => {
    const children = childMap[nodeId] || [];
    children.forEach(item => {
      let rawName = item.nm || '';
      let name = rawName;
      let priority = '';

      if (nodeId === rootId && idToRoomName[item.id]) {
        traverse(item.id, idToRoomName[item.id], '');
        return;
      }

      let currentName = name.trim();
      let suggestedRoomId = null;
      let changed = true;
      while (changed) {
        changed = false;
        
        const checkMatch = (regex) => {
          const cleanText = currentName.replace(/<\/?[^>]+(>|$)/g, "").trim();
          const trimmedClean = cleanText.trimStart();
          const match = trimmedClean.match(regex);
          
          if (match && trimmedClean.indexOf(match[0]) === 0) {
            let textToStrip = match[0];
            let newName = currentName.trimStart();
            while (textToStrip.length > 0 && newName.length > 0) {
              if (newName.startsWith('<')) {
                const tag = newName.match(/^<[^>]+>/);
                if (tag) { newName = newName.slice(tag[0].length); continue; }
              }
              if (newName[0].toLowerCase() === textToStrip[0].toLowerCase()) {
                newName = newName.slice(1);
                textToStrip = textToStrip.slice(1);
              } else if (newName[0].match(/[\s-:]/)) {
                newName = newName.slice(1);
              } else {
                currentName = trimmedClean.slice(match[0].length).trim();
                return match;
              }
            }
            currentName = newName.trim();
            return match;
          }
          return null;
        };

        const toMatch = checkMatch(/^to([\s-:]+|$)/i);
        if (toMatch) { priority = '2'; changed = true; }

        const pMatch = checkMatch(/^(\d+)([\s-:]+|$)/);
        if (pMatch) { priority = pMatch[1]; changed = true; }

        if (checkMatch(/^(one|two|three|four|five|six|seven|eight|nine|ten|number)([\s-:]+|$)/i)) {
          changed = true;
        }

        for (const rn of roomNames) {
          if (checkMatch(new RegExp(`^${rn}([\\s-:]+|$|\\b)`, 'i'))) {
            const foundRoomId = roomMap[rn.toLowerCase()];
            if (foundRoomId) suggestedRoomId = foundRoomId;
            changed = true;
            break;
          }
        }
      }
      name = currentName.trim();
      if (name) { name = name.charAt(0).toUpperCase() + name.slice(1); }

      let displayName = parentTaskName ? `${parentTaskName} - ${name}` : name;
      displayName = displayName.trim();
      if (displayName) { displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1); }

      if (displayName) {
        tasks.push({
          id: item.id,
          name: displayName,
          cleanName: name,
          suggestedRoomId: suggestedRoomId,
          room: roomName,
          priority: priority,
          status: item.cp ? 'Completed' : 'Pending',
          dateCreated: item.ct,
          notes: item.no || '',
        });
      }

      traverse(item.id, roomName, name.trim());
    });
  };

  traverse(rootId, 'Unknown');
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
  allSheetRows.forEach(row => { if (row[0]) sheetTaskMap[row[0]] = row; });

  // 2. Fetch current Workflowy data and organize Raw Dump
  let wfItems = await fetchWorkflowyData();
  const organized = await organizeRawDump(wfItems);
  if (organized) wfItems = await fetchWorkflowyData();
  let wfTasks = parseWorkflowyTasks(wfItems);

  // 3. Compare and generate operations for Workflowy
  const { idToRoomName } = getRoomContext(wfItems);
  const wfOps = [];

  wfTasks.forEach(wfTask => {
    const item = wfItems.find(i => i.id === wfTask.id);
    if (!item) return;

    const sheetRow = sheetTaskMap[wfTask.id];
    let effectivePriority = wfTask.priority;
    if (!effectivePriority && sheetRow && sheetRow[3]) { effectivePriority = sheetRow[3]; }

    const expectedName = effectivePriority ? `${effectivePriority} ${wfTask.cleanName}` : wfTask.cleanName;
    if (item.nm !== expectedName) {
      console.log(`Renaming: "${item.nm}" -> "${expectedName}"`);
      item.nm = expectedName;
      wfOps.push({ type: 'edit', data: { projectid: wfTask.id, name: expectedName } });
    }

    if (wfTask.suggestedRoomId && wfTask.suggestedRoomId !== item.prnt) {
      console.log(`Moving: "${item.nm}" -> room "${idToRoomName[wfTask.suggestedRoomId]}"`);
      item.prnt = wfTask.suggestedRoomId;
      wfOps.push({
        type: 'bulk_move',
        data: { projectids_json: JSON.stringify([wfTask.id]), parentid: wfTask.suggestedRoomId, priority: 0 }
      });
    }

    if (sheetRow) {
      const status = sheetRow[4];
      if (status === 'Complete' && wfTask.status === 'Pending') {
        wfOps.push({ type: 'complete', data: { projectid: wfTask.id } });
        wfTask.status = 'Complete';
        item.cp = true;
      } else if ((status === 'Pending' || status === 'In-progress') && wfTask.status === 'Completed') {
        wfOps.push({ type: 'uncomplete', data: { projectid: wfTask.id } });
        wfTask.status = 'Pending';
        item.cp = false;
      }
    }
  });

  // 4. Update Workflowy
  if (wfOps.length > 0) {
    const BATCH_SIZE = 50;
    let lastTransactionId = null;
    for (let i = 0; i < wfOps.length; i += BATCH_SIZE) {
      lastTransactionId = await pushToWorkflowy(wfOps.slice(i, i + BATCH_SIZE), lastTransactionId);
    }
  }

  // 4b. Re-sort Workflowy
  const root = wfItems.find(i => i.id === BRANCH_ID_SUFFIX || i.id.endsWith(BRANCH_ID_SUFFIX));
  if (root) {
    const roomsInWf = wfItems.filter(i => i.prnt === root.id);
    const childMap = {};
    wfItems.forEach(i => { if (!childMap[i.prnt]) childMap[i.prnt] = []; childMap[i.prnt].push(i); });

    const sortOps = [];
    roomsInWf.forEach(room => {
      const roomChildren = childMap[room.id] || [];
      if (roomChildren.length <= 1) return;

      const sortedChildren = [...roomChildren].sort((a, b) => {
        const pA = parseInt((a.nm.match(/^(\d+)/) || [null, "999"])[1]);
        const pB = parseInt((b.nm.match(/^(\d+)/) || [null, "999"])[1]);
        if (pA !== pB) return pA - pB;
        const nA = a.nm.replace(/^(\d+)\s*/, "").toLowerCase();
        const nB = b.nm.replace(/^(\d+)\s*/, "").toLowerCase();
        return nA.localeCompare(nB);
      });

      const sortedIds = sortedChildren.map(c => c.id);
      if (JSON.stringify(roomChildren.map(c => c.id)) !== JSON.stringify(sortedIds)) {
        console.log(`Re-sorting room: ${room.nm.replace(/<\/?[^>]+(>|$)/g, "")}`);
        sortOps.push({ type: 'bulk_move', data: { projectids_json: JSON.stringify(sortedIds), parentid: room.id, priority: 0 } });
      }
    });
    if (sortOps.length > 0) await pushToWorkflowy(sortOps);
  }

  // 5. Update Sheets Data
  wfTasks = parseWorkflowyTasks(wfItems);
  const finalAllTasks = [];
  const finalCompletedTasks = [];
  const today = new Date().toISOString().split('T')[0];

  wfTasks.forEach(wfTask => {
    const sheetRow = sheetTaskMap[wfTask.id];
    let priority = wfTask.priority;
    let status = wfTask.status === 'Completed' ? 'Complete' : 'Pending';
    let dateCompleted = '';

    if (sheetRow) {
      priority = priority || sheetRow[3];
      status = sheetRow[4];
      if (status === 'Complete') { dateCompleted = sheetRow[6] || today; }
    }

    if (status === 'Complete') {
      finalCompletedTasks.push([wfTask.id, wfTask.name, wfTask.room, priority, status, today, dateCompleted, wfTask.notes]);
    } else {
      finalAllTasks.push([wfTask.id, wfTask.name, wfTask.room, priority, status, today, wfTask.notes]);
    }
  });

  sortTasks(finalAllTasks);
  sortTasks(finalCompletedTasks);

  // 6. Update Google Sheets
  await Promise.all([
    sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: "'All Tasks'!A2:G1000" }),
    sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: "'Completed'!A2:H1000" })
  ]);

  const updates = [];
  if (finalAllTasks.length > 0) updates.push({ range: `'All Tasks'!A2:G${finalAllTasks.length + 1}`, values: finalAllTasks });
  if (finalCompletedTasks.length > 0) updates.push({ range: `'Completed'!A2:H${finalCompletedTasks.length + 1}`, values: finalCompletedTasks });

  for (const update of updates) {
    await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: update.range, valueInputOption: 'RAW', resource: { values: update.values } });
  }

  await syncPriority(auth, SPREADSHEET_ID);

  console.log(`Sync complete. Pushed ${wfOps.length} updates to Workflowy.`);
}

if (require.main === module) { sync().catch(console.error); }
module.exports = { sync };
