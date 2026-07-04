const fs = require('fs');
const path = require('path');
const os = require('os');

async function listBuckets() {
  try {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const token = data.tokens.access_token;
    
    console.log("Fetching buckets for project mlm-80f97...");
    const response = await fetch(`https://storage.googleapis.com/storage/v1/b?project=mlm-80f97`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const result = await response.json();
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Error:", err);
  }
}

listBuckets();
