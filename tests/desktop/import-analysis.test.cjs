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
  assert.deepEqual(a.suggested, { name: "Bank everyday", type: "Chequing", rule: { mode: "starts", text: "Bank_everyday" } });
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

test("separate money out and in columns still take a running balance, which settles which is which", async () => {
  const { analyzeKind, toMapping } = await load();
  const rows = [["2026-09-02", "COFFEE SHOP", "4.50", "", "995.50"], ["2026-09-03", "PAYROLL", "", "2000.00", "2995.50"], ["2026-09-05", "RENT", "1500.00", "", "1495.50"]];
  const a = analyzeKind({ headers: ["Date", "Transaction", "Debit", "Credit", "Balance"], files: [{ name: "everyday.csv", rows }] });
  assert.deepEqual(a.roles, { 0: "date", 1: "description", 2: "debit", 3: "credit", 4: "balance" });
  assert.match(a.because.balance, /moves by Credit minus Debit/);
  assert.equal(toMapping(a.roles, { dateFormat: "ymd" }).balance, 4);
  // Headings that say nothing: the balance alone proves the second column is money out.
  const b = analyzeKind({ headers: ["When", "What", "Col A", "Col B", "Running"], files: [{ name: "x.csv", rows: rows.map((r) => [r[0], r[1], r[3], r[2], r[4]]) }] });
  assert.equal(b.roles[2], "credit"); assert.equal(b.roles[3], "debit"); assert.equal(b.roles[4], "balance");
  assert.deepEqual(b.questions, []);
});

test("a balance listed newest first still proves the sign", async () => {
  const { analyzeKind } = await load();
  const a = analyzeKind({ headers: ["Date", "Memo", "Amount", "Balance"], files: [{ name: "n.csv", rows: [["2026-01-04", "C", "-20.00", "80.00"], ["2026-01-03", "B", "5.00", "100.00"], ["2026-01-02", "A", "10.00", "95.00"]] }] });
  assert.equal(a.sign, 1);
  assert.equal(a.roles[3], "balance");
});

test("copy suffixes make names indistinguishable; dates and months don't", async () => {
  const { copyBase, sameNameSets } = await load();
  assert.equal(copyBase("accountactivity (2).csv"), "accountactivity");
  assert.equal(copyBase("statement-1.csv"), "statement");
  assert.equal(copyBase("export copy.csv"), "export");
  assert.equal(copyBase("Bank_everyday_2026-07.csv"), "bank_everyday_2026-07");
  assert.deepEqual(sameNameSets(["accountactivity.csv", "accountactivity (1).csv", "accountactivity (2).csv"]), [[0, 1, 2]]);
  assert.deepEqual(sameNameSets(["Bank_everyday_2026-07.csv", "Bank_everyday_2026-08.csv"]), []);
});

test("balances decide whether same-named files are one account or several, and say how", async () => {
  const { balanceEvidence } = await load();
  const roles = { 0: "date", 1: "description", 2: "debit", 3: "credit", 4: "balance" };
  const opts = { dateFormat: "ymd" };
  const aug = { name: "accountactivity.csv", rows: [["2026-08-02", "COFFEE", "4.50", "", "995.50"], ["2026-08-20", "PAYROLL", "", "2000.00", "2995.50"]] };
  const sep = { name: "accountactivity (1).csv", rows: [["2026-09-02", "RENT", "1500.00", "", "1495.50"]] };
  const same = balanceEvidence([aug, sep], roles, opts);
  assert.equal(same.verdict, "same");
  assert.match(same.reason, /accountactivity \(1\) starts at the balance accountactivity ends with/);
  // Newest first in the second file still chains.
  const sepNewest = { name: "accountactivity (1).csv", rows: [["2026-09-04", "GAS", "45.00", "", "1450.50"], ["2026-09-02", "RENT", "1500.00", "", "1495.50"]] };
  assert.equal(balanceEvidence([aug, sepNewest], roles, opts).verdict, "same");
  const card = { name: "accountactivity (2).csv", rows: [["2026-08-05", "GROCER", "80.00", "", "-80.00"], ["2026-08-10", "PAYMENT THANK YOU", "", "80.00", "0.00"]] };
  const apart = balanceEvidence([aug, card], roles, opts);
  assert.equal(apart.verdict, "different");
  assert.match(apart.reason, /cover the same days with different balances/);
  assert.deepEqual(apart.clusters, [[0], [1]]);
  // A gap the balances can't bridge: the cells can't settle it.
  const later = { name: "accountactivity (3).csv", rows: [["2026-09-30", "INTEREST", "", "3.10", "5003.10"]] };
  assert.equal(balanceEvidence([aug, later], roles, opts).verdict, "unknown");
  assert.equal(balanceEvidence([aug, card, later], roles, opts).verdict, "unknown");
  // Without a balance there is nothing to go on.
  const noBalance = balanceEvidence([aug, sep], { 0: "date", 1: "description", 2: "debit", 3: "credit" }, opts);
  assert.equal(noBalance.verdict, "unknown");
  assert.match(noBalance.reason, /no running balance/);
});

test("an account type comes from that account's own files", async () => {
  const { suggestType } = await load();
  const cardRows = [["2026-09-02", "GROCER", "80.00"], ["2026-09-10", "PAYMENT THANK YOU", "-80.00"]];
  const chequingRows = [["2026-09-03", "PAYROLL", "2000.00"]];
  assert.equal(suggestType(["demo-alpha.csv"], cardRows), "Credit card");
  assert.equal(suggestType(["demo-beta.csv"], chequingRows), "");
  assert.equal(suggestType(["demo-chequing.csv"], chequingRows), "Chequing");
  assert.equal(suggestType([], []), "");
});

test("the sign question shows one row of each sign", async () => {
  const { signExamples } = await load();
  const roles = { 0: "date", 1: "description", 2: "amount" };
  const ex = signExamples([["2026-09-02", "GROCER", "80.00"], ["2026-09-03", "PAYROLL NORTHWIND", "2400.00"], ["2026-09-04", "BEAN COUNTER", "-5.75"]], roles);
  assert.deepEqual(ex, { pos: { text: "GROCER", cents: 8000 }, neg: { text: "BEAN COUNTER", cents: -575 } });
  assert.equal(signExamples([["2026-09-02", "A", "1.00"]], roles).neg, null);
});

test("a saved layout's recognition reads in plain words, naming the accounts it serves", async () => {
  const { describeLayoutRule, listJoin } = await load();
  const accounts = [{ name: "Demo card", prefixRegex: "^demo-card.*" }, { name: "Demo chequing", prefixRegex: "^demo-chequing.*" }, { name: "Demo savings", prefixRegex: "^demo-savings.*" }];
  assert.equal(describeLayoutRule("^(?:demo-card.*|demo-chequing.*|demo-savings.*)", accounts), "Files recognized by Demo card, Demo chequing or Demo savings");
  assert.equal(describeLayoutRule("^(?:demo-card.*|accountactivity.*)", accounts), "Files recognized by Demo card, or whose name starts with “accountactivity”");
  assert.equal(describeLayoutRule("^statement.*", accounts), "Files whose name starts with “statement”");
  assert.equal(describeLayoutRule("^x(a|b).*", accounts), "Files that match a custom pattern");
  assert.equal(describeLayoutRule("", accounts), "Chosen by hand for each file");
  assert.equal(listJoin(["A", "B", "C"]), "A, B and C");
  assert.equal(listJoin(["A", "B"]), "A and B");
});

test("a file with no heading row, or with account lines above the headings, is named for what it is", () => {
  const { diagnoseShape } = require("../../electron/imports/layouts.cjs");
  const B = (s) => Buffer.from(s);
  assert.deepEqual(diagnoseShape(B("09/02/2026,COFFEE SHOP,4.50,,995.50\n09/03/2026,PAYROLL,,2000.00,2995.50\n")), { kind: "noHeader", first: ["09/02/2026", "COFFEE SHOP", "4.50", "", "995.50"] });
  assert.deepEqual(diagnoseShape(B("Account Number,12345\nStatement period,Sep 2026\n\nDate,Description,Amount\n2026-09-02,COFFEE SHOP,-4.50\n")), { kind: "preamble", lines: 2, headers: ["Date", "Description", "Amount"] });
  assert.equal(diagnoseShape(B("Date,Description,Amount\n2026-09-02,COFFEE SHOP,-4.50\n2026-09-03,PAYROLL,2000.00\n")), null);
  assert.equal(diagnoseShape(B("Date;Description;Amount\n2026-09-02;COFFEE;-4.50\n")), null);
});
