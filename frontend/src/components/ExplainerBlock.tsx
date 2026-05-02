import { useState } from 'react'
import { Info, Calculator, ChevronDown } from 'lucide-react'

export type ExplainerSection = {
  title: string
  icon?: React.ElementType
  items: string[]
}

export default function ExplainerBlock({ sections }: { sections: ExplainerSection[] }) {
  const [open, setOpen] = useState(false)
  if (!sections.length) return null
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-controls="explainer-content"
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-accent/30 transition-colors cursor-pointer">
        <div className="p-1.5 rounded-lg bg-[#D4A843]/10 text-[#D4A843] shrink-0"><Info size={13} /></div>
        <span className="text-xs font-semibold text-foreground flex-1">{sections[0].title}</span>
        <ChevronDown size={14} className={`text-muted-foreground transition-transform duration-300 shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id="explainer-content" className={`grid transition-all duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="px-4 pb-4 space-y-4">
            {sections.map((section, idx) => {
              const Icon = section.icon ?? (idx === 0 ? Info : Calculator)
              return (
                <div key={idx} className={idx > 0 ? 'pt-3 border-t border-border/40' : ''}>
                  {idx > 0 && (
                    <div className="flex items-center gap-2 mb-2">
                      <Icon size={12} className="text-[#D4A843] shrink-0" />
                      <p className="text-[11px] font-semibold text-foreground">{section.title}</p>
                    </div>
                  )}
                  <ul className="space-y-1.5">
                    {section.items.map((item, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-2">
                        <span className="text-[#D4A843] mt-0.5 shrink-0">•</span>
                        <span dangerouslySetInnerHTML={{ __html: item }} />
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
