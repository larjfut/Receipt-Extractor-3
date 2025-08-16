import React, { createContext, useContext, useState } from 'react'

const Ctx = createContext(null)
export const useReceipt = () => useContext(Ctx)

export function ReceiptProvider({ children }) {
  const [files, setFiles] = useState([])
  const [fields, setFields] = useState({})
  const [signatureDataUrl, setSignatureDataUrl] = useState(null)
  const [batchId, setBatchId] = useState(null)

  return (
    <Ctx.Provider value={{ files, setFiles, fields, setFields, signatureDataUrl, setSignatureDataUrl, batchId, setBatchId }}>
      {children}
    </Ctx.Provider>
  )
}
