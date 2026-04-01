type BusyOverlayProps = {
  title: string;
  message: string;
  caption?: string;
};

export function BusyOverlay({ title, message, caption }: BusyOverlayProps) {
  return (
    <div className="busy-overlay" role="alert" aria-live="assertive" aria-busy="true">
      <div className="busy-overlay__backdrop" aria-hidden="true" />

      <div className="busy-overlay__panel">
        <div className="busy-overlay__orb busy-overlay__orb--one" aria-hidden="true" />
        <div className="busy-overlay__orb busy-overlay__orb--two" aria-hidden="true" />

        <div className="busy-overlay__loader" aria-hidden="true">
          <span className="busy-overlay__cube busy-overlay__cube--anchor" />
          <span className="busy-overlay__cube busy-overlay__cube--one" />
          <span className="busy-overlay__cube busy-overlay__cube--two" />
          <span className="busy-overlay__cube busy-overlay__cube--three" />
          <span className="busy-overlay__cube busy-overlay__cube--four" />
        </div>

        <div className="busy-overlay__copy">
          {caption ? <span className="busy-overlay__caption">{caption}</span> : null}
          <strong>{title}</strong>
          <p>{message}</p>
        </div>

        <div className="busy-overlay__progress" aria-hidden="true">
          <span className="busy-overlay__progress-track" />
        </div>
      </div>
    </div>
  );
}
