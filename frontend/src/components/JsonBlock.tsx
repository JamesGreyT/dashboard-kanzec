export default function JsonBlock({ value }: { value: unknown }) {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <pre className="font-mono text-xs text-ink bg-paper border border-line p-4 rounded-xl overflow-auto whitespace-pre-wrap">
      {text}
    </pre>
  );
}
