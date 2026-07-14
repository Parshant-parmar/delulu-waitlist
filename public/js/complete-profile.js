(function () {
  const stageLoading = document.getElementById('stage-loading');
  const stageInvalid = document.getElementById('stage-invalid');
  const stageProfile = document.getElementById('stage-profile');
  const stageDone = document.getElementById('stage-done');
  const invalidMessage = document.getElementById('invalid-message');

  const profileGender = document.getElementById('profile-gender');
  const avatarPickerContainer = document.getElementById('avatar-picker-container');
  const avatarGrid = document.getElementById('avatar-grid');
  const profileAvatarInput = document.getElementById('profile-avatar');
  const profileError = document.getElementById('profile-error');
  const finalCount = document.getElementById('final-count');
  const btnOk = document.getElementById('btn-ok');

  let verifiedEmail = '';

  function showStage(stage) {
    [stageLoading, stageInvalid, stageProfile, stageDone].forEach((s) => {
      s.classList.add('hidden');
      s.classList.remove('stage-enter');
    });
    stage.classList.remove('hidden');
    stage.classList.add('stage-enter');
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  // ===== Avatar picker (identical logic to the main project's onboarding form) =====
  profileGender.onchange = () => {
    const gender = profileGender.value;
    avatarGrid.innerHTML = '';
    profileAvatarInput.value = '';

    if (!gender) {
      avatarPickerContainer.classList.add('hidden');
      return;
    }

    avatarPickerContainer.classList.remove('hidden');
    let avatars = [];
    if (gender === 'male') {
      for (let i = 1; i <= 10; i++) avatars.push(`male_${String(i).padStart(2, '0')}`);
    } else if (gender === 'female') {
      for (let i = 1; i <= 10; i++) avatars.push(`female_${String(i).padStart(2, '0')}`);
    } else {
      for (let i = 1; i <= 10; i++) {
        avatars.push(`female_${String(i).padStart(2, '0')}`);
        avatars.push(`male_${String(i).padStart(2, '0')}`);
      }
    }

    avatars.forEach((av) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'aspect-square rounded-lg overflow-hidden border border-outline-variant/30 hover:border-primary/50 cursor-pointer transition-all flex items-center justify-center p-1 bg-surface-container';
      wrapper.innerHTML = `<img src="/avatars/${av}.jpeg" class="w-full h-full object-cover">`;
      wrapper.onclick = () => {
        avatarGrid.querySelectorAll('.aspect-square').forEach((el) => el.classList.remove('border-primary', 'border-2', 'ring-2', 'ring-primary/20'));
        wrapper.classList.add('border-primary', 'border-2', 'ring-2', 'ring-primary/20');
        profileAvatarInput.value = av;
      };
      avatarGrid.appendChild(wrapper);
    });
  };

  // ===== Submit profile =====
  document.getElementById('form-profile').onsubmit = async (e) => {
    e.preventDefault();

    const username = document.getElementById('profile-username').value.trim();
    const password = document.getElementById('profile-password').value;
    const gender = profileGender.value;
    const bio = document.getElementById('profile-bio').value.trim();
    const hobbiesStr = document.getElementById('profile-hobbies').value;
    const avatar = profileAvatarInput.value;

    if (!avatar) {
      profileError.textContent = 'Please select an avatar';
      profileError.classList.remove('hidden');
      return;
    }

    let hobbies = [];
    if (hobbiesStr) {
      hobbies = hobbiesStr.split(',').map((s) => s.trim()).filter(Boolean);
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Creating...';
    profileError.classList.add('hidden');

    try {
      // 1. Generate E2EE ECDH Keypair
      const keypair = await E2EECrypto.generateECDHKeypair();

      // 2. Derive local key from password to encrypt private key
      const pbkdf2Key = await E2EECrypto.deriveKeyFromPassword(password, verifiedEmail);
      const encryptedPrivateKey = await E2EECrypto.encryptPrivateKey(keypair.privateKey, pbkdf2Key);

      // 3. Export public key as JWK
      const publicKeyJwk = await E2EECrypto.exportKeyToJwk(keypair.publicKey);

      // 4. Submit profile fields + E2EE keys to the shared users collection
      const data = await api('/api/waitlist/complete-profile', {
        email: verifiedEmail,
        username,
        password,
        gender,
        bio,
        hobbies,
        avatar,
        public_key: publicKeyJwk,
        encrypted_private_key: encryptedPrivateKey
      });

      finalCount.textContent = Number.isFinite(data.count) ? data.count : 126;
      showStage(stageDone);
    } catch (err) {
      profileError.textContent = err.message || 'Failed to create your profile.';
      profileError.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Profile';
    }
  };

  // ===== OK button: return to the waitlist landing page, no re-registration =====
  btnOk.onclick = () => {
    window.location.href = '/';
  };

  // ===== On load: verify the link token; this page exists to be opened only
  // from the verification email, never from the landing page itself =====
  async function init() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const email = params.get('email');

    if (!token || !email) {
      invalidMessage.textContent = 'This page can only be opened from the verification link sent to your email.';
      showStage(stageInvalid);
      return;
    }

    try {
      const data = await api('/api/waitlist/verify-token', { token, email });
      verifiedEmail = data.email || email;
      showStage(stageProfile);
    } catch (err) {
      invalidMessage.textContent = err.message || 'This verification link is invalid or has expired.';
      showStage(stageInvalid);
    }
  }

  init();
})();
