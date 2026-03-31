const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const TOKEN_PATH = path.join(__dirname, '../workflowy-sync/token.json');
const CREDENTIALS_PATH = path.join(__dirname, '../workflowy-sync/credentials.json');
const FILE_ID = '1DLLYGqhF64y4oPY33YnXa9FcdtSv9s4cAjSL-9-IPw8';

async function exportGoogleDoc() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oAuth2Client.setCredentials(token);

  const drive = google.drive({ version: 'v3', auth: oAuth2Client });

  try {
    const res = await drive.files.export({
      fileId: FILE_ID,
      mimeType: 'text/plain',
    });

    fs.writeFileSync(path.join(__dirname, 'Letter_to_Judge_Biermann.md'), res.data);
    console.log('Successfully exported latest edits from Google Drive.');
  } catch (err) {
    console.error('Error exporting Google Doc:', err);
  }
}

exportGoogleDoc();
