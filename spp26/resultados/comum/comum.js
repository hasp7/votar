// Comum às páginas de resultados da spp26: tema claro/escuro, carimbo Wild card e barras.
// Nada é guardado no browser: o tema escolhido vale só para esta visita.
(() => {
  'use strict';
  const raiz = document.documentElement;
  const escuroSistema = () => window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  const atual = () => raiz.dataset.theme || (escuroSistema() ? 'dark' : 'light');
  const rotular = bt => {
    const esc = atual() === 'dark';
    bt.textContent = esc ? '☀ Modo claro' : '☾ Modo escuro';
    bt.setAttribute('aria-pressed', String(esc));
  };
  document.querySelectorAll('[data-tema]').forEach(bt => {
    rotular(bt);
    bt.addEventListener('click', () => {
      raiz.dataset.theme = atual() === 'dark' ? 'light' : 'dark';
      document.querySelectorAll('[data-tema]').forEach(rotular);
    });
  });

  // Carimbo Wild card: o mesmo desenho do votar (app.js, selo e CARTA)
  const CARTA = '<g transform="rotate(-10 12 16)"><rect x="1.5" y="1.5" width="21" height="29" rx="3" fill="none" stroke="currentColor" stroke-width="2.4"/>' +
    '<path d="M12 8.5l2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7z" fill="currentColor"/></g>';
  const svgNS = 'http://www.w3.org/2000/svg';
  document.querySelectorAll('[data-selo]').forEach(sp => {
    const txt = sp.dataset.selo || 'Wild card';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 176 64'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', txt);
    const g = document.createElementNS(svgNS, 'g'); g.setAttribute('transform', 'rotate(-6 88 32)');
    g.innerHTML = '<rect x="3" y="5" width="170" height="54" rx="10" fill="none" stroke="currentColor" stroke-width="3"/>' +
      '<rect x="9" y="11" width="158" height="42" rx="6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 3"/>' +
      '<g transform="translate(18 16)">' + CARTA + '</g>';
    const t = document.createElementNS(svgNS, 'text');
    t.setAttribute('x', '104'); t.setAttribute('y', '39'); t.setAttribute('text-anchor', 'middle'); t.setAttribute('font-size', '18');
    t.setAttribute('font-weight', '800'); t.setAttribute('letter-spacing', '2'); t.setAttribute('fill', 'currentColor');
    t.textContent = txt.toUpperCase();
    g.appendChild(t); svg.appendChild(g); sp.replaceChildren(svg);
  });

  // Barras: a CSP não deixa usar style="" no HTML; a largura entra por CSSOM, logo ao abrir
  document.querySelectorAll('[data-pct]').forEach(b => b.style.setProperty('--pct', Math.max(0, Math.min(100, Number(b.dataset.pct) || 0)) + '%'));
})();
