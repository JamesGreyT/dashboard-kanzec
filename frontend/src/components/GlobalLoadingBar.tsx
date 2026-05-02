import { useIsFetching } from '@tanstack/react-query'

export default function GlobalLoadingBar() {
  const isFetching = useIsFetching()

  if (!isFetching) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-primary/20 overflow-hidden" role="progressbar" aria-label="Loading data">
      <div
        className="h-full bg-primary rounded-full"
        style={{
          width: '30%',
          animation: 'loadingBar 1.5s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes loadingBar {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(200%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  )
}
