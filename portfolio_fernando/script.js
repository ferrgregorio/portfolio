/* =============================================
   TERMINAL TYPEWRITER
   ============================================= */
const phrases = [
  'backend developer',
  'full stack engineer',
  'api architect',
  'systems builder',
  'Node.js developer',
];

let phraseIndex = 0;
let charIndex = 0;
let isDeleting = false;
const terminalEl = document.getElementById('terminal-text');

function typeWriter() {
  if (!terminalEl) return;
  const current = phrases[phraseIndex];

  if (isDeleting) {
    terminalEl.textContent = current.substring(0, charIndex - 1);
    charIndex--;
  } else {
    terminalEl.textContent = current.substring(0, charIndex + 1);
    charIndex++;
  }

  let speed = isDeleting ? 60 : 100;

  if (!isDeleting && charIndex === current.length) {
    speed = 2200;
    isDeleting = true;
  } else if (isDeleting && charIndex === 0) {
    isDeleting = false;
    phraseIndex = (phraseIndex + 1) % phrases.length;
    speed = 400;
  }

  setTimeout(typeWriter, speed);
}

setTimeout(typeWriter, 800);

/* =============================================
   NAV — scroll border + hamburger
   ============================================= */
const nav = document.getElementById('nav');
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');

window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 20);
});

hamburger.addEventListener('click', () => {
  const isOpen = mobileMenu.classList.toggle('open');
  hamburger.setAttribute('aria-expanded', isOpen);
  mobileMenu.setAttribute('aria-hidden', !isOpen);
});

// Fecha menu ao clicar em link
document.querySelectorAll('.mobile-link').forEach(link => {
  link.addEventListener('click', () => {
    mobileMenu.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    mobileMenu.setAttribute('aria-hidden', 'true');
  });
});

/* =============================================
   FADE-UP SCROLL ANIMATION
   ============================================= */
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
);

const animateEls = [
  '.section-label',
  '.section-title',
  '.sobre-text',
  '.sobre-stats',
  '.stack-group',
  '.project-card',
  '.timeline-item',
  '.contato-text',
  '.contato-form',
  '.stat-card',
];

animateEls.forEach(selector => {
  document.querySelectorAll(selector).forEach((el, i) => {
    el.classList.add('fade-up');
    el.style.transitionDelay = `${i * 0.05}s`;
    observer.observe(el);
  });
});

/* =============================================
   ACTIVE NAV LINK (highlight on scroll)
   ============================================= */
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-links a');

const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(link => {
          link.style.color = '';
          if (link.getAttribute('href') === '#' + entry.target.id) {
            link.style.color = 'var(--text)';
          }
        });
      }
    });
  },
  { threshold: 0.3 }
);

sections.forEach(s => sectionObserver.observe(s));

/* =============================================
   FORM (Formspree)
   ============================================= */
const form = document.getElementById('contact-form');
const submitBtn = document.getElementById('submit-btn');
const formMsg = document.getElementById('form-msg');

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = new FormData(form);
    const action = form.getAttribute('action');

    // Verifica se o Formspree foi configurado
    if (action.includes('SEU_ID_AQUI')) {
      formMsg.style.color = 'var(--amber)';
      formMsg.textContent = 'Configure o Formspree: substitua SEU_ID_AQUI no index.html';
      return;
    }

    submitBtn.textContent = 'enviando...';
    submitBtn.disabled = true;

    try {
      const res = await fetch(action, {
        method: 'POST',
        body: data,
        headers: { Accept: 'application/json' },
      });

      if (res.ok) {
        formMsg.style.color = 'var(--green)';
        formMsg.textContent = 'Mensagem enviada! Retorno em breve.';
        form.reset();
      } else {
        throw new Error('Erro no envio');
      }
    } catch {
      formMsg.style.color = 'var(--red)';
      formMsg.textContent = 'Erro ao enviar. Tente pelo LinkedIn ou e-mail.';
    }

    submitBtn.textContent = 'enviar mensagem';
    submitBtn.disabled = false;
  });
}

/* =============================================
   SMOOTH SCROLL OFFSET (compensa nav fixa)
   ============================================= */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const targetId = anchor.getAttribute('href');
    if (targetId === '#') return;
    const target = document.querySelector(targetId);
    if (!target) return;
    e.preventDefault();
    const offset = 72;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  });
});
