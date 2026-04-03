type OnboardingFooterProps = {
  backLabel: string;
  continueLabel: string;
  onBack: () => void;
  onContinue: () => void;
  continueDisabled?: boolean;
  backDisabled?: boolean;
};

export function OnboardingFooter({
  backLabel,
  continueLabel,
  onBack,
  onContinue,
  continueDisabled = false,
  backDisabled = false,
}: OnboardingFooterProps) {
  return (
    <div className="setup-footer">
      <button
        aria-label={backLabel}
        className="setup-footer__back"
        disabled={backDisabled}
        type="button"
        onClick={onBack}
      >
        <span className="setup-footer__back-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M14.5 6.5 9 12l5.5 5.5" />
          </svg>
        </span>
      </button>
      <button
        className="setup-footer__continue"
        disabled={continueDisabled}
        type="button"
        onClick={onContinue}
      >
        {continueLabel}
      </button>
    </div>
  );
}
