const axios = require('axios');
const { authorize, syncPriority, syncTabFormatting, getHeaderMap } = require('./manager.js');
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
 * Gets the room mapping and sorted room names.
 */
function getRoomContext(items) {
  const root = items.find(i => i.id === BRANCH_ID_SUFFIX || i.id.endsWith(BRANCH_ID_SUFFIX));
  if (!root) return { roomMap: {}, roomNames: [], idToRoomName: {}, rootId: null };

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
            const cleanText = currentText.replace(/<\/?[^>]+(>|$)/g, "").trim();
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
 * Sorts tasks by Priority, Room, then Name using mapped indices.
 */
function sortTasks(tasks, map) {
  const pIdx = map.priority;
  const rIdx = map.room;
  const nIdx = map.name;

  return tasks.sort((a, b) => {
    const pA = a[pIdx] || '999';
    const pB = b[pIdx] || '999';
    if (pA !== pB) return pA.localeCompare(pB, undefined, { numeric: true });

    const rA = a[rIdx] || '';
    const rB = b[rIdx] || '';
    if (rA !== rB) return rA.localeCompare(rB);

    const nA = a[nIdx] || '';
    const nB = b[nIdx] || '';
    return nA.localeCompare(nB);
  });
}

/**
 * Syncs Google Sheets and Workflowy using header-based mapping.
 */
async function sync() {
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });

  const rooms = ["Office", "Garage", "Temple", "Shop", "Kitchen", "Dining", "Bath", "Bed", "Living", "Errand", "Yard", "Calls", "Fun"];

  // 1. Fetch current Sheet data from all tabs
  const ranges = ["'All Tasks'!A1:G1000", "'Completed'!A1:H1000"];
  rooms.forEach(room => ranges.push(`'${room}'!A1:G1000`));

  const batchRes = await sheets.spreadsheets.values.batchGet({ spreadsheetId: SPREADSHEET_ID, ranges: ranges });
  const valueRanges = batchRes.data.valueRanges || [];
  
  const allTasksRange = valueRanges.find(vr => vr.range.includes('All Tasks'));
  if (!allTasksRange || !allTasksRange.values) throw new Error("Could not find 'All Tasks' tab headers.");
  const headerMap = getHeaderMap(allTasksRange.values[0]);
  
  const allSheetRows = [];
  valueRanges.forEach(vr => { if (vr.values && vr.values.length > 1) allSheetRows.push(...vr.values.slice(1)); });

  const sheetTaskMap = {};
  allSheetRows.forEach(row => {
    const id = row[headerMap.taskId];
    if (id) {
      if (!sheetTaskMap[id] || row[headerMap.status] === 'Complete') { sheetTaskMap[id] = row; }
    }
  });

  // 2. Workflowy Organize
  let wfItems = await fetchWorkflowyData();
  const organized = await organizeRawDump(wfItems);
  if (organized) wfItems = await fetchWorkflowyData();
  let wfTasks = parseWorkflowyTasks(wfItems);

  // 3. Compare
  const { idToRoomName } = getRoomContext(wfItems);
  const wfOps = [];

  wfTasks.forEach(wfTask => {
    const item = wfItems.find(i => i.id === wfTask.id);
    if (!item) return;

    const sheetRow = sheetTaskMap[wfTask.id];
    let effectivePriority = wfTask.priority;
    if (!effectivePriority && sheetRow && sheetRow[headerMap.priority]) { effectivePriority = sheetRow[headerMap.priority]; }

    const expectedName = effectivePriority ? `${effectivePriority} ${wfTask.cleanName}` : wfTask.cleanName;
    if (item.nm !== expectedName) {
      console.log(`Renaming: "${item.nm}" -> "${expectedName}"`);
      item.nm = expectedName;
      wfOps.push({ type: 'edit', data: { projectid: wfTask.id, name: expectedName } });
    }

    if (wfTask.suggestedRoomId && wfTask.suggestedRoomId !== item.prnt) {
      console.log(`Moving: "${item.nm}" -> room "${idToRoomName[wfTask.suggestedRoomId]}"`);
      item.prnt = wfTask.suggestedRoomId;
      wfOps.push({ type: 'bulk_move', data: { projectids_json: JSON.stringify([wfTask.id]), parentid: wfTask.suggestedRoomId, priority: 0 } });
    }

    if (sheetRow) {
      const status = sheetRow[headerMap.status];
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

  // 4. Update Workflowy & Sort
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
      if (JSON.stringify(roomChildren.map(c => c.id)) !== JSON.stringify(sortedChildren.map(c => c.id))) {
        sortOps.push({ type: 'bulk_move', data: { projectids_json: JSON.stringify(sortedChildren.map(c => c.id)), parentid: room.id, priority: 0 } });
      }
    });
    if (sortOps.length > 0) await pushToWorkflowy(sortOps);
  }

  // 5. Update Sheets Data
  wfTasks = parseWorkflowyTasks(wfItems);
  const finalAllTasks = [];
  const finalCompletedTasks = [];
  const finalRoomTasks = {};
  rooms.forEach(r => finalRoomTasks[r] = []);

  const today = new Date().toISOString().split('T')[0];

  wfTasks.forEach(wfTask => {
    const sheetRow = sheetTaskMap[wfTask.id];
    let priority = wfTask.priority;
    let status = wfTask.status === 'Completed' ? 'Complete' : 'Pending';
    let dateCreated = today;
    let dateCompleted = '';
    let notes = wfTask.notes;

    if (sheetRow) {
      priority = priority || sheetRow[headerMap.priority];
      status = sheetRow[headerMap.status];
      dateCreated = sheetRow[headerMap.dateCreated] || today;
      notes = sheetRow[headerMap.notes] || notes;
      if (status === 'Complete') {
        const completedHeaders = valueRanges.find(vr => vr.range.includes('Completed')).values[0];
        const completedMap = getHeaderMap(completedHeaders);
        dateCompleted = sheetRow[completedMap.dateCompleted] || today;
      }
    }

    // ID, Pri, Room, Task Name, Status, Date Created, Notes
    const rowData = [wfTask.id, priority, wfTask.room, wfTask.name, status, dateCreated, notes];
    
    if (status === 'Complete') {
      finalCompletedTasks.push([wfTask.id, priority, wfTask.room, wfTask.name, status, dateCreated, dateCompleted, notes]);
    } else {
      finalAllTasks.push(rowData);
      if (finalRoomTasks[wfTask.room]) finalRoomTasks[wfTask.room].push(rowData);
    }
  });

  sortTasks(finalAllTasks, headerMap);
  sortTasks(finalCompletedTasks, headerMap);
  Object.keys(finalRoomTasks).forEach(r => sortTasks(finalRoomTasks[r], headerMap));

  // 6. Update Sheets
  const clearRanges = ["'All Tasks'!A2:G1000", "'Completed'!A2:H1000"];
  rooms.forEach(room => clearRanges.push(`'${room}'!A2:G1000`));
  await sheets.spreadsheets.values.batchClear({ spreadsheetId: SPREADSHEET_ID, resource: { ranges: clearRanges } });

  const updates = [];
  if (finalAllTasks.length > 0) updates.push({ range: `'All Tasks'!A2:G${finalAllTasks.length + 1}`, values: finalAllTasks });
  if (finalCompletedTasks.length > 0) updates.push({ range: `'Completed'!A2:H${finalCompletedTasks.length + 1}`, values: finalCompletedTasks });
  rooms.forEach(room => {
    const tasksInRoom = finalRoomTasks[room];
    if (tasksInRoom && tasksInRoom.length > 0) updates.push({ range: `'${room}'!A2:G${tasksInRoom.length + 1}`, values: tasksInRoom });
  });

  for (const update of updates) {
    await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: update.range, valueInputOption: 'RAW', resource: { values: update.values } });
  }

  await syncPriority(auth, SPREADSHEET_ID);
  await syncTabFormatting(auth, SPREADSHEET_ID);

  console.log(`Sync complete. Pushed ${wfOps.length} updates to Workflowy.`);
}

if (require.main === module) {
  sync().catch(console.error);
}
module.exports = { sync };
