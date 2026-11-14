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
        className={`w-full min-h-[160px] p-5 rounded-md border border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-brand-500 bg-brand-500/5'
            : 'border-slate-700 bg-slate-950 hover:border-slate-600'
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
            <div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium text-slate-300">Uploading and reading file</p>
            <p className="text-xs text-slate-500">This can take a few seconds.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center border border-slate-800">
              <Upload className="w-5 h-5 text-slate-400" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">
                Drop a file here or <span className="text-brand-300 underline underline-offset-2">browse</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                CSV, XLSX, XLS or PDF, up to {maxSizeMB} MB
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Alert Feedbacks */}
      {errorMsg && (
        <div className="alert alert-error mt-3" role="alert">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      
      {successMsg && (
        <div className="alert alert-success mt-3" role="status">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
    </div>
  )
}
