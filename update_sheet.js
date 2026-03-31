const { google } = require('googleapis');
const { authorize } = require('./workflowy-sync/manager.js');
require('dotenv').config({ path: './workflowy-sync/.env' });

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

async function run() {
    const auth = await authorize();
    const sheets = google.sheets({ version: 'v4', auth });

    // 1. Update Headers
    const headers = [['DAILY GOALS', 'Win', 'Slp', 'Job', 'Exer', 'Events', 'Warrior Mission', 'Vizier Mission', 'King Mission', 'Lover Mission', 'Rogue Mission', 'Extra Wins', 'Blocked']];
    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: "'Daily'!A1",
        valueInputOption: 'RAW',
        resource: { values: headers }
    });

    // 2. Update Monday Stats (Row 3 based on current data)
    // Date is Mar 30. Win: 90%, Slp: 43 (recorded on Tue row?), Job: 0, Exer: 0
    // Actually, user said Sleep was 43 "last night", which is recorded on the Tue (Mar 31) row usually or the Mon row?
    // In your sheet, Mar 30 had 86 sleep. Mar 31 is blank. 
    // I will put 90% Win in Mon row, and 43 Sleep in Tue row.
    
    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: "'Daily'!B3", // Mon Win%
        valueInputOption: 'RAW',
        resource: { values: [['90%']] }
    });
    
    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: "'Daily'!C4", // Tue Sleep
        valueInputOption: 'RAW',
        resource: { values: [['43']] }
    });

    console.log('Sheet headers and Monday stats updated.');
}

run().catch(console.error);
