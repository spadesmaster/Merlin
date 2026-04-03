const { authorize } = require('./manager.js');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: __dirname + '/.env' });

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

async function restoreNames() {
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "'Daily'!A1:N10" });
  const rows = res.data.values;
  const headers = rows[0];
  const luvCol = headers.findIndex(h => h.toLowerCase().includes('lover'));
  
  const apr3Idx = rows.findIndex(r => r[0] && r[0].includes('Apr 3'));

  if (apr3Idx !== -1 && luvCol !== -1) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'Daily'!${String.fromCharCode(65 + luvCol)}${apr3Idx + 1}`,
      valueInputOption: 'RAW',
      resource: { values: [['Coleman Saluspa Maintenance']] }
    });
    console.log("Restored 'Coleman Saluspa Maintenance' to Sheet.");
  }
}

restoreNames().catch(console.error);
