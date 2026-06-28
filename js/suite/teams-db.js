/**
 * js/suite/teams-db.js — Supabase-backed saved teams (rosters).
 *
 * Thin data layer over the `acto_teams` table (owner-scoped RLS), used by the
 * "Mes équipes" library + the match builder. Uses the authenticated client the
 * login gate exposes as window.actoSuiteSb. All methods resolve to
 * { data, error } so callers handle the offline / not-logged-in case gracefully.
 *
 * Player shape: { id, name, photo, user_id } — photo is a downscaled data URL
 * (nullable); user_id links the player to an Acto account (nullable).
 */
(function () {
  "use strict";

  function sb() { return window.actoSuiteSb || null; }
  function uid() { return (window.ActoSuite && window.ActoSuite.gen && window.ActoSuite.gen.uid) ? window.ActoSuite.gen.uid() : ("p_" + Math.random().toString(36).slice(2, 10)); }

  function available() { return !!sb() && !!window.actoUser; }

  function normPlayer(p) {
    p = p || {};
    return { id: p.id || uid(), name: (p.name || "").trim(), photo: p.photo || null, user_id: p.user_id || null };
  }
  function normTeam(row) {
    row = row || {};
    return {
      id: row.id || null,
      name: row.name || "",
      color: row.color || "#6dd3c5",
      logo: row.logo || null,
      players: Array.isArray(row.players) ? row.players.map(normPlayer) : [],
      updatedAt: row.updated_at || null
    };
  }

  function list() {
    if (!available()) return Promise.resolve({ data: [], error: { message: "offline" } });
    return Promise.resolve(
      sb().from("acto_teams").select("*").order("updated_at", { ascending: false })
    ).then(function (res) {
      return { data: (res.data || []).map(normTeam), error: res.error || null };
    });
  }

  function create(team) {
    if (!available()) return Promise.resolve({ data: null, error: { message: "offline" } });
    var row = {
      owner_id: window.actoUser.id,
      name: team.name || "",
      color: team.color || "#6dd3c5",
      logo: team.logo || null,
      players: (team.players || []).map(normPlayer)
    };
    return Promise.resolve(
      sb().from("acto_teams").insert(row).select().single()
    ).then(function (res) { return { data: res.data ? normTeam(res.data) : null, error: res.error || null }; });
  }

  function update(id, patch) {
    if (!available()) return Promise.resolve({ data: null, error: { message: "offline" } });
    var row = {};
    if ("name" in patch) row.name = patch.name || "";
    if ("color" in patch) row.color = patch.color || "#6dd3c5";
    if ("logo" in patch) row.logo = patch.logo || null;
    if ("players" in patch) row.players = (patch.players || []).map(normPlayer);
    return Promise.resolve(
      sb().from("acto_teams").update(row).eq("id", id).select().single()
    ).then(function (res) { return { data: res.data ? normTeam(res.data) : null, error: res.error || null }; });
  }

  function remove(id) {
    if (!available()) return Promise.resolve({ error: { message: "offline" } });
    return Promise.resolve(sb().from("acto_teams").delete().eq("id", id))
      .then(function (res) { return { error: res.error || null }; });
  }

  // Search Acto accounts by stage name / first name (authenticated RPC).
  function searchUsers(q) {
    if (!available()) return Promise.resolve({ data: [], error: { message: "offline" } });
    return Promise.resolve(sb().rpc("search_users_by_stage_name", { p_query: q }))
      .then(function (res) { return { data: res.data || [], error: res.error || null }; });
  }

  window.ActoTeamsDB = {
    available: available,
    list: list, create: create, update: update, remove: remove,
    searchUsers: searchUsers,
    normTeam: normTeam, normPlayer: normPlayer, uid: uid
  };
})();
