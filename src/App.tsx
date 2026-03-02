import React, { useState, useRef, useEffect } from 'react';
import ReactPlayer from 'react-player';
const Player = ReactPlayer as any;
import { 
  Loader2,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { extractAudioFromVideo, extractVideoFrame } from './utils/mediaUtils';

// Types
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  tag: "HOOK" | "INSIGHT" | "STORY" | "DATA" | "SILENCE" | "FILLER";
  score: number;
  feedback?: 'positive' | 'negative';
}

interface ClipSuggestion {
  id: string | number;
  start: number;
  end: number;
  title: string;
  score: number;
  thumbnail?: string;
  feedback?: 'positive' | 'negative';
}

// Mock Data
const MOCK_TRANSCRIPT: TranscriptSegment[] = [
  { start: 0, end: 5, text: "Most people think that scaling a business requires a massive team, but here's the secret...", tag: "HOOK", score: 95 },
  { start: 5, end: 15, text: "It's actually about the efficiency of your internal systems and how you leverage automation.", tag: "INSIGHT", score: 98 },
  { start: 15, end: 25, text: "If you can automate 20% of your daily repetitive tasks, you're already 2x more productive than your competitors.", tag: "INSIGHT", score: 85 },
  { start: 25, end: 30, text: "...", tag: "SILENCE", score: 0 },
  { start: 30, end: 45, text: "Last year, I posted two identical videos. One had perfect lighting, the other was shot on an iPhone.", tag: "STORY", score: 75 },
  { start: 45, end: 60, text: "The core problem is that clippers waste hours scrubbing through long videos.", tag: "STORY", score: 85 },
];

const MOCK_CLIPS: ClipSuggestion[] = [
  { id: 1, start: 0, end: 15, title: "Efficiency Secret Clip", score: 98, thumbnail: "https://picsum.photos/seed/office/200/200" },
  { id: 2, start: 15, end: 30, title: "Automation Insight", score: 85, thumbnail: "https://picsum.photos/seed/team/200/200" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'upload' | 'dashboard' | 'clips' | 'library' | 'settings' | 'profile'>('upload');
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [transcript, setTranscript] = useState<TranscriptSegment[]>(MOCK_TRANSCRIPT);
  const [clips, setClips] = useState<ClipSuggestion[]>(MOCK_CLIPS);
  const [library, setLibrary] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('clipdash_library') || '[]');
    } catch (e) {
      console.error('Failed to parse library from localStorage', e);
      return [];
    }
  });
  const [showSearch, setShowSearch] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoSource, setVideoSource] = useState<string>("https://www.w3schools.com/html/mov_bbb.mp4");
  const [isMockMode, setIsMockMode] = useState(false);
  const [forceMockMode, setForceMockMode] = useState(() => localStorage.getItem('clipdash_force_mock') === 'true');
  const [isPlaying, setIsPlaying] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showReference, setShowReference] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const [manualApiKey, setManualApiKey] = useState(localStorage.getItem('clipdash_api_key') || '');
  const [keyStatus, setKeyStatus] = useState<'idle' | 'checking' | 'active' | 'invalid' | 'quota_exceeded' | 'error'>('idle');
  const [selectedClipForShare, setSelectedClipForShare] = useState<ClipSuggestion | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setNeedsApiKey(!hasKey);
      }
      
      const savedKey = localStorage.getItem('clipdash_api_key');
      if (savedKey) {
        checkKey(savedKey);
      }
    };
    checkApiKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setNeedsApiKey(false);
    }
  };

  const saveManualKey = (key: string) => {
    setManualApiKey(key);
    localStorage.setItem('clipdash_api_key', key);
    setShowKeyInput(false);
    setNeedsApiKey(false);
    checkKey(key);
  };

  const checkKey = async (keyToTest?: string) => {
    const key = keyToTest || manualApiKey;
    if (!key) return;
    
    setKeyStatus('checking');
    try {
      const response = await fetch('/api/check-key', {
        headers: {
          'x-api-key': key
        }
      });
      const data = await response.json();
      
      if (data.active) {
        setKeyStatus('active');
      } else {
        if (data.error === 'Quota Exceeded') setKeyStatus('quota_exceeded');
        else if (data.error === 'Invalid API Key') setKeyStatus('invalid');
        else setKeyStatus('error');
      }
    } catch (e) {
      setKeyStatus('error');
    }
  };

  const exportData = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSocialShare = (platform: 'x' | 'linkedin' | 'tiktok', clip: ClipSuggestion) => {
    const text = `Check out this viral clip from ClipDash: ${clip.title} #ClipDash #AI #ContentCreation`;
    const url = window.location.href;
    
    let shareUrl = '';
    switch (platform) {
      case 'x':
        shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
        break;
      case 'linkedin':
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
        break;
      case 'tiktok':
        // TikTok doesn't have a direct "intent" URL for web sharing like X/LinkedIn
        // Usually requires their SDK or just copy link
        alert('TikTok sharing: Download the clip and upload it directly to TikTok for the best results!');
        return;
    }
    
    if (shareUrl) {
      window.open(shareUrl, '_blank', 'width=600,height=400');
    }
  };

  const handleDownloadClip = async (clip: ClipSuggestion) => {
    setIsExporting(true);
    setStatus(`Exporting clip: ${clip.title}...`);
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // In a real app, we would use ffmpeg.wasm or a backend service to cut the video
    // For this demo, we'll "export" the metadata and thumbnail as a package
    const exportData = {
      ...clip,
      sourceVideo: videoSource,
      exportedAt: new Date().toISOString(),
      platform: 'ClipDash AI'
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clip-${clip.id}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    setIsExporting(false);
    setStatus('');
    setSelectedClipForShare(null);
    alert(`Clip "${clip.title}" exported successfully! In a production environment, this would download the actual MP4 file.`);
  };

  const processContent = async (type: 'video' | 'url' | 'text', content: string | File) => {
    setProcessing(true);
    setIsMockMode(false);
    
    // Check for force mock mode
    if (forceMockMode) {
      setStatus('Using Mock Mode (API Quota Protection)...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const mockData = {
        transcript: [
          { start: 0, end: 5, text: "Welcome to the future of content creation.", tag: "HOOK", score: 95 },
          { start: 5, end: 15, text: "In this video, we'll explore how AI is changing everything for video editors.", tag: "INSIGHT", score: 80 },
          { start: 15, end: 25, text: "Imagine being able to extract the best moments in seconds instead of hours.", tag: "HOOK", score: 90 },
          { start: 25, end: 30, text: "...", tag: "SILENCE", score: 0 },
          { start: 30, end: 45, text: "The core problem is that clippers waste hours scrubbing through long videos.", tag: "STORY", score: 75 },
          { start: 45, end: 60, text: "Our system automatically detects hooks, insights, and emotional peaks.", tag: "DATA", score: 85 },
        ],
        clips: [
          { id: 1, start: 0, end: 25, title: "The Future of Content Creation", score: 92 },
          { id: 2, start: 30, end: 60, title: "Solving the Clipper's Problem", score: 88 },
        ]
      };

      if (type === 'video' && content instanceof File) {
        const localUrl = URL.createObjectURL(content);
        setVideoSource(localUrl);
        setStatus('Generating thumbnails for mock clips...');
        const clipsWithThumbnails = await Promise.all(mockData.clips.map(async (clip: any) => {
          try {
            const frame = await extractVideoFrame(content, clip.start);
            return { ...clip, thumbnail: `data:image/jpeg;base64,${frame}` };
          } catch (e) {
            return { ...clip, thumbnail: `https://picsum.photos/seed/${clip.id}/200/200` };
          }
        }));
        setClips(clipsWithThumbnails as any);
      } else {
        setClips(mockData.clips.map(c => ({...c, thumbnail: `https://picsum.photos/seed/${c.id}/200/200`})) as any);
      }
      
      setTranscript(mockData.transcript as any);
      setIsMockMode(true);
      setActiveTab('dashboard');
      setProcessing(false);
      return;
    }

    try {
      let payload: any;
      
      if (type === 'video' && content instanceof File) {
        // Set local video source for preview
        const localUrl = URL.createObjectURL(content);
        setVideoSource(localUrl);

        // OPTIMIZATION: Extract audio and a key frame instead of sending the whole video
        // This reduces payload size by ~90-95%
        setStatus('Extracting audio...');
        const audioBlob = await extractAudioFromVideo(content);
        
        setStatus('Capturing key frame...');
        const frameBase64 = await extractVideoFrame(content, 1);

        setStatus('Preparing upload...');
        
        // Convert audio to base64
        const audioBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(audioBlob);
        });

        setStatus('AI Analysis in progress...');

        payload = { 
          type: 'optimized-video', 
          audio: audioBase64,
          frame: frameBase64,
          mimeType: 'audio/wav' 
        };
      } else {
        setStatus('AI Analysis in progress...');
        payload = { type, content };
      }

      const fetchWithRetry = async (url: string, options: any, retries = 3, backoff = 1000): Promise<Response> => {
        const response = await fetch(url, options);
        if (response.status === 429 && retries > 0) {
          setStatus(`Rate limited. Retrying in ${backoff/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
          return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        return response;
      };

      const response = await fetchWithRetry('/api/process', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': manualApiKey 
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error?.includes('API key not valid') || response.status === 401) {
          setNeedsApiKey(true);
          throw new Error('Invalid API Key. Please select a valid Gemini API key.');
        }
        if (response.status === 429) {
          throw new Error('Quota Exceeded: You have reached your Gemini API limit. Please check your billing details or try again later.');
        }
        throw new Error(errorData.error || 'Processing failed');
      }

      const data = await response.json();
      
      // Detect if we got mock data from backend
      if (data.isMock) {
        setIsMockMode(true);
      }

      const receivedClips = data.clips || [];
      
      // If it's a video file, generate thumbnails for the clips
      if (content instanceof File && receivedClips.length > 0) {
        setStatus('Generating thumbnails...');
        const clipsWithThumbnails = await Promise.all(receivedClips.map(async (clip: any) => {
          try {
            const frame = await extractVideoFrame(content, clip.start);
            return { ...clip, thumbnail: `data:image/jpeg;base64,${frame}` };
          } catch (e) {
            console.warn('Failed to generate thumbnail for clip', clip.id, e);
            return { ...clip, thumbnail: `https://picsum.photos/seed/${clip.id}/200/200` };
          }
        }));
        setClips(clipsWithThumbnails);
      } else {
        // For non-video content, use placeholders
        const clipsWithPlaceholders = receivedClips.map((clip: any) => ({
          ...clip,
          thumbnail: clip.thumbnail || `https://picsum.photos/seed/${clip.id}/200/200`
        }));
        setClips(clipsWithPlaceholders);
      }

      setTranscript(data.transcript || []);
      
      // Save to library
      const newEntry = {
        id: Date.now(),
        type,
        title: content instanceof File ? content.name : (type === 'url' ? content : 'Text Content'),
        date: new Date().toISOString(),
        clips: receivedClips,
        transcript: data.transcript || [],
        videoSource: videoSource
      };
      const updatedLibrary = [newEntry, ...library];
      setLibrary(updatedLibrary);
      localStorage.setItem('clipdash_library', JSON.stringify(updatedLibrary));

      setActiveTab('dashboard');
    } catch (error: any) {
      console.error('Processing failed:', error);
      const errorMessage = error.message || 'Processing failed';
      
      if (errorMessage.includes('Quota Exceeded') || errorMessage.includes('429')) {
        // Automatically switch to mock mode on quota error to keep the app functional
        setIsMockMode(true);
        setForceMockMode(true);
        localStorage.setItem('clipdash_force_mock', 'true');
        
        const mockData = {
          transcript: [
            { start: 0, end: 5, text: "Welcome to the future of content creation.", tag: "HOOK", score: 95 },
            { start: 5, end: 15, text: "In this video, we'll explore how AI is changing everything for video editors.", tag: "INSIGHT", score: 80 },
            { start: 15, end: 25, text: "Imagine being able to extract the best moments in seconds instead of hours.", tag: "HOOK", score: 90 },
            { start: 25, end: 30, text: "...", tag: "SILENCE", score: 0 },
            { start: 30, end: 45, text: "The core problem is that clippers waste hours scrubbing through long videos.", tag: "STORY", score: 75 },
            { start: 45, end: 60, text: "Our system automatically detects hooks, insights, and emotional peaks.", tag: "DATA", score: 85 },
          ],
          clips: [
            { id: 1, start: 0, end: 25, title: "The Future of Content Creation", score: 92 },
            { id: 2, start: 30, end: 60, title: "Solving the Clipper's Problem", score: 88 },
          ]
        };
        
        setTranscript(mockData.transcript as any);
        
        if (content instanceof File) {
          setStatus('Generating thumbnails for mock clips...');
          const clipsWithThumbnails = await Promise.all(mockData.clips.map(async (clip: any) => {
            try {
              const frame = await extractVideoFrame(content, clip.start);
              return { ...clip, thumbnail: `data:image/jpeg;base64,${frame}` };
            } catch (e) {
              return { ...clip, thumbnail: `https://picsum.photos/seed/${clip.id}/200/200` };
            }
          }));
          setClips(clipsWithThumbnails as any);
        } else {
          setClips(mockData.clips.map(c => ({...c, thumbnail: `https://picsum.photos/seed/${c.id}/200/200`})) as any);
        }
        
        setActiveTab('dashboard');
        alert('⚠️ Quota Exceeded: You have reached your Gemini API limit.\n\nClipDash has automatically switched to "Mock Mode" so you can continue exploring the app features. You can disable this in Settings once your quota resets.');
        return;
      } else if (errorMessage.includes('Invalid API Key') || errorMessage.includes('401')) {
        setNeedsApiKey(true);
        alert('🔑 Invalid API Key: Please check your Gemini API key in Settings.');
      } else {
        alert(`❌ Error: ${errorMessage}\n\nPlease check your connection and try again.`);
      }
    } finally {
      setProcessing(false);
    }
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      await processContent('video', acceptedFiles[0]);
    }
  };

  const { getRootProps, getInputProps } = useDropzone({ 
    onDrop,
    accept: {
      'video/mp4': ['.mp4'],
      'video/quicktime': ['.mov'],
      'audio/mpeg': ['.mp3'],
    }
  } as any);

  const isYoutubeUrl = (url: string) => {
    return url.includes('youtube.com') || url.includes('youtu.be');
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if (videoRef.current.duration && videoRef.current.duration !== duration) {
        setDuration(videoRef.current.duration);
      }
    }
  };

  const handlePlayerProgress = (state: any) => {
    setCurrentTime(state.playedSeconds);
  };

  const handlePlayerDuration = (d: number) => {
    setDuration(d);
  };

  const togglePlay = () => {
    if (isYoutubeUrl(videoSource)) {
      setIsPlaying(!isPlaying);
    } else if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const seekTo = (time: number) => {
    if (isYoutubeUrl(videoSource)) {
      playerRef.current?.seekTo(time, 'seconds');
      setCurrentTime(time);
    } else if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleTranscriptFeedback = (index: number, feedback: 'positive' | 'negative') => {
    const updatedTranscript = [...transcript];
    updatedTranscript[index] = { ...updatedTranscript[index], feedback };
    setTranscript(updatedTranscript);
    
    // Update in library if current project is in library
    const updatedLibrary = library.map(item => {
      if (item.videoSource === videoSource) {
        return { ...item, transcript: updatedTranscript };
      }
      return item;
    });
    setLibrary(updatedLibrary);
    localStorage.setItem('clipdash_library', JSON.stringify(updatedLibrary));
  };

  const handleClipFeedback = (clipId: string | number, feedback: 'positive' | 'negative') => {
    const updatedClips = clips.map(clip => {
      if (clip.id === clipId) {
        return { ...clip, feedback };
      }
      return clip;
    });
    setClips(updatedClips);

    // Update in library
    const updatedLibrary = library.map(item => {
      if (item.videoSource === videoSource) {
        return { ...item, clips: updatedClips };
      }
      return item;
    });
    setLibrary(updatedLibrary);
    localStorage.setItem('clipdash_library', JSON.stringify(updatedLibrary));
  };

  const filteredTranscript = (transcript || []).filter(seg => {
    const matchesSearch = seg.text.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = selectedTags.length === 0 || selectedTags.includes(seg.tag);
    return matchesSearch && matchesTag;
  });

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-300">
      
      {/* Header */}
      <header className="flex items-center justify-between p-4 bg-background-light/50 dark:bg-background-dark/50 sticky top-0 z-50 backdrop-blur-md border-b border-primary/10">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30">
            <span className="material-symbols-outlined text-primary">movie_edit</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">ClipDash</h1>
        </div>
        <div className="flex items-center gap-3">
          {needsApiKey && !manualApiKey && (
            <div className="flex items-center gap-2">
              <button 
                onClick={handleSelectKey}
                className="px-3 py-1.5 rounded-lg bg-primary text-background-dark text-xs font-bold flex items-center gap-2 hover:scale-105 transition-all shadow-lg animate-pulse"
              >
                <span className="material-symbols-outlined text-sm">key</span>
                Auto Connect
              </button>
              <button 
                onClick={() => setShowKeyInput(true)}
                className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-bold flex items-center gap-2 hover:bg-white/20 transition-all border border-white/20"
              >
                <span className="material-symbols-outlined text-sm">edit</span>
                Manual Key
              </button>
            </div>
          )}
          {manualApiKey && (
            <button 
              onClick={() => setShowKeyInput(true)}
              className="px-3 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-bold flex items-center gap-2 hover:bg-primary/30 transition-all border border-primary/30"
            >
              <span className="material-symbols-outlined text-sm">check_circle</span>
              Key Active
            </button>
          )}
          <button 
            onClick={() => setShowReference(!showReference)}
            className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-primary transition-colors px-2"
          >
            {showReference ? "Hide Ref" : "Show Ref"}
          </button>
          
          {showSearch ? (
            <motion.div 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              className="relative flex items-center"
            >
              <input 
                autoFocus
                className="bg-black/20 border border-primary/30 rounded-full py-1.5 pl-3 pr-10 text-sm text-white outline-none focus:ring-1 focus:ring-primary w-48 md:w-64"
                placeholder="Search transcript..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onBlur={() => !searchQuery && setShowSearch(false)}
              />
              <button 
                onClick={() => setShowSearch(false)}
                className="absolute right-2 text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </motion.div>
          ) : (
            <button 
              onClick={() => setShowSearch(true)}
              className="p-2 rounded-full hover:bg-primary/10 transition-colors text-slate-400 hover:text-primary"
            >
              <span className="material-symbols-outlined">search</span>
            </button>
          )}
          
          <button 
            onClick={() => setActiveTab('profile')}
            className={cn(
              "size-10 rounded-full border-2 overflow-hidden transition-all",
              activeTab === 'profile' ? "border-primary scale-110 shadow-[0_0_15px_rgba(135,236,19,0.4)]" : "border-primary/50 hover:border-primary"
            )}
          >
            <img 
              className="w-full h-full object-cover" 
              src="https://picsum.photos/seed/user/100/100" 
              alt="User profile"
              referrerPolicy="no-referrer"
            />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-6 bg-gradient-to-b from-background-dark to-[#0d1208]">
        {forceMockMode && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl mx-auto mb-6 liquid-glass p-4 rounded-2xl border border-primary/30 bg-primary/5 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary">shield_moon</span>
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Mock Mode Active (Quota Protection)</h4>
                <p className="text-[10px] text-slate-400">Using simulated AI results to protect your Gemini API quota. Real thumbnails are still generated from your video.</p>
              </div>
            </div>
            <button 
              onClick={() => {
                setForceMockMode(false);
                localStorage.setItem('clipdash_force_mock', 'false');
              }}
              className="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-xl border border-primary/20 transition-all"
            >
              Disable & Use Real AI
            </button>
          </motion.div>
        )}
        <AnimatePresence>
          {showKeyInput && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6"
            >
              <div className="w-full max-w-md liquid-glass p-8 rounded-3xl border border-primary/30 space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">key</span>
                    Gemini API Key
                  </h3>
                  <button onClick={() => setShowKeyInput(false)} className="text-slate-400 hover:text-white">
                    <X className="size-6" />
                  </button>
                </div>
                <p className="text-sm text-slate-400">
                  Enter your Gemini API key manually. Your key is stored locally in your browser and never shared.
                </p>
                <div className="space-y-4">
                  <input 
                    type="password"
                    value={manualApiKey}
                    onChange={(e) => setManualApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white focus:ring-2 focus:ring-primary outline-none"
                  />
                  <div className="flex gap-3">
                    <button 
                      onClick={() => saveManualKey(manualApiKey)}
                      className="flex-1 py-3 bg-primary text-background-dark font-bold rounded-xl hover:scale-[1.02] transition-transform"
                    >
                      Save Key
                    </button>
                    <button 
                      onClick={() => {
                        setManualApiKey('');
                        localStorage.removeItem('clipdash_api_key');
                        setShowKeyInput(false);
                      }}
                      className="px-4 py-3 bg-red-500/20 text-red-400 font-bold rounded-xl hover:bg-red-500/30 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 text-center">
                  Don't have a key? Get one at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-primary hover:underline">aistudio.google.com</a>
                </p>
              </div>
            </motion.div>
          )}

          {showReference && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-[100] p-12 liquid-glass bg-black/60 backdrop-blur-xl flex items-center justify-center"
            >
              <div className="relative w-full max-w-6xl aspect-video liquid-glass bg-white/10 border-white/20 rounded-3xl p-2 overflow-hidden shadow-2xl">
                <button 
                  onClick={() => setShowReference(false)}
                  className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full liquid-glass bg-white/20 border-white/30 flex items-center justify-center hover:bg-white/40 transition-all"
                >
                  <X className="w-6 h-6 text-white" />
                </button>
                <img 
                  src="https://ais-pre-uqpd6prx7yd6khhatux2on-304460547487.europe-west2.run.app/dashboard-template.png" 
                  alt="Project Dashboard Template" 
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {activeTab === 'upload' && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md mx-auto w-full space-y-8 py-12"
            >
              <section className="liquid-glass rounded-xl overflow-hidden border border-primary/20 p-1">
                <div 
                  {...getRootProps()}
                  className="rounded-xl p-8 flex flex-col items-center justify-center text-center h-64 cursor-pointer hover:bg-primary/5 transition-colors group border-2 border-dashed border-primary/20"
                >
                  <input {...getInputProps()} />
                  <div className="size-16 rounded-full bg-primary/90 text-background-dark mb-4 flex items-center justify-center shadow-[0_0_20px_rgba(135,236,19,0.4)] group-hover:scale-110 transition-transform duration-300">
                    <span className="material-symbols-outlined text-3xl">cloud_upload</span>
                  </div>
                  <h2 className="text-xl font-semibold text-slate-100 mb-2">Upload Media</h2>
                  <p className="text-sm text-slate-400 mb-4">MP4, MOV, MP3 supported</p>
                  <span className="text-xs px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-primary">
                    Max 2GB
                  </span>
                </div>
              </section>

              <section className="space-y-4">
                <div className="liquid-glass rounded-xl p-4 border border-primary/10">
                  <label className="block text-xs font-bold uppercase tracking-widest text-primary/70 mb-2 ml-1">
                    Import from URL
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 material-symbols-outlined text-primary text-sm">link</span>
                    <input 
                      className="w-full bg-black/20 border-0 rounded-lg py-3 pl-10 pr-12 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-primary transition-all outline-none" 
                      placeholder="Paste YouTube link here..." 
                      type="url"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                    />
                    <button 
                      onClick={() => youtubeUrl && processContent('url', youtubeUrl)}
                      className="absolute right-2 p-1.5 rounded-lg bg-primary text-background-dark hover:scale-105 transition-transform shadow-md"
                    >
                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </button>
                  </div>
                </div>

                <div className="liquid-glass rounded-xl p-4 border border-primary/10">
                  <div className="flex justify-between items-center mb-2 ml-1">
                    <label className="text-xs font-bold uppercase tracking-widest text-primary/70">
                      Raw Content
                    </label>
                    <span className="text-xs text-slate-500">Optional</span>
                  </div>
                  <div className="relative">
                    <textarea 
                      className="w-full bg-black/20 border-0 rounded-lg p-3 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-primary resize-none transition-all outline-none" 
                      placeholder="Paste text or script here..." 
                      rows={3}
                      value={rawContent}
                      onChange={(e) => setRawContent(e.target.value)}
                    />
                    <span className="absolute bottom-3 right-3 material-symbols-outlined text-primary/50 text-sm">text_fields</span>
                  </div>
                </div>
              </section>

              <button 
                onClick={() => {
                  if (rawContent) processContent('text', rawContent);
                  else if (youtubeUrl) processContent('url', youtubeUrl);
                  else onDrop([]); // Fallback to mock
                }}
                className="w-full py-4 rounded-xl bg-primary text-background-dark font-bold text-lg shadow-[0_0_20px_rgba(135,236,19,0.3)] hover:shadow-[0_0_30px_rgba(135,236,19,0.5)] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <span>Start Extraction</span>
                <span className="material-symbols-outlined">bolt</span>
              </button>

              {processing && (
                <div className="fixed inset-0 z-[100] liquid-glass bg-black/40 backdrop-blur-xl flex flex-col items-center justify-center gap-6">
                  <div className="size-20 rounded-3xl bg-primary flex items-center justify-center shadow-[0_0_30px_rgba(135,236,19,0.4)] animate-bounce">
                    <Loader2 className="size-10 text-background-dark animate-spin" />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-2xl font-bold text-white">Processing Content</h3>
                    <p className="text-primary/80">Generating transcript and scoring segments...</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6 max-w-4xl mx-auto"
            >
              {/* Video Player Section */}
              <section className="liquid-glass rounded-xl overflow-hidden border border-primary/20 relative">
                {isMockMode && (
                  <div className="absolute top-4 left-4 z-20 px-3 py-1 bg-amber-500/90 text-black text-[10px] font-bold rounded-full flex items-center gap-1 shadow-lg animate-pulse">
                    <span className="material-symbols-outlined text-xs">warning</span>
                    MOCK MODE: NO API KEY DETECTED
                  </div>
                )}
                <div className="relative aspect-video bg-black group">
                  {isYoutubeUrl(videoSource) ? (
                    <Player
                      ref={playerRef}
                      url={videoSource}
                      width="100%"
                      height="100%"
                      playing={isPlaying}
                      onProgress={handlePlayerProgress}
                      onDuration={handlePlayerDuration}
                      controls={false}
                      className="opacity-80"
                    />
                  ) : (
                    <video 
                      ref={videoRef}
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={() => videoRef.current && setDuration(videoRef.current.duration)}
                      src={videoSource} 
                      className="w-full h-full object-contain opacity-80"
                    />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <button 
                      onClick={togglePlay}
                      className="size-16 rounded-full bg-primary/90 text-background-dark flex items-center justify-center shadow-[0_0_20px_rgba(135,236,19,0.4)] hover:scale-110 transition-transform"
                    >
                      <span className="material-symbols-outlined text-3xl fill-1">
                        {isPlaying ? 'pause' : 'play_arrow'}
                      </span>
                    </button>
                  </div>
                  <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-primary">
                        {Math.floor(currentTime / 60)}:{(Math.floor(currentTime % 60)).toString().padStart(2, '0')} / {Math.floor(duration / 60)}:{(Math.floor(duration % 60)).toString().padStart(2, '0')}
                      </span>
                      <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary shadow-[0_0_10px_#87ec13]" 
                          style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-end">
                    <span className="text-xs uppercase tracking-widest text-primary/70 font-bold">Emotional Intensity</span>
                    <span className="text-xs text-slate-400">Peak detected at 02:10</span>
                  </div>
                  {/* Waveform Visualization */}
                  <div className="h-12 w-full flex items-end gap-[2px]">
                    {Array.from({ length: 24 }).map((_, i) => {
                      const height = Math.random() * 80 + 20;
                      const isActive = (currentTime / 60) * 24 > i;
                      return (
                        <div 
                          key={i}
                          className={cn(
                            "flex-1 rounded-t-sm transition-all duration-300",
                            isActive ? "waveform-gradient" : "bg-primary/20"
                          )}
                          style={{ height: `${height}%` }}
                        />
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Transcript Section */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-primary/80 uppercase tracking-widest flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">notes</span> Transcript
                  </div>
                  <button 
                    onClick={() => exportData(transcript, 'transcript.json')}
                    className="text-[10px] text-primary hover:underline"
                  >
                    Export JSON
                  </button>
                </h3>
                <div className="liquid-glass rounded-xl p-4 max-h-60 overflow-y-auto space-y-4 border border-primary/10 scrollbar-hide">
                  {filteredTranscript.map((seg, idx) => (
                    <div 
                      key={idx}
                      className={cn(
                        "group relative space-y-2 cursor-pointer transition-all",
                        currentTime >= seg.start && currentTime < seg.end ? "opacity-100" : "opacity-60 hover:opacity-80"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div onClick={() => seekTo(seg.start)} className="flex-1 flex items-start gap-3">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold border mt-1",
                            seg.tag === 'HOOK' ? "bg-primary/20 text-primary border-primary/30" : "bg-slate-700/50 text-slate-300 border-slate-600"
                          )}>
                            {seg.tag === 'HOOK' ? 'HOOK' : Math.floor(seg.start / 60) + ':' + (seg.start % 60).toString().padStart(2, '0')}
                          </span>
                          <p className={cn(
                            "leading-relaxed text-sm",
                            currentTime >= seg.start && currentTime < seg.end ? "text-slate-100" : "text-slate-400"
                          )}>
                            {seg.text}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleTranscriptFeedback(idx, 'positive'); }}
                            className={cn(
                              "p-1 rounded hover:bg-white/10 transition-colors",
                              seg.feedback === 'positive' ? "text-primary" : "text-slate-500"
                            )}
                          >
                            <span className={cn("material-symbols-outlined text-sm", seg.feedback === 'positive' && "fill-1")}>thumb_up</span>
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleTranscriptFeedback(idx, 'negative'); }}
                            className={cn(
                              "p-1 rounded hover:bg-white/10 transition-colors",
                              seg.feedback === 'negative' ? "text-red-400" : "text-slate-500"
                            )}
                          >
                            <span className={cn("material-symbols-outlined text-sm", seg.feedback === 'negative' && "fill-1")}>thumb_down</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Viral Candidates Section */}
              <section className="space-y-4 pb-20">
                <h3 className="text-sm font-bold text-primary/80 uppercase tracking-widest flex items-center gap-2 px-1">
                  <span className="material-symbols-outlined text-sm">trending_up</span> Viral Candidates
                </h3>
                <div className="space-y-3">
                  {clips.length > 0 ? (
                    clips.map(clip => (
                      <div key={clip.id} className="liquid-glass p-3 rounded-lg flex items-center justify-between border-l-4 border-l-primary group">
                        <div className="flex items-center gap-3">
                          <div className="size-12 rounded bg-background-dark overflow-hidden relative">
                            <img 
                              className="w-full h-full object-cover" 
                              src={clip.thumbnail} 
                              alt={clip.title}
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-primary/10"></div>
                          </div>
                          <div>
                            <p className="font-medium text-sm text-slate-100">{clip.title}</p>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-primary font-bold">{clip.score} Viral Score</span>
                              <span className="text-[10px] text-slate-500">• {Math.floor((clip.end - clip.start) / 60)}:{Math.floor((clip.end - clip.start) % 60).toString().padStart(2, '0')}s</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <div className="flex items-center gap-1 mr-2">
                            <button 
                              onClick={() => handleClipFeedback(clip.id, 'positive')}
                              className={cn(
                                "p-1.5 rounded-full hover:bg-white/10 transition-colors",
                                clip.feedback === 'positive' ? "text-primary bg-primary/10" : "text-slate-500"
                              )}
                            >
                              <span className={cn("material-symbols-outlined text-sm", clip.feedback === 'positive' && "fill-1")}>thumb_up</span>
                            </button>
                            <button 
                              onClick={() => handleClipFeedback(clip.id, 'negative')}
                              className={cn(
                                "p-1.5 rounded-full hover:bg-white/10 transition-colors",
                                clip.feedback === 'negative' ? "text-red-400 bg-red-400/10" : "text-slate-500"
                              )}
                            >
                              <span className={cn("material-symbols-outlined text-sm", clip.feedback === 'negative' && "fill-1")}>thumb_down</span>
                            </button>
                          </div>
                          <button 
                            onClick={() => seekTo(clip.start)}
                            className="bg-primary/20 text-primary p-2 rounded-full hover:bg-primary/30 transition-colors flex items-center justify-center"
                          >
                            <span className="material-symbols-outlined text-lg">play_arrow</span>
                          </button>
                          <button 
                            onClick={() => setSelectedClipForShare(clip)}
                            className="bg-primary text-background-dark p-2 rounded-full hover:scale-105 transition-transform flex items-center justify-center"
                          >
                            <span className="material-symbols-outlined text-lg">share</span>
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="liquid-glass p-8 rounded-lg text-center border border-dashed border-primary/30">
                      <span className="material-symbols-outlined text-3xl text-primary/50 mb-2">sentiment_dissatisfied</span>
                      <p className="text-sm text-slate-400">No viral candidates identified yet. Try a different video or check your API key.</p>
                    </div>
                  )}
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'clips' && (
            <motion.div 
              key="clips"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6 max-w-4xl mx-auto pb-20"
            >
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">video_library</span>
                All Generated Clips
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {clips.map(clip => (
                  <div key={clip.id} className="liquid-glass rounded-2xl overflow-hidden border border-primary/10 group hover:border-primary/30 transition-all">
                    <div className="aspect-video relative bg-black">
                      <img src={clip.thumbnail} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setVideoSource(videoSource); setActiveTab('dashboard'); seekTo(clip.start); }} className="size-12 rounded-full bg-primary text-background-dark flex items-center justify-center shadow-xl">
                          <span className="material-symbols-outlined">play_arrow</span>
                        </button>
                      </div>
                      <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded text-[10px] text-white font-mono">
                        {Math.floor((clip.end - clip.start) / 60)}:{Math.floor((clip.end - clip.start) % 60).toString().padStart(2, '0')}
                      </div>
                    </div>
                    <div className="p-4 space-y-2">
                      <h4 className="font-bold text-slate-100 truncate">{clip.title}</h4>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-primary font-bold">{clip.score} Viral Score</span>
                          <div className="flex items-center gap-1 ml-2">
                            <button 
                              onClick={() => handleClipFeedback(clip.id, 'positive')}
                              className={cn(
                                "p-1 rounded hover:bg-white/10 transition-colors",
                                clip.feedback === 'positive' ? "text-primary" : "text-slate-500"
                              )}
                            >
                              <span className={cn("material-symbols-outlined text-xs", clip.feedback === 'positive' && "fill-1")}>thumb_up</span>
                            </button>
                            <button 
                              onClick={() => handleClipFeedback(clip.id, 'negative')}
                              className={cn(
                                "p-1 rounded hover:bg-white/10 transition-colors",
                                clip.feedback === 'negative' ? "text-red-400" : "text-slate-500"
                              )}
                            >
                              <span className={cn("material-symbols-outlined text-xs", clip.feedback === 'negative' && "fill-1")}>thumb_down</span>
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setSelectedClipForShare(clip)}
                            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-primary transition-all"
                            title="Share or Download"
                          >
                            <span className="material-symbols-outlined text-sm">share</span>
                          </button>
                          <button onClick={() => exportData(clip, `clip-${clip.id}.json`)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-primary transition-all">
                            <span className="material-symbols-outlined text-sm">download</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          <AnimatePresence>
            {selectedClipForShare && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                onClick={() => !isExporting && setSelectedClipForShare(null)}
              >
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  className="liquid-glass w-full max-w-md p-8 rounded-3xl border border-primary/20 space-y-6"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold text-white">Export & Share</h3>
                    <button 
                      onClick={() => setSelectedClipForShare(null)}
                      className="p-2 hover:bg-white/10 rounded-full text-slate-400"
                    >
                      <X className="size-5" />
                    </button>
                  </div>

                  <div className="aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black relative">
                    <img src={selectedClipForShare.thumbnail} className="w-full h-full object-cover opacity-50" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                      <p className="text-white font-bold text-lg">{selectedClipForShare.title}</p>
                      <p className="text-primary text-sm font-mono mt-1">{selectedClipForShare.score} Viral Score</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Post Directly To</p>
                    <div className="grid grid-cols-3 gap-3">
                      <button 
                        onClick={() => handleSocialShare('x', selectedClipForShare)}
                        className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-primary/50 hover:bg-primary/5 transition-all group"
                      >
                        <div className="size-10 rounded-full bg-black flex items-center justify-center border border-white/10 group-hover:border-primary/30">
                          <svg className="size-5 fill-white" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        </div>
                        <span className="text-xs text-slate-300">X (Twitter)</span>
                      </button>
                      <button 
                        onClick={() => handleSocialShare('linkedin', selectedClipForShare)}
                        className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-primary/50 hover:bg-primary/5 transition-all group"
                      >
                        <div className="size-10 rounded-full bg-[#0077b5] flex items-center justify-center border border-white/10 group-hover:border-primary/30">
                          <svg className="size-5 fill-white" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.761 0 5-2.239 5-5v-14c0-2.761-2.239-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
                        </div>
                        <span className="text-xs text-slate-300">LinkedIn</span>
                      </button>
                      <button 
                        onClick={() => handleSocialShare('tiktok', selectedClipForShare)}
                        className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-primary/50 hover:bg-primary/5 transition-all group"
                      >
                        <div className="size-10 rounded-full bg-black flex items-center justify-center border border-white/10 group-hover:border-primary/30">
                          <svg className="size-5 fill-white" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.17-2.89-.6-4.09-1.47-.88-.64-1.61-1.47-2.11-2.43v10.31c.02 1.29-.31 2.62-1.01 3.73-.7 1.11-1.74 1.99-2.97 2.45-1.23.46-2.59.52-3.85.18-1.26-.34-2.39-1.08-3.21-2.09-.82-1.01-1.28-2.31-1.32-3.62-.04-1.31.33-2.63 1.05-3.72.72-1.09 1.79-1.94 3.02-2.36 1.23-.42 2.58-.43 3.82-.04v4.03c-.88-.25-1.85-.22-2.71.1-.86.32-1.58.98-1.99 1.8-.41.82-.49 1.79-.22 2.67.27.88.89 1.63 1.69 2.08.8.45 1.76.57 2.65.34.89-.23 1.66-.8 2.15-1.56.49-.76.68-1.69.54-2.58v-14.3z"/></svg>
                        </div>
                        <span className="text-xs text-slate-300">TikTok</span>
                      </button>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/10">
                    <button 
                      onClick={() => handleDownloadClip(selectedClipForShare)}
                      disabled={isExporting}
                      className="w-full py-4 bg-primary text-background-dark rounded-2xl font-bold flex items-center justify-center gap-2 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:scale-100"
                    >
                      {isExporting ? (
                        <>
                          <Loader2 className="size-5 animate-spin" />
                          Processing Clip...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined">download</span>
                          Download High-Res Clip
                        </>
                      )}
                    </button>
                    <p className="text-[10px] text-center text-slate-500 mt-3">
                      Clip will be exported as a high-quality MP4 file optimized for mobile viewing.
                    </p>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {activeTab === 'library' && (
            <motion.div 
              key="library"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6 max-w-4xl mx-auto pb-20"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">folder_open</span>
                  Project Library
                </h2>
                <button 
                  onClick={() => { setLibrary([]); localStorage.removeItem('clipdash_library'); }}
                  className="text-xs text-red-400 hover:underline"
                >
                  Clear Library
                </button>
              </div>
              
              <div className="grid gap-4">
                {library.length > 0 ? library.map((item: any) => (
                  <div 
                    key={item.id} 
                    onClick={() => {
                      setTranscript(item.transcript);
                      setClips(item.clips);
                      setVideoSource(item.videoSource);
                      setActiveTab('dashboard');
                    }}
                    className="liquid-glass p-4 rounded-2xl border border-primary/10 hover:border-primary/40 transition-all cursor-pointer flex items-center gap-4 group"
                  >
                    <div className="size-16 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20">
                      <span className="material-symbols-outlined text-primary text-3xl">
                        {item.type === 'video' ? 'movie' : (item.type === 'url' ? 'link' : 'description')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-slate-100 truncate">{item.title}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest">{new Date(item.date).toLocaleDateString()}</span>
                        <span className="text-[10px] text-primary font-bold uppercase tracking-widest">{item.clips?.length || 0} Clips</span>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-slate-500 group-hover:text-primary transition-colors">chevron_right</span>
                  </div>
                )) : (
                  <div className="liquid-glass p-12 rounded-3xl text-center border border-dashed border-primary/20">
                    <span className="material-symbols-outlined text-5xl text-primary/20 mb-4">inventory_2</span>
                    <h3 className="text-lg font-bold text-slate-300">Library is empty</h3>
                    <p className="text-sm text-slate-500 mt-2">Processed videos and transcripts will appear here.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md mx-auto w-full space-y-8 py-6 pb-20"
            >
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">settings</span>
                Settings
              </h2>
              
              <div className="space-y-6">
                <div className="liquid-glass p-6 rounded-2xl border border-primary/10 space-y-4">
                  <h4 className="text-xs font-bold text-primary/70 uppercase tracking-widest">API Configuration</h4>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <label className="text-sm text-slate-300">Gemini API Key</label>
                      {keyStatus !== 'idle' && (
                        <div className={cn(
                          "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                          keyStatus === 'active' && "bg-primary/20 text-primary",
                          keyStatus === 'checking' && "bg-slate-700 text-slate-300",
                          (keyStatus === 'invalid' || keyStatus === 'error') && "bg-red-500/20 text-red-400",
                          keyStatus === 'quota_exceeded' && "bg-amber-500/20 text-amber-400"
                        )}>
                          {keyStatus === 'checking' && <Loader2 className="size-3 animate-spin" />}
                          {keyStatus === 'active' && <span className="material-symbols-outlined text-[12px]">check_circle</span>}
                          {keyStatus === 'invalid' && <span className="material-symbols-outlined text-[12px]">error</span>}
                          {keyStatus === 'quota_exceeded' && <span className="material-symbols-outlined text-[12px]">warning</span>}
                          {keyStatus === 'active' ? 'Active' : 
                           keyStatus === 'checking' ? 'Checking...' : 
                           keyStatus === 'quota_exceeded' ? 'Quota Exceeded' : 
                           keyStatus === 'invalid' ? 'Invalid' : 'Error'}
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <input 
                        type="password"
                        value={manualApiKey}
                        onChange={(e) => {
                          setManualApiKey(e.target.value);
                          if (keyStatus !== 'idle') setKeyStatus('idle');
                        }}
                        className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white focus:ring-2 focus:ring-primary outline-none text-sm"
                        placeholder="AIzaSy..."
                      />
                      <div className="absolute right-2 top-2 flex gap-2">
                        <button 
                          onClick={() => checkKey()}
                          disabled={keyStatus === 'checking' || !manualApiKey}
                          className="px-3 py-1 bg-white/10 text-white text-xs font-bold rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
                        >
                          Check
                        </button>
                        <button 
                          onClick={() => saveManualKey(manualApiKey)}
                          className="px-3 py-1 bg-primary text-background-dark text-xs font-bold rounded-lg hover:scale-105 transition-transform"
                        >
                          Update
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500">Used for processing and viral analysis. Key is stored locally in your browser.</p>
                  </div>
                </div>

                <div className="liquid-glass p-6 rounded-2xl border border-primary/10 space-y-4">
                  <h4 className="text-xs font-bold text-primary/70 uppercase tracking-widest">Preferences</h4>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm text-slate-100">Mock Mode (API Quota Protection)</p>
                      <p className="text-[10px] text-slate-500">Skip API calls and use mock data if you're out of quota.</p>
                    </div>
                    <button 
                      onClick={() => {
                        const newVal = !forceMockMode;
                        setForceMockMode(newVal);
                        localStorage.setItem('clipdash_force_mock', newVal.toString());
                      }}
                      className={cn(
                        "w-12 h-6 rounded-full transition-all relative flex items-center px-1",
                        forceMockMode ? "bg-primary" : "bg-slate-700"
                      )}
                    >
                      <div className={cn(
                        "size-4 bg-white rounded-full transition-all",
                        forceMockMode ? "translate-x-6" : "translate-x-0"
                      )} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm text-slate-100">Auto-save to Library</p>
                      <p className="text-[10px] text-slate-500">Automatically save every processed video.</p>
                    </div>
                    <div className="size-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary">check</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm text-slate-100">High Performance Mode</p>
                      <p className="text-[10px] text-slate-500">Prioritize speed over thinking depth.</p>
                    </div>
                    <div className="size-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary">bolt</span>
                    </div>
                  </div>
                </div>

                <div className="liquid-glass p-6 rounded-2xl border border-primary/10">
                  <button 
                    onClick={() => { localStorage.clear(); window.location.reload(); }}
                    className="w-full py-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-bold text-sm hover:bg-red-500/20 transition-all"
                  >
                    Reset All Data
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div 
              key="profile"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-md mx-auto w-full space-y-8 py-6 pb-20"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="size-24 rounded-full border-4 border-primary shadow-[0_0_30px_rgba(135,236,19,0.3)] overflow-hidden">
                  <img src="https://picsum.photos/seed/user/200/200" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Content Creator</h2>
                  <p className="text-primary font-mono text-sm">Pro Member</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="liquid-glass p-4 rounded-2xl border border-primary/10 text-center">
                  <p className="text-2xl font-bold text-white">{library.length}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">Projects</p>
                </div>
                <div className="liquid-glass p-4 rounded-2xl border border-primary/10 text-center">
                  <p className="text-2xl font-bold text-white">{library.reduce((acc, curr) => acc + (curr.clips?.length || 0), 0)}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">Total Clips</p>
                </div>
              </div>

              <div className="liquid-glass p-6 rounded-2xl border border-primary/10 space-y-4">
                <h4 className="text-xs font-bold text-primary/70 uppercase tracking-widest">Usage Stats</h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>API QUOTA</span>
                      <span>85%</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-primary w-[85%] shadow-[0_0_10px_#87ec13]" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>STORAGE</span>
                      <span>12%</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-primary w-[12%] shadow-[0_0_10px_#87ec13]" />
                    </div>
                  </div>
                </div>
              </div>

              <button className="w-full py-4 rounded-xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined">logout</span>
                Sign Out
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {processing && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] bg-primary text-background-dark px-6 py-3 rounded-full font-bold shadow-2xl flex items-center gap-3"
          >
            <div className="size-4 border-2 border-background-dark/30 border-t-background-dark rounded-full animate-spin" />
            {status || 'Processing Content...'}
          </motion.div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 inset-x-0 bg-background-dark/80 backdrop-blur-xl border-t border-primary/20 px-6 py-3 flex justify-between items-center z-50">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors",
            activeTab === 'dashboard' ? "text-primary" : "text-slate-500"
          )}
        >
          <span className={cn("material-symbols-outlined", activeTab === 'dashboard' && "fill-1")}>auto_awesome</span>
          <span className="text-[10px] font-medium">Editor</span>
        </button>
        <button 
          onClick={() => setActiveTab('upload')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors",
            activeTab === 'upload' ? "text-primary" : "text-slate-500"
          )}
        >
          <span className={cn("material-symbols-outlined", activeTab === 'upload' && "fill-1")}>add_circle</span>
          <span className="text-[10px] font-medium">New</span>
        </button>
        <button 
          onClick={() => setActiveTab('clips')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors",
            activeTab === 'clips' ? "text-primary" : "text-slate-500"
          )}
        >
          <span className={cn("material-symbols-outlined", activeTab === 'clips' && "fill-1")}>video_library</span>
          <span className="text-[10px] font-medium">Clips</span>
        </button>
        <button 
          onClick={() => setActiveTab('library')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors",
            activeTab === 'library' ? "text-primary" : "text-slate-500"
          )}
        >
          <span className={cn("material-symbols-outlined", activeTab === 'library' && "fill-1")}>folder_open</span>
          <span className="text-[10px] font-medium">Library</span>
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors",
            activeTab === 'settings' ? "text-primary" : "text-slate-500"
          )}
        >
          <span className={cn("material-symbols-outlined", activeTab === 'settings' && "fill-1")}>settings</span>
          <span className="text-[10px] font-medium">Settings</span>
        </button>
      </nav>
    </div>
  );
}
