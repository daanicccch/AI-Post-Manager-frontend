import { useEffect, useMemo, useRef, useState } from 'react';

type SelectOption = {
  value: string;
  label: string;
};

type SelectFieldProps = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function SelectField({
  label,
  value,
  options,
  onChange,
  disabled = false
}: SelectFieldProps) {
  const rootRef = useRef<HTMLLabelElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? options[0] ?? null,
    [options, value]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <label className="select-field select-field--custom" ref={rootRef}>
      <span>{label}</span>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={`select-field__trigger${isOpen ? ' select-field__trigger--open' : ''}`}
        disabled={disabled}
        type="button"
        onClick={() => {
          if (!disabled) {
            setIsOpen((current) => !current);
          }
        }}
      >
        <span>{selectedOption?.label ?? ''}</span>
      </button>

      {isOpen && !disabled ? (
        <div className="select-field__menu" role="listbox" aria-label={label}>
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                aria-selected={isSelected}
                className={`select-field__option${isSelected ? ' select-field__option--active' : ''}`}
                key={option.value}
                role="option"
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </label>
  );
}
