'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Bug, Lightbulb, Sparkles, MessageSquare, Paperclip, Loader2, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCredits } from '@/hooks/useCredits';
import { useToast } from '@/contexts/ToastContext';

const FEEDBACK_TYPES = [
  { value: 'bug', label: 'Bug', icon: Bug, emoji: '\u{1F41B}' },
  { value: 'feature', label: 'Feature', icon: Lightbulb, emoji: '\u{1F4A1}' },
  { value: 'improvement', label: 'Improvement', icon: Sparkles, emoji: '\u2728' },
  { value: 'other', label: 'Other', icon: MessageSquare, emoji: '\u{1F4AC}' },
] as const;

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new: { label: 'New', color: 'bg-zinc-600' },
  reviewed: { label: 'Reviewed', color: 'bg-amber-500' },
  planned: { label: 'Planned', color: 'bg-blue-500' },
  in_progress: { label: 'In Progress', color: 'bg-purple-500' },
  done: { label: 'Done', color: 'bg-emerald-500' },
  wont_fix: { label: "Won't Fix", color: 'bg-zinc-500' },
};

interface PreviousFeedback {
  id: string;
  type: string;
  title: string;
  status: string;
  created_at: string;
}

export function FeedbackWidget() {
  const { authenticated, user } = useAuth();
  const { subscription } = useCredits();
  const { showSuccess, showError } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [previousFeedback, setPreviousFeedback] = useState<PreviousFeedback[]>([]);
  const [loadingPrevious, setLoadingPrevious] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch user's previous feedback when drawer opens
  const fetchPreviousFeedback = useCallback(async () => {
    setLoadingPrevious(true);
    try {
      const res = await fetch('/api/feedback');
      if (res.ok) {
        const json = await res.json();
        setPreviousFeedback(json.data || []);
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingPrevious(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchPreviousFeedback();
    }
  }, [isOpen, fetchPreviousFeedback]);

  // Check session dismissal
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDismissed(sessionStorage.getItem('feedback-dismissed') === 'true');
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('feedback-dismissed', 'true');
  };

  const handleOpen = () => {
    setIsOpen(true);
    setSubmitted(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    // Reset form after animation
    setTimeout(() => {
      setSelectedType('');
      setTitle('');
      setDescription('');
      setScreenshot(null);
      setSubmitted(false);
    }, 300);
  };

  const handleSubmit = async () => {
    if (!selectedType || !title.trim() || !description.trim()) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('type', selectedType);
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append('page_url', window.location.href);
      formData.append('user_agent', navigator.userAgent);
      if (subscription?.planId) formData.append('plan_id', subscription.planId);
      if (screenshot) formData.append('screenshot', screenshot);

      const res = await fetch('/api/feedback', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setSubmitted(true);
        showSuccess('Feedback submitted!');
        fetchPreviousFeedback();
      } else {
        const json = await res.json();
        showError(json.error || 'Failed to submit feedback');
      }
    } catch {
      showError('Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showError('Screenshot must be under 5MB');
        return;
      }
      setScreenshot(file);
    }
  };

  if (!authenticated || !user) return null;
  if (dismissed && !isOpen) return null;

  return (
    <>
      {/* Floating Feedback Button */}
      {!isOpen && (
        <button
          onClick={handleOpen}
          className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-full shadow-lg shadow-violet-500/25 transition-all hover:scale-105 active:scale-95"
        >
          <MessageSquare className="w-4 h-4" />
          Feedback
        </button>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 lg:bg-transparent lg:pointer-events-none"
          onClick={handleClose}
        />
      )}

      {/* Slide-out Drawer */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[420px] bg-zinc-950 border-l border-zinc-800 shadow-2xl transform transition-transform duration-300 ease-out overflow-y-auto ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800 px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-zinc-100">Send Feedback</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDismiss}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Hide for session
            </button>
            <button
              onClick={handleClose}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {submitted ? (
            /* Thank You State */
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
                <span className="text-3xl">&#x1F389;</span>
              </div>
              <h3 className="text-xl font-semibold text-zinc-100">Thanks for the feedback!</h3>
              <p className="text-sm text-zinc-400 max-w-xs mx-auto">
                We review every submission and typically respond within 24 hours.
                You can track status below.
              </p>
              <button
                onClick={() => {
                  setSubmitted(false);
                  setSelectedType('');
                  setTitle('');
                  setDescription('');
                  setScreenshot(null);
                }}
                className="mt-4 px-4 py-2 text-sm text-violet-400 hover:text-violet-300 transition-colors"
              >
                Submit another
              </button>
            </div>
          ) : (
            /* Feedback Form */
            <>
              {/* Type Selector */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">What type?</label>
                <div className="grid grid-cols-4 gap-2">
                  {FEEDBACK_TYPES.map((ft) => {
                    const Icon = ft.icon;
                    const isSelected = selectedType === ft.value;
                    return (
                      <button
                        key={ft.value}
                        onClick={() => setSelectedType(ft.value)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center ${
                          isSelected
                            ? 'border-violet-500 bg-violet-500/10 text-violet-400'
                            : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-xs font-medium">{ft.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short summary of your feedback"
                  maxLength={200}
                  className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell us more... What happened? What would you like to see?"
                  rows={4}
                  maxLength={5000}
                  className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors resize-none"
                />
                <p className="mt-1 text-xs text-zinc-600">{description.length}/5000</p>
              </div>

              {/* Screenshot Upload */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Screenshot (optional)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {screenshot ? (
                  <div className="flex items-center gap-2 p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg">
                    <Paperclip className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                    <span className="text-sm text-zinc-300 truncate flex-1">{screenshot.name}</span>
                    <button
                      onClick={() => setScreenshot(null)}
                      className="text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 w-full p-2.5 bg-zinc-900 border border-zinc-800 border-dashed rounded-lg text-sm text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors"
                  >
                    <Paperclip className="w-4 h-4" />
                    Attach screenshot
                  </button>
                )}
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={submitting || !selectedType || !title.trim() || description.trim().length < 10}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-medium rounded-xl transition-colors"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit Feedback
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </>
          )}

          {/* Previous Feedback */}
          <div className="border-t border-zinc-800 pt-5">
            <h3 className="text-sm font-medium text-zinc-400 mb-3">My Previous Feedback</h3>
            {loadingPrevious ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </div>
            ) : previousFeedback.length === 0 ? (
              <p className="text-sm text-zinc-600">No feedback submitted yet.</p>
            ) : (
              <div className="space-y-2">
                {previousFeedback.map((fb) => {
                  const statusInfo = STATUS_CONFIG[fb.status] || STATUS_CONFIG.new;
                  const typeInfo = FEEDBACK_TYPES.find((t) => t.value === fb.type);
                  return (
                    <div
                      key={fb.id}
                      className="flex items-center gap-3 p-2.5 bg-zinc-900/50 rounded-lg"
                    >
                      <span className="text-base flex-shrink-0">{typeInfo?.emoji || '\u{1F4AC}'}</span>
                      <span className="text-sm text-zinc-300 truncate flex-1">{fb.title}</span>
                      <span className={`px-2 py-0.5 text-[10px] font-medium text-white rounded-full ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
