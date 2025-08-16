import React, { useState } from 'react'
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

      setFiles(fileArray)
      setBusy(true)
      setError('')

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

        setFields(res.data.fields || {})
        setBatchId(res.data.batchId || null)
        navigate('/review')
      } catch (err) {
        console.error('Upload error:', err)

        // Handle different error types
        if (err.code === 'ECONNABORTED') {
          setError('Upload timed out. Please try again with smaller files.')
        } else if (err.response?.status === 413) {
          setError('Files too large. Please reduce file size and try again.')
        } else if (err.response?.status === 400) {
          setError(err.response.data?.message || 'Invalid files selected.')
        } else if (err.response?.status === 429) {
          setError(
            'Too many upload attempts. Please wait a few minutes and try again.',
          )
        } else {
          setError(
            err?.response?.data?.message ||
              err.message ||
              'Upload failed. Please try again.',
          )
        }
      }
    } catch (validationError) {
      setError(validationError.message)
      setValidationInfo(null)
      // Clear the file input
      e.target.value = ''
    } finally {
      setBusy(false)
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
        <div
          style={{
            padding: '12px',
            backgroundColor: '#e8f5e8',
            border: '1px solid #4caf50',
            borderRadius: '4px',
            marginBottom: '16px',
          }}
        >
          <strong>✓ Files validated successfully</strong>
          <div style={{ fontSize: '14px', marginTop: '8px' }}>
            {validationInfo.count} file(s) selected • Total size:{' '}
            {validationInfo.totalSize}
          </div>
          <details style={{ marginTop: '8px' }}>
            <summary style={{ cursor: 'pointer', fontSize: '14px' }}>
              File details
            </summary>
            <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
              {validationInfo.files.map((file, idx) => (
                <li key={idx} style={{ fontSize: '12px', marginBottom: '4px' }}>
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
            padding: '12px',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '4px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '16px',
                height: '16px',
                border: '2px solid #ffc107',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            ></div>
            <span>Processing files and extracting data...</span>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div
          style={{
            padding: '12px',
            backgroundColor: '#f8d7da',
            border: '1px solid #dc3545',
            borderRadius: '4px',
            marginBottom: '16px',
          }}
        >
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
