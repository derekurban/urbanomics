// A synthetic workspace for trying the Codex features: three invented accounts, three months of invented
// merchants (July is organized, August and September mostly aren't), two people, an event, transfers and
// a card payment. Gaps are deliberate: no coffee, subscription, pet, fitness, phone, pharmacy or transit
// tags yet, and a few duplicate or misplaced tags for a restructure to find. Never use real data here.
const fs = require("node:fs"), path = require("node:path");
const { csv } = require("../electron/imports/parsers.cjs");

const header = ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"];
const dateOf = (m, d, y = 2026) => `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;

function monthly(m, y = 2026) {
  const day = (mm, d) => dateOf(mm, d, y);
  const card = [
    [`SQ *BEAN COUNTER ${1000 + m * 7}`, day(m, 3), -5.75], [`SQ *BEAN COUNTER ${2210 + m}`, day(m, 9), -6.25], [`MAPLE LEAF COFFEE #${10 + m}`, day(m, 17), -4.85],
    ["GREEN MARKET #0021", day(m, 4), -86.4 - m], [`CORNER GROCER ${110 + m}`, day(m, 12), -41.2], ["GREEN MARKET #0021", day(m, 22), -93.15],
    ["NETSTREAM.COM BILL", day(m, 6), -16.99], ["TUNEBOX PREMIUM", day(m, 14), -10.99],
    ["IRONWORKS GYM MEMBERSHIP", day(m, 1), -49], [`CITYPARK METER ${5500 + m * 3}`, day(m, 11), -4.5], ["METROTRANSIT FARE", day(m, 19), -3.35],
    ["JUNIPER BISTRO", day(m, 13), -96 - m * 4], ["PIZZA PLANET ONLINE", day(m, 25), -32.4],
    [`PAYMENT - THANK YOU`, day(m, 27), 650],
  ];
  if (m !== 7) card.push([`PETPAL SUPPLIES ${30 + m}`, day(m, 8), -45.3], [`NORTHFIELD PHARMACY ${m}`, day(m, 21), -23.4]);
  const chequing = [
    ["PAYROLL NORTHWIND LTD", day(m, 1), 2400], ["PAYROLL NORTHWIND LTD", day(m, 15), 2400],
    ["RENT - ELM STREET PROPERTIES", day(m, 1), -1650], ["CITY HYDRO BILL PMT", day(m, 10), -85.2 - m], ["BRIGHTLINE MOBILE", day(m, 18), -55],
    ["TFR TO SAVINGS", day(m, 16), -500], ["RWD CARD PAYMENT", day(m, 27), -650],
  ];
  const savings = [["TFR FROM CHEQUING", day(m, 16), 500], ["INTEREST PAID", day(m, 28), 3.12 + m / 100]];
  return { card, chequing, savings };
}

// bare: no categories or tags at all, as after Start from scratch, for a restructure to start from nothing.
// history: that many earlier untagged months before July 2026, for runs over hundreds of rows.
function seedCodexDemo(store, root, { bare = false, history = 0 } = {}) {
  const write = (name, rows) => { const file = path.join(root, name); fs.writeFileSync(file, csv([header, ...rows.map(([d, date, a]) => [d, "SAMPLE", "SAMPLE", date, "12:00 AM", String(a)])])); return file; };
  const chequing = store.addAccount("Everyday chequing", "pc", "chequing", { color: "#658e83" });
  const card = store.addAccount("Rewards card", "pc", "credit card", { color: "#c08a5b" });
  const savings = store.addAccount("Savings", "pc", "savings", { color: "#8fa6cb" });
  const months = { card: [], chequing: [], savings: [] };
  const earlier = Array.from({ length: history }, (_, i) => { const n = 6 * 12 + 6 - 1 - i; return [n % 12 + 1, 2020 + Math.floor(n / 12)]; });
  for (const [m, y] of [...earlier, [7, 2026], [8, 2026], [9, 2026]]) { const r = monthly(m, y); for (const k of Object.keys(months)) months[k].push(...r[k]); }
  months.card.push(["LAKESIDE CABIN RENTALS", dateOf(8, 15), -480], ["SHORELINE FUEL 88", dateOf(8, 15), -62.1], ["SHORELINE FUEL 88", dateOf(9, 20), -58.75], ["HARBOUR BOOKS & GIFTS", dateOf(9, 6), -38.5]);
  months.chequing.push(["E-TRANSFER RECEIVED SAM RIVERA", dateOf(8, 20), 240], ["E-TRANSFER SENT PRIYA NAIR", dateOf(9, 12), -40], ["E-TRANSFER RECEIVED PRIYA NAIR", dateOf(7, 22), 48]);
  for (const [name, rows, account] of [["demo-card.csv", months.card, card], ["demo-chequing.csv", months.chequing, chequing], ["demo-savings.csv", months.savings, savings]])
    store.resolveAccount(store.enqueue([write(name, rows)]).ids[0], account, false);

  const e = (kind, values) => store.review.entity(kind, values);
  if (bare) {
    e("person", { name: "Sam Rivera", color: "#ca8d86" }); e("person", { name: "Priya Nair", color: "#af8eb5" });
    return { accounts: { chequing, card, savings }, tags: {}, people: {} };
  }
  const food = e("bucket", { name: "Food", color: "#89b78a" }), home = e("bucket", { name: "Home", color: "#8fa6cb" }), transport = e("bucket", { name: "Transport", color: "#c9a26b" });
  const tag = (name, parentId = "", flowType = "expense") => e("category", { name, parentId, flowType, color: "#9aa993" });
  const t = {
    groceries: tag("Groceries", food), restaurants: tag("Restaurants", food), rent: tag("Rent", home), utilities: tag("Utilities", home), hydro: tag("Hydro", home),
    fuel: tag("Fuel", transport), gas: tag("Gas"), diningOut: tag("Dining out"), takeout: tag("Takeout"), misc: tag("Misc"), travel: tag("Travel"),
    paycheck: tag("Paycheck", "", "income"), salary: tag("Salary", "", "income"), gift: tag("Gift", "", "income"),
  };
  const sam = e("person", { name: "Sam Rivera", color: "#ca8d86" }), priya = e("person", { name: "Priya Nair", color: "#af8eb5" });
  e("group", { name: "Lake weekend", color: "#6f9fb5", startDate: "2026-08-14", endDate: "2026-08-17", participants: [sam] });
  e("group", { name: "Book club", color: "#b59a6f", startDate: "2026-09-05", endDate: "2026-09-06", participants: [] });
  store.transferLab.save({ maxDays: 2, basisPoints: 0, routes: [] }, store.transferLab.config().version);

  // July is organized, with history for the assistant to learn from.
  const rows = () => store.review.records().filter((r) => !r.deleted);
  const july = (r) => r.date.startsWith("2026-07");
  const plan = [
    [/GREEN MARKET|CORNER GROCER/, t.groceries], [/JUNIPER BISTRO/, t.restaurants], [/PIZZA PLANET/, t.takeout], [/RENT - ELM/, t.rent], [/CITY HYDRO/, t.hydro],
    [/PAYROLL NORTHWIND/, t.paycheck], [/BRIGHTLINE/, t.utilities], [/SQ \*BEAN COUNTER/, t.diningOut],
  ];
  for (const r of rows().filter(july)) {
    const hit = plan.find(([re]) => re.test(r.description));
    if (hit) store.review.organize([{ id: r.id, version: r.version, tags: [{ id: hit[1], cents: Math.abs(r.amountCents) }] }]);
  }
  // A shared July dinner and Priya paying it back, and the July transfers linked.
  const find = (re, month) => rows().find((r) => re.test(r.description) && r.date.startsWith(month));
  const dinner = find(/JUNIPER BISTRO/, "2026-07");
  store.review.financial(dinner.id, dinner.version, { kind: "expense", reviewed: true, shares: [{ id: "me", cents: Math.abs(dinner.amountCents) - 4800 }, { id: priya, cents: 4800 }], personId: "", allocations: [], remainder: 0, transferId: "" });
  const back = find(/E-TRANSFER RECEIVED PRIYA/, "2026-07");
  store.review.allocation(back.id, back.version, { tags: [], allocations: [{ id: dinner.id, cents: 4800 }], personId: priya, groups: [] });
  for (const [out, inc] of [[/TFR TO SAVINGS/, /TFR FROM CHEQUING/], [/RWD CARD PAYMENT/, /PAYMENT - THANK YOU/]]) {
    const a = find(out, "2026-07"), b = find(inc, "2026-07");
    store.review.linkTransfer(a.id, a.version, b.id, b.version, 0, []);
  }
  // The cabin is shared with Sam through the event, so his e-transfer has a balance to settle.
  const cabin = find(/LAKESIDE CABIN/, "2026-08");
  store.review.organize([{ id: cabin.id, version: cabin.version, groups: [store.review.entities().find((x) => x.name === "Lake weekend").id] }]);
  return { accounts: { chequing, card, savings }, tags: t, people: { sam, priya } };
}
module.exports = { seedCodexDemo };
