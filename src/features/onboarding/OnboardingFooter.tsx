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
        {'<'}
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
