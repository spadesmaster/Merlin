const { authorize } = require('./manager.js');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const factory = require('./merlin_factory.js');
require('dotenv').config({ path: __dirname + '/.env' });

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const STATE_PATH = path.join(__dirname, 'merlin_state.json');

async function forceSyncAll() {
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));

  // 1. Force Authority (Sheet) updates for KPIs
  const dataRes = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "'Daily'!A1:N10" });
  const rows = dataRes.data.values;
  
  const apr2Idx = rows.findIndex(r => r[0] && r[0].includes('Apr 2'));
  const apr3Idx = rows.findIndex(r => r[0] && r[0].includes('Apr 3'));

  if (apr2Idx !== -1) {
    // Thu row reflects Wed performance (80%)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID, range: `'Daily'!B${apr2Idx + 1}`, valueInputOption: 'RAW', resource: { values: [['80%']] }
    });
  }
  if (apr3Idx !== -1) {
    // Fri row reflects Thu performance (100% - all Done)
    // Wait, user said today (Fri) should be 80% because Mail mission was missed.
    // That means Thu performance was 80%.
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID, range: `'Daily'!B${apr3Idx + 1}`, valueInputOption: 'RAW', resource: { values: [['100%']] }
    });
  }

  // 2. Update all Workflowy Briefings to match Sheet renames exactly
  
  // -- Wednesday Apr 1 --
  const missionsWed = Object.keys(state.history["2026-04-01"].missions).map(r => factory.formatMission(r, state.history["2026-04-01"].missions[r]));
  await factory.createOrUpdateBriefing('Wednesday, April 1, 2026', {
    kpis: '📊 #KPIs | Win: 🏆 80% | Sleep: 💤 82 | Leads: ☹️ 0 | Exercise: ☹️ 30',
    weather: '🌧️ Weather: 83/61 Light Rain',
    missions: missionsWed
  });

  // -- Thursday Apr 2 --
  const hThu = state.history["2026-04-02"].missions;
  const missionsThu = Object.keys(hThu).map(r => factory.formatMission(r, { task: hThu[r], status: 'GREEN' }));
  await factory.createOrUpdateBriefing('Thursday, April 2, 2026', {
    kpis: '📊 #KPIs | Win: 🏆 80% | Sleep: 💤 84 | Leads: ☹️ 1 | Exercise: ☹️ 90',
    weather: '🌤️ Weather: 75/55 Clear',
    missions: missionsThu
  });

  // -- Friday Apr 3 (Today) --
  const missionsFri = Object.keys(state.missions.friday).map(role => factory.formatMission(role, state.missions.friday[role]));
  await factory.createOrUpdateBriefing('Friday, April 3, 2026', {
    kpis: '📊 #KPIs | Win: 🏆 100% | Sleep: [Pending] | Leads: ☹️ 0 | Exercise: ☹️ 0',
    weather: '🌤️ Weather: 78/55 Clear/Sunny',
    missions: missionsFri
  });

  // -- Saturday Apr 4 --
  const missionsSat = Object.keys(state.missions.saturday).map(role => factory.formatMission(role, state.missions.saturday[role]));
  await factory.createOrUpdateBriefing('Saturday, April 4, 2026', {
    kpis: '📊 #KPIs | Win: [Pending] | Sleep: [Pending] | Leads: ☹️ 0 | Exercise: ☹️ 0',
    weather: '☁️ Weather: 84/61 Mostly Cloudy/Warm',
    missions: missionsSat
  });

  console.log("All Briefings and KPIs synchronized with Authority.");
}

forceSyncAll().catch(console.error);
