const $ = (selector, root = document) => root.querySelector(selector);
const loginView = $("#login-view");
const appShell = $("#app-shell");
const pageBody = $("#page-body");
const formDialog = $("#form-dialog");
const detailDialog = $("#detail-dialog");
const state = {
  user: null,
  view: "overview",
  page: 1,
  search: "",
  total: 0,
  blacklistUsersPage: 1,
  blacklistGuildsPage: 1,
  blacklistUsersSearch: "",
  blacklistGuildsSearch: "",
};

const views = {
  overview: { title: "Overview", eyebrow: "MATCH CENTRE / SYSTEM OVERVIEW", description: "A live look at what's happening across FCDex." },
  clubs: { title: "Clubs", eyebrow: "COLLECTION / CLUB CATALOGUE", description: "Create, edit and maintain the club catalogue.", resource: "clubs", columns: [["Club", "country"], ["Short name", "shortName"], ["Rarity", "rarity"], ["Health", "health"], ["Attack", "attack"], ["Enabled", "enabled"], ["Tradeable", "tradeable"]], create: true },
  specials: { title: "Specials", eyebrow: "COLLECTION / KIT VARIANTS", description: "Manage special editions and kit variants.", resource: "specials", columns: [["Special", "name"], ["Rarity", "rarity"], ["Starts", "startDate"], ["Ends", "endDate"], ["Tradeable", "tradeable"], ["Hidden", "hidden"]], create: true },
  players: { title: "Players", eyebrow: "COLLECTION / COLLECTORS", description: "Inspect player accounts, collections and coin balances.", resource: "players", columns: [["Discord ID", "discordId"], ["Coins", "money"], ["Club instances", "clubInstances"]] },
  guilds: { title: "Guilds", eyebrow: "OPERATIONS / SERVER CONFIGURATION", description: "Manage server-specific FCDex settings.", resource: "guilds", columns: [["Guild ID", "guildId"], ["Spawn channel", "spawnChannel"], ["Enabled", "enabled"], ["Silent", "silent"], ["Manual drops", "manualDropEnabled"], ["Tips", "tipsEnabled"]], create: true },
  trades: { title: "Trades", eyebrow: "OPERATIONS / TRANSFER LEDGER", description: "Inspect transfer records and their contents. Trade state changes remain in the bot's transfer flow.", resource: "trades", columns: [["Trade", "id"], ["Date", "date"], ["Player 1", "player1DiscordId"], ["Player 2", "player2DiscordId"], ["Status", "status"], ["P1 coins", "player1Money"]] },
  blacklists: { title: "Blacklists", eyebrow: "OPERATIONS / ACCESS CONTROL", description: "Add or remove blocked Discord users and guilds." },
  waves: { title: "Spawn waves", eyebrow: "OPERATIONS / SPAWN LEDGER", description: "Inspect spawn-wave records and their caught entries.", resource: "waves", columns: [["Wave key", "waveKey"], ["Guild ID", "guildId"], ["Rarity band", "rarityBand"], ["Progress", "progress"], ["Status", "status"], ["Created", "createdAt"]] },
  system: { title: "System", eyebrow: "CONTROL ROOM / CONFIGURATION", description: "Review the active bot configuration and admin-panel runtime information." },
};

const formDefinitions = {
  clubs: [
    { key: "country", label: "Club name", type: "text", required: true, max: 48 },
    { key: "shortName", label: "Short name", type: "text", nullable: true, max: 24 },
    { key: "health", label: "Health", type: "number", required: true, min: 0, step: 1 },
    { key: "attack", label: "Attack", type: "number", required: true, min: 0, step: 1 },
    { key: "rarity", label: "Rarity weight", type: "number", required: true, min: 0, step: "any" },
    { key: "emojiId", label: "Discord emoji ID", type: "bigint", required: true },
    { key: "wildCard", label: "Spawn image path", type: "text", required: true, max: 200 },
    { key: "collectionCard", label: "Collection image path", type: "text", required: true, max: 200 },
    { key: "credits", label: "Credits", type: "textarea", required: true, full: true, max: 64 },
    { key: "capacityName", label: "Ability name", type: "text", required: true, max: 64 },
    { key: "capacityDescription", label: "Ability description", type: "textarea", required: true, full: true, max: 256 },
    { key: "capacityLogic", label: "Ability logic (JSON object)", type: "json", required: true, full: true },
    { key: "catchNames", label: "Catch aliases (separate with ;)", type: "textarea", nullable: true, full: true },
    { key: "translations", label: "Translations", type: "textarea", nullable: true, full: true },
    { key: "economyId", label: "Economy ID", type: "bigint", nullable: true },
    { key: "regimeId", label: "Regime ID (required by the SQL schema)", type: "bigint", required: true },
    { key: "enabled", label: "Enabled", type: "checkbox", default: true },
    { key: "tradeable", label: "Tradeable", type: "checkbox", default: true },
  ],
  specials: [
    { key: "name", label: "Special name", type: "text", required: true },
    { key: "rarity", label: "Rarity weight", type: "number", required: true, min: 0, step: "any" },
    { key: "emoji", label: "Emoji", type: "text", nullable: true },
    { key: "catchPhrase", label: "Catch phrase", type: "textarea", nullable: true, full: true },
    { key: "background", label: "Background path", type: "text", nullable: true },
    { key: "credits", label: "Credits", type: "textarea", nullable: true, full: true },
    { key: "startDate", label: "Start date", type: "datetime-local", nullable: true },
    { key: "endDate", label: "End date", type: "datetime-local", nullable: true },
    { key: "tradeable", label: "Tradeable", type: "checkbox", default: true },
    { key: "hidden", label: "Hidden", type: "checkbox", default: false },
  ],
  guilds: [
    { key: "guildId", label: "Discord guild ID", type: "bigint", required: true, createOnly: true },
    { key: "spawnChannel", label: "Spawn channel ID (blank = any channel)", type: "bigint", nullable: true },
    { key: "enabled", label: "Spawning enabled", type: "checkbox", default: true },
    { key: "silent", label: "Silent mode", type: "checkbox", default: false },
    { key: "adminCommandSynced", label: "Admin command synced", type: "checkbox", default: false },
    { key: "manualDropEnabled", label: "Manual drops enabled", type: "checkbox", default: true },
    { key: "tipsEnabled", label: "Tips enabled", type: "checkbox", default: true },
  ],
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" })[char]);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`/admin/api${path}`, { credentials: "same-origin", ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    showLogin();
    throw new Error("Your session expired. Sign in again.");
  }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function showToast(message, kind = "success") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function showLogin(error = "") {
  appShell.hidden = true;
  loginView.hidden = false;
  const messages = {
    not_admin: "This Discord account is not on the FCDex admin allowlist.",
    oauth_not_configured: "Admin sign-in is not configured. Check the server environment variables.",
    oauth_state_invalid: "The sign-in request expired or could not be verified. Please try again.",
    oauth_failed: "Discord sign-in failed. Please try again.",
  };
  $("#login-error").textContent = messages[error] || "";
}

function showApp(user) {
  state.user = user;
  loginView.hidden = true;
  appShell.hidden = false;
  $("#user-name").textContent = user.displayName || user.username;
  const avatar = $("#user-avatar");
  if (user.avatarUrl) { avatar.src = user.avatarUrl; avatar.hidden = false; }
  else avatar.hidden = true;
  navigate(state.view);
}

function number(value) { return Number(value || 0).toLocaleString("en-US"); }
function statCard(label, value, icon, caption) {
  const renderedValue = value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? number(value) : escapeHtml(value ?? "—");
  return `<article class="stat-card"><div class="stat-top"><span>${escapeHtml(label)}</span><span class="stat-icon">${icon}</span></div><div class="stat-value">${renderedValue}</div><div class="stat-caption">${escapeHtml(caption)}</div></article>`;
}

function renderOverview(data) {
  const stats = data.stats || {};
  const trades = data.recentTrades || [];
  pageBody.innerHTML = `
    <section class="stats-grid">
      ${statCard("Clubs in catalogue", stats.clubs, "⚽", "REGISTERED CLUB RECORDS")}
      ${statCard("Players", stats.players, "♙", "PLAYER ACCOUNTS")}
      ${statCard("Club instances", stats.clubInstances, "▣", "ACTIVE COLLECTION ITEMS")}
      ${statCard("Specials", stats.specials, "✦", "KIT VARIANTS")}
      ${statCard("Guilds", stats.guilds, "▦", "CONFIGURED SERVERS")}
      ${statCard("Pending trades", stats.pendingTrades, "⇄", "AWAITING RESOLUTION")}
      ${statCard("Blacklisted users", stats.blacklistedUsers, "⊘", "USER BLOCK ENTRIES")}
      ${statCard("Blacklisted guilds", stats.blacklistedGuilds, "⌑", "SERVER BLOCK ENTRIES")}
    </section>
    <section class="overview-grid">
      <article class="panel"><div class="panel-header"><h2>Pending trade activity</h2><span>UP TO 5 LATEST</span></div><div class="panel-body">${trades.length ? trades.map((trade) => `<div class="trade-row"><div><div class="trade-party">${escapeHtml(trade.player1DiscordId)} <span class="muted">→</span> ${escapeHtml(trade.player2DiscordId)}</div><div class="trade-id">TRADE #${escapeHtml(trade.id)}</div></div><div class="trade-date">${escapeHtml(new Date(trade.date).toLocaleString())}</div><span class="status-pill">${escapeHtml(trade.status || "pending")}</span></div>`).join("") : `<div class="empty-state">No pending trades right now.</div>`}</div></article>
      <article class="panel"><div class="panel-header"><h2>Admin access</h2><span>PROTECTED</span></div><div class="panel-body"><div class="health-list"><div><div class="health-item"><span>Admin session</span><span>ACTIVE</span></div><div class="health-bar"><i></i></div></div><div><div class="health-item"><span>Discord identity</span><span>VERIFIED</span></div><div class="health-bar"><i></i></div></div><div><div class="health-item"><span>Database summary</span><span>LOADED</span></div><div class="health-bar"><i></i></div></div></div><div class="notice"><strong>Administrative actions are logged.</strong> Player balance changes, catalogue edits and blacklist updates are written to the FCDex server log.</div></div></article>
    </section>`;
}

function displayValue(value, key) {
  if (value === null || value === undefined || value === "") return '<span class="muted">—</span>';
  if (typeof value === "boolean") return `<span class="tag ${value ? "" : "off"}">${value ? "YES" : "NO"}</span>`;
  if (key.toLowerCase().includes("date")) {
    const date = new Date(value);
    return escapeHtml(Number.isNaN(date.getTime()) ? value : date.toLocaleString());
  }
  if (["id", "discordId", "guildId", "spawnChannel", "moderatorId", "player1DiscordId", "player2DiscordId"].includes(key)) return `<span class="mono">${escapeHtml(value)}</span>`;
  return escapeHtml(value);
}

function actionButtons(view, row) {
  const id = escapeHtml(view.resource === "guilds" ? row.guildId : (row.id ?? row.discordId ?? ""));
  if (view.resource === "clubs" || view.resource === "specials" || view.resource === "guilds") {
    return `<div class="row-actions"><button class="small-button" data-action="edit" data-id="${id}">Edit</button><button class="small-button danger" data-action="delete" data-id="${id}">Delete</button></div>`;
  }
  if (view.resource === "players") return `<div class="row-actions"><button class="small-button" data-action="player-detail" data-id="${escapeHtml(row.discordId)}">Inspect</button><button class="small-button" data-action="player-coins" data-id="${escapeHtml(row.discordId)}">Coins</button></div>`;
  if (view.resource === "trades" || view.resource === "waves") return `<div class="row-actions"><button class="small-button" data-action="detail" data-resource="${view.resource}" data-id="${id}">Inspect</button></div>`;
  return "";
}

function renderResource(view, result) {
  const rows = result.rows || [];
  state.total = result.total || 0;
  const isEditable = ["clubs", "specials", "guilds"].includes(view.resource);
  pageBody.innerHTML = `
    <div class="toolbar"><label class="search-box"><span>⌕</span><input id="resource-search" type="search" value="${escapeHtml(state.search)}" placeholder="Search ${escapeHtml(view.title.toLowerCase())}…" /></label><span class="results-count">${number(state.total)} RECORDS</span>${view.create ? `<button class="primary-button" data-action="create">+ New ${escapeHtml(view.title.slice(0, -1))}</button>` : ""}</div>
    <section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr>${view.columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join("")}${isEditable || view.resource === "players" || view.resource === "trades" || view.resource === "waves" ? "<th>Actions</th>" : ""}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${view.columns.map(([, key]) => `<td>${key === "rarityBand" ? `${escapeHtml(row.rarityFloor)} – ${escapeHtml(row.rarityCeiling)}` : key === "progress" ? `${escapeHtml(row.caught)}/${escapeHtml(row.size)}` : displayValue(row[key], key)}</td>`).join("")}${isEditable || view.resource === "players" || view.resource === "trades" || view.resource === "waves" ? `<td>${actionButtons(view, row)}</td>` : ""}</tr>`).join("") : `<tr><td colspan="${view.columns.length + 1}"><div class="empty-state">No records found.</div></td></tr>`}</tbody></table></div><div class="pagination"><span>PAGE ${state.page} · SHOWING ${rows.length} OF ${number(state.total)}</span><div class="page-actions"><button id="previous-page" type="button" ${state.page <= 1 ? "disabled" : ""}>Previous</button><button id="next-page" type="button" ${state.page * 25 >= state.total ? "disabled" : ""}>Next</button></div></div></section>
    <p class="footnote">${view.resource === "trades" ? "Trades are inspected here; accept/decline and escrow handling remain controlled by the bot's transfer workflow." : view.resource === "waves" ? "Spawn-wave actions are not exposed here because annul/revert can withdraw club instances and currency." : "Changes are validated by the server and recorded in the FCDex application log."}</p>`;
  $("#resource-search")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { state.search = event.currentTarget.value.trim(); state.page = 1; loadCurrentView(); }
  });
  $("#previous-page")?.addEventListener("click", () => { state.page = Math.max(1, state.page - 1); loadCurrentView(); });
  $("#next-page")?.addEventListener("click", () => { state.page += 1; loadCurrentView(); });
}

function renderBlacklistTable(title, kind, rows, total, page) {
  return `<section class="panel blacklist-panel"><div class="panel-header"><h2>${escapeHtml(title)}</h2><span>${number(total)} ENTRIES</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Discord ID</th><th>Reason</th><th>Date</th><th>Moderator</th><th>Action</th></tr></thead><tbody>${rows.length ? rows.map((row) => `<tr><td><span class="mono">${escapeHtml(row.discordId)}</span></td><td>${escapeHtml(row.reason || "—")}</td><td>${displayValue(row.date, "date")}</td><td>${displayValue(row.moderatorId, "moderatorId")}</td><td><button class="small-button danger" data-action="unblacklist" data-kind="${kind}" data-id="${escapeHtml(row.id)}">Remove</button></td></tr>`).join("") : `<tr><td colspan="5"><div class="empty-state">No ${kind === "user" ? "user" : "guild"} blacklist entries.</div></td></tr>`}</tbody></table></div><div class="pagination"><span>PAGE ${page}</span><div class="page-actions"><button data-page-kind="${kind}" data-page-dir="-1" ${page <= 1 ? "disabled" : ""}>Previous</button><button data-page-kind="${kind}" data-page-dir="1" ${page * 25 >= total ? "disabled" : ""}>Next</button></div></div></section>`;
}

async function renderBlacklists() {
  const [users, guilds] = await Promise.all([
    api(`/manage/blacklisted-users?page=${state.blacklistUsersPage}&q=${encodeURIComponent(state.blacklistUsersSearch)}`),
    api(`/manage/blacklisted-guilds?page=${state.blacklistGuildsPage}&q=${encodeURIComponent(state.blacklistGuildsSearch)}`),
  ]);
  pageBody.innerHTML = `<div class="toolbar"><p class="muted">Blocked Discord accounts and servers. Adding or removing a record takes effect immediately.</p><button class="primary-button" data-action="blacklist-add">+ Add blacklist entry</button></div><label class="search-box blacklist-search"><span>⌕</span><input id="user-blacklist-search" type="search" value="${escapeHtml(state.blacklistUsersSearch)}" placeholder="Search user Discord ID…" /></label>${renderBlacklistTable("Blacklisted users", "user", users.rows || [], users.total, state.blacklistUsersPage)}<label class="search-box blacklist-search"><span>⌕</span><input id="guild-blacklist-search" type="search" value="${escapeHtml(state.blacklistGuildsSearch)}" placeholder="Search guild Discord ID…" /></label>${renderBlacklistTable("Blacklisted guilds", "guild", guilds.rows || [], guilds.total, state.blacklistGuildsPage)}`;
  $("#user-blacklist-search").addEventListener("keydown", (event) => { if (event.key === "Enter") { state.blacklistUsersSearch = event.currentTarget.value.trim(); state.blacklistUsersPage = 1; renderBlacklists(); } });
  $("#guild-blacklist-search").addEventListener("keydown", (event) => { if (event.key === "Enter") { state.blacklistGuildsSearch = event.currentTarget.value.trim(); state.blacklistGuildsPage = 1; renderBlacklists(); } });
}

function fieldInput(field, value, creating) {
  if (field.createOnly && !creating) return "";
  const current = value === undefined || value === null ? (field.default ?? "") : value;
  const required = field.required ? "required" : "";
  const full = field.full ? "field-full" : "";
  if (field.type === "checkbox") return `<label class="form-check ${full}"><input type="checkbox" data-field="${field.key}" ${current ? "checked" : ""}><span>${escapeHtml(field.label)}</span></label>`;
  if (field.type === "textarea" || field.type === "json") {
    const text = field.type === "json" ? JSON.stringify(current || {}, null, 2) : String(current ?? "");
    return `<label class="form-field ${full}"><span>${escapeHtml(field.label)}</span><textarea data-field="${field.key}" ${required} rows="${field.type === "json" ? 6 : 3}" ${field.type === "json" ? 'data-type="json"' : ""}>${escapeHtml(text)}</textarea></label>`;
  }
  let display = current;
  if (field.type === "datetime-local" && current) {
    const date = new Date(current);
    display = Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  return `<label class="form-field ${full}"><span>${escapeHtml(field.label)}</span><input data-field="${field.key}" type="${field.type === "bigint" ? "text" : field.type}" value="${escapeHtml(display)}" ${required} ${field.min !== undefined ? `min="${field.min}"` : ""} ${field.max !== undefined ? `max="${field.max}" maxlength="${field.max}"` : ""} ${field.step ? `step="${field.step}"` : ""} ${field.type === "bigint" ? 'inputmode="numeric"' : ""} ${field.nullable ? 'data-nullable="true"' : ""}></label>`;
}

function openForm(resource, row = null) {
  const creating = !row;
  const defs = formDefinitions[resource];
  if (!defs) return;
  const title = `${creating ? "Create" : "Edit"} ${resource === "clubs" ? "club" : resource === "specials" ? "special" : "guild configuration"}`;
 $("#form-title").textContent = title;
  $("#form-description").textContent = resource === "clubs" ? "Update the exact fields used by the FCDex Ball model." : resource === "specials" ? "Update the exact fields used by the Special model." : "Update the existing per-guild configuration.";
  $("#form-fields").innerHTML = defs.map((field) => fieldInput(field, row?.[field.key], creating)).filter(Boolean).join("");
  $("#record-form").dataset.resource = resource;
  $("#record-form").dataset.id = row ? (resource === "guilds" ? row.guildId : row.id) : "";
  formDialog.showModal();
}

function getFormBody(form) {
  const body = {};
  for (const element of form.querySelectorAll("[data-field]")) {
    const key = element.dataset.field;
    if (element.type === "checkbox") { body[key] = element.checked; continue; }
    const value = element.value.trim();
    if (element.dataset.type === "json") {
      try { body[key] = JSON.parse(value || "{}"); }
      catch { throw new Error(`${key} must contain valid JSON.`); }
      continue;
    }
    if (!value && element.dataset.nullable === "true") { body[key] = null; continue; }
    if (element.type === "number") { body[key] = value === "" ? "" : Number(value); continue; }
    if (element.type === "datetime-local") { body[key] = value ? new Date(value).toISOString() : null; continue; }
    body[key] = value;
  }
  return body;
}

function openBlacklistForm(kind = "user", discordId = "") {
  $("#form-title").textContent = `Blacklist ${kind === "user" ? "Discord user" : "Discord guild"}`;
  $("#form-description").textContent = "This takes effect immediately in FCDex. You can remove the entry later from this page.";
  $("#form-fields").innerHTML = `<label class="form-field"><span>Type</span><select data-field="kind"><option value="user" ${kind === "user" ? "selected" : ""}>User</option><option value="guild" ${kind === "guild" ? "selected" : ""}>Guild</option></select></label><label class="form-field"><span>Discord ID</span><input data-field="discordId" value="${escapeHtml(discordId)}" inputmode="numeric" pattern="[0-9]{1,19}" required></label><label class="form-field field-full"><span>Reason (optional)</span><textarea data-field="reason" maxlength="500" rows="3"></textarea></label>`;
  $("#record-form").dataset.resource = "blacklist-create";
  $("#record-form").dataset.id = "";
  formDialog.showModal();
}

function openCoinsForm(discordId) {
  $("#form-title").textContent = "Adjust player balance";
  $("#form-description").textContent = `Update the coin balance for Discord user ${discordId}. This action is written to the server log.`;
  $("#form-fields").innerHTML = `<label class="form-field"><span>Operation</span><select data-field="operation"><option value="add">Add coins</option><option value="subtract">Remove coins</option><option value="set">Set balance</option></select></label><label class="form-field"><span>Amount</span><input data-field="amount" inputmode="numeric" pattern="[0-9]{1,19}" required></label>`;
  $("#record-form").dataset.resource = "player-coins";
  $("#record-form").dataset.id = discordId;
  formDialog.showModal();
}

function detailHtml(resource, row) {
  const lines = (items) => items.map(([label, value]) => `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "—")}</strong></div>`).join("");
  if (resource === "players") {
    const instances = row.recentInstances || [];
    return `<div class="detail-head"><div><p class="eyebrow">PLAYER / ACCOUNT PROFILE</p><h2>${escapeHtml(row.discordId)}</h2><p class="muted">${escapeHtml(row.totalClubInstances)} active club instances · ${escapeHtml(row.trades)} trades</p></div><button class="icon-button" data-action="close-detail">✕</button></div><div class="detail-grid">${lines([["Database ID", row.id], ["Discord ID", row.discordId], ["Coin balance", row.money], ["Donation policy", row.donationPolicy], ["Privacy policy", row.privacyPolicy], ["Mention policy", row.mentionPolicy], ["Friend policy", row.friendPolicy]])}</div><div class="detail-actions"><button class="primary-button" data-action="player-coins" data-id="${escapeHtml(row.discordId)}">Adjust coins</button><button class="small-button danger" data-action="player-blacklist" data-id="${escapeHtml(row.discordId)}">Blacklist user</button></div><section class="detail-section"><h3>Recent collection</h3>${instances.length ? `<div class="detail-table">${instances.map((item) => `<div class="detail-table-row"><div><strong>${escapeHtml(item.emoji ? `${item.emoji} ` : "")}${escapeHtml(item.club)}</strong><small>Instance #${escapeHtml(item.id)} ${item.special ? `· ${escapeHtml(item.special)}` : ""}</small></div><span>${escapeHtml(item.rarity)} rarity</span><span>${escapeHtml(new Date(item.catchDate).toLocaleDateString())}</span></div>`).join("")}</div>` : `<p class="muted">No active club instances.</p>`}</section><section class="detail-section"><h3>Extra data</h3><pre class="json-preview">${escapeHtml(JSON.stringify(row.extraData ?? {}, null, 2))}</pre></section>`;
  }
  if (resource === "trades") return `<div class="detail-head"><div><p class="eyebrow">TRANSFER LEDGER</p><h2>Trade #${escapeHtml(row.id)}</h2><p class="muted">${escapeHtml(row.status || "Unknown status")}</p></div><button class="icon-button" data-action="close-detail">✕</button></div><div class="detail-grid">${lines([["Created", new Date(row.date).toLocaleString()], ["Player 1", row.player1DiscordId], ["Player 2", row.player2DiscordId], ["Player 1 coins", row.player1Money], ["Player 2 coins", row.player2Money], ["Expires", row.expiresAt ? new Date(row.expiresAt).toLocaleString() : "—"], ["Resolved", row.resolvedAt ? new Date(row.resolvedAt).toLocaleString() : "—"]])}</div><section class="detail-section"><h3>Trade objects</h3>${row.objects.length ? `<div class="detail-table">${row.objects.map((item) => `<div class="detail-table-row"><div><strong>${escapeHtml(item.club)}</strong><small>Instance #${escapeHtml(item.instanceId)} ${item.special ? `· ${escapeHtml(item.special)}` : ""}</small></div><span>Owner ${escapeHtml(item.ownerDiscordId)}</span><span>${escapeHtml(item.rarity)} rarity</span></div>`).join("")}</div>` : `<p class="muted">This trade has no object records.</p>`}</section>`;
  if (resource === "waves") return `<div class="detail-head"><div><p class="eyebrow">SPAWN LEDGER</p><h2>${escapeHtml(row.waveKey)}</h2><p class="muted">${escapeHtml(row.status)}</p></div><button class="icon-button" data-action="close-detail">✕</button></div><div class="detail-grid">${lines([["Guild ID", row.guildId], ["Rarity floor", row.rarityFloor], ["Rarity ceiling", row.rarityCeiling], ["Wave size", row.size], ["Created", new Date(row.createdAt).toLocaleString()], ["Ended", row.endedAt ? new Date(row.endedAt).toLocaleString() : "—"]])}</div><section class="detail-section"><h3>Wave entries</h3>${row.entries.length ? `<div class="detail-table">${row.entries.map((entry) => `<div class="detail-table-row"><div><strong>Entry #${escapeHtml(entry.id)}</strong><small>Club ID ${escapeHtml(entry.ballId)} ${entry.specialId ? `· Special #${escapeHtml(entry.specialId)}` : ""}</small></div><span>${entry.caught ? "CAUGHT" : "MISSED"}</span><span>Reward ${escapeHtml(entry.reward)}</span></div>`).join("")}</div>` : `<p class="muted">No wave entries.</p>`}</section>`;
  return "";
}

async function openDetail(resource, id) {
  try {
    const data = await api(`/manage/${resource}/${encodeURIComponent(id)}`);
    $("#detail-content").innerHTML = detailHtml(resource, data.row);
    detailDialog.showModal();
  } catch (error) { showToast(error.message, "error"); }
}

function renderSystem(data) {
  const bot = data.bot || {};
  const runtime = data.runtime || {};
  const tiers = data.rarityTiers || [];
  pageBody.innerHTML = `<section class="stats-grid">${statCard("Bot version", escapeHtml(bot.version || "—"), "⚙", "APPLICATION VERSION")}${statCard("Enabled modules", (bot.modules || []).length, "▦", "ACTIVE DUGOUT MODULES")}${statCard("Admin allowlist", bot.adminCount || 0, "♙", "AUTHORIZED DISCORD IDS")}${statCard("Uptime", `${number(Math.floor((runtime.uptimeSeconds || 0) / 3600))}h`, "◷", "SINCE PROCESS START")}</section><section class="panel system-settings"><div class="panel-header"><h2>Runtime configuration</h2><span>READ ONLY</span></div><div class="detail-grid">${[["Bot name", bot.name], ["Description", bot.description], ["Enabled modules", (bot.modules || []).join(", ")], ["Economy", data.economy?.enabled ? "Enabled" : "Disabled"], ["Currency", data.economy?.currency], ["Spawning", data.spawning?.enabled ? "Enabled" : "Disabled"], ["Minimum messages", data.spawning?.minMessages], ["Catalog refresh", data.spawning?.catalogTtlSeconds ? `${data.spawning.catalogTtlSeconds}s` : "—"], ["Spawn wave chance", data.waves?.chancePercent != null ? `${data.waves.chancePercent}%` : "—"]].map(([label, value]) => `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "—")}</strong></div>`).join("")}</div><div class="panel-header"><h2>Rarity tiers</h2><span>${tiers.length} TIERS</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Tier</th><th>Threshold below</th></tr></thead><tbody>${tiers.map((tier) => `<tr><td>${escapeHtml(tier.key)}</td><td>${escapeHtml(tier.below)}</td></tr>`).join("") || `<tr><td colspan="2">No rarity tiers configured.</td></tr>`}</tbody></table></div></section><p class="footnote">Configuration is read from <code>src/config/config.ts</code>. This panel does not overwrite the local configuration file.</p>`;
}

async function loadCurrentView() {
  const view = views[state.view];
  if (!view) return;
  pageBody.innerHTML = '<div class="loading-state"><span class="loader"></span> Loading live records…</div>';
  try {
    if (state.view === "overview") { renderOverview(await api("/dashboard/summary")); return; }
    if (state.view === "blacklists") { await renderBlacklists(); return; }
    if (state.view === "system") { renderSystem(await api("/system/info")); return; }
    const result = await api(`/manage/${view.resource}?page=${state.page}&q=${encodeURIComponent(state.search)}`);
    renderResource(view, result);
  } catch (error) {
    pageBody.innerHTML = `<div class="error-card">${escapeHtml(error.message || "Unable to load data.")}</div>`;
  }
}

async function navigate(name) {
  if (!views[name]) return;
  state.view = name;
  state.search = "";
  state.page = 1;
  const view = views[name];
  $("#breadcrumb-current").textContent = view.title;
  $("#page-title").textContent = view.title;
  $("#page-eyebrow").textContent = view.eyebrow;
  $("#page-description").textContent = view.description;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === name));
  await loadCurrentView();
}

async function handleAction(button) {
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (action === "create") { openForm(views[state.view].resource); return; }
  if (action === "edit") {
    try {
      const result = await api(`/manage/${views[state.view].resource}/${encodeURIComponent(id)}`);
      openForm(views[state.view].resource, result.row);
    } catch (error) { showToast(error.message, "error"); }
    return;
  }
  if (action === "delete") {
    if (!confirm("Delete this record? This cannot be undone. If collections still reference it, the database will block the deletion.")) return;
    try { await api(`/manage/${views[state.view].resource}/${encodeURIComponent(id)}`, { method: "DELETE" }); showToast("Record deleted."); await loadCurrentView(); }
    catch (error) { showToast(error.message, "error"); }
    return;
  }
  if (action === "player-detail") { await openDetail("players", id); return; }
  if (action === "player-coins") { if (detailDialog.open) detailDialog.close(); openCoinsForm(id); return; }
  if (action === "player-blacklist") { detailDialog.close(); openBlacklistForm("user", id); return; }
  if (action === "detail") { await openDetail(button.dataset.resource, id); return; }
  if (action === "blacklist-add") { openBlacklistForm(); return; }
  if (action === "unblacklist") {
    if (!confirm("Remove this blacklist entry? The account or guild will no longer be blocked by this entry.")) return;
    try { await api(`/manage/blacklisted-${button.dataset.kind === "user" ? "users" : "guilds"}/${encodeURIComponent(id)}`, { method: "DELETE" }); showToast("Blacklist entry removed."); await renderBlacklists(); }
    catch (error) { showToast(error.message, "error"); }
    return;
  }
  if (action === "close-detail") detailDialog.close();
}

pageBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (button) void handleAction(button);
  const pageButton = event.target.closest("button[data-page-kind]");
  if (pageButton) {
    const kind = pageButton.dataset.pageKind;
    const nextPage = Math.max(1, (kind === "user" ? state.blacklistUsersPage : state.blacklistGuildsPage) + Number(pageButton.dataset.pageDir));
    if (kind === "user") state.blacklistUsersPage = nextPage; else state.blacklistGuildsPage = nextPage;
    void renderBlacklists().catch((error) => showToast(error.message, "error"));
  }
});

$("#detail-content").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (button) void handleAction(button);
});

$("#record-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const resource = form.dataset.resource;
  const id = form.dataset.id;
  const submit = $("#save-record");
  submit.disabled = true;
  try {
    const body = getFormBody(form);
    if (resource === "blacklist-create") {
      const kind = body.kind;
      const blacklistResource = kind === "guild" ? "blacklisted-guilds" : "blacklisted-users";
      delete body.kind;
      await api(`/manage/${blacklistResource}`, { method: "POST", body: JSON.stringify(body) });
      showToast("Blacklist entry added.");
      state.view = "blacklists";
    } else if (resource === "player-coins") {
      if (body.operation !== "add" && !confirm(`${body.operation === "set" ? "Replace" : "Remove"} the player's coin balance?`)) return;
      await api(`/manage/players/${encodeURIComponent(id)}/coins`, { method: "POST", body: JSON.stringify(body) });
      showToast("Player balance updated.");
      detailDialog.close();
    } else {
      const url = resource === "guilds" ? (id ? `/manage/guilds/${encodeURIComponent(id)}` : "/manage/guilds") : `/manage/${resource}${id ? `/${encodeURIComponent(id)}` : ""}`;
      const method = id ? "PATCH" : "POST";
      await api(url, { method, body: JSON.stringify(body) });
      showToast(id ? "Changes saved." : "Record created.");
    }
    formDialog.close();
    await loadCurrentView();
  } catch (error) { showToast(error.message, "error"); }
  finally { submit.disabled = false; }
});

$("#cancel-record").addEventListener("click", () => formDialog.close());
$("#cancel-record-bottom").addEventListener("click", () => formDialog.close());
$("#discord-login").addEventListener("click", () => { location.href = "/admin/api/auth/discord"; });
$("#logout-button").addEventListener("click", async () => {
  try { await api("/auth/logout", { method: "POST" }); } catch { /* Session may already have expired. */ }
  state.user = null;
  showLogin();
});
document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => navigate(item.dataset.view)));
$("#refresh-button").addEventListener("click", async () => { await loadCurrentView(); showToast("Data refreshed"); });

async function initialize() {
  const error = new URLSearchParams(location.search).get("error") || "";
  try {
    const session = await api("/auth/me");
    if (session.authenticated) { history.replaceState({}, "", "/admin/"); showApp(session.user); }
    else showLogin(error);
  } catch { showLogin(error); }
}
initialize();
