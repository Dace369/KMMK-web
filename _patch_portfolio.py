# -*- coding: utf-8 -*-
import pathlib
p = pathlib.Path(__file__).resolve().parent / "index.html"
text = p.read_text(encoding="utf-8")

old1 = """    grid.addEventListener('click', function(e) {
      var link = e.target.closest && e.target.closest('a.port-card-more');
      if (!link || !grid.contains(link)) return;
      e.preventDefault();
      var card = link.closest('.port-card');
      if (card && window.togglePortfolioCard) window.togglePortfolioCard(card);
    });"""
new1 = """    grid.addEventListener('click', function(e) {
      var link = e.target.closest && e.target.closest('a.port-card-more');
      if (!link || !grid.contains(link)) return;
      var card = link.closest('.port-card');
      if (!card || card.parentElement !== grid) return;
      e.preventDefault();
      e.stopPropagation();
      if (window.togglePortfolioCard) window.togglePortfolioCard(card);
    });"""

old2 = """        if (cnt) cnt.textContent = (idx + 1) + ' / ' + urls.length;
      }
    }, true);"""
new2 = """        if (cnt) cnt.textContent = (idx + 1) + ' / ' + urls.length;
        e.stopImmediatePropagation();
      }
    }, true);"""

old3 = """.port-card-mini-nav {
  position: absolute;
  bottom: var(--f2);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: var(--f1);
  z-index: 2;
}"""
new3 = """.port-card-mini-nav {
  position: absolute;
  bottom: var(--f2);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: var(--f1);
  z-index: 6;
  pointer-events: auto;
}"""

for name, o, n in [("link", old1, new1), ("mini", old2, new2), ("css", old3, new3)]:
    if o not in text:
        raise SystemExit(f"missing chunk: {name}")
    text = text.replace(o, n, 1)
    print("patched", name)

p.write_text(text, encoding="utf-8")
print("ok")
