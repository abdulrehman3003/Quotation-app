import React, { useState, useRef } from 'react'
import { Upload, FileText, CheckCircle, AlertTriangle } from 'lucide-react'

interface FileUploaderProps {
  onUploadSuccess: (file: File) => Promise<void>
  maxSizeMB?: number
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onUploadSuccess, maxSizeMB = 5 }) => {
  const [isDragActive, setIsDragActive] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const allowedExtensions = ['.csv', '.xlsx', '.xls', '.pdf']

  const validateAndUpload = async (file: File) => {
    setErrorMsg(null)
    setSuccessMsg(null)

    // Check extension
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
    if (!allowedExtensions.includes(ext)) {
      setErrorMsg(`Unsupported file type. Only CSV, Excel, and PDF files are allowed.`)
      return
    }

    // Check size
    const maxSizeBytes = maxSizeMB * 1024 * 1024
    if (file.size > maxSizeBytes) {
      setErrorMsg(`File is too large. Max size is ${maxSizeMB}MB.`)
      return
    }

    setIsUploading(true)
    try {
      await onUploadSuccess(file)
      setSuccessMsg(`Successfully uploaded and parsed: ${file.name}`)
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to upload and process file')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true)
    } else if (e.type === 'dragleave') {
      setIsDragActive(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await validateAndUpload(e.dataTransfer.files[0])
    }
  }

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (e.target.files && e.target.files[0]) {
      await validateAndUpload(e.target.files[0])
    }
  }

  const onButtonClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="w-full">
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={onButtonClick}
        className={`w-full min-h-[180px] p-6 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ${
          isDragActive
            ? 'border-brand-500 bg-brand-500/5 shadow-glow-smScaleScale scale-98'
            : 'border-slate-800 bg-slate-900/20 hover:border-slate-700 hover:bg-slate-900/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={allowedExtensions.join(',')}
          onChange={handleChange}
          disabled={isUploading}
        />
        
        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium text-slate-300">Processing Knowledge Base Sheet...</p>
            <p className="text-xs text-slate-500">FastAPI is parsing spreadsheets/PDF data...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-slate-800/80 flex items-center justify-center border border-slate-700/50">
              <Upload className="w-6 h-6 text-brand-400 animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200">
                Drag and drop pricing sheets here, or <span className="text-brand-400">browse</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Supports CSV, XLSX, XLS, PDF (Max {maxSizeMB}MB)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Alert Feedbacks */}
      {errorMsg && (
        <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fadeIn">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      
      {successMsg && (
        <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm animate-fadeIn">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
    </div>
  )
}
