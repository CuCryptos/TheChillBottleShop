"use client";

import { useActionState } from "react";
import { importBudget, type ImportState } from "./actions";

const EXAMPLE = "month,line,amount\n2026-11,beer_sales,8000.00\n2026-11,rent,3000.00";

export function BudgetImport() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importBudget, { status: "idle" });

  return (
    <form action={action} className="form">
      <div className="field">
        <label htmlFor="csv">Budget CSV</label>
        <textarea
          id="csv" name="csv" rows={8} required spellCheck={false} placeholder={EXAMPLE}
          defaultValue={state.status === "invalid" || state.status === "failed" ? state.csv : ""}
          key={state.status === "imported" ? "reset" : "keep"}
        />
      </div>
      {state.status === "invalid" && (
        <div className="notice notice-error" role="alert">
          <p><strong>Nothing was imported.</strong> Fix these lines and try again:</p>
          <ul>{state.errors.map((e) => <li key={e.line}>Line {e.line}: {e.message}</li>)}</ul>
        </div>
      )}
      {state.status === "failed" && <p className="notice notice-error" role="alert">{state.message}</p>}
      {state.status === "imported" && (
        <p className="notice" role="status">Imported {state.count} budget lines for {state.months.join(", ")}.</p>
      )}
      <div><button className="button button-small" type="submit" disabled={pending}>{pending ? "Importing…" : "Import budget"}</button></div>
    </form>
  );
}
