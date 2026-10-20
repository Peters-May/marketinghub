(function () {
  "use strict";

  var cfg = window.PMWebsiteChat;
  if (!cfg || !cfg.hubUrl || !cfg.siteKey) return;

  var sessionId = null;
  var lastMessageAt = null;
  var seenIds = {};
  var pollTimer = null;
  var open = false;

  function headers() {
    return {
      "Content-Type": "application/json",
      "X-Chat-Site-Key": cfg.siteKey,
    };
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function appendBubble(role, body, id) {
    if (id && seenIds[id]) return;
    if (id) seenIds[id] = true;
    var bubble = el("div", "pm-chat__bubble pm-chat__bubble--" + role, body);
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setTyping(on) {
    typingEl.classList.toggle("is-on", !!on);
    if (on) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  var root = el("div", "pm-chat--" + (cfg.position === "bottom-left" ? "bl" : "br"));
  root.id = "pm-website-chat-root";

  var panel = el("div", "pm-chat__panel");
  var header = el("div", "pm-chat__header");
  header.appendChild(el("div", "pm-chat__mark"));
  var headerText = el("div", "pm-chat__header-text");
  headerText.appendChild(el("p", "pm-chat__title", cfg.labels.title));
  headerText.appendChild(el("p", "pm-chat__subtitle", cfg.labels.subtitle));
  header.appendChild(headerText);
  var closeBtn = el("button", "pm-chat__icon-btn", "×");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", cfg.labels.close);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  var actions = el("div", "pm-chat__actions");
  var speakBtn = el("button", "", cfg.labels.speak);
  speakBtn.type = "button";
  actions.appendChild(speakBtn);
  panel.appendChild(actions);

  var messagesEl = el("div", "pm-chat__messages");
  var typingEl = el("div", "pm-chat__bubble pm-chat__bubble--assistant pm-chat__typing", "…");
  messagesEl.appendChild(typingEl);
  panel.appendChild(messagesEl);

  var lead = el("div", "pm-chat__lead");
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
  lead.appendChild(nameInput);
  lead.appendChild(emailInput);
  lead.appendChild(companyInput);
  lead.appendChild(leadSend);
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

  var launcher = el("button", "pm-chat__launcher", cfg.labels.open);
  launcher.type = "button";

  root.appendChild(panel);
  root.appendChild(launcher);
  document.body.appendChild(root);

  function setOpen(next) {
    open = next;
    root.classList.toggle("pm-chat--open", open);
    if (open && !sessionId) {
      startSession();
    }
    if (open) {
      startPoll();
      input.focus();
    } else {
      stopPoll();
    }
  }

  function syncSeen() {
    if (!sessionId) return Promise.resolve();
    return fetch(
      cfg.hubUrl +
        "/api/chat/sessions/" +
        encodeURIComponent(sessionId) +
        "/messages",
      { headers: headers() }
    )
      .then(function (r) {
        return r.json();
      })
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
      fetch(
        cfg.hubUrl +
          "/api/chat/sessions/" +
          encodeURIComponent(sessionId) +
          "/messages" +
          (lastMessageAt
            ? "?after=" + encodeURIComponent(lastMessageAt)
            : ""),
        { headers: headers() }
      )
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (!data.messages) return;
          data.messages.forEach(function (m) {
            if (m.role === "visitor") return;
            if (m.role === "staff" || m.role === "system") {
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

  function startSession() {
    setTyping(true);
    fetch(cfg.hubUrl + "/api/chat/sessions", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        page_url: cfg.pageUrl,
        page_title: cfg.pageTitle,
        referrer: cfg.referrer,
        utm: cfg.utm || {},
      }),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.error || "Could not start chat");
          return data;
        });
      })
      .then(function (data) {
        sessionId = data.session && data.session.id;
        if (data.message) {
          var body = data.message.body;
          if (cfg.greeting) body = cfg.greeting;
          appendBubble("assistant", body, data.message.id);
          lastMessageAt = data.message.created_at;
        }
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

  function sendMessage() {
    var text = (input.value || "").trim();
    if (!text || !sessionId) return;
    input.value = "";
    appendBubble("visitor", text);
    setTyping(true);
    sendBtn.disabled = true;

    fetch(
      cfg.hubUrl +
        "/api/chat/sessions/" +
        encodeURIComponent(sessionId) +
        "/messages",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ body: text, stream: true }),
      }
    )
      .then(function (r) {
        var ctype = r.headers.get("content-type") || "";
        if (ctype.indexOf("application/json") !== -1) {
          return r.json().then(function (data) {
            if (!r.ok) throw new Error(data.error || "Send failed");
            if (data.message && data.message.body) {
              appendBubble(
                "assistant",
                data.message.body,
                data.message.id
              );
              lastMessageAt = data.message.created_at;
            } else if (data.message && typeof data.message === "string") {
              appendBubble("assistant", data.message);
            }
            if (data.handoff) lead.classList.add("is-on");
          });
        }
        if (!r.ok) {
          return r.text().then(function (t) {
            throw new Error(t || "Send failed");
          });
        }
        var reader = r.body && r.body.getReader && r.body.getReader();
        if (!reader) {
          return r.text().then(function (t) {
            appendBubble("assistant", t);
          });
        }
        var decoder = new TextDecoder();
        var bubble = el("div", "pm-chat__bubble pm-chat__bubble--assistant", "");
        messagesEl.insertBefore(bubble, typingEl);
        setTyping(false);
        function read() {
          return reader.read().then(function (result) {
            if (result.done) {
              if (r.headers.get("X-Chat-Handoff") === "1") {
                lead.classList.add("is-on");
              }
              return syncSeen();
            }
            bubble.textContent += decoder.decode(result.value, { stream: true });
            messagesEl.scrollTop = messagesEl.scrollHeight;
            return read();
          });
        }
        return read();
      })
      .catch(function (err) {
        appendBubble(
          "system",
          err.message || "Something went wrong. Please try again."
        );
      })
      .finally(function () {
        setTyping(false);
        sendBtn.disabled = false;
      });
  }

  function handoff() {
    if (!sessionId) return;
    lead.classList.add("is-on");
    var payload = {
      name: nameInput.value.trim(),
      email: emailInput.value.trim(),
      company: companyInput.value.trim(),
    };
    fetch(
      cfg.hubUrl +
        "/api/chat/sessions/" +
        encodeURIComponent(sessionId) +
        "/handoff",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(payload),
      }
    )
      .then(function (r) {
        return r.json().then(function (data) {
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
      cfg.hubUrl +
        "/api/chat/sessions/" +
        encodeURIComponent(sessionId) +
        "/lead",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: nameInput.value.trim(),
          email: email,
          company: companyInput.value.trim(),
        }),
      }
    )
      .then(function (r) {
        return r.json().then(function (data) {
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
  closeBtn.addEventListener("click", function () {
    setOpen(false);
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
