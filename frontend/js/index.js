document.addEventListener('DOMContentLoaded', () => {
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');
  let menuOpen = false;

  hamburger.addEventListener('click', () => {
    menuOpen = !menuOpen;
    navLinks.classList.toggle('open', menuOpen);
    const spans = hamburger.querySelectorAll('span');
    if (menuOpen) {
      spans[0].style.transform = 'translateY(7px) rotate(45deg)';
      spans[1].style.opacity = '0';
      spans[2].style.transform = 'translateY(-7px) rotate(-45deg)';
    } else {
      spans[0].style.transform = '';
      spans[1].style.opacity = '';
      spans[2].style.transform = '';
    }
  });

  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      menuOpen = false;
      navLinks.classList.remove('open');
      const spans = hamburger.querySelectorAll('span');
      spans[0].style.transform = '';
      spans[1].style.opacity = '';
      spans[2].style.transform = '';
    });
  });

  const stepItems = document.querySelectorAll('.step-item');
  let currentStep = 1;
  let stepInterval;

  const stepScreenContents = [
    {
      label: 'Create a group',
      html: `
        <p class="mockup-label">Create a group</p>
        <div class="mockup-input-row">
          <div class="mockup-input filled">Goa Trip 2025</div>
          <div class="mockup-btn">Next →</div>
        </div>
        <div class="mockup-avatars-row">
          <div class="m-avatar" style="background:#EDE9FE">R</div>
          <div class="m-avatar" style="background:#D1FAE5">P</div>
          <div class="m-avatar" style="background:#FEF3C7">A</div>
          <div class="m-avatar add-more">+</div>
        </div>
      `
    },
    {
      label: 'Log an expense',
      html: `
        <p class="mockup-label">Add expense</p>
        <div class="mockup-input-row">
          <div class="mockup-input filled">Beach Dinner</div>
          <div class="mockup-input filled" style="max-width:90px;">₹3,200</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">
          <div style="background:rgba(108,99,255,0.15);color:#8B85FF;padding:6px 12px;border-radius:999px;font-size:0.78rem;font-weight:600;">Equal split</div>
          <div style="background:var(--c-surface2);color:var(--c-text-muted);padding:6px 12px;border-radius:999px;font-size:0.78rem;">By %</div>
          <div style="background:var(--c-surface2);color:var(--c-text-muted);padding:6px 12px;border-radius:999px;font-size:0.78rem;">Exact</div>
        </div>
        <div style="margin-top:16px;font-size:0.8rem;color:var(--c-text-muted);">Each person owes <strong style="color:var(--c-text);">₹640</strong></div>
      `
    },
    {
      label: 'Review balances',
      html: `
        <p class="mockup-label">Balances — Goa Trip</p>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="m-avatar" style="background:#EDE9FE;width:30px;height:30px;font-size:0.75rem;">R</div>
              <span style="font-size:0.85rem;">Rohan</span>
            </div>
            <span style="font-size:0.88rem;font-weight:700;color:#A8FF78;">+₹1,920</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="m-avatar" style="background:#D1FAE5;width:30px;height:30px;font-size:0.75rem;">P</div>
              <span style="font-size:0.85rem;">Priya</span>
            </div>
            <span style="font-size:0.88rem;font-weight:700;color:#EF4444;">−₹640</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="m-avatar" style="background:#FEF3C7;width:30px;height:30px;font-size:0.75rem;">A</div>
              <span style="font-size:0.85rem;">Aisha</span>
            </div>
            <span style="font-size:0.88rem;font-weight:700;color:#EF4444;">−₹1,280</span>
          </div>
        </div>
      `
    },
    {
      label: 'Settle up',
      html: `
        <p class="mockup-label">Settle up</p>
        <div style="background:rgba(168,255,120,0.08);border:1px solid rgba(168,255,120,0.2);border-radius:12px;padding:16px;margin-top:8px;">
          <p style="font-size:0.8rem;color:var(--c-text-muted);margin-bottom:6px;">Simplified — just 1 payment</p>
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="m-avatar" style="background:#FEF3C7;width:30px;height:30px;font-size:0.75rem;">A</div>
            <span style="font-size:0.82rem;color:var(--c-text-muted);">pays</span>
            <div class="m-avatar" style="background:#EDE9FE;width:30px;height:30px;font-size:0.75rem;">R</div>
            <strong style="margin-left:auto;font-size:0.95rem;color:#A8FF78;">₹1,280</strong>
          </div>
        </div>
        <div style="margin-top:14px;display:flex;justify-content:flex-end;">
          <div class="mockup-btn" style="font-size:0.82rem;">Mark as paid ✓</div>
        </div>
      `
    }
  ];

  function setActiveStep(step) {
    stepItems.forEach((item, i) => {
      item.classList.toggle('active', i + 1 === step);
    });

    const mockup = document.querySelector('.mockup-inner');
    if (mockup) {
      mockup.style.opacity = '0';
      mockup.style.transform = 'translateY(8px)';
      setTimeout(() => {
        mockup.innerHTML = stepScreenContents[step - 1].html;
        mockup.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
        mockup.style.opacity = '1';
        mockup.style.transform = 'translateY(0)';
      }, 200);
    }
    currentStep = step;
  }

  const mockupInner = document.querySelector('.mockup-inner');
  if (mockupInner) {
    mockupInner.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
  }

  stepItems.forEach((item, i) => {
    item.addEventListener('click', () => {
      clearInterval(stepInterval);
      setActiveStep(i + 1);
      startStepInterval();
    });
  });

  function startStepInterval() {
    stepInterval = setInterval(() => {
      const next = (currentStep % 4) + 1;
      setActiveStep(next);
    }, 3200);
  }

  startStepInterval();

  const statNums = document.querySelectorAll('.stat-num[data-target]');

  const formatStatNum = (val, target) => {
    if (target >= 100000) return (val / 100000).toFixed(1) + 'L+';
    if (target >= 10000) return Math.floor(val / 1000) + 'K+';
    if (target >= 100) return Math.floor(val) + '%';
    return Math.floor(val).toLocaleString('en-IN');
  };

  const animateStats = (entries, observer) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseInt(el.getAttribute('data-target'));
      const duration = 1800;
      const step = 16;
      const totalSteps = duration / step;
      let current = 0;
      const increment = target / totalSteps;

      const timer = setInterval(() => {
        current = Math.min(current + increment, target);
        el.textContent = formatStatNum(current, target);
        if (current >= target) clearInterval(timer);
      }, step);

      observer.unobserve(el);
    });
  };

  const statsObserver = new IntersectionObserver(animateStats, { threshold: 0.5 });
  statNums.forEach(el => statsObserver.observe(el));

  const useCards = document.querySelectorAll('.use-card');
  useCards.forEach(card => {
    const color = card.getAttribute('data-color');
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = color + '55';
      card.style.boxShadow = `0 12px 40px ${color}18`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = '';
      card.style.boxShadow = '';
    });
  });

  const revealEls = document.querySelectorAll('.feature-card, .use-card, .testi-card, .step-item, .stat-item');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  revealEls.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = `opacity 0.5s ease ${(i % 4) * 80}ms, transform 0.5s ease ${(i % 4) * 80}ms`;
    revealObserver.observe(el);
  });

  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offset = 80;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });
});