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
  const [darkMode, setDarkMode] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const [isTyping, setIsTyping] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Toggle dark mode
  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => !prev)
  }, [])

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

      // Save current cursor position and selection
      let currentSelection: { start: number; end: number } | null = null
      if (editorRef.current) {
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0)
          // Get cursor position relative to the entire text content
          const preCaretRange = range.cloneRange()
          preCaretRange.selectNodeContents(editorRef.current)
          preCaretRange.setEnd(range.startContainer, range.startOffset)
          const start = preCaretRange.toString().length
          const end = start + range.toString().length
          currentSelection = { start, end }
        }
      }

      // Extract context around the trigger
      const context = extractContext(content, targetTrigger.position)
      
      // Get AI research result
      const result = await researchContext(context)
      
      // Create new content by surgically replacing only the trigger
      const beforeTrigger = content.slice(0, targetTrigger.position)
      const afterTrigger = content.slice(targetTrigger.position + targetTrigger.text.length)
      const newContent = beforeTrigger + result + afterTrigger
      
      // Calculate length difference for cursor adjustment
      const lengthDifference = result.length - targetTrigger.text.length

      // Update React state
      setContent(newContent)
      
      // Use a simple but effective approach: only update if we have a clean single text node
      if (editorRef.current && currentSelection) {
        // Simple approach: update the content and restore cursor
        const originalTextContent = editorRef.current.textContent || ''
        
        // Only proceed if the current content matches our expected state
        if (originalTextContent === content) {
          // Direct text replacement
          editorRef.current.textContent = newContent
          
          // Calculate new cursor position
          let newCursorStart = currentSelection.start
          let newCursorEnd = currentSelection.end
          
          // If cursor was after the trigger, adjust for length difference
          if (currentSelection.start > targetTrigger.position + targetTrigger.text.length) {
            newCursorStart = currentSelection.start + lengthDifference
            newCursorEnd = currentSelection.end + lengthDifference
          }
          // If cursor was within the trigger area, place it after the replacement
          else if (currentSelection.start >= targetTrigger.position && currentSelection.start <= targetTrigger.position + targetTrigger.text.length) {
            newCursorStart = targetTrigger.position + result.length
            newCursorEnd = newCursorStart
          }
          // If cursor was before the trigger, keep it in the same place
          // (no adjustment needed)
          
          // Restore cursor position with a small delay to ensure DOM is updated
          setTimeout(() => {
            if (editorRef.current) {
              const textNode = editorRef.current.firstChild
              if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                const range = document.createRange()
                const selection = window.getSelection()
                
                try {
                  const maxLength = textNode.textContent?.length || 0
                  const safeStart = Math.min(Math.max(0, newCursorStart), maxLength)
                  const safeEnd = Math.min(Math.max(0, newCursorEnd), maxLength)
                  
                  range.setStart(textNode, safeStart)
                  range.setEnd(textNode, safeEnd)
                  selection?.removeAllRanges()
                  selection?.addRange(range)
                } catch (error) {
                  console.warn('Failed to restore cursor position:', error)
                }
              }
            }
          }, 10)
        } else {
          // Fallback: if content doesn't match, just update and place cursor at end
          editorRef.current.textContent = newContent
          const range = document.createRange()
          const selection = window.getSelection()
          const textNode = editorRef.current.firstChild
          if (textNode) {
            const newPosition = targetTrigger.position + result.length
            const safePosition = Math.min(newPosition, textNode.textContent?.length || 0)
            range.setStart(textNode, safePosition)
            range.setEnd(textNode, safePosition)
            selection?.removeAllRanges()
            selection?.addRange(range)
          }
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

  // Handle dark mode class on document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-gray-900 dark' : 'bg-gray-100'}`}>
      {/* Main content area with centered document */}
      <div className="max-w-4xl mx-auto px-6 py-8 relative">
        {/* Document page container */}
        <div className={`rounded-lg shadow-lg border min-h-[800px] relative overflow-hidden transition-colors duration-300 ${
          darkMode 
            ? 'bg-gray-800 border-gray-700' 
            : 'bg-white border-gray-200'
        }`}>
          {/* Contenteditable editor */}
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            className={`w-full h-full min-h-[800px] p-12 border-0 outline-none leading-relaxed transition-colors duration-300 ${
              darkMode ? 'text-gray-100' : 'text-gray-900'
            }`}
            style={{
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontSize: '16px',
              lineHeight: '1.6',
              caretColor: '#0ea5e9',
            }}
            data-placeholder="Start typing your document... Use @Paradigm to trigger AI research assistance."
            suppressContentEditableWarning={true}
          />
          
          {/* GitHub icon at bottom left */}
          <a 
            href="https://github.com/rkdune/inline-agent" 
            target="_blank" 
            rel="noopener noreferrer"
            className="absolute bottom-4 left-4 text-gray-400 hover:text-gray-600 transition-colors duration-200 hidden"
            title="View source on GitHub"
          >
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="currentColor"
              className="opacity-60 hover:opacity-80 transition-opacity duration-200"
            >
              <path d="M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
          
          {/* Lightbulb icon next to GitHub */}
          <a 
            href="https://raw.githubusercontent.com/rkdune/inline-agent/main/InlineWebAgent.png" 
            target="_blank" 
            rel="noopener noreferrer"
            className="absolute bottom-4 left-10 text-gray-400 hover:text-gray-600 transition-colors duration-200 hidden"
            title="the figma mockup that started this!"
          >
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="currentColor"
              className="opacity-60 hover:opacity-80 transition-opacity duration-200"
            >
              <path d="M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9v1zm3-19C8.1 2 5 5.1 5 9c0 2.4 1.2 4.5 3 5.7V17c0 .5.4 1 1 1h6c.6 0 1-.5 1-1v-2.3c1.8-1.2 3-3.3 3-5.7 0-3.9-3.1-7-7-7z"/>
            </svg>
          </a>

          {/* Dark mode toggle button at bottom right */}
          <button
            onClick={toggleDarkMode}
            className={`absolute bottom-4 right-4 p-2 rounded-lg transition-all duration-200 ${
              darkMode 
                ? 'bg-gray-700 hover:bg-gray-600 text-yellow-400' 
                : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
            }`}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? (
              // Sun icon for light mode
              <svg 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="currentColor"
                className="transition-transform duration-200 hover:rotate-12"
              >
                <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z"/>
              </svg>
            ) : (
              // Moon icon for dark mode
              <svg 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="currentColor"
                className="transition-transform duration-200 hover:rotate-12"
              >
                <path d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z"/>
              </svg>
            )}
          </button>
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
              <div className={`flex items-center space-x-2 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border animate-fade-in transition-colors duration-300 ${
                darkMode 
                  ? 'bg-gray-800/90 border-gray-700 text-gray-300' 
                  : 'bg-white/90 border-gray-200 text-gray-600'
              }`}>
                <div className="loading-indicator"></div>
                <span className="text-sm">
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