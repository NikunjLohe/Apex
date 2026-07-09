import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, setDoc, serverTimestamp, getDocs, collection } from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            'AIzaSyD5fcJcJABzW5uv6POSxNA0oTzkZG8hNvU',
  authDomain:        'mlm-80f97.firebaseapp.com',
  projectId:         'mlm-80f97',
  storageBucket:     'mlm-80f97.firebasestorage.app',
  messagingSenderId: '723541617943',
  appId:             '1:723541617943:web:530d2921b50c86ac7a5b52',
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

const TEST_USERS = [
  {
    email: 'superadmin@apex.test',
    password: 'TestPass@2024!',
    name: 'QA Super Admin',
    rank: 18,
    isSuperAdmin: true,
    sponsorCode: 'QASUPER',
    phone: '9999999000',
  },
  {
    email: 'admin@apex.test',
    password: 'TestPass@2024!',
    name: 'QA Admin',
    rank: 14,
    isSuperAdmin: false,
    sponsorCode: 'QAADMIN',
    phone: '9999999001',
  },
  {
    email: 'manager@apex.test',
    password: 'TestPass@2024!',
    name: 'QA Manager',
    rank: 10,
    isSuperAdmin: false,
    sponsorCode: 'QAMANAGER',
    phone: '9999999002',
  },
  {
    email: 'agent@apex.test',
    password: 'TestPass@2024!',
    name: 'QA Agent',
    rank: 1,
    isSuperAdmin: false,
    sponsorCode: 'QAAGENT',
    phone: '9999999003',
  }
]

async function run() {
  console.log('Signing in as admin@apex.com...')
  await signInWithEmailAndPassword(auth, 'admin@apex.com', 'Apex@12345')
  console.log('✓ Signed in successfully!')

  console.log('Registering test users using Client SDK...')
  
  // Find a branch to associate
  const branchesSnap = await getDocs(collection(db, 'branches'))
  let branchId = 'main-branch'
  if (!branchesSnap.empty) {
    branchId = branchesSnap.docs[0].id
  }
  console.log(`Using branch ID: ${branchId}`)

  for (const tu of TEST_USERS) {
    let uid
    try {
      const userCred = await createUserWithEmailAndPassword(auth, tu.email, tu.password)
      uid = userCred.user.uid
      console.log(`✓ Registered new user in Auth: ${tu.email} (${uid})`)
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        console.log(`• Email already in use in Auth: ${tu.email}`)
        // If already in use, we still want to update their document. Let's find their UID from their email.
        // We can query the users collection to get the UID of the document.
        const usersSnap = await getDocs(collection(db, 'users'))
        const matchedUser = usersSnap.docs.find(d => d.data().email === tu.email)
        if (matchedUser) {
          uid = matchedUser.id
          console.log(`✓ Resolved existing UID: ${uid} for ${tu.email}`)
        } else {
          console.log(`⚠️ Email is in Auth but document not found in Firestore for ${tu.email}`)
        }
      } else {
        console.error(`❌ Failed to register ${tu.email}:`, err.message)
        continue
      }
    }

    if (uid) {
      const userRef = doc(db, 'users', uid)
      await setDoc(userRef, {
        name: tu.name,
        email: tu.email,
        phone: tu.phone,
        rank: tu.rank,
        sponsorCode: tu.sponsorCode,
        isSuperAdmin: tu.isSuperAdmin,
        status: 'active',
        branchId: branchId,
        referredBy: null,
        profileCompleted: true,
        aadhaarNumber: '123456789012',
        joinDate: serverTimestamp(),
        createdAt: serverTimestamp(),
        bankDetails: {
          accountHolderName: tu.name,
          bankName: 'HDFC Bank',
          branch: 'Mumbai Branch',
          accountNumber: '123456789012',
          ifscCode: 'HDFC0000001'
        },
        panNumber: 'ABCDE1234F'
      })
      console.log(`✓ Wrote Firestore document for: ${tu.name} with profileCompleted: true`)
    }
  }
  
  console.log('Sign out...')
  await auth.signOut()
  console.log('Done!')
}

run().catch(console.error)
