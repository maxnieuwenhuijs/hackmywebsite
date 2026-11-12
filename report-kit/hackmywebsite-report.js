/* ==========================================================================
   hackmywebsite.ai report kit: interaction and motion
   --------------------------------------------------------------------------
   No dependencies. Everything is read from the markup, so a generator only
   has to emit HTML with these hooks (see report-kit/voorbeeld.html):

   details[data-finding]  one per finding: data-n, data-ease, data-impact (1-5),
                          data-sev (kritiek|hoog|middel|laag|info), data-status
                          (bevestigd|vermoedelijk); inside: .finding__title,
                          .where and [data-lede] (used by the inspector)
   [data-matrix]          risk map host: data-y-labels / data-x-labels ("a|b|c|d|e")
   [data-preview]         inspector next to the map, filled through [data-slot]
   [data-open="n"]        opens finding n and scrolls to it
   [data-filter="key"]    severity filter: alle | ernstig | middel | klein
   [data-expand-all]      opens or closes every finding
   [data-reveal]          fades in on scroll; [data-stagger] staggers its children
   [data-enter]           fades in on load (hero), order via style="--i:n"
   [data-count="12"]      counts up when visible
   .meter[data-value]     5-step scale (label span + b)
   [data-term="id"]       glossary word, explained from #woord-<id> (dt + dd)
   [data-print]           prints; every <details> opens first
   .code-wrap             gets a copy button
   a[href="#id"]          also opens the closed <details> around its target
   ========================================================================== */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));
  const number = new Intl.NumberFormat('nl-NL');

  const SEVERITY = { kritiek: 'Kritiek', hoog: 'Hoog', middel: 'Middel', laag: 'Laag', info: 'Ter info' };
  const FILTERS = {
    alle: () => true,
    ernstig: (sev) => sev === 'kritiek' || sev === 'hoog',
    middel: (sev) => sev === 'middel',
    klein: (sev) => sev === 'laag' || sev === 'info',
  };

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } },
  };

  let syncExpandAll = () => {};

  /* ---- visibility: one shared observer ------------------------------------ */
  const callbacks = new WeakMap();
  const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        (callbacks.get(entry.target) || []).forEach((cb) => cb(entry.target));
        callbacks.delete(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 })
    : null;

  function whenVisible(el, cb) {
    if (!observer || reduceMotion) { cb(el); return; }
    const list = callbacks.get(el);
    if (list) { list.push(cb); return; }
    callbacks.set(el, [cb]);
    observer.observe(el);
  }

  /* ---- theme ------------------------------------------------------------- */
  function initTheme() {
    const button = $('[data-theme-toggle]');
    if (!button) return;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
    const current = () => root.dataset.theme || (systemDark.matches ? 'dark' : 'light');
    const sync = () => {
      const label = current() === 'dark' ? 'Licht thema' : 'Donker thema';
      button.setAttribute('aria-label', label);
      button.title = label;
    };
    button.addEventListener('click', () => {
      const next = current() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      store.set('vs-theme', next);
      sync();
    });
    systemDark.addEventListener?.('change', sync);
    sync();
  }

  /* ---- scroll reveal and count-up ---------------------------------------- */
  function initReveal() {
    $$('[data-stagger]').forEach((group) => {
      Array.from(group.children).forEach((child, i) => {
        child.style.setProperty('--i', i);
        if (!child.hasAttribute('data-reveal')) child.setAttribute('data-reveal', '');
      });
    });
    $$('[data-reveal]').forEach((el) => whenVisible(el, () => el.classList.add('is-in')));
  }

  function initCounters() {
    if (reduceMotion) return; // the markup already holds the final value
    $$('[data-count]').forEach((el) => {
      const target = Number(el.dataset.count);
      if (!Number.isFinite(target)) return;
      el.textContent = number.format(0);
      whenVisible(el, () => {
        const start = performance.now();
        const duration = 1200;
        const frame = (now) => {
          const t = Math.min(1, (now - start) / duration);
          el.textContent = number.format(Math.round(target * (1 - Math.pow(1 - t, 4))));
          if (t < 1) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    });
  }

  /* ---- 5-step meters ----------------------------------------------------- */
  function setMeter(meter, value) {
    let dots = $('.meter__dots', meter);
    if (!dots) {
      dots = document.createElement('span');
      dots.className = 'meter__dots';
      dots.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 5; i++) {
        const dot = document.createElement('i');
        dot.style.setProperty('--d', i);
        dots.append(dot);
      }
      meter.insertBefore(dots, $('b', meter));
    }
    Array.from(dots.children).forEach((dot, i) => dot.classList.toggle('on', i < value));
    meter.dataset.value = value;
    const label = $('b', meter);
    if (label) label.textContent = `${value} ${({ nl: "van", en: "of", de: "von", fr: "sur", es: "de", pt: "de", it: "di", zh: "/" }[document.documentElement.lang] || "van")} 5`;
  }

  function initMeters() {
    $$('.meter[data-value]').forEach((meter) => setMeter(meter, Number(meter.dataset.value) || 0));
  }

  /* ---- findings ---------------------------------------------------------- */
  function readFindings() {
    return $$('[data-finding]').map((el) => ({
      el,
      n: Number(el.dataset.n),
      ease: Number(el.dataset.ease),
      impact: Number(el.dataset.impact),
      sev: el.dataset.sev,
      suspected: el.dataset.status === 'vermoedelijk',
      title: $('.finding__title', el)?.textContent.trim() ?? '',
      lede: $('[data-lede]', el)?.textContent.trim() ?? '',
      where: $('.where', el)?.textContent.trim() ?? '',
    }));
  }

  function openAncestors(el) {
    for (let d = el.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
    el.closest('[data-reveal]')?.classList.add('is-in');
  }

  function flash(el) {
    el.classList.remove('is-flash');
    void el.offsetWidth; // restart the animation
    el.classList.add('is-flash');
  }

  function openFinding(n) {
    const el = $(`[data-finding][data-n="${n}"]`);
    if (!el) return;
    if (el.classList.contains('is-filtered-out')) setFilter('alle');
    openAncestors(el);
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    flash(el);
    if (el.id) history.replaceState(null, '', `#${el.id}`);
  }

  /* ---- risk map ---------------------------------------------------------- */
  function zoneOf(ease, impact) {
    const score = ease * impact;
    if (score >= 20) return 4;
    if (score >= 12) return 3;
    if (score >= 6) return 2;
    return 1;
  }

  function tick(value, label, axis) {
    const el = document.createElement('div');
    el.className = `tick tick--${axis}`;
    el.setAttribute('aria-hidden', 'true');
    const b = document.createElement('b');
    b.textContent = value;
    el.append(b, label || String(value));
    return el;
  }

  function initMatrix(findings) {
    const matrix = $('[data-matrix]');
    const grid = matrix && $('.matrix__grid', matrix);
    if (!grid) return;
    const yLabels = (matrix.dataset.yLabels || '').split('|');
    const xLabels = (matrix.dataset.xLabels || '').split('|');
    const frag = document.createDocumentFragment();

    for (let impact = 5; impact >= 1; impact--) {
      frag.append(tick(impact, yLabels[impact - 1], 'y'));
      for (let ease = 1; ease <= 5; ease++) {
        const cell = document.createElement('div');
        cell.className = 'matrix__cell';
        cell.dataset.zone = zoneOf(ease, impact);
        findings
          .filter((f) => f.ease === ease && f.impact === impact)
          .sort((a, b) => a.n - b.n)
          .forEach((f) => {
            const marker = document.createElement('button');
            marker.type = 'button';
            marker.className = `marker${f.suspected ? ' marker--suspected' : ''}`;
            marker.dataset.n = f.n;
            marker.textContent = f.n;
            marker.style.setProperty('--i', f.n - 1);
            marker.setAttribute('aria-label',
              `${({ nl: 'Punt', en: 'Issue', de: 'Punkt', fr: 'Point', es: 'Punto', pt: 'Ponto', it: 'Punto', zh: '第' }[document.documentElement.lang] || 'Punt')} ${f.n}: ${f.title}. ${SEVERITY[f.sev] || ''}, `
              + `${({ nl: 'misbruik', en: 'ease of abuse', de: 'Missbrauch', fr: 'abus', es: 'abuso', pt: 'abuso', it: 'abuso', zh: '利用难度' }[document.documentElement.lang] || 'misbruik')} ${f.ease} / 5, `
              + `${({ nl: 'schade', en: 'damage', de: 'Schaden', fr: 'dommage', es: 'daño', pt: 'dano', it: 'danno', zh: '损害' }[document.documentElement.lang] || 'schade')} ${f.impact} / 5.`);
            cell.append(marker);
          });
        frag.append(cell);
      }
    }
    frag.append(document.createElement('span'));
    for (let ease = 1; ease <= 5; ease++) frag.append(tick(ease, xLabels[ease - 1], 'x'));
    grid.append(frag);

    const panel = $('[data-preview]');
    const markers = $$('.marker', grid);
    let pinned = findings.length ? Math.min(...findings.map((f) => f.n)) : 0;
    let swapTimer = 0;

    const render = (f) => {
      const slot = (name) => $(`[data-slot="${name}"]`, panel);
      slot('num').textContent = String(f.n).padStart(2, '0');
      const sev = slot('sev');
      sev.dataset.sev = f.sev;
      sev.textContent = SEVERITY[f.sev] || f.sev;
      slot('status').textContent = f.suspected ? 'Vermoedelijk, niet zelf bevestigd' : 'Bevestigd met eigen test';
      slot('title').textContent = f.title;
      slot('lede').textContent = f.lede;
      slot('where').textContent = f.where;
      setMeter(slot('ease'), f.ease);
      setMeter(slot('impact'), f.impact);
      slot('open').dataset.open = f.n;
    };

    const show = (n, animate = true) => {
      const f = findings.find((x) => x.n === n);
      if (!f) return;
      markers.forEach((m) => {
        const on = Number(m.dataset.n) === n;
        m.classList.toggle('is-active', on);
        m.setAttribute('aria-pressed', String(on && n === pinned));
      });
      if (!panel || panel.dataset.current === String(n)) return;
      panel.dataset.current = n;
      clearTimeout(swapTimer);
      if (!animate || reduceMotion) { render(f); return; }
      panel.classList.add('is-swapping');
      swapTimer = setTimeout(() => { render(f); panel.classList.remove('is-swapping'); }, 160);
    };

    const markerFrom = (event) => event.target.closest('.marker');
    grid.addEventListener('pointerover', (e) => { const m = markerFrom(e); if (m) show(Number(m.dataset.n)); });
    grid.addEventListener('pointerleave', () => show(pinned));
    grid.addEventListener('focusin', (e) => { const m = markerFrom(e); if (m) show(Number(m.dataset.n)); });
    grid.addEventListener('focusout', (e) => { if (!grid.contains(e.relatedTarget)) show(pinned); });
    grid.addEventListener('click', (e) => {
      const m = markerFrom(e);
      if (!m) return;
      pinned = Number(m.dataset.n);
      show(pinned);
      if (panel && window.matchMedia('(max-width: 960px)').matches) {
        panel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
      }
    });
    show(pinned, false);
  }

  /* ---- severity filter --------------------------------------------------- */
  function setFilter(key) {
    const match = FILTERS[key] || FILTERS.alle;
    $$('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === key)));
    const all = $$('[data-finding]');
    let shown = 0;
    all.forEach((el) => {
      const on = match(el.dataset.sev);
      el.classList.toggle('is-filtered-out', !on);
      el.classList.remove('is-refiltered');
      if (!on) return;
      el.style.setProperty('--r', shown);
      void el.offsetWidth;
      el.classList.add('is-refiltered');
      shown++;
    });
    const status = $('[data-filter-status]');
    if (status) status.textContent = `${shown} van ${all.length} punten`;
    syncExpandAll();
  }

  function initFilters(findings) {
    const buttons = $$('[data-filter]');
    buttons.forEach((button) => {
      const match = FILTERS[button.dataset.filter] || FILTERS.alle;
      const count = $('.count', button);
      if (count) count.textContent = findings.filter((f) => match(f.sev)).length;
      button.addEventListener('click', () => setFilter(button.dataset.filter));
    });
  }

  /* ---- details: expand all, deep links, print ---------------------------- */
  function initDetails() {
    const findings = $$('details[data-finding]');
    const all = $('[data-expand-all]');

    if (all) {
      syncExpandAll = () => {
        const visible = findings.filter((f) => !f.classList.contains('is-filtered-out'));
        const open = visible.length > 0 && visible.every((f) => f.open);
        all.setAttribute('aria-pressed', String(open));
        const label = $('[data-label]', all);
        if (label) label.textContent = open ? all.dataset.labelOpen : all.dataset.labelClosed;
      };
      all.addEventListener('click', () => {
        const open = all.getAttribute('aria-pressed') !== 'true';
        findings.forEach((f) => { if (!f.classList.contains('is-filtered-out')) f.open = open; });
        syncExpandAll();
      });
      findings.forEach((f) => f.addEventListener('toggle', syncExpandAll));
    }

    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link || link.hash.length < 2) return;
      const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
      if (target) openAncestors(target);
    });

    let reopen = [];
    window.addEventListener('beforeprint', () => {
      reopen = $$('details:not([open])');
      reopen.forEach((d) => { d.open = true; });
      $$('[data-reveal]').forEach((el) => el.classList.add('is-in'));
    });
    window.addEventListener('afterprint', () => {
      reopen.forEach((d) => { d.open = false; });
      reopen = [];
    });
    $$('[data-print]').forEach((b) => b.addEventListener('click', () => window.print()));
  }

  /* ---- navigation: progress and scrollspy -------------------------------- */
  function initNav() {
    const bar = $('.topbar');
    const progress = $('[data-progress]');
    const links = $$('.topnav a[href^="#"]');
    const sections = links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))));
    let queued = false;

    const update = () => {
      queued = false;
      const max = root.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      progress?.style.setProperty('--progress', ratio.toFixed(4));
      bar?.classList.toggle('is-scrolled', window.scrollY > 8);

      const line = window.innerHeight * 0.3;
      let active = -1;
      sections.forEach((section, i) => { if (section && section.getBoundingClientRect().top <= line) active = i; });
      if (ratio > 0.995) active = links.length - 1;
      links.forEach((a, i) => {
        a.classList.toggle('is-active', i === active);
        if (i === active) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    update();
  }

  /* ---- jump buttons ------------------------------------------------------ */
  function initJumps() {
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-open]');
      if (!trigger) return;
      e.preventDefault();
      openFinding(Number(trigger.dataset.open));
    });
  }

  /* ---- glossary tooltips ------------------------------------------------- */
  function initTerms() {
    const terms = $$('[data-term]');
    if (!terms.length) return;
    const tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.id = 'vs-tooltip';
    tip.setAttribute('role', 'tooltip');
    document.body.append(tip);
    let current = null;

    const show = (el) => {
      const item = document.getElementById(`woord-${el.dataset.term}`);
      const dt = item && $('dt', item);
      const dd = item && $('dd', item);
      if (!dt || !dd) return;
      const title = document.createElement('b');
      title.textContent = dt.textContent;
      const body = document.createElement('span');
      body.textContent = dd.textContent;
      tip.replaceChildren(title, body);
      current?.removeAttribute('aria-describedby');
      current = el;
      el.setAttribute('aria-describedby', tip.id);
      tip.classList.add('is-on');
      const r = el.getBoundingClientRect();
      const t = tip.getBoundingClientRect();
      const left = Math.max(12, Math.min(r.left + r.width / 2 - t.width / 2, window.innerWidth - t.width - 12));
      let top = r.top - t.height - 10;
      if (top < 72) top = r.bottom + 10;
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    };
    const hide = () => {
      tip.classList.remove('is-on');
      current?.removeAttribute('aria-describedby');
      current = null;
    };

    terms.forEach((el) => {
      el.tabIndex = 0;
      el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(el); });
      el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
      el.addEventListener('focus', () => show(el));
      el.addEventListener('blur', hide);
      el.addEventListener('click', (e) => { e.preventDefault(); show(el); });
    });
    document.addEventListener('pointerdown', (e) => { if (current && !e.target.closest('[data-term]')) hide(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
    window.addEventListener('scroll', hide, { passive: true });
  }

  /* ---- copy buttons on evidence ------------------------------------------ */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.append(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      area.remove();
      return ok;
    }
  }

  function initCopy() {
    $$('.code-wrap').forEach((wrap) => {
      const pre = $('pre', wrap);
      if (!pre) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'copy';
      button.innerHTML = '<svg class="i" aria-hidden="true"><use href="#i-copy"/></svg><span>Kopieer</span>';
      const label = $('span', button);
      let timer = 0;
      button.addEventListener('click', async () => {
        const ok = await copyText(pre.innerText);
        label.textContent = ok ? 'Gekopieerd' : 'KopiÃ«ren lukt niet';
        button.classList.toggle('is-done', ok);
        clearTimeout(timer);
        timer = setTimeout(() => { label.textContent = 'Kopieer'; button.classList.remove('is-done'); }, 1800);
      });
      wrap.append(button);
    });
  }

  /* ---- boot -------------------------------------------------------------- */
  const findings = readFindings();
  initTheme();
  initMeters();
  initMatrix(findings);
  initFilters(findings);
  initDetails();
  initCounters();
  initReveal();
  initNav();
  initJumps();
  initTerms();
  initCopy();
  window.vsReady = true;

  const target = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  if (target?.matches('[data-finding]')) openFinding(Number(target.dataset.n));
  else if (target) { openAncestors(target); target.scrollIntoView(); }
})();
