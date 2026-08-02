// ProberX CMS Admin — Vanilla JS SPA
const API = "/api/v1";
let token = localStorage.getItem("cms_token");
let currentUser = null;

// ---- Utility ----
function $el(tag, attrs = {}, ...children) {
  const el = Object.assign(document.createElement(tag), attrs);
  if (typeof attrs.className === "string") el.className = attrs.className;
  children.forEach(c => el.append(typeof c === "string" ? document.createTextNode(c) : c));
  return el;
}
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function toast(msg, type = "success") {
  const t = $el("div", { className: `toast ${type}`, innerText: msg });
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}
async function api(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { logout(); throw new Error("Session expired"); }
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

// ---- Auth ----
function logout() {
  localStorage.removeItem("cms_token");
  token = null;
  currentUser = null;
  location.hash = "#/login";
}
async function checkAuth() {
  if (!token) return false;
  try {
    currentUser = await api("GET", "/auth/me");
    return true;
  } catch { token = null; localStorage.removeItem("cms_token"); return false; }
}

// ---- Router ----
async function router() {
  const hash = location.hash || "#/login";
  const app = document.getElementById("app");

  if (hash === "#/logout") { logout(); return; }

  if (hash === "#/login") {
    if (token && await checkAuth()) { location.hash = "#/sections"; return; }
    app.innerHTML = "";
    app.append(renderLogin());
    return;
  }

  // All other routes need auth
  if (!await checkAuth()) { location.hash = "#/login"; return; }

  if (hash === "#/sections") {
    try {
      const { sections } = await api("GET", "/sections/admin");
      app.innerHTML = "";
      app.append(renderSections(sections));
    } catch (e) { app.innerHTML = `<div class="center-screen"><p style="color:var(--red)">${esc(e.message)}</p></div>`; }
    return;
  }

  const editMatch = hash.match(/^#\/sections\/(.+)$/);
  if (editMatch) {
    try {
      const key = editMatch[1];
      const section = await api("GET", `/sections/${key}`);
      app.innerHTML = "";
      app.append(renderEditor(section));
    } catch (e) { app.innerHTML = `<div class="center-screen"><p style="color:var(--red)">${esc(e.message)}</p></div>`; }
    return;
  }

  app.innerHTML = `<div class="center-screen"><p style="color:var(--text-muted)">Page not found: ${esc(hash)}</p></div>`;
}

// ---- Login Page ----
function renderLogin() {
  const card = $el("div", { className: "center-screen" });
  const inner = $el("div", { className: "login-card" },
    $el("h1", {}, "ProberX CMS"),
    $el("p", { className: "subtitle" }, "Website Content Manager"),
    $el("div", { className: "form-group" },
      $el("label", {}, "Username"),
      $el("input", { id: "login-username", type: "text", placeholder: "admin" })
    ),
    $el("div", { className: "form-group" },
      $el("label", {}, "Password"),
      $el("input", { id: "login-password", type: "password", placeholder: "••••••" })
    ),
    $el("button", { className: "btn btn-primary", onclick: handleLogin, innerText: "Sign In" }),
  );

  // Enter key to submit
  setTimeout(() => {
    document.getElementById("login-password")?.addEventListener("keydown", e => { if (e.key === "Enter") handleLogin(); });
  }, 100);

  card.append(inner);
  return card;
}

async function handleLogin() {
  const username = document.getElementById("login-username")?.value.trim();
  const password = document.getElementById("login-password")?.value;
  if (!username || !password) return toast("Please fill in all fields", "error");

  try {
    const res = await api("POST", "/auth/login", { username, password });
    token = res.token;
    currentUser = res.user;
    localStorage.setItem("cms_token", token);
    toast(`Welcome back, ${currentUser.username}!`);
    location.hash = "#/sections";
  } catch (e) { toast(e.message, "error"); }
}

// ---- Sections List ----
function renderSections(sections) {
  const wrapper = $el("div");
  wrapper.append(
    $el("nav", { className: "admin-nav" },
      $el("a", { href: "#/sections", className: "brand", innerText: "⚡ ProberX CMS" }),
      $el("div", { className: "user-menu" },
        $el("span", {}, currentUser?.username || ""),
        $el("a", { href: "/", target: "_blank", className: "btn btn-outline", innerText: "View Site", style: "font-size:0.8rem; padding:6px 14px;" }),
        $el("button", { className: "btn btn-outline", onclick: logout, innerText: "Logout", style: "font-size:0.8rem; padding:6px 14px;" }),
      )
    ),
    $el("main", { className: "admin-main" },
      $el("div", { className: "page-header" },
        $el("h2", {}, `Content Sections (${sections.length})`),
        $el("span", { style: "font-size:0.8rem; color:var(--text-muted)" }, "Click a section to edit")
      ),
      $el("div", { className: "sections-grid" },
        ...sections.map(s => {
          const preview = typeof s.content === "string" ? s.content.substring(0, 80) : JSON.stringify(s.content).substring(0, 80);
          return $el("div", { className: "section-card", onclick: () => { location.hash = `#/sections/${s.key}`; } },
            $el("div", { className: "key", innerText: s.key }),
            $el("div", { className: "title", innerText: s.title }),
            $el("div", { className: "updated", innerText: `Updated: ${new Date(s.updatedAt).toLocaleString()}` }),
            $el("span", { className: "arrow-icon", innerHTML: "→" }),
          );
        })
      )
    )
  );
  return wrapper;
}

// ---- Section Editor ----
function renderEditor(section) {
  const content = section.content;
  const jsonStr = JSON.stringify(content, null, 2);
  let edited = false;

  const wrapper = $el("div");
  wrapper.append(
    $el("nav", { className: "admin-nav" },
      $el("a", { href: "#/sections", className: "brand", innerText: "⚡ ProberX CMS" }),
      $el("div", { className: "user-menu" },
        $el("span", {}, currentUser?.username || ""),
        $el("button", { className: "btn btn-outline", onclick: logout, innerText: "Logout", style: "font-size:0.8rem; padding:6px 14px;" }),
      )
    ),
    $el("main", { className: "admin-main" },
      $el("a", { href: "#/sections", className: "back-link", innerHTML: "← Back to Sections" }),
      $el("div", { className: "editor-card" },
        $el("div", { className: "editor-header" },
          $el("div", {},
            $el("h2", {}, esc(section.title)),
            $el("div", { className: "section-key", innerHTML: `Key: <code>${esc(section.key)}</code>` }),
          ),
        ),
        $el("div", { className: "form-group" },
          $el("label", {}, "JSON Content"),
          $el("textarea", { id: "editor-content", className: "json-editor" }, jsonStr),
        ),
        $el("div", { className: "save-bar" },
          $el("span", { id: "save-status", className: "status" }),
          $el("button", { className: "btn btn-outline", onclick: () => { location.hash = "#/sections"; }, innerText: "Cancel" }),
          $el("button", { id: "save-btn", className: "btn btn-primary", onclick: handleSave, innerText: "💾 Save Changes", style: "width:auto;" }),
        ),
        $el("p", { style: "margin-top:16px; font-size:0.75rem; color:var(--text-muted)" },
          "Edit the JSON content above. Invalid JSON will be rejected. Changes take effect immediately on the live site.")
      )
    )
  );

  // Track edits
  setTimeout(() => {
    const ta = document.getElementById("editor-content");
    ta?.addEventListener("input", () => { edited = true; });
    // Ctrl+S to save
    ta?.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSave(); } });
  }, 100);

  async function handleSave() {
    const ta = document.getElementById("editor-content");
    const saveBtn = document.getElementById("save-btn");
    const status = document.getElementById("save-status");
    if (!ta) return;

    let parsed;
    try {
      parsed = JSON.parse(ta.value);
    } catch (e) {
      toast(`Invalid JSON: ${e.message}`, "error");
      return;
    }

    saveBtn.disabled = true;
    saveBtn.innerText = "Saving...";
    status.innerText = "";

    try {
      await api("PUT", `/sections/${section.key}`, { content: parsed });
      toast("Saved successfully!");
      status.innerText = "✓ Saved at " + new Date().toLocaleTimeString();
      status.style.color = "var(--green)";
      edited = false;
    } catch (e) {
      toast(e.message, "error");
      status.innerText = "✗ Error: " + e.message;
      status.style.color = "var(--red)";
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerText = "💾 Save Changes";
    }
  }

  return wrapper;
}

// ---- Init ----
window.addEventListener("hashchange", router);
window.addEventListener("load", router);
