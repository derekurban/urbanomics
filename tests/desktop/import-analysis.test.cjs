// The import analysis proves column roles, the sign of amounts and the date order from cells, and
// turns plain-language recognition rules into the anchored patterns the app stores and back.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/import-analysis.mjs");

test("a running balance proves the amount column and which way positive points", async () => {
  const { analyzeKind, toMapping } = await load();
  const kind = { headers: ["Transfer date", "Description", "Amount", "Balance"], files: [
    { name: "Bank_everyday_2026-07.csv", rows: [["2026-07-03", "PAYROLL", "2450.00", "3210.44"], ["2026-07-05", "FRESHCO", "-58.12", "3152.32"], ["2026-07-09", "E-TRANSFER", "-120.00", "3032.32"]] },
    { name: "Bank_everyday_2026-08.csv", rows: [["2026-08-01", "PAYROLL", "2450.00", "5482.32"], ["2026-08-06", "POWER", "-91.40", "5390.92"]] },
  ] };
  const a = analyzeKind(kind);
  assert.deepEqual(a.roles, { 0: "date", 1: "description", 2: "amount", 3: "balance" });
  assert.equal(a.sign, 1);
  assert.deepEqual(a.dateFits, ["ymd"]);
  assert.deepEqual(a.questions, []);
  assert.match(a.because.sign, /Balance rises when Amount is positive/);
  assert.deepEqual(a.suggested, { name: "Bank Everyday", type: "Chequing", rule: { mode: "starts", text: "Bank_everyday" } });
  const m = toMapping(a.roles, { dateFormat: "ymd", sign: a.sign, delimiter: "," });
  assert.equal(m.amountMode, "signed"); assert.equal(m.amount, 2); assert.equal(m.balance, 3); assert.equal(m.sign, 1);
});

test("a balance that falls on positive amounts means positive is money out", async () => {
  const { analyzeKind } = await load();
  const a = analyzeKind({ headers: ["Date", "Memo", "Amount", "Balance"], files: [{ name: "card.csv", rows: [["2026-01-02", "A", "10.00", "90.00"], ["2026-01-03", "B", "5.00", "85.00"], ["2026-01-04", "C", "-20.00", "105.00"]] }] });
  assert.equal(a.sign, -1);
  assert.deepEqual(a.questions, []);
});

test("an exclusive pair is money out and in, named by the headings", async () => {
  const { analyzeKind, toMapping } = await load();
  const a = analyzeKind({ headers: ["Posted", "Merchant", "Debit", "Credit"], files: [{ name: "creditcard-statement-aug.csv", rows: [["08/02/2026", "BOOKS", "25.15", ""], ["08/14/2026", "PAYMENT - THANK YOU", "", "400.00"], ["08/20/2026", "CAFE", "6.40", ""]] }, { name: "creditcard-statement-sep.csv", rows: [["09/01/2026", "CABIN", "310.00", ""]] }] });
  assert.deepEqual(a.roles, { 0: "date", 1: "description", 2: "debit", 3: "credit" });
  assert.deepEqual(a.dateFits, ["mdy"]);
  assert.deepEqual(a.questions, []);
  assert.equal(a.suggested.type, "Credit card");
  assert.equal(a.suggested.rule.text, "creditcard-statement");
  assert.equal(toMapping(a.roles, { dateFormat: "mdy", sign: null }).amountMode, "separate");
});

test("without a balance the sign is a question, and ambiguous dates stay ambiguous", async () => {
  const { analyzeKind } = await load();
  const a = analyzeKind({ headers: ["Date", "Details", "Amount"], files: [{ name: "savings export (1).csv", rows: [["03/04/2026", "Interest", "4.21"], ["05/06/2026", "Transfer", "500.00"]] }] });
  assert.deepEqual(a.roles, { 0: "date", 1: "description", 2: "amount" });
  assert.deepEqual(a.dateFits, ["mdy", "dmy"]);
  assert.deepEqual(a.questions.map((q) => q.id), ["sign"]);
  assert.equal(a.suggested.type, "Savings");
  assert.equal(a.suggested.rule.text, "savings export");
});

test("mixed date orders still name the date column and leave the verdict to the parser", async () => {
  const { analyzeKind } = await load();
  const a = analyzeKind({ headers: ["Date", "Description", "Amount"], files: [{ name: "mixed.csv", rows: [["04/13/2026", "First", "1"], ["13/04/2026", "Second", "2"]] }] });
  assert.equal(a.roles[0], "date");
  assert.deepEqual(a.dateFits, []);
  assert.match(a.because.date, /not all in one order/);
});

test("shared starts drop the changing tail and trailing years", async () => {
  const { sharedStart } = await load();
  assert.equal(sharedStart(["Bank_everyday_2026-07.csv", "Bank_everyday_2026-08.csv"]), "Bank_everyday");
  assert.equal(sharedStart(["acct 2025.csv", "acct 2026.csv"]), "acct");
  assert.equal(sharedStart(["statement.csv"]), "statement");
  assert.equal(sharedStart(["creditcard-statement-aug.csv"]), "creditcard-statement");
  assert.equal(sharedStart(["Visa September 2026.csv"]), "Visa");
  assert.equal(sharedStart(["pc_mastercard_initial.csv", "pc_spending_initial.csv"]), "", "no shared start worth matching on");
});

test("rules compile to anchored patterns the matcher understands and decompile back", async () => {
  const { compileRule, decompileRule, ruleMatches, patternMatches } = await load();
  for (const rule of [{ mode: "starts", text: "Bank_everyday" }, { mode: "contains", text: "statement" }, { mode: "ends", text: "export (1)" }, { mode: "exact", text: "savings export (1)" }]) {
    assert.deepEqual(decompileRule(compileRule(rule)), rule, rule.mode);
  }
  assert.equal(compileRule({ mode: "starts", text: "Bank_everyday" }), "^Bank_everyday.*");
  assert.equal(ruleMatches({ mode: "starts", text: "bank_every" }, "Bank_everyday_2026-07.csv"), true);
  assert.equal(ruleMatches({ mode: "contains", text: "statement" }, "creditcard-statement-aug.csv"), true);
  assert.equal(ruleMatches({ mode: "ends", text: "(1)" }, "savings export (1).csv"), true);
  assert.equal(ruleMatches({ mode: "exact", text: "savings export (1)" }, "savings export (1).csv"), true);
  assert.equal(ruleMatches({ mode: "exact", text: "savings export" }, "savings export (1).csv"), false);
  assert.deepEqual(decompileRule("^(Bank|Card)_.*"), { mode: "custom", text: "^(Bank|Card)_.*" });
  assert.equal(patternMatches("^(Bank|Card)_.*", "Card_x.csv"), true);
  assert.equal(compileRule({ mode: "starts", text: "" }), "");
});

test("rows read under roles with the chosen sign and date order", async () => {
  const { readRows, monthsCovered } = await load();
  const roles = { 0: "date", 1: "description", 2: "amount" };
  const rows = [["03/04/2026", "Interest", "4.21"], ["05/06/2026", "Transfer", "500.00"]];
  assert.deepEqual(readRows(rows, roles, { sign: -1, dateFormat: "dmy" })[0], { date: "2026-04-03", text: "Interest", cents: -421 });
  assert.deepEqual(monthsCovered(rows, roles, "mdy"), ["2026-03", "2026-05"]);
});
