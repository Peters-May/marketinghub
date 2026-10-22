(function () {
  "use strict";

  var cfg = window.PMWebsiteChat;
  if (!cfg) return;
  // Prefer same-origin WP proxy (avoids CORS on staging). Fall back to Hub direct.
  var useProxy = Boolean(cfg.apiBase);
  if (!useProxy && (!cfg.hubUrl || !cfg.siteKey)) return;

  var sessionId = null;
  var sessionPromise = null;
  var greetingNode = null;
  var lastMessageAt = null;
  var seenIds = {};
  var pollTimer = null;
  var open = false;
  var inflightSends = 0;
  var startersShown = false;
  var teamJoined = false;
  var collectState = null;
  var lastCollectKind = "";
  /** Prevent restarting the guided form after it has just been submitted. */
  var suppressCollectTrigger = false;
  /** Plain-text lines for download on close. */
  var transcriptLines = [];
  var SESSION_KEY = "pm_website_chat_session_id";

  function rememberSession(id) {
    sessionId = id || null;
    try {
      if (sessionId) sessionStorage.setItem(SESSION_KEY, sessionId);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  function readRememberedSession() {
    try {
      return sessionStorage.getItem(SESSION_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  var YACHT_FIELDS = [
    { key: "name", label: "Your name" },
    { key: "email", label: "Business email", type: "email" },
    {
      key: "visitor_location",
      label: "Where are you based? (country or city)",
      placeholder: "e.g. London, UK",
    },
    {
      key: "yacht_location",
      label: "Where is the yacht now? (country or port)",
      placeholder: "e.g. Southampton, UK",
    },
    { key: "make_model", label: "Yacht make / model" },
    { key: "length", label: "Length (LOA)" },
    { key: "beam", label: "Beam" },
    { key: "height", label: "Overall transport height" },
    { key: "weight", label: "Approximate weight / displacement" },
    {
      key: "value",
      label: "Approximate value (include currency)",
      placeholder: "e.g. 10000 GBP",
    },
    { key: "destination", label: "Destination" },
    {
      key: "loading_port",
      label: "Preferred loading port (if different)",
      optional: true,
    },
    {
      key: "timeframe",
      label: "Preferred timeframe",
      placeholder: "e.g. March 2027",
      optional: true,
    },
    {
      key: "specs",
      label: "Drawings or specifications (optional — paste notes here)",
      optional: true,
    },
  ];

  var FREIGHT_FIELDS = [
    { key: "name", label: "Your name" },
    { key: "email", label: "Business email", type: "email" },
    {
      key: "visitor_location",
      label: "Where are you based? (country or city)",
      placeholder: "e.g. London, UK",
    },
    { key: "company", label: "Company", optional: true },
    { key: "commodity", label: "What are you shipping?" },
    { key: "origin", label: "Origin" },
    { key: "destination", label: "Destination" },
    { key: "pieces", label: "Pieces / pallets / containers", optional: true },
    { key: "dimensions", label: "Dimensions", optional: true },
    { key: "weight", label: "Weight", optional: true },
    { key: "timeframe", label: "Preferred timeframe", optional: true },
  ];

  var YACHT_STEPS = [
    { title: "About you", keys: ["name", "email", "visitor_location"] },
    { title: "The yacht", keys: ["make_model", "length", "beam", "height", "weight"] },
    { title: "The move", keys: ["yacht_location", "destination", "loading_port", "timeframe"] },
    { title: "Value and documents", keys: ["value", "specs"] },
  ];
  var FREIGHT_STEPS = [
    { title: "About you", keys: ["name", "email", "visitor_location", "company"] },
    { title: "The cargo", keys: ["commodity", "pieces", "dimensions", "weight"] },
    { title: "The route", keys: ["origin", "destination", "timeframe"] },
  ];

  function fieldByKey(kind, key) {
    var list = kind === "freight" ? FREIGHT_FIELDS : YACHT_FIELDS;
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) return list[i];
    }
    return null;
  }

  function apiUrl(hubPath) {
    if (useProxy) {
      return (
        String(cfg.apiBase).replace(/\/$/, "") +
        "/" +
        hubPath.replace(/^\//, "")
      );
    }
    return (
      String(cfg.hubUrl).replace(/\/$/, "") + "/" + hubPath.replace(/^\//, "")
    );
  }

  function headers() {
    var h = { "Content-Type": "application/json" };
    if (!useProxy && cfg.siteKey) {
      h["X-Chat-Site-Key"] = cfg.siteKey;
    }
    return h;
  }

  function parseBody(r) {
    var ctype = (r.headers.get("content-type") || "").toLowerCase();
    if (ctype.indexOf("application/json") !== -1) {
      return r.json().then(function (data) {
        if (typeof data === "string") {
          try {
            return JSON.parse(data);
          } catch (e) {
            return { error: data };
          }
        }
        return data;
      });
    }
    return r.text().then(function (t) {
      try {
        return JSON.parse(t);
      } catch (e) {
        return { error: t || "Request failed" };
      }
    });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function senderLabel(role, authorName) {
    if (role === "assistant") {
      return (
        (cfg.labels && cfg.labels.botSender) ||
        "Peters & May assistant"
      );
    }
    if (role === "staff") {
      var name = (authorName || "").trim();
      return (name || "Team") + " · Peters & May";
    }
    if (role === "visitor") return "You";
    return "";
  }

  function clockNow() {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date());
    } catch (e) {
      return "";
    }
  }

  function initialOf(name) {
    var n = String(name || "").trim();
    return n ? n.charAt(0).toUpperCase() : "P";
  }

  function appendBubble(role, body, id, authorName) {
    if (id && seenIds[id]) return;
    if (id) seenIds[id] = true;
    var text = String(body || "").trim();
    if (role === "system") {
      if (/asked to speak to the team/i.test(text)) return null;
      var line = el("div", "pm-chat__system", text);
      messagesEl.insertBefore(line, typingEl);
      pinFollowUps();
      messagesEl.scrollTop = messagesEl.scrollHeight;
      if (text) transcriptLines.push("[System] " + text);
      return line;
    }
    var wrap = el("div", "pm-chat__msg pm-chat__msg--" + role);
    var label = senderLabel(role, authorName);
    var bubble = el("div", "pm-chat__bubble pm-chat__bubble--" + role, body);
    if (role === "staff") {
      var avatar = el("span", "pm-chat__avatar", initialOf(authorName));
      avatar.setAttribute("aria-hidden", "true");
      var copy = el("div", "pm-chat__staff-copy");
      if (label) copy.appendChild(el("div", "pm-chat__sender", label));
      copy.appendChild(bubble);
      wrap.appendChild(avatar);
      wrap.appendChild(copy);
    } else {
      if (label) wrap.appendChild(el("div", "pm-chat__sender", label));
      wrap.appendChild(bubble);
    }
    messagesEl.insertBefore(wrap, typingEl);
    pinFollowUps();
    messagesEl.scrollTop = messagesEl.scrollHeight;
    var who = label || (role === "visitor" ? "You" : role);
    if (text) transcriptLines.push("[" + who + "] " + text);
    return wrap;
  }

  function downloadTranscriptFile() {
    var text = transcriptLines.join("\n\n").trim();
    if (!text) text = "No messages in this chat yet.";
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download =
      "peters-and-may-chat" +
      (sessionId ? "-" + String(sessionId).slice(0, 8) : "") +
      ".txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Free-type message box always stays at the bottom (never hide). */
  function ensureComposerVisible() {
    composer.classList.remove("is-hidden");
    if (composer.parentNode === panel) panel.appendChild(composer);
    if (footer.parentNode === panel) panel.appendChild(footer);
  }

  function noteTeamJoined(authorName) {
    if (teamJoined) return;
    teamJoined = true;
    hideStarters();
    var chips = messagesEl.querySelectorAll(".pm-chat__choices");
    for (var i = 0; i < chips.length; i++) chips[i].parentNode.removeChild(chips[i]);
    var who = (authorName || "").trim() || "A colleague";
    var first = who.split(/\s+/)[0];
    var when = clockNow();
    appendBubble(
      "system",
      who + " from the team joined" + (when ? " · " + when : "")
    );
    var title = headerText.querySelector(".pm-chat__title");
    var sub = headerText.querySelector(".pm-chat__subtitle");
    if (title) title.textContent = first;
    if (sub) {
      sub.textContent =
        lastCollectKind === "freight"
          ? "Freight forwarding team"
          : "Yacht transport team";
    }
  }

  function setTyping(on) {
    typingEl.classList.toggle("is-on", !!on);
    messagesEl.appendChild(typingEl);
    if (on) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function tidyChoiceLabel(raw) {
    var t = String(raw || "")
      .replace(/\s+/g, " ")
      .replace(/[?.]+$/g, "")
      .trim();
    t = t.replace(
      /^(you(?:'re| are)\s+looking to\s+(?:transport|ship|move)\s+)/i,
      ""
    );
    t = t.replace(/^or\s+/i, "");
    t = t.replace(/^(a|an|the)\s+/i, "");
    if (t.length < 2 || t.length > 40) return "";
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function uniqueChoiceLabels(parts) {
    var seen = {};
    var out = [];
    parts.forEach(function (part) {
      if (!part || out.length >= 5) return;
      var key = part.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(part);
    });
    return out.length >= 2 ? out : [];
  }

  /** Closed-set questions become tappable answers. Open questions stay free type. */
  function splitReplyChoices(raw) {
    var text = String(raw || "").trim();
    var tagged = text.match(/\[\[choices:\s*([^\]]+?)\]\]/i);
    var body = text
      .replace(/\[\[choices:\s*[^\]]+?\]\]/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (tagged) {
      return {
        body: body,
        choices: uniqueChoiceLabels(
          tagged[1].split("|").map(tidyChoiceLabel)
        ),
      };
    }
    return { body: body, choices: inferChoiceLabels(body) };
  }

  function inferChoiceLabels(body) {
    if (!body || body.length > 700) return [];
    var question = body.match(/([^.!?\n]{8,220}\?)\s*$/);
    if (!question) return [];
    var sentence = question[1];
    if (!/\bor\b/i.test(sentence)) return [];
    if (
      !/\b(whether|either|or something else|which of|looking to|yacht|freight)\b/i.test(
        sentence
      )
    ) {
      return [];
    }
    if (
      /\b(name|e-?mail|company|length|loa|beam|height|weight|displacement|value|destination|port|dimension|phone|address|timeframe)\b/i.test(
        sentence
      ) &&
      !/something else/i.test(sentence)
    ) {
      return [];
    }
    var clause = sentence.replace(/\?\s*$/, "");
    var whether = clause.match(/\bwhether\b\s+([\s\S]+)$/i);
    if (whether) clause = whether[1];
    clause = clause.replace(
      /^.*?\b(?:looking to|want to|like to)\s+(?:transport|ship|move)\s+/i,
      ""
    );
    var parts = clause.split(/\s*,\s*|\s+\bor\b\s+/i).map(function (part) {
      return tidyChoiceLabel(
        part.replace(
          /^you(?:'re| are)\s+looking to\s+(?:transport|ship|move)\s+/i,
          ""
        )
      );
    });
    if (
      parts.some(function (part) {
        return (
          part &&
          /\b(name|e-?mail|company|length|loa|beam|height|weight|value|destination|port)\b/i.test(
            part
          )
        );
      })
    ) {
      return [];
    }
    return uniqueChoiceLabels(parts);
  }

  function offerChoiceChips(choices, anchor) {
    if (!choices || choices.length < 2 || collectState || teamJoined) return false;
    var group = el("div", "pm-chat__choices");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Suggested answers");
    choices.forEach(function (label) {
      var btn = el("button", "pm-chat__chip pm-chat__chip--choice", label);
      btn.type = "button";
      btn.addEventListener("click", function () {
        group.remove();
        sendMessageText(label);
      });
      group.appendChild(btn);
    });
    group.appendChild(
      el("p", "pm-chat__choice-hint", "Or type your own answer below.")
    );
    if (anchor) anchor.appendChild(group);
    else {
      clearNode(startersEl);
      startersEl.classList.add("is-on");
      startersEl.appendChild(group);
    }
    ensureComposerVisible();
    return true;
  }

  function presentAssistant(body, id, authorName, choices) {
    var parsed = splitReplyChoices(body);
    var labels =
      choices && choices.length >= 2 ? choices : parsed.choices;
    var wrap = appendBubble(
      "assistant",
      parsed.body,
      id,
      authorName
    );
    if (looksLikeHandover(parsed.body) || isGuidedEnquiryPayload(parsed.body)) {
      endGuidedEnquiryUi();
      return;
    }
    if (collectState || teamJoined) return;
    if (offerChoiceChips(labels, wrap)) return;
    maybeOfferGuidedFromAssistant(parsed.body);
  }

  function looksLikeYachtChecklist(text) {
    var t = String(text || "").toLowerCase();
    var hits = 0;
    if (/make\s*\/?\s*model|make\/model/.test(t)) hits++;
    if (/\blength\b|\bloa\b/.test(t)) hits++;
    if (/\bbeam\b/.test(t)) hits++;
    if (/transport height|overall height/.test(t)) hits++;
    if (/\bweight\b|displacement/.test(t)) hits++;
    return hits >= 3;
  }

  var root = el(
    "div",
    "pm-chat--" + (cfg.position === "bottom-left" ? "bl" : "br")
  );
  root.id = "pm-website-chat-root";

  var panel = el("div", "pm-chat__panel");
  var header = el("div", "pm-chat__header");
  if (cfg.logoUrl) {
    var lockup = el("img", "pm-chat__lockup");
    lockup.src = cfg.logoUrl;
    lockup.alt = "Peters & May";
    header.appendChild(lockup);
    header.appendChild(el("span", "pm-chat__header-rule"));
  }
  var headerText = el("div", "pm-chat__header-text");
  headerText.appendChild(el("p", "pm-chat__title", cfg.labels.title));
  headerText.appendChild(el("p", "pm-chat__subtitle", cfg.labels.subtitle));
  header.appendChild(headerText);
  var headerActions = el("div", "pm-chat__header-actions");
  var minimizeBtn = el("button", "pm-chat__icon-btn");
  minimizeBtn.type = "button";
  minimizeBtn.setAttribute("aria-label", "Minimise chat");
  minimizeBtn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var closeBtn = el("button", "pm-chat__icon-btn");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "End chat");
  closeBtn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  headerActions.appendChild(minimizeBtn);
  headerActions.appendChild(closeBtn);
  header.appendChild(headerActions);
  panel.appendChild(header);

  var speakBtn = el("button", "pm-chat__speak", cfg.labels.speak);
  speakBtn.type = "button";

  var messagesEl = el("div", "pm-chat__messages");
  messagesEl.setAttribute("aria-live", "polite");
  var typingEl = el("div", "pm-chat__bubble pm-chat__bubble--assistant pm-chat__typing");
  typingEl.setAttribute("aria-label", "Assistant is typing");
  typingEl.appendChild(el("span"));
  typingEl.appendChild(el("span"));
  typingEl.appendChild(el("span"));
  messagesEl.appendChild(typingEl);
  panel.appendChild(messagesEl);

  var startersEl = el("div", "pm-chat__starters");
  var collectEl = el("div", "pm-chat__card");

  var nameInput = el("input", "pm-chat__collect-input");
  nameInput.type = "text";
  nameInput.placeholder = "Alex Morgan";
  var emailInput = el("input", "pm-chat__collect-input");
  emailInput.type = "email";
  emailInput.placeholder = "alex@company.com";
  var companyInput = el("input", "pm-chat__collect-input");
  companyInput.type = "text";
  companyInput.placeholder = "Company name";
  var leadSend = el("button", "pm-chat__btn-primary", "Send to the team");
  leadSend.type = "button";
  var lead = el("div", "pm-chat__card");

  var footer = el("div", "pm-chat__footer");
  footer.appendChild(
    el("span", "", "Automated answers from our published information")
  );
  footer.appendChild(speakBtn);

  var composer = el("div", "pm-chat__composer");
  var input = el("input", "");
  input.type = "text";
  input.placeholder = cfg.labels.placeholder || "Message…";
  var sendBtn = el("button", "pm-chat__send");
  sendBtn.type = "button";
  sendBtn.setAttribute("aria-label", "Send");
  sendBtn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  composer.appendChild(input);
  composer.appendChild(sendBtn);
  panel.appendChild(composer);
  panel.appendChild(footer);

  var launcher = el("button", "pm-chat__launcher");
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Chat with us");
  launcher.innerHTML =
    '<svg class="pm-chat__launcher-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M21 12a8.5 8.5 0 0 1-8.5 8.5c-1.4 0-2.7-.3-3.9-.9L3 21l1.5-4.4A8.4 8.4 0 0 1 3.5 12 8.5 8.5 0 1 1 21 12Z"/>' +
    '<path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>' +
    "</svg>" +
    '<span class="pm-chat__launcher-label">Chat with us</span>';

  root.appendChild(panel);
  root.appendChild(launcher);
  document.body.appendChild(root);

  function setOpen(next) {
    open = next;
    root.classList.toggle("pm-chat--open", open);
    if (open && !sessionId) {
      var remembered = readRememberedSession();
      if (remembered) resumeSession(remembered);
      else startSession();
    }
    if (open) {
      startPoll();
      document.body.classList.add("pm-chat-lock");
      panel.setAttribute("tabindex", "-1");
      input.focus();
    } else {
      stopPoll();
      document.body.classList.remove("pm-chat-lock");
      launcher.focus();
    }
  }

  function hideStarters() {
    startersEl.classList.remove("is-on", "pm-chat__followups");
    clearNode(startersEl);
    if (startersEl.parentNode) startersEl.parentNode.removeChild(startersEl);
  }

  function addStarter(title, desc, onClick) {
    var btn = el("button", "pm-chat__starter");
    btn.type = "button";
    var copy = el("span", "pm-chat__starter-copy");
    copy.appendChild(el("span", "pm-chat__starter-title", title));
    copy.appendChild(el("span", "pm-chat__starter-desc", desc));
    btn.appendChild(copy);
    btn.insertAdjacentHTML(
      "beforeend",
      '<svg class="pm-chat__chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>'
    );
    btn.addEventListener("click", function () {
      hideStarters();
      onClick();
    });
    startersEl.appendChild(btn);
  }

  function showUnavailableNotice(onRetry) {
    var notice = el("div", "pm-chat__notice");
    notice.setAttribute("role", "alert");
    notice.appendChild(el("strong", "", "Chat isn't available right now"));
    notice.appendChild(
      el(
        "span",
        "",
        "Try again in a moment, or contact your nearest office directly."
      )
    );
    var actions = el("div", "pm-chat__notice-actions");
    var retry = el("button", "", "Try again");
    retry.type = "button";
    retry.addEventListener("click", function () {
      if (notice.parentNode) notice.parentNode.removeChild(notice);
      onRetry();
    });
    var office = el("a", "", "Find an office");
    office.href = "https://www.petersandmay.com/offices/";
    office.target = "_blank";
    office.rel = "noreferrer";
    actions.appendChild(retry);
    actions.appendChild(office);
    notice.appendChild(actions);
    messagesEl.insertBefore(notice, typingEl);
    return notice;
  }

  function placeInThread(node) {
    if (!node) return;
    messagesEl.insertBefore(node, typingEl);
  }

  function pinFollowUps() {
    if (!startersEl.classList.contains("is-on")) return;
    messagesEl.insertBefore(startersEl, typingEl);
  }

  function showStarters() {
    if (startersShown || teamJoined) return;
    startersShown = true;
    clearNode(startersEl);
    startersEl.classList.remove("pm-chat__followups");
    startersEl.classList.add("is-on");

    addStarter("Get a quote", "Yacht transport or freight", function () {
      showQuoteTypeStarters();
    });
    addStarter("Ask a question", "Services, offices, sailing schedules", function () {
      appendBubble("visitor", "Ask a question");
      appendBubble("assistant", "What would you like to know?");
      ensureComposerVisible();
      input.focus();
    });
    addStarter("Speak to the team", "A colleague replies here or by email", function () {
      showSpeakCard();
    });
    placeInThread(startersEl);
  }

  function showWhatElseChip() {
    if (collectState) return;
    clearNode(startersEl);
    startersEl.classList.add("is-on", "pm-chat__followups");
    function addFollow(label, onClick) {
      var btn = el("button", "pm-chat__followup", label);
      btn.type = "button";
      btn.addEventListener("click", function () {
        hideStarters();
        onClick();
      });
      startersEl.appendChild(btn);
    }
    addFollow("Something else", function () {
      showStartersFresh();
    });
    addFollow("Download transcript", function () {
      downloadTranscriptFile();
    });
    addFollow("Speak to the team", function () {
      showSpeakCard();
    });
    placeInThread(startersEl);
  }

  function showStartersFresh() {
    startersShown = false;
    showStarters();
  }

  function detectQuoteKindFromText(text) {
    var t = String(text || "").toLowerCase();
    if (
      /\b(yacht|boat|sailboat|motor.?yacht|catamaran|loa|berth)\b/.test(t)
    ) {
      return "yacht";
    }
    if (
      /\b(freight|cargo|pallet|container|forwarding|air freight|customs)\b/.test(
        t
      )
    ) {
      return "freight";
    }
    if (/\b(quote|quotat|ship(ping)?|transport)\b/.test(t)) {
      return "yacht";
    }
    return null;
  }

  function showQuoteTypeStarters() {
    clearNode(startersEl);
    startersEl.classList.remove("pm-chat__followups");
    startersEl.classList.add("is-on");
    addStarter("Yacht transport", "Motor or sail, any size", function () {
      startCollect("yacht", { force: true });
    });
    addStarter("Freight or cargo", "Commercial cargo, air, sea or road", function () {
      startCollect("freight", { force: true });
    });
    addStarter("Something else", "Tell us in your own words", function () {
      ensureComposerVisible();
      input.focus();
    });
    placeInThread(startersEl);
  }

  function offerGuidedCollect(kind) {
    clearNode(startersEl);
    startersEl.classList.add("is-on");
    var btn = el(
      "button",
      "pm-chat__chip",
      kind === "freight"
        ? "Answer step by step"
        : "Answer step by step"
    );
    btn.type = "button";
    btn.addEventListener("click", function () {
      hideStarters();
      startCollect(kind || "yacht", { force: true });
    });
    startersEl.appendChild(btn);

    var paste = el("button", "pm-chat__chip", "Paste all details");
    paste.type = "button";
    paste.addEventListener("click", function () {
      hideStarters();
      startCollect(kind || "yacht", { pasteFirst: true, force: true });
    });
    startersEl.appendChild(paste);
    placeInThread(startersEl);
  }

  function stopCollect() {
    collectState = null;
    clearNode(collectEl);
    if (collectEl.parentNode) collectEl.parentNode.removeChild(collectEl);
    if (!teamJoined) input.placeholder = cfg.labels.placeholder || "Message…";
    ensureComposerVisible();
  }

  function showSpeakCard() {
    if (teamJoined) return;
    hideStarters();
    stopCollect();
    clearNode(lead);
    var head = el("div", "pm-chat__card-head");
    head.appendChild(el("span", "pm-chat__card-title", "Speak to the team"));
    var dismiss = el("button", "pm-chat__card-close", "×");
    dismiss.type = "button";
    dismiss.setAttribute("aria-label", "Close");
    dismiss.addEventListener("click", function () {
      if (lead.parentNode) lead.parentNode.removeChild(lead);
    });
    head.appendChild(dismiss);
    lead.appendChild(head);
    var body = el("div", "pm-chat__card-body");
    var hours = (cfg.labels && cfg.labels.hours) || "";
    body.appendChild(
      el(
        "p",
        "pm-chat__hint",
        "A colleague will reply here. If you close this window, we'll reply by email." +
          (hours ? " " + hours : "")
      )
    );
    function fieldBlock(labelText, inputEl) {
      var wrap = el("label", "pm-chat__field");
      wrap.appendChild(el("span", "pm-chat__field-label", labelText));
      wrap.appendChild(inputEl);
      return wrap;
    }
    body.appendChild(fieldBlock("Name", nameInput));
    body.appendChild(fieldBlock("Business email", emailInput));
    body.appendChild(fieldBlock("Company (optional)", companyInput));
    leadSend.className = "pm-chat__btn-primary";
    leadSend.textContent = "Send to the team";
    leadSend.style.width = "100%";
    body.appendChild(leadSend);
    lead.appendChild(body);
    placeInThread(lead);
    nameInput.focus();
  }

  function startCollect(kind, opts) {
    opts = opts || {};
    if (suppressCollectTrigger && !opts.force) return;
    // Explicit chip restart of a new quote.
    if (opts.force) suppressCollectTrigger = false;
    lastCollectKind = kind;
    var steps = kind === "freight" ? FREIGHT_STEPS : YACHT_STEPS;
    collectState = {
      kind: kind,
      fields: kind === "freight" ? FREIGHT_FIELDS : YACHT_FIELDS,
      steps: steps,
      index: 0,
      values: {},
      pasteMode: !!opts.pasteFirst,
    };
    hideStarters();
    ensureComposerVisible();

    var intro =
      kind === "freight"
        ? "Thank you. I'll take a few details in three short steps. You can also paste a full enquiry if you prefer."
        : "Thank you. I'll take a few details in four short steps. If you have a specification sheet, you can paste it instead.";
    appendBubble("assistant", intro);
    input.placeholder = "Or ask a question…";
    renderCollectStep();
  }

  function cardHead(title, stepLabel) {
    var head = el("div", "pm-chat__card-head");
    head.appendChild(el("span", "pm-chat__card-title", title));
    if (stepLabel) head.appendChild(el("span", "pm-chat__card-step", stepLabel));
    var dismiss = el("button", "pm-chat__card-close", "×");
    dismiss.type = "button";
    dismiss.setAttribute("aria-label", "Close form");
    dismiss.addEventListener("click", function () {
      stopCollect();
    });
    head.appendChild(dismiss);
    return head;
  }

  function renderCollectStep() {
    if (!collectState) return;
    clearNode(collectEl);
    placeInThread(collectEl);
    input.placeholder = "Or ask a question…";

    if (collectState.pasteMode) {
      var freightPaste = collectState.kind === "freight";
      collectEl.appendChild(
        cardHead(
          freightPaste ? "Paste your cargo details" : "Paste your yacht details",
          ""
        )
      );
      var body = el("div", "pm-chat__card-body");
      body.appendChild(
        el(
          "p",
          "pm-chat__hint",
          freightPaste
            ? "Packing list, commercial invoice or an email. We'll pick out what the team needs and only ask for anything missing."
            : "Spec sheet, broker listing or an email. We'll pick out what the team needs and only ask for anything missing."
        )
      );
      var ta = el("textarea", "pm-chat__collect-input");
      ta.rows = 6;
      ta.style.minHeight = "150px";
      ta.placeholder = freightPaste
        ? "Paste the cargo, size, weight, ports and contact details"
        : "Paste make, model, dimensions, ports and contact details";
      body.appendChild(ta);
      collectEl.appendChild(body);
      var row = el("div", "pm-chat__card-actions");
      var back = el("button", "pm-chat__btn-secondary", "Answer step by step");
      back.type = "button";
      back.addEventListener("click", function () {
        collectState.pasteMode = false;
        renderCollectStep();
      });
      var submit = el("button", "pm-chat__btn-primary", "Send details");
      submit.type = "button";
      submit.addEventListener("click", function () {
        var text = (ta.value || "").trim();
        if (!text) {
          ta.focus();
          return;
        }
        finishCollectFromPaste(text);
      });
      row.appendChild(back);
      row.appendChild(submit);
      collectEl.appendChild(row);
      ta.focus();
      return;
    }

    var stepDef = collectState.steps[collectState.index];
    var total = collectState.steps.length;
    var step = collectState.index + 1;
    collectEl.appendChild(
      cardHead(stepDef.title, "Step " + step + " of " + total)
    );
    var progress = el("div", "pm-chat__progress");
    for (var p = 0; p < total; p++) {
      var seg = document.createElement("i");
      if (p <= collectState.index) seg.className = "is-on";
      progress.appendChild(seg);
    }
    collectEl.appendChild(progress);

    var formBody = el("div", "pm-chat__card-body");
    var gridKeys = { length: 1, beam: 1, height: 1, weight: 1 };
    var grid = null;
    var inputs = [];
    stepDef.keys.forEach(function (key) {
      var field = fieldByKey(collectState.kind, key);
      if (!field) return;
      var wrap = el("label", "pm-chat__field");
      wrap.appendChild(
        el(
          "span",
          "pm-chat__field-label",
          field.label + (field.optional ? " (optional)" : "")
        )
      );
      var inputEl =
        field.key === "specs"
          ? el("textarea", "pm-chat__collect-input")
          : el("input", "pm-chat__collect-input");
      if (inputEl.tagName === "INPUT") inputEl.type = field.type || "text";
      else inputEl.rows = 3;
      inputEl.placeholder = field.placeholder || "";
      inputEl.value = collectState.values[field.key] || "";
      wrap.appendChild(inputEl);
      var err = el("span", "pm-chat__field-error");
      wrap.appendChild(err);
      if (gridKeys[key] && stepDef.title === "The yacht") {
        if (!grid) {
          grid = el("div", "pm-chat__grid");
          formBody.appendChild(grid);
        }
        grid.appendChild(wrap);
      } else {
        formBody.appendChild(wrap);
      }
      inputs.push({ field: field, input: inputEl, error: err });
    });
    if (stepDef.title === "The yacht") {
      var hint = el("p", "pm-chat__hint");
      hint.appendChild(
        document.createTextNode("Metres or feet are fine. Have a spec sheet? ")
      );
      var pasteLink = el("button", "pm-chat__linkish", "Paste it instead");
      pasteLink.type = "button";
      pasteLink.addEventListener("click", function () {
        collectState.pasteMode = true;
        renderCollectStep();
      });
      hint.appendChild(pasteLink);
      formBody.appendChild(hint);
    }
    collectEl.appendChild(formBody);

    var actions = el("div", "pm-chat__card-actions");
    if (collectState.index > 0) {
      var backStep = el("button", "pm-chat__btn-ghost", "Back");
      backStep.type = "button";
      backStep.addEventListener("click", function () {
        inputs.forEach(function (item) {
          collectState.values[item.field.key] = (item.input.value || "").trim();
        });
        collectState.index -= 1;
        renderCollectStep();
      });
      actions.appendChild(backStep);
    } else {
      actions.appendChild(el("span", ""));
    }
    var next = el(
      "button",
      "pm-chat__btn-primary",
      collectState.index === total - 1 ? "Send to team" : "Continue"
    );
    next.type = "button";
    next.addEventListener("click", function () {
      var ok = true;
      inputs.forEach(function (item) {
        var value = (item.input.value || "").trim();
        item.error.textContent = "";
        if (!value && !item.field.optional) {
          item.error.textContent = "Please complete this.";
          ok = false;
        } else if (
          item.field.type === "email" &&
          value &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ) {
          item.error.textContent = "Enter a valid email address.";
          ok = false;
        } else {
          collectState.values[item.field.key] = value;
        }
      });
      if (!ok) return;
      collectState.index += 1;
      if (collectState.index >= collectState.steps.length) {
        finishCollectFromFields();
      } else {
        renderCollectStep();
      }
    });
    actions.appendChild(next);
    collectEl.appendChild(actions);
    if (inputs[0]) inputs[0].input.focus();
  }

  function advanceCollect(inputEl) {
    if (!collectState) return;
    var field = collectState.fields[collectState.index];
    var value = (inputEl.value || "").trim();
    if (!value && !field.optional) {
      inputEl.focus();
      return;
    }
    if (field.type === "email" && value) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        inputEl.focus();
        return;
      }
    }
    collectState.values[field.key] = value;
    collectState.index += 1;
    if (collectState.index >= collectState.fields.length) {
      finishCollectFromFields();
    } else {
      renderCollectStep();
    }
  }

  function formatCollectValues(kind, values) {
    var lines = [
      kind === "freight"
        ? "Freight / cargo enquiry (guided form):"
        : "Yacht transport enquiry (guided form):",
    ];
    var fields = kind === "freight" ? FREIGHT_FIELDS : YACHT_FIELDS;
    fields.forEach(function (f) {
      var v = (values[f.key] || "").trim();
      if (v) lines.push(f.label + ": " + v);
    });
    return lines.join("\n");
  }

  function isGuidedEnquiryPayload(text) {
    var t = String(text || "");
    return (
      /enquiry \(guided form\):/i.test(t) ||
      /enquiry \(pasted details\):/i.test(t) ||
      (t.split("\n").length >= 4 &&
        /\b(length \(loa\)|yacht make|destination|business email)\b/i.test(t))
    );
  }

  function finishCollectFromFields() {
    if (!collectState) return;
    var kind = collectState.kind;
    var values = collectState.values;
    var summary = formatCollectValues(kind, values);
    if (values.email) emailInput.value = values.email;
    if (values.name) nameInput.value = values.name;
    if (values.company) companyInput.value = values.company;
    suppressCollectTrigger = true;
    stopCollect();
    // Persist enquiry + Portal when email was collected; then continue AI thread.
    if (emailInput.value.trim()) {
      submitLead({ quiet: true });
    }
    sendMessageText(summary, { skipCollect: true });
  }

  function finishCollectFromPaste(text) {
    var kind = collectState && collectState.kind;
    var pasted = String(text || "");
    var emailMatch = pasted.match(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    );
    if (emailMatch && !emailInput.value.trim()) {
      emailInput.value = emailMatch[0];
    }
    suppressCollectTrigger = true;
    stopCollect();
    if (emailInput.value.trim()) {
      submitLead({ quiet: true });
    }
    sendMessageText(
      (kind === "freight"
        ? "Freight / cargo enquiry (pasted details):\n"
        : "Yacht transport enquiry (pasted details):\n") + pasted,
      { skipCollect: true }
    );
  }

  function looksLikeHandover(body) {
    var t = String(body || "").toLowerCase();
    return (
      /enough information/.test(t) ||
      /pass this to our/.test(t) ||
      /contact you directly/.test(t) ||
      /noted .+ and will follow up/.test(t) ||
      /further quer/.test(t)
    );
  }

  function endGuidedEnquiryUi() {
    suppressCollectTrigger = true;
    stopCollect();
    hideStarters();
    ensureComposerVisible();
    showWhatElseChip();
  }

  function maybeOfferGuidedFromAssistant(body) {
    // Never reopen the step form after a completed enquiry or handover.
    if (looksLikeHandover(body) || isGuidedEnquiryPayload(body)) {
      endGuidedEnquiryUi();
      return;
    }
    if (collectState || suppressCollectTrigger) return;
    if (looksLikeYachtChecklist(body)) {
      offerGuidedCollect("yacht");
      return;
    }
  }

  /**
   * Do not auto-open the guided form from free-typed messages.
   * Collect starts only from Get a quote / yacht / freight chips.
   */
  function maybeStartCollectFromVisitor(_text) {
    return;
  }

  function syncSeen() {
    if (!sessionId) return Promise.resolve();
    return fetch(
      apiUrl(
        "api/chat/sessions/" + encodeURIComponent(sessionId) + "/messages"
      ),
      {
        headers: headers(),
        credentials: useProxy ? "same-origin" : "omit",
      }
    )
      .then(parseBody)
      .then(function (data) {
        (data.messages || []).forEach(function (m) {
          if (m.id) seenIds[m.id] = true;
          if (m.created_at) lastMessageAt = m.created_at;
        });
      })
      .catch(function () {});
  }

  function startPoll() {
    stopPoll();
    function pollOnce() {
      if (!sessionId || !open) return;
      var path =
        "api/chat/sessions/" +
        encodeURIComponent(sessionId) +
        "/messages?t=" +
        Date.now();
      fetch(apiUrl(path), {
        headers: headers(),
        credentials: useProxy ? "same-origin" : "omit",
        cache: "no-store",
      })
        .then(parseBody)
        .then(function (data) {
          if (!data.messages) return;
          data.messages.forEach(function (m) {
            if (m.id && seenIds[m.id]) return;
            if (m.role === "visitor") {
              if (m.id) seenIds[m.id] = true;
              if (m.created_at) lastMessageAt = m.created_at;
              return;
            }
            if (m.role === "staff" || m.role === "system") {
              if (m.role === "staff") noteTeamJoined(m.author_name);
              appendBubble(m.role, m.body, m.id, m.author_name);
            } else if (m.role === "assistant") {
              presentAssistant(m.body, m.id);
            } else if (m.id) {
              seenIds[m.id] = true;
            }
            if (m.created_at) lastMessageAt = m.created_at;
          });
        })
        .catch(function () {});
    }
    pollOnce();
    pollTimer = setInterval(pollOnce, 4000);
  }

  function stopPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function resumeSession(id) {
    setTyping(true);
    fetch(
      apiUrl("api/chat/sessions/" + encodeURIComponent(id) + "/messages"),
      {
        headers: headers(),
        credentials: useProxy ? "same-origin" : "omit",
      }
    )
      .then(function (r) {
        return parseBody(r).then(function (data) {
          if (!r.ok) throw new Error(data.error || "Could not resume chat");
          return data;
        });
      })
      .then(function (data) {
        if (data.session && data.session.status === "closed") {
          rememberSession(null);
          startSession();
          return;
        }
        rememberSession(id);
        greetingNode = null;
        clearNode(messagesEl);
        messagesEl.appendChild(typingEl);
        seenIds = {};
        lastMessageAt = null;
        (data.messages || []).forEach(function (m) {
          if (m.role === "visitor") {
            appendBubble("visitor", m.body, m.id);
          } else {
            if (m.role === "staff") noteTeamJoined(m.author_name);
            appendBubble(m.role, m.body, m.id, m.author_name);
          }
          if (m.created_at) lastMessageAt = m.created_at;
        });
        startersShown = true;
        hideStarters();
        var last = (data.messages || [])[(data.messages || []).length - 1];
        if (last && last.role === "assistant") {
          var resumed = splitReplyChoices(last.body);
          if (
            !looksLikeHandover(resumed.body) &&
            !isGuidedEnquiryPayload(resumed.body)
          ) {
            offerChoiceChips(resumed.choices);
          }
        }
      })
      .catch(function () {
        rememberSession(null);
        startSession();
      })
      .finally(function () {
        setTyping(false);
      });
  }

  function localGreeting() {
    var custom = cfg.greeting && String(cfg.greeting).trim();
    return (
      custom ||
      "Hello. I can start a yacht or freight enquiry, answer questions from our published information, or put you in touch with the team."
    );
  }

  function showOpeningGreeting() {
    if (greetingNode) return;
    greetingNode = appendBubble("assistant", localGreeting());
    showStarters();
  }

  function startSession() {
    if (sessionId) return Promise.resolve(sessionId);
    if (sessionPromise) return sessionPromise;
    showOpeningGreeting();
    sessionPromise = fetch(apiUrl("api/chat/sessions"), {
      method: "POST",
      headers: headers(),
      credentials: useProxy ? "same-origin" : "omit",
      body: JSON.stringify({
        page_url: cfg.pageUrl,
        page_title: cfg.pageTitle,
        referrer: cfg.referrer,
        utm: cfg.utm || {},
      }),
    })
      .then(function (r) {
        return parseBody(r).then(function (data) {
          if (!r.ok) throw new Error(data.error || "Could not start chat");
          return data;
        });
      })
      .then(function (data) {
        rememberSession(data.session && data.session.id);
        if (data.message && data.message.id) {
          seenIds[data.message.id] = true;
          lastMessageAt = data.message.created_at;
          var serverBody = data.message.body;
          if (cfg.greeting) serverBody = cfg.greeting;
          if (
            greetingNode &&
            serverBody &&
            serverBody !== localGreeting()
          ) {
            var bubble = greetingNode.querySelector(".pm-chat__bubble");
            if (bubble) bubble.textContent = serverBody;
          }
        }
        if (data.office_hours_note) {
          cfg.labels.hours = data.office_hours_note;
          var sub = headerText.querySelector(".pm-chat__subtitle");
          if (sub && !teamJoined) sub.textContent = data.office_hours_note;
        }
        showStarters();
        return sessionId;
      })
      .catch(function () {
        sessionPromise = null;
        showUnavailableNotice(function () {
          startSession();
        });
        return null;
      });
    return sessionPromise;
  }

  function sendMessageText(text, opts) {
    opts = opts || {};
    text = (text || "").trim();
    if (!text) return;
    if (!sessionId) {
      startSession().then(function () {
        if (sessionId) sendMessageText(text, opts);
      });
      return;
    }
    hideStarters();
    if (!opts.skipCollect) {
      maybeStartCollectFromVisitor(text);
    }
    var visitorWrap = appendBubble("visitor", text);
    inflightSends += 1;
    setTyping(true);

    fetch(
      apiUrl(
        "api/chat/sessions/" + encodeURIComponent(sessionId) + "/messages"
      ),
      {
        method: "POST",
        headers: headers(),
        credentials: useProxy ? "same-origin" : "omit",
        body: JSON.stringify({ body: text, stream: false }),
      }
    )
      .then(function (r) {
        return parseBody(r).then(function (data) {
          if (!r.ok) throw new Error(data.error || "Send failed");
          if (data.deferred) return;
          if (data.message && data.message.body) {
            lastMessageAt = data.message.created_at;
            if ((data.message.role || "assistant") === "assistant") {
              presentAssistant(
                data.message.body,
                data.message.id,
                data.message.author_name,
                data.choices
              );
            } else {
              appendBubble(
                data.message.role,
                data.message.body,
                data.message.id,
                data.message.author_name
              );
            }
          } else if (typeof data.message === "string") {
            presentAssistant(data.message, null, null, data.choices);
          }
          if (data.handoff) showSpeakCard();
        });
      })
      .catch(function (err) {
        if (visitorWrap) {
          visitorWrap.appendChild(el("div", "pm-chat__not-sent", "Not sent"));
          showUnavailableNotice(function () {
            if (visitorWrap.parentNode) visitorWrap.parentNode.removeChild(visitorWrap);
            sendMessageText(text, opts);
          });
        } else {
          appendBubble(
            "system",
            err.message || "Something went wrong. Please try again."
          );
        }
      })
      .finally(function () {
        inflightSends = Math.max(0, inflightSends - 1);
        if (inflightSends === 0) setTyping(false);
      });
  }

  function sendMessage() {
    var text = (input.value || "").trim();
    if (!text) return;
    input.value = "";
    sendMessageText(text);
  }

  function handoff() {
    if (!sessionId) {
      startSession().then(function () {
        if (sessionId) handoff();
      });
      return;
    }
    hideStarters();
    stopCollect();
    if (lead.parentNode) lead.parentNode.removeChild(lead);
    var payload = {
      name: nameInput.value.trim(),
      email: emailInput.value.trim(),
      company: companyInput.value.trim(),
    };
    fetch(
      apiUrl(
        "api/chat/sessions/" + encodeURIComponent(sessionId) + "/handoff"
      ),
      {
        method: "POST",
        headers: headers(),
        credentials: useProxy ? "same-origin" : "omit",
        body: JSON.stringify(payload),
      }
    )
      .then(function (r) {
        return parseBody(r).then(function (data) {
          if (!r.ok) throw new Error(data.error || "Handoff failed");
          (data.messages || []).forEach(function (m) {
            appendBubble(m.role, m.body, m.id);
            if (m.created_at) lastMessageAt = m.created_at;
          });
        });
      })
      .catch(function (err) {
        appendBubble("system", err.message || "Could not reach the team.");
      });
  }

  function submitLead(opts) {
    opts = opts || {};
    if (!sessionId) return;
    var email = emailInput.value.trim();
    if (!email) {
      if (!opts.quiet) emailInput.focus();
      return;
    }
    fetch(
      apiUrl("api/chat/sessions/" + encodeURIComponent(sessionId) + "/lead"),
      {
        method: "POST",
        headers: headers(),
        credentials: useProxy ? "same-origin" : "omit",
        body: JSON.stringify({
          name: nameInput.value.trim(),
          email: email,
          company: companyInput.value.trim(),
        }),
      }
    )
      .then(function (r) {
        return parseBody(r).then(function (data) {
          if (!r.ok) throw new Error(data.error || "Could not save details");
          if (!opts.quiet && data.message) {
            appendBubble("assistant", data.message.body, data.message.id);
          }
          if (lead.parentNode) lead.parentNode.removeChild(lead);
        });
      })
      .catch(function (err) {
        if (!opts.quiet) {
          appendBubble("system", err.message || "Could not save details.");
        }
      });
  }

  function closeSessionOnHub() {
    if (!sessionId) return Promise.resolve();
    return fetch(
      apiUrl("api/chat/sessions/" + encodeURIComponent(sessionId) + "/close"),
      {
        method: "POST",
        headers: headers(),
        credentials: useProxy ? "same-origin" : "omit",
        body: "{}",
      }
    ).catch(function () {});
  }

  document.addEventListener("keydown", function (e) {
    if (!open || e.key !== "Escape") return;
    var sheet = panel.querySelector(".pm-chat__scrim");
    if (sheet) {
      sheet.remove();
      return;
    }
    setOpen(false);
  });

  launcher.addEventListener("click", function () {
    setOpen(true);
  });
  // Minimise: hide panel, keep conversation for later.
  minimizeBtn.addEventListener("click", function () {
    setOpen(false);
  });
  function resetChatUi() {
    rememberSession(null);
    lastMessageAt = null;
    seenIds = {};
    startersShown = false;
    suppressCollectTrigger = false;
    transcriptLines = [];
    stopCollect();
    hideStarters();
    ensureComposerVisible();
    if (lead.parentNode) lead.parentNode.removeChild(lead);
    clearNode(messagesEl);
    messagesEl.appendChild(typingEl);
  }

  closeBtn.addEventListener("click", function () {
    if (!sessionId) {
      setOpen(false);
      return;
    }
    showCloseSheet();
  });
  function showCloseSheet() {
    var existing = panel.querySelector(".pm-chat__scrim");
    if (existing) return;
    var scrim = el("div", "pm-chat__scrim");
    var sheet = el("div", "pm-chat__sheet");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "End this chat?");
    sheet.appendChild(el("h2", "pm-chat__sheet-title", "End this chat?"));
    sheet.appendChild(
      el(
        "p",
        "pm-chat__sheet-body",
        "The team still has your details and will reply by email. You can keep a copy of the conversation first."
      )
    );
    var download = el("button", "pm-chat__btn-secondary", "Download transcript");
    download.type = "button";
    download.addEventListener("click", function () {
      downloadTranscriptFile();
    });
    var row = el("div", "pm-chat__sheet-row");
    var keep = el("button", "pm-chat__btn-mist", "Keep chatting");
    keep.type = "button";
    keep.addEventListener("click", function () {
      scrim.remove();
    });
    var end = el("button", "pm-chat__btn-navy", "End chat");
    end.type = "button";
    end.addEventListener("click", function () {
      scrim.remove();
      closeSessionOnHub().finally(function () {
        resetChatUi();
        setOpen(false);
      });
    });
    row.appendChild(keep);
    row.appendChild(end);
    sheet.appendChild(download);
    sheet.appendChild(row);
    scrim.appendChild(sheet);
    scrim.addEventListener("click", function (e) {
      if (e.target === scrim) scrim.remove();
    });
    panel.appendChild(scrim);
    keep.focus();
  }
  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });
  speakBtn.addEventListener("click", showSpeakCard);
  leadSend.addEventListener("click", function () {
    if (!emailInput.value.trim()) {
      emailInput.focus();
      return;
    }
    handoff();
  });
})();
