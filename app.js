(() => {
  document.documentElement.classList.add('js');
  const RELEASES_API = 'https://api.github.com/repos/godsonj64/electroplate-releases/releases/latest';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Header: glass once the page scrolls; mobile menu.
  const header = document.querySelector('[data-header]');
  const nav = document.querySelector('[data-nav]');
  const toggle = document.querySelector('[data-nav-toggle]');
  const toggleLabel = document.querySelector('[data-nav-toggle-label]');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const setMenu = (open) => {
    nav.classList.toggle('is-open', open);
    header.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggleLabel.textContent = open ? 'Close navigation' : 'Open navigation';
  };
  toggle.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
  nav.addEventListener('click', (event) => { if (event.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setMenu(false); });

  // Downloads: point the hero button at this computer's installer.
  const ua = `${navigator.userAgentData?.platform || ''} ${navigator.platform || ''} ${navigator.userAgent || ''}`;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const platform = isMobile ? null : (/Win/i.test(ua) ? 'windows' : (/Mac/i.test(ua) ? 'mac' : null));
  const heroDownload = document.querySelector('[data-download]');
  const heroLabel = document.querySelector('[data-download-label]');

  function applyPlatform() {
    const option = platform && document.querySelector(`[data-platform="${platform}"]`);
    document.querySelectorAll('.download-option').forEach((node) => node.classList.toggle('is-recommended', node === option));
    if (option) {
      heroDownload.href = option.href;
      heroLabel.textContent = platform === 'windows' ? 'Download for Windows' : 'Download for macOS';
    } else {
      heroDownload.href = '#download';
      heroLabel.textContent = 'View downloads';
    }
  }
  applyPlatform();

  // Keep version, notes and installer links on the newest release without
  // editing the page each time. The static links stay if this fails.
  const isGithub = (url) => typeof url === 'string' && url.startsWith('https://github.com/godsonj64/electroplate-releases/');
  fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    .then((release) => {
      const version = String(release.tag_name || '').replace(/^v/, '');
      if (!/^\d+\.\d+\.\d+$/.test(version)) return;
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const pick = (pattern) => assets.find((asset) => pattern.test(asset.name) && isGithub(asset.browser_download_url));
      const found = { dmg: pick(/\.dmg$/i), zip: pick(/-mac\.zip$/i), exe: pick(/\.exe$/i) };
      document.querySelectorAll('[data-asset]').forEach((node) => {
        const asset = found[node.dataset.asset];
        if (asset) node.href = asset.browser_download_url;
      });
      document.querySelectorAll('[data-version]').forEach((node) => { node.textContent = version; });
      if (isGithub(release.html_url)) {
        document.querySelectorAll('[data-release-notes]').forEach((node) => { node.href = release.html_url; });
      }
      applyPlatform();
    })
    .catch(() => {});

  // Studio / Easy mode showcase.
  const tabs = Array.from(document.querySelectorAll('[data-demo-tab]'));
  const panels = Array.from(document.querySelectorAll('[data-demo-panel]'));

  function selectDemo(key, focus) {
    tabs.forEach((tab) => {
      const selected = tab.dataset.demoTab === key;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    });
    panels.forEach((panel) => { panel.hidden = panel.dataset.demoPanel !== key; });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectDemo(tab.dataset.demoTab, false));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      selectDemo(next.dataset.demoTab, true);
    });
  });

  // Radiance: a damped spring chases a slow drifting path, or the cursor.
  const hero = document.querySelector('.hero');
  const radiance = document.querySelector('[data-radiance]');
  if (hero && radiance) {
    const drift = (t) => {
      const w = hero.clientWidth;
      const h = Math.min(hero.clientHeight, 920);
      return [w * (0.5 + 0.27 * Math.sin(t / 5200)), h * (0.34 + 0.11 * Math.sin(t / 3700 + 1.3))];
    };
    const place = (x, y) => {
      radiance.style.setProperty('--x', `${x.toFixed(1)}px`);
      radiance.style.setProperty('--y', `${y.toFixed(1)}px`);
    };
    if (reduceMotion) {
      const [x, y] = drift(0);
      place(x, y);
    } else {
      let [x, y] = drift(performance.now());
      let vx = 0;
      let vy = 0;
      let pointer = null;
      let last = 0;
      let running = false;
      const STIFFNESS = 14;
      const DAMPING = 6.4;
      const frame = (now) => {
        if (!running) return;
        const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
        last = now;
        const [tx, ty] = pointer || drift(now);
        vx += ((tx - x) * STIFFNESS - vx * DAMPING) * dt;
        vy += ((ty - y) * STIFFNESS - vy * DAMPING) * dt;
        x += vx * dt;
        y += vy * dt;
        place(x, y);
        window.requestAnimationFrame(frame);
      };
      const start = () => { if (!running) { running = true; last = 0; window.requestAnimationFrame(frame); } };
      const stop = () => { running = false; };
      hero.addEventListener('pointermove', (event) => {
        if (event.pointerType !== 'mouse') return;
        const rect = hero.getBoundingClientRect();
        pointer = [event.clientX - rect.left, event.clientY - rect.top];
      });
      hero.addEventListener('pointerleave', () => { pointer = null; });
      let inView = true;
      const sync = () => (inView && !document.hidden ? start() : stop());
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }).observe(hero);
      } else {
        sync();
      }
      document.addEventListener('visibilitychange', sync);
    }
  }

  // Hero window leans back and settles flat as you scroll into it.
  const stage = document.querySelector('[data-tilt]');
  if (stage && !reduceMotion) {
    let ticking = false;
    const update = () => {
      ticking = false;
      const rect = stage.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, 1 - (rect.top - window.innerHeight * 0.25) / (window.innerHeight * 0.55)));
      stage.style.setProperty('--tilt', `${(14 * (1 - progress)).toFixed(2)}deg`);
      stage.style.setProperty('--tilt-scale', (0.96 + 0.04 * progress).toFixed(4));
    };
    const request = () => { if (!ticking) { ticking = true; window.requestAnimationFrame(update); } };
    update();
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
  }

  // Reveal on scroll.
  const reveals = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach((node) => node.classList.add('is-visible'));
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach((node) => observer.observe(node));
  }

  document.querySelectorAll('[data-year]').forEach((node) => { node.textContent = String(new Date().getFullYear()); });
})();
