const axios = require('axios');
const { authorize, syncPriority, syncTabFormatting, getHeaderMap } = require('./manager.js');
const { google } = require('googleapis');
const WorkflowyClient = require('./workflowy_client.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: __dirname + '/.env' });

const BRANCH_ID_SUFFIX = process.env.WORKFLOWY_BRANCH_SUFFIX;
const RAW_DUMP_SUFFIX = process.env.WORKFLOWY_RAW_DUMP_SUFFIX;
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

const wf = new WorkflowyClient();
const STATE_PATH = path.join(__dirname, 'merlin_state.json');

/**
 * Proactive Foreman: Rotates the state and prepares the day automatically.
 * Records a full snapshot of all tasks for easy rollback.
 */
async function rotateState(auth, sheets, headerMap, allSheetRows) {
  if (!fs.existsSync(STATE_PATH)) return;
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  const todayStr = new Date().toISOString().split('T')[0];

  if (state.date === todayStr) {
    return;
  }

  console.log(`[FOREMAN] New day detected (${todayStr}). Rotating state...`);

  // 1. Full Backup of all tasks and subtasks before rotation
  if (!state.history) state.history = {};
  
  // Map rows to a more readable object structure for the history log
  const taskBackup = allSheetRows.map(row => ({
    id: row[headerMap.taskId],
    priority: row[headerMap.priority],
    room: row[headerMap.room],
    name: row[headerMap.name],
    status: row[headerMap.status],
    notes: row[headerMap.notes]
  }));

  state.history[state.date] = {
    win_percent: state.stats.win_percent,
    sleep: state.stats.sleep,
    job_leads: state.stats.job_leads,
    exercise: state.stats.exercise,
    missions: state.missions[getDayName(state.date)] || {},
    task_snapshot: taskBackup // THE BACKUP
  };

  // 2. Shift Missions (Tomorrow -> Today)
  const tomorrowDay = getDayName(todayStr);

  if (!state.missions[tomorrowDay]) {
    console.log(`[FOREMAN] Warning: No missions found for ${tomorrowDay}. Initializing blank.`);
    state.missions[tomorrowDay] = {};
  }

  // 3. Reset Daily Stats
  state.date = todayStr;
  state.stats = {
    win_percent: "0%",
    sleep: null,
    job_leads: 0,
    exercise: 0
  };
  state.status = "AUTO_INITIALIZED";

  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  console.log(`[FOREMAN] State rotated to ${todayStr} and tasks backed up.`);

  // 4. Trigger Mission Briefing Push
  try {
    const factory = require('./merlin_factory.js');
    const missions = state.missions[tomorrowDay];
    
    const weatherStr = "🌤️ Weather: [Pending Fetch]";
    const kpiStr = `📊 #KPIs | Win: 🏆 0% | Sleep: [Pending] | Leads: ☹️ 0 | Exercise: ☹️ 0`;
    const dateFormatted = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const missionLines = Object.keys(missions).map(role => {
      const emoji = { warrior: '⚔️', king: '👑', vizier: '🧙', tinker: '⚒️', lover: '❤️', rogue: '🕵️', bard: '🧚' }[role.toLowerCase()] || '📝';
      return `${emoji} #${role.toUpperCase()}: <b>${missions[role]}</b>`;
    });

    console.log(`[FOREMAN] Pushing auto-briefing to Workflowy for ${dateFormatted}...`);
    await factory.createOrUpdateBriefing(dateFormatted, {
      kpis: kpiStr,
      weather: weatherStr,
      missions: missionLines
    });
    console.log(`[FOREMAN] Auto-briefing successful.`);
  } catch (err) {
    console.error(`[FOREMAN] Briefing push failed:`, err.message);
  }
}

function getDayName(dateStr) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[new Date(dateStr).getDay()];
}

/**
 * Helper to extract priority, target room, and clean name from text.
 */
function extractInfoFromText(text, roomContext) {
  const { roomMap, roomNames } = roomContext;
  let currentText = text.trim();
  let priority = '';
  let targetRoomId = null;
  let changed = true;

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

  while (changed) {
    changed = false;
    
    // 1. Extract Priority from "to" (priority 2)
    const toMatch = checkMatch(/^to([\s-:]+|$)/i);
    if (toMatch) { priority = '2'; changed = true; }

    // 2. Extract Priority from digits
    const pMatch = checkMatch(/^(\d+)([\s-:]+|$)/);
    if (pMatch) { priority = pMatch[1]; changed = true; }

    // 3. Strip number words and "number"
    if (checkMatch(/^(one|two|three|four|five|six|seven|eight|nine|ten|number)([\s-:]+|$)/i)) {
      changed = true;
    }

    // 4. Extract Room
    for (const rn of roomNames) {
      if (checkMatch(new RegExp(`^${rn}([\\s-:]+|$|\\b)`, 'i'))) { 
        targetRoomId = roomMap[rn.toLowerCase()]; 
        changed = true; 
        break; 
      }
    }
  }

  let cleanName = currentText.trim();
  if (cleanName) {
    cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  }

  return { cleanName, priority, targetRoomId };
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
  const roomContext = getRoomContext(items);
  const { roomMap, rootId } = roomContext;
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

      const info = extractInfoFromText(name, roomContext);
      let cleanedName = info.cleanName;
      let priority = info.priority;
      let targetRoomId = info.targetRoomId;

      if (!cleanedName && (childMap[item.id] || []).length === 0) return;

      if (!targetRoomId) targetRoomId = roomMap['office'];

      if (targetRoomId) {
        const finalName = priority ? `${priority} ${cleanedName}` : cleanedName;
        if (finalName !== item.nm) {
          wf.editNode(item.id, finalName);
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

    wf.bulkMoveNodes(sortedItemIds, roomId, 0);
  });

  if (wf.operations.length > 0) {
    await wf.push();
    return true;
  }
  return false;
}

/**
 * Parses Workflowy data into tasks recursively.
 */
function parseWorkflowyTasks(items) {
  const roomContext = getRoomContext(items);
  const { idToRoomName, rootId } = roomContext;
  if (!rootId) return [];

  const childMap = {};
  items.forEach(i => { if (!childMap[i.prnt]) childMap[i.prnt] = []; childMap[i.prnt].push(i); });

  const tasks = [];

  const traverse = (nodeId, roomName, parentTaskName = '') => {
    const children = childMap[nodeId] || [];
    children.forEach(item => {
      let rawName = item.nm || '';

      if (nodeId === rootId && idToRoomName[item.id]) {
        traverse(item.id, idToRoomName[item.id], '');
        return;
      }

      const info = extractInfoFromText(rawName, roomContext);
      const name = info.cleanName;
      const priority = info.priority;
      const suggestedRoomId = info.targetRoomId;

      let displayName = parentTaskName ? `${parentTaskName} - ${name}` : name;
      displayName = displayName.trim();
      if (displayName) { displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1); }

      if (displayName) {
        tasks.push({
          id: item.id,
          name: displayName,
          cleanName: name,
          parentTaskName: parentTaskName,
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
 * Syncs Google Sheets and Workflowy.
 */
async function sync() {
  console.log(`[SYNC] Starting sync cycle at ${new Date().toLocaleTimeString()}`);
  
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

  // A. Proactive Rotation (Background Foreman)
  // Now passes all sheet data for the backup snapshot
  await rotateState(auth, sheets, headerMap, allSheetRows);

  const sheetTaskMap = {};
  const newTasksFromSheet = [];
  allSheetRows.forEach(row => {
    const id = row[headerMap.taskId];
    if (id) {
      if (!sheetTaskMap[id] || row[headerMap.status] === 'Complete') { sheetTaskMap[id] = row; }
    } else if (row[headerMap.name] && row[headerMap.name].trim()) {
      newTasksFromSheet.push(row);
    }
  });

  // 2. Workflowy Organize & Fetch
  let wfItems = await wf.fetchTree();
  const roomContext = getRoomContext(wfItems);
  const { roomMap, idToRoomName, rootId } = roomContext;
  let wfChanged = await organizeRawDump(wfItems);
  
  // Handle new tasks from sheet
  if (newTasksFromSheet.length > 0) {
    newTasksFromSheet.forEach(row => {
      const name = row[headerMap.name];
      const room = row[headerMap.room] || 'Office';
      const pri = row[headerMap.priority];
      const targetRoomId = roomMap[room.toLowerCase()] || roomMap['office'];
      
      const info = extractInfoFromText(name, roomContext);
      const finalPri = pri || info.priority;
      const finalName = finalPri ? `${finalPri} ${info.cleanName}` : info.cleanName;
      
      console.log(`Adding new task: "${finalName}" to room "${room}"`);
      wf.createNode(targetRoomId, finalName);
    });
    await wf.push();
    wfChanged = true;
  }

  if (wfChanged) wfItems = await wf.fetchTree();
  let wfTasks = parseWorkflowyTasks(wfItems);

  // 3. Compare existing tasks
  wfTasks.forEach(wfTask => {
    const item = wfItems.find(i => i.id === wfTask.id);
    if (!item) return;

    const sheetRow = sheetTaskMap[wfTask.id];
    let effectivePriority = wfTask.priority;
    let effectiveCleanName = wfTask.cleanName;
    let targetRoomId = item.prnt;

    if (sheetRow) {
      // Priority from Sheet
      const sheetPri = sheetRow[headerMap.priority];
      if (sheetPri !== undefined && sheetPri !== '') effectivePriority = sheetPri;
      else if (sheetPri === '') effectivePriority = '';

      // Name and potential Move from Sheet
      const sheetDisplayName = sheetRow[headerMap.name];
      if (sheetDisplayName && sheetDisplayName !== wfTask.name) {
        const info = extractInfoFromText(sheetDisplayName, roomContext);
        
        if (info.targetRoomId) {
          targetRoomId = info.targetRoomId;
          effectiveCleanName = info.cleanName;
          if (info.priority) effectivePriority = info.priority;
        } else {
          const parentPrefix = wfTask.parentTaskName ? `${wfTask.parentTaskName} - ` : '';
          if (wfTask.parentTaskName && sheetDisplayName.startsWith(parentPrefix)) {
            const leafName = sheetDisplayName.slice(parentPrefix.length).trim();
            const leafInfo = extractInfoFromText(leafName, roomContext);
            effectiveCleanName = leafInfo.cleanName;
            if (leafInfo.priority) effectivePriority = leafInfo.priority;
          } else if (wfTask.parentTaskName) {
            targetRoomId = roomMap[wfTask.room.toLowerCase()];
            const info = extractInfoFromText(sheetDisplayName, roomContext);
            effectiveCleanName = info.cleanName;
            if (info.priority) effectivePriority = info.priority;
          } else {
            effectiveCleanName = info.cleanName;
            if (info.priority) effectivePriority = leafInfo.priority;
          }
        }
      }
    }

    const expectedName = effectivePriority ? `${effectivePriority} ${effectiveCleanName}` : effectiveCleanName;
    if (item.nm !== expectedName) {
      console.log(`Updating Workflowy Name: "${item.nm}" -> "${expectedName}" (Source: Sheet)`);
      item.nm = expectedName;
      wf.editNode(wfTask.id, expectedName);
    }

    if (targetRoomId !== item.prnt) {
      console.log(`Moving Workflowy Item: "${item.nm}" -> room "${idToRoomName[targetRoomId]}"`);
      item.prnt = targetRoomId;
      wf.moveNode(wfTask.id, targetRoomId, 0);
    }

    if (sheetRow) {
      const status = sheetRow[headerMap.status];
      if (status === 'Complete' && wfTask.status === 'Pending') {
        wf.completeNode(wfTask.id);
        wfTask.status = 'Complete';
        item.cp = true;
      } else if ((status === 'Pending' || status === 'In-progress') && wfTask.status === 'Completed') {
        wf.uncompleteNode(wfTask.id);
        wfTask.status = 'Pending';
        item.cp = false;
      }
    }
  });

  // 4. Update Workflowy & Sort
  if (wf.operations.length > 0) {
    await wf.push();
  }

  // 4b. Re-sort Workflowy
  const root = wfItems.find(i => i.id === BRANCH_ID_SUFFIX || i.id.endsWith(BRANCH_ID_SUFFIX));
  if (root) {
    const roomsInWf = wfItems.filter(i => i.prnt === root.id);
    const childMap = {};
    wfItems.forEach(i => { if (!childMap[i.prnt]) childMap[i.prnt] = []; childMap[i.prnt].push(i); });

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
        wf.bulkMoveNodes(sortedChildren.map(c => c.id), room.id, 0);
      }
    });
    if (wf.operations.length > 0) await wf.push();
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
        const completedTab = valueRanges.find(vr => vr.range.includes('Completed'));
        if (completedTab && completedTab.values) {
          const completedMap = getHeaderMap(completedTab.values[0]);
          dateCompleted = sheetRow[completedMap.dateCompleted] || today;
        }
      }
    }

    const rowData = [wfTask.id, priority, wfTask.room, wfTask.name, status, dateCreated, notes];
    
    if (status === 'Complete') {
      finalCompletedTasks.push([wfTask.id, priority, wfTask.room, wfTask.name, status, dateCreated, dateCompleted, notes]);
    } else {
      finalAllTasks.push(rowData);
      if (finalRoomTasks[wfTask.room]) finalRoomTasks[wfTask.room].push(rowData);
    }
  });

  const sortMap = { priority: 1, room: 2, name: 3 };
  sortTasks(finalAllTasks, sortMap);
  sortTasks(finalCompletedTasks, sortMap);
  Object.keys(finalRoomTasks).forEach(r => sortTasks(finalRoomTasks[r], sortMap));

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

  console.log(`Sync complete.`);
}

if (require.main === module) {
  // Run once immediately, then every 30 seconds
  sync().catch(console.error);
  setInterval(() => sync().catch(console.error), 30000);
}
module.exports = { sync };
