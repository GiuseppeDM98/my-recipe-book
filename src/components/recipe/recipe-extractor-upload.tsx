'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, FileText, X } from 'lucide-react';

/**
 * RecipeExtractorUpload - Drag-and-drop PDF file upload with size validation
 *
 * PURPOSE: Upload PDF files for AI recipe extraction
 *
 * FEATURES:
 * - Drag-and-drop zone with visual feedback
 * - File size validation (4.4MB Vercel limit)
 * - PDF-only validation
 * - User-friendly error messages with compression tool suggestions
 */

interface RecipeExtractorUploadProps {
  onFileSelected: (file: File) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function RecipeExtractorUpload({ onFileSelected, isLoading, disabled }: RecipeExtractorUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ========================================
  // Drag and drop event handlers
  // ========================================
  // Standard HTML5 drag-drop API pattern

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Track drag state for visual feedback (border highlight)
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    // Validate: Only accept PDF files
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf') {
        handleFileSelection(file);
      } else {
        alert('Per favore carica solo file PDF');
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleFileSelection = (file: File) => {
    // ========================================
    // Check file size (max 4.4MB due to Vercel serverless function limits)
    // ========================================
    //
    // WHY 4.4MB:
    // - Vercel free tier: 4.5MB request payload limit
    // - Leave 100KB buffer for base64 encoding + request overhead
    // - Vercel docs: https://vercel.com/docs/concepts/limits/overview
    //
    // USER GUIDANCE:
    // - Error message includes compression tool suggestions
    // - Tools tested: iLovePDF (free, reliable), Adobe, Smallpdf
    const maxSize = 4.4 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(
        'Il file è troppo grande (max 4.4MB a causa dei limiti di Vercel).\n\n' +
        'Per ridurre la dimensione del PDF, puoi usare un servizio gratuito come:\n' +
        '• iLovePDF (https://www.ilovepdf.com/it/comprimere_pdf)\n' +
        '• Adobe Acrobat Online\n' +
        '• Smallpdf\n\n' +
        'Dopo aver compresso il PDF, riprova a caricarlo.'
      );
      return;
    }

    setSelectedFile(file);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      onFileSelected(selectedFile);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Drag & Drop Zone */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 transition-colors ${
          dragActive
            ? 'border-primary bg-primary/5'
            : 'border-input hover:border-input'
        } ${isLoading || disabled ? 'opacity-50 pointer-events-none' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleChange}
          className="hidden"
          disabled={isLoading || disabled}
        />

        {!selectedFile ? (
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="p-4 bg-muted rounded-full">
              <Upload className="w-12 h-12 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-medium text-foreground">
                Trascina qui il tuo PDF con le ricette
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                oppure clicca per selezionare un file
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || disabled}
            >
              Seleziona PDF
            </Button>
            <p className="text-xs text-muted-foreground">
              Dimensione massima: 4.4MB
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-red-50 rounded-lg">
                <FileText className="w-8 h-8 text-red-600" />
              </div>
              <div>
                <p className="font-medium text-foreground">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemoveFile}
              disabled={isLoading || disabled}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Upload Button */}
      {selectedFile && (
        <Button
          type="button"
          onClick={handleUpload}
          disabled={isLoading || disabled}
          className="w-full"
          size="lg"
        >
          {isLoading ? 'Estrazione in corso...' : 'Estrai Ricette dal PDF'}
        </Button>
      )}
    </div>
  );
}
