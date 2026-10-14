/* Privacy policy page — no interactive content of its own beyond the
   shared scroll-to-top button, so this is just that one IIFE, ported
   identically from script.js/praktis-id.js (own file rather than
   loading either of those, since neither's other IIFEs target
   anything that exists on this page). */

(function () {
  const btn = document.getElementById("scrollTop");
  if (!btn) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SHOW_AFTER = window.innerHeight;
  const OPEN_DELAY = reduceMotion ? 0 : 20;
  const HIDE_DELAY = reduceMotion ? 0 : 300;

  let hideTimer = null;
  let ticking = false;

  function show() {
    clearTimeout(hideTimer);
    if (!btn.hidden) return;
    btn.hidden = false;
    void btn.offsetWidth;
    setTimeout(() => btn.classList.add("is-visible"), OPEN_DELAY);
  }

  function hide() {
    if (btn.hidden) return;
    btn.classList.remove("is-visible");
    hideTimer = setTimeout(() => {
      btn.hidden = true;
    }, HIDE_DELAY);
  }

  function update() {
    if (window.scrollY > SHOW_AFTER) show();
    else hide();
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      update();
      ticking = false;
    });
  }

  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  update();
})();
