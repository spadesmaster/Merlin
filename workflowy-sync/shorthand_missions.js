const { authorize } = require('./manager.js');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: __dirname + '/.env' });

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

const MISSION_SHORTHAND = {
  "Insurance Claim + Meds": "Claim/Meds",
  "M/C Research (Shield/Canister/Tires)": "M/C Research",
  "Coleman Saluspa Maintenance": "Hot Tub",
  "Make iced T and chicken": "Iced T/Chicken",
  "Setup S24+ for 1-hand ops": "S24+ Setup",
  "Mail / Checks / Will": "Mail/Will",
  "Execute M/C Gear Install": "M/C Install",
  "Automate KPIs (Slp from Ultrahuman, Weight from Renpho)": "Auto KPI Slp Wt",
  "KPI Auto": "Auto KPI Slp Wt"
};

async function applyShorthand() {
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "'Daily'!A1:N15" });
  const rows = res.data.values;
  const headers = rows[0];
  const getCol = (name) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
  
  const missionCols = [getCol('Warrior'), getCol('King'), getCol('Vizier'), getCol('Lover'), getCol('Rogue'), getCol('Tinker')];
  const dates = ["Fri, Apr 3", "Mon, Apr 6"];

  const requests = [];

  for (const date of dates) {
    const rIdx = rows.findIndex(r => r[0] && r[0].includes(date));
    if (rIdx === -1) continue;

    const row = rows[rIdx];
    missionCols.forEach(cIdx => {
      if (cIdx === -1) return;
      const currentVal = row[cIdx] || '';
      
      // If the cell matches a long-form name, replace it with shorthand
      if (MISSION_SHORTHAND[currentVal]) {
        requests.push({
          updateCells: {
            range: { sheetId: 0, startRowIndex: rIdx, endRowIndex: rIdx + 1, startColumnIndex: cIdx, endColumnIndex: cIdx + 1 },
            rows: [{ values: [{ userEnteredValue: { stringValue: MISSION_SHORTHAND[currentVal] } }] }],
            fields: 'userEnteredValue'
          }
        });
      }
    });
  }

  if (requests.length > 0) {
    const ss = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheetId = ss.data.sheets.find(s => s.properties.title === 'Daily').properties.sheetId;
    requests.forEach(r => r.updateCells.range.sheetId = sheetId);

    console.log(`Applying shorthand to ${requests.length} mission cells...`);
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, resource: { requests } });
    console.log("Mission shorthand applied.");
  } else {
    console.log("No long-form mission names found to shorten.");
  }
}

applyShorthand().catch(console.error);
