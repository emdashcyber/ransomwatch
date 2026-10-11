import assert from "node:assert/strict";
import { normalizedState, parseSortDate, postType, usableOrganizationName } from "../src/scripts/classify.js";

assert.equal(normalizedState("listed"), "listed");
assert.equal(normalizedState("bogus"), "unknown");

assert.equal(usableOrganizationName("Acme Corp"), true);
assert.equal(usableOrganizationName("N/A"), false);
assert.equal(usableOrganizationName("***"), false);

assert.equal(postType({ post_type: "victim", organization: "Acme Corp" }), "victim");
assert.equal(postType({ post_type: "victim", organization: "---" }), "review");
assert.equal(postType({ post_type: "headline", organization: "Acme" }), "headline");
assert.equal(postType({ post_title: "Press Release: update" }), "headline");
assert.equal(postType({ post_title: "Acme Corp" }), "victim");

assert.equal(parseSortDate("March 3, 2026"), Date.UTC(2026, 2, 3));
assert.equal(parseSortDate("3 March, 2026"), Date.UTC(2026, 2, 3));
assert.equal(parseSortDate("31 February 2026"), null);
assert.equal(parseSortDate(""), null);

console.log("dashboard helper tests passed");
