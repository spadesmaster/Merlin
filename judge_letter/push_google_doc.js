const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const TOKEN_PATH = path.join(__dirname, '../workflowy-sync/token.json');
const CREDENTIALS_PATH = path.join(__dirname, '../workflowy-sync/credentials.json');
const FILE_ID = '1DLLYGqhF64y4oPY33YnXa9FcdtSv9s4cAjSL-9-IPw8';

async function updateGoogleDoc() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oAuth2Client.setCredentials(token);

  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  const docContent = fs.readFileSync(path.join(__dirname, 'Letter_to_Judge_Biermann.md'), 'utf8');

  // Ensure Certificate of Service is at the end
  const certificateText = `
I have filed this request via facsimile to ensure it is received prior to the 8:30 AM hearing on April 2, 2026. A physical copy of this letter, along with the required signed documents and the non-refundable money order for court costs, has been dispatched via overnight delivery and is scheduled for delivery to the Court by mid-day on April 2nd.

---

### CERTIFICATE OF SERVICE
I hereby certify that a true and correct copy of the foregoing was served via facsimile on April 1, 2026, to the Office of the Prosecuting Attorney:

**Cynthia Maria Davenport**
Prosecuting Attorney, Warren County
Fax: (636) 456-7817
`;

  const finalContent = docContent.trim() + certificateText;

  try {
    await drive.files.update({
      fileId: FILE_ID,
      media: {
        mimeType: 'text/plain',
        body: finalContent,
      },
    });

    fs.writeFileSync(path.join(__dirname, 'Letter_to_Judge_Biermann.md'), finalContent);
    console.log('Successfully finalized Google Doc and local file.');
  } catch (err) {
    console.error('Error updating Google Doc:', err);
  }
}

updateGoogleDoc();
