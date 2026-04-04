const { authorize } = require('./manager.js');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const factory = require('./merlin_factory.js');
require('dotenv').config({ path: __dirname + '/.env' });

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const STATE_PATH = path.join(__dirname, 'merlin_state.json');

async function syncKPIs() {
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });

  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  state.stats.win_percent = '80%';
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "'Daily'!A1:B20" });
  const rows = res.data.values;
  const apr3Idx = rows.findIndex(r => r[0] && r[0].includes('Apr 3'));

  if (apr3Idx !== -1) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'Daily'!B${apr3Idx + 1}`,
      valueInputOption: 'RAW',
      resource: { values: [['80%']] }
    });
    console.log("Updated Win % for Apr 3 in Sheet.");
  }

  const missionsFri = Object.keys(state.missions.friday).map(role => factory.formatMission(role, state.missions.friday[role]));
  await factory.createOrUpdateBriefing('Friday, April 3, 2026', {
    kpis: factory.formatKPIs({ win: '80%', sleep: 84, leads: 0, exercise: 90 }),
    weather: '🌤️ Weather: 78/55 Clear/Sunny',
    missions: missionsFri
  });

  const missionsSat = Object.keys(state.missions.saturday).map(role => factory.formatMission(role, state.missions.saturday[role]));
  await factory.createOrUpdateBriefing('Saturday, April 4, 2026', {
    kpis: factory.formatKPIs({ leads: 0, exercise: 0 }),
    weather: '☁️ Weather: 84/61 Mostly Cloudy/Warm',
    missions: missionsSat
  });

  console.log("KPIs and Briefings for today and tomorrow updated.");
}

syncKPIs().catch(console.error);
