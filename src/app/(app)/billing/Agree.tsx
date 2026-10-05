import Link from "next/link";

/** The two checkboxes every payment needs: 18+ and the plan terms (stamped by `agree` in actions.ts). */
export function Agree({ t, id }: { t: (k: string, v?: Record<string, string | number>) => string; id: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <label className="flex items-start gap-2" htmlFor={`${id}-adult`}>
        <input id={`${id}-adult`} name="adult" type="checkbox" required className="mt-1" />
        <span>{t("I am 18 or older.")}</span>
      </label>
      <label className="flex items-start gap-2" htmlFor={`${id}-terms`}>
        <input id={`${id}-terms`} name="terms" type="checkbox" required className="mt-1" />
        <span>
          {t("I accept the plan terms")} (
          <Link href="/conditions#forfait" className="underline" target="_blank">
            {t("price, renewal, cancellation")}
          </Link>
          ).
        </span>
      </label>
    </div>
  );
}
