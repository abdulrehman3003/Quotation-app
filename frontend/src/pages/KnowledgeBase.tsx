import React, { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { useWorkspaceStore } from '../store/workspaceStore'
import { FileUploader } from '../components/FileUploader'
import {
  Database,
  FileSpreadsheet,
  FileText,
  Trash2,
  Calendar,
  Edit,
  Save,
  Loader2,
  X,
  Plus,
  Trash
} from 'lucide-react'

export const KnowledgeBase: React.FC = () => {
  const { kbFiles, fetchKbFiles, uploadKbFile, deleteKbFile, updateKbFileContent, loadingKb } = useWorkspaceStore()
  const [selectedFile, setSelectedFile] = useState<any | null>(null)
  
  // Table editor state
  const [isEditing, setIsEditing] = useState(false)
  const [parsedRows, setParsedRows] = useState<string[][]>([])
  const [textMode, setTextMode] = useState(false)
  const [rawText, setRawText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchKbFiles()
  }, [fetchKbFiles])

  // Sync selected file changes
  useEffect(() => {
    if (selectedFile) {
      const updated = kbFiles.find(f => f.id === selectedFile.id)
      if (updated) {
        setSelectedFile(updated)
      } else {
        setSelectedFile(null)
        setIsEditing(false)
      }
    }
  }, [kbFiles])

  const getFileIcon = (contentType: string) => {
    if (contentType === 'pdf') return <FileText className="w-5 h-5 text-red-400" />
    return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
  }

  const handleSelectFile = (file: any) => {
    setSelectedFile(file)
    setIsEditing(false)
    
    // Check if it looks like CSV/tabular or PDF/text
    if (file.content_type === 'csv' || file.content_type === 'xlsx') {
      setTextMode(false)
      // Parse CSV simple parser
      const lines = file.parsed_content.split('\n').filter((l: string) => l.trim() !== '')
      const rows = lines.map((line: string) => {
        // Simple comma split that handles quoted commas
        const result = []
        let current = ''
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
          const char = line[i]
          if (char === '"') {
            inQuotes = !inQuotes
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim())
            current = ''
          } else {
            current += char
          }
        }
        result.push(current.trim())
        return result
      })
      setParsedRows(rows)
    } else {
      setTextMode(true)
      setRawText(file.parsed_content)
    }
  }

  const handleCellChange = (rowIndex: number, colIndex: number, val: string) => {
    const updated = [...parsedRows]
    updated[rowIndex][colIndex] = val
    setParsedRows(updated)
  }

  const handleAddRow = () => {
    if (parsedRows.length === 0) {
      setParsedRows([['Item', 'Price', 'Stock', 'Details']])
      return
    }
    const colCount = parsedRows[0].length
    const newRow = Array(colCount).fill('')
    setParsedRows([...parsedRows, newRow])
  }

  const handleAddColumn = () => {
    const colName = window.prompt("Enter new column name:")
    if (!colName) return
    const updated = parsedRows.map((row, idx) => {
      if (idx === 0) return [...row, colName]
      return [...row, '']
    })
    setParsedRows(updated)
  }

  const handleDeleteRow = (rowIndex: number) => {
    if (rowIndex === 0) return // Don't delete header
    const updated = parsedRows.filter((_, idx) => idx !== rowIndex)
    setParsedRows(updated)
  }

  const handleSave = async () => {
    if (!selectedFile) return
    setSaving(true)
    try {
      let updatedContent = ''
      if (textMode) {
        updatedContent = rawText
      } else {
        // Serialize back to CSV format
        updatedContent = parsedRows.map(row => 
          row.map(cell => {
            const clean = cell.replace(/"/g, '""')
            return clean.includes(',') || clean.includes('\n') ? `"${clean}"` : clean
          }).join(',')
        ).join('\n')
      }
      await updateKbFileContent(selectedFile.id, selectedFile.filename, updatedContent)
      setIsEditing(false)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <PageHeader title="Knowledge base" description="Price lists and policies the assistant uses to build quotes." />
      <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left Side: Upload portal */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card p-5">
            <h2 className="section-title">Upload a file</h2>
            <p className="mt-0.5 mb-4 text-xs text-slate-500">CSV, Excel or PDF price sheets.</p>
            <FileUploader onUploadSuccess={uploadKbFile} maxSizeMB={5} />
          </div>

          {/* Active Pricing & Policy Sheets list */}
          <div className="card flex flex-col">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="section-title">Files</h2>
              <span className="text-xs text-slate-500 tabular-nums">{kbFiles.length}</span>
            </div>

            <div className="p-2 space-y-0.5 max-h-[340px] overflow-y-auto">
              {loadingKb && kbFiles.length === 0 ? (
                <div className="py-12 flex justify-center items-center">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                </div>
              ) : kbFiles.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">No files yet. Upload a price sheet to get started.</p>
              ) : (
                kbFiles.map((file) => {
                  const isSelected = selectedFile?.id === file.id
                  return (
                    <div 
                      key={file.id}
                      onClick={() => handleSelectFile(file)}
                      className={`h-10 px-3 rounded-md transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-slate-800 text-slate-50'
                          : 'hover:bg-slate-850 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {getFileIcon(file.content_type)}
                        <span className="text-sm truncate">{file.filename}</span>
                      </div>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (window.confirm(`Delete "${file.filename}"? Quotes will no longer use its prices.`)) {
                            deleteKbFile(file.id)
                          }
                        }}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                        aria-label={`Delete ${file.filename}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Tabular Contents Viewer / Editor */}
        <div className="lg:col-span-2 flex flex-col">
          {selectedFile ? (
            <div className="card flex flex-col min-h-[450px]">
              {/* Header Details */}
              <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-800">
                <div>
                  <h3 className="section-title truncate">{selectedFile.filename}</h3>
                  <span className="text-xs text-slate-500">
                    {textMode ? 'Text document' : `${Math.max(parsedRows.length - 1, 0)} rows`}
                    {' · added '}
                    {new Date(selectedFile.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="btn btn-primary btn-sm"
                      >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save changes
                      </button>
                      
                      <button
                        onClick={() => handleSelectFile(selectedFile)}
                        className="btn btn-secondary btn-sm"
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="btn btn-secondary btn-sm"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {/* Grid / Content Workspace */}
              <div className="flex-1 overflow-auto max-h-[560px] p-5">
                {textMode ? (
                  /* Text/PDF Policy Editor */
                  isEditing ? (
                    <textarea
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      rows={15}
                      className="input font-mono text-xs leading-5"
                    />
                  ) : (
                    <pre className="text-sm text-slate-300 whitespace-pre-wrap leading-6 font-sans">
                      {selectedFile.parsed_content}
                    </pre>
                  )
                ) : (
                  /* Tabular CSV / Sheet Editor */
                  <div className="flex flex-col gap-3">
                    {isEditing && (
                      <div className="flex gap-2">
                        <button
                          onClick={handleAddRow}
                          className="btn btn-secondary btn-sm"
                        >
                          <Plus className="h-3 w-3" />
                          Add row
                        </button>
                        <button
                          onClick={handleAddColumn}
                          className="btn btn-secondary btn-sm"
                        >
                          <Plus className="h-3 w-3" />
                          Add column
                        </button>
                      </div>
                    )}
                    
                    <div className="overflow-x-auto border border-slate-800 rounded-md">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="bg-slate-850 border-b border-slate-800 text-xs text-slate-400 font-medium">
                            {parsedRows.length > 0 && parsedRows[0].map((header, colIdx) => (
                              <th key={colIdx} className="px-3 py-2.5 font-medium whitespace-nowrap">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={header}
                                    onChange={(e) => handleCellChange(0, colIdx, e.target.value)}
                                    className="bg-transparent border-b border-slate-700 focus:border-brand-500 outline-none text-slate-100 font-medium w-full min-w-[80px]"
                                  />
                                ) : (
                                  header
                                )}
                              </th>
                            ))}
                            {isEditing && <th className="px-4 py-3 w-10"></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {parsedRows.slice(1).map((row, rowIdx) => {
                            const actualRowIdx = rowIdx + 1
                            return (
                              <tr key={rowIdx} className="border-b border-slate-800 last:border-b-0 text-slate-300">
                                {row.map((cell, colIdx) => (
                                  <td key={colIdx} className="px-3 py-2">
                                    {isEditing ? (
                                      <input
                                        type="text"
                                        value={cell}
                                        onChange={(e) => handleCellChange(actualRowIdx, colIdx, e.target.value)}
                                        className="bg-slate-950 border border-slate-800 focus:border-brand-500 outline-none px-2 py-1 rounded text-slate-100 w-full min-w-[80px]"
                                      />
                                    ) : (
                                      cell
                                    )}
                                  </td>
                                ))}
                                {isEditing && (
                                  <td className="px-4 py-2.5 text-center">
                                    <button
                                      onClick={() => handleDeleteRow(actualRowIdx)}
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer" aria-label="Delete row"
                                    >
                                      <Trash className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card min-h-[450px] flex items-center justify-center">
              <EmptyState
                icon={FileSpreadsheet}
                title="Select a file"
                description="Choose a file on the left to review its contents or correct a price."
              />
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
export default KnowledgeBase
