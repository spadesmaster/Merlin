const { authorize, getHeaderMap } = require('./manager.js');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: __dirname + '/.env' });

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const STATE_PATH = path.join(__dirname, 'merlin_state.json');

async function updateDailyMission() {
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });

  if (!fs.existsSync(STATE_PATH)) {
    console.error("State file not found.");
    return;
  }
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  
  // Use the date string directly from state to avoid timezone issues
  // Expected format: YYYY-MM-DD
  const dateParts = state.date.split('-');
  const todayDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
  
  // Format to match "Fri, Apr 3" (abbreviated day, abbreviated month, day)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateStr = `${days[todayDate.getDay()]}, ${months[todayDate.getMonth()]} ${todayDate.getDate()}`;
  const fullDayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][todayDate.getDay()];

  console.log(`Searching for row with date: "${dateStr}" (Full day: ${fullDayName})`);

  const range = "'Daily'!A1:M100";
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  const rows = res.data.values || [];

  const rowIndex = rows.findIndex(r => r[0] && r[0].includes(dateStr));

  if (rowIndex === -1) {
    console.error(`Row for "${dateStr}" not found in Daily tab.`);
    return;
  }

  const missions = state.missions[fullDayName];
  if (!missions) {
    console.error(`No missions found for ${fullDayName} in state.`);
    return;
  }

  const row = rows[rowIndex];
  const headers = rows[0];
  const getCol = (name) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
  
  const warCol = getCol('Warrior');
  const vizCol = getCol('Vizier');
  const kngCol = getCol('King');
  const luvCol = getCol('Lover');
  const rogCol = getCol('Rogue');
  const tnkCol = getCol('Tinker');
  
  console.log(`Columns found: WAR:${warCol}, VIZ:${vizCol}, KNG:${kngCol}, LUV:${luvCol}, ROG:${rogCol}, TNK:${tnkCol}`);

  if (warCol !== -1) row[warCol] = missions.warrior?.task || '';
  if (vizCol !== -1) row[vizCol] = missions.vizier?.task || '';
  if (kngCol !== -1) row[kngCol] = missions.king?.task || '';
  if (luvCol !== -1) row[luvCol] = missions.lover?.task || '';
  if (rogCol !== -1) row[rogCol] = missions.rogue?.task || '';
  if (tnkCol !== -1) row[tnkCol] = missions.tinker?.task || '';

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'Daily'!A${rowIndex + 1}`,
    valueInputOption: 'RAW',
    resource: { values: [row] }
  });

  console.log(`Updated "${dateStr}" missions in Sheet.`);
}

updateDailyMission().catch(console.error);
