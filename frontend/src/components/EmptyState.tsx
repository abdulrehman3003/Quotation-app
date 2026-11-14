import React from 'react'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, action, className = '' }) => (
  <div className={`flex flex-col items-center justify-center text-center px-6 py-12 ${className}`}>
    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400">
      <Icon className="h-5 w-5" strokeWidth={1.75} />
    </div>
    <p className="mt-3 text-sm font-medium text-slate-200">{title}</p>
    {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
)

export default EmptyState
