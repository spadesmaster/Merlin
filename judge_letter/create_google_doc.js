const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const TOKEN_PATH = path.join(__dirname, '../workflowy-sync/token.json');
const CREDENTIALS_PATH = path.join(__dirname, '../workflowy-sync/credentials.json');

async function createGoogleDoc() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oAuth2Client.setCredentials(token);

  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  const docContent = fs.readFileSync(path.join(__dirname, 'Letter_to_Judge_Biermann.md'), 'utf8');

  try {
    const fileMetadata = {
      name: 'Letter to Judge Biermann - Williamson Case 240910007',
      mimeType: 'application/vnd.google-apps.document',
    };
    
    const media = {
      mimeType: 'text/markdown',
      body: docContent,
    };

    const res = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
    });

    console.log('Google Doc created successfully!');
    console.log('Document ID:', res.data.id);
    console.log('View Link:', res.data.webViewLink);
  } catch (err) {
    console.error('Error creating Google Doc:', err);
  }
}

createGoogleDoc();
