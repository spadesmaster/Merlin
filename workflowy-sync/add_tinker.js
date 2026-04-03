const { authorize } = require('./manager.js');
const { google } = require('googleapis');
require('dotenv').config({ path: __dirname + '/.env' });

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

async function addTinkerColumn() {
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });

  const range = "'Daily'!A1:Z1";
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  const headers = res.data.values[0];

  if (headers.includes('Tinker Mission')) {
    console.log("Tinker Mission column already exists.");
    return;
  }

  const rogueIdx = headers.indexOf('Rogue Mission');
  if (rogueIdx === -1) {
    console.error("Rogue Mission column not found. Cannot insert Tinker.");
    return;
  }

  // Insert "Tinker Mission" after Rogue Mission
  headers.splice(rogueIdx + 1, 0, 'Tinker Mission');

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "'Daily'!A1",
    valueInputOption: 'RAW',
    resource: { values: [headers] }
  });

  console.log("Added 'Tinker Mission' column to Daily tab.");
}

addTinkerColumn().catch(console.error);
