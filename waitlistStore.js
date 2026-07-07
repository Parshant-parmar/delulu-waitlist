const crypto = require('crypto');
const { getDB } = require('./firebase');

// Public counter shown on the landing page. This is a base offset, not a
// hardcoded final number: every account created through this waitlist
// increases the displayed number by exactly 1, and the real count always
// comes from a live query against the shared Firestore 'users' collection.
const COUNTER_BASE = 126;

// Transient collections used only during the verification handshake. No
// account or personal data lives here -- just a short-lived link token and
// a short-lived "this email was just verified" flag. Safe to keep separate
// from the main app's user schema.
const TOKEN_COLLECTION = 'waitlist_verification_tokens';
const VERIFIED_COLLECTION = 'waitlist_verified_emails';

// The collection real registered users live in. This MUST be the same
// collection the main dating-app reads/writes ('users') -- there is no
// separate 'waitlist' user collection.
const USERS_COLLECTION = 'users';

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

const linkStore = {
  // Generates a one-time link token (same approach the main app uses for
  // its own email verification link) and emails it instead of a typed code.
  async createToken(email) {
    const db = getDB();
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
    await db.collection(TOKEN_COLLECTION).doc(token).set({
      email: normalizeEmail(email),
      expiresAt,
      used: false,
      createdAt: Date.now()
    });
    return token;
  },

  async verifyToken(token, email) {
    const db = getDB();
    const cleanEmail = normalizeEmail(email);
    const ref = db.collection(TOKEN_COLLECTION).doc(String(token));
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, error: 'Invalid or expired verification link.' };

    const data = snap.data();
    if (data.used) return { ok: false, error: 'This verification link has already been used.' };
    if (Date.now() > data.expiresAt) return { ok: false, error: 'This verification link has expired. Please request a new one.' };
    if (data.email !== cleanEmail) return { ok: false, error: 'Invalid verification link.' };

    await ref.update({ used: true, usedAt: Date.now() });
    await db.collection(VERIFIED_COLLECTION).doc(cleanEmail).set({ verifiedAt: Date.now() });
    return { ok: true };
  },

  async isVerified(email) {
    const db = getDB();
    const snap = await db.collection(VERIFIED_COLLECTION).doc(normalizeEmail(email)).get();
    if (!snap.exists) return false;
    const data = snap.data();
    // Verification window: valid for 30 minutes after the link was clicked.
    return Date.now() - (data.verifiedAt || 0) < 30 * 60 * 1000;
  }
};

const waitlistCounter = {
  // Reads the live count of real users whose account originated on the
  // waitlist site, straight from the shared 'users' collection, and adds
  // it to the fixed base. Nothing about future values is hardcoded.
  async getCount() {
    const db = getDB();
    const snap = await db.collection(USERS_COLLECTION).where('registered_via', '==', 'waitlist').count().get();
    const realCount = snap.data().count || 0;
    return COUNTER_BASE + realCount;
  }
};

module.exports = { linkStore, waitlistCounter, normalizeEmail, COUNTER_BASE };
