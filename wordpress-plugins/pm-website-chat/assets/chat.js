(function () {
  "use strict";

  var cfg = window.PMWebsiteChat;
  if (!cfg) return;
  // Prefer same-origin WP proxy (avoids CORS on staging). Fall back to Hub direct.
  var useProxy = Boolean(cfg.apiBase);
  if (!useProxy && (!cfg.hubUrl || !cfg.siteKey)) return;

  var sessionId = null;
  var lastMessageAt = null;
  var seenIds = {};
  var pollTimer = null;
  var open = false;
  var inflightSends = 0;
  var startersShown = false;
  var collectState = null;
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
      key: "yacht_location",
      label: "Where is the yacht now? (country or port)",
      placeholder: "e.g. Southampton, UK",
    },
    {
      key: "visitor_location",
      label: "Where are you based? (optional)",
      placeholder: "e.g. London",
      optional: true,
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
      key: "specs",
      label: "Drawings or specifications (optional — paste notes here)",
      optional: true,
    },
  ];

  var FREIGHT_FIELDS = [
    { key: "name", label: "Your name" },
    { key: "email", label: "Business email", type: "email" },
    { key: "company", label: "Company", optional: true },
    { key: "commodity", label: "What are you shipping?" },
    { key: "origin", label: "Origin" },
    { key: "destination", label: "Destination" },
    { key: "pieces", label: "Pieces / pallets / containers", optional: true },
    { key: "dimensions", label: "Dimensions", optional: true },
    { key: "weight", label: "Weight", optional: true },
    { key: "timeframe", label: "Preferred timeframe", optional: true },
  ];

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
        "Your P&M friendly assistant"
      );
    }
    if (role === "staff") {
      var name = (authorName || "").trim();
      return name || "Team";
    }
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
    return wrap;
  }

  function setTyping(on) {
    typingEl.classList.toggle("is-on", !!on);
    messagesEl.appendChild(typingEl);
    if (on) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
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
  var speakBtn = el("button", "", cfg.labels.speak);
  speakBtn.type = "button";
  actions.appendChild(speakBtn);
  panel.appendChild(actions);

  var messagesEl = el("div", "pm-chat__messages");
  var typingEl = el(
    "div",
    "pm-chat__bubble pm-chat__bubble--assistant pm-chat__typing",
    "…"
  );
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
  leadBody.appendChild(nameInput);
  leadBody.appendChild(emailInput);
  leadBody.appendChild(companyInput);
  leadBody.appendChild(leadSend);
  lead.appendChild(leadBar);
  lead.appendChild(leadBody);
  panel.appendChild(lead);

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
  launcher.setAttribute(
    "aria-label",
    (cfg.labels && cfg.labels.open) || "Open chat"
  );
  // Modern circular chat icon (no text label).
  launcher.innerHTML =
    '<svg class="pm-chat__launcher-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M21 12a8.5 8.5 0 0 1-8.5 8.5c-1.4 0-2.7-.3-3.9-.9L3 21l1.5-4.4A8.4 8.4 0 0 1 3.5 12 8.5 8.5 0 1 1 21 12Z"/>' +
    '<path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>' +
    "</svg>";

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
      input.focus();
    } else {
      stopPoll();
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

    function addChip(label, onClick) {
      var btn = el("button", "pm-chat__chip", label);
      btn.type = "button";
      btn.addEventListener("click", function () {
        hideStarters();
        onClick();
      });
      startersEl.appendChild(btn);
    }

    addChip("Get a quote", function () {
      showQuoteTypeStarters();
    });
    addChip("Ask a question", function () {
      input.focus();
    });
    addChip("Something else", function () {
      input.focus();
    });
  }

  function showWhatElseChip() {
    if (collectState) return;
    clearNode(startersEl);
    startersEl.classList.add("is-on");
    var btn = el("button", "pm-chat__chip", "What else can I help with?");
    btn.type = "button";
    btn.addEventListener("click", function () {
      hideStarters();
      showStartersFresh();
    });
    startersEl.appendChild(btn);
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
      startCollect("yacht");
    });
    addChip("Freight / cargo", function () {
      startCollect("freight");
    });
    addChip("Other quote", function () {
      sendMessageText("I would like a quote");
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
      startCollect(kind || "yacht");
    });
    startersEl.appendChild(btn);

    var paste = el("button", "pm-chat__chip", "Paste all details");
    paste.type = "button";
    paste.addEventListener("click", function () {
      hideStarters();
      startCollect(kind || "yacht", { pasteFirst: true });
    });
    startersEl.appendChild(paste);
  }

  function stopCollect() {
    collectState = null;
    collectEl.classList.remove("is-on");
    clearNode(collectEl);
    composer.classList.remove("is-hidden");
  }

  function startCollect(kind, opts) {
    opts = opts || {};
    var fields = kind === "freight" ? FREIGHT_FIELDS : YACHT_FIELDS;
    collectState = {
      kind: kind,
      fields: fields,
      index: 0,
      values: {},
      pasteMode: !!opts.pasteFirst,
    };
    composer.classList.add("is-hidden");
    hideStarters();

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
      var ta = el("textarea", "pm-chat__collect-input");
      ta.rows = 5;
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

    var field = collectState.fields[collectState.index];
    var total = collectState.fields.length;
    var step = collectState.index + 1;
    collectEl.appendChild(
      el("p", "pm-chat__collect-progress", "Step " + step + " of " + total)
    );
    collectEl.appendChild(el("p", "pm-chat__collect-label", field.label));

    var inputEl =
      field.key === "specs"
        ? el("textarea", "pm-chat__collect-input")
        : el("input", "pm-chat__collect-input");
    if (inputEl.tagName === "INPUT") {
      inputEl.type = field.type || "text";
    } else {
      inputEl.rows = 3;
    }
    inputEl.placeholder =
      field.placeholder || (field.optional ? "Optional" : "");
    collectEl.appendChild(inputEl);

    var row = el("div", "pm-chat__collect-row");
    var next = el(
      "button",
      "pm-chat__collect-primary",
      collectState.index === total - 1 ? "Send to team" : "Continue"
    );
    next.type = "button";
    next.addEventListener("click", function () {
      advanceCollect(inputEl);
    });
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && inputEl.tagName === "INPUT") {
        e.preventDefault();
        advanceCollect(inputEl);
      }
    });

    var pasteBtn = el(
      "button",
      "pm-chat__collect-secondary",
      "Paste all instead"
    );
    pasteBtn.type = "button";
    pasteBtn.addEventListener("click", function () {
      collectState.pasteMode = true;
      renderCollectStep();
    });

    var skip = null;
    if (field.optional) {
      skip = el("button", "pm-chat__collect-secondary", "Skip");
      skip.type = "button";
      skip.addEventListener("click", function () {
        collectState.values[field.key] = "";
        collectState.index += 1;
        if (collectState.index >= collectState.fields.length) {
          finishCollectFromFields();
        } else {
          renderCollectStep();
        }
      });
    }

    row.appendChild(next);
    row.appendChild(pasteBtn);
    if (skip) row.appendChild(skip);
    collectEl.appendChild(row);
    inputEl.focus();
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
    // Echo short confirmation in thread for clarity.
    if (value) {
      appendBubble("visitor", field.label + ": " + value);
    }
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

  function finishCollectFromFields() {
    if (!collectState) return;
    var kind = collectState.kind;
    var values = collectState.values;
    var summary = formatCollectValues(kind, values);
    if (values.email) emailInput.value = values.email;
    if (values.name) nameInput.value = values.name;
    if (values.company) companyInput.value = values.company;
    stopCollect();
    sendMessageText(summary);
  }

  function finishCollectFromPaste(text) {
    var kind = collectState && collectState.kind;
    stopCollect();
    sendMessageText(
      (kind === "freight"
        ? "Freight / cargo enquiry (pasted details):\n"
        : "Yacht transport enquiry (pasted details):\n") + text
    );
  }

  function maybeOfferGuidedFromAssistant(body) {
    if (collectState) return;
    if (looksLikeYachtChecklist(body)) {
      offerGuidedCollect("yacht");
      return;
    }
    showWhatElseChip();
  }

  function maybeStartCollectFromVisitor(text) {
    if (collectState) return;
    var kind = detectQuoteKindFromText(text);
    if (!kind) return;
    // Free-typed quote intent → start guided fields after a short beat.
    setTimeout(function () {
      if (collectState) return;
      startCollect(kind);
    }, 400);
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
    pollTimer = setInterval(function () {
      if (!sessionId) return;
      var path =
        "api/chat/sessions/" +
        encodeURIComponent(sessionId) +
        "/messages" +
        (lastMessageAt ? "?after=" + encodeURIComponent(lastMessageAt) : "");
      fetch(apiUrl(path), {
        headers: headers(),
        credentials: useProxy ? "same-origin" : "omit",
      })
        .then(parseBody)
        .then(function (data) {
          if (!data.messages) return;
          data.messages.forEach(function (m) {
            if (m.role === "visitor") return;
            if (m.role === "staff" || m.role === "system") {
              appendBubble(m.role, m.body, m.id, m.author_name);
            } else if (m.role === "assistant") {
              appendBubble(m.role, m.body, m.id);
            } else if (m.id) {
              seenIds[m.id] = true;
            }
            if (m.created_at) lastMessageAt = m.created_at;
          });
        })
        .catch(function () {});
    }, 5000);
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
        clearNode(messagesEl);
        messagesEl.appendChild(typingEl);
        seenIds = {};
        lastMessageAt = null;
        (data.messages || []).forEach(function (m) {
          if (m.role === "visitor") {
            appendBubble("visitor", m.body, m.id);
          } else {
            appendBubble(m.role, m.body, m.id, m.author_name);
          }
          if (m.created_at) lastMessageAt = m.created_at;
        });
        startersShown = true;
        hideStarters();
      })
      .catch(function () {
        rememberSession(null);
        startSession();
      })
      .finally(function () {
        setTyping(false);
      });
  }

  function startSession() {
    setTyping(true);
    fetch(apiUrl("api/chat/sessions"), {
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
        if (data.message) {
          var body = data.message.body;
          if (cfg.greeting) body = cfg.greeting;
          appendBubble("assistant", body, data.message.id);
          lastMessageAt = data.message.created_at;
        }
        showStarters();
      })
      .catch(function (err) {
        appendBubble(
          "system",
          err.message || "Chat is temporarily unavailable."
        );
      })
      .finally(function () {
        setTyping(false);
      });
  }

  function sendMessageText(text) {
    text = (text || "").trim();
    if (!text || !sessionId) return;
    hideStarters();
    maybeStartCollectFromVisitor(text);
    appendBubble("visitor", text);
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
            appendBubble(
              data.message.role || "assistant",
              data.message.body,
              data.message.id,
              data.message.author_name
            );
            lastMessageAt = data.message.created_at;
            if ((data.message.role || "assistant") === "assistant") {
              maybeOfferGuidedFromAssistant(data.message.body);
            }
          } else if (typeof data.message === "string") {
            appendBubble("assistant", data.message);
            maybeOfferGuidedFromAssistant(data.message);
          }
          if (data.handoff) lead.classList.add("is-on");
        });
      })
      .catch(function (err) {
        appendBubble(
          "system",
          err.message || "Something went wrong. Please try again."
        );
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
    if (!sessionId) return;
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

  function submitLead() {
    if (!sessionId) return;
    var email = emailInput.value.trim();
    if (!email) {
      emailInput.focus();
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
          if (data.message) {
            appendBubble("assistant", data.message.body, data.message.id);
          }
          lead.classList.remove("is-on");
        });
      })
      .catch(function (err) {
        appendBubble("system", err.message || "Could not save details.");
      });
  }

  launcher.addEventListener("click", function () {
    setOpen(true);
  });
  // Minimise: hide panel, keep conversation for later.
  minimizeBtn.addEventListener("click", function () {
    setOpen(false);
  });
  closeBtn.addEventListener("click", function () {
    if (sessionId) {
      var ok = window.confirm(
        cfg.labels.closeConfirm ||
          "Would you like to close the chat?\n\nThis ends the chat."
      );
      if (!ok) return;
      rememberSession(null);
      lastMessageAt = null;
      seenIds = {};
      startersShown = false;
      stopCollect();
      hideStarters();
      lead.classList.remove("is-on", "is-collapsed");
      leadMinBtn.textContent = "Minimise";
      clearNode(messagesEl);
      messagesEl.appendChild(typingEl);
    }
    setOpen(false);
  });
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
