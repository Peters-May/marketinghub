(() => {
  const API = "/api/plan/2027/annotations";
  const OPEN_KEY = "plan-2027-comments-open";
  const NAME_KEY = "plan-2027-guest-name";
  const CTX = 64;

  /** @type {any[]} */
  let annotations = [];
  /** @type {{ name: string, user_id: string, role: string } | null} */
  let viewer = null;
  let selectedId = "";
  let pendingSelection = null;
  let saving = false;

  const isMobile = () => window.matchMedia("(max-width: 899px)").matches;

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function openCount() {
    return annotations.filter((a) => !a.resolved_at).length;
  }

  function setSidebarOpen(open) {
    document.body.classList.toggle("plan-comments-open", open);
    const rail = $("#plan-comments-rail");
    if (rail) {
      if (open) rail.setAttribute("hidden", "");
      else rail.removeAttribute("hidden");
      rail.setAttribute("aria-expanded", open ? "true" : "false");
    }
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (open) syncIdentityPanel();
  }

  function isSidebarOpen() {
    return document.body.classList.contains("plan-comments-open");
  }

  function updateBadge() {
    const n = openCount();
    document.querySelectorAll(".plan-comments-badge").forEach((badge) => {
      if (n > 0) {
        badge.hidden = false;
        badge.textContent = String(n);
      } else {
        badge.hidden = true;
      }
    });
    const meta = $("#plan-comments-count");
    if (meta) meta.textContent = `${n} open`;
  }

  function showError(message) {
    const el = $("#plan-comments-error");
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("is-visible", !!message);
  }

  function guestName() {
    try {
      return localStorage.getItem(NAME_KEY) || "";
    } catch {
      return "";
    }
  }

  function saveGuestName(name) {
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      /* ignore */
    }
  }

  function authorFieldsHtml(prefix) {
    if (viewer) {
      return `<p class="plan-comments-signed-in">Commenting as ${escapeHtml(viewer.name)}</p>`;
    }
    return `<label for="${prefix}-name">Your name</label>
      <input id="${prefix}-name" type="text" maxlength="120" value="${escapeHtml(guestName())}" placeholder="So we know who to follow up with" required autocomplete="name" />`;
  }

  function syncIdentityPanel(forceEdit = false) {
    const panel = $("#plan-comments-identity");
    if (!panel) return;
    if (viewer) {
      panel.classList.add("is-visible");
      panel.innerHTML = `<p class="plan-comments-signed-in">Commenting as ${escapeHtml(viewer.name)}</p>`;
      return;
    }
    const name = guestName();
    panel.classList.add("is-visible");
    if (name && !forceEdit) {
      panel.innerHTML = `
        <p class="plan-comments-signed-in">Commenting as <strong>${escapeHtml(name)}</strong>
          <button type="button" class="plan-btn" id="plan-identity-edit" style="margin-left:8px;padding:4px 8px;font-size:11px">Change</button>
        </p>`;
      $("#plan-identity-edit")?.addEventListener("click", () => syncIdentityPanel(true));
      return;
    }
    panel.innerHTML = `
      <p class="plan-comments-identity-hint">Add your name so Marketing knows who to follow up with.</p>
      <div class="plan-comments-identity-row">
        <div style="flex:1;display:flex;flex-direction:column;gap:6px">
          <label for="plan-identity-name">Your name</label>
          <input id="plan-identity-name" type="text" maxlength="120" value="${escapeHtml(name)}" placeholder="e.g. Alex from Sales" autocomplete="name" />
        </div>
        <button type="button" class="plan-btn plan-btn-primary" id="plan-identity-save">Save</button>
      </div>`;
    $("#plan-identity-save")?.addEventListener("click", () => {
      const input = /** @type {HTMLInputElement | null} */ ($("#plan-identity-name"));
      const next = (input?.value || "").trim();
      if (!next) {
        showError("Enter your name so we know who to follow up with.");
        input?.focus();
        return;
      }
      saveGuestName(next);
      showError("");
      syncComposerNameFields();
      syncIdentityPanel();
    });
    window.setTimeout(() => $("#plan-identity-name")?.focus(), 0);
  }

  function syncComposerNameFields() {
    const name = guestName();
    document.querySelectorAll("#plan-composer-name, .plan-thread-reply input[type='text']").forEach((el) => {
      if (el instanceof HTMLInputElement && !el.value) el.value = name;
    });
  }

  function requireAuthorName(scope) {
    if (viewer?.name) return viewer.name;
    const nameEl =
      scope?.querySelector?.("input[type='text']") ||
      $("#plan-composer-name") ||
      $("#plan-identity-name");
    const author_name = (nameEl?.value || guestName() || "").trim();
    if (!author_name) {
      showError("Enter your name so we know who to follow up with.");
      setSidebarOpen(true);
      syncIdentityPanel();
      (nameEl || $("#plan-identity-name"))?.focus();
      return "";
    }
    saveGuestName(author_name);
    syncComposerNameFields();
    return author_name;
  }

  function buildShell() {
    if ($("#plan-comments-sidebar")) return;

    const rail = document.createElement("button");
    rail.type = "button";
    rail.id = "plan-comments-rail";
    rail.className = "plan-comments-rail";
    rail.setAttribute("aria-controls", "plan-comments-sidebar");
    rail.setAttribute("aria-expanded", "false");
    rail.innerHTML =
      'Comments <span class="plan-comments-badge" hidden>0</span>';
    document.body.appendChild(rail);

    const aside = document.createElement("aside");
    aside.id = "plan-comments-sidebar";
    aside.className = "plan-comments-sidebar";
    aside.setAttribute("aria-label", "Plan comments");
    aside.innerHTML = `
      <div class="plan-comments-header">
        <div>
          <h2>Comments</h2>
          <div class="plan-comments-header-meta" id="plan-comments-count">0 open</div>
        </div>
        <button type="button" class="plan-comments-hide" id="plan-comments-hide">Hide</button>
      </div>
      <div class="plan-comments-identity" id="plan-comments-identity"></div>
      <div class="plan-comments-error" id="plan-comments-error" role="alert"></div>
      <div class="plan-comments-composer" id="plan-comments-composer">
        <p class="plan-comments-quote" id="plan-composer-quote"></p>
        ${authorFieldsHtml("plan-composer")}
        <label for="plan-composer-body">Comment</label>
        <textarea id="plan-composer-body" maxlength="4000" placeholder="Add your comment…"></textarea>
        <div class="plan-comments-actions">
          <button type="button" class="plan-btn" id="plan-composer-cancel">Cancel</button>
          <button type="button" class="plan-btn plan-btn-primary" id="plan-composer-save">Save</button>
        </div>
      </div>
      <div class="plan-comments-list" id="plan-comments-list"></div>
    `;
    document.body.appendChild(aside);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "plan-add-comment-btn";
    addBtn.id = "plan-add-comment-btn";
    addBtn.textContent = "Add comment";
    document.body.appendChild(addBtn);

    rail.addEventListener("click", () => setSidebarOpen(true));
    $("#plan-comments-hide")?.addEventListener("click", () => setSidebarOpen(false));
    $("#plan-composer-cancel")?.addEventListener("click", () => closeComposer());
    $("#plan-composer-save")?.addEventListener("click", () => void saveComposer());
    addBtn.addEventListener("click", () => openComposerFromSelection());
  }

  function closeComposer() {
    pendingSelection = null;
    const composer = $("#plan-comments-composer");
    composer?.classList.remove("is-open");
    const body = $("#plan-composer-body");
    if (body) body.value = "";
    hideAddButton();
  }

  function openComposerFromSelection() {
    if (!pendingSelection) return;
    setSidebarOpen(true);
    const composer = $("#plan-comments-composer");
    const quote = $("#plan-composer-quote");
    if (quote) quote.textContent = `“${pendingSelection.quote}”`;
    composer?.classList.add("is-open");
    syncComposerNameFields();
    const nameEl = $("#plan-composer-name");
    if (nameEl && !(nameEl.value || "").trim()) nameEl.focus();
    else $("#plan-composer-body")?.focus();
    hideAddButton();
  }

  function hideAddButton() {
    const btn = $("#plan-add-comment-btn");
    if (btn) btn.style.display = "none";
  }

  function showAddButton(rect) {
    const btn = $("#plan-add-comment-btn");
    if (!btn || !rect) return;
    const top = window.scrollY + rect.top - 40;
    const left = Math.min(
      window.scrollX + rect.left + rect.width / 2 - 56,
      window.scrollX + window.innerWidth - 140
    );
    btn.style.top = `${Math.max(8, top)}px`;
    btn.style.left = `${Math.max(8, left)}px`;
    btn.style.display = "inline-flex";
  }

  function nearestSectionId(node) {
    let el = node && node.nodeType === 3 ? node.parentElement : node;
    while (el && el !== document.body) {
      if (el.id) return el.id;
      el = el.parentElement;
    }
    return "";
  }

  function captureSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      pendingSelection = null;
      hideAddButton();
      return;
    }
    const range = sel.getRangeAt(0);
    const main = document.querySelector("main");
    if (!main || !main.contains(range.commonAncestorContainer)) {
      pendingSelection = null;
      hideAddButton();
      return;
    }
    const quote = sel.toString().replace(/\s+/g, " ").trim();
    if (quote.length < 2) {
      pendingSelection = null;
      hideAddButton();
      return;
    }

    const preRange = range.cloneRange();
    preRange.selectNodeContents(main);
    preRange.setEnd(range.startContainer, range.startOffset);
    const prefixFull = preRange.toString().replace(/\s+/g, " ");
    const prefix = prefixFull.slice(-CTX);

    const postRange = range.cloneRange();
    postRange.selectNodeContents(main);
    postRange.setStart(range.endContainer, range.endOffset);
    const suffixFull = postRange.toString().replace(/\s+/g, " ");
    const suffix = suffixFull.slice(0, CTX);

    pendingSelection = {
      quote,
      prefix,
      suffix,
      section_id: nearestSectionId(range.startContainer),
    };
    showAddButton(range.getBoundingClientRect());
  }

  function findTextRange(quote, prefix, suffix) {
    const main = document.querySelector("main");
    if (!main || !quote) return null;
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    /** @type {Text[]} */
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue) nodes.push(/** @type {Text} */ (node));
    }
    const full = nodes.map((n) => n.nodeValue || "").join("");
    const collapse = (s) => s.replace(/\s+/g, " ");
    const normFull = collapse(full);
    const needle = `${prefix || ""}${quote}${suffix || ""}`;
    let normStart = -1;
    if (prefix || suffix) {
      const at = normFull.indexOf(needle);
      if (at !== -1) normStart = at + (prefix || "").length;
    }
    if (normStart === -1) normStart = normFull.indexOf(quote);
    if (normStart === -1) return null;
    const normEnd = normStart + quote.length;

    const map = [];
    let normPos = 0;
    let lastWasSpace = false;
    for (let i = 0; i < full.length; i++) {
      const isSpace = /\s/.test(full[i]);
      if (isSpace) {
        if (!lastWasSpace) {
          map[normPos] = i;
          normPos += 1;
          lastWasSpace = true;
        }
      } else {
        map[normPos] = i;
        normPos += 1;
        lastWasSpace = false;
      }
    }
    map[normPos] = full.length;

    const startAbs = map[normStart];
    const endAbs = map[normEnd];
    if (startAbs == null || endAbs == null || endAbs <= startAbs) return null;

    let counted = 0;
    let startNode = null;
    let startOffset = 0;
    let endNode = null;
    let endOffset = 0;
    for (const textNode of nodes) {
      const len = (textNode.nodeValue || "").length;
      if (!startNode && counted + len > startAbs) {
        startNode = textNode;
        startOffset = startAbs - counted;
      }
      if (!endNode && counted + len >= endAbs) {
        endNode = textNode;
        endOffset = endAbs - counted;
        break;
      }
      counted += len;
    }
    if (!startNode || !endNode) return null;
    try {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      return range;
    } catch {
      return null;
    }
  }

  function wrapRange(range, id, resolved) {
    const mark = document.createElement("mark");
    mark.className = `plan-hl${resolved ? " is-resolved" : ""}`;
    mark.dataset.annotationId = id;
    mark.title = "View comment";
    try {
      const frag = range.extractContents();
      mark.appendChild(frag);
      range.insertNode(mark);
      return mark;
    } catch {
      try {
        range.surroundContents(mark);
        return mark;
      } catch {
        return null;
      }
    }
  }

  function clearHighlights() {
    document.querySelectorAll("mark.plan-hl").forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });
  }

  function applyHighlights() {
    clearHighlights();
    for (const ann of annotations) {
      const range = findTextRange(ann.quote, ann.prefix, ann.suffix);
      if (!range) continue;
      wrapRange(range, ann.id, !!ann.resolved_at);
    }
    if (selectedId) {
      document
        .querySelector(`mark.plan-hl[data-annotation-id="${CSS.escape(selectedId)}"]`)
        ?.classList.add("is-active");
    }
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }

  function renderList() {
    const list = $("#plan-comments-list");
    if (!list) return;
    const open = annotations.filter((a) => !a.resolved_at);
    const resolved = annotations.filter((a) => a.resolved_at);

    if (!annotations.length) {
      list.innerHTML =
        '<p class="plan-comments-empty">Select text in the plan to highlight and leave a comment.</p>';
      updateBadge();
      return;
    }

    const renderThread = (ann) => {
      const replies = (ann.replies || [])
        .map(
          (r) =>
            `<div class="plan-thread-reply-item"><strong>${escapeHtml(r.author_name)}</strong> · ${escapeHtml(formatTime(r.created_at))}<div>${escapeHtml(r.body)}</div></div>`
        )
        .join("");
      const resolveBtn = viewer
        ? `<button type="button" class="plan-btn" data-resolve="${escapeHtml(ann.id)}" data-resolved="${ann.resolved_at ? "0" : "1"}">${ann.resolved_at ? "Reopen" : "Resolve"}</button>`
        : "";
      return `
        <article class="plan-thread${selectedId === ann.id ? " is-active" : ""}${ann.resolved_at ? " is-resolved" : ""}" data-thread-id="${escapeHtml(ann.id)}">
          <div class="plan-thread-meta">
            <span>${escapeHtml(ann.author_name)}</span>
            <span>${escapeHtml(formatTime(ann.created_at))}</span>
          </div>
          <p class="plan-thread-quote">“${escapeHtml(ann.quote)}”</p>
          <p class="plan-thread-body">${escapeHtml(ann.body)}</p>
          ${replies ? `<div class="plan-thread-replies">${replies}</div>` : ""}
          <div class="plan-thread-footer">
            <button type="button" class="plan-btn" data-reply="${escapeHtml(ann.id)}">Reply</button>
            ${resolveBtn}
          </div>
          <div class="plan-thread-reply" id="reply-${escapeHtml(ann.id)}">
            ${authorFieldsHtml(`reply-${ann.id}`)}
            <textarea maxlength="4000" placeholder="Write a reply…"></textarea>
            <div class="plan-comments-actions">
              <button type="button" class="plan-btn" data-cancel-reply="${escapeHtml(ann.id)}">Cancel</button>
              <button type="button" class="plan-btn plan-btn-primary" data-save-reply="${escapeHtml(ann.id)}">Reply</button>
            </div>
          </div>
        </article>`;
    };

    list.innerHTML =
      open.map(renderThread).join("") +
      (resolved.length
        ? `<div class="plan-resolved-heading">Resolved</div>${resolved.map(renderThread).join("")}`
        : "");

    list.querySelectorAll("[data-thread-id]").forEach((el) => {
      el.addEventListener("click", (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        if (target.closest("button, textarea, input, label")) return;
        const id = el.getAttribute("data-thread-id") || "";
        focusThread(id, true);
      });
    });

    list.querySelectorAll("[data-reply]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-reply") || "";
        const box = $(`#reply-${CSS.escape(id)}`);
        box?.classList.add("is-open");
        const nameEl = box?.querySelector("input[type='text']");
        if (nameEl && !(nameEl.value || "").trim()) nameEl.focus();
        else box?.querySelector("textarea")?.focus();
      });
    });
    list.querySelectorAll("[data-cancel-reply]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-cancel-reply") || "";
        $(`#reply-${CSS.escape(id)}`)?.classList.remove("is-open");
      });
    });
    list.querySelectorAll("[data-save-reply]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        void saveReply(btn.getAttribute("data-save-reply") || "");
      });
    });
    list.querySelectorAll("[data-resolve]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        void toggleResolve(
          btn.getAttribute("data-resolve") || "",
          btn.getAttribute("data-resolved") === "1"
        );
      });
    });

    updateBadge();
  }

  function focusThread(id, scrollPlan) {
    selectedId = id;
    renderList();
    document.querySelectorAll("mark.plan-hl").forEach((m) => {
      m.classList.toggle("is-active", m.getAttribute("data-annotation-id") === id);
    });
    if (scrollPlan) {
      const mark = document.querySelector(
        `mark.plan-hl[data-annotation-id="${CSS.escape(id)}"]`
      );
      mark?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const thread = document.querySelector(`[data-thread-id="${CSS.escape(id)}"]`);
    thread?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function loadAnnotations() {
    showError("");
    try {
      const res = await fetch(API, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Could not load comments.");
      const data = await res.json();
      annotations = Array.isArray(data.annotations) ? data.annotations : [];
      viewer = data.viewer || null;
      applyHighlights();
      renderList();
      syncIdentityPanel();
      if (viewer) {
        const composer = $("#plan-comments-composer");
        if (composer && !$(".plan-comments-signed-in", composer)) {
          const quote = $("#plan-composer-quote");
          quote?.insertAdjacentHTML(
            "afterend",
            `<p class="plan-comments-signed-in">Commenting as ${escapeHtml(viewer.name)}</p>`
          );
        }
        document.querySelector('label[for="plan-composer-name"]')?.remove();
        $("#plan-composer-name")?.remove();
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not load comments.");
    }
  }

  async function saveComposer() {
    if (!pendingSelection || saving) return;
    const bodyEl = $("#plan-composer-body");
    const body = (bodyEl?.value || "").trim();
    if (!body) {
      showError("Write a comment before saving.");
      return;
    }
    const author_name = requireAuthorName($("#plan-comments-composer"));
    if (!author_name) return;

    saving = true;
    showError("");
    try {
      const res = await fetch(API, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...pendingSelection,
          body,
          author_name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save comment.");
      annotations.push(data.annotation);
      selectedId = data.annotation.id;
      closeComposer();
      applyHighlights();
      renderList();
      focusThread(selectedId, true);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not save comment.");
    } finally {
      saving = false;
    }
  }

  async function saveReply(id) {
    if (!id || saving) return;
    const box = $(`#reply-${CSS.escape(id)}`);
    if (!box) return;
    const body = (box.querySelector("textarea")?.value || "").trim();
    if (!body) {
      showError("Write a reply before saving.");
      return;
    }
    const author_name = requireAuthorName(box);
    if (!author_name) return;

    saving = true;
    showError("");
    try {
      const res = await fetch(`${API}/${encodeURIComponent(id)}/replies`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, author_name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save reply.");
      const idx = annotations.findIndex((a) => a.id === id);
      if (idx !== -1) annotations[idx] = data.annotation;
      selectedId = id;
      renderList();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not save reply.");
    } finally {
      saving = false;
    }
  }

  async function toggleResolve(id, resolved) {
    if (!viewer || !id || saving) return;
    saving = true;
    showError("");
    try {
      const res = await fetch(`${API}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not update comment.");
      const idx = annotations.findIndex((a) => a.id === id);
      if (idx !== -1) annotations[idx] = data.annotation;
      applyHighlights();
      renderList();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not update comment.");
    } finally {
      saving = false;
    }
  }

  function onDocClick(e) {
    const mark = e.target?.closest?.("mark.plan-hl");
    if (mark) {
      const id = mark.getAttribute("data-annotation-id") || "";
      setSidebarOpen(true);
      focusThread(id, false);
    }
  }

  function fixStickyNav() {
    const nav = document.querySelector("nav.plan-sticky-nav, nav[aria-label='Plan sections']");
    if (!nav) return;
    nav.classList.add("plan-sticky-nav");
    nav.style.position = "sticky";
    nav.style.top = "0";
    nav.style.zIndex = "50";

    let banner = document.querySelector(".plan-draft-banner");
    if (!banner) {
      const legacy = Array.from(document.querySelectorAll('[role="status"]')).find((el) =>
        (el.textContent || "").includes("Internal draft")
      );
      if (legacy) {
        legacy.classList.add("plan-draft-banner");
        banner = legacy;
      }
    }
    if (banner && banner.parentElement !== nav) {
      banner.classList.add("plan-draft-banner");
      banner.style.position = "static";
      banner.style.zIndex = "";
      nav.insertBefore(banner, nav.firstChild);
    }

    document.querySelectorAll(".plan-comments-toggle, #plan-comments-toggle").forEach((el) => {
      const wrap = el.closest("div");
      if (wrap && wrap.parentElement && wrap.children.length <= 2) wrap.remove();
      else el.remove();
    });
  }

  function initOpenState() {
    let open = true;
    try {
      const stored = localStorage.getItem(OPEN_KEY);
      if (stored === "0") open = false;
      if (stored === "1") open = true;
      if (stored == null && isMobile()) open = false;
    } catch {
      if (isMobile()) open = false;
    }
    setSidebarOpen(open);
  }

  function init() {
    fixStickyNav();
    buildShell();
    initOpenState();
    document.addEventListener("mouseup", () => {
      window.setTimeout(captureSelection, 0);
    });
    document.addEventListener("keyup", (e) => {
      if (e.key === "Escape") {
        hideAddButton();
        closeComposer();
      }
    });
    document.addEventListener("click", onDocClick);
    void loadAnnotations();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
