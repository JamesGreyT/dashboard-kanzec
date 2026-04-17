export default function JsonBlock({ value }: { value: unknown }) {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <pre className="mono text-mono-sm text-ink bg-paper-2 p-4 rounded-[8px] overflow-auto whitespace-pre-wrap">
      {text}
    </pre>
  );
}
