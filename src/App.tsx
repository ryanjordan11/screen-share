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
  Sliders,
  Check,
  Image as ImageIcon,
  Clock,
  Info,
  Maximize2,
  Settings,
  Grid,
  ShieldAlert,
  Send,
  Plus,
  Eye,
  Bell,
  Terminal,
  Activity,
  Volume2,
  Sun,
  Moon
} from 'lucide-react';
import { ScreenshotItem, ImageAdjustments, PresetFilter, ScreenStream, ChatMessage } from './types.js';

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

const INITIAL_CHAT: ChatMessage[] = [
  {
    id: 'welcome',
    sender: 'system',
    text: '👋 **Welcome to Screen Stream AI Workspace!**\n\nStart by clicking **"+ Add Screen Stream"** in the grid panel. You can stream in up to 10 screens, browser tabs, or windows simultaneously!\n\nOur AI Assistant is fully context-aware—it sees all active screens in real-time. Ask it to **explain layouts, help develop SASS apps, or write code** based on what is shown on your screen streams.',
    timestamp: Date.now()
  }
];

export default function App() {
  const [streams, setStreams] = useState<ScreenStream[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  // Gallery and active workbench
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Chat parameters
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [includeScreens, setIncludeScreens] = useState(true);

  // Active edits
  const [adjustments, setAdjustments] = useState<ImageAdjustments>({ ...DEFAULT_ADJUSTMENTS });
  const [activeFilter, setActiveFilter] = useState<PresetFilter>('normal');
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg'>('png');

  // Interactive statuses
  const [copyStatus, setCopyStatus] = useState(false);
  const [shareStatus, setShareStatus] = useState(false);

  // Theme support
  const [theme, setTheme] = useState<'neon-dark' | 'neon-light'>('neon-dark');
  const isDark = theme === 'neon-dark';

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Detect if the app is rendered in an iframe
  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch (e) {
      setIsInIframe(true);
    }
  }, []);

  // Bind video sources whenever streams change
  useEffect(() => {
    streams.forEach((item) => {
      if (item.isActive && item.stream) {
        const videoEl = document.getElementById(`video-${item.id}`) as HTMLVideoElement | null;
        if (videoEl && videoEl.srcObject !== item.stream) {
          videoEl.srcObject = item.stream;
          videoEl.play().catch((e) => console.log('Video playback error:', e));
        }
      }
    });
  }, [streams]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      streams.forEach((s) => {
        if (s.stream) {
          s.stream.getTracks().forEach((track) => track.stop());
        }
      });
    };
  }, []);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // Request a new display media capture
  const addScreenStream = async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });

      const streamId = 'stream_' + Math.random().toString(36).substring(2, 11);
      const nextNum = streams.length + 1;
      const newStreamItem: ScreenStream = {
        id: streamId,
        label: `Screen Stream ${nextNum}`,
        stream: mediaStream,
        isActive: true,
        timestamp: Date.now()
      };

      // Handle stream ended via browser stop-sharing widget
      mediaStream.getVideoTracks()[0].onended = () => {
        disconnectStream(streamId);
      };

      setStreams((prev) => [...prev, newStreamItem]);

      // Add a system notification update in the feed
      setMessages((prev) => [
        ...prev,
        {
          id: 'sys_' + Math.random().toString(36).substring(2, 11),
          sender: 'system',
          text: `📡 **Connected a new live feed:** "${newStreamItem.label}". Click **"Scan Context"** above to analyze this stream!`,
          timestamp: Date.now(),
          isNotification: true
        }
      ]);

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
          'Security Constraint: Screen Capture is blocked within sandboxed iframe previews. Please click "Open in New Tab" at the top right to start streaming.'
        );
      } else {
        setError('Could not access capture source: ' + err.message);
      }
    }
  };

  // Disconnect an active screen stream
  const disconnectStream = (streamId: string) => {
    setStreams((prev) => {
      const target = prev.find((s) => s.id === streamId);
      if (target && target.stream) {
        target.stream.getTracks().forEach((track) => track.stop());
      }
      const filtered = prev.filter((s) => s.id !== streamId);
      
      // Post notification about disconnection
      setMessages((m) => [
        ...m,
        {
          id: 'sys_' + Math.random().toString(36).substring(2, 11),
          sender: 'system',
          text: `🔌 Disconnected screen feed: "${target?.label || 'Screen stream'}"`,
          timestamp: Date.now(),
          isNotification: true
        }
      ]);
      return filtered;
    });
  };

  // Capture frame from a specific active screen stream
  const captureFrameFromStream = (streamItem: ScreenStream) => {
    const video = document.getElementById(`video-${streamItem.id}`) as HTMLVideoElement | null;
    if (!video || video.readyState < 2) {
      setError('Screen stream is not ready to capture frames. Please try again.');
      return;
    }

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setError('Could not initialize 2D canvas context.');
      return;
    }

    try {
      // Shutter visual and auditory feedback
      setFlash(true);
      playShutterSound();
      setTimeout(() => setFlash(false), 200);

      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/png');

      const newItem: ScreenshotItem = {
        id: 'ss_' + Math.random().toString(36).substring(2, 11),
        originalUrl: dataUrl,
        previewUrl: dataUrl,
        width,
        height,
        timestamp: Date.now(),
        label: `Capture from ${streamItem.label}`,
        format: 'png',
        adjustments: { ...DEFAULT_ADJUSTMENTS },
        filter: 'normal',
      };

      setScreenshots((prev) => [newItem, ...prev]);
      setActiveId(newItem.id);

      // Reset editor parameters to default
      setAdjustments({ ...DEFAULT_ADJUSTMENTS });
      setActiveFilter('normal');
    } catch (e: any) {
      console.error('Frame capture failed:', e);
      setError('Failed to capture screen frame due to browser rendering policies.');
    }
  };

  // Extract base64 image representation from a live stream element
  const getStreamFrameBase64 = (streamId: string): string | null => {
    const video = document.getElementById(`video-${streamId}`) as HTMLVideoElement | null;
    if (!video || video.readyState < 2) return null;

    const canvas = document.createElement('canvas');
    // Scale down slightly to ensure rapid API communication
    canvas.width = 1024;
    canvas.height = 576;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (e) {
      console.error('Failed to capture stream frame for AI:', e);
      return null;
    }
  };

  // Run a vision context analysis to post an alert notification
  const handleContextScan = async () => {
    const activeStreams = streams.filter((s) => s.isActive && s.stream);
    if (activeStreams.length === 0) {
      setError('Please add at least one active Screen Stream to perform a context scan.');
      return;
    }

    setIsScanning(true);
    try {
      const screensPayload = activeStreams.map((s) => {
        const base64 = getStreamFrameBase64(s.id);
        return {
          id: s.id,
          label: s.label,
          base64: base64
        };
      }).filter((s) => s.base64 !== null);

      const response = await fetch('/api/scan-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screens: screensPayload })
      });

      if (!response.ok) {
        throw new Error('Server returned an error while scanning context.');
      }

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          id: 'scan_' + Math.random().toString(36).substring(2, 11),
          sender: 'system',
          text: data.notification || 'Screens scanned. No updates found.',
          timestamp: Date.now(),
          isNotification: true,
          analyzedScreens: activeStreams.map((s) => s.label)
        }
      ]);
    } catch (err: any) {
      console.error(err);
      setError('Context Scan failed: ' + err.message);
    } finally {
      setIsScanning(false);
    }
  };

  // Submit chat prompt to Gemini with current screen context
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() && !includeScreens) return;

    const queryText = inputValue.trim();
    setInputValue('');

    const activeStreams = streams.filter((s) => s.isActive && s.stream);
    const selectedScreenLabels = includeScreens ? activeStreams.map((s) => s.label) : [];

    const userMessage: ChatMessage = {
      id: 'msg_' + Math.random().toString(36).substring(2, 11),
      sender: 'user',
      text: queryText || 'Please analyze my screen feeds right now.',
      timestamp: Date.now(),
      analyzedScreens: selectedScreenLabels
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsSending(true);

    try {
      const screensPayload = includeScreens ? activeStreams.map((s) => {
        const base64 = getStreamFrameBase64(s.id);
        return {
          id: s.id,
          label: s.label,
          base64: base64
        };
      }).filter((s) => s.base64 !== null) : [];

      const response = await fetch('/api/chat-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: queryText,
          history: messages.slice(-10), // Keep a light context window
          screens: screensPayload
        })
      });

      if (!response.ok) {
        throw new Error('Server returned error response.');
      }

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          id: 'msg_' + Math.random().toString(36).substring(2, 11),
          sender: 'assistant',
          text: data.text,
          timestamp: Date.now()
        }
      ]);

    } catch (err: any) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: 'err_' + Math.random().toString(36).substring(2, 11),
          sender: 'system',
          text: `⚠️ **API Error:** Failed to communicate with the Screen Stream AI server. Make sure your \`GEMINI_API_KEY\` is configured in **Settings > Secrets**.`,
          timestamp: Date.now()
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const activeItem = screenshots.find((s) => s.id === activeId);

  // Sync editor adjustments if active screenshot shifts
  useEffect(() => {
    if (activeItem) {
      setAdjustments(activeItem.adjustments);
      setActiveFilter(activeItem.filter);
    }
  }, [activeId]);

  // Update active screenshot settings
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

  // Help calculate browser filter CSS rules
  const getFilterCSSString = (adj: ImageAdjustments, filter: PresetFilter) => {
    let filterString = `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%) blur(${adj.blur}px)`;
    if (adj.grayscale) filterString += ' grayscale(100%)';
    if (adj.sepia) filterString += ' sepia(100%)';
    if (adj.invert) filterString += ' invert(100%)';

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
        } catch (err) {
          console.error(err);
          setError('Clipboard rejected format. Try right-clicking on the preview and copying.');
        }
      }, 'image/png');
    } catch (err) {
      console.error(err);
      setError('Could not prepare screenshot to copy.');
    }
  };

  const handleDownload = async () => {
    if (!activeItem) return;
    try {
      const canvas = await getProcessedCanvas();
      if (!canvas) return;

      const mimeType = exportFormat === 'png' ? 'image/png' : 'image/jpeg';
      const fileExt = exportFormat === 'png' ? 'png' : 'jpg';
      const qual = exportFormat === 'jpeg' ? 0.92 : undefined;

      const dataUrl = canvas.toDataURL(mimeType, qual);
      const link = document.createElement('a');
      link.download = `${activeItem.label.toLowerCase().replace(/\s+/g, '-')}.${fileExt}`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error(err);
      setError('Could not complete download.');
    }
  };

  const handleShare = async () => {
    if (!activeItem) return;
    try {
      const canvas = await getProcessedCanvas();
      if (!canvas) return;

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `${activeItem.label.toLowerCase().replace(/\s+/g, '-')}.png`, {
          type: 'image/png'
        });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: activeItem.label,
            text: 'Screenshot from Screen Stream Workspace.'
          });
          setShareStatus(true);
          setTimeout(() => setShareStatus(false), 2000);
        } else {
          handleCopyToClipboard();
          setError('Browser share not supported. Image has been copied to your clipboard!');
        }
      }, 'image/png');
    } catch (err) {
      console.error(err);
      setError('Could not activate system share.');
    }
  };

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

  // Custom visual message formatter to display markdown, lists, and code blocks beautifully
  const renderMessageContent = (text: string) => {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
      if (part.startsWith('```')) {
        const match = part.match(/```(\w*)\n([\s\S]*?)```/);
        const lang = match ? match[1] : '';
        const code = match ? match[2] : part.slice(3, -3);

        return (
          <div key={index} className={`my-3 font-mono text-[11px] rounded-lg overflow-hidden max-w-full ${
            isDark ? 'bg-black border border-cyan-500/30 text-cyan-400' : 'bg-slate-900 border border-slate-800 text-cyan-300'
          }`}>
            <div className={`flex items-center justify-between px-3 py-1.5 border-b text-[9px] font-sans ${
              isDark ? 'bg-zinc-950 border-zinc-900 text-zinc-500' : 'bg-slate-950 border-slate-900 text-slate-400'
            }`}>
              <span className="font-semibold uppercase tracking-wider">{lang || 'Code'}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(code);
                }}
                className="hover:text-white transition-colors cursor-pointer flex items-center gap-1 font-semibold"
              >
                <Copy className="h-3 w-3" /> Copy
              </button>
            </div>
            <pre className="p-3.5 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed select-all">{code.trim()}</pre>
          </div>
        );
      }

      const lines = part.split('\n');
      return (
        <div key={index} className={`space-y-1.5 leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-800'}`}>
          {lines.map((line, lineIdx) => {
            if (line.startsWith('### ')) {
              return <h4 key={lineIdx} className={`text-xs font-bold mt-2.5 mb-1 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>{line.replace('### ', '')}</h4>;
            }
            if (line.startsWith('## ')) {
              return <h3 key={lineIdx} className={`text-sm font-bold mt-3 mb-1.5 border-b pb-1 ${
                isDark ? 'text-fuchsia-400 border-zinc-800' : 'text-fuchsia-600 border-slate-200'
              }`}>{line.replace('## ', '')}</h3>;
            }
            if (line.startsWith('- ') || line.startsWith('* ')) {
              return (
                <li key={lineIdx} className="ml-4 list-disc text-xs">
                  {renderInlineMarkdown(line.slice(2))}
                </li>
              );
            }
            return <p key={lineIdx} className="text-xs">{renderInlineMarkdown(line)}</p>;
          })}
        </div>
      );
    });
  };

  const renderInlineMarkdown = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx} className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  // Black and Neon Styling Helpers
  const sBgMain = isDark ? 'bg-black text-slate-100' : 'bg-slate-50 text-slate-900';
  const sBgPanel = isDark ? 'bg-zinc-950 border-zinc-900' : 'bg-white border-slate-200 shadow-sm';
  const sBorder = isDark ? 'border-zinc-900' : 'border-slate-200';
  const sHeaderBg = isDark ? 'bg-black/90' : 'bg-white/95';
  const sCard = isDark ? 'bg-zinc-950/40 border-zinc-900' : 'bg-white border-slate-200/80 shadow-xs';
  const sInput = isDark ? 'bg-zinc-900/60 border-zinc-800 text-slate-100 focus:border-cyan-400 focus:ring-cyan-400/20' : 'bg-slate-100 border-slate-200 text-slate-900 focus:border-cyan-600 focus:ring-cyan-600/20';
  const sMuted = isDark ? 'text-zinc-500' : 'text-slate-500';
  const sMutedDarker = isDark ? 'text-zinc-600' : 'text-slate-400';
  const sBtnDefault = isDark 
    ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white' 
    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200';
  
  // Neon Accents
  const neonCyanText = isDark ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]' : 'text-cyan-600 font-bold';
  const neonCyanBtn = isDark ? 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_12px_rgba(6,182,212,0.45)]' : 'bg-cyan-600 hover:bg-cyan-500 text-white';
  const neonPinkText = isDark ? 'text-fuchsia-400 drop-shadow-[0_0_8px_rgba(232,121,249,0.4)]' : 'text-fuchsia-600 font-bold';
  const neonPinkBtn = isDark ? 'bg-fuchsia-500 hover:bg-fuchsia-400 text-black shadow-[0_0_12px_rgba(217,70,239,0.45)]' : 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white';
  const neonLimeText = isDark ? 'text-lime-400 drop-shadow-[0_0_8px_rgba(163,230,53,0.4)]' : 'text-lime-600 font-bold';
  const neonLimeBtn = isDark ? 'bg-lime-500 hover:bg-lime-400 text-black shadow-[0_0_12px_rgba(132,204,22,0.45)]' : 'bg-lime-600 hover:bg-lime-500 text-white';
  const sActiveGridBorder = isDark ? 'border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.3)]' : 'border-cyan-500 ring-2 ring-cyan-500/20 shadow-md';

  return (
    <div className={`min-h-screen ${sBgMain} font-sans flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200 transition-colors duration-300`} id="app-viewport">
      {/* visual camera flash */}
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
      <header className={`flex h-16 items-center justify-between border-b ${sBorder} ${sHeaderBg} backdrop-blur-xl px-6 sticky top-0 z-40 transition-colors duration-300`} id="main-header">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${isDark ? 'from-cyan-500 to-indigo-500 shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'from-cyan-600 to-indigo-600'} text-white`}>
            <Monitor className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-tight flex items-center gap-2">
              <span className={isDark ? 'text-white' : 'text-slate-900'}>Screen Stream</span> 
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold font-mono border ${
                isDark ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.2)]' : 'bg-cyan-50 border-cyan-200 text-cyan-700'
              }`}>AI WORKSPACE</span>
            </h1>
            <p className={`text-[10px] font-mono ${sMuted}`}>
              Live context-aware screen analyzer & developer copilot
            </p>
          </div>
        </div>

        {/* Global actions and metrics */}
        <div className="flex items-center gap-3">
          
          {/* Light / Dark Neon Theme Selector */}
          <button
            onClick={() => setTheme(isDark ? 'neon-light' : 'neon-dark')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all duration-300 cursor-pointer ${
              isDark
                ? 'bg-zinc-900 border-zinc-800 text-amber-400 hover:bg-zinc-800 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs'
            }`}
            id="theme-toggle-btn"
            title="Toggle Light/Dark Neon Theme"
          >
            {isDark ? (
              <>
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-slate-300">Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5 text-slate-700" />
                <span>Dark Mode</span>
              </>
            )}
          </button>

          <div className={`hidden md:flex items-center gap-3 text-[11px] font-mono ${sMuted} border-r ${sBorder} pr-3`}>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
              isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-slate-100 border-slate-200 text-slate-700'
            }`}>
              <Activity className={`h-3.5 w-3.5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
              Streams: <span className="font-bold">{streams.length}/10</span>
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
              isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-slate-100 border-slate-200 text-slate-700'
            }`}>
              <ImageIcon className={`h-3.5 w-3.5 ${isDark ? 'text-fuchsia-400' : 'text-fuchsia-600'}`} />
              Gallery: <span className="font-bold">{screenshots.length}</span>
            </div>
          </div>

          {isInIframe && (
            <a
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                isDark 
                  ? 'border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400' 
                  : 'border-cyan-600/30 bg-cyan-50 hover:bg-cyan-100 text-cyan-700'
              }`}
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
        <div className={`border-b px-6 py-2.5 flex items-center justify-between gap-3 text-xs ${
          isDark ? 'bg-amber-500/10 border-amber-500/25 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-800'
        }`} id="error-alert-bar">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-[11px] font-bold underline hover:opacity-80 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Main split three-pane workspace */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden" id="main-workspace-frame">
        
        {/* Panel 1: Screen Stream Wall (Grid) */}
        <div className={`flex-1 flex flex-col p-4 border-r ${sBorder} overflow-y-auto`} id="left-streams-column">
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-0.5">
              <h3 className={`text-xs font-extrabold uppercase tracking-wider font-mono flex items-center gap-1.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                <Monitor className={`h-4 w-4 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} /> Screen Stream Grid ({streams.length})
              </h3>
              <p className={`text-[10px] ${sMuted}`}>
                Each stream connects to an individual tab or window
              </p>
            </div>
            
            <button
              onClick={addScreenStream}
              disabled={streams.length >= 10}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                streams.length >= 10 
                  ? (isDark ? 'bg-zinc-900 text-zinc-600' : 'bg-slate-200 text-slate-400')
                  : neonCyanBtn
              }`}
              id="btn-add-stream"
            >
              <Plus className="h-4 w-4" /> Add Screen Stream
            </button>
          </div>

          {/* Screen Streams Grid Layout */}
          {streams.length === 0 ? (
            <div className={`flex-1 flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed ${sBorder} ${isDark ? 'bg-zinc-950/20' : 'bg-white'} my-4 max-w-2xl mx-auto space-y-4`} id="streams-empty-state">
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${
                isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-500' : 'bg-slate-100 border-slate-200 text-slate-400'
              }`}>
                <Monitor className="h-7 w-7" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h4 className={`text-xs font-bold uppercase tracking-wider font-mono ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>No Screens Connected</h4>
                <p className={`text-[11px] ${sMuted}`}>
                  Select windows, browser tabs, or whole monitors to build your real-time video streaming setup. You can combine up to 10 active streams in parallel!
                </p>
              </div>

              {isInIframe ? (
                <div className={`border rounded-xl p-3.5 max-w-md text-left ${
                  isDark ? 'bg-cyan-500/5 border-cyan-500/15' : 'bg-cyan-50 border-cyan-100'
                }`}>
                  <p className={`text-[10px] leading-normal flex items-start gap-1.5 font-mono ${isDark ? 'text-cyan-300' : 'text-cyan-800'}`}>
                    <Info className={`h-4 w-4 shrink-0 mt-0.5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                    <span>
                      <strong>Chrome Policy Notice:</strong> Browser security restricts screen-sharing inside embedded iframes. Click **"Launch in New Tab"** to capture your screen streams seamlessly.
                    </span>
                  </p>
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`mt-3 flex items-center justify-center gap-1.5 text-[10px] font-bold py-2 px-4 rounded-lg transition-colors cursor-pointer ${neonCyanBtn}`}
                  >
                    <Maximize2 className="h-3 w-3" /> Launch in New Tab
                  </a>
                </div>
              ) : (
                <button
                  onClick={addScreenStream}
                  className={`rounded-lg border px-4 py-2 text-[11px] font-bold transition-colors cursor-pointer ${sBtnDefault}`}
                >
                  Connect Screen Feed
                </button>
              )}
            </div>
          ) : (
            <div className={`grid gap-4 mt-2 ${
              streams.length === 1 ? 'grid-cols-1' :
              streams.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
              streams.length === 3 || streams.length === 4 ? 'grid-cols-2' :
              'grid-cols-2 xl:grid-cols-3'
            }`} id="streams-grids-container">
              {streams.map((item) => (
                <div key={item.id} className={`rounded-xl border ${sBorder} ${isDark ? 'bg-zinc-950/40' : 'bg-white'} overflow-hidden relative group shadow-lg flex flex-col transition-all duration-300`}>
                  {/* Card Header controls */}
                  <div className={`px-3 py-2 border-b ${sBorder} flex items-center justify-between gap-2 ${isDark ? 'bg-zinc-950/90' : 'bg-slate-50'}`}>
                    <input
                      type="text"
                      value={item.label}
                      onChange={(e) => {
                        const val = e.target.value;
                        setStreams(list => list.map(st => st.id === item.id ? { ...st, label: val } : st));
                      }}
                      className={`bg-transparent border-0 font-mono text-[11px] font-bold focus:outline-none truncate max-w-[150px] focus:underline ${
                        isDark ? 'text-zinc-300 focus:text-white' : 'text-slate-700 focus:text-black'
                      }`}
                    />
                    <div className="flex items-center gap-2">
                      <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className={`text-[9px] font-mono font-semibold uppercase tracking-widest ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>LIVE</span>
                    </div>
                  </div>

                  {/* Video Viewport Container */}
                  <div className={`aspect-video relative overflow-hidden flex items-center justify-center ${isDark ? 'bg-black' : 'bg-slate-100'}`}>
                    <video
                      id={`video-${item.id}`}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-contain"
                    />

                    {/* Hover tools layer */}
                    <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-3 ${
                      isDark ? 'bg-black/60' : 'bg-white/60'
                    }`}>
                      <button
                        onClick={() => captureFrameFromStream(item)}
                        className={`p-2.5 rounded-full text-black shadow-xl transition-transform active:scale-90 cursor-pointer ${
                          isDark ? 'bg-cyan-400 hover:bg-cyan-300' : 'bg-cyan-500 text-white hover:bg-cyan-600'
                        }`}
                        title="Take Screenshot and edit in Workbench"
                      >
                        <Camera className="h-4.5 w-4.5" />
                      </button>
                      <button
                        onClick={() => disconnectStream(item.id)}
                        className="p-2.5 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-xl transition-transform active:scale-90 cursor-pointer"
                        title="Disconnect Feed"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
                    </div>
                  </div>

                  {/* Card bottom details */}
                  <div className={`p-2 flex items-center justify-between text-[9px] font-mono ${isDark ? 'bg-black/80 text-zinc-500' : 'bg-slate-50 text-slate-400'}`}>
                    <span>Source: DisplayMedia API</span>
                    <button
                      onClick={() => captureFrameFromStream(item)}
                      className={`font-semibold flex items-center gap-1 hover:opacity-80 transition-opacity ${
                        isDark ? 'text-cyan-400' : 'text-cyan-600'
                      }`}
                    >
                      <Camera className="h-3 w-3" /> Snap Frame
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel 2: Live AI Developer Chat (Middle) */}
        <div className={`w-full lg:w-[420px] border-t lg:border-t-0 lg:border-r ${sBorder} ${isDark ? 'bg-zinc-950/40' : 'bg-white'} flex flex-col shrink-0 overflow-hidden transition-colors duration-300`} id="middle-chat-column">
          {/* Chat Header and active scans */}
          <div className={`p-4 border-b ${sBorder} flex items-center justify-between gap-3 ${isDark ? 'bg-zinc-950/80' : 'bg-slate-50'}`}>
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Sparkles className={`h-4 w-4 ${isDark ? 'text-fuchsia-400' : 'text-fuchsia-600'}`} /> 
                <span className={isDark ? 'text-zinc-200' : 'text-slate-800'}>Screen Stream AI</span>
              </h3>
              <p className={`text-[10px] ${sMuted}`}>
                Ask anything about your stream context
              </p>
            </div>

            <button
              onClick={handleContextScan}
              disabled={isScanning || streams.length === 0}
              className={`flex items-center gap-1.5 rounded-lg border text-[10px] font-bold px-2.5 py-1.5 transition-all disabled:opacity-50 cursor-pointer font-mono ${
                isDark 
                  ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700' 
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Bell className={`h-3 w-3 text-yellow-500 ${isScanning ? 'animate-bounce' : ''}`} />
              {isScanning ? 'Scanning...' : 'Scan Context'}
            </button>
          </div>

          {/* Chat log viewport */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" id="chat-messages-container">
            {messages.map((msg) => {
              if (msg.sender === 'system') {
                return (
                  <div
                    key={msg.id}
                    className={`rounded-xl p-3.5 text-xs border transition-all ${
                      msg.isNotification
                        ? (isDark 
                          ? 'bg-cyan-500/5 border-cyan-500/10 text-cyan-300 relative overflow-hidden shadow-[0_0_10px_rgba(6,182,212,0.05)]' 
                          : 'bg-cyan-50 border-cyan-100 text-cyan-800 relative overflow-hidden')
                        : (isDark 
                          ? 'bg-zinc-900/60 border-zinc-900 text-zinc-400' 
                          : 'bg-slate-100 border-slate-200 text-slate-600')
                    }`}
                  >
                    {msg.isNotification && (
                      <div className="absolute top-2.5 right-2.5 flex h-4 w-4 items-center justify-center text-cyan-500">
                        <Bell className="h-3 w-3 animate-pulse" />
                      </div>
                    )}
                    <div className="space-y-1">
                      {msg.isNotification && (
                        <span className={`text-[9px] font-bold font-mono uppercase tracking-widest block mb-1 ${
                          isDark ? 'text-cyan-400' : 'text-cyan-600'
                        }`}>
                          System Notification
                        </span>
                      )}
                      <div>{renderMessageContent(msg.text)}</div>
                      {msg.analyzedScreens && (
                        <div className="mt-2.5 flex flex-wrap gap-1 items-center">
                          <span className={`text-[8px] font-mono ${sMuted}`}>Scanned Sources:</span>
                          {msg.analyzedScreens.map((lbl, idx) => (
                            <span key={idx} className={`border px-1 py-0.2 rounded text-[8px] font-mono ${
                              isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                            }`}>
                              {lbl}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              const isUser = msg.sender === 'user';
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] rounded-xl px-4 py-3 space-y-1 text-xs shadow-md transition-all ${
                    isUser
                      ? (isDark 
                        ? 'bg-cyan-500 text-black font-semibold rounded-tr-none shadow-[0_0_15px_rgba(34,211,238,0.35)]' 
                        : 'bg-cyan-600 text-white rounded-tr-none')
                      : (isDark 
                        ? 'bg-zinc-900 border border-zinc-800 text-slate-100 rounded-tl-none shadow-[0_4px_12px_rgba(0,0,0,0.5)]' 
                        : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none')
                  }`}>
                    {/* Header bar indicating parsed visual context */}
                    {!isUser && (
                      <div className={`flex items-center gap-1 text-[9px] font-extrabold tracking-widest uppercase font-mono mb-1 ${
                        isDark ? 'text-fuchsia-400 drop-shadow-[0_0_8px_rgba(232,121,249,0.3)]' : 'text-fuchsia-600'
                      }`}>
                        <Sparkles className="h-3 w-3" /> Screen Stream AI
                      </div>
                    )}

                    {/* Main content body */}
                    <div>
                      {isUser ? <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p> : renderMessageContent(msg.text)}
                    </div>

                    {/* Scanned streams footer metadata */}
                    {isUser && msg.analyzedScreens && msg.analyzedScreens.length > 0 && (
                      <div className={`mt-2.5 pt-1.5 border-t flex flex-wrap gap-1 items-center ${
                        isDark ? 'border-black/20' : 'border-white/20'
                      }`}>
                        <span className={`text-[8px] font-mono ${isDark ? 'text-cyan-950 font-bold' : 'text-cyan-100'}`}>📎 Sent with screen context:</span>
                        {msg.analyzedScreens.map((lbl, idx) => (
                          <span key={idx} className={`px-1 rounded text-[8px] font-mono ${
                            isDark ? 'bg-cyan-700/60 border border-cyan-600 text-white' : 'bg-cyan-700 text-white'
                          }`}>
                            {lbl}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div className="flex justify-start">
                <div className={`border rounded-xl rounded-tl-none px-4 py-3 text-xs space-y-2 max-w-[90%] ${
                  isDark ? 'bg-zinc-900 border-zinc-850' : 'bg-slate-100 border-slate-200'
                }`}>
                  <div className={`flex items-center gap-1.5 text-[9px] font-bold font-mono uppercase tracking-wider ${
                    isDark ? 'text-cyan-400' : 'text-cyan-700'
                  }`}>
                    <Sparkles className="h-3.5 w-3.5 animate-spin" />
                    Analyzing your screens...
                  </div>
                  <div className="flex gap-1 items-center justify-center">
                    <span className={`w-1.5 h-1.5 rounded-full animate-bounce delay-100 ${isDark ? 'bg-cyan-400' : 'bg-cyan-600'}`} />
                    <span className={`w-1.5 h-1.5 rounded-full animate-bounce delay-200 ${isDark ? 'bg-cyan-400' : 'bg-cyan-600'}`} />
                    <span className={`w-1.5 h-1.5 rounded-full animate-bounce delay-300 ${isDark ? 'bg-cyan-400' : 'bg-cyan-600'}`} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat action input area */}
          <div className={`p-4 border-t ${sBorder} ${isDark ? 'bg-black/90' : 'bg-white/90'} backdrop-blur`} id="chat-input-container">
            <form onSubmit={handleSendMessage} className="space-y-3">
              <div className="relative">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask Screen Stream AI... (e.g., 'What code structure is displayed? help me build a landing page for it!')"
                  className={`w-full rounded-xl py-3 pl-3 pr-11 text-xs resize-none h-20 transition-all ${sInput}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={isSending || (!inputValue.trim() && !includeScreens)}
                  className={`absolute bottom-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                    isSending || (!inputValue.trim() && !includeScreens)
                      ? (isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-slate-200 text-slate-400')
                      : (isDark ? 'bg-cyan-400 text-black hover:bg-cyan-300' : 'bg-cyan-600 text-white hover:bg-cyan-700')
                  }`}
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Advanced chat settings toggles */}
              <div className="flex items-center justify-between">
                <label className={`flex items-center gap-2 text-[10px] font-semibold font-mono cursor-pointer select-none ${sMuted}`}>
                  <input
                    type="checkbox"
                    checked={includeScreens}
                    onChange={(e) => setIncludeScreens(e.target.checked)}
                    className={`rounded border bg-transparent h-3 w-3 ${
                      isDark ? 'border-zinc-800 text-cyan-400 accent-cyan-400' : 'border-slate-300 text-cyan-600 accent-cyan-600'
                    }`}
                  />
                  <span>Include Screen context ({streams.filter((s) => s.isActive && s.stream).length} active)</span>
                </label>

                {streams.length > 0 && (
                  <button
                    type="button"
                    onClick={handleContextScan}
                    className={`text-[9px] font-mono font-bold hover:underline ${
                      isDark ? 'text-cyan-400' : 'text-cyan-600'
                    }`}
                  >
                    Quick context alert
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* Panel 3: Snapped Gallery & Image Workbench (Right) */}
        <div className={`w-full lg:w-[380px] border-t lg:border-t-0 ${isDark ? 'bg-zinc-950/20' : 'bg-white'} flex flex-col shrink-0 overflow-y-auto transition-colors duration-300`} id="right-gallery-column">
          
          {/* Section: Snapped Roll */}
          <div className={`p-4 border-b ${sBorder} space-y-3`}>
            <div className="flex items-center justify-between">
              <h3 className={`text-xs font-bold uppercase tracking-wider font-mono flex items-center gap-1.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                <Clock className="h-3.5 w-3.5" /> Snapped Photos ({screenshots.length})
              </h3>
              {screenshots.length > 0 && (
                <button
                  onClick={() => {
                    setScreenshots([]);
                    setActiveId(null);
                  }}
                  className={`text-[10px] font-medium font-mono transition-colors cursor-pointer ${
                    isDark ? 'text-zinc-500 hover:text-red-400' : 'text-slate-400 hover:text-red-600'
                  }`}
                >
                  Clear all
                </button>
              )}
            </div>

            {screenshots.length === 0 ? (
              <div className={`rounded-xl border border-dashed py-6 text-center text-[10px] font-mono ${
                isDark ? 'border-zinc-900 text-zinc-600' : 'border-slate-200 text-slate-400'
              }`}>
                No screenshots captured. Hover over any stream card to capture.
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1" id="gallery-scroller">
                {screenshots.map((item) => {
                  const isActive = item.id === activeId;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setActiveId(item.id)}
                      className={`relative shrink-0 w-24 rounded-lg border p-1.5 overflow-hidden cursor-pointer transition-all ${
                        isActive
                          ? (isDark ? 'border-cyan-400 ring-1 ring-cyan-400/20 bg-zinc-900/60' : 'border-cyan-500 ring-1 ring-cyan-500/10 bg-slate-100')
                          : (isDark ? 'border-zinc-900 bg-zinc-950/20 hover:border-zinc-800' : 'border-slate-200 bg-slate-50 hover:border-slate-300')
                      }`}
                    >
                      <div className={`aspect-video rounded overflow-hidden relative ${isDark ? 'bg-black' : 'bg-slate-200'}`}>
                        <img
                          src={item.originalUrl}
                          alt={item.label}
                          className="w-full h-full object-cover"
                          style={{ filter: getFilterCSSString(item.adjustments, item.filter) }}
                        />
                        <button
                          onClick={(e) => deleteScreenshot(item.id, e)}
                          className={`absolute top-0.5 right-0.5 p-0.5 rounded border transition-colors cursor-pointer ${
                            isDark 
                              ? 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:bg-red-950/40 hover:text-red-400 hover:border-red-500/20' 
                              : 'bg-white/80 border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                          }`}
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                      <p className={`mt-1 text-[9px] font-semibold truncate ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                        {item.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section: Workbench Details */}
          {activeItem ? (
            <div className="p-4 space-y-5" id="workbench-active-container">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold uppercase tracking-wider font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Image Workbench
                  </span>
                  <span className={`text-[9px] font-mono border px-1.5 py-0.5 rounded ${
                    isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}>
                    {activeItem.width}x{activeItem.height} px
                  </span>
                </div>

                {/* Main image container */}
                <div className={`relative aspect-video rounded-xl border overflow-hidden group shadow-md ${
                  isDark ? 'border-zinc-900 bg-black' : 'border-slate-200 bg-slate-100'
                }`}>
                  <img
                    src={activeItem.originalUrl}
                    alt={activeItem.label}
                    className="w-full h-full object-contain"
                    style={{ filter: getFilterCSSString(adjustments, activeFilter) }}
                  />
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className={`rounded px-2 py-1 text-[8px] font-mono border ${
                      isDark ? 'bg-zinc-950/90 border-zinc-850 text-cyan-400' : 'bg-white/90 border-slate-200 text-slate-600'
                    }`}>
                      Baking Live Filters
                    </span>
                  </div>
                </div>

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
                  className={`w-full bg-transparent border-b focus:outline-none text-xs font-semibold py-1 transition-colors ${
                    isDark ? 'border-zinc-800 hover:border-zinc-700 focus:border-cyan-400 text-slate-100' : 'border-slate-200 hover:border-slate-300 focus:border-cyan-600 text-slate-900'
                  }`}
                  placeholder="Screenshot Label"
                />
              </div>

              {/* Export Panel */}
              <div className="space-y-2.5">
                <div className={`flex items-center justify-between text-[9px] font-mono ${sMuted}`}>
                  <span>Export Actions</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setExportFormat('png')}
                      className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase cursor-pointer ${
                        exportFormat === 'png' 
                          ? (isDark ? 'bg-cyan-500 text-black font-extrabold shadow-[0_0_8px_rgba(6,182,212,0.4)]' : 'bg-cyan-600 text-white')
                          : (isDark ? 'bg-zinc-900 text-zinc-500' : 'bg-slate-200 text-slate-500')
                      }`}
                    >
                      PNG
                    </button>
                    <button
                      onClick={() => setExportFormat('jpeg')}
                      className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase cursor-pointer ${
                        exportFormat === 'jpeg' 
                          ? (isDark ? 'bg-cyan-500 text-black font-extrabold shadow-[0_0_8px_rgba(6,182,212,0.4)]' : 'bg-cyan-600 text-white')
                          : (isDark ? 'bg-zinc-900 text-zinc-500' : 'bg-slate-200 text-slate-500')
                      }`}
                    >
                      JPG
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleCopyToClipboard}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-bold transition-colors cursor-pointer ${
                      isDark 
                        ? 'bg-zinc-900 hover:bg-zinc-850 border-zinc-800 text-slate-300' 
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                    }`}
                  >
                    {copyStatus ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className={`h-3.5 w-3.5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />}
                    <span>{copyStatus ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    onClick={handleShare}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-bold transition-colors cursor-pointer ${
                      isDark 
                        ? 'bg-zinc-900 hover:bg-zinc-850 border-zinc-800 text-slate-300' 
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                    }`}
                  >
                    {shareStatus ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Share2 className={`h-3.5 w-3.5 ${isDark ? 'text-fuchsia-400' : 'text-fuchsia-600'}`} />}
                    <span>{shareStatus ? 'Shared' : 'OS Share'}</span>
                  </button>
                </div>

                <button
                  onClick={handleDownload}
                  className={`w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-white transition-all cursor-pointer ${neonCyanBtn}`}
                >
                  <Download className="h-3.5 w-3.5" /> Download Snapshot
                </button>
              </div>

              {/* Filters list */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <span className={`block text-[10px] font-bold uppercase tracking-wider font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Mood Filters
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['normal', 'vintage', 'cool', 'warm', 'monochrome', 'high-contrast', 'faded'] as PresetFilter[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => updateActiveFilter(f)}
                        className={`py-1 text-[9px] font-bold rounded border transition-all truncate cursor-pointer ${
                          activeFilter === f
                            ? (isDark ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.15)]' : 'border-cyan-600 bg-cyan-50 text-cyan-700')
                            : (isDark ? 'border-zinc-900 bg-zinc-900/20 text-zinc-500 hover:border-zinc-800' : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300')
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Adjustments */}
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold uppercase tracking-wider font-mono flex items-center gap-1.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                      <Sliders className="h-3 w-3" /> Sliders
                    </span>
                    <button
                      onClick={() => updateActiveAdjustments(DEFAULT_ADJUSTMENTS)}
                      className={`text-[9px] font-mono cursor-pointer ${isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Reset
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-mono text-slate-400">
                      <span>Brightness</span>
                      <span>{adjustments.brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={adjustments.brightness}
                      onChange={(e) => updateActiveAdjustments({ brightness: parseInt(e.target.value) })}
                      className="w-full accent-cyan-400 cursor-pointer h-1 bg-zinc-800 rounded appearance-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-mono text-slate-400">
                      <span>Contrast</span>
                      <span>{adjustments.contrast}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={adjustments.contrast}
                      onChange={(e) => updateActiveAdjustments({ contrast: parseInt(e.target.value) })}
                      className="w-full accent-cyan-400 cursor-pointer h-1 bg-zinc-800 rounded appearance-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-mono text-slate-400">
                      <span>Saturation</span>
                      <span>{adjustments.saturation}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={adjustments.saturation}
                      onChange={(e) => updateActiveAdjustments({ saturation: parseInt(e.target.value) })}
                      className="w-full accent-cyan-400 cursor-pointer h-1 bg-zinc-800 rounded appearance-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-mono text-slate-400">
                      <span>Blur</span>
                      <span>{adjustments.blur}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={adjustments.blur}
                      onChange={(e) => updateActiveAdjustments({ blur: parseInt(e.target.value) })}
                      className="w-full accent-cyan-400 cursor-pointer h-1 bg-zinc-800 rounded appearance-none"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    <button
                      onClick={() => updateActiveAdjustments({ grayscale: !adjustments.grayscale })}
                      className={`py-1.5 text-[9px] font-semibold rounded border transition-all text-center cursor-pointer ${
                        adjustments.grayscale 
                          ? (isDark ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300' : 'border-cyan-600 bg-cyan-50 text-cyan-700') 
                          : (isDark ? 'border-zinc-900 bg-zinc-900/10 text-zinc-500 hover:border-zinc-800' : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300')
                      }`}
                    >
                      Grayscale
                    </button>
                    <button
                      onClick={() => updateActiveAdjustments({ sepia: !adjustments.sepia })}
                      className={`py-1.5 text-[9px] font-semibold rounded border transition-all text-center cursor-pointer ${
                        adjustments.sepia 
                          ? (isDark ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300' : 'border-cyan-600 bg-cyan-50 text-cyan-700') 
                          : (isDark ? 'border-zinc-900 bg-zinc-900/10 text-zinc-500 hover:border-zinc-800' : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300')
                      }`}
                    >
                      Sepia
                    </button>
                    <button
                      onClick={() => updateActiveAdjustments({ invert: !adjustments.invert })}
                      className={`py-1.5 text-[9px] font-semibold rounded border transition-all text-center cursor-pointer ${
                        adjustments.invert 
                          ? (isDark ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300' : 'border-cyan-600 bg-cyan-50 text-cyan-700') 
                          : (isDark ? 'border-zinc-900 bg-zinc-900/10 text-zinc-500 hover:border-zinc-800' : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300')
                      }`}
                    >
                      Invert
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
                isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-600' : 'bg-slate-100 border-slate-200 text-slate-400'
              }`}>
                <ImageIcon className="h-5 w-5" />
              </div>
              <div className="space-y-1 max-w-xs">
                <h4 className={`text-[11px] font-bold uppercase tracking-wider font-mono ${isDark ? 'text-zinc-450' : 'text-slate-600'}`}>Workbench Unloaded</h4>
                <p className={`text-[10px] leading-normal ${sMuted}`}>
                  Hover over any active stream video panel and click **"Snap Frame"** to load screenshots in the custom edit workbench.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
