const { authorize, getHeaderMap } = require('./manager.js');
const { google } = require('googleapis');
require('dotenv').config({ path: './.env' });

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

async function finalizeTuesdayAndPrepareWednesday() {
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });

  const range = "'Daily'!A1:M100";
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  const rows = res.data.values || [];
  
  const todayDateStr = "Tue, Mar 31";
  const tomorrowDateStr = "Wed, Apr 1";

  const todayRowIdx = rows.findIndex(r => r[0] === todayDateStr);
  const tomorrowRowIdx = rows.findIndex(r => r[0] === tomorrowDateStr);

  if (todayRowIdx !== -1) {
    const row = rows[todayRowIdx];
    // Update Win % to 20%
    row[1] = "20%";
    // Ensure events are there
    row[5] = "Meter@9:30 Jeff@10 Msg@2 VB@5";
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'Daily'!A${todayRowIdx + 1}:M${todayRowIdx + 1}`,
      valueInputOption: 'RAW',
      resource: { values: [row] }
    });
    console.log("Updated Tuesday stats.");
  }

  if (tomorrowRowIdx !== -1) {
    const row = rows[tomorrowRowIdx];
    // Set Warrior Mission if empty
    if (!row[6]) row[6] = "Judge letter / Tidy Van";
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'Daily'!A${tomorrowRowIdx + 1}:M${tomorrowRowIdx + 1}`,
      valueInputOption: 'RAW',
      resource: { values: [row] }
    });
    console.log("Updated Wednesday missions.");
  }
}

finalizeTuesdayAndPrepareWednesday().catch(console.error);
