/* The header: six menus (Chapters, Topics, News, Data, Tools, About), Search and Local weather.
   On a computer each opens a panel under the header. Below 1200 px the menu button opens the six menus as a sheet,
   and Search and Local weather open as sheets of their own. One panel at a time; Escape or a click outside closes it. */
(() => {
  const head = document.getElementById('site-head');
  if (!head) return;
  const root = document.documentElement;
  const toggles = [...head.querySelectorAll('.nav-b, .wx-b, .search-btn')];
  const menuBtn = head.querySelector('.menu-btn');
  const sheet = document.getElementById('primary');
  const own = (b) => b.classList.contains('wx-b') || b.classList.contains('search-btn');   // a sheet of its own on a phone
  let open = null;

  const panelOf = (b) => document.getElementById(b.getAttribute('aria-controls'));
  const setOpen = (b, on) => {
    b.setAttribute('aria-expanded', on ? 'true' : 'false');
    panelOf(b).hidden = !on;
  };
  const narrow = () => innerWidth < 1200;
  // below 1200 px the header stays solid while a sheet is open, and the page under it stays put
  const solid = (on) => {
    head.classList.toggle('sheet-on', on);
    root.classList.toggle('no-scroll', on);
  };
  function setSheet(on) {
    menuBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    sheet.classList.toggle('open', on);
    solid(on);
    if (!on && open && open.classList.contains('nav-b')) close(false);
  }
  function close(focus) {
    if (!open) return;
    const b = open; open = null;
    setOpen(b, false);
    head.classList.remove('menu-on');
    if (own(b) && !sheet.classList.contains('open')) solid(false);
    if (focus) b.focus();
  }
  function show(b) {
    if (open && open !== b) close(false);
    if (own(b) && sheet.classList.contains('open')) setSheet(false);
    setOpen(b, true); open = b;
    head.classList.add('menu-on');
    if (own(b) && narrow()) solid(true);
    const field = panelOf(b).querySelector('input');
    if (field && matchMedia('(hover: hover)').matches) field.focus({ preventScroll: true });
  }
  toggles.forEach((b) => b.addEventListener('click', () => (open === b ? close(false) : show(b))));
  menuBtn.addEventListener('click', () => {
    const on = menuBtn.getAttribute('aria-expanded') !== 'true';
    if (on && open && own(open)) close(false);
    setSheet(on);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (open) close(true);
    else if (sheet.classList.contains('open')) { setSheet(false); menuBtn.focus(); }
  });
  document.addEventListener('click', (e) => {
    if (!open || head.contains(e.target)) return;
    close(false);
  });
  // a link inside a panel closes it (same-page anchors stay on the page)
  head.addEventListener('click', (e) => {
    const a = e.target.closest('.mega a');
    if (!a || a.dataset.wx) return;
    close(false); setSheet(false);
  });
  addEventListener('resize', () => {
    if (!narrow() && sheet.classList.contains('open')) setSheet(false);
    if (!narrow() && open && own(open)) solid(false);
  });

  /* Search this site: chapters, the places on the Ocean and sky page, NOAA's topics, data, tools and About.
     Every word typed has to appear in the name, the line under it or its keywords. */
  const q = document.getElementById('q');
  const list = document.getElementById('search-results');
  const note = document.getElementById('search-note');
  const data = JSON.parse(document.getElementById('search-index').textContent);
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const rows = data.map((r) => ({ ...r, hay: norm([r.t, r.d, r.k, r.x].join(' ')) }));
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const render = () => {
    const words = norm(q.value).split(/\s+/).filter(Boolean);
    if (!words.length) { list.innerHTML = ''; note.textContent = ''; return; }
    const hits = rows.filter((r) => words.every((w) => r.hay.includes(w)))
      .sort((a, b) => (norm(b.t).includes(words[0]) ? 1 : 0) - (norm(a.t).includes(words[0]) ? 1 : 0))
      .slice(0, 9);
    note.textContent = hits.length ? '' : 'Nothing on this site matches “' + q.value.trim() + '”. Try another word, or open a menu above.';
    list.innerHTML = hits.map((r) => '<li><a href="' + esc(r.h) + '"' + (r.wx ? ' data-wx="1"' : '') + '><span class="mi-t">' + esc(r.t) +
      '</span><span class="mi-d">' + esc(r.d) + '</span><span class="mi-k">' + esc(r.k) + '</span></a></li>').join('');
  };
  q.addEventListener('input', render);
  // "Local weather" in the results opens the forecast search
  list.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-wx]');
    if (!a) return;
    e.preventDefault();
    show(head.querySelector('.wx-b'));
  });
})();
