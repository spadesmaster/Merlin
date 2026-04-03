const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');

// Scopes for the Google Sheets and Drive APIs
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.readonly',
];

const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

/**
 * Loads the client secrets from the local file.
 */
async function authorize() {
  const content = fs.readFileSync(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const client = keys.installed || keys.web;
  const { client_id, client_secret, redirect_uris } = client;
  
  // Use the first redirect URI (usually http://localhost:3000)
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Check if we have a saved token
  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  }

  // Get a new token
  return getNewToken(oAuth2Client);
}

/**
 * Gets a new token by prompting for user authorization.
 */
async function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  console.log('Authorize this app by visiting this url:');
  console.log(authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question('Enter the code from that page here: ', async (code) => {
      rl.close();
      try {
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        
        // Store the token to disk for future executions
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        console.log('Token stored to', TOKEN_PATH);
        resolve(oAuth2Client);
      } catch (err) {
        console.error('Error retrieving access token', err);
        reject(err);
      }
    });
  });
}

authorize().catch(console.error);
