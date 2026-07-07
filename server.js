require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const { linkStore, waitlistCounter, normalizeEmail } = require('./waitlistStore');
const { userOps } = require('./database');

// Same allow-listed college domains and validation rule as the main app's
// signup flow (kept in sync manually since this is an independent codebase).
const ALLOWED_DOMAINS = [
  'rishihood.edu.in',
  'vitbhopal.ac.in',
  'nst.rishihood.edu.in',
  'psy.rishihood.edu.in',
  'csds.rishihood.edu.in',
  'makers.rishihood.edu.in'
];

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const linkLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 6, standardHeaders: true, legacyHeaders: false });
const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const registerLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

async function sendBrevoEmail(email, subject, htmlContent) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || apiKey === 'YOUR_BREVO_API_KEY') {
    throw new Error('BREVO_API_KEY is not configured on the server. Set a real key in .env.');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Delulu Waitlist', email: 'delulu.college.dating@gmail.com' },
      to: [{ email }],
      subject,
      htmlContent
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Brevo send failed: ${response.status} - ${errText}`);
  }
}

function isAllowedCollegeEmail(email) {
  const domain = email.split('@')[1];
  return Boolean(domain) && ALLOWED_DOMAINS.includes(domain);
}

// ---- API: email a verification link to a college email ----
app.post('/api/waitlist/send-verification-email', linkLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email is required.' });
    }
    if (!isAllowedCollegeEmail(email)) {
      return res.status(400).json({ error: 'Only authorized university emails are allowed.' });
    }

    // Real duplicate check against the SAME users collection the main app
    // uses -- not a separate waitlist list.
    const existingUser = await userOps.getByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists. Please log in instead of registering again.' });
    }

    const token = await linkStore.createToken(email);
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    // Points at the dedicated profile-completion page, NOT the waitlist
    // landing page -- clicking the email link should never reopen index.html.
    const verifyLink = `${protocol}://${host}/complete-profile?token=${token}&email=${encodeURIComponent(email)}`;

    const html = `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; text-align: center; border: 1px solid #dec0ba; border-radius: 16px;">
        <h2 style="color: #a53b29; font-size: 24px; margin-bottom: 8px;">Verify your college email</h2>
        <p style="color: #57423e; font-size: 15px; margin-bottom: 24px;">Click the button below to confirm your spot on the Delulu waitlist.</p>
        <a href="${verifyLink}" style="display: inline-block; padding: 14px 28px; background-color: #a53b29; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Verify Email Address</a>
        <p style="color: #8b716d; font-size: 12px; margin-top: 24px;">This link will expire in 15 minutes. If you did not request this, you can safely ignore this email.</p>
      </div>`;

    await sendBrevoEmail(email, 'Verify your email for the Delulu waitlist', html);
    res.json({ success: true });
  } catch (err) {
    console.error('send-verification-email error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to send verification email. Please try again.' });
  }
});

// ---- API: verify the link token (called after the user clicks the email link) ----
app.post('/api/waitlist/verify-token', verifyLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const token = String(req.body.token || '').trim();
    if (!email || !token) return res.status(400).json({ error: 'Token and email are required.' });

    const result = await linkStore.verifyToken(token, email);
    if (!result.ok) return res.status(400).json({ error: result.error });

    res.json({ success: true, email });
  } catch (err) {
    console.error('verify-token error:', err.message);
    res.status(500).json({ error: 'Failed to verify link. Please try again.' });
  }
});

// ---- API: complete profile & registration ----
// This is the ONLY registration endpoint now. It creates a REAL account in
// the same 'users' collection the main app reads/writes, using the same
// field set, password hashing, and duplicate-email rules as the main app's
// own /api/auth/complete-profile flow. There is no separate waitlist-only
// user record -- registered_via: 'waitlist' just tags where the account
// originated.
const AVATAR_PATTERN = /^(male|female)_(0[1-9]|10)$/;

app.post('/api/waitlist/complete-profile', registerLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const gender = String(req.body.gender || '').trim();
    const bio = String(req.body.bio || '').trim();
    const hobbies = Array.isArray(req.body.hobbies) ? req.body.hobbies.map((h) => String(h).trim()).filter(Boolean) : [];
    const avatar = String(req.body.avatar || '').trim();
    const publicKey = req.body.public_key || null;
    const encryptedPrivateKey = req.body.encrypted_private_key || null;

    if (!email || !isAllowedCollegeEmail(email)) {
      return res.status(400).json({ error: 'Only authorized university emails are allowed.' });
    }
    if (!username || username.length < 3 || username.length > 30) {
      return res.status(400).json({ error: 'Username must be between 3 and 30 characters.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    if (!['male', 'female', 'other'].includes(gender)) {
      return res.status(400).json({ error: 'Please select a gender.' });
    }
    if (!avatar || !AVATAR_PATTERN.test(avatar)) {
      return res.status(400).json({ error: 'Please select a valid avatar.' });
    }

    const verified = await linkStore.isVerified(email);
    if (!verified) return res.status(401).json({ error: 'Please verify your college email first.' });

    // Duplicate checks against the real users collection (guards races too).
    const existingByEmail = await userOps.getByEmail(email);
    if (existingByEmail) {
      return res.status(409).json({ error: 'An account with this email already exists. Please log in instead of registering again.' });
    }
    const existingByUsername = await userOps.getByUsername(username);
    if (existingByUsername) {
      return res.status(409).json({ error: 'That username is already taken. Please choose another.' });
    }

    // Same hashing algorithm/cost factor the main app uses.
    const passwordHash = await bcrypt.hash(password, 10);
    await userOps.createFromWaitlist(email, passwordHash, {
      username,
      gender,
      bio,
      hobbies,
      avatar,
      publicKey,
      encryptedPrivateKey
    });

    const count = await waitlistCounter.getCount();
    res.json({ success: true, count });
  } catch (err) {
    console.error('complete-profile error:', err.message);
    res.status(500).json({ error: 'Failed to complete registration. Please try again.' });
  }
});

// ---- API: current waitlist count ----
app.get('/api/waitlist/count', async (req, res) => {
  try {
    const count = await waitlistCounter.getCount();
    res.json({ count });
  } catch (err) {
    console.error('count error:', err.message);
    res.status(500).json({ error: 'Failed to load waitlist count.' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dedicated page opened only from the verification email link. Contains
// nothing but the profile creation form -- never the landing page.
app.get('/complete-profile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'complete-profile.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Delulu waitlist site running on port ${PORT}`);
});
