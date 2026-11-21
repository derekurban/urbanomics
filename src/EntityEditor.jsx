import { blend, endpoints } from "../electron/review/palette.mjs";
import { orderedTags, tagType } from "../electron/review/tag-model.mjs";
import { notify } from "./toast.jsx";
import React, { useId, useState } from "react";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import { Alert, ConfirmDialog, PersonPicker, Segmented, Swatches } from "./ui.jsx";
import { palette } from "./snapshots-v2-atoms.jsx";
import { plural } from "./format.js";
const api = window.urbanomics;

// One editor for tags, categories, events, people and palettes. usage: { transactions, rules } when known,
// so deleting something still in use says so before anything is tried.
export function EntityEditor({ entity, onClose, act, error, entities = [], usage = null, onAddPerson }) {
  const formId = useId();
  const label =
    entity.systemRole ? "system tag" : entity.kind === "palette"
      ? "palette"
      : entity.kind === "group"
        ? "event"
        : entity.kind === "bucket"
          ? "category"
          : entity.kind === "category"
            ? "tag"
            : entity.kind;
  const isPalette = entity.kind === "bucket" || entity.kind === "palette";
  const initialGradient = endpoints(entity);
  const [gradientStart, setGradientStart] = useState(initialGradient.gradientStart);
  const [gradientEnd, setGradientEnd] = useState(initialGradient.gradientEnd);
  const [flowType, setFlowType] = useState(entity.flowType || "expense");
  const [parentId, setParentId] = useState(entity.parentId || "");
  const [name, setName] = useState(entity.name || ""),
    [color, setColor] = useState(entity.customColor ?? entity.color ?? palette[0]),
    [confirm, setConfirm] = useState(false);
  const [startDate, setStartDate] = useState(entity.startDate || ""),
    [endDate, setEndDate] = useState(entity.endDate || "");
  const [participants, setParticipants] = useState(entity.participants || []);
  const people = entities.filter((e) => e.kind === "person");
  const parent = entity.kind === "category" && flowType === "expense" && entities.find((e) => e.kind === "bucket" && e.id === parentId);
  const paletteName = flowType === "income" ? "Income" : parent?.name || "Ungrouped tags";
  const children = entity.kind === "bucket" ? entities.filter((e) => e.parentId === entity.id).length : 0;
  const inUse = usage && (usage.transactions > 0 || usage.rules > 0);
  const blocked = inUse && (entity.kind === "category" || entity.kind === "person") ? `${entity.name} is on ${[usage.transactions ? plural(usage.transactions, "transaction") : "", usage.rules ? plural(usage.rules, "rule") : ""].filter(Boolean).join(" and ")}. Remove it from ${usage.transactions + usage.rules === 1 ? "that" : "those"} first.` : children ? `${entity.name} still has ${plural(children, "tag")}. Move ${children === 1 ? "it" : "them"} to another category first.` : "";
  const deleteText = entity.kind === "group"
    ? "Its transactions stay, with their current splits; they're just no longer grouped under this event."
    : entity.kind === "person" ? "No transaction or rule mentions them, so nothing else changes."
    : entity.kind === "bucket" ? "The category goes; there's nothing left in it."
    : "The tag goes. No transaction or rule uses it.";
  const Label = label[0].toUpperCase() + label.slice(1);
  // Tags that take their colour from this palette, in tag order, for the live preview.
  const paletteTags = !isPalette ? [] : orderedTags(entities.filter((t) => t.kind === "category" && !t.systemRole && (entity.kind === "bucket" ? tagType(t) === "expense" && t.parentId === entity.id : entity.id === "income" ? tagType(t) === "income" : tagType(t) === "expense" && !t.parentId)));
  const buckets = entities.filter((e) => e.kind === "bucket");
  async function save(e) {
    e.preventDefault();
    const values = {
      ...entity,
      name,
      color: isPalette ? blend(gradientStart, gradientEnd) : color,
      ...(isPalette ? { gradientStart, gradientEnd } : {}),
      startDate,
      endDate,
      parentId,
      flowType,
      ...(entity.kind === "group" ? { participants } : {}),
    };
    const id = await act(() => api.saveEntity(entity.kind, values));
    if (id === false) return;
    onClose();
    notify(savedToast(entity, values, id, act, label, entities));
  }
  return (
    <WorkspaceModal
      title={`${entity.id ? "Edit" : "New"} ${label}`}
      size="narrow"
      onClose={onClose}
      footer={
        <>
          {entity.id && !entity.systemRole && entity.kind !== "palette" && (
            <span className="footer-start"><button type="button" className="danger" onClick={() => setConfirm(true)}>Delete {label}</button></span>
          )}
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" form={formId} disabled={!name.trim() && entity.kind !== "palette"}>Save {label}</button>
        </>
      }
    >
      <form id={formId} className="entity-form" onSubmit={save}>
        {entity.kind !== "palette" && (
          <label>
            Name
            <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        {entity.kind === "group" && (
          <>
            <div className="field-row">
              <label>
                Start date
                <input type="date" required value={startDate} max={endDate || "9999-12-31"} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label>
                End date
                <input type="date" required value={endDate} min={startDate || "0001-01-01"} onChange={(e) => setEndDate(e.target.value)} />
              </label>
            </div>
            <p className="form-help">The calendar also suggests transactions a day either side; you choose what belongs.</p>
            <fieldset>
              <legend>Split with</legend>
              {people.length ? (
                <PersonPicker label="Participants" people={people} selected={participants} onToggle={(id) => setParticipants((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))} />
              ) : (
                <p className="form-help">No people yet. {onAddPerson ? <button type="button" className="link" onClick={onAddPerson}>Add a person</button> : "Add one under Settings, People."}</p>
              )}
              <small className="form-help">
                {participants.length
                  ? `Each expense in this event is split evenly between you and ${participants.length === 1 ? "this person" : `these ${participants.length} people`}, unless you give one its own split on the Organize desk. Anyone who has paid back part of an expense stays in its split.`
                  : "Choose who shares this event's costs, and each expense is split evenly. Leave it empty to split expenses one by one."}
              </small>
            </fieldset>
          </>
        )}
        {entity.systemRole ? (
          <p className="form-help">{entity.description} Its role, gray color and place are fixed; you can rename it.</p>
        ) : isPalette ? (
          <fieldset className="gradient-editor">
            <legend>Gradient</legend>
            <div className="field-row">
              <label>Start<input type="color" value={gradientStart} onChange={(e) => setGradientStart(e.target.value)} /></label>
              <label>End<input type="color" value={gradientEnd} onChange={(e) => setGradientEnd(e.target.value)} /></label>
            </div>
            <div className="gradient-preview" style={{ background: `linear-gradient(90deg, ${gradientStart}, ${gradientEnd})` }} aria-label="Gradient preview" />
            <div className="gradient-midpoint">
              <i style={{ background: blend(gradientStart, gradientEnd) }} />
              The category's own color is the blend of both.
            </div>
            {paletteTags.length > 0 && (
              <div className="gradient-steps" role="list" aria-label="How its tags will look">
                {paletteTags.map((t, i) => (
                  <span role="listitem" key={t.id}><i style={{ background: blend(gradientStart, gradientEnd, paletteTags.length === 1 ? 0.5 : i / (paletteTags.length - 1)) }} aria-hidden="true" />{t.name}</span>
                ))}
              </div>
            )}
            <small className="form-help">Tags take evenly spaced steps along it, in your tag order.</small>
          </fieldset>
        ) : entity.kind === "category" ? (
          <p className="form-help">Its color comes from the {paletteName} palette. Edit that palette to change its tags' colors.</p>
        ) : (
          <fieldset>
            <legend>Color</legend>
            <Swatches colors={palette} value={color} onChange={setColor} label={`${label[0].toUpperCase() + label.slice(1)} color`} />
          </fieldset>
        )}
        {entity.kind === "category" && !entity.systemRole && (
          <fieldset>
            <legend>Type</legend>
            <Segmented label="Tag type" value={flowType} onChange={(type) => { setFlowType(type); if (type === "income") setParentId(""); }} options={[{ value: "expense", label: "Expense" }, { value: "income", label: "Income" }]} />
            {!entity.id && flowType === "expense" && (
              <label className="entity-category">
                Category
                <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                  <option value="">Ungrouped</option>
                  {buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            )}
            <small className="form-help">
              {flowType === "income"
                ? "Income tags describe money in and have no category."
                : entity.id
                  ? `Category: ${entities.find((e) => e.id === parentId)?.name || "Ungrouped"}. Move tags between categories by dragging them in Settings.`
                  : "You can also drag a tag onto another category later."}
            </small>
            {entity.id && flowType !== (entity.flowType || "expense") && (
              <Alert tone="warning">Transactions already tagged keep this tag as it is. From now on it's offered only for {flowType === "income" ? "money in" : "money out"}.</Alert>
            )}
          </fieldset>
        )}
        {error && <Alert>{error}</Alert>}
      </form>
      {confirm && (
        <ConfirmDialog
          title={`Delete “${entity.name}”?`}
          confirmLabel={`Delete ${label}`}
          disabled={!!blocked}
          onClose={() => setConfirm(false)}
          onConfirm={async () => { if ((await act(() => api.removeEntity(entity.id))) !== false) { onClose(); notify({ title: `Deleted ${label} “${entity.name}”`, tone: "success" }); } }}
          error={error}
        >
          {blocked ? <Alert tone="warning">{blocked}</Alert> : <p>{deleteText}</p>}
        </ConfirmDialog>
      )}
    </WorkspaceModal>
  );
}

/* What a save did, in plain words, and an Undo where putting the old values back is safe: names, colours,
   dates and types go back through the same versioned save (the server re-checks every rule). A new item can be
   taken away again while nothing uses it. Changing who shares an event re-splits its expenses, so that one has
   no Undo. */
export function savedToast(entity, values, id, act, label, entities = []) {
  const quote = (n) => `“${n}”`;
  if (!entity.id) {
    return {
      title: `Added ${label} ${quote(values.name)}`,
      tone: "success",
      action: {
        label: "Undo",
        onClick: async () => {
          if ((await act(() => api.removeEntity(id))) !== false) notify({ title: `Removed ${label} ${quote(values.name)}`, tone: "neutral" });
        },
      },
    };
  }
  const was = entity.name || "", now = values.name || was;
  const changes = [];
  const renamed = entity.kind !== "palette" && was.trim() !== now.trim();
  const isPalette = entity.kind === "bucket" || entity.kind === "palette";
  const before = endpoints(entity);
  if (isPalette ? before.gradientStart !== values.gradientStart || before.gradientEnd !== values.gradientEnd : !entity.systemRole && entity.kind !== "category" && String(entity.customColor ?? entity.color).toLowerCase() !== String(values.color).toLowerCase()) changes.push("colours");
  if (entity.kind === "group" && (entity.startDate !== values.startDate || entity.endDate !== values.endDate)) changes.push("dates");
  if (entity.kind === "category" && !entity.systemRole && (entity.flowType || "expense") !== values.flowType) changes.push("type");
  const sharing = entity.kind === "group" && JSON.stringify([...(entity.participants || [])].sort()) !== JSON.stringify([...(values.participants || [])].sort());
  if (sharing) changes.push("who shares it");
  const name = entity.kind === "palette" ? (entity.id === "income" ? "Income tags" : "Ungrouped tags") : now;
  const title = !renamed && !changes.length ? `Saved ${label} ${quote(name)}`
    : renamed && !changes.length ? `Renamed ${quote(was)} to ${quote(now)}`
    : `Changed the ${[renamed ? "name" : "", ...changes].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " and $1")} of ${quote(name)}`;
  if ((!renamed && !changes.length) || sharing) return { title, tone: "success" };
  const restore = entity.kind === "palette" ? { ...entity } : { ...entity, color: entity.customColor ?? entity.color, ...(isPalette ? before : {}) };
  return {
    title,
    tone: "success",
    action: {
      label: "Undo",
      onClick: async () => {
        if ((await act(() => api.saveEntity(entity.kind, restore))) !== false) notify({ title: renamed ? `Renamed back to ${quote(was)}` : `Put ${quote(name)} back as it was`, tone: "neutral" });
      },
    },
  };
}
