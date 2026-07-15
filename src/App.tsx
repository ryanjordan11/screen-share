/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
  Download,
  Copy,
  Share2,
  Trash2,
  Sparkles,
  Monitor,
  RefreshCw,
  Sliders,
  Check,
  Image as ImageIcon,
  Clock,
  Info,
  Maximize2,
  Settings,
  Grid,
  ChevronRight,
  ShieldAlert,
  ChevronLeft
} from 'lucide-react';
import { ScreenshotItem, ImageAdjustments, PresetFilter } from './types.js';

// Synthesize physical DSLR shutter click using Web Audio API
const playShutterSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    // Create white noise for the physical click
    const bufferSize = ctx.sampleRate * 0.08; // 80ms duration
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Metal clank filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 3;

    // High pass filter for crispness
    const hpFilter = ctx.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.value = 3000;

    // Exponential fast drop envelope
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.07);

    noise.connect(filter);
    filter.connect(hpFilter);
    hpFilter.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
  } catch (e) {
    console.warn('Audio Context failed to initialize:', e);
  }
};

const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  grayscale: false,
  sepia: false,
  invert: false,
};

export default function App() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  // Detect if the app is rendered in an iframe
  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch (e) {
      setIsInIframe(true);
    }
  }, []);

  // Gallery and active workbench
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Active edits
  const [adjustments, setAdjustments] = useState<ImageAdjustments>({ ...DEFAULT_ADJUSTMENTS });
  const [activeFilter, setActiveFilter] = useState<PresetFilter>('normal');
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg'>('png');

  // Interactive statuses
  const [copyStatus, setCopyStatus] = useState(false);
  const [shareStatus, setShareStatus] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);

  // Start capturing the screen/window/tab feed
  const startCapture = async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          width: { ideal: 3840 }, // Get full resolution
          height: { ideal: 2160 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      setStream(mediaStream);
      setIsCapturing(true);

      // Handle stream ended via browser stop-sharing widget
      mediaStream.getVideoTracks()[0].onended = () => {
        stopCapture();
      };
    } catch (err: any) {
      console.error('getDisplayMedia error:', err);
      const errString = String(err);
      if (
        errString.includes('permissions policy') || 
        errString.includes('display-capture') || 
        errString.includes('disallowed') || 
        err.name === 'SecurityError'
      ) {
        setError(
          'Security Constraint: Chrome & other modern browsers block screen capture inside sandboxed/embedded previews. To use screen capture, please click "Open in New Tab" at the top right of the page to launch the app directly!'
        );
      } else {
        setError('Could not access capture source. Please allow permission to take screenshots.');
      }
    }
  };

  // Stop capturing the screen feed
  const stopCapture = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsCapturing(false);
  };

  // Auto-bind video source
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((e) => console.log('Video playing error:', e));
    }
  }, [stream]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  // Capture current frame from live capture
  const takeScreenshot = () => {
    if (!videoRef.current || !isCapturing) {
      setError('Start capturing first before taking a screenshot.');
      return;
    }

    const video = videoRef.current;
    const width = video.videoWidth || 1920;
    const height = video.videoHeight || 1080;

    // Use offscreen canvas to capture native source resolution
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setError('Could not initialize canvas rendering context.');
      return;
    }

    try {
      // Shutter visual and auditory cues
      setFlash(true);
      playShutterSound();
      setTimeout(() => setFlash(false), 200);

      // Draw active video frame onto the canvas
      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/png');

      const newItem: ScreenshotItem = {
        id: 'ss_' + Math.random().toString(36).substring(2, 11),
        originalUrl: dataUrl,
        previewUrl: dataUrl,
        width,
        height,
        timestamp: Date.now(),
        label: `Screenshot ${screenshots.length + 1}`,
        format: 'png',
        adjustments: { ...DEFAULT_ADJUSTMENTS },
        filter: 'normal',
      };

      setScreenshots((prev) => [newItem, ...prev]);
      setActiveId(newItem.id);
      
      // Reset filter options
      setAdjustments({ ...DEFAULT_ADJUSTMENTS });
      setActiveFilter('normal');
    } catch (e: any) {
      console.error('Frame extraction failed:', e);
      setError('Failed to extract screen frame due to browser rendering policy.');
    }
  };

  const activeItem = screenshots.find((s) => s.id === activeId);

  // Sync adjustments if user switches active screenshot
  useEffect(() => {
    if (activeItem) {
      setAdjustments(activeItem.adjustments);
      setActiveFilter(activeItem.filter);
    }
  }, [activeId]);

  // Update current item with changes
  const updateActiveAdjustments = (newAdjusts: Partial<ImageAdjustments>) => {
    if (!activeId) return;
    setAdjustments((prev) => {
      const updated = { ...prev, ...newAdjusts };
      setScreenshots((list) =>
        list.map((item) =>
          item.id === activeId ? { ...item, adjustments: updated } : item
        )
      );
      return updated;
    });
  };

  const updateActiveFilter = (newFilter: PresetFilter) => {
    if (!activeId) return;
    setActiveFilter(newFilter);
    setScreenshots((list) =>
      list.map((item) =>
        item.id === activeId ? { ...item, filter: newFilter } : item
      )
    );
  };

  // Helper to construct CSS filter string for preview rendering
  const getFilterCSSString = (adj: ImageAdjustments, filter: PresetFilter) => {
    let filterString = `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%) blur(${adj.blur}px)`;
    if (adj.grayscale) filterString += ' grayscale(100%)';
    if (adj.sepia) filterString += ' sepia(100%)';
    if (adj.invert) filterString += ' invert(100%)';

    // Apply quick filters
    switch (filter) {
      case 'vintage':
        filterString += ' sepia(60%) contrast(120%) brightness(95%)';
        break;
      case 'cool':
        filterString += ' hue-rotate(30deg) saturate(110%)';
        break;
      case 'warm':
        filterString += ' sepia(35%) saturate(120%) brightness(105%)';
        break;
      case 'monochrome':
        filterString += ' grayscale(100%) contrast(130%)';
        break;
      case 'high-contrast':
        filterString += ' contrast(150%) brightness(105%)';
        break;
      case 'faded':
        filterString += ' saturate(70%) brightness(110%)';
        break;
    }
    return filterString;
  };

  // Bakes adjustments onto a canvas and returns the processed canvas
  const getProcessedCanvas = async (): Promise<HTMLCanvasElement | null> => {
    if (!activeItem) return null;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = activeItem.width;
        canvas.height = activeItem.height;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          // Modern browser canvas filters
          ctx.filter = getFilterCSSString(adjustments, activeFilter);
          ctx.drawImage(img, 0, 0);
          resolve(canvas);
        } else {
          resolve(null);
        }
      };
      img.src = activeItem.originalUrl;
    });
  };

  // Copy PNG image to clipboard
  const handleCopyToClipboard = async () => {
    if (!activeItem) return;
    try {
      const canvas = await getProcessedCanvas();
      if (!canvas) return;

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          const item = new ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([item]);
          setCopyStatus(true);
          setTimeout(() => setCopyStatus(false), 2000);
        } catch (clipboardErr) {
          console.error('Clipboard write error:', clipboardErr);
          // Fallback if browser doesn't support writing blobs to clipboard
          setError('Clipboard API rejected blob writing. Try right-clicking on the image and copying.');
        }
      }, 'image/png');
    } catch (err) {
      console.error('Failed to copy processed image:', err);
      setError('Could not prepare screenshot for clipboard copy.');
    }
  };

  // Download screenshot file
  const handleDownload = async () => {
    if (!activeItem) return;
    try {
      const canvas = await getProcessedCanvas();
      if (!canvas) return;

      const mimeType = exportFormat === 'png' ? 'image/png' : 'image/jpeg';
      const fileExtension = exportFormat === 'png' ? 'png' : 'jpg';
      const quality = exportFormat === 'jpeg' ? 0.92 : undefined;

      const dataUrl = canvas.toDataURL(mimeType, quality);
      const link = document.createElement('a');
      const cleanLabel = activeItem.label.toLowerCase().replace(/\s+/g, '-');
      link.download = `${cleanLabel}.${fileExtension}`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Download failed:', err);
      setError('Could not download image. Please try again.');
    }
  };

  // Web Share image to other apps (via OS Share Sheet)
  const handleShare = async () => {
    if (!activeItem) return;
    try {
      const canvas = await getProcessedCanvas();
      if (!canvas) return;

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        
        const file = new File([blob], `${activeItem.label.toLowerCase().replace(/\s+/g, '-')}.png`, {
          type: 'image/png',
        });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: activeItem.label,
            text: 'Here is a screenshot captured from Screenshare Workspace.',
          });
          setShareStatus(true);
          setTimeout(() => setShareStatus(false), 2000);
        } else {
          // Clipboard is the best alternative
          handleCopyToClipboard();
          setError('Your browser does not support native file sharing. Copying screenshot to clipboard instead!');
        }
      }, 'image/png');
    } catch (err) {
      console.error('Sharing failed:', err);
      setError('Could not initiate system share sheet.');
    }
  };

  // Delete current screenshot
  const deleteScreenshot = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setScreenshots((list) => {
      const filtered = list.filter((item) => item.id !== id);
      if (activeId === id) {
        setActiveId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-blue-500/30 selection:text-blue-200" id="app-viewport">
      {/* Visual camera flash animation overlay */}
      <AnimatePresence>
        {flash && (
          <motion.div
            initial={{ opacity: 0.95 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 z-50 bg-white pointer-events-none"
            id="shutter-flash"
          />
        )}
      </AnimatePresence>

      {/* Main navigation header */}
      <header className="flex h-16 items-center justify-between border-b border-slate-900 bg-slate-950/80 backdrop-blur-xl px-6 sticky top-0 z-40" id="main-header">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/20" id="header-logo-container">
            <Camera className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-tight text-white flex items-center gap-2">
              Screenshot Pro <span className="rounded bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 text-[9px] font-bold text-blue-400 font-mono">WORKSPACE</span>
            </h1>
            <p className="text-[10px] text-slate-500 font-mono">
              Captures high-resolution frames directly in browser
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Global info metrics */}
          <div className="hidden md:flex items-center gap-6 text-[11px] font-mono text-slate-400">
            <div className="flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 text-slate-500" />
              Captured Session Images: <span className="font-bold text-slate-200">{screenshots.length}</span>
            </div>
            {isCapturing && (
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-slate-300 font-medium">Capturing Screen feed...</span>
              </div>
            )}
          </div>

          {isInIframe && (
            <a
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 text-xs font-bold text-blue-400 transition-colors cursor-pointer"
              id="header-open-tab-btn"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>Open in New Tab</span>
            </a>
          )}
        </div>
      </header>

      {/* Alerts notification banner */}
      {error && (
        <div className="bg-amber-500/10 border-b border-amber-500/25 px-6 py-2.5 flex items-center justify-between gap-3 text-xs text-amber-400" id="error-alert-bar">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 flex-shrink-0 text-amber-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-[11px] font-bold underline hover:text-amber-300 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Two-Column split workspace */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden" id="main-workspace-frame">
        {/* Left column: Live camera viewport & session historical roll */}
        <div className="flex-1 flex flex-col p-4 lg:p-6 space-y-6 overflow-y-auto" id="left-workspace-column">
          {/* Live capture source section */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/40 p-5 space-y-4 shadow-xl" id="camera-feed-card">
            <div className="flex items-center justify-between" id="feed-header">
              <div className="space-y-0.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                  <Monitor className="h-3.5 w-3.5 text-blue-400" /> Screen & Window Capture source
                </h3>
                <p className="text-[11px] text-slate-500">
                  Pick a target app or screen tab to freeze frames
                </p>
              </div>

              {isCapturing ? (
                <button
                  onClick={stopCapture}
                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1.5 cursor-pointer"
                  id="btn-disconnect-feed"
                >
                  Disconnect Source
                </button>
              ) : (
                <button
                  onClick={startCapture}
                  className="rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-blue-600/25 transition-all flex items-center gap-1.5 cursor-pointer"
                  id="btn-connect-feed"
                >
                  Select Screen / Tab
                </button>
              )}
            </div>

            {/* Viewport viewport screen */}
            <div className="relative aspect-video rounded-xl border border-slate-900 bg-slate-950 overflow-hidden flex items-center justify-center group shadow-inner" id="live-camera-view-window">
              {isCapturing ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-contain"
                    id="live-screencapture-video"
                  />
                  {/* Dynamic hovering capture HUD overlay */}
                  <div className="absolute top-3 left-3 bg-slate-950/80 border border-slate-800/80 backdrop-blur px-2.5 py-1 rounded-md text-[10px] font-mono text-slate-300 flex items-center gap-1.5 select-none pointer-events-none">
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
                    <span>FEED CONNECTED</span>
                  </div>

                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center justify-center opacity-90 hover:opacity-100 transition-opacity z-10">
                    <button
                      onClick={takeScreenshot}
                      className="flex items-center gap-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 font-bold text-sm shadow-xl shadow-blue-600/40 ring-4 ring-blue-600/10 cursor-pointer transition-transform active:scale-95"
                      id="btn-take-shutter-snapshot"
                    >
                      <Camera className="h-4.5 w-4.5" /> Snap Screenshot
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center text-center p-8 space-y-3 max-w-sm" id="empty-capture-source-fallback">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-slate-500">
                    <Monitor className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">No capture feed selected</h4>
                    <p className="text-[11px] text-slate-500">
                      Click the select button to pick any window or browser tab to start snapping instant images.
                    </p>
                  </div>
                  <button
                    onClick={startCapture}
                    className="rounded-lg bg-slate-900 border border-slate-800 px-4 py-2 text-[11px] font-bold text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                    id="btn-connect-feed-fallback"
                  >
                    Select Source
                  </button>

                  {isInIframe && (
                    <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl p-3.5 max-w-xs mt-3 text-left">
                      <p className="text-[10px] text-blue-300 leading-normal flex items-start gap-1.5 font-mono">
                        <Info className="h-3.5 w-3.5 shrink-0 text-blue-400 mt-0.5" />
                        <span>
                          <strong>Note:</strong> Chrome blocks screen capture inside iframe previews. Click below to launch in a full tab where screen capture is fully permitted.
                        </span>
                      </p>
                      <a
                        href={window.location.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2.5 flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-500 text-[10px] font-bold text-white py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
                      >
                        <Maximize2 className="h-3 w-3" /> Launch in New Tab
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Historical snapped screenshots roll */}
          <div className="space-y-3" id="screenshot-roll-card">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Snapped Screen Images ({screenshots.length})
              </h3>
              {screenshots.length > 0 && (
                <button
                  onClick={() => {
                    setScreenshots([]);
                    setActiveId(null);
                  }}
                  className="text-[10px] font-medium text-slate-500 hover:text-red-400 font-mono transition-colors cursor-pointer"
                  id="btn-clear-session-gallery"
                >
                  Clear all
                </button>
              )}
            </div>

            {screenshots.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-900 py-10 text-center text-slate-600 text-xs font-mono" id="empty-session-roll-fallback">
                No screenshots snapped in this session.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4" id="historical-cards-grid">
                {screenshots.map((item) => {
                  const isActive = item.id === activeId;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setActiveId(item.id)}
                      className={`relative rounded-xl border p-2 bg-slate-900/30 overflow-hidden cursor-pointer transition-all ${
                        isActive
                          ? 'border-blue-500 ring-1 ring-blue-500/20'
                          : 'border-slate-900 hover:border-slate-800'
                      }`}
                      id={`snap-card-${item.id}`}
                    >
                      <div className="aspect-video bg-slate-950 rounded-lg overflow-hidden relative">
                        <img
                          src={item.originalUrl}
                          alt={item.label}
                          className="w-full h-full object-cover"
                          style={{ filter: getFilterCSSString(item.adjustments, item.filter) }}
                        />
                        <button
                          onClick={(e) => deleteScreenshot(item.id, e)}
                          className="absolute top-1 right-1 p-1 rounded bg-slate-950/80 border border-slate-800 hover:bg-red-500/10 hover:border-red-500/30 text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
                          title="Delete screenshot"
                          id={`btn-delete-${item.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>

                      <div className="mt-2 space-y-0.5">
                        <p className="text-[11px] font-semibold text-slate-200 truncate font-sans">
                          {item.label}
                        </p>
                        <p className="text-[9px] text-slate-500 font-mono">
                          {item.width}x{item.height}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Interactive Workbench & Editor controls */}
        <div className="w-full lg:w-[400px] border-t lg:border-t-0 lg:border-l border-slate-900 bg-slate-950 flex flex-col shrink-0 overflow-y-auto" id="right-workspace-column">
          {activeItem ? (
            <div className="p-5 space-y-6" id="editor-active-container">
              {/* Image Preview & Properties */}
              <div className="space-y-3" id="active-image-header">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                    Image Workbench
                  </h3>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                    {activeItem.width}x{activeItem.height} px
                  </span>
                </div>

                {/* Main Processed Image Preview */}
                <div className="relative aspect-video rounded-xl border border-slate-900 bg-slate-950 overflow-hidden group shadow-md" id="workbench-editor-preview">
                  <img
                    src={activeItem.originalUrl}
                    alt={activeItem.label}
                    className="w-full h-full object-contain"
                    style={{ filter: getFilterCSSString(adjustments, activeFilter) }}
                    id="workbench-processed-img"
                  />
                  <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="rounded bg-slate-950/80 border border-slate-800/80 px-2 py-1 text-[9px] font-mono text-slate-300 backdrop-blur">
                      Baking Live Filters
                    </span>
                  </div>
                </div>

                {/* Editable Image Label */}
                <input
                  type="text"
                  value={activeItem.label}
                  onChange={(e) => {
                    const val = e.target.value;
                    setScreenshots((list) =>
                      list.map((item) =>
                        item.id === activeId ? { ...item, label: val } : item
                      )
                    );
                  }}
                  className="w-full bg-transparent border-b border-slate-900 hover:border-slate-800 focus:border-blue-500 focus:outline-none text-sm font-semibold text-slate-100 py-1"
                  placeholder="Screenshot Name"
                />
              </div>

              {/* Action output buttons - Essential to "share to another app" */}
              <div className="space-y-2.5" id="workbench-share-controls">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
                  <span>Workspace Export Actions</span>
                  <div className="flex items-center gap-1.5" id="export-format-pills">
                    <button
                      onClick={() => setExportFormat('png')}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                        exportFormat === 'png' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-500'
                      }`}
                    >
                      PNG
                    </button>
                    <button
                      onClick={() => setExportFormat('jpeg')}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                        exportFormat === 'jpeg' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-500'
                      }`}
                    >
                      JPG
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2" id="action-buttons-grid">
                  {/* Copy Button (Holy grail for Discord/Figma pasting) */}
                  <button
                    onClick={handleCopyToClipboard}
                    className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 py-2.5 text-xs font-bold text-slate-100 hover:text-white transition-all cursor-pointer"
                    id="btn-copy-clipboard"
                  >
                    {copyStatus ? (
                      <>
                        <Check className="h-4 w-4 text-emerald-400" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 text-blue-400" /> Copy Image
                      </>
                    )}
                  </button>

                  {/* Share sheet button */}
                  <button
                    onClick={handleShare}
                    className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 py-2.5 text-xs font-bold text-slate-100 hover:text-white transition-all cursor-pointer"
                    id="btn-share-os-sheet"
                  >
                    {shareStatus ? (
                      <>
                        <Check className="h-4 w-4 text-emerald-400" /> Shared!
                      </>
                    ) : (
                      <>
                        <Share2 className="h-4 w-4 text-indigo-400" /> OS Share
                      </>
                    )}
                  </button>
                </div>

                {/* Big download button */}
                <button
                  onClick={handleDownload}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-xs font-bold text-white shadow-lg shadow-blue-600/10 hover:from-blue-500 hover:to-indigo-500 cursor-pointer transition-transform active:scale-99"
                  id="btn-download-image"
                >
                  <Download className="h-4 w-4" /> Download Processed Snapshot
                </button>
              </div>

              {/* Divider */}
              <div className="h-[1px] bg-slate-900" />

              {/* Adjusters and filters workspace panels */}
              <div className="space-y-5" id="workbench-filter-options">
                {/* Preset filter options */}
                <div className="space-y-2">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                    Preset Mood Filters
                  </span>
                  <div className="grid grid-cols-4 gap-2" id="preset-filters-grid">
                    {(['normal', 'vintage', 'cool', 'warm', 'monochrome', 'high-contrast', 'faded'] as PresetFilter[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => updateActiveFilter(f)}
                        className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all truncate cursor-pointer ${
                          activeFilter === f
                            ? 'border-blue-500 bg-blue-500/10 text-slate-100'
                            : 'border-slate-900 bg-slate-900/20 text-slate-500 hover:border-slate-800 hover:text-slate-300'
                        }`}
                        id={`filter-pill-${f}`}
                      >
                        {f.replace('-', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Adjustments sliders */}
                <div className="space-y-4" id="workbench-sliders">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                      <Sliders className="h-3 w-3" /> Image Adjustments
                    </span>
                    <button
                      onClick={() => updateActiveAdjustments(DEFAULT_ADJUSTMENTS)}
                      className="text-[10px] text-slate-500 hover:text-slate-300 font-mono cursor-pointer"
                      id="btn-reset-sliders"
                    >
                      Reset adjustments
                    </button>
                  </div>

                  {/* Brightness */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400">
                      <span>Brightness</span>
                      <span>{adjustments.brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={adjustments.brightness}
                      onChange={(e) => updateActiveAdjustments({ brightness: parseInt(e.target.value) })}
                      className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-900 rounded-lg appearance-none"
                    />
                  </div>

                  {/* Contrast */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400">
                      <span>Contrast</span>
                      <span>{adjustments.contrast}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={adjustments.contrast}
                      onChange={(e) => updateActiveAdjustments({ contrast: parseInt(e.target.value) })}
                      className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-900 rounded-lg appearance-none"
                    />
                  </div>

                  {/* Saturation */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400">
                      <span>Saturation</span>
                      <span>{adjustments.saturation}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={adjustments.saturation}
                      onChange={(e) => updateActiveAdjustments({ saturation: parseInt(e.target.value) })}
                      className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-900 rounded-lg appearance-none"
                    />
                  </div>

                  {/* Blur */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400">
                      <span>Blur</span>
                      <span>{adjustments.blur}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={adjustments.blur}
                      onChange={(e) => updateActiveAdjustments({ blur: parseInt(e.target.value) })}
                      className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-900 rounded-lg appearance-none"
                    />
                  </div>

                  {/* Checkboxes parameters */}
                  <div className="grid grid-cols-3 gap-2 pt-2" id="workbench-checkboxes">
                    {/* Grayscale */}
                    <button
                      onClick={() => updateActiveAdjustments({ grayscale: !adjustments.grayscale })}
                      className={`py-2 px-1.5 text-[10px] font-semibold rounded-lg border transition-all text-center cursor-pointer ${
                        adjustments.grayscale
                          ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                          : 'border-slate-900 bg-slate-900/10 text-slate-500 hover:border-slate-800'
                      }`}
                    >
                      Grayscale
                    </button>

                    {/* Sepia */}
                    <button
                      onClick={() => updateActiveAdjustments({ sepia: !adjustments.sepia })}
                      className={`py-2 px-1.5 text-[10px] font-semibold rounded-lg border transition-all text-center cursor-pointer ${
                        adjustments.sepia
                          ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                          : 'border-slate-900 bg-slate-900/10 text-slate-500 hover:border-slate-800'
                      }`}
                    >
                      Sepia Tone
                    </button>

                    {/* Invert */}
                    <button
                      onClick={() => updateActiveAdjustments({ invert: !adjustments.invert })}
                      className={`py-2 px-1.5 text-[10px] font-semibold rounded-lg border transition-all text-center cursor-pointer ${
                        adjustments.invert
                          ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                          : 'border-slate-900 bg-slate-900/10 text-slate-500 hover:border-slate-800'
                      }`}
                    >
                      Invert
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 text-slate-600" id="editor-empty-state">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900/30 border border-slate-900 text-slate-700">
                <ImageIcon className="h-6 w-6" />
              </div>
              <div className="space-y-1 max-w-xs">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Workbench Empty</h4>
                <p className="text-[11px] text-slate-500">
                  Select a capture source, snap a screenshot, or click a gallery thumbnail to start editing, copying, and sharing.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
