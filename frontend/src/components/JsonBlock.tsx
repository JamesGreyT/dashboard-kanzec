export default function JsonBlock({ value }: { value: unknown }) {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <pre className="font-mono text-xs text-foreground bg-muted p-4 rounded-md overflow-auto whitespace-pre-wrap border">
      {text}
    </pre>
  );
}
