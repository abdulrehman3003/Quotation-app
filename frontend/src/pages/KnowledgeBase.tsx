import React, { useEffect, useState } from 'react'
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
    <div className="flex-1 p-8 overflow-y-auto bg-slate-950 text-slate-100">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold font-outfit text-white tracking-tight flex items-center gap-2">
          <Database className="h-8 w-8 text-indigo-400" />
          Active Knowledge Base
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Upload pricing lists, inventory sheets, templates and standard guidelines. Edit pricing sheet details inline to keep calculations aligned.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Upload portal */}
        <div className="lg:col-span-1 space-y-8">
          <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 glass-panel">
            <h2 className="text-lg font-bold font-outfit text-white mb-4 flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-400" />
              Upload Portal
            </h2>
            <FileUploader onUploadSuccess={uploadKbFile} maxSizeMB={5} />
          </div>

          {/* Active Pricing & Policy Sheets list */}
          <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 glass-panel flex flex-col">
            <h2 className="text-lg font-bold font-outfit text-white mb-4">Active Files</h2>
            
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {loadingKb && kbFiles.length === 0 ? (
                <div className="py-12 flex justify-center items-center">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                </div>
              ) : kbFiles.length === 0 ? (
                <p className="text-xs text-slate-500 italic text-center py-8">No files uploaded yet.</p>
              ) : (
                kbFiles.map((file) => {
                  const isSelected = selectedFile?.id === file.id
                  return (
                    <div 
                      key={file.id}
                      onClick={() => handleSelectFile(file)}
                      className={`p-3 rounded-lg border transition-all duration-200 cursor-pointer flex items-center justify-between ${
                        isSelected 
                          ? 'bg-indigo-600/10 border-indigo-500 text-white' 
                          : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {getFileIcon(file.content_type)}
                        <span className="text-xs font-semibold truncate max-w-[150px]">{file.filename}</span>
                      </div>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteKbFile(file.id)
                        }}
                        className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded transition-all"
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
            <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 glass-panel flex flex-col h-full min-h-[450px]">
              {/* Header Details */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                <div>
                  <h3 className="font-bold text-white text-base">{selectedFile.filename}</h3>
                  <span className="text-[10px] text-slate-500 font-mono">ID: {selectedFile.id}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                      >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save Changes
                      </button>
                      
                      <button
                        onClick={() => handleSelectFile(selectedFile)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      Edit File Content
                    </button>
                  )}
                </div>
              </div>

              {/* Grid / Content Workspace */}
              <div className="flex-1 overflow-auto max-h-[500px]">
                {textMode ? (
                  /* Text/PDF Policy Editor */
                  isEditing ? (
                    <textarea
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      rows={15}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-slate-200 outline-none focus:border-slate-700"
                    />
                  ) : (
                    <pre className="bg-slate-950/40 p-4 rounded-lg border border-slate-800/60 text-xs font-mono text-slate-400 whitespace-pre-wrap leading-relaxed">
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
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-all"
                        >
                          <Plus className="h-3 w-3" />
                          Add Row
                        </button>
                        <button
                          onClick={handleAddColumn}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-all"
                        >
                          <Plus className="h-3 w-3" />
                          Add Column
                        </button>
                      </div>
                    )}
                    
                    <div className="overflow-x-auto border border-slate-800/80 rounded-lg">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-semibold uppercase">
                            {parsedRows.length > 0 && parsedRows[0].map((header, colIdx) => (
                              <th key={colIdx} className="px-4 py-3 border-r border-slate-800 last:border-r-0">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={header}
                                    onChange={(e) => handleCellChange(0, colIdx, e.target.value)}
                                    className="bg-transparent border-b border-transparent focus:border-slate-600 outline-none text-white font-bold w-full"
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
                              <tr key={rowIdx} className="border-b border-slate-800/60 hover:bg-slate-900/10">
                                {row.map((cell, colIdx) => (
                                  <td key={colIdx} className="px-4 py-2.5 border-r border-slate-800/40 last:border-r-0">
                                    {isEditing ? (
                                      <input
                                        type="text"
                                        value={cell}
                                        onChange={(e) => handleCellChange(actualRowIdx, colIdx, e.target.value)}
                                        className="bg-transparent outline-none focus:bg-slate-950/60 px-1 py-0.5 rounded text-slate-200 w-full focus:ring-1 focus:ring-indigo-500/50"
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
                                      className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-slate-850 transition-all"
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
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-center p-6 border border-slate-800/80 rounded-xl bg-slate-900/10">
              <FileSpreadsheet className="h-10 w-10 mb-3 text-slate-700" />
              <h3 className="text-sm font-bold text-slate-400">Inspect & Customize Sheets</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Select one of your active Knowledge Base files on the left to view data tables, edit prices, update templates, or manage inventory inline.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
export default KnowledgeBase
