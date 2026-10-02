const { systemDefinitions, systemTagRecords, isOther } = require("./system-tags.mjs");
const { blend, endpoints, validColor } = require("./palette.mjs");
const { tagType, tagFits, orderedTags } = require("./tag-model.mjs");
const { eventDates, validDate } = require("./event-model.mjs");
const { randomUUID } = require("node:crypto");
const {
  validBand,
  withinBand,
  pendingTransfers,
  transferParts,
} = require("./transfer-model.mjs");
const { splitShares, repaidByPerson, followsEvent } = require("./share-model.mjs");
const empty = () => ({
  tags: [],
  groups: [],
  groupsReviewed: false,
  kind: "unreviewed",
  reviewed: false,
  shares: null,
  personId: "",
  assignedPersonId: "",
  incomeType: "",
  incomeSource: "",
  allocations: [],
  remainder: 0,
  transferId: "",
  transferFeeCents: 0,
  transferExcessCents: 0,
});
const sum = (rows) => rows.reduce((n, r) => n + r.cents, 0);
function ids(value, label, max = 100) {
  if (
    !Array.isArray(value) ||
    value.length > max ||
    value.some((id) => typeof id !== "string") ||
    new Set(value).size !== value.length
  )
    throw new Error(`Choose unique ${label}.`);
  return value;
}
function portions(value, label) {
  if (
    !Array.isArray(value) ||
    value.some(
      (row) =>
        !row ||
        typeof row.id !== "string" ||
        !Number.isSafeInteger(row.cents) ||
        row.cents < 0,
    )
  )
    throw new Error(`Enter valid whole-cent ${label}.`);
  ids(
    value.map((row) => row.id),
    label,
  );
  if (!Number.isSafeInteger(sum(value)))
    throw new Error("Amount exceeds supported precision.");
  return value.map(({ id, cents }) => ({ id, cents }));
}

class ReviewStore {
  constructor(imports) {
    this.imports = imports;
    this.db = imports.db;
  }
  atomic(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  entities() {
    const stored = this.db.prepare("SELECT * FROM review_entities ORDER BY rowid").all().map(e => ({...e, tags:JSON.parse(e.tags), participants: e.participants ? JSON.parse(e.participants) : []}));
    // Reuse existing Other IDs, preserving assignments and rule references.
    // Renames live separately so the original identity never depends on its label.
    const system = systemDefinitions.map(t => ({...t,
      id: t.kind === 'category' ? stored.find(e => e.kind === 'category' && e.name.toLowerCase() === 'other' && tagType(e) === t.flowType)?.id || t.id : t.id,
      systemKey: t.id,
      name: this.db.prepare('SELECT name FROM system_tag_names WHERE id=?').get(t.id)?.name || t.name,
    }));
    return stored.filter(e => !system.some(t => t.id === e.id)).concat(system)
      .concat(
        this.db
          .prepare("SELECT * FROM category_palettes ORDER BY id")
          .all()
          .map((p) => ({
            ...p,
            kind: "palette",
            name: p.id === "income" ? "Income" : "Ungrouped tags",
            color: blend(p.gradientStart, p.gradientEnd),
            tags: [],
          })),
      );
  }
  records() {
    const imported = this.imports.aliases.decorate(
      this.db
        .prepare(
          "SELECT t.*,a.name AS account,a.color,a.deletedAt,r.payload AS review,r.version FROM transactions t JOIN accounts a ON a.id=t.account_id LEFT JOIN review_items r ON r.transaction_id=t.id ORDER BY t.date DESC,t.rowid DESC",
        )
        .all()
        .map((t) => ({
          ...JSON.parse(t.payload),
          id: t.id,
          accountId: t.account_id,
          account: t.account,
          color: t.color,
          deleted: !!t.deletedAt,
          review: t.review ? { ...empty(), ...JSON.parse(t.review) } : empty(),
          version: t.version || 0,
        })),
    );
    const cash = this.db
      .prepare("SELECT * FROM cash_receipts WHERE voidedAt IS NULL")
      .all()
      .map((t) => ({
        id: t.id,
        date: t.date,
        month: t.date.slice(0, 7),
        description: t.description,
        amountCents: t.amountCents,
        currency: t.currency,
        accountId: "manual-cash",
        account: "Cash · off-bank",
        color: "#C8A06D",
        manual: true,
        deleted: false,
        review: { ...empty(), ...JSON.parse(t.payload) },
        version: t.version,
      }));
    return [...imported, ...cash].sort((a, b) => b.date.localeCompare(a.date));
  }
  state() {
    const entities = this.entities();
    return { entities, records: systemTagRecords(this.records(), entities) };
  }
  pending() {
    return (
      this.db
        .prepare(
          "SELECT COUNT(*) AS n FROM transactions t JOIN accounts a ON a.id=t.account_id LEFT JOIN review_items r ON r.transaction_id=t.id WHERE a.deletedAt IS NULL AND COALESCE(json_extract(r.payload,'$.reviewed'),0)=0",
        )
        .get().n +
      this.db
        .prepare(
          "SELECT COUNT(*) AS n FROM cash_receipts WHERE voidedAt IS NULL AND COALESCE(json_extract(payload,'$.reviewed'),0)=0",
        )
        .get().n
    );
  }
  reorderTags(ids, expected) {
    return this.atomic(() => {
      if (!Array.isArray(ids) || !ids.length || !Array.isArray(expected) || new Set(ids).size !== ids.length)
        throw new Error("Choose the complete tag order.");
      if (ids.some(id => this.entities().some(t => t.id === id && t.systemRole))) throw new Error("System tags have a fixed position.");
      const first = this.entities().find(t => t.id === ids[0] && t.kind === "category");
      if (!first) throw new Error("Tag no longer exists.");
      const current = orderedTags(this.entities().filter(t => t.kind === "category" && !t.systemRole && t.flowType === first.flowType && t.parentId === first.parentId)).map(t => t.id);
      if (JSON.stringify(current) !== JSON.stringify(expected) || ids.length !== current.length || ids.some(id => !current.includes(id)))
        throw new Error("Tags changed. Refresh before reordering them.");
      const update = this.db.prepare("UPDATE review_entities SET sortOrder=? WHERE id=?");
      ids.forEach((id, index) => update.run(index + 1, id));
      return ids;
    });
  }
  entity(kind, values) {
    const system = this.entities().find(t => t.systemRole && t.id === values?.id);
    if (system) {
      if (kind !== system.kind || typeof values.name !== 'string' || !values.name.trim() || values.name.trim().length > 80)
        throw new Error('Enter a system tag name up to 80 characters.');
      if (['color','flowType','parentId'].some(key => values[key] !== undefined && values[key] !== system[key]))
        throw new Error('System tag roles, colors and locations are locked. Only the name can change.');
      if (this.entities().some(t => t.id !== system.id && t.kind === system.kind && t.flowType === system.flowType && t.name.toLowerCase() === values.name.trim().toLowerCase())) throw new Error('That name already exists.');
      this.db.prepare('INSERT INTO system_tag_names (id,name) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').run(system.systemKey,values.name.trim());
      return system.id;
    }
    if (kind === "palette") {
      if (
        !["income", "ungrouped"].includes(values?.id) ||
        !validColor(values.gradientStart) ||
        !validColor(values.gradientEnd)
      )
        throw new Error("Choose two valid gradient colors.");
      this.db
        .prepare(
          "INSERT INTO category_palettes (id,gradientStart,gradientEnd) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET gradientStart=excluded.gradientStart,gradientEnd=excluded.gradientEnd",
        )
        .run(values.id, values.gradientStart, values.gradientEnd);
      return values.id;
    }
    if (!["category", "bucket", "group", "person"].includes(kind))
      throw new Error("Unknown organization type.");
    const name = typeof values?.name === "string" ? values.name.trim() : "";
    if (
      !name ||
      name.length > 80 ||
      !/^#[0-9a-f]{6}$/i.test(values.color || "")
    )
      throw new Error("Enter a name (up to 80 characters) and a color.");
    const existing =
      values.id &&
      this.db
        .prepare("SELECT * FROM review_entities WHERE id=? AND kind=?")
        .get(values.id, kind);
    if (values.id && !existing)
      throw new Error("Item no longer exists. Refresh and try again.");
    let gradientStart = existing?.gradientStart || "",
      gradientEnd = existing?.gradientEnd || "";
    if (kind === "bucket") {
      for (const field of ["gradientStart", "gradientEnd"])
        if (values[field] !== undefined && !validColor(values[field]))
          throw new Error("Choose two valid gradient colors.");
      const gradient = endpoints({ ...existing, ...values });
      if (
        !validColor(gradient.gradientStart) ||
        !validColor(gradient.gradientEnd)
      )
        throw new Error("Choose two valid gradient colors.");
      gradientStart = gradient.gradientStart;
      gradientEnd = gradient.gradientEnd;
    }
    const flowType =
      kind === "category"
        ? (values.flowType ?? existing?.flowType ?? "expense")
        : "expense";
    if (!["expense", "income"].includes(flowType))
      throw new Error("Choose expense or income for this tag.");
    if (
      this.db
        .prepare(
          "SELECT id FROM review_entities WHERE kind=? AND lower(name)=lower(?) AND id<>? AND (kind<>'category' OR flowType=?)",
        )
        .get(kind, name, values.id || "", flowType)
    )
      throw new Error("That name already exists.");
    if (kind === 'category' && this.entities().some(t => t.systemRole && t.flowType === flowType && t.name.toLowerCase() === name.toLowerCase() && t.id !== values.id))
      throw new Error('That system tag already exists. Use it or choose another name.');
    const dates = eventDates(
      kind === "group" ? { ...existing, ...values } : {},
    );
    if (kind === "group" && (!dates.startDate || !dates.endDate))
      throw new Error("Events need both a start date and an end date.");
    if (existing && tagType(existing) !== flowType) {
      if(this.imports.transactionRules?.rules().some(r=>r.template?.tags.some(p=>p.id===existing.id)))throw new Error('Update template rules before changing this tag type.');
      if (
        this.records().some(
          (r) =>
            r.review.tags.some((p) => p.id === existing.id) &&
            !tagFits(r, { flowType }),
        )
      )
        throw new Error(
          "This type conflicts with saved transactions. Create a separate tag instead.",
        );
      if (
        this.db
          .prepare(
            "SELECT id FROM transaction_rules WHERE categoryId=? AND direction=?",
          )
          .get(existing.id, flowType === "income" ? "out" : "in")
      )
        throw new Error(
          "Update conflicting rule directions before changing this tag's type.",
        );
    }
    // Legacy kind=category identifies assignable tags. Buckets never own portions.
    const parentId =
      kind === "category" ? (values.parentId ?? existing?.parentId ?? "") : "";
    if (flowType === "income" && parentId)
      throw new Error("Income tags do not belong to expense categories.");
    if (
      typeof parentId !== "string" ||
      (parentId &&
        !this.db
          .prepare(
            "SELECT id FROM review_entities WHERE id=? AND kind='bucket'",
          )
          .get(parentId))
    )
      throw new Error("Choose an existing category for this tag.");
    let participants = existing?.participants ? JSON.parse(existing.participants) : [];
    if (kind === "group" && values.participants !== undefined) {
      participants = ids(values.participants, "participants");
      if (participants.some((p) => !this.db.prepare("SELECT id FROM review_entities WHERE id=? AND kind='person'").get(p)))
        throw new Error("Choose existing people for this event.");
    }
    const id = existing?.id || randomUUID();
    if (kind === "group" && existing) this.guardParticipants(id, JSON.parse(existing.participants || "[]"), participants);
    const lastOrder = this.db.prepare("SELECT COALESCE(MAX(sortOrder),0) n FROM review_entities WHERE kind='category' AND parentId=? AND flowType=?").get(parentId, flowType).n;
    const sortOrder = kind === "category" && (!existing || existing.parentId !== parentId || existing.flowType !== flowType)
      ? (lastOrder ? lastOrder + 1 : 0) : existing?.sortOrder || 0;
    this.db
      .prepare(
        "INSERT INTO review_entities (id,kind,name,color,tags,startDate,endDate,parentId,flowType,gradientStart,gradientEnd,sortOrder,participants) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color,tags=excluded.tags,startDate=excluded.startDate,endDate=excluded.endDate,parentId=excluded.parentId,flowType=excluded.flowType,gradientStart=excluded.gradientStart,gradientEnd=excluded.gradientEnd,sortOrder=excluded.sortOrder,participants=excluded.participants",
      )
      .run(
        id,
        kind,
        name,
        kind === "bucket"
          ? blend(gradientStart, gradientEnd)
          : kind === "category"
            ? existing?.color || "#9AA993"
            : values.color,
        existing?.tags || "[]",
        dates.startDate,
        dates.endDate,
        parentId,
        flowType,
        gradientStart,
        gradientEnd,
        sortOrder,
        JSON.stringify(participants),
      );
    if (kind === "group" && existing) this.atomic(() => this.applyEventSplit(id, participants));
    return id;
  }
  personNames() {
    return new Map(this.entities().filter((e) => e.kind === "person").map((e) => [e.id, e.name]));
  }
  /* Removing a participant who has repaid a member expense would orphan that repayment. */
  guardParticipants(eventId, previous, next) {
    const removed = previous.filter((p) => !next.includes(p));
    if (!removed.length) return;
    const records = this.records(), names = this.personNames();
    for (const e of records.filter((r) => !r.deleted && r.amountCents < 0 && r.review.groups.includes(eventId) && followsEvent(r.review, eventId))) {
      const paid = repaidByPerson(records, e.id);
      for (const p of removed)
        if (paid[p] > 0) throw new Error(`${names.get(p) || "This person"} has repaid part of ${e.description}. Move that repayment before removing them from the event.`);
    }
  }
  /* Member expenses that follow the event take its split; custom splits are left alone. */
  applyEventSplit(eventId, participants) {
    const records = this.records();
    for (const e of records.filter((r) => !r.deleted && !r.manual && r.amountCents < 0 && r.review.kind !== "transfer" && r.review.groups.includes(eventId))) {
      const hasShares = !!(e.review.shares && e.review.shares.length);
      if (hasShares && !followsEvent(e.review, eventId)) continue;
      if (!hasShares && !participants.length) continue;
      const paid = repaidByPerson(records, e.id), review = { ...e.review };
      if (participants.length) { review.shares = splitShares(Math.abs(e.amountCents), participants, paid); review.sharesSource = "event:" + eventId; if (review.kind === "unreviewed") review.kind = "expense"; }
      else if (Object.keys(paid).length) review.sharesSource = "manual";
      else { review.shares = null; delete review.sharesSource; }
      this.write(e.id, review, e.version);
    }
  }
  /* Joining an event applies its split to an expense without a custom one; leaving releases it. */
  applySplitInPlace(row, review, records) {
    if (row.amountCents >= 0 || row.manual || review.kind === "transfer") return;
    const eventId = review.groups[0], event = eventId && this.entities().find((e) => e.id === eventId && e.kind === "group");
    const hasShares = !!(review.shares && review.shares.length), fromEvent = typeof review.sharesSource === "string" && review.sharesSource.startsWith("event:");
    if (event && event.participants.length && (!hasShares || fromEvent)) {
      review.shares = splitShares(Math.abs(row.amountCents), event.participants, repaidByPerson(records, row.id));
      review.sharesSource = "event:" + eventId;
      if (review.kind === "unreviewed") review.kind = "expense";
    } else if (fromEvent && (!event || !event.participants.length || review.sharesSource !== "event:" + eventId)) {
      if (Object.keys(repaidByPerson(records, row.id)).length) review.sharesSource = "manual";
      else { review.shares = null; delete review.sharesSource; }
    }
  }
  followEventSplit(id, version) {
    return this.atomic(() => {
      const row = this.current(id, version), event = this.entities().find((e) => e.kind === "group" && e.id === row.review.groups[0]);
      if (row.amountCents >= 0) throw new Error("Only expenses have shares.");
      if (!event || !event.participants.length) throw new Error("This expense is not in an event with participants.");
      const shares = splitShares(Math.abs(row.amountCents), event.participants, repaidByPerson(this.records(), id));
      this.financialWrite(id, version, { kind: "expense", reviewed: row.review.reviewed, shares, sharesSource: "event:" + event.id, personId: "", allocations: [], remainder: 0, transferId: "" });
    });
  }
  starterHierarchy() {
    return this.atomic(() => {
      const starters = [
        [
          "Food",
          "#8DAE87",
          [
            "Groceries",
            "Restaurants",
            "Fast food",
            "Coffee and cafes",
            "Bars",
            "Delivery",
            "Alcohol",
            "Cannabis",
          ],
        ],
        [
          "Personal",
          "#B99BC9",
          ["Clothing", "Cosmetic and toiletries", "Medical", "Gifts"],
        ],
      ];
      for (const [name, color, tags] of starters) {
        const parentId =
          this.entities().find(
            (e) =>
              e.kind === "bucket" &&
              e.name.toLowerCase() === name.toLowerCase(),
          )?.id || this.entity("bucket", { name, color });
        for (const tag of tags) {
          const existing = this.entities().find(
            (e) =>
              e.kind === "category" &&
              tagType(e) === "expense" &&
              e.name.toLowerCase() === tag.toLowerCase(),
          );
          if (
            !existing ||
            (!existing.parentId && tagType(existing) === "expense")
          )
            this.entity("category", {
              ...existing,
              name: existing?.name || tag,
              color: existing?.color || color,
              parentId,
            });
        }
      }
      return this.entities();
    });
  }
  removeEntity(id) {
    const entity = this.entities().find((e) => e.id === id);
    if (!entity) throw new Error("Item not found.");
    if(this.imports.transactionRules?.rules().some(r=>r.template&&(r.template.tags.some(p=>p.id===id)||r.template.groups.includes(id))))throw new Error('This item is used by a template. Update or delete that rule first.');
    if (entity.systemRole) throw new Error("System tags cannot be deleted. You can rename them.");
    if (entity.kind === "palette")
      throw new Error("This shared palette cannot be deleted.");
    if (
      this.db
        .prepare(
          "SELECT id FROM transaction_rules WHERE categoryId=? OR personId=?",
        )
        .get(id, id)
    )
      throw new Error(
        "This item is mapped by a transaction rule. Update or delete that rule first.",
      );
    if (
      entity.kind === "bucket" &&
      this.entities().some((e) => e.parentId === id)
    )
      throw new Error(
        "Move this category's tags elsewhere before deleting it.",
      );
    if (entity.kind === "person" && this.entities().some((e) => e.kind === "group" && e.participants?.includes(id)))
      throw new Error("Remove this person from their events first.");
    const records = this.records();
    if (
      entity.kind === "category" &&
      records.some((t) => t.review.tags.some((p) => p.id === id))
    )
      throw new Error(
        "Remove this tag from its transactions first, including archived accounts.",
      );
    if (
      entity.kind === "person" &&
      records.some(
        (t) =>
          t.review.personId === id ||
          t.review.assignedPersonId === id ||
          t.review.shares?.some((p) => p.id === id),
      )
    )
      throw new Error(
        "This person is used by a split, repayment, or transaction association.",
      );
    return this.atomic(() => {
      if (entity.kind === "group")
        for (const t of records.filter((t) => t.review.groups.includes(id)))
          this.write(
            t.id,
            {
              ...t.review,
              groups: t.review.groups.filter((g) => g !== id),
              groupsReviewed: false,
            },
            t.version,
          );
      this.db.prepare("DELETE FROM review_entities WHERE id=?").run(id);
    });
  }
  saveCash(values) {
    return this.atomic(() => {
      const previous = values.id
        ? this.current(values.id, values.version)
        : null;
      if (previous && !previous.manual)
        throw new Error("Only cash receipts can be edited here.");
      const description =
        typeof values.description === "string" ? values.description.trim() : "";
      if (
        !description ||
        description.length > 160 ||
        !validDate(values.date) ||
        !Number.isSafeInteger(values.amountCents) ||
        values.amountCents <= 0 ||
        values.currency !== "CAD"
      )
        throw new Error(
          "Enter a description, valid date and positive CAD amount in whole cents.",
        );
      if (
        previous &&
        (sum(previous.review.allocations) > values.amountCents ||
          (previous.review.tags.length &&
            previous.amountCents !== values.amountCents))
      )
        throw new Error(
          "Adjust the receipt's allocations and categories before reducing or changing its amount.",
        );
      const id = previous?.id || randomUUID(),
        review = previous ? { ...previous.review } : empty();
      if (review.kind === "repayment")
        review.remainder = values.amountCents - sum(review.allocations);
      this.db
        .prepare(
          "INSERT INTO cash_receipts (id,date,description,amountCents,currency,payload,version,updated) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET date=excluded.date,description=excluded.description,amountCents=excluded.amountCents,payload=excluded.payload,version=excluded.version,updated=excluded.updated",
        )
        .run(
          id,
          values.date,
          description,
          values.amountCents,
          "CAD",
          JSON.stringify(review),
          (previous?.version || 0) + 1,
          this.imports.now().toISOString(),
        );
      return id;
    });
  }
  voidCash(id, version) {
    return this.atomic(() => {
      const row = this.current(id, version);
      if (!row.manual)
        throw new Error("Only a manual cash receipt can be removed here.");
      this.db
        .prepare(
          "UPDATE cash_receipts SET voidedAt=?,version=version+1 WHERE id=?",
        )
        .run(this.imports.now().toISOString(), id);
    });
  }
  write(id, review, version) {
    if (
      this.db
        .prepare("SELECT id FROM cash_receipts WHERE id=? AND voidedAt IS NULL")
        .get(id)
    ) {
      this.db
        .prepare(
          "UPDATE cash_receipts SET payload=?,version=?,updated=? WHERE id=?",
        )
        .run(
          JSON.stringify(review),
          version + 1,
          this.imports.now().toISOString(),
          id,
        );
      return;
    }
    this.db
      .prepare(
        "INSERT INTO review_items VALUES (?,?,?,?) ON CONFLICT(transaction_id) DO UPDATE SET payload=excluded.payload,version=excluded.version,updated=excluded.updated",
      )
      .run(
        id,
        JSON.stringify(review),
        version + 1,
        this.imports.now().toISOString(),
      );
  }
  current(id, version) {
    const row = this.records().find((t) => t.id === id && !t.deleted);
    if (!row) throw new Error("Transaction is no longer in an active account.");
    if (version !== row.version)
      throw new Error(
        "This transaction changed. Close the editor and reopen it to use the latest version.",
      );
    return row;
  }
  organize(changes) {
    if (!Array.isArray(changes) || !changes.length || changes.length > 500)
      throw new Error("Select up to 500 transactions.");
    ids(
      changes.map((c) => c.id),
      "transactions",
      500,
    );
    const entities = this.entities(),
      tags = new Set(
        entities.filter((e) => e.kind === "category").map((e) => e.id),
      ),
      groups = new Set(
        entities.filter((e) => e.kind === "group").map((e) => e.id),
      );
    return this.atomic(() => {
      for (const change of changes) {
        const row = this.current(change.id, change.version),
          review = { ...row.review };
        if (change.assignedPersonId !== undefined) {
          if (
            typeof change.assignedPersonId !== "string" ||
            (change.assignedPersonId &&
              !entities.some(
                (e) => e.id === change.assignedPersonId && e.kind === "person",
              ))
          )
            throw new Error("Choose an existing person.");
          review.assignedPersonId = change.assignedPersonId;
        }
        if (change.tags !== undefined) {
          delete review.allocationMode;
          delete review.templateReview;
          review.tags = portions(change.tags, "tag portions");
          // Let legacy assignments remain unchanged during unrelated edits, or be removed.
          const unchanged =
            JSON.stringify(review.tags) === JSON.stringify(row.review.tags);
          if (
            !unchanged &&
            review.tags.some(
              (p) =>
                !tagFits(
                  row,
                  entities.find((e) => e.id === p.id),
                ),
            )
          )
            throw new Error(
              "Use tags from this transaction's income or expense lens. Repayments and transfers are managed through their financial links.",
            );
          if (
            review.tags.some((p) => !tags.has(p.id)) ||
            (review.tags.length &&
              sum(review.tags) !== Math.abs(row.amountCents))
          )
            throw new Error(
              "Category portions must total the transaction amount and use existing categories.",
            );
        }
        if (change.groups !== undefined) {
          review.groups = ids(change.groups, "groups");
          if (review.groups.length > 1)
            throw new Error("A transaction belongs to one event. Choose one.");
          if (review.groups.some((id) => !groups.has(id)))
            throw new Error("Group no longer exists.");
          review.groupsReviewed = review.groups.length > 0;
          this.applySplitInPlace(row, review, this.records());
        }
        if (change.groupsReviewed !== undefined) {
          if (typeof change.groupsReviewed !== "boolean")
            throw new Error("Event review must be true or false.");
          review.groupsReviewed = change.groupsReviewed;
        }
        this.write(row.id, review, row.version);
      }
    });
  }
  financial(id, version, draft) {
    return this.atomic(() => this.financialWrite(id, version, draft));
  }
  allocationGroups(id, groups) {
    if(groups===undefined)return;
    const selected=ids(groups,'groups');
    if(selected.some(id=>!this.entities().some(e=>e.id===id&&e.kind==='group')))throw new Error('Group no longer exists.');
    if(selected.length>1)throw new Error('A transaction belongs to one event. Choose one.');
    const records=this.records(),row=records.find(r=>r.id===id&&!r.deleted),review={...row.review,groups:selected,groupsReviewed:selected.length>0};
    this.applySplitInPlace(row,review,records);
    this.write(id,review,row.version);
  }
  allocation(id, version, draft) {
    return this.atomic(() => {
      const row=this.current(id,version);
      if(row.review.kind==='transfer')throw new Error('Unlink the transfer before editing allocations.');
      const tags=portions(draft.tags||[], 'tag portions');
      if(tags.some(p=>isOther(p.id,this.entities())))throw new Error('Leave the remainder unallocated instead of choosing Other.');
      const allocations=portions(draft.allocations||[], 'repayments');
      if(row.amountCents<=0&&allocations.length)throw new Error('Only incoming money can repay an expense.');
      const kind=row.amountCents<0?'expense':row.amountCents===0?'zero':allocations.some(p=>p.cents>0)?'repayment':tags.some(p=>p.cents>0)?'income':'unreviewed';
      this.financialWrite(id,version,{...row.review,tags,allocations,kind,reviewed:kind!=='unreviewed',personId:draft.personId||'',shares:row.review.shares,remainder:kind==='repayment'?row.amountCents-sum(allocations):0},0,true);
      this.allocationGroups(id,draft.groups);
    });
  }
  linkTransfer(outId, outVersion, inId, inVersion, basisPoints, groups) {
    return this.atomic(() => {
      if (!validBand(basisPoints))
        throw new Error(
          "Choose a percentage band from 0 to 100%, with up to two decimal places.",
        );
      const outgoing = this.current(outId, outVersion),
        incoming = this.current(inId, inVersion);
      const pending = new Set(
        pendingTransfers(this.records()).map((t) => t.id),
      );
      if (!pending.has(outId) || !pending.has(inId))
        throw new Error(
          "Both entries must be pending: clear any income, repayment or shared-expense assignment before linking. Expenses receiving repayments cannot be linked.",
        );
      if (!withinBand(outgoing.amountCents, incoming.amountCents, basisPoints))
        throw new Error("The selected pair is outside the percentage band.");
      this.financialWrite(
        outId,
        outVersion,
        { kind: "transfer", reviewed: true, transferId: inId },
        basisPoints,
      );
      this.allocationGroups(inId,groups);
    });
  }
  unlinkTransfer(id, version, counterpartVersion) {
    return this.atomic(() => {
      const row = this.current(id, version),
        counterpart = this.current(row.review.transferId, counterpartVersion);
      if (counterpart.review.transferId !== id)
        throw new Error("This pair changed. Refresh before unlinking.");
      for (const item of [row, counterpart])
        this.write(
          item.id,
          {
            ...item.review,
            kind: "unreviewed",
            reviewed: false,
            transferId: "",
            transferFeeCents: 0,
            transferExcessCents: 0,
          },
          item.version,
        );
    });
  }
  financialWrite(id, version, draft, basisPoints = 0, layerMode = false) {
    const row = this.current(id, version),
      review = {
        ...row.review,
        kind: draft.kind,
        reviewed: draft.reviewed === true,
        shares:
          draft.shares === null ? null : portions(draft.shares || [], "shares"),
        personId: draft.personId || "",
        incomeType: draft.incomeType || "",
        incomeSource:
          typeof draft.incomeSource === "string"
            ? draft.incomeSource.trim()
            : "",
        allocations: portions(draft.allocations || [], "repayments"),
        remainder: draft.remainder ?? 0,
        transferId: draft.transferId || "",
      };
    if (draft.shares !== undefined && JSON.stringify(draft.shares) !== JSON.stringify(row.review.shares)) {
      if (draft.shares === null) delete review.sharesSource; else review.sharesSource = draft.sharesSource || "manual";
    }
    if(layerMode)review.allocationMode='layers';
    else if(draft.tags!==undefined)delete review.allocationMode;
    if(layerMode||draft.tags!==undefined)delete review.templateReview;
    // Optional tags and financial purpose form one versioned, atomic decision.
    if (draft.tags !== undefined) {
      const entities=this.entities();
      review.tags=portions(draft.tags,"tag portions");
      const unchanged=JSON.stringify(review.tags)===JSON.stringify(row.review.tags);
      if (review.tags.some(p=>!entities.some(e=>e.id===p.id&&e.kind==='category')) ||
          (layerMode ? sum(review.tags)+sum(review.allocations)>Math.abs(row.amountCents) : (review.tags.length&&sum(review.tags)!==Math.abs(row.amountCents))) ||
          (!unchanged&&review.tags.some(p=>!tagFits({...row,review},entities.find(e=>e.id===p.id)))))
        throw new Error(layerMode?"Tags and connections must fit within the transaction and use its income or expense tags.":"Tag portions must total the amount and use tags from this transaction's lens.");
    }
    if(review.allocationMode==='layers'&&sum(review.tags)+(review.kind==='repayment'?sum(review.allocations):0)>Math.abs(row.amountCents))
      throw new Error('Reduce tag allocations before increasing these repayments.');
    const people = new Set(
      this.entities()
        .filter((e) => e.kind === "person")
        .map((e) => e.id),
    );
    if (
      ![
        "unreviewed",
        "expense",
        "income",
        "repayment",
        "transfer",
        "zero",
      ].includes(review.kind) ||
      (review.reviewed && review.kind === "unreviewed")
    )
      throw new Error("Choose a valid financial purpose.");
    if (
      (review.kind === "zero" && row.amountCents !== 0) ||
      (review.kind === "expense" && row.amountCents >= 0) ||
      (["income", "repayment"].includes(review.kind) && row.amountCents <= 0)
    )
      throw new Error(
        "Purpose does not match the direction of this transaction.",
      );
    // Legacy source labels remain archival metadata, never a required decision.
    if (review.kind !== "income") {
      review.incomeType = "";
      review.incomeSource = "";
    }
    if (row.manual && review.kind === "transfer")
      throw new Error("Cash receipts cannot be paired as bank transfers.");
    if (review.kind !== "expense") { review.shares = null; delete review.sharesSource; }
    if (
      review.shares &&
      (sum(review.shares) !== Math.abs(row.amountCents) ||
        review.shares.some((p) => p.id !== "me" && !people.has(p.id)) ||
        !review.shares.some((p) => p.id === "me"))
    )
      throw new Error("Shares must include you and total the full expense.");
    if (review.kind !== "repayment") {
      review.allocations = [];
      review.personId = "";
      review.remainder = 0;
    } else if (
      !people.has(review.personId) ||
      !Number.isSafeInteger(review.remainder) ||
      review.remainder < 0 ||
      sum(review.allocations) + review.remainder !== row.amountCents
    )
      throw new Error(
        "Choose a person and allocate the full payment, including any unassigned e-transfer income.",
      );
    review.transferFeeCents = 0;
    review.transferExcessCents = 0;
    if (review.kind !== "transfer") review.transferId = "";
    const records = this.records();
    // Unlink the prior pair before applying a changed transfer decision.
    const previousPair =
      row.review.transferId &&
      records.find((t) => t.id === row.review.transferId);
    if (previousPair && review.transferId !== previousPair.id) {
      const next = {
        ...previousPair.review,
        kind: "unreviewed",
        reviewed: false,
        transferId: "",
        transferFeeCents: 0,
        transferExcessCents: 0,
      };
      this.write(previousPair.id, next, previousPair.version);
      previousPair.review = next;
    }
    if (review.kind === "transfer") {
      const target = records.find(
        (t) => t.id === review.transferId && !t.deleted,
      );
      if (
        !target ||
        target.manual ||
        target.id === id ||
        target.accountId === row.accountId ||
        Math.sign(target.amountCents) === Math.sign(row.amountCents) ||
        !target.amountCents ||
        target.currency !== row.currency ||
        !row.amountCents
      )
        throw new Error(
          "Choose an opposite transaction in another account and the same currency.",
        );
      const outgoing = row.amountCents < 0 ? row : target,
        incoming = row.amountCents > 0 ? row : target;
      if (
        !(
          row.review.transferId === target.id && target.review.transferId === id
        ) &&
        !withinBand(outgoing.amountCents, incoming.amountCents, basisPoints)
      )
        throw new Error(
          "Choose an equal, opposite transaction, or use the Transfers percentage band.",
        );
      Object.assign(review, transferParts(row, target));
      if (
        (target.review.transferId && target.review.transferId !== id) ||
        target.review.kind === "repayment" ||
        (target.review.transferId !== id &&
          (!["unreviewed", "expense"].includes(target.review.kind) ||
            target.review.shares?.some((p) => p.id !== "me" && p.cents > 0)))
      )
        throw new Error(
          "The other transaction has an income, repayment, shared-expense or transfer assignment. Clear that assignment before linking.",
        );
      const next = {
        ...target.review,
        kind: "transfer",
        reviewed: review.reviewed,
        transferId: id,
        shares: null,
        allocations: [],
        personId: "",
        remainder: 0,
        ...transferParts(target, row),
      };
      this.write(target.id, next, target.version);
      target.review = next;
    }
    const projected = records.map((t) => (t.id === id ? { ...t, review } : t));
    // Validate every existing allocation too: expense edits cannot invalidate repayments.
    const byExpense = new Map(), names = this.personNames();
    for (const payment of projected.filter(
      (t) => t.review.kind === "repayment",
    )) {
      for (const p of payment.review.allocations) {
        const expense = projected.find((t) => t.id === p.id);
        if (
          !expense ||
          expense.amountCents >= 0 ||
          !["expense", "unreviewed"].includes(expense.review.kind) ||
          expense.currency !== payment.currency
        )
          throw new Error(
            "Repayments must target expenses in the same currency.",
          );
        const totals = byExpense.get(p.id) || { total: 0, people: {} };
        totals.total += p.cents;
        totals.people[payment.review.personId] =
          (totals.people[payment.review.personId] || 0) + p.cents;
        if (totals.total > Math.abs(expense.amountCents))
          throw new Error("Repayments exceed the expense amount.");
        for (const [person, cents] of Object.entries(totals.people)) {
          const share = expense.review.shares?.find((s) => s.id === person)?.cents || 0;
          if (!share)
            throw new Error(`Share ${expense.description} with ${names.get(person) || "this person"} before applying their repayment.`);
          if (cents > share)
            throw new Error(`${names.get(person) || "This person"}'s repayments exceed their agreed share of ${expense.description}. Adjust the split or the payment.`);
        }
        byExpense.set(p.id, totals);
      }
    }
    this.write(id, review, row.version);
  }
}
module.exports = { ReviewStore, empty };
