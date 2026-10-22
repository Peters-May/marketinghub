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

  function appendBubble(role, body, id, authorName) {
    if (id && seenIds[id]) return;
    if (id) seenIds[id] = true;
    var wrap = el("div", "pm-chat__msg pm-chat__msg--" + role);
    var label = senderLabel(role, authorName);
    if (label) {
      wrap.appendChild(el("div", "pm-chat__sender", label));
    }
    var bubble = el("div", "pm-chat__bubble pm-chat__bubble--" + role, body);
    wrap.appendChild(bubble);
    messagesEl.insertBefore(wrap, typingEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    var who = label || (role === "visitor" ? "You" : role);
    var text = String(body || "").trim();
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
    if (footer.parentNode === panel) panel.appendChild(footer);
    if (composer.parentNode === panel) panel.appendChild(composer);
  }

  function noteTeamJoined(authorName) {
    if (teamJoined) return;
    teamJoined = true;
    hideStarters();
    var chips = messagesEl.querySelectorAll(".pm-chat__choices");
    for (var i = 0; i < chips.length; i++) chips[i].parentNode.removeChild(chips[i]);
    var who = (authorName || "").trim() || "A colleague";
    appendBubble("system", who + " from the team joined");
    var title = headerText.querySelector(".pm-chat__title");
    if (title) title.textContent = who;
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
  header.appendChild(el("div", "pm-chat__mark"));
  var headerText = el("div", "pm-chat__header-text");
  headerText.appendChild(el("p", "pm-chat__title", cfg.labels.title));
  headerText.appendChild(el("p", "pm-chat__subtitle", cfg.labels.subtitle));
  header.appendChild(headerText);
  var headerActions = el("div", "pm-chat__header-actions");
  var minimizeBtn = el("button", "pm-chat__icon-btn", "–");
  minimizeBtn.type = "button";
  minimizeBtn.setAttribute(
    "aria-label",
    (cfg.labels && cfg.labels.minimize) || "Minimise chat"
  );
  minimizeBtn.title = (cfg.labels && cfg.labels.minimize) || "Minimise";
  var closeBtn = el("button", "pm-chat__icon-btn", "×");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", cfg.labels.close);
  closeBtn.title = cfg.labels.close || "Close";
  headerActions.appendChild(minimizeBtn);
  headerActions.appendChild(closeBtn);
  header.appendChild(headerActions);
  panel.appendChild(header);

  var actions = el("div", "pm-chat__actions");
  var speakBtn = el("button", "pm-chat__speak", cfg.labels.speak);
  speakBtn.type = "button";
  actions.appendChild(speakBtn);
  panel.appendChild(actions);

  var messagesEl = el("div", "pm-chat__messages");
  messagesEl.setAttribute("aria-live", "polite");
  var typingEl = el(
    "div",
    "pm-chat__bubble pm-chat__bubble--assistant pm-chat__typing"
  );
  typingEl.setAttribute("aria-label", "Assistant is typing");
  typingEl.textContent = "…";
  messagesEl.appendChild(typingEl);
  panel.appendChild(messagesEl);

  var startersEl = el("div", "pm-chat__starters");
  panel.appendChild(startersEl);

  var collectEl = el("div", "pm-chat__collect");
  panel.appendChild(collectEl);

  var lead = el("div", "pm-chat__lead");
  var leadBar = el("div", "pm-chat__lead-bar");
  leadBar.appendChild(el("span", "pm-chat__lead-title", "Your details"));
  var leadMinBtn = el("button", "pm-chat__lead-toggle", "Minimise");
  leadMinBtn.type = "button";
  leadBar.appendChild(leadMinBtn);
  var leadBody = el("div", "pm-chat__lead-body");
  var nameInput = el("input", "");
  nameInput.type = "text";
  nameInput.placeholder = cfg.labels.name;
  var emailInput = el("input", "");
  emailInput.type = "email";
  emailInput.placeholder = cfg.labels.email;
  var companyInput = el("input", "");
  companyInput.type = "text";
  companyInput.placeholder = cfg.labels.company;
  var leadSend = el("button", "", "Send details");
  leadSend.type = "button";
  function labelledField(labelText, inputEl) {
    var wrap = el("label", "pm-chat__field");
    wrap.appendChild(el("span", "pm-chat__field-label", labelText));
    wrap.appendChild(inputEl);
    return wrap;
  }
  leadBody.appendChild(labelledField(cfg.labels.name || "Name", nameInput));
  leadBody.appendChild(
    labelledField(cfg.labels.email || "Business email", emailInput)
  );
  leadBody.appendChild(
    labelledField((cfg.labels.company || "Company") + " (optional)", companyInput)
  );
  leadSend.className = "pm-chat__collect-primary";
  leadSend.textContent = "Send to the team";
  leadBody.appendChild(leadSend);
  lead.appendChild(leadBar);
  lead.appendChild(leadBody);
  panel.appendChild(lead);

  var footer = el("div", "pm-chat__footer");
  footer.appendChild(speakBtn);
  panel.appendChild(footer);

  var composer = el("div", "pm-chat__composer");
  var input = el("input", "");
  input.type = "text";
  input.placeholder = cfg.labels.placeholder;
  var sendBtn = el("button", "", cfg.labels.send);
  sendBtn.type = "button";
  composer.appendChild(input);
  composer.appendChild(sendBtn);
  panel.appendChild(composer);

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
    startersEl.classList.remove("is-on");
    clearNode(startersEl);
  }

  function showStarters() {
    if (startersShown) return;
    startersShown = true;
    clearNode(startersEl);
    startersEl.classList.add("is-on");

    function addStarter(title, desc, onClick) {
      var btn = el("button", "pm-chat__chip pm-chat__starter");
      btn.type = "button";
      btn.appendChild(el("span", "pm-chat__starter-title", title));
      btn.appendChild(el("span", "pm-chat__starter-desc", desc));
      btn.addEventListener("click", function () {
        hideStarters();
        onClick();
      });
      startersEl.appendChild(btn);
    }

    addStarter("Get a quote", "Yacht or freight details, step by step", function () {
      showQuoteTypeStarters();
    });
    addStarter("Ask a question", "Published information, offices and sailings", function () {
      appendBubble("visitor", "Ask a question");
      appendBubble("assistant", "What would you like to know?");
      ensureComposerVisible();
      input.focus();
    });
    addStarter("Speak to the team", "Leave your details for a colleague", function () {
      handoff();
    });
  }

  function showWhatElseChip() {
    if (collectState) return;
    clearNode(startersEl);
    startersEl.classList.add("is-on");
    function addChip(label, onClick) {
      var btn = el("button", "pm-chat__chip", label);
      btn.type = "button";
      btn.addEventListener("click", function () {
        hideStarters();
        onClick();
      });
      startersEl.appendChild(btn);
    }
    addChip("What else can I help with?", function () {
      showStartersFresh();
    });
    addChip("Download transcript", function () {
      downloadTranscriptFile();
    });
    addChip("Speak to the team", function () {
      handoff();
    });
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
    startersEl.classList.add("is-on");

    function addChip(label, onClick) {
      var btn = el("button", "pm-chat__chip", label);
      btn.type = "button";
      btn.addEventListener("click", function () {
        hideStarters();
        onClick();
      });
      startersEl.appendChild(btn);
    }

    addChip("Yacht / boat transport", function () {
      startCollect("yacht", { force: true });
    });
    addChip("Freight / cargo", function () {
      startCollect("freight", { force: true });
    });
    addChip("Other quote", function () {
      startCollect("yacht", { force: true });
    });
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
  }

  function stopCollect() {
    collectState = null;
    collectEl.classList.remove("is-on");
    clearNode(collectEl);
    ensureComposerVisible();
  }

  function startCollect(kind, opts) {
    opts = opts || {};
    if (suppressCollectTrigger && !opts.force) return;
    // Explicit chip restart of a new quote.
    if (opts.force) suppressCollectTrigger = false;
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
        ? "Thank you. I can take a few details for our forwarding team — one at a time. You can also paste a full enquiry or specification if you prefer."
        : "Thank you. I can take a few yacht details for our team — one at a time. If you have a specification sheet, you can paste the details in one go instead.";
    appendBubble("assistant", intro);
    renderCollectStep();
  }

  function renderCollectStep() {
    if (!collectState) return;
    clearNode(collectEl);
    collectEl.classList.add("is-on");

    if (collectState.pasteMode) {
      collectEl.appendChild(
        el(
          "p",
          "pm-chat__collect-label",
          "Paste your details or specification notes"
        )
      );
      collectEl.appendChild(
        el(
          "p",
          "pm-chat__collect-hint",
          "A spec sheet, broker listing or email is fine. We will only ask for what is still missing."
        )
      );
      var ta = el("textarea", "pm-chat__collect-input");
      ta.rows = 8;
      ta.placeholder =
        "Paste make/model, dimensions, ports, contact details…";
      collectEl.appendChild(ta);

      var row = el("div", "pm-chat__collect-row");
      var submit = el("button", "pm-chat__collect-primary", "Send details");
      submit.type = "button";
      submit.addEventListener("click", function () {
        var text = (ta.value || "").trim();
        if (!text) {
          ta.focus();
          return;
        }
        finishCollectFromPaste(text);
      });
      var back = el("button", "pm-chat__collect-secondary", "Step by step");
      back.type = "button";
      back.addEventListener("click", function () {
        collectState.pasteMode = false;
        renderCollectStep();
      });
      row.appendChild(submit);
      row.appendChild(back);
      collectEl.appendChild(row);
      ta.focus();
      return;
    }

    var stepDef = collectState.steps[collectState.index];
    var total = collectState.steps.length;
    var step = collectState.index + 1;
    collectEl.appendChild(
      el("p", "pm-chat__collect-progress", "Step " + step + " of " + total)
    );
    collectEl.appendChild(el("p", "pm-chat__collect-label", stepDef.title));
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
      collectEl.appendChild(wrap);
      inputs.push({ field: field, input: inputEl, error: err });
    });

    var row = el("div", "pm-chat__collect-row");
    if (collectState.index > 0) {
      var backStep = el("button", "pm-chat__collect-secondary", "Back");
      backStep.type = "button";
      backStep.addEventListener("click", function () {
        inputs.forEach(function (item) {
          collectState.values[item.field.key] = (item.input.value || "").trim();
        });
        collectState.index -= 1;
        renderCollectStep();
      });
      row.appendChild(backStep);
    }
    var next = el(
      "button",
      "pm-chat__collect-primary",
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
    var pasteBtn = el("button", "pm-chat__collect-secondary", "Paste it instead");
    pasteBtn.type = "button";
    pasteBtn.addEventListener("click", function () {
      collectState.pasteMode = true;
      renderCollectStep();
    });
    row.appendChild(next);
    row.appendChild(pasteBtn);
    collectEl.appendChild(row);
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
    showWhatElseChip();
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
      "Hi — how can I help today? I can take a shipping or yacht enquiry, answer questions from our published information, or put you in touch with the team."
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
          var sub = headerText.querySelector(".pm-chat__subtitle");
          if (sub) sub.textContent = data.office_hours_note;
        }
        showStarters();
        return sessionId;
      })
      .catch(function (err) {
        sessionPromise = null;
        appendBubble(
          "system",
          err.message || "Chat is temporarily unavailable."
        );
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
          if (data.handoff) lead.classList.add("is-on");
        });
      })
      .catch(function (err) {
        if (visitorWrap) {
          var alert = el("div", "pm-chat__alert");
          alert.setAttribute("role", "alert");
          alert.appendChild(document.createTextNode("Not sent. "));
          var retry = el("button", "pm-chat__retry", "Try again");
          retry.type = "button";
          retry.addEventListener("click", function () {
            if (visitorWrap.parentNode) visitorWrap.parentNode.removeChild(visitorWrap);
            sendMessageText(text, opts);
          });
          alert.appendChild(retry);
          visitorWrap.appendChild(alert);
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
    lead.classList.add("is-on");
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
          lead.classList.remove("is-on");
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
    var sheet = panel.querySelector(".pm-chat__sheet");
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
    lead.classList.remove("is-on", "is-collapsed");
    leadMinBtn.textContent = "Minimise";
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
    var existing = panel.querySelector(".pm-chat__sheet");
    if (existing) return;
    var sheet = el("div", "pm-chat__sheet");
    sheet.appendChild(el("p", "pm-chat__collect-label", "End this chat?"));
    sheet.appendChild(
      el(
        "p",
        "pm-chat__collect-hint",
        "The team still has your details if you already sent them."
      )
    );
    var row = el("div", "pm-chat__collect-row");
    var download = el("button", "pm-chat__collect-secondary", "Download transcript");
    download.type = "button";
    download.addEventListener("click", function () {
      downloadTranscriptFile();
    });
    var keep = el("button", "pm-chat__collect-secondary", "Keep chatting");
    keep.type = "button";
    keep.addEventListener("click", function () {
      sheet.remove();
    });
    var end = el("button", "pm-chat__collect-primary", "End chat");
    end.type = "button";
    end.addEventListener("click", function () {
      sheet.remove();
      closeSessionOnHub().finally(function () {
        resetChatUi();
        setOpen(false);
      });
    });
    row.appendChild(download);
    row.appendChild(keep);
    row.appendChild(end);
    sheet.appendChild(row);
    panel.appendChild(sheet);
  }
  leadMinBtn.addEventListener("click", function () {
    var collapsed = lead.classList.toggle("is-collapsed");
    leadMinBtn.textContent = collapsed ? "Show details" : "Minimise";
  });
  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });
  speakBtn.addEventListener("click", handoff);
  leadSend.addEventListener("click", submitLead);
})();
