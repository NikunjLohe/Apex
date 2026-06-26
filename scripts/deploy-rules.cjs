/* Deploy Firestore security rules via the Firebase Rules REST API using the
 * service account key (bypasses the firebase CLI's serviceusage check).
 * Run: node scripts/deploy-rules.cjs */
const { cert } = require('firebase-admin/app')
const path = require('path')
const fs = require('fs')

const sa = require(path.resolve(__dirname, '..', 'serviceAccountKey.json'))
const projectId = sa.project_id
const rulesText = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8')

async function main() {
  const credential = cert(sa)
  const { access_token: token } = await credential.getAccessToken()
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const base = 'https://firebaserules.googleapis.com/v1'

  // 1) Create a ruleset
  const createRes = await fetch(`${base}/projects/${projectId}/rulesets`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: rulesText }] } }),
  })
  const createBody = await createRes.json()
  if (!createRes.ok) throw new Error('Create ruleset failed: ' + JSON.stringify(createBody))
  const rulesetName = createBody.name
  console.log('✓ Created ruleset:', rulesetName)

  // 2) Point the cloud.firestore release at the new ruleset (update or create)
  const releaseName = `projects/${projectId}/releases/cloud.firestore`
  let relRes = await fetch(`${base}/${releaseName}?updateMask=rulesetName`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ release: { name: releaseName, rulesetName } }),
  })
  if (relRes.status === 404) {
    relRes = await fetch(`${base}/projects/${projectId}/releases`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: releaseName, rulesetName }),
    })
  }
  const relBody = await relRes.json()
  if (!relRes.ok) throw new Error('Release failed: ' + JSON.stringify(relBody))

  console.log('\n✅ Firestore rules deployed to', projectId, '\n')
  process.exit(0)
}

main().catch((e) => { console.error('❌', e.message); process.exit(1) })
