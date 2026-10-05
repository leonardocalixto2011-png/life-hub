"use client";

import { useState } from "react";
import { AtSign } from "lucide-react";

import { useT } from "@/components/I18nProvider";
import { normalizeUsername, usernameMessage, usernameProblem } from "@/lib/username";

/**
 * The username input with feedback while typing — format only; whether it is
 * free is checked when it's saved. Shared by /account and the welcome.
 */
export function UsernameField({
  defaultValue,
  name = "username",
  value,
  onChange,
}: {
  defaultValue?: string;
  name?: string;
  value?: string;
  onChange?: (v: string) => void;
}) {
  const t = useT();
  const [own, setOwn] = useState(defaultValue ?? "");
  const current = value ?? own;
  const normalized = normalizeUsername(current);
  const problem = normalized ? usernameProblem(normalized) : null;

  return (
    <label className="field-label">
      {t("Username")}
      <div className="relative">
        <AtSign size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" aria-hidden />
        <input
          name={name}
          value={current}
          onChange={(e) => (onChange ? onChange(e.target.value) : setOwn(e.target.value))}
          maxLength={25}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="marie.tremblay"
          className="field pl-9"
          aria-invalid={problem ? true : undefined}
        />
      </div>
      <span className={`field-hint ${problem ? "text-[var(--color-danger)]" : ""}`}>
        {problem
          ? t(usernameMessage(problem))
          : t("How people find you to invite you to a hub. Letters, digits, dots and underscores.")}
      </span>
    </label>
  );
}
