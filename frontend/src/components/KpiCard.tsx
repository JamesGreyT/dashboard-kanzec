import { CardContent } from '@/components/ui/card'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface Props {
  label: string
  value: string | number
  sub?: string
  icon?: LucideIcon
  loading?: boolean
  color?: string
  delay?: number
}

function AnimatedValue({ value }: { value: string | number }) {
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 100)
    return () => clearTimeout(timer)
  }, [value])

  if (!show) return <p ref={ref} className="text-2xl font-bold h-8" />

  return (
    <p ref={ref} className="text-2xl font-bold animate-count-up" style={{ fontFamily: "'DM Sans', system-ui", fontVariantNumeric: 'tabular-nums' }}>
      {value}
    </p>
  )
}

export default function KpiCard({ label, value, sub, icon: Icon, loading, color = 'text-primary', delay = 0 }: Props) {
  if (loading) return (
    <div className="glass-card rounded-xl">
      <CardContent className="p-4 space-y-2">
        <div className="shimmer-skeleton h-4 w-24" />
        <div className="shimmer-skeleton h-8 w-32" />
        <div className="shimmer-skeleton h-3 w-20" />
      </CardContent>
    </div>
  )

  return (
    <div
      className={`glass-card kpi-glow rounded-xl animate-fade-up animate-fade-up-delay-${Math.min(delay, 6)}`}
      style={{ '--glow-color': color.includes('green') ? '#34D399' : color.includes('amber') || color.includes('gold') ? '#D4A843' : color.includes('red') ? '#F87171' : color.includes('blue') ? '#60A5FA' : color.includes('purple') ? '#A78BFA' : color.includes('pink') ? '#F472B6' : color.includes('emerald') ? '#34D399' : '#D4A843' } as React.CSSProperties}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em]" style={{ fontFamily: "'DM Sans', system-ui" }}>{label}</p>
          {Icon && (
            <div className="p-1.5 rounded-md bg-accent/50">
              <Icon size={13} className={color} />
            </div>
          )}
        </div>
        <div className={color}>
          <AnimatedValue value={value} />
        </div>
        {sub && <p className="text-[10px] text-muted-foreground mt-1.5 tracking-wide">{sub}</p>}
      </CardContent>
    </div>
  )
}
