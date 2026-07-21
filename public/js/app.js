(function () {
  document.getElementById('year').textContent = new Date().getFullYear();

  const els = {
    heroCounter: document.getElementById('hero-counter'),
    stageEmail: document.getElementById('stage-email'),
    stageOtp: document.getElementById('stage-otp'),
    formEmail: document.getElementById('form-email'),
    inputEmail: document.getElementById('input-email'),
    emailError: document.getElementById('email-error'),
    otpError: document.getElementById('otp-error'),
    otpEmailDisplay: document.getElementById('otp-email-display'),
    btnBackEmail: document.getElementById('btn-back-email'),
    btnResendLink: document.getElementById('btn-resend-link'),
    dots: [1, 2, 3].map((n) => document.getElementById(`step-dot-${n}`))
  };

  let state = { email: '' };

  function showStage(stage) {
    [els.stageEmail, els.stageOtp].forEach((el) => el.classList.add('hidden'));
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
      els.heroCounter.textContent = `${count} students have joined. `;
    } catch (e) {
      els.heroCounter.textContent = '126 students have joined.';
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

  // Note: clicking the verification link in the email now opens the
  // dedicated /complete-profile page directly -- this landing page never
  // handles the token, and never shows the profile form or success card.

  setDots(0);
  refreshCounter();
})();
