const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

/**
 * Loads the client secrets and token to authorize.
 */
async function authorize() {
  const content = fs.readFileSync(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const client = keys.installed || keys.web;
  const { client_id, client_secret, redirect_uris } = client;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error('Token not found. Run auth.js first.');
  }
  const token = fs.readFileSync(TOKEN_PATH);
  oAuth2Client.setCredentials(JSON.parse(token));

  oAuth2Client.on('tokens', (tokens) => {
    const currentToken = JSON.parse(fs.readFileSync(TOKEN_PATH));
    const updatedToken = { ...currentToken, ...tokens };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(updatedToken));
    console.log('Google API token refreshed and saved to token.json');
  });

  return oAuth2Client;
}

/**
 * Maps header row to column indices.
 */
function getHeaderMap(headers) {
  const map = {};
  if (!headers) return map;
  headers.forEach((header, index) => {
    if (!header) return;
    const h = header.toLowerCase().replace(/[\s_]+/g, '');
    if (h === 'taskid' || h === 'id') map.taskId = index;
    else if (h === 'priority' || h === 'p' || h === 'pri') map.priority = index;
    else if (h === 'room' || h === 'category') map.room = index;
    else if (h === 'taskname' || h === 'name' || h === 'task') map.name = index;
    else if (h === 'status') map.status = index;
    else if (h === 'datecreated' || h === 'created') map.dateCreated = index;
    else if (h === 'datecompleted' || h === 'completed' || h === 'datecomp') map.dateCompleted = index;
    else if (h === 'notes') map.notes = index;
  });
  return map;
}

/**
 * Creates a new spreadsheet or uses an existing ID.
 */
async function initializeSpreadsheet(auth, existingId = null) {
  const sheets = google.sheets({ version: 'v4', auth });
  let spreadsheetId = existingId || process.env.GOOGLE_SPREADSHEET_ID;

  const ss = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetNames = ss.data.sheets.map(s => s.properties.title);

  const rooms = ["Office", "Garage", "Temple", "Shop", "Kitchen", "Dining", "Bath", "Bed", "Living", "Errand", "Yard", "Calls", "Fun"];
  const requests = [];

  if (!sheetNames.includes('All Tasks')) requests.push({ addSheet: { properties: { title: 'All Tasks' } } });
  if (!sheetNames.includes('Priority')) requests.push({ addSheet: { properties: { title: 'Priority' } } });
  if (!sheetNames.includes('Completed')) requests.push({ addSheet: { properties: { title: 'Completed' } } });

  rooms.forEach(room => {
    if (!sheetNames.includes(room)) requests.push({ addSheet: { properties: { title: room } } });
  });

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests } });
  }

  const ssRefresh = await sheets.spreadsheets.get({ spreadsheetId });
  
  // Headers
  const standardHeaders = [['ID', 'Pri', 'Room', 'Task Name', 'Status', 'Date Created', 'Notes']];
  const completedHeaders = [['ID', 'Pri', 'Room', 'Task Name', 'Status', 'Date Created', 'Date Completed', 'Notes']];

  const headerUpdates = [
    { range: "'All Tasks'!A1:G1", values: standardHeaders },
    { range: "'Priority'!A1:G1", values: standardHeaders },
    { range: "'Completed'!A1:H1", values: completedHeaders }
  ];

  rooms.forEach(room => headerUpdates.push({ range: `'${room}'!A1:G1`, values: standardHeaders }));

  for (const update of headerUpdates) {
    await sheets.spreadsheets.values.update({ spreadsheetId, range: update.range, valueInputOption: 'RAW', resource: { values: update.values } });
  }

  // Dropdowns and Hiding ID Column
  const statuses = ["Pending", "In-progress", "Complete"];
  const validationRequests = [];

  const setupSheet = (sId) => {
    validationRequests.push({
      setDataValidation: {
        range: { sheetId: sId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 2, endColumnIndex: 3 }, // Room
        rule: { condition: { type: 'ONE_OF_LIST', values: rooms.map(r => ({ userEnteredValue: r })) }, showCustomUi: true, strict: true }
      }
    });
    validationRequests.push({
      setDataValidation: {
        range: { sheetId: sId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 4, endColumnIndex: 5 }, // Status
        rule: { condition: { type: 'ONE_OF_LIST', values: statuses.map(s => ({ userEnteredValue: s })) }, showCustomUi: true, strict: true }
      }
    });
    // Hide ID Column (startIndex 0, endIndex 1)
    validationRequests.push({
      updateDimensionProperties: {
        range: { sheetId: sId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { hiddenByUser: true },
        fields: 'hiddenByUser'
      }
    });
  };

  const allTasksSheetId = ssRefresh.data.sheets.find(s => s.properties.title === 'All Tasks').properties.sheetId;
  const prioritySheetId = ssRefresh.data.sheets.find(s => s.properties.title === 'Priority').properties.sheetId;
  const completedSheetId = ssRefresh.data.sheets.find(s => s.properties.title === 'Completed').properties.sheetId;

  setupSheet(allTasksSheetId);
  setupSheet(prioritySheetId);
  rooms.forEach(room => {
    const s = ssRefresh.data.sheets.find(sh => sh.properties.title === room);
    if (s) setupSheet(s.properties.sheetId);
  });

  validationRequests.push({
    setDataValidation: {
      range: { sheetId: completedSheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 4, endColumnIndex: 5 },
      rule: { condition: { type: 'ONE_OF_LIST', values: statuses.map(s => ({ userEnteredValue: s })) }, showCustomUi: true, strict: true }
    }
  });
  
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: validationRequests } });
  return spreadsheetId;
}

/**
 * Synchronizes prioritized tasks from 'All Tasks' to 'Priority'.
 */
async function syncPriority(auth, spreadsheetId) {
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: "'All Tasks'!A1:G1000" });
  const rows = response.data.values || [];
  if (rows.length <= 1) return;

  const map = getHeaderMap(rows[0]);
  const dataRows = rows.slice(1);
  
  const prioritizedTasks = dataRows.filter(row => {
    const priority = row[map.priority];
    const status = row[map.status] ? row[map.status].toLowerCase() : '';
    return priority === '1' && (status === 'pending' || status === 'in-progress');
  }).map(row => {
    return [
      row[map.taskId] || '',
      row[map.priority] || '',
      row[map.room] || '',
      row[map.name] || '',
      row[map.status] || '',
      row[map.dateCreated] || '',
      row[map.notes] || ''
    ];
  });

  prioritizedTasks.sort((a, b) => {
    const roomA = a[2] || '';
    const roomB = b[2] || '';
    if (roomA !== roomB) return roomA.localeCompare(roomB);
    const nameA = a[3] || '';
    const nameB = b[3] || '';
    return nameA.localeCompare(nameB);
  });

  await sheets.spreadsheets.values.clear({ spreadsheetId, range: "'Priority'!A2:G1000" });
  if (prioritizedTasks.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `'Priority'!A2:G${prioritizedTasks.length + 1}`, valueInputOption: 'RAW', resource: { values: prioritizedTasks }
    });
  }
}

/**
 * Synchronizes formatting from 'All Tasks' to room tabs.
 */
async function syncTabFormatting(auth, spreadsheetId) {
  const sheets = google.sheets({ version: 'v4', auth });
  
  // 1. Get ALL sheet properties (titles and IDs)
  const ssMetadata = await sheets.spreadsheets.get({ spreadsheetId });
  const allSheets = ssMetadata.data.sheets;

  // 2. Fetch formatting strictly from 'All Tasks'
  const ssSource = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: true,
    ranges: ["'All Tasks'!A1:G1"],
  });

  const allTasksSheet = ssSource.data.sheets.find(s => s.properties.title === 'All Tasks');
  if (!allTasksSheet || !allTasksSheet.data || !allTasksSheet.data[0]) {
    console.error("Could not find source formatting data in 'All Tasks'.");
    return;
  }

  const sheetData = allTasksSheet.data[0];
  const headerRow = sheetData.rowData ? sheetData.rowData[0] : null;
  const columnMetadata = sheetData.columnMetadata;

  if (!headerRow) {
    console.error("No header row formatting found in 'All Tasks'.");
    return;
  }

  const rooms = ["Office", "Garage", "Temple", "Shop", "Kitchen", "Dining", "Bath", "Bed", "Living", "Errand", "Yard", "Calls", "Fun"];
  const requests = [];

  allSheets.forEach(sheet => {
    const title = sheet.properties.title;
    const sheetId = sheet.properties.sheetId;

    if (rooms.includes(title)) {
      // Apply Header Colors and Widths to Room Tabs
      requests.push({
        updateCells: {
          range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 7 },
          rows: [{ values: headerRow.values.map(v => ({ userEnteredFormat: v.userEnteredFormat || {} })) }],
          fields: 'userEnteredFormat'
        }
      });

      if (columnMetadata) {
        columnMetadata.forEach((meta, idx) => {
          if (meta.pixelSize) {
            requests.push({
              updateDimensionProperties: {
                range: { sheetId: sheetId, dimension: 'COLUMNS', startIndex: idx, endIndex: idx + 1 },
                properties: { pixelSize: meta.pixelSize },
                fields: 'pixelSize'
              }
            });
          }
        });
      }
    } else if (title === 'Priority') {
      // Apply ONLY Widths to Priority Tab
      if (columnMetadata) {
        columnMetadata.forEach((meta, idx) => {
          if (meta.pixelSize) {
            requests.push({
              updateDimensionProperties: {
                range: { sheetId: sheetId, dimension: 'COLUMNS', startIndex: idx, endIndex: idx + 1 },
                properties: { pixelSize: meta.pixelSize },
                fields: 'pixelSize'
              }
            });
          }
        });
      }
    }
  });

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests } });
    console.log(`Successfully synced formatting from 'All Tasks' to category and Priority tabs.`);
  }
}

async function main() {
  const auth = await authorize();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const actualId = await initializeSpreadsheet(auth, spreadsheetId);
  await syncPriority(auth, actualId);
  await syncTabFormatting(auth, actualId);
}

if (require.main === module) main().catch(console.error);
module.exports = { authorize, initializeSpreadsheet, syncPriority, syncTabFormatting, getHeaderMap };
