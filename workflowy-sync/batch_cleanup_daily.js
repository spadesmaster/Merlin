const { authorize, getHeaderMap } = require('./manager.js');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: __dirname + '/.env' });

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const STATE_PATH = path.join(__dirname, 'merlin_state.json');

async function batchCleanup() {
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });

  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetId = res.data.sheets.find(s => s.properties.title === 'Daily').properties.sheetId;

  const dataRes = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "'Daily'!A1:N20" });
  const rows = dataRes.data.values || [];
  const headers = rows[0];

  const getCol = (name) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
  const cols = {
    win: getCol('Win'),
    slp: getCol('Slp'),
    job: getCol('Job'),
    exer: getCol('Exer'),
    war: getCol('Warrior'),
    kng: getCol('King'),
    viz: getCol('Vizier'),
    luv: getCol('Lover'),
    rog: getCol('Rogue'),
    tnk: getCol('Tinker')
  };

  const requests = [];

  const updateCell = (rowIdx, colIdx, value) => {
    if (colIdx === -1) return;
    requests.push({
      updateCells: {
        range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
        rows: [{ values: [{ userEnteredValue: { stringValue: value } }] }],
        fields: 'userEnteredValue'
      }
    });
  };

  const colorCell = (rowIdx, colIdx, r, g, b) => {
    if (colIdx === -1) return;
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
        cell: { userEnteredFormat: { backgroundColor: { red: r, green: g, blue: b } } },
        fields: 'userEnteredFormat.backgroundColor'
      }
    });
  };

  const GREEN = { r: 0.85, g: 1.0, b: 0.85 };
  const RED = { r: 1.0, g: 0.85, b: 0.85 };

  // --- 1. Mar 31 ---
  const mar31Idx = rows.findIndex(r => r[0] && r[0].includes('Mar 31'));
  if (mar31Idx !== -1) {
    const h = state.history["2026-03-31"];
    [cols.win, cols.slp, cols.exer].forEach(c => colorCell(mar31Idx, c, GREEN.r, GREEN.g, GREEN.b));
    // Missions were all effectively DONE or handled
    [cols.war, cols.kng, cols.viz, cols.luv, cols.rog].forEach(c => colorCell(mar31Idx, c, GREEN.r, GREEN.g, GREEN.b));
  }

  // --- 2. Apr 1 ---
  const apr1Idx = rows.findIndex(r => r[0] && r[0].includes('Apr 1'));
  if (apr1Idx !== -1) {
    const h = state.history["2026-04-01"];
    updateCell(apr1Idx, cols.win, "80%");
    [cols.win, cols.slp, cols.exer].forEach(c => colorCell(apr1Idx, c, GREEN.r, GREEN.g, GREEN.b));
    // Manual task color (Removing DONE: via updateCell then coloring)
    updateCell(apr1Idx, cols.war, h.missions.warrior);
    updateCell(apr1Idx, cols.kng, h.missions.king);
    updateCell(apr1Idx, cols.viz, h.missions.vizier);
    updateCell(apr1Idx, cols.luv, h.missions.lover);
    updateCell(apr1Idx, cols.rog, h.missions.rogue);
    [cols.war, cols.kng, cols.luv, cols.rog].forEach(c => colorCell(apr1Idx, c, GREEN.r, GREEN.g, GREEN.b));
  }

  // --- 3. Apr 2 ---
  const apr2Idx = rows.findIndex(r => r[0] && r[0].includes('Apr 2'));
  if (apr2Idx !== -1) {
    const h = state.history["2026-04-02"];
    updateCell(apr2Idx, cols.win, "100%");
    updateCell(apr2Idx, cols.slp, "84");
    [cols.win, cols.slp, cols.exer].forEach(c => colorCell(apr2Idx, c, GREEN.r, GREEN.g, GREEN.b));
    // Missions: NC750 (King) and VB (Rogue) were GREEN
    colorCell(apr2Idx, cols.kng, GREEN.r, GREEN.g, GREEN.b);
    colorCell(apr2Idx, cols.rog, GREEN.r, GREEN.g, GREEN.b);
    // Others RED
    [cols.war, cols.viz, cols.luv].forEach(c => colorCell(apr2Idx, c, RED.r, RED.g, RED.b));
  }

  // --- 4. Apr 3 (Today) ---
  const apr3Idx = rows.findIndex(r => r[0] && r[0].includes('Apr 3'));
  if (apr3Idx !== -1) {
    const m = state.missions.friday;
    updateCell(apr3Idx, cols.war, m.warrior.task);
    updateCell(apr3Idx, cols.kng, m.king.task);
    updateCell(apr3Idx, cols.viz, m.vizier.task);
    updateCell(apr3Idx, cols.luv, m.lover.task);
    updateCell(apr3Idx, cols.rog, m.rogue.task);
    updateCell(apr3Idx, cols.tnk, m.tinker.task);

    if (m.warrior.status === 'GREEN') colorCell(apr3Idx, cols.war, GREEN.r, GREEN.g, GREEN.b);
    if (m.king.status === 'GREEN') colorCell(apr3Idx, cols.kng, GREEN.r, GREEN.g, GREEN.b);
    if (m.lover.status === 'GREEN') colorCell(apr3Idx, cols.luv, GREEN.r, GREEN.g, GREEN.b);
    // Removed RED coloring for in-progress tasks
  }

  // --- 5. Sat Apr 4 ---
  const satIdx = rows.findIndex(r => r[0] && r[0].includes('Apr 4'));
  if (satIdx !== -1) {
    const m = state.missions.saturday;
    updateCell(satIdx, cols.kng, m.king.task);
    updateCell(satIdx, cols.luv, m.lover.task);
    updateCell(satIdx, cols.tnk, m.tinker.task);
  }

  console.log(`Sending batchUpdate with ${requests.length} requests...`);
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, resource: { requests } });
  console.log("Batch cleanup successful.");
}

batchCleanup().catch(err => console.error("Cleanup failed:", err.message));
