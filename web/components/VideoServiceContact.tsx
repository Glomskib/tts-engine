'use client';

import { useState } from 'react';
import { X, Loader2, CheckCircle } from 'lucide-react';

interface VideoServiceContactProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VideoServiceContact({ isOpen, onClose }: VideoServiceContactProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    videos_per_month: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/video-service/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          source: 'contact_modal',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit');
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
        >
          <X size={20} />
        </button>

        {success ? (
          /* Success state */
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={32} className="text-emerald-500" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Thank you!</h3>
            <p className="text-zinc-400 mb-6">
              We&apos;ve received your inquiry and will be in touch within 24 hours.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-3 rounded-lg bg-white text-zinc-900 font-semibold hover:bg-zinc-100 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="p-6">
            <h3 className="text-xl font-bold text-white mb-2">
              Get Custom Video Production
            </h3>
            <p className="text-zinc-400 text-sm mb-6">
              Our team handles filming, editing, and optimization. Tell us about your needs.
            </p>

            <div className="space-y-4">
              {/* Name & Email */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="you@company.com"
                  />
                </div>
              </div>

              {/* Company & Phone */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Company</label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>

              {/* Videos per month */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  How many videos per month?
                </label>
                <select
                  value={formData.videos_per_month}
                  onChange={(e) => setFormData({ ...formData, videos_per_month: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-white/10 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="">Select volume...</option>
                  <option value="1-5">1-5 videos</option>
                  <option value="5-10">5-10 videos</option>
                  <option value="10-20">10-20 videos</option>
                  <option value="20-50">20-50 videos</option>
                  <option value="50+">50+ videos</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Tell us about your needs
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
                  placeholder="Content types, style preferences, timeline, etc."
                />
              </div>

              {/* Error message */}
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 rounded-xl bg-white text-zinc-900 font-semibold hover:bg-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Get Custom Quote'
                )}
              </button>

              <p className="text-xs text-zinc-500 text-center">
                We&apos;ll respond within 24 hours. No commitment required.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
