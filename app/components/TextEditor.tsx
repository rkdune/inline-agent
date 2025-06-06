'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'

interface ParadigmTrigger {
  position: number
  text: string
  isActive: boolean
  isProcessing?: boolean
}

export default function TextEditor() {
  const [content, setContent] = useState('')
  const [triggers, setTriggers] = useState<ParadigmTrigger[]>([])
  const editorRef = useRef<HTMLDivElement>(null)
  const [isTyping, setIsTyping] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Detect @Paradigm triggers in the text
  const detectTriggers = useCallback((text: string): ParadigmTrigger[] => {
    const paradigmRegex = /@paradigm/gi
    const detectedTriggers: ParadigmTrigger[] = []
    let match

    while ((match = paradigmRegex.exec(text)) !== null) {
      detectedTriggers.push({
        position: match.index,
        text: match[0],
        isActive: true,
        isProcessing: false
      })
    }

    return detectedTriggers
  }, [])

  // Simple context extraction - just get surrounding text
  const extractContext = useCallback((text: string, triggerPosition: number): string => {
    // Get about 500 characters before and after the trigger for context
    const start = Math.max(0, triggerPosition - 500)
    const end = Math.min(text.length, triggerPosition + 500)
    return text.slice(start, end)
  }, [])

  // Call AI research API
  const researchContext = useCallback(async (context: string): Promise<string> => {
    const response = await fetch('/api/research', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ context }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Research request failed')
    }

    const data = await response.json()
    return data.result
  }, [])

  // Process @Paradigm trigger with AI (by trigger object directly)
  const processTriggerDirect = useCallback(async (targetTrigger: ParadigmTrigger) => {
    try {
      setIsProcessing(true)
      setError(null)

      // Extract context around the trigger
      const context = extractContext(content, targetTrigger.position)
      
      // Get AI research result
      const result = await researchContext(context)
      
      // Replace @Paradigm with the result
      const beforeTrigger = content.slice(0, targetTrigger.position)
      const afterTrigger = content.slice(targetTrigger.position + targetTrigger.text.length)
      const newContent = beforeTrigger + result + afterTrigger

      setContent(newContent)
      
      // Update editor content and cursor position
      if (editorRef.current) {
        // Save cursor position relative to the replacement
        const newCursorPosition = targetTrigger.position + result.length
        
        // Update the content
        editorRef.current.textContent = newContent
        
        // Restore cursor position
        const range = document.createRange()
        const selection = window.getSelection()
        
        // Find the correct text node and position
        const textNode = editorRef.current.firstChild
        if (textNode && textNode.textContent) {
          const targetPosition = Math.min(newCursorPosition, textNode.textContent.length)
          range.setStart(textNode, targetPosition)
          range.setEnd(textNode, targetPosition)
          selection?.removeAllRanges()
          selection?.addRange(range)
        }
      }

    } catch (error) {
      console.error('AI research error:', error)
      setError(error instanceof Error ? error.message : 'Research failed')
    } finally {
      setIsProcessing(false)
    }
  }, [content, extractContext, researchContext])

  // Process @Paradigm trigger with AI
  const processTrigger = useCallback(async (triggerIndex: number) => {
    const trigger = triggers[triggerIndex]
    if (!trigger || trigger.isProcessing) return

    try {
      setIsProcessing(true)
      setError(null)

      // Mark trigger as processing
      setTriggers(prev => prev.map((t, i) => 
        i === triggerIndex ? { ...t, isProcessing: true } : t
      ))

      // Extract context around the trigger
      const context = extractContext(content, trigger.position)
      
      // Get AI research result
      const result = await researchContext(context)
      
      // Replace @Paradigm with the result
      const beforeTrigger = content.slice(0, trigger.position)
      const afterTrigger = content.slice(trigger.position + trigger.text.length)
      const newContent = beforeTrigger + result + afterTrigger

      setContent(newContent)
      
      // Update editor content and cursor position
      if (editorRef.current) {
        // Save cursor position relative to the replacement
        const newCursorPosition = trigger.position + result.length
        
        // Update the content
        editorRef.current.textContent = newContent
        
        // Restore cursor position
        const range = document.createRange()
        const selection = window.getSelection()
        
        // Find the correct text node and position
        const textNode = editorRef.current.firstChild
        if (textNode && textNode.textContent) {
          const targetPosition = Math.min(newCursorPosition, textNode.textContent.length)
          range.setStart(textNode, targetPosition)
          range.setEnd(textNode, targetPosition)
          selection?.removeAllRanges()
          selection?.addRange(range)
        }
      }

    } catch (error) {
      console.error('AI research error:', error)
      setError(error instanceof Error ? error.message : 'Research failed')
      
      // Remove processing state from trigger
      setTriggers(prev => prev.map((t, i) => 
        i === triggerIndex ? { ...t, isProcessing: false } : t
      ))
    } finally {
      setIsProcessing(false)
    }
  }, [content, triggers, extractContext, researchContext])

  // Handle text changes and trigger detection
  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement
    const newContent = target.textContent || ''
    
    setContent(newContent)
    
    // Detect triggers
    const newTriggers = detectTriggers(newContent)
    
    setTriggers(prev => {
      // Check if any trigger became complete (fully matches @paradigm)
      const newCompleteTriggers = newTriggers.filter(trigger => {
        const isComplete = trigger.text.toLowerCase() === '@paradigm'
        const wasNotComplete = !prev.some(prevTrigger => 
          prevTrigger.position === trigger.position && 
          prevTrigger.text.toLowerCase() === '@paradigm'
        )
        return isComplete && wasNotComplete
      })
      
      // Process any newly complete triggers immediately
      if (newCompleteTriggers.length > 0) {
        newCompleteTriggers.forEach(trigger => {
          setTimeout(() => {
            processTriggerDirect(trigger)
          }, 100)
        })
      }
      
      return newTriggers
    })
    
    setIsTyping(true)
    setError(null)
    
    // Set timeout to clear typing state
    setTimeout(() => setIsTyping(false), 1000)
  }, [detectTriggers, processTriggerDirect])

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Ctrl+Z for undo (browser default)
    if (e.ctrlKey && e.key === 'z') {
      return
    }
    
    // Ctrl+A for select all
    if (e.ctrlKey && e.key === 'a') {
      e.preventDefault()
      if (editorRef.current) {
        const range = document.createRange()
        range.selectNodeContents(editorRef.current)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    }

    // Manual trigger research with Ctrl+Space
    if (e.ctrlKey && e.key === ' ') {
      e.preventDefault()
      if (triggers.length > 0 && !isProcessing) {
        const unprocessedIndex = triggers.findIndex(t => !t.isProcessing)
        if (unprocessedIndex !== -1) {
          processTrigger(unprocessedIndex)
        }
      }
    }
  }, [triggers, isProcessing, processTrigger])

  // Auto-focus the editor on mount
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.focus()
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Main content area with centered document */}
      <div className="max-w-4xl mx-auto px-6 py-8 relative">
        {/* Document page container */}
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 min-h-[800px] relative overflow-hidden">
          {/* Contenteditable editor */}
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            className="w-full h-full min-h-[800px] p-12 border-0 outline-none text-gray-900 leading-relaxed"
            style={{
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontSize: '16px',
              lineHeight: '1.6',
              caretColor: '#0ea5e9',
            }}
            data-placeholder="Start typing your document... Use @Paradigm to trigger AI research assistance."
            suppressContentEditableWarning={true}
          />
        </div>

        {/* Bottom status indicators */}
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 flex flex-col items-center space-y-3">
          {/* Error indicator */}
          {error && (
            <div className="flex items-center space-x-2 bg-red-500/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg animate-fade-in">
              <div className="w-2 h-2 bg-white rounded-full"></div>
              <span className="text-sm text-white">{error}</span>
            </div>
          )}

          {/* Processing indicator - takes highest precedence */}
          {isProcessing ? (
            <div className="flex items-center space-x-2 bg-yellow-500/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg animate-fade-in">
              <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
              <span className="text-sm text-white">Researching...</span>
            </div>
          ) : isTyping ? (
            <div className="flex items-center space-x-2 bg-paradigm-500/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg animate-fade-in">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              <span className="text-sm text-white">Typing...</span>
            </div>
          ) : (
            /* Trigger detection indicator - shows when not typing or processing */
            triggers.length > 0 && (
              <div className="flex items-center space-x-2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-gray-200 animate-fade-in">
                <div className="loading-indicator"></div>
                <span className="text-sm text-gray-600">
                  {triggers.length} trigger{triggers.length !== 1 ? 's' : ''} detected
                </span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
} 