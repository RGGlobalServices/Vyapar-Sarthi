// Navbar scroll effect
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
});

function renderTopAuthCta() {
  const cta = document.getElementById('topAuthCta');
  if (!cta) return;

  const isLoggedIn = Boolean(localStorage.getItem('ks_auth'));

  if (!isLoggedIn) {
    cta.innerHTML = `
      <a href="login.html" class="btn btn-ghost" data-i18n="nav_login">Login</a>
      <a href="login.html?next=payment.html%3Fplan%3Dprofessional" class="btn btn-primary" data-i18n="nav_trial">Start Free Trial</a>
    `;
    return;
  }

  const apiUser = (() => {
    try { return JSON.parse(localStorage.getItem('ks_api_user')); } catch { return null; }
  })();
  const userName = apiUser?.full_name || localStorage.getItem('ks_user_name') || 'User';
  const planLabel = localStorage.getItem('ks_plan_name') || 'Free Trial';
  const locale = (typeof ksGetLocale === 'function' ? ksGetLocale() : 'en');
  const initial = userName.charAt(0).toUpperCase();

  cta.innerHTML = `
    <div class="user-menu" id="userMenu">
      <button class="user-menu-trigger" id="userMenuTrigger">
        <span class="user-avatar">${initial}</span>
        <span class="user-name">${userName}</span>
        <span class="user-arrow">▾</span>
      </button>
      <div class="user-dropdown" id="userDropdown">
        <div class="dropdown-header">
          <span class="dropdown-plan-label">Current Plan</span>
          <span class="dropdown-plan-name">${planLabel}</span>
        </div>
        <a href="${(window.KS_CONFIG?.FRONTEND_URL || 'https://kirana-manager-fronend.onrender.com')}/${locale}/settings" class="dropdown-item">
          <span>⚙️</span> Manage Plan
        </a>
        <a href="${(window.KS_CONFIG?.FRONTEND_URL || 'https://kirana-manager-fronend.onrender.com')}/${locale}" class="dropdown-item">
          <span>📊</span> Open Dashboard
        </a>
        <div class="dropdown-divider"></div>
        <button class="dropdown-item dropdown-logout" id="logoutBtn">
          <span>🚪</span> Logout
        </button>
      </div>
    </div>
  `;

  const trigger = document.getElementById('userMenuTrigger');
  const dropdown = document.getElementById('userDropdown');
  const logoutBtn = document.getElementById('logoutBtn');

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('show');
  });

  document.addEventListener('click', () => dropdown.classList.remove('show'));
  dropdown.addEventListener('click', (e) => e.stopPropagation());

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      document.cookie = 'ks_auth=; path=/; max-age=0';
      localStorage.removeItem('ks_auth');
      localStorage.removeItem('ks_api_user');
      localStorage.removeItem('ks_plan');
      localStorage.removeItem('ks_plan_name');
      localStorage.removeItem('ks_txnid');
      localStorage.removeItem('ks_language');
      renderTopAuthCta();
    });
  }
}

renderTopAuthCta();

// Hamburger menu
const hamburger = document.getElementById('hamburger');
const navMobile = document.getElementById('navMobile');
hamburger.addEventListener('click', () => {
  navMobile.classList.toggle('open');
});
document.querySelectorAll('.nav-mobile a').forEach(link => {
  link.addEventListener('click', () => navMobile.classList.remove('open'));
});

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
  });
});

// FAQ accordion
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const answer = item.querySelector('.faq-answer');
    const isOpen = answer.classList.contains('open');

    // Close all
    document.querySelectorAll('.faq-answer').forEach(a => a.classList.remove('open'));
    document.querySelectorAll('.faq-question').forEach(b => b.classList.remove('active'));

    if (!isOpen) {
      answer.classList.add('open');
      btn.classList.add('active');
    }
  });
});

// Scroll reveal animation
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll(
  '.feature-card, .testi-card, .bf-card, .benefit-stat'
).forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(el);
});

// Price cards: animate inner content only so the CTA buttons stay clickable
document.querySelectorAll('.price-card').forEach(card => {
  card.style.opacity = '1'; // card itself always visible
  const inner = document.createElement('div');
  inner.className = 'price-card-inner-anim';
  inner.style.cssText = 'opacity:0;transform:translateY(20px);transition:opacity 0.5s ease,transform 0.5s ease;';
  while (card.firstChild) inner.appendChild(card.firstChild);
  card.appendChild(inner);
  observer.observe(inner);
});

// Animate stats count up
function animateValue(el, start, end, duration, prefix = '', suffix = '') {
  const range = end - start;
  const startTime = performance.now();
  const update = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + range * eased);
    el.textContent = prefix + current.toLocaleString('en-IN') + suffix;
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

const statsObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const statVals = entry.target.querySelectorAll('.stat-value');
      statVals.forEach(el => {
        const text = el.textContent;
        if (text.includes('₹')) {
          const num = parseInt(text.replace(/[^\d]/g, ''));
          if (!isNaN(num)) animateValue(el, 0, num, 1200, '₹');
        }
      });
      statsObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

const dashMockup = document.querySelector('.dashboard-mockup');
if (dashMockup) statsObserver.observe(dashMockup);

// Auth-aware pricing CTAs
function initPriceCtas() {
  const locale = (typeof ksGetLocale === 'function' ? ksGetLocale() : 'en');
  const frontendUrl = (window.KS_CONFIG?.FRONTEND_URL || 'https://kirana-manager-fronend.onrender.com');
  const isLoggedIn = Boolean(localStorage.getItem('ks_auth'));

  document.querySelectorAll('.price-cta').forEach(el => {
    el.addEventListener('click', (e) => {
      if (isLoggedIn) {
        e.preventDefault();
        const plan = el.dataset.plan || 'professional';
        localStorage.setItem('ks_plan', plan);
        const planNames = { basic: 'Small Store Plan', professional: 'Big Store Plan', business: 'Wholesale Plan' };
        localStorage.setItem('ks_plan_name', planNames[plan] || 'Big Store Plan');
        window.location.href = `${frontendUrl}/${locale}`;
      }
    });
  });
}

initPriceCtas();

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
