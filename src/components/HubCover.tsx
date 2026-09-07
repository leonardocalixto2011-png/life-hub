/**
 * The hub's shared cover — the same image for everyone in the hub.
 *
 * Falls back to a gradient built from the hub's own colour rather than an
 * empty grey box, so a hub without a photo still reads as *that* hub. The
 * fallback is deliberately good enough to leave alone: setting a photo should
 * feel like a nice thing to do, not a chore to fix an ugly placeholder.
 */
export function HubCover({
  name,
  color,
  imageUrl,
  by,
  height = "h-28",
  showName = true,
}: {
  name: string;
  color: string;
  imageUrl?: string | null;
  /** Display name of whoever set the photo, for the "shared by" credit. */
  by?: string | null;
  height?: string;
  showName?: boolean;
}) {
  return (
    <div className={`relative w-full overflow-hidden ${height}`}>
      {imageUrl ? (
        // Plain <img>: these are arbitrary user photos on a Blob host, and
        // next/image would proxy every one through the optimizer for no gain
        // on a decorative banner.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${color} 0%, color-mix(in oklab, ${color}, #000 45%) 100%)`,
          }}
        />
      )}

      {/* Scrim under the text only, not the whole image — a full overlay
          would mute a photo someone chose on purpose. */}
      <div
        className="absolute inset-x-0 bottom-0 h-2/3"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,.55), transparent)" }}
        aria-hidden
      />

      {showName && (
        <span className="display absolute bottom-2.5 left-3.5 z-10 text-lg text-white drop-shadow">
          {name}
        </span>
      )}
      {by && (
        <span className="absolute bottom-3 right-3 z-10 text-[0.62rem] font-semibold text-white/85">
          shared by {by}
        </span>
      )}
    </div>
  );
}
