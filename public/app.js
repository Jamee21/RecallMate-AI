(() => {
  const chat = document.getElementById("chat");
  const form = document.getElementById("form");
  const input = document.getElementById("input");
  const send = document.getElementById("send");
  const suggestions = document.getElementById("suggestions");

  // Each browser gets its own session, so notes stay separate between visitors
  function getSessionId() {
    let id = null;
    try { id = localStorage.getItem("sessionId"); } catch {}
    if (!id) {
      id = crypto.randomUUID();
      try { localStorage.setItem("sessionId", id); } catch {}
    }
    return id;
  }
  const sessionId = getSessionId();

  function addMessage(role, text) {
    const el = document.createElement("div");
    el.className = `msg ${role}`;
    el.textContent = text; // textContent (never innerHTML) prevents XSS
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return el;
  }

  function addTyping() {
    const el = document.createElement("div");
    el.className = "msg model";
    el.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return el;
  }

  async function sendMessage(text) {
    const message = text.trim();
    if (!message) return;

    suggestions.hidden = true;
    addMessage("user", message);
    input.value = "";
    send.disabled = true;
    const typing = addTyping();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message }),
      });
      const data = await res.json().catch(() => ({}));
      typing.remove();
      if (res.ok) addMessage("model", data.reply);
      else addMessage("error", data.error || "Something went wrong.");
    } catch {
      typing.remove();
      addMessage("error", "Could not reach the server.");
    } finally {
      send.disabled = false;
      input.focus();
    }
  }

  async function loadHistory() {
    try {
      const res = await fetch(`/api/history?sessionId=${encodeURIComponent(sessionId)}`);
      const { turns = [] } = await res.json();
      if (turns.length === 0) {
        addMessage("model", "Assalam o Alaikum! Main aap ki notes save aur yaad rakh sakta hoon. Kuch likh kar try karein.");
        return;
      }
      suggestions.hidden = true;
      for (const t of turns) addMessage(t.role, t.text);
    } catch {
      addMessage("model", "Assalam o Alaikum! Kuch likh kar try karein.");
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage(input.value);
  });

  suggestions.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) sendMessage(chip.dataset.text);
  });

  loadHistory();
  input.focus();
})();