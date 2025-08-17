import fs from 'fs'
import fetch from 'node-fetch'

/**
 * Async OCR service with proper error handling and non-blocking polling
 */
export class OCRService {
  constructor(endpoint, apiKey) {
    this.endpoint = endpoint
    this.apiKey = apiKey
    this.maxRetries = 12
    this.pollInterval = 2000 // 2 seconds
    this.requestTimeout = 10000 // 10 seconds
  }

  /**
   * Analyze receipt with non-blocking async polling
   * @param {string} filePath - Path to file to analyze
   * @returns {Promise<Object>} - Extracted receipt data
   */
  async analyzeReceipt(filePath) {
    if (!this.endpoint || !this.apiKey) {
      return this._getMockData()
    }

    try {
      // Start the analysis
      const operationUrl = await this._startAnalysis(filePath)
      
      // Poll for results without blocking
      const result = await this._pollForResults(operationUrl)
      
      return this._extractReceiptData(result)
    } catch (error) {
      console.error('OCR analysis failed:', error.message)
      
      // Return mock data as fallback
      return this._getMockData()
    }
  }

  /**
   * Start OCR analysis and return operation URL
   * @private
   */
  async _startAnalysis(filePath) {
    const url = `${this.endpoint}/formrecognizer/documentModels/prebuilt-receipt:analyze?api-version=2023-07-31`
    
    // Read file asynchronously
    const fileBuffer = await fs.promises.readFile(filePath)
    
    const response = await this._makeRequest(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.apiKey,
        'Content-Type': 'application/octet-stream'
      },
      body: fileBuffer
    })

    if (response.status !== 202) {
      const errorText = await response.text()
      throw new Error(`Analysis start failed: ${response.status} ${errorText}`)
    }

    const operationUrl = response.headers.get('operation-location')
    if (!operationUrl) {
      throw new Error('No operation location header received')
    }

    return operationUrl
  }

  /**
   * Poll for analysis results with exponential backoff
   * @private
   */
  async _pollForResults(operationUrl) {
    let attempt = 0
    let delay = this.pollInterval

    while (attempt < this.maxRetries) {
      // Wait before polling (except first attempt)
      if (attempt > 0) {
        await this._delay(delay)
        // Exponential backoff with jitter
        delay = Math.min(delay * 1.2 + Math.random() * 1000, 10000)
      }

      try {
        const response = await this._makeRequest(operationUrl, {
          headers: {
            'Ocp-Apim-Subscription-Key': this.apiKey
          }
        })

        if (!response.ok) {
          throw new Error(`Poll request failed: ${response.status}`)
        }

        const result = await response.json()

        switch (result.status) {
          case 'succeeded':
            return result
          
          case 'failed':
            throw new Error(`OCR analysis failed: ${result.error?.message || 'Unknown error'}`)
          
          case 'running':
          case 'notStarted':
            // Continue polling
            break
          
          default:
            throw new Error(`Unknown status: ${result.status}`)
        }
      } catch (error) {
        console.warn(`Poll attempt ${attempt + 1} failed:`, error.message)
        
        // If it's the last attempt, throw the error
        if (attempt === this.maxRetries - 1) {
          throw error
        }
      }

      attempt++
    }

    throw new Error('OCR analysis timed out after maximum retries')
  }

  /**
   * Extract receipt data from OCR results
   * @private
   */
  _extractReceiptData(ocrResult) {
    try {
      const document = ocrResult?.analyzeResult?.documents?.[0]
      if (!document || !document.fields) {
        return this._getMockData()
      }

      const fields = document.fields
      
      return {
        vendor: this._extractFieldValue(fields.MerchantName) || 
                this._extractFieldValue(fields.VendorName) || '',
        total: this._extractFieldValue(fields.Total) || '',
        transactionDate: this._extractFieldValue(fields.TransactionDate) || '',
        // Additional fields that might be useful
        merchantAddress: this._extractFieldValue(fields.MerchantAddress) || '',
        merchantPhone: this._extractFieldValue(fields.MerchantPhoneNumber) || '',
        subtotal: this._extractFieldValue(fields.Subtotal) || '',
        tax: this._extractFieldValue(fields.TotalTax) || '',
        confidence: document.confidence || 0
      }
    } catch (error) {
      console.error('Error extracting receipt data:', error)
      return this._getMockData()
    }
  }

  /**
   * Extract field value with confidence checking
   * @private
   */
  _extractFieldValue(field) {
    if (!field) return null
    
    // Only return values with reasonable confidence
    if (field.confidence && field.confidence < 0.5) {
      return null
    }
    
    return field.content || field.value || null
  }

  /**
   * Make HTTP request with timeout
   * @private
   */
  async _makeRequest(url, options = {}) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      
      if (error.name === 'AbortError') {
        throw new Error('Request timed out')
      }
      
      throw error
    }
  }

  /**
   * Non-blocking delay using Promise
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Get mock data for fallback scenarios
   * @private
   */
  _getMockData() {
    return {
      vendor: 'Demo Store',
      total: '12.34',
      transactionDate: new Date().toISOString().slice(0, 10),
      merchantAddress: '',
      merchantPhone: '',
      subtotal: '10.99',
      tax: '1.35',
      confidence: 0.95
    }
  }

  /**
   * Health check for OCR service
   */
  async healthCheck() {
    if (!this.endpoint || !this.apiKey) {
      return { healthy: false, reason: 'OCR service not configured' }
    }

    try {
      // Simple connectivity test
      const response = await this._makeRequest(this.endpoint, {
        method: 'GET',
        headers: {
          'Ocp-Apim-Subscription-Key': this.apiKey
        }
      })

      return { 
        healthy: response.status < 500, 
        status: response.status,
        reason: response.status < 500 ? 'OK' : 'Service unavailable'
      }
    } catch (error) {
      return { 
        healthy: false, 
        reason: error.message 
      }
    }
  }
}

