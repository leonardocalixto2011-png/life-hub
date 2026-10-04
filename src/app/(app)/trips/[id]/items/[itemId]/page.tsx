import { notFound } from "next/navigation";
import { ExternalLink, Trash2 } from "lucide-react";

import { hubChrome } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { toDateInput } from "@/lib/format";
import { centsToInput } from "@/lib/money";
import { personName } from "@/lib/people";
import { PageHeader } from "@/components/SectionHeader";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { DangerZone, FormSection } from "@/components/Form";
import { ConfirmButton } from "@/components/ConfirmButton";
import { deleteTripItem, setTripItemImage, setTripItemImageFromLink, updateTripItem } from "../../../actions";
import { PlanPhoto } from "../../../PlanPhoto";
import { mapEmbedUrl, mapSearchUrl } from "../../../map";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  ACTIVITY: "Activity",
  BOOK: "To book",
  TODO: "To do",
  SAVE: "Savings deposit",
  PACK: "To pack",
  STOP: "Where we sleep",
  BUDGET: "Budget line",
  TIP: "Good to know",
};

/**
 * One item of a trip plan, opened from the trip page: its photo, its map, and
 * every field editable — the usual reason to come here is to put in what the
 * hotel actually cost once it's booked.
 */
export default async function TripItemPage({ params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const { user, hub } = await requireHub();
  const t = await getT();
  const [item, { members }] = await Promise.all([
    withHub(user.id, (tx) =>
      tx.tripItem.findFirst({
        where: {
          id: itemId,
          tripId: id,
          // Mirror of trip_item_via_visible_trip.
          trip: { hubId: hub.id, OR: [{ visibility: "SHARED" }, { createdById: user.id }] },
        },
        include: { trip: { select: { id: true, title: true, destination: true } } },
      }),
    ),
    hubChrome(user.id, hub.id),
  ]);
  if (!item) notFound();

  const where = item.place || [item.title, item.trip.destination].filter(Boolean).join(", ");
  const showMap = item.kind === "ACTIVITY" || item.kind === "BOOK" || item.kind === "STOP" || !!item.place;
  const update = updateTripItem.bind(null, item.id);

  return (
    <div className="page">
      <PageHeader back={{ href: `/trips/${item.trip.id}`, label: item.trip.title }} title={item.title} sub={t(KIND_LABEL[item.kind] ?? "Item")} />

      <PlanPhoto
        imageUrl={item.imageUrl}
        alt={item.title}
        userId={user.id}
        save={setTripItemImage.bind(null, item.id)}
        saveLink={setTripItemImageFromLink.bind(null, item.id)}
      />

      {showMap && (
        <FormSection title={t("Map")}>
          {/* Loaded only when someone opens this page, and lazily: Google sees
              the place, not the plan. */}
          <iframe
            src={mapEmbedUrl(where)}
            title={t("Map")}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-56 w-full rounded-[var(--r-md)] border border-[var(--color-border)]"
          />
          <div className="flex flex-wrap gap-2">
            <a href={mapSearchUrl(where)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary flex-1">
              <ExternalLink size={16} strokeWidth={2} aria-hidden />
              {t("Open in Maps")}
            </a>
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary flex-1">
                <ExternalLink size={16} strokeWidth={2} aria-hidden />
                {t("Website")}
              </a>
            )}
          </div>
        </FormSection>
      )}

      <ActionForm action={update}>
        <FormSection title={t("Details")}>
          <label className="field-label">
            {t("Title")}
            <input name="title" required defaultValue={item.title} className="field" />
          </label>
          <div className="form-grid">
            <label className="field-label">
              {item.kind === "BUDGET" ? t("Amount") : t("Estimate")}
              <input
                name="cost"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                defaultValue={centsToInput(item.costCents)}
                className="field"
                placeholder={t("To confirm")}
              />
            </label>
            <label className="field-label">
              {t("Who")}
              <select name="assignedToId" defaultValue={item.assignedToId ?? ""} className="field">
                <option value="">{t("Anyone")}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {personName(m, t("Member"))}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {item.kind !== "BUDGET" && item.kind !== "SAVE" && (
            <>
              <label className="field-label">
                {t("Real price")}
                <input
                  name="paid"
                  type="text"
                  inputMode="decimal"
                  defaultValue={centsToInput(item.paidCents)}
                  placeholder={t("To confirm")}
                  className="field"
                />
              </label>
              <p className="field-hint mt-0">{t("Put in the real price once it's booked; the trip's totals follow.")}</p>
            </>
          )}
          <div className="form-grid">
            <label className="field-label">
              {t("Date")}
              <input name="date" type="date" defaultValue={toDateInput(item.date)} className="field" />
            </label>
            {item.kind === "STOP" && (
              <label className="field-label">
                {t("Leaving")}
                <input name="endDate" type="date" defaultValue={toDateInput(item.endDate)} className="field" />
              </label>
            )}
          </div>
          <label className="field-label">
            {t("Details")}
            <textarea name="note" rows={4} defaultValue={item.note ?? ""} className="field" />
          </label>
          <label className="field-label">
            {t("Address for the map")}
            <input name="place" defaultValue={item.place ?? ""} className="field" placeholder={where} />
          </label>
          <label className="field-label">
            {t("Website or booking link")}
            <input name="url" type="url" inputMode="url" defaultValue={item.url ?? ""} className="field" placeholder="https://" />
          </label>
          <SubmitButton className="btn btn-primary w-full">{t("Save")}</SubmitButton>
        </FormSection>
      </ActionForm>

      <DangerZone>
        <form action={deleteTripItem}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="back" value="1" />
          <ConfirmButton>
            <Trash2 size={16} strokeWidth={2} aria-hidden />
            {t("Delete")}
          </ConfirmButton>
        </form>
      </DangerZone>
    </div>
  );
}
