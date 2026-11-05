/* Sky to sea: a callout on a drawing (or its line in the key, on a phone) opens its card in place.
   One card at a time; Escape, the close button or a click outside closes it and puts focus back. */
(() => {
  const controls = [...document.querySelectorAll('.dsc button[aria-controls]')];
  const cards = new Map();
  controls.forEach((b) => {
    const id = b.getAttribute('aria-controls');
    if (!cards.has(id)) cards.set(id, { card: document.getElementById(id), buttons: [] });
    cards.get(id).buttons.push(b);
  });
  let open = null;   // { id, from }
  const set = (id, on) => {
    const c = cards.get(id);
    c.card.hidden = !on;
    c.buttons.forEach((b) => b.setAttribute('aria-expanded', on ? 'true' : 'false'));
  };
  const close = (focus) => {
    if (!open) return;
    const { id, from } = open; open = null;
    set(id, false);
    if (focus) from.focus();
  };
  const show = (id, from) => { close(false); set(id, true); open = { id, from }; };
  cards.forEach(({ card, buttons }, id) => {
    buttons.forEach((b) => b.addEventListener('click', () => (open && open.id === id ? close(false) : show(id, b))));
    card.querySelector('.card-x').addEventListener('click', () => close(true));
  });
  // On narrower screens a label that would run past the edge of the drawing turns to the other side of its dot.
  const callouts = [...document.querySelectorAll('.dsc .stage .co')];
  callouts.forEach((c) => { c.dataset.side0 = c.dataset.side; });
  const phone = matchMedia('(max-width: 760px)');   // on a phone the drawing shows numbered dots only
  const fit = () => {
    callouts.forEach((c) => {
      c.dataset.side = c.dataset.side0;
      if (phone.matches) return;
      const b = c.querySelector('.co-b').getBoundingClientRect();
      if (!b.width) return;
      const s = c.closest('.stage').getBoundingClientRect();
      const right = Math.min(s.right, document.documentElement.clientWidth) - 8;
      if (c.dataset.side0 === 'r' && b.right > right) c.dataset.side = 'l';
      else if (c.dataset.side0 === 'l' && b.left < Math.max(s.left, 0) + 8) c.dataset.side = 'r';
    });
    if (phone.matches) return;
    // two labels that meet on a narrow drawing: turn one of them to the other side of its dot, if it still fits
    const rect = (c) => c.querySelector('.co-b').getBoundingClientRect();
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const fits = (c) => { const r = rect(c), s = c.closest('.stage').getBoundingClientRect(); return r.left >= s.left + 8 && r.right <= Math.min(s.right, document.documentElement.clientWidth) - 8; };
    document.querySelectorAll('.dsc .stage').forEach((st) => {
      const cs = [...st.querySelectorAll('.co')].filter((c) => rect(c).width);
      for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
        if (!hit(rect(cs[i]), rect(cs[j]))) continue;
        for (const c of [cs[i], cs[j]]) {
          const was = c.dataset.side;
          c.dataset.side = was === 'r' ? 'l' : 'r';
          if (fits(c) && !cs.some((o) => o !== c && hit(rect(c), rect(o)))) break;
          c.dataset.side = was;
        }
      }
    });
  };
  fit();
  addEventListener('resize', fit);
  if (document.fonts) document.fonts.ready.then(fit);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) close(true); });
  document.addEventListener('click', (e) => {
    if (!open) return;
    const c = cards.get(open.id);
    if (c.card.contains(e.target) || c.buttons.some((b) => b.contains(e.target))) return;
    close(false);
  });
})();
