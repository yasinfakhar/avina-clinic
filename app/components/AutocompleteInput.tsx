"use client";

import { useState, useEffect, useRef } from "react";

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  storageKey: string;
  suggestions?: string[];
}

/**
 * Autocomplete input component with localStorage history
 * Stores previously entered values and provides suggestions
 */
export function AutocompleteInput({
  value,
  onChange,
  placeholder = "تایپ کنید...",
  storageKey,
  suggestions = [],
}: AutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history:", e);
      }
    }
  }, [storageKey]);

  // Save to history when value is submitted (on blur or Enter)
  const saveToHistory = (newValue: string) => {
    if (!newValue.trim()) return;
    
    setHistory(prev => {
      const filtered = prev.filter(item => item !== newValue);
      const updated = [newValue, ...filtered].slice(0, 50); // Keep last 50 entries
      localStorage.setItem(storageKey, JSON.stringify(updated));
      return updated;
    });
  };

  // Filter suggestions based on input
  useEffect(() => {
    if (!value) {
      setFilteredSuggestions([...new Set([...history, ...suggestions])]);
    } else {
      const lowerValue = value.toLowerCase();
      const matched = [...new Set([...history, ...suggestions])].filter(
        item => item.toLowerCase().includes(lowerValue)
      );
      setFilteredSuggestions(matched);
    }
  }, [value, history, suggestions]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setIsOpen(true);
  };

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue);
    setIsOpen(false);
    saveToHistory(selectedValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      saveToHistory(value);
      setIsOpen(false);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleBlur = () => {
    // Delay to allow click on suggestion
    setTimeout(() => {
      saveToHistory(value);
      setIsOpen(false);
    }, 200);
  };

  return (
    <div ref={containerRef} className="autocomplete-wrapper" style={{ position: "relative" }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="autocomplete-input"
        style={{
          width: "100%",
          padding: "8px 12px",
          border: "1px solid #e5e7eb",
          borderRadius: "6px",
          fontSize: "14px",
        }}
      />
      {isOpen && filteredSuggestions.length > 0 && (
        <ul
          className="autocomplete-suggestions"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            maxHeight: "200px",
            overflowY: "auto",
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "6px",
            marginTop: "4px",
            listStyle: "none",
            padding: "0",
            margin: "0",
            zIndex: 1000,
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
          }}
        >
          {filteredSuggestions.map((suggestion, index) => (
            <li
              key={`${suggestion}-${index}`}
              onClick={() => handleSelect(suggestion)}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                borderBottom: index < filteredSuggestions.length - 1 ? "1px solid #f3f4f6" : "none",
                "&:hover": {
                  backgroundColor: "#f9fafb",
                },
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#f9fafb";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "white";
              }}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
