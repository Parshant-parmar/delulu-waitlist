// Dynamic 3D Heart Background Animation using HTML5 Canvas
(function() {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  let canvas = document.getElementById('heart-bg');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'heart-bg';
    canvas.className = 'fixed inset-0 -z-10 pointer-events-none';
    document.body.appendChild(canvas);
  }

  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap DPR so ultra-high-res phones don't overwork the GPU
  let width = window.innerWidth;
  let height = window.innerHeight;

  function sizeCanvas() {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeCanvas();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      width = window.innerWidth;
      height = window.innerHeight;
      sizeCanvas();
      if (prefersReduced) {
        drawStaticHeart();
      }
    }, 150);
  });

  let mouseX = width / 2;
  let mouseY = height / 2;
  let targetMouseX = width / 2;
  let targetMouseY = height / 2;

  window.addEventListener('mousemove', (e) => {
    targetMouseX = e.clientX;
    targetMouseY = e.clientY;
  });

  function getHeartPoint(t, scale) {
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);
    return {
      x: x * scale,
      y: -y * scale
    };
  }

  if (prefersReduced) {
    drawStaticHeart();
    return;
  }

  function drawStaticHeart() {
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(165, 59, 41, 0.08)';
    ctx.lineWidth = 1.5;
    
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.beginPath();
    const scale = Math.min(width, height) * 0.15 / 16;
    for (let t = 0; t <= 2 * Math.PI; t += 0.02) {
      const pt = getHeartPoint(t, scale);
      if (t === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  class Heart {
    constructor() {
      this.reset();
      this.tCurrent = Math.random() * 2 * Math.PI;
      this.state = 'drawing';
    }

    reset() {
      this.scale = 1.5 + Math.random() * 2.5;
      this.baseX = Math.random() * width;
      this.baseY = Math.random() * height;
      this.depth = 0.2 + Math.random() * 0.8;
      this.tCurrent = 0;
      this.state = 'drawing';
      this.opacity = 0.12;
      this.holdFrames = 120 + Math.random() * 120;
      this.fadeFrames = 60;
      this.currentFade = 0;
      this.drawSpeed = 0.015 + Math.random() * 0.015;
      
      this.angleX = (Math.random() - 0.5) * 0.2;
      this.angleY = (Math.random() - 0.5) * 0.2;
      this.wobbleSpeed = 0.005 + Math.random() * 0.005;
      this.wobbleTime = Math.random() * 100;
    }

    update(mX, mY) {
      const shiftX = (mX - width / 2) * this.depth * 0.04;
      const shiftY = (mY - height / 2) * this.depth * 0.04;
      this.x = this.baseX + shiftX;
      this.y = this.baseY + shiftY;

      this.wobbleTime += this.wobbleSpeed;

      if (this.state === 'drawing') {
        this.tCurrent += this.drawSpeed;
        if (this.tCurrent >= 2 * Math.PI) {
          this.tCurrent = 2 * Math.PI;
          this.state = 'holding';
        }
      } else if (this.state === 'holding') {
        this.holdFrames--;
        if (this.holdFrames <= 0) {
          this.state = 'fading';
        }
      } else if (this.state === 'fading') {
        this.currentFade++;
        this.opacity = 0.12 * (1 - this.currentFade / this.fadeFrames);
        if (this.currentFade >= this.fadeFrames) {
          this.reset();
        }
      }
    }

    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      
      const tiltX = Math.sin(this.wobbleTime) * this.angleX;
      const tiltY = Math.cos(this.wobbleTime) * this.angleY;
      ctx.transform(1, tiltY, tiltX, 1, 0, 0);

      ctx.strokeStyle = `rgba(165, 59, 41, ${this.opacity})`;
      ctx.lineWidth = 1.2 + this.depth * 0.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      for (let t = 0; t <= this.tCurrent; t += 0.04) {
        const pt = getHeartPoint(t, this.scale);
        if (t === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  const heartCount = width < 640 ? 2 : 4; // lighter workload on phones
  const hearts = Array.from({ length: heartCount }, () => new Heart());

  let active = true;
  document.addEventListener('visibilitychange', () => {
    active = !document.hidden;
    if (active) loop();
  });

  function loop() {
    if (!active) return;
    ctx.clearRect(0, 0, width, height);

    mouseX += (targetMouseX - mouseX) * 0.08;
    mouseY += (targetMouseY - mouseY) * 0.08;

    hearts.forEach(heart => {
      heart.update(mouseX, mouseY);
      heart.draw();
    });

    requestAnimationFrame(loop);
  }

  loop();
})();
