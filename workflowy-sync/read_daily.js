const { authorize } = require('./manager.js');
const { google } = require('googleapis');
require('dotenv').config({ path: './.env' });

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

async function readDaily() {
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });

  const range = "'Daily'!A1:M20";
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  const rows = res.data.values || [];

  console.log(JSON.stringify(rows, null, 2));
}

readDaily().catch(console.error);
