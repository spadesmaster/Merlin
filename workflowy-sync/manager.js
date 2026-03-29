const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

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

  // Automatically save new tokens when they are refreshed
  oAuth2Client.on('tokens', (tokens) => {
    const currentToken = JSON.parse(fs.readFileSync(TOKEN_PATH));
    const updatedToken = { ...currentToken, ...tokens };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(updatedToken));
    console.log('Google API token refreshed and saved to token.json');
  });

  return oAuth2Client;
}

/**
 * Creates a new spreadsheet or uses an existing ID.
 */
async function initializeSpreadsheet(auth, existingId = null) {
  const sheets = google.sheets({ version: 'v4', auth });
  let spreadsheetId = existingId;

  if (!spreadsheetId) {
    const resource = {
      properties: {
        title: 'Workflowy Task Manager',
      },
    };
    const response = await sheets.spreadsheets.create({
      resource,
      fields: 'spreadsheetId',
    });
    spreadsheetId = response.data.spreadsheetId;
    console.log(`Created new spreadsheet with ID: ${spreadsheetId}`);
    console.log(`View it here: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  }

  // 1. Create Sheets (All Tasks, Priority)
  // Check existing sheets first
  const ss = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetNames = ss.data.sheets.map(s => s.properties.title);

  const requests = [];

  if (!sheetNames.includes('All Tasks')) {
    requests.push({ addSheet: { properties: { title: 'All Tasks' } } });
  }
  if (!sheetNames.includes('Priority')) {
    requests.push({ addSheet: { properties: { title: 'Priority' } } });
  }
  if (!sheetNames.includes('Completed')) {
    requests.push({ addSheet: { properties: { title: 'Completed' } } });
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: { requests },
    });
  }

  // Refresh metadata to get sheetIds
  const ssRefresh = await sheets.spreadsheets.get({ spreadsheetId });
  const allTasksSheetId = ssRefresh.data.sheets.find(s => s.properties.title === 'All Tasks').properties.sheetId;
  const completedTasksSheetId = ssRefresh.data.sheets.find(s => s.properties.title === 'Completed').properties.sheetId;

  // 2. Set Headers
  const allTasksHeaders = [['Task ID', 'Task Name', 'Room', 'Priority', 'Status', 'Date Created', 'Notes']];
  const priorityHeaders = [['Priority', 'Task Name', 'Room', 'Status', 'Date Created', 'Notes']];
  const completedTasksHeaders = [['Task ID', 'Task Name', 'Room', 'Priority', 'Status', 'Date Created', 'Date Completed', 'Notes']];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "'All Tasks'!A1:G1",
    valueInputOption: 'RAW',
    resource: { values: allTasksHeaders },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "'Priority'!A1:F1",
    valueInputOption: 'RAW',
    resource: { values: priorityHeaders },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "'Completed'!A1:H1",
    valueInputOption: 'RAW',
    resource: { values: completedTasksHeaders },
  });

  // 3. Set Dropdowns
  const rooms = ["Office", "Garage", "Temple", "Shop", "Kitchen", "Dining", "Bath", "Bed", "Living", "Errand", "Yard", "Calls", "Fun"];
  const statuses = ["Pending", "In-progress", "Complete"];
  
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [
        {
          setDataValidation: {
            range: {
              sheetId: allTasksSheetId,
              startRowIndex: 1,
              endRowIndex: 1000,
              startColumnIndex: 2, // Column C (Room)
              endColumnIndex: 3,
            },
            rule: {
              condition: { type: 'ONE_OF_LIST', values: rooms.map(r => ({ userEnteredValue: r })) },
              showCustomUi: true, strict: true,
            },
          },
        },
        {
          setDataValidation: {
            range: {
              sheetId: allTasksSheetId,
              startRowIndex: 1,
              endRowIndex: 1000,
              startColumnIndex: 4, // Column E (Status)
              endColumnIndex: 5,
            },
            rule: {
              condition: { type: 'ONE_OF_LIST', values: statuses.map(s => ({ userEnteredValue: s })) },
              showCustomUi: true, strict: true,
            },
          },
        },
        {
          setDataValidation: {
            range: {
              sheetId: completedTasksSheetId,
              startRowIndex: 1,
              endRowIndex: 1000,
              startColumnIndex: 4, // Column E (Status)
              endColumnIndex: 5,
            },
            rule: {
              condition: { type: 'ONE_OF_LIST', values: statuses.map(s => ({ userEnteredValue: s })) },
              showCustomUi: true, strict: true,
            },
          },
        }
      ],
    },
  });

  return spreadsheetId;
}

/**
 * Synchronizes prioritized tasks from 'All Tasks' to 'Priority'.
 */
async function syncPriority(auth, spreadsheetId) {
  const sheets = google.sheets({ version: 'v4', auth });
  
  // 1. Read All Tasks
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'All Tasks'!A2:G1000",
  });
  
  const rows = response.data.values || [];
  
  // 2. Filter: Priority (D - index 3) is not empty AND Status (E - index 4) is Pending or In-progress
  const prioritizedTasks = rows.filter(row => {
    const priority = row[3];
    const status = row[4] ? row[4].toLowerCase() : '';
    return priority && (status === 'pending' || status === 'in-progress');
  }).map(row => {
    // Priority (index 3), Task Name (index 1), Room (index 2), Status (index 4), Date (index 5), Notes (index 6)
    return [row[3], row[1], row[2], row[4], row[5], row[6]];
  });

  // 3. Sort by Priority (Ascending)
  prioritizedTasks.sort((a, b) => {
    const pA = parseInt(a[0]);
    const pB = parseInt(b[0]);
    return pA - pB;
  });

  // 4. Clear and Update Priority Sheet
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: "'Priority'!A2:F1000",
  });

  if (prioritizedTasks.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'Priority'!A2:F${prioritizedTasks.length + 1}`,
      valueInputOption: 'RAW',
      resource: { values: prioritizedTasks },
    });
  }
}

async function main() {
  const auth = await authorize();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || '1twi7Wxckrwg3qv3pZ7Yp_fPi63W-ziemsnDp1BQx-Cg';
  await initializeSpreadsheet(auth, spreadsheetId);
  await syncPriority(auth, spreadsheetId);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { authorize, initializeSpreadsheet, syncPriority };
