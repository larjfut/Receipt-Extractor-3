import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { useReceipt } from '../receiptContext.jsx'
import { getToken } from '../msal.js'
import { useNavigate } from 'react-router-dom'

// File validation constants (must match server)
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/pdf',
]
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_FILES = 5

/**
 * Validate selected files before upload
 * @param {FileList} files - Files selected by user
 * @throws {Error} - If validation fails
 */
function validateFiles(files) {
  const fileArray = Array.from(files)

  // Check file count
  if (fileArray.length > MAX_FILES) {
    throw new Error(`Too many files selected. Maximum is ${MAX_FILES} files.`)
  }

  if (fileArray.length === 0) {
    throw new Error('Please select at least one file.')
  }

  // Validate each file
  for (const file of fileArray) {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
      const maxSizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)
      throw new Error(
        `File "${file.name}" is too large (${sizeMB}MB). Maximum size is ${maxSizeMB}MB.`,
      )
    }

    // Check file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error(
        `File "${file.name}" has an unsupported type (${file.type}). Allowed types: JPG, PNG, GIF, PDF.`,
      )
    }

    // Check for empty files
    if (file.size === 0) {
      throw new Error(`File "${file.name}" is empty.`)
    }

    // Basic filename validation (prevent obviously malicious names)
    const filename = file.name
    if (
      filename.includes('../') ||
      filename.includes('..\\') ||
      filename.startsWith('.')
    ) {
      throw new Error(`File "${filename}" has an invalid name.`)
    }
  }
}

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted size string
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function UploadPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [validationInfo, setValidationInfo] = useState(null)
  const { setFiles, setFields, setBatchId } = useReceipt()
  const navigate = useNavigate()

  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const safeSetBusy = value => {
    if (mountedRef.current) setBusy(value)
  }
  const safeSetError = value => {
    if (mountedRef.current) setError(value)
  }
  const safeSetFiles = value => {
    if (mountedRef.current) setFiles(value)
  }
  const safeSetFields = value => {
    if (mountedRef.current) setFields(value)
  }
  const safeSetBatchId = value => {
    if (mountedRef.current) setBatchId(value)
  }

  async function onSelect(e) {
    const selectedFiles = e.target.files
    if (!selectedFiles || selectedFiles.length === 0) {
      setValidationInfo(null)
      return
    }

    try {
      // Client-side validation
      validateFiles(selectedFiles)

      // Show validation info
      const fileArray = Array.from(selectedFiles)
      const totalSize = fileArray.reduce((sum, file) => sum + file.size, 0)
      setValidationInfo({
        count: fileArray.length,
        totalSize: formatFileSize(totalSize),
        files: fileArray.map((f) => ({
          name: f.name,
          size: formatFileSize(f.size),
          type: f.type,
        })),
      })

      safeSetFiles(fileArray)
      safeSetBusy(true)
      safeSetError('')

      try {
        const token = await getToken()
        const formData = new FormData()
        fileArray.forEach((f) => formData.append('files', f, f.name))

        const res = await axios.post('/api/upload', formData, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
          timeout: 30000, // 30 second timeout
        })

        safeSetFields(res.data.fields || {})
        safeSetBatchId(res.data.batchId || null)
        navigate('/review')
      } catch (err) {
        console.error('Upload error:', err)

        // Handle different error types
        if (err.code === 'ECONNABORTED') {
          safeSetError('Upload timed out. Please try again with smaller files.')
        } else if (err.response?.status === 413) {
          safeSetError('Files too large. Please reduce file size and try again.')
        } else if (err.response?.status === 400) {
          safeSetError(err.response.data?.message || 'Invalid files selected.')
        } else if (err.response?.status === 429) {
          safeSetError(
            'Too many upload attempts. Please wait a few minutes and try again.',
          )
        } else {
          safeSetError(
            err?.response?.data?.message ||
              err.message ||
              'Upload failed. Please try again.',
          )
        }
      }
    } catch (validationError) {
      safeSetError(validationError.message)
      setValidationInfo(null)
      // Clear the file input
      e.target.value = ''
    } finally {
      safeSetBusy(false)
    }
  }

  return (
    <div>
      <h2>Upload Receipts</h2>

      <div style={{ marginBottom: '16px' }}>
        <input
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/gif,application/pdf"
          multiple
          onChange={onSelect}
          disabled={busy}
          style={{
            padding: '8px',
            border: '2px dashed #ccc',
            borderRadius: '4px',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        />
        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
          Supported: JPG, PNG, GIF, PDF • Max {MAX_FILES} files • Max{' '}
          {MAX_FILE_SIZE / (1024 * 1024)}MB per file
        </div>
      </div>

      {/* Validation info display */}
      {validationInfo && !busy && (
        <div className='bg-green-600 text-white p-4 rounded-lg mb-4'>
          <strong>✓ Files validated successfully</strong>
          <div className='text-sm mt-2'>
            {validationInfo.count} file(s) selected • Total size {validationInfo.totalSize}
          </div>
          <details className='mt-2 text-sm'>
            <summary className='cursor-pointer'>File details</summary>
            <ul className='mt-2 list-disc pl-5'>
              {validationInfo.files.map((file, idx) => (
                <li key={idx} className='text-xs mb-1'>
                  <strong>{file.name}</strong> ({file.size}, {file.type})
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {/* Processing indicator */}
      {busy && (
        <div
          style={{
            padding: '16px',
            backgroundColor: '#e3f2fd',
            border: '1px solid #2196f3',
            borderRadius: '4px',
            marginBottom: '16px',
            textAlign: 'center'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px'
            }}
          >
            <div
              style={{
                width: '20px',
                height: '20px',
                border: '3px solid #2196f3',
                borderTop: '3px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            ></div>
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                Processing Receipt
              </div>
              <div style={{ fontSize: '14px', color: '#666' }}>
                Extracting data with OCR technology...
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className='bg-red-600 text-white p-4 rounded-lg mb-4'>
          <strong>❌ Error:</strong> {error}
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
