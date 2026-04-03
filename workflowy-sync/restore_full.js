const { authorize } = require('./manager.js');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const factory = require('./merlin_factory.js');
require('dotenv').config({ path: __dirname + '/.env' });

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const STATE_PATH = path.join(__dirname, 'merlin_state.json');

async function restoreFull() {
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "'Daily'!A1:N10" });
  const rows = res.data.values;
  const headers = rows[0];
  const getCol = (name) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
  
  const cols = {
    war: getCol('Warrior'),
    kng: getCol('King'),
    viz: getCol('Vizier'),
    luv: getCol('Lover'),
    rog: getCol('Rogue'),
    tnk: getCol('Tinker')
  };

  const apr3Idx = rows.findIndex(r => r[0] && r[0].includes('Apr 3'));

  if (apr3Idx !== -1) {
    const m = state.missions.friday;
    const values = [[
      m.warrior.task, m.king.task, m.vizier.task, m.lover.task, m.rogue.task, m.tinker.task
    ]];
    
    // Using a simple range update for today's mission block (Warrior through Tinker)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'Daily'!${String.fromCharCode(65 + cols.war)}${apr3Idx + 1}:${String.fromCharCode(65 + cols.tnk)}${apr3Idx + 1}`,
      valueInputOption: 'RAW',
      resource: { values }
    });
    console.log("Restored all Friday missions to Sheet.");
  }

  // Update Friday Briefing
  const missionsFri = Object.keys(state.missions.friday).map(role => factory.formatMission(role, state.missions.friday[role]));
  await factory.createOrUpdateBriefing('Friday, April 3, 2026', {
    kpis: '📊 #KPIs | Win: 🏆 100% | Sleep: 💤 84 | Leads: ☹️ 0 | Exercise: ☹️ 0',
    weather: '🌤️ Weather: 78/55 Clear/Sunny',
    missions: missionsFri
  });
  
  console.log("Friday Briefing updated with long-form names.");
}

restoreFull().catch(console.error);
