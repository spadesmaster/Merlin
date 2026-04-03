const { authorize } = require('./manager.js');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: './.env' });

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

async function updateGoals() {
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });

  const range = "'Daily'!A1:M15";
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  const rows = res.data.values || [];

  const mar31Idx = rows.findIndex(r => r[0] === "Tue, Mar 31");
  const apr1Idx = rows.findIndex(r => r[0] === "Wed, Apr 1");
  const apr2Idx = rows.findIndex(r => r[0] === "Thu, Apr 2");

  // Update March 31
  if (mar31Idx !== -1) {
    const row = rows[mar31Idx];
    row[1] = "90%"; // Win
    row[2] = "79";  // Slp
    row[3] = "0";   // Job
    row[4] = "30";  // Exer
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'Daily'!A${mar31Idx + 1}:M${mar31Idx + 1}`,
      valueInputOption: 'RAW',
      resource: { values: [row] }
    });
    console.log("Updated March 31 stats in Sheet.");
  }

  // Update April 1
  if (apr1Idx !== -1) {
    const row = rows[apr1Idx];
    row[1] = "100%"; // Win (Assuming completion)
    row[2] = "82";   // Slp
    row[6] = "DONE: Judge letter Filed";
    row[7] = "DONE: MC Prep Complete";
    row[8] = "DONE: Mail / Checks / Will";
    row[9] = "DONE: Early Bed (11 PM)";
    row[10] = "DONE: VB (Cancelled)";
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'Daily'!A${apr1Idx + 1}:M${apr1Idx + 1}`,
      valueInputOption: 'RAW',
      resource: { values: [row] }
    });
    console.log("Updated April 1 stats in Sheet.");
  }

  // Update April 2 (Today)
  if (apr2Idx !== -1) {
    const row = rows[apr2Idx];
    row[5] = "Court Clerk Check@9:00"; // Events
    row[6] = "Tidy Van";
    row[7] = "Research NC750X Listing";
    row[8] = "Costco / Walmart / Adv Auto";
    row[9] = "Assemble workbench";
    row[10] = "Configure 'Niagara Bridge' + Install Bullzip + SPF Fix";
    row[11] = "Deploy One UI 'Stacked Armory'"; // Extra Wins
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'Daily'!A${apr2Idx + 1}:M${apr2Idx + 1}`,
      valueInputOption: 'RAW',
      resource: { values: [row] }
    });
    console.log("Updated April 2 missions in Sheet.");
  }
}

updateGoals().catch(console.error);
