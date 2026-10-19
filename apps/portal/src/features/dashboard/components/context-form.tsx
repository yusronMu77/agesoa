"use client";

import type { ChangeEvent } from "react";
import { ChevronDownIcon } from "@/components/shared/icons";
import type { DashboardFilters, FilterOption } from "../lib/filters";

function Picker({ name, label, all, value, options }: { name: string; label: string; all: string; value: string | null; options: FilterOption[] }) {
  const submit = (e: ChangeEvent<HTMLSelectElement>) => e.currentTarget.form?.requestSubmit();
  return (
    <label className="context-picker">
      <span className="context-picker__label">{label}</span>
      <select name={name} defaultValue={value ?? ""} onChange={submit}>
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="context-picker__chevron" />
    </label>
  );
}

/** Penpot `Pemilih konteks`: issue type and region; a change reloads the dashboard with the new query. */
export function ContextForm({ filters, types, regions }: { filters: DashboardFilters; types: FilterOption[]; regions: FilterOption[] }) {
  return (
    <form method="get" className="context-form" aria-label="Filter the dashboard">
      <Picker name="type" label="Issue type" all="All issue types" value={filters.type} options={types} />
      <Picker name="region" label="Region" all="All regions" value={filters.region} options={regions} />
      {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
      <noscript>
        <button type="submit" className="context-form__apply">
          Apply
        </button>
      </noscript>
    </form>
  );
}
