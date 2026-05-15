"use client";

interface Props {
  label: string;
  // 3-state: undefined = "не фільтрувати", true/false = exact.
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
}

export function BoolFilter({ label, value, onChange }: Props) {
  return (
    <fieldset className="block">
      <legend className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </legend>
      <div className="flex gap-2 text-sm">
        <Btn active={value === undefined} onClick={() => onChange(undefined)}>
          Усі
        </Btn>
        <Btn active={value === true} onClick={() => onChange(true)}>
          Так
        </Btn>
        <Btn active={value === false} onClick={() => onChange(false)}>
          Ні
        </Btn>
      </div>
    </fieldset>
  );
}

function Btn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-md bg-gray-900 px-3 py-1.5 text-white"
          : "rounded-md border bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-50"
      }
    >
      {children}
    </button>
  );
}
