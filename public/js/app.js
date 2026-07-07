(function () {
  document.getElementById('year').textContent = new Date().getFullYear();

  const els = {
    heroCounter: document.getElementById('hero-counter'),
    stageEmail: document.getElementById('stage-email'),
    stageOtp: document.getElementById('stage-otp'),
    stageProfile: document.getElementById('stage-profile'),
    stageDone: document.getElementById('stage-done'),
    formEmail: document.getElementById('form-email'),
    formProfile: document.getElementById('form-profile'),
    inputEmail: document.getElementById('input-email'),
    profileName: document.getElementById('profile-name'),
    profilePassword: document.getElementById('profile-password'),
    emailError: document.getElementById('email-error'),
    otpError: document.getElementById('otp-error'),
    profileError: document.getElementById('profile-error'),
    otpEmailDisplay: document.getElementById('otp-email-display'),
    btnBackEmail: document.getElementById('btn-back-email'),
    btnResendLink: document.getElementById('btn-resend-link'),
    finalCount: document.getElementById('final-count'),
    dots: [1, 2, 3].map((n) => document.getElementById(`step-dot-${n}`))
  };

  let state = { email: '' };

  function showStage(stage) {
    [els.stageEmail, els.stageOtp, els.stageProfile, els.stageDone].forEach((el) => el.classList.add('hidden'));
    stage.classList.remove('hidden');
    stage.classList.add('stage-enter');
  }

  function setDots(activeIndex) {
    els.dots.forEach((dot, i) => {
      dot.classList.remove('active', 'completed');
      if (i < activeIndex) dot.classList.add('completed');
      if (i === activeIndex) dot.classList.add('active');
    });
  }

  function showError(el, message) {
    el.textContent = message;
    el.classList.remove('hidden');
  }

  function hideError(el) {
    el.classList.add('hidden');
  }

  function setLoading(button, loading, labelWhileLoading) {
    if (loading) {
      button.dataset.originalText = button.textContent;
      button.textContent = labelWhileLoading || 'Please wait…';
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
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

  async function refreshCounter() {
    try {
      const res = await fetch('/api/waitlist/count');
      const data = await res.json();
      const count = res.ok && Number.isFinite(data.count) ? data.count : 126;
      els.heroCounter.textContent = `${count} Students Already Joined the Waitlist`;
    } catch (e) {
      els.heroCounter.textContent = '126 Students Already Joined the Waitlist';
    }
  }

  async function sendLink(email) {
    await api('/api/waitlist/send-verification-email', { email });
    state.email = email;
    els.otpEmailDisplay.textContent = email;
    showStage(els.stageOtp);
    setDots(1);
  }

  els.formEmail.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(els.emailError);
    const email = els.inputEmail.value.trim().toLowerCase();
    const btn = document.getElementById('btn-send-otp');
    setLoading(btn, true, 'Sending…');
    try {
      await sendLink(email);
    } catch (err) {
      showError(els.emailError, err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  els.btnResendLink.addEventListener('click', async () => {
    hideError(els.otpError);
    setLoading(els.btnResendLink, true, 'Resending…');
    try {
      await sendLink(state.email);
    } catch (err) {
      showError(els.otpError, err.message);
    } finally {
      setLoading(els.btnResendLink, false);
    }
  });

  els.btnBackEmail.addEventListener('click', () => {
    hideError(els.otpError);
    showStage(els.stageEmail);
    setDots(0);
  });

  els.formProfile.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(els.profileError);
    const name = els.profileName.value.trim();
    const password = els.profilePassword.value;
    if (password.length < 6) {
      showError(els.profileError, 'Password must be at least 6 characters.');
      return;
    }
    const btn = document.getElementById('btn-register');
    setLoading(btn, true, 'Joining…');
    try {
      const data = await api('/api/waitlist/register', { email: state.email, name, password });
      els.finalCount.textContent = Number.isFinite(data.count) ? data.count : 126;
      showStage(els.stageDone);
      refreshCounter();
    } catch (err) {
      showError(els.profileError, err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  // If the page was opened from the verification email link, auto-verify
  // and jump straight to the password/name step -- same pattern the main
  // app's own login page uses for its magic link.
  async function checkVerificationLinkOnLoad() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const email = params.get('email');
    if (!token || !email) return;

    showStage(els.stageOtp);
    els.otpEmailDisplay.textContent = email;
    setDots(1);

    try {
      const data = await api('/api/waitlist/verify-token', { token, email });
      state.email = data.email || email;
      showStage(els.stageProfile);
      setDots(2);
      // Clean the token out of the URL so refreshing doesn't re-submit it.
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      showError(els.otpError, err.message);
    }
  }

  setDots(0);
  refreshCounter();
  checkVerificationLinkOnLoad();
})();
