// How importing works, in plain words. Opened from the Snapshots landing, the populated page and
// the guided setup. Describes the product, not any particular bank or person.
import React from "react";
import { Sv2Dialog } from "./snapshots-v2-atoms.jsx";

export function GuideDialog({ onClose }) {
  return (
    <Sv2Dialog title="How importing works" onClose={onClose} wide>
      <div className="sv2-guide">
        <section>
          <h3>1. Export, then drop</h3>
          <p>Download a CSV of your account activity from your bank and drop it here, or choose it. The file is copied into this computer's archive exactly as it came and never changed. Nothing imports until you say so.</p>
        </section>
        <section>
          <h3>2. Files that look alike are one kind</h3>
          <p>Files with the same column headings are read the same way, so three months of the same export are set up once. Each kind gets one screen.</p>
        </section>
        <section>
          <h3>3. We read the cells, not just the headings</h3>
          <ul>
            <li><b>Dates</b>: the column where every value is a calendar date. The order (year-month-day, month-day-year or day-month-year) is settled when only one order fits every row. If two fit, you choose, with an example of each.</li>
            <li><b>Amounts</b>: one signed column, or a pair of money-out and money-in columns where each row fills exactly one.</li>
            <li><b>Which way is money in</b>: a running balance column proves it. If the balance rises when the amount is positive, positive is money in. Without a balance, you choose, with your own rows as the example.</li>
            <li><b>Descriptions</b>: the text column that is left.</li>
          </ul>
          <p>Everything found is listed with its reason, and you can change any column with a click on its heading. Only what the cells could not prove is a question.</p>
        </section>
        <section>
          <h3>4. The account and how to recognize its files</h3>
          <p>An account name, type and colour are suggested from the filenames. A recognition sentence, such as “files whose name starts with Bank_everyday”, is checked against the files in front of you and remembered. Next time, files with matching names go to that account and are read the same way, with no setup at all.</p>
        </section>
        <section>
          <h3>5. Import</h3>
          <p>Each row is filed by its own date into that account's monthly snapshot. A repeat or overlapping export never counts twice: rows already recorded are matched one for one, and two identical payments on the same day stay two payments. A partial export adds rows without removing anything.</p>
        </section>
        <section>
          <h3>Changing things later</h3>
          <p>Saved layouts (how each kind is read) are listed under Saved layouts on the Snapshots page. Accounts, their colours and their recognition rules live under Accounts. Changing either affects future files only; what is already imported keeps the interpretation it was imported with.</p>
        </section>
      </div>
    </Sv2Dialog>
  );
}
