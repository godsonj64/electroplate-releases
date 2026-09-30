(() => {
  document.documentElement.classList.add('js');
  const RELEASES_API = 'https://api.github.com/repos/godsonj64/electroplate-releases/releases?per_page=12';
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
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { setMenu(false); closeSheets(); } });

  // Downloads: point the hero button at this computer's installer.
  const ua = `${navigator.userAgentData?.platform || ''} ${navigator.platform || ''} ${navigator.userAgent || ''}`;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const platform = isMobile ? null : (/Win/i.test(ua) ? 'windows' : (/Mac/i.test(ua) ? 'mac' : null));
  const downloadButtons = Array.from(document.querySelectorAll('[data-download]'));

  function applyPlatform() {
    const option = platform && document.querySelector(`[data-platform="${platform}"]`);
    document.querySelectorAll('.download-option').forEach((node) => node.classList.toggle('is-recommended', node === option));
    for (const button of downloadButtons) {
      const label = button.querySelector('[data-download-label]');
      button.href = option ? option.href : '#download';
      if (label) label.textContent = option ? (platform === 'windows' ? 'Download for Windows' : 'Download for macOS') : 'View downloads';
    }
  }
  applyPlatform();

  // Releases: one request keeps the version, the installer links and both
  // dropdown panels on the newest builds. The page's own text and links stay
  // if it fails; nothing sends visitors to GitHub's pages, only straight to
  // the installer files.
  const isGithub = (url) => typeof url === 'string' && url.startsWith('https://github.com/godsonj64/electroplate-releases/');
  const versionOf = (release) => String(release.tag_name || '').replace(/^v/, '');
  const filesOf = (release) => {
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const pick = (pattern) => assets.find((asset) => pattern.test(asset.name) && isGithub(asset.browser_download_url));
    return { dmg: pick(/\.dmg$/i), zip: pick(/-mac\.zip$/i), exe: pick(/\.exe$/i) };
  };
  const dateOf = (release, month = 'short') => {
    const d = new Date(release.published_at || release.created_at || '');
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month, year: 'numeric' });
  };
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  // A release's notes, boiled down: each paragraph that opens with a bold
  // headline becomes one point, the headline plus its first sentence.
  const plain = (md) => md.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
  function highlightsOf(release, limit = 4) {
    const out = [];
    for (const para of String(release.body || '').split(/\n\s*\n/)) {
      const m = /^\s*\*\*(.+?)\*\*\s*([\s\S]*)$/.exec(para);
      if (!m) continue;
      const rest = plain(m[2]);
      const first = (rest.match(/^.+?[.!?](?=\s|$)/) || [rest])[0];
      out.push({ title: plain(m[1]).replace(/[.:]$/, ''), detail: first.length > 230 ? `${first.slice(0, 227).trimEnd()}…` : first });
      if (out.length >= limit) break;
    }
    if (!out.length) {
      const text = plain(String(release.body || ''));
      if (text) out.push({ title: `Version ${versionOf(release)}`, detail: (text.match(/^.+?[.!?](?=\s|$)/) || [text])[0] });
    }
    return out;
  }

  function renderNews(releases) {
    const [latest, ...earlier] = releases;
    const list = document.querySelector('[data-news-list]');
    const date = document.querySelector('[data-news-date]');
    if (date) date.textContent = dateOf(latest, 'long');
    // The page carries a written summary of the release it was published
    // with; a newer release is summarised from its own notes.
    if (list && list.dataset.newsVersion !== versionOf(latest)) {
      const items = highlightsOf(latest);
      if (items.length) {
        list.replaceChildren(...items.map((item) => {
          const li = el('li');
          li.append(el('strong', '', item.title), el('span', '', item.detail));
          return li;
        }));
        list.dataset.newsVersion = versionOf(latest);
      }
    }
    const box = document.querySelector('[data-news-earlier]');
    const olist = document.querySelector('[data-news-earlier-list]');
    if (box && olist && earlier.length) {
      olist.replaceChildren(...earlier.slice(0, 5).map((release) => {
        const li = el('li');
        const head = highlightsOf(release, 1)[0];
        li.append(el('b', '', versionOf(release)), el('small', '', dateOf(release)), el('span', '', head ? head.title : ''));
        return li;
      }));
      box.hidden = false;
    }
  }

  function renderDownloads(releases) {
    const list = document.querySelector('[data-downloads-list]');
    if (!list) return;
    const kinds = [['dmg', 'macOS', 'DMG'], ['zip', 'macOS', 'ZIP'], ['exe', 'Windows', 'EXE']];
    list.replaceChildren(...releases.slice(0, 6).map((release, index) => {
      const row = el('li', index === 0 ? 'dl-row is-latest' : 'dl-row');
      const version = el('div', 'dl-version');
      version.append(el('strong', '', versionOf(release)));
      if (index === 0) version.append(el('span', 'dl-badge', 'Latest'));
      version.append(el('small', '', dateOf(release)));
      const links = el('div', 'dl-files');
      const files = filesOf(release);
      for (const [key, os, kind] of kinds) {
        const asset = files[key];
        if (!asset) continue;
        const a = el('a');
        a.href = asset.browser_download_url;
        a.setAttribute('download', '');
        a.append(el('b', '', os), document.createTextNode(` ${kind}`));
        if (asset.size) a.append(el('small', '', `${Math.round(asset.size / 1048576)} MB`));
        links.append(a);
      }
      row.append(version, links);
      return row;
    }));
  }

  let releasesLoad = null;
  function loadReleases() {
    if (releasesLoad) return releasesLoad;
    const status = document.querySelector('[data-downloads-status]');
    releasesLoad = fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((all) => {
        const releases = (Array.isArray(all) ? all : [])
          .filter((r) => !r.draft && !r.prerelease && /^\d+\.\d+\.\d+$/.test(versionOf(r)));
        if (!releases.length) throw new Error('no releases');
        const latest = releases[0];
        const found = filesOf(latest);
        document.querySelectorAll('[data-asset]').forEach((node) => {
          const asset = found[node.dataset.asset];
          if (asset) node.href = asset.browser_download_url;
        });
        document.querySelectorAll('[data-version]').forEach((node) => { node.textContent = versionOf(latest); });
        applyPlatform();
        renderNews(releases);
        renderDownloads(releases);
        if (status) status.textContent = '';
      })
      .catch(() => {
        if (status) status.textContent = 'Older versions could not be listed just now. The latest version above is ready to download.';
      });
    return releasesLoad;
  }
  loadReleases();

  // Dropdown panels: half a page that drops from the top, closed with the
  // button, Escape, or a click outside. Focus moves in and back out.
  const sheets = Array.from(document.querySelectorAll('[data-sheet]'));
  let returnFocus = null;
  function openSheet(id) {
    const sheet = document.getElementById(id);
    if (!sheet) return;
    const wasOpen = sheets.some((s) => !s.hidden);
    sheets.forEach((s) => { if (s !== sheet) { s.hidden = true; s.classList.remove('is-open'); } });
    if (!wasOpen) returnFocus = document.activeElement;
    setMenu(false);
    sheet.hidden = false;
    const body = sheet.querySelector('.sheet-body');
    if (body) body.scrollTop = 0;
    document.documentElement.classList.add('sheet-open');
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => sheet.classList.add('is-open')));
    const close = sheet.querySelector('.sheet-close');
    if (close) close.focus({ preventScroll: true });
    loadReleases();
  }
  function closeSheets() {
    const open = sheets.filter((s) => !s.hidden);
    if (!open.length) return;
    open.forEach((s) => {
      s.classList.remove('is-open');
      window.setTimeout(() => { if (!s.classList.contains('is-open')) s.hidden = true; }, reduceMotion ? 0 : 320);
    });
    document.documentElement.classList.remove('sheet-open');
    if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }
  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-open-sheet]');
    if (opener) { event.preventDefault(); openSheet(opener.dataset.openSheet); return; }
    if (event.target.closest('[data-sheet-close]')) { closeSheets(); return; }
    // An in-page link inside a panel, or in the header above it, closes it on the way.
    if (event.target.closest('[data-sheet] a[href^="#"], [data-header] a')) closeSheets();
  });
  // Keep Tab inside the open panel.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const sheet = sheets.find((s) => !s.hidden);
    if (!sheet) return;
    const focusable = Array.from(sheet.querySelectorAll('a[href], button:not([disabled])')).filter((n) => n.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

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

  // Radiance: a band of lit dots drifting slowly through the dot field.
  const hero = document.querySelector('.hero');
  const radiance = document.querySelector('[data-radiance]');
  if (hero && radiance) {
    const place = (t) => {
      const w = hero.clientWidth;
      const h = Math.min(hero.clientHeight, 920);
      radiance.style.setProperty('--x', `${(w * (0.5 + 0.3 * Math.sin(t / 7000))).toFixed(1)}px`);
      radiance.style.setProperty('--y', `${(h * (0.34 + 0.1 * Math.sin(t / 5100 + 1.3))).toFixed(1)}px`);
    };
    if (reduceMotion) {
      place(0);
    } else {
      let running = false;
      const frame = (now) => {
        if (!running) return;
        place(now);
        window.requestAnimationFrame(frame);
      };
      const start = () => { if (!running) { running = true; window.requestAnimationFrame(frame); } };
      const stop = () => { running = false; };
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

  // Hero build readout: the real invoice-desk build replayed at speed, stage by
  // stage — the clock runs through its real timings (created by 1:55, refined
  // by 3:05, running at 3:42) and the display's LED patch takes each stage's
  // shade (displays.js cross-fades it when data-shade changes).
  const readout = document.querySelector('[data-readout]');
  if (readout) {
    const STAGES = [
      { shade: 'generate', label: 'Creating', ms: 4200, pct: [0, 40], clock: [0, 115], files: [0, 7] },
      { shade: 'review', label: 'Refining', ms: 3000, pct: [40, 55], clock: [115, 185], files: [7, 7] },
      { shade: 'install', label: 'Installing', ms: 1800, pct: [55, 85], clock: [185, 205], files: [7, 7] },
      { shade: 'launch', label: 'Launching', ms: 1800, pct: [85, 100], clock: [205, 222], files: [7, 7] },
      { shade: 'good', label: 'Running', ms: 4200, pct: [100, 100], clock: [222, 222], files: [7, 7] }
    ];
    // The meter's cells are coloured by the stage whose share of the run they cover, as in the app.
    const BANDS = [['generate', 40], ['review', 55], ['install', 85], ['launch', 101]];
    const SEGMENTS = 24;
    const meter = readout.querySelector('[data-readout-meter]');
    const cells = Array.from({ length: SEGMENTS }, (_, i) => {
      const cell = document.createElement('i');
      const mid = ((i + 0.5) / SEGMENTS) * 100;
      cell.dataset.stage = BANDS.find(([, end]) => mid < end)[0];
      meter.appendChild(cell);
      return cell;
    });
    const tag = readout.querySelector('[data-readout-stage]');
    const clock = readout.querySelector('[data-readout-clock]');
    const pct = readout.querySelector('[data-readout-pct]');
    const files = readout.querySelector('[data-readout-files]');
    const total = STAGES.reduce((sum, stage) => sum + stage.ms, 0);
    const lerp = (a, b, t) => a + (b - a) * t;
    const time = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

    const render = (t) => {
      let start = 0; let stage = STAGES[STAGES.length - 1]; let k = 1;
      for (const s of STAGES) {
        if (t < start + s.ms) { stage = s; k = (t - start) / s.ms; break; }
        start += s.ms;
      }
      if (readout.dataset.shade !== stage.shade) {
        readout.dataset.shade = stage.shade;
        tag.dataset.stage = stage.shade;
        tag.textContent = stage.label;
      }
      const p = lerp(stage.pct[0], stage.pct[1], k);
      pct.textContent = String(Math.round(p));
      clock.textContent = time(lerp(stage.clock[0], stage.clock[1], k));
      files.textContent = String(Math.round(lerp(stage.files[0], stage.files[1], k)));
      const lit = Math.round((p / 100) * SEGMENTS);
      cells.forEach((cell, i) => cell.classList.toggle('on', i < lit));
    };

    // Until the loop runs (and throughout, for reduced motion) the readout shows
    // the finished build, with its meter lit to match.
    render(total - 1);
    if (!reduceMotion) {
      let running = false; let origin = 0; let paused = 0;
      const frame = (now) => {
        if (!running) return;
        render((now - origin) % total);
        window.requestAnimationFrame(frame);
      };
      const play = () => {
        if (running) return;
        running = true;
        const now = performance.now();
        origin = paused ? now - paused : now;
        window.requestAnimationFrame(frame);
      };
      const pause = () => {
        if (!running) return;
        running = false;
        paused = (performance.now() - origin) % total;
      };
      let visible = true;
      const sync = () => (visible && !document.hidden ? play() : pause());
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }).observe(readout);
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
    }, { rootMargin: '0px 0px -2% 0px', threshold: 0.02 });
    reveals.forEach((node) => observer.observe(node));
  }

  document.querySelectorAll('[data-year]').forEach((node) => { node.textContent = String(new Date().getFullYear()); });
})();
