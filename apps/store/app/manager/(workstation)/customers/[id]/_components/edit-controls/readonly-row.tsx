interface Props {
  label: string;
  value: React.ReactNode;
  hint?: string;
}

export function ReadonlyRow({ label, value, hint }: Props) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <dt className="w-44 shrink-0 pt-1.5 text-gray-500" title={hint}>
        {label}:
      </dt>
      <dd className="min-w-0 flex-1 pt-1.5 font-medium text-gray-700">
        {value}
      </dd>
    </div>
  );
}
