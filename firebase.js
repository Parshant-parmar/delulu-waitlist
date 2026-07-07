// Standalone Firebase Admin initializer for the waitlist site.
// This is a SEPARATE Node process from the main dating-app — it does not
// import, require, or share any code with it. The only thing shared is the
// underlying Firestore database, because both apps point at the same
// Firebase project via the same service-account credentials (env vars).

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let db;

function getDB() {
  if (!db) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        'Missing Firebase credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, ' +
        'and FIREBASE_PRIVATE_KEY in .env (use the SAME values as the main app).'
      );
    }

    let app;
    if (getApps().length === 0) {
      app = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n')
        })
      });
    } else {
      app = getApps()[0];
    }
    db = getFirestore(app);
  }
  return db;
}

module.exports = { getDB };
