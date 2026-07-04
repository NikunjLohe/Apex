const fs = require('fs');
const path = require('path');
const os = require('os');

async function fixCors() {
  try {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const token = data.tokens.access_token;
    
    const bucketsToTry = ['mlm-80f97.appspot.com', 'mlm-80f97.firebasestorage.app'];
    
    for (const bucket of bucketsToTry) {
      console.log(`Trying to set CORS on ${bucket}...`);
      const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cors: [
            {
              origin: ["*"],
              method: ["GET", "PUT", "POST", "DELETE", "OPTIONS"],
              responseHeader: ["*"],
              maxAgeSeconds: 3600
            }
          ]
        })
      });
      
      const result = await response.json();
      if (response.ok) {
        console.log(`SUCCESS! CORS set for ${bucket}.`);
      } else {
        console.error(`Failed for ${bucket}:`, result.error.message);
      }
    }
  } catch (err) {
    console.error("Error running script:", err);
  }
}

fixCors();
