"use client";

import { ActionForm } from "@/components/ActionForm";
import { useT } from "@/components/I18nProvider";
import { startGroup } from "../actions";

export function NewGroupForm({ contacts }: { contacts: { id: string; name: string }[] }) {
  const t = useT();
  return (
    <details className="card p-4">
      <summary className="cursor-pointer font-semibold">{t("New group")}</summary>
      <ActionForm action={startGroup} className="form-stack mt-3">
        <label className="field-label" htmlFor="group-title">
          {t("Group name")}
        </label>
        <input id="group-title" name="title" className="field" maxLength={80} required placeholder={t("e.g. Family, Weekend in Québec")} />
        <fieldset className="space-y-1">
          <legend className="field-label">{t("People")}</legend>
          {contacts.map((c) => (
            <label key={c.id} className="check-row">
              <input type="checkbox" name="memberIds" value={c.id} /> {c.name}
            </label>
          ))}
        </fieldset>
        <button className="btn btn-primary">{t("Create group")}</button>
      </ActionForm>
    </details>
  );
}
