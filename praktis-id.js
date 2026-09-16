/* Praktis.ID page — self-contained script, separate from the homepage's
   script.js (different page, different element ids, no reason to share
   a file). Same conventions as the homepage: one-shot IntersectionObserver
   reveals, prefers-reduced-motion short-circuits before touching anything,
   cubic-bezier(0.22,1,0.36,1) for every "settle" transition. */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Breadcrumb + hero fade up together on load, staggered via CSS
   transition-delay (same trick as .join-modal.is-open on the homepage) —
   just needs the state class added one frame after paint. */
(function () {
  const breadcrumb = document.getElementById("pidBreadcrumb");
  const hero = document.getElementById("pidHero");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (breadcrumb) breadcrumb.classList.add("is-revealed");
      if (hero) hero.classList.add("is-loaded");
    });
  });
})();

/* Screenshot slider: a flex track, cloned at both ends (clone of the
   last slide prepended, clone of the first appended) so stepping past
   either end is a normal forward/backward animation onto a clone —
   then, once that transition settles, we silently re-point to the
   real slide underneath (transition:none; identical pixels, so the
   snap is invisible) instead of animating a long way back across the
   whole track. That's what makes next/prev feel infinite with just 3
   real images. Centering itself is computed from getBoundingClientRect
   deltas rather than offsetLeft — .pid-slider-track carries a CSS
   transform, which per spec makes it (not the position:relative
   .pid-slider) the offsetParent for its children, so raw offsetLeft
   ends up in the wrong coordinate space the moment the track and the
   full-bleed .pid-slider-viewport disagree on their own offsetLeft.
   Rects sidestep that entirely: both read in real page coordinates,
   and the "how far to shift" delta between them is correct regardless
   of which element anything's offsetLeft happens to be relative to. */
(function () {
  const root = document.getElementById("pidSlider");
  const viewport = root ? root.querySelector(".pid-slider-viewport") : null;
  const track = document.getElementById("pidTrack");
  const realSlides = track ? Array.from(track.querySelectorAll(".pid-slide")) : [];
  const dotsWrap = document.getElementById("pidDots");
  const prevBtn = document.getElementById("pidPrev");
  const nextBtn = document.getElementById("pidNext");
  if (!root || !viewport || !track || realSlides.length < 2) return;

  const cloneOfLast = realSlides[realSlides.length - 1].cloneNode(true);
  const cloneOfFirst = realSlides[0].cloneNode(true);
  cloneOfLast.setAttribute("aria-hidden", "true");
  cloneOfFirst.setAttribute("aria-hidden", "true");
  track.insertBefore(cloneOfLast, realSlides[0]);
  track.appendChild(cloneOfFirst);

  const positions = Array.from(track.children);
  let currentPos = 2; // pos = realIndex + 1; default active real index is 1
  let currentX = 0;
  let autoplayTimer = null;
  let resizeRAF = null;
  let snapTimer = null;

  const dots = realSlides.map((_, i) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "pid-dot";
    dot.setAttribute("aria-label", `Экран ${i + 1}`);
    dot.addEventListener("click", () => { centerPos(i + 1, true); restartAutoplay(); });
    dotsWrap.appendChild(dot);
    return dot;
  });

  function updateActiveVisuals(pos) {
    const realIndex = Number(positions[pos].dataset.index);
    positions.forEach((el, i) => el.classList.toggle("is-active", i === pos));
    dots.forEach((d, i) => d.classList.toggle("is-active", i === realIndex));
  }

  function centerPos(pos, animate) {
    currentPos = pos;
    if (!animate) track.style.transition = "none";
    const slideRect = positions[pos].getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    currentX += (viewportRect.left + viewportRect.width / 2) - (slideRect.left + slideRect.width / 2);
    track.style.transform = `translateX(${currentX}px)`;
    updateActiveVisuals(pos);
    if (animate) {
      scheduleSnapCheck();
    } else {
      void track.offsetHeight; // flush the transition:none before re-enabling it
      requestAnimationFrame(() => { track.style.transition = ""; });
    }
  }

  /* After an animated step lands on a clone (position 0 or the last
     one), silently re-point to the real slide it's standing in for. */
  function scheduleSnapCheck() {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      if (currentPos === 0) centerPos(positions.length - 2, false);
      else if (currentPos === positions.length - 1) centerPos(1, false);
    }, 650);
  }

  function stepBy(delta) { centerPos(currentPos + delta, true); }

  function startAutoplay() {
    if (reduceMotion) return;
    stopAutoplay();
    autoplayTimer = setInterval(() => stepBy(1), 5000);
  }
  function stopAutoplay() { if (autoplayTimer) clearInterval(autoplayTimer); }
  function restartAutoplay() { startAutoplay(); }

  prevBtn.addEventListener("click", () => { stepBy(-1); restartAutoplay(); });
  nextBtn.addEventListener("click", () => { stepBy(1); restartAutoplay(); });

  root.addEventListener("mouseenter", stopAutoplay);
  root.addEventListener("mouseleave", startAutoplay);
  root.addEventListener("focusin", stopAutoplay);
  root.addEventListener("focusout", startAutoplay);

  let dragging = false, dragStartX = 0, dragBaseX = 0;
  track.addEventListener("pointerdown", (e) => {
    dragging = true;
    dragStartX = e.clientX;
    dragBaseX = currentX;
    track.classList.add("is-dragging");
    track.setPointerCapture(e.pointerId);
    clearTimeout(snapTimer);
    stopAutoplay();
  });
  track.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    track.style.transform = `translateX(${dragBaseX + (e.clientX - dragStartX)}px)`;
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    track.classList.remove("is-dragging");
    const dx = e.clientX - dragStartX;
    if (Math.abs(dx) > 60) stepBy(dx < 0 ? 1 : -1);
    else centerPos(currentPos, true);
    restartAutoplay();
  }
  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", endDrag);

  window.addEventListener("resize", () => {
    if (resizeRAF) return;
    resizeRAF = requestAnimationFrame(() => { resizeRAF = null; centerPos(currentPos, false); });
  });

  centerPos(currentPos, false);
  startAutoplay();
})();

/* Generic one-shot reveal helpers, reused by every section below —
   same pattern as the homepage's per-row IntersectionObservers, just
   factored out since this page has many more sections calling it. */
function onVisible(el, cb, threshold) {
  const io = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    cb();
    io.disconnect();
  }, { threshold: threshold || 0.25 });
  io.observe(el);
}

function revealSingle(el) {
  if (el) onVisible(el, () => el.classList.add("is-revealed"));
}

function revealStagger(container, selector, step) {
  if (!container) return;
  const items = Array.from(container.querySelectorAll(selector));
  if (!items.length) return;
  onVisible(container, () => {
    items.forEach((item, i) => setTimeout(() => item.classList.add("is-revealed"), i * (step || 80)));
  });
}

if (!reduceMotion) {
  document.querySelectorAll(".pid-section-head").forEach(revealSingle);

  /* Methodology: on desktop the section pins the lead line mid-screen
     (see .pid-method-pin-wrap's height in CSS) and each word lights up
     as its point in the text scrolls past — same continuous-progress
     read as the steps timeline's fill line below, applied to words
     instead of a bar. Only .pid-method-lead gets this treatment — the
     two columns below the divider are separate, plain fade-in content
     (see revealStagger call below). wrapWordsIn() walks the lead
     line's nodes so it stays intact, only wrapping the actual word
     text in .pid-method-word spans. Wrapping happens unconditionally
     (harmless on mobile/reduced-motion: with no .is-lit rule outside
     the desktop+motion media query, wrapped words render identically
     to plain text); the desktopMotion check inside update() is what
     actually gates the scroll effect. */
  (function () {
    const wrap = document.getElementById("pidMethodPinWrap");
    const lead = document.getElementById("pidMethodLead");
    if (!wrap || !lead) return;

    function wrapWordsIn(el) {
      const found = [];
      Array.from(el.childNodes).forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          found.push(...wrapWordsIn(node));
          return;
        }
        if (node.nodeType !== Node.TEXT_NODE) return;
        const raw = node.textContent;
        const tokens = raw.trim().split(/\s+/).filter(Boolean);
        if (!tokens.length) return;
        const frag = document.createDocumentFragment();
        if (/^\s/.test(raw)) frag.appendChild(document.createTextNode(" "));
        tokens.forEach((w, i) => {
          const span = document.createElement("span");
          span.className = "pid-method-word";
          span.textContent = w;
          frag.appendChild(span);
          found.push(span);
          if (i < tokens.length - 1) frag.appendChild(document.createTextNode(" "));
        });
        if (/\s$/.test(raw)) frag.appendChild(document.createTextNode(" "));
        node.replaceWith(frag);
      });
      return found;
    }

    const lines = Array.from(lead.querySelectorAll(".pid-method-line"));
    const wordEls = lines.flatMap(wrapWordsIn);

    const desktopMotion = window.matchMedia("(min-width: 901px) and (prefers-reduced-motion: no-preference)");

    function update() {
      if (!desktopMotion.matches) return;
      const rect = wrap.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const progress = total > 0 ? Math.max(0, Math.min(1, -rect.top / total)) : 0;
      const litCount = progress * wordEls.length;
      wordEls.forEach((el, i) => el.classList.toggle("is-lit", i < litCount));
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
  })();

  /* Methodology columns: plain staggered fade-in, independent of the
     word-lighting lead line above — same pattern as the compare/
     feature/benefit cards below. */
  revealStagger(document.getElementById("pidMethodColumns"), ".pid-method-col", 90);

  document.querySelectorAll(".pid-compare-col").forEach((col) => revealStagger(col, ".pid-compare-row", 70));
  revealStagger(document.getElementById("pidFeatures"), ".pid-feature-card", 80);
  revealStagger(document.getElementById("pidBenefits"), ".pid-benefit-card", 90);
  revealSingle(document.getElementById("pidPricingHead"));
  revealStagger(document.getElementById("pidPricing"), ".pid-pricing-card", 90);
  revealSingle(document.getElementById("pidComplianceHead"));
  revealStagger(document.getElementById("pidCompliance"), ".pid-compliance-card", 90);

  /* Services catalog: same block as the homepage's #products (shared
     styles.css rules — .services-row/.service-tile carry no
     page-specific CSS), ported here since this page doesn't load
     script.js. Each row reveals its own tiles independently as you
     scroll to it, identical timing (threshold 0.25, 80ms stagger) to
     the homepage's per-row IntersectionObserver IIFE. The head above
     it is new — the homepage's own #products has no heading at all —
     so it just uses this page's ordinary .pid-section-head reveal. */
  revealSingle(document.getElementById("pidServicesHead"));
  document.querySelectorAll(".services-row").forEach((row) => revealStagger(row, ".service-tile", 80));

  /* Modules: on mobile/reduced-motion this is just a plain stacked
     list (see the desktopMotion-gated pin/pan mechanic below for the
     desktop version), so it gets the same one-shot stagger reveal as
     everything else on the page. The outro/summary card is just the
     last item in the same list here — no separate layer to reveal. */
  revealStagger(document.getElementById("pidModulesTrack"), ".pid-modules-card", 110);

  /* Modules showcase: verified against trionn.com's own live DOM twice
     (inspecting real computed transforms, not guessing from
     screenshots — see the second pass below for what changed).
       1. Heading + one item per module + an outro card sit in a single
          flex row panned left as a whole via one continuous translateX,
          exactly like every other horizontal-scroll section on this
          site.
       2. Layered on top of that shared pan, each card ALSO runs its own
          independent "rise from below" — translateY(RISE_PX) with its
          divider line at scaleY:0, easing up to translateY(0)/scaleY:1
          as that specific card's own on-screen position (its measured
          rect left edge, not a 1/N slice of global progress) approaches
          the front of the row. Cards that have already arrived don't
          fade or reverse — they just keep riding the pan left off the
          edge, same as trionn's.
       3. What comes after the outro card is NOT a plain sticky release:
          scrolling trionn well past where its own outro card settles
          showed the "next act" sitting there the whole time as a
          SEPARATE layer, static at its own position, only becoming
          visible because the layer in front of it (the one we'd been
          watching pan) slides away and stops covering it — genuine
          spatial movement, not a fade. #pidModulesSlide is that front
          layer here (it carries the section's own background too, so
          the whole visible "screen" moves as one piece); a plain
          page-background layer sits behind it the whole time
          (.pid-modules-cta-preview, see praktis-id.html/css) that this
          reveals — deliberately empty, not a preview of #pidPricing's
          own heading/cards, since echoing that text there turned out
          to visibly duplicate it during the hand-off no matter how
          tight the seam (see the HTML comment on that element). Once
          revealed, the pin releases normally and #pidPricing enters
          right after with its own ordinary reveal. */
  (function () {
    const wrap = document.getElementById("pidModulesPinWrap");
    const pin = wrap ? wrap.querySelector(".pid-modules-pin") : null;
    const slide = document.getElementById("pidModulesSlide");
    const viewport = slide ? slide.querySelector(".pid-modules-viewport") : null;
    const track = document.getElementById("pidModulesTrack");
    const head = track ? track.querySelector(".pid-modules-head") : null;
    const cards = track ? Array.from(track.querySelectorAll(".pid-modules-card")) : [];
    if (!wrap || !pin || !slide || !viewport || !track || !head || cards.length < 2) return;

    const desktopMotion = window.matchMedia("(min-width: 901px) and (prefers-reduced-motion: no-preference)");

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function remap(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
    function smoothstep(t) { return t * t * (3 - 2 * t); }

    function getProgress() {
      const rect = wrap.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      return total > 0 ? clamp(-rect.top / total, 0, 1) : 0;
    }

    // Pixel geometry, not a guessed 1/N split of progress — measured
    // fresh off the actually-rendered layout (responsive width, real
    // gap) so the pan distance and each card's own rise window track
    // reality instead of an assumed item width. Measured with the
    // track untransformed, same rect-based approach used everywhere
    // else on this site for "move by exactly one item".
    let itemWidth = 0;
    let restLeft = []; // each card's left edge relative to the viewport, at pan=0
    let maxPan = 0;

    function measure() {
      track.style.transform = "";
      const viewportLeft = viewport.getBoundingClientRect().left;
      itemWidth = head.getBoundingClientRect().width;
      restLeft = cards.map((c) => c.getBoundingClientRect().left - viewportLeft);
      maxPan = restLeft[restLeft.length - 1];
    }

    const PAN_END = 0.75;
    const SLIDE_START = 0.85;
    const RISE_PX = 120;
    // A card starts rising while its left edge is still over a full
    // item-width away (i.e. it's not yet visible, or only just
    // peeking in) and finishes shortly after it reaches the front —
    // ratios read off trionn's own measured reveal window, which ran
    // from roughly 1.9x to 0.55x its card width.
    const START_RATIO = 1.35;
    const END_RATIO = 0.2;

    function updateCards(pan) {
      const trackX = -pan * maxPan;
      cards.forEach((card, i) => {
        const inner = card.querySelector(".pid-modules-card-inner");
        const line = card.querySelector(".pid-modules-card-line");
        let t;
        if (i === 0) {
          t = 1; // already on screen the moment the section pins, no entrance needed
        } else {
          const liveX = restLeft[i] + trackX;
          t = smoothstep(remap(liveX, itemWidth * START_RATIO, itemWidth * END_RATIO));
        }
        if (inner) inner.style.transform = `translateY(${(1 - t) * RISE_PX}px)`;
        if (line) line.style.transform = `scaleY(${t})`;
      });
    }

    function update() {
      if (!desktopMotion.matches) return;
      const p = getProgress();

      const pan = remap(p, 0, PAN_END);
      track.style.transform = `translateX(${-pan * maxPan}px)`;
      updateCards(pan);

      // Real spatial move, not fade/scale: the whole front layer
      // (everything we've been watching pan — background included)
      // slides fully off to the left, uncovering the static pricing
      // preview sitting behind it at inset:0 the entire time.
      const reveal = remap(p, SLIDE_START, 1);
      slide.style.transform = reveal > 0 ? `translateX(${-reveal * 100}%)` : "";
    }

    function onResize() {
      measure();
      update();
    }

    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", onResize);
    measure();
    update();
  })();

  /* Steps stack: same overlapping-card mechanic as the homepage's
     .stack-section (script.js there) — ported here since this page
     doesn't load script.js, and reusing styles.css's shared .stack-*
     rules as-is (no page-specific CSS needed). Step 1's card is the
     non-moving base (fills the homepage version's video-card slot);
     steps 2-8 — 7 cards, matching FINAL_ROTATIONS' length — queue
     below the sticky viewport and slide up on top of it one at a
     time as you scroll. */
  (function () {
    const section = document.getElementById("pidStackSection");
    const wrap = document.getElementById("pidStackWrap");
    const cards = wrap ? Array.from(wrap.querySelectorAll(".stack-card")) : [];
    if (!section || cards.length < 2) return;

    const contentCards = cards.slice(1); // skip the base card, it never moves
    const N = contentCards.length;
    const FINAL_ROTATIONS = [-2, 2, -3, 3, -2, 4, -3];

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function smoothstep(edge0, edge1, x) {
      const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
      return t * t * (3 - 2 * t);
    }
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    function getProgress() {
      const rect = section.getBoundingClientRect();
      const total = section.offsetHeight - window.innerHeight;
      if (total <= 0) return 0;
      return clamp(-rect.top / total, 0, 1);
    }

    let ticking = false;
    let cardHalfHeight = 0;

    function measure() {
      cardHalfHeight = cards[0].getBoundingClientRect().height / 2;
    }

    function render(p) {
      const FILL_START = 0.03;
      const FILL_SPAN = 0.8;
      const ITEM_DUR = 0.24;
      const viewportHalf = window.innerHeight / 2;
      const PEEK = 90;
      const STAGGER = 46;

      contentCards.forEach((el, i) => {
        const staggerFrac = N > 1 ? i / (N - 1) : 0;
        const start = FILL_START + staggerFrac * FILL_SPAN;
        const end = start + ITEM_DUR;
        const t = easeOutCubic(smoothstep(start, end, p));

        const queuedOffset = viewportHalf + cardHalfHeight - PEEK + i * STAGGER;
        const y = lerp(queuedOffset, 0, t);
        const rot = lerp(0, FINAL_ROTATIONS[i % FINAL_ROTATIONS.length], t);

        el.style.transform = `translateY(${y}px) rotate(${rot}deg)`;
        el.style.zIndex = String(20 + i);
      });
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          render(getProgress());
          ticking = false;
        });
      }
    }

    function onResize() {
      measure();
      onScroll();
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    measure();
    render(getProgress());
  })();
}

/* Join modal, shared by every "Подключить"-style trigger on this page:
   same plain centered dialog as the homepage's #joinModal (script.js)
   — backdrop+card fade/scale, then title/intro/fields/submit stagger
   in on their own delays. Reuses styles.css's .join-* rules as-is (no
   page-specific CSS needed) and sits outside the reduceMotion guard
   above since opening a modal is a core interaction, not a decorative
   scroll effect — only its transition durations shrink to 0 under
   reduced motion, same as the homepage version. The one difference
   from that version: multiple trigger buttons (.pid-join-trigger)
   instead of one — the 3 tariff cards set data-tariff, which becomes
   this shared modal's heading via the "Подключить <тариф>" template;
   the hero's own "Подключить" button (a plain service connect, not
   tied to any tariff) sets data-modal-title directly instead, since
   its heading ("Подключение сервиса ИД") doesn't fit that template. */
(function () {
  const modal = document.getElementById("pidJoinModal");
  const triggers = Array.from(document.querySelectorAll(".pid-join-trigger"));
  if (!modal || !triggers.length) return;

  const dialog = modal.querySelector(".join-modal-dialog");
  const titleEl = document.getElementById("pidJoinModalTitle");
  const form = document.getElementById("pidJoinForm");
  const formState = document.getElementById("pidJoinFormState");
  const successState = document.getElementById("pidJoinSuccess");
  const errorEl = document.getElementById("pidJoinFormError");
  const nameInput = document.getElementById("pidJoinName");
  const emailInput = document.getElementById("pidJoinEmail");
  const phoneInput = document.getElementById("pidJoinPhone");
  const messageInput = document.getElementById("pidJoinMessage");

  const OPEN_DELAY = reduceMotion ? 0 : 20;
  const CLOSE_DURATION = reduceMotion ? 0 : 350;
  const SUCCESS_SWITCH_DELAY = reduceMotion ? 0 : 200;

  const iti = window.intlTelInput
    ? window.intlTelInput(phoneInput, {
        initialCountry: "ru",
        separateDialCode: true,
        uiTranslations: {
          selectedCountryAriaLabel: "Выбранная страна",
          noCountrySelected: "Страна не выбрана",
          countryListAriaLabel: "Список стран",
          searchPlaceholder: "Поиск",
          zeroSearchResults: "результатов не найдено",
          oneSearchResult: "найден 1 результат",
          multipleSearchResults: "Найдено ${count} результатов",
        },
      })
    : null;

  let lastFocused = null;
  let closeTimer = null;
  let currentTariff = "";

  function autoGrow() {
    messageInput.style.height = "auto";
    messageInput.style.height = `${messageInput.scrollHeight}px`;
  }
  messageInput.addEventListener("input", autoGrow);

  function setInvalid(el, bad) {
    if (bad) el.setAttribute("aria-invalid", "true");
    else el.removeAttribute("aria-invalid");
  }

  function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function focusablesIn(el) {
    return Array.from(
      el.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((n) => n.offsetParent !== null);
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const focusables = focusablesIn(dialog);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function resetForm() {
    form.reset();
    if (iti) iti.setCountry("ru");
    autoGrow();
    errorEl.hidden = true;
    [nameInput, emailInput, phoneInput].forEach((el) => setInvalid(el, false));
    successState.hidden = true;
    successState.classList.remove("is-shown");
    formState.hidden = false;
    formState.classList.remove("is-hiding");
  }

  function open(tariff, explicitTitle) {
    currentTariff = tariff;
    titleEl.textContent = explicitTitle || (tariff ? `Подключить ${tariff}` : "Подключить тариф");
    lastFocused = document.activeElement;
    clearTimeout(closeTimer);
    resetForm();
    modal.hidden = false;
    // Force a reflow so removing [hidden] and adding .is-open land in
    // separate frames — otherwise the browser coalesces them and the
    // opening transition never plays.
    void modal.offsetWidth;
    setTimeout(() => modal.classList.add("is-open"), OPEN_DELAY);
    document.body.classList.add("join-modal-lock");
    document.addEventListener("keydown", onKeydown);
    setTimeout(() => nameInput.focus(), reduceMotion ? 0 : 320);
  }

  function close() {
    modal.classList.remove("is-open");
    document.body.classList.remove("join-modal-lock");
    document.removeEventListener("keydown", onKeydown);
    closeTimer = setTimeout(() => {
      modal.hidden = true;
    }, CLOSE_DURATION);
    if (lastFocused) lastFocused.focus();
  }

  triggers.forEach((btn) => {
    btn.addEventListener("click", () => open(btn.dataset.tariff || "", btn.dataset.modalTitle));
  });
  modal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", close));

  function emailOk() {
    const v = emailInput.value.trim();
    return !v || isValidEmail(v);
  }
  function phoneOk() {
    const v = phoneInput.value.trim();
    return !v || (iti ? iti.isValidNumber() : true);
  }

  emailInput.addEventListener("blur", () => setInvalid(emailInput, !emailOk()));
  phoneInput.addEventListener("blur", () => setInvalid(phoneInput, !phoneOk()));

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const phoneRaw = phoneInput.value.trim();

    const emailValid = emailOk();
    const phoneValid = phoneOk();
    const hasContact = (email && emailValid) || (phoneRaw && phoneValid);
    const valid = Boolean(name) && emailValid && phoneValid && hasContact;

    setInvalid(nameInput, !name);
    setInvalid(emailInput, Boolean(email) && !emailValid);
    setInvalid(phoneInput, Boolean(phoneRaw) && !phoneValid);
    errorEl.hidden = valid;

    if (!valid) return;

    // No backend wired up yet — same as the homepage's join form.
    console.log("[pidJoinForm] submit", {
      tariff: currentTariff,
      name,
      email: email || null,
      phone: phoneRaw ? (iti ? iti.getNumber() : phoneRaw) : null,
      message: messageInput.value.trim() || null,
    });

    formState.classList.add("is-hiding");
    setTimeout(() => {
      formState.hidden = true;
      successState.hidden = false;
      void successState.offsetWidth;
      successState.classList.add("is-shown");
    }, SUCCESS_SWITCH_DELAY);
  });
})();

/* Scroll-to-top button: fixed bottom-right, fades in once you've
   scrolled roughly a screen's height down, scrolls back to the top on
   click. Same [hidden]+delayed-class technique as #pidJoinModal's own
   open/close above (force a reflow, then flip the class a frame
   later so the transition actually plays) — and for the same reason:
   without it, a keyboard user tabbing past the footer while still at
   the top of the page would land on an invisible, inert button.
   Ported identically to the homepage's script.js, just reusing this
   file's own top-level reduceMotion instead of a local one. */
(function () {
  const btn = document.getElementById("scrollTop");
  if (!btn) return;

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
