#!/usr/bin/env node
/**
 * Makes sure each Horus app has an internal TestFlight group "Horus team"
 * (all builds, no review) and that every accepted App Store Connect team user
 * is in it. Invited users who have not accepted yet are listed and skipped:
 * rerun after they accept. Needs the API key (see asc-api.mjs).
 *
 *   node apps/native/scripts/testflight-team.mjs
 */
import { asc } from "./asc-api.mjs";
const users = await asc("GET", "/v1/users?limit=50&fields[users]=username,firstName,lastName,roles");
const invites = await asc("GET", "/v1/userInvitations?limit=50&fields[userInvitations]=email");
console.log("team users:", users.data.map((u) => u.attributes.username).join(", "), "| pending invites:", invites.data.map((i) => i.attributes.email).join(", ") || "none");
const apps = await asc("GET", "/v1/apps?limit=20&fields[apps]=bundleId,name");
for (const a of apps.data.filter((x) => x.attributes.bundleId.startsWith("farm.horus"))) {
  const groups = await asc("GET", `/v1/apps/${a.id}/betaGroups?fields[betaGroups]=name,isInternalGroup`);
  let group = groups.data.find((g) => g.attributes.name === "Horus team");
  if (!group) {
    group = (await asc("POST", "/v1/betaGroups", {
      data: { type: "betaGroups", attributes: { name: "Horus team", isInternalGroup: true, hasAccessToAllBuilds: true }, relationships: { app: { data: { type: "apps", id: a.id } } } },
    })).data;
    console.log(a.attributes.name, ": created internal group");
  }
  const testers = await asc("GET", `/v1/betaGroups/${group.id}/betaTesters?fields[betaTesters]=email&limit=50`);
  const have = new Set(testers.data.map((t) => t.attributes.email?.toLowerCase()));
  for (const u of users.data) {
    const email = u.attributes.username.toLowerCase();
    if (have.has(email)) continue;
    try {
      await asc("POST", "/v1/betaTesters", {
        data: { type: "betaTesters", attributes: { email, firstName: u.attributes.firstName, lastName: u.attributes.lastName }, relationships: { betaGroups: { data: [{ type: "betaGroups", id: group.id }] } } },
      });
      console.log(a.attributes.name, ": added", email);
    } catch (e) { console.log(a.attributes.name, ": could not add", email, "-", e.message.slice(0, 200)); }
  }
  const b = await asc("GET", `/v1/builds?filter[app]=${a.id}&limit=3&fields[builds]=version,processingState`);
  console.log(a.attributes.name, ": builds", b.data.map((x) => `${x.attributes.version}:${x.attributes.processingState}`).join(", ") || "none yet");
}
