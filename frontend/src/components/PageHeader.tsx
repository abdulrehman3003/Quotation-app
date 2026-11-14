import React from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
}

// Single header used by every page so titles, spacing and actions line up.
export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, actions }) => (
  <header className="page-header">
    <div className="min-w-0">
      <h1 className="page-title truncate">{title}</h1>
      {description && <p className="page-subtitle truncate">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </header>
)

export default PageHeader
