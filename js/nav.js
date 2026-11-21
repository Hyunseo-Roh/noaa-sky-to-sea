/* The header: six menus (Chapters, Topics, News, Data, Tools, About) and Local weather.
   On a computer each opens a panel under the header. Below 1200 px the menu button opens the list as a sheet,
   and each menu opens in place inside it. One panel at a time; Escape or a click outside closes it. */
(() => {
  const head = document.getElementById('site-head');
  if (!head) return;
  const toggles = [...head.querySelectorAll('.nav-b, .wx-b')];
  const menuBtn = head.querySelector('.menu-btn');
  const sheet = document.getElementById('primary');
  let open = null;

  const panelOf = (b) => document.getElementById(b.getAttribute('aria-controls'));
  const setOpen = (b, on) => {
    b.setAttribute('aria-expanded', on ? 'true' : 'false');
    panelOf(b).hidden = !on;
  };
  const narrow = () => innerWidth < 1200;
  // below 1200 px Local weather is a sheet over the page, like the menu: the header stays solid and the page stays put
  const wxSheet = (on) => {
    if (on && !narrow()) return;
    if (!on && sheet.classList.contains('open')) return;
    head.classList.toggle('sheet-on', on);
    document.documentElement.classList.toggle('no-scroll', on);
  };
  const close = (focus) => {
    if (!open) return;
    const b = open; open = null;
    setOpen(b, false);
    head.classList.remove('menu-on');
    if (b.classList.contains('wx-b')) wxSheet(false);
    if (focus) b.focus();
  };
  const show = (b) => {
    if (open && open !== b) close(false);
    if (b.classList.contains('wx-b') && sheet.classList.contains('open')) setSheet(false);
    setOpen(b, true); open = b;
    head.classList.add('menu-on');
    if (b.classList.contains('wx-b')) wxSheet(true);
    if (b.classList.contains('wx-b')) {
      const q = document.getElementById('wx-q');
      if (q && matchMedia('(hover: hover)').matches) q.focus({ preventScroll: true });
    }
  };
  toggles.forEach((b) => b.addEventListener('click', () => (open === b ? close(false) : show(b))));

  function setSheet(on) {
    menuBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    sheet.classList.toggle('open', on);
    head.classList.toggle('sheet-on', on);
    document.documentElement.classList.toggle('no-scroll', on);
    if (!on && open && open.classList.contains('nav-b')) close(false);
  }
  menuBtn.addEventListener('click', () => {
    const on = menuBtn.getAttribute('aria-expanded') !== 'true';
    if (on && open && open.classList.contains('wx-b')) close(false);
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
  // a link inside a menu closes it (same-page anchors stay on the page)
  head.querySelectorAll('.mega a').forEach((a) => a.addEventListener('click', () => { close(false); setSheet(false); }));
  addEventListener('resize', () => { if (innerWidth >= 1200 && sheet.classList.contains('open')) setSheet(false); });
})();
