'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'How do I start editing a video?',
    answer: 'Enter your display name on the VA Dashboard (/va), then click "Start Editing" on any video assigned to you. This moves the status from ASSIGNED to EDITING, letting the team know you\'re working on it.',
  },
  {
    question: 'What does each status mean?',
    answer: 'ASSIGNED = waiting for you to start. EDITING = you\'re working on it. SUBMITTED = you submitted for review. REVIEW = admin is reviewing your work. APPROVED = passed review, ready to post. REJECTED = needs revisions (check the revision notes). POSTED = live on TikTok.',
  },
  {
    question: 'How do I submit my edited video?',
    answer: 'When your edit is complete, click "Submit for Review" on the video card. This moves the status to SUBMITTED → REVIEW. The admin will review and either approve or request revisions.',
  },
  {
    question: 'What if my video gets rejected?',
    answer: 'Check the revision notes on the video card — they explain what needs to change. Click "Start Revision" to move it back to EDITING. Make the requested changes and submit again.',
  },
  {
    question: 'What\'s the SLA timer?',
    answer: 'The colored timer on each video shows how long it\'s been in the current status. Green (< 4h) = on track. Amber (< 12h) = approaching deadline. Orange (< 24h) = getting close. Red (24h+) = overdue. Try to keep videos under 24 hours.',
  },
  {
    question: 'Where do I find the script/brief?',
    answer: 'The script and editing brief are attached to each video card. Click the video to expand and see the full hook, scene beats, CTA, and any editing notes (pace, music, text style).',
  },
  {
    question: 'What are the quality requirements?',
    answer: 'Every video should: (1) Hook grabs attention in 1-3 seconds, (2) Text is readable on mobile, (3) Audio is clean, (4) Product is clearly visible, (5) CTA is present, (6) 9:16 vertical format, (7) Under 60 seconds.',
  },
  {
    question: 'Can I work on multiple videos at once?',
    answer: 'Yes! You can have multiple videos in EDITING status. However, we recommend focusing on one at a time for best quality and faster turnaround.',
  },
  {
    question: 'What if I can\'t find my assigned videos?',
    answer: 'Make sure your display name exactly matches what the admin used when assigning you. The name is case-sensitive. If you still can\'t find your videos, contact the admin to verify your assignment.',
  },
  {
    question: 'How are videos assigned to me?',
    answer: 'The admin assigns videos from the Pipeline page. They select your name from the team member list. You\'ll see new assignments appear on your dashboard automatically.',
  },
];

export default function VAHelpPage() {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#09090b',
      padding: '20px',
    }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <Link
            href="/va"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: '#71717a',
              textDecoration: 'none',
              fontSize: '13px',
              marginBottom: '12px',
            }}
          >
            <ArrowLeft size={14} />
            Back to Dashboard
          </Link>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', color: '#fff' }}>VA Help Guide</h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#71717a' }}>
            Everything you need to know about using the FlashFlow VA Dashboard.
          </p>
        </div>

        {/* Workflow Overview */}
        <div style={{
          backgroundColor: '#18181b',
          border: '1px solid #3b82f6',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '24px',
        }}>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#60a5fa' }}>Your Workflow</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { step: '1', label: 'Open /va and enter your display name', color: '#3b82f6' },
              { step: '2', label: 'Find your assigned videos', color: '#f59e0b' },
              { step: '3', label: 'Click "Start Editing" to begin', color: '#a855f7' },
              { step: '4', label: 'Edit the video following the brief', color: '#06b6d4' },
              { step: '5', label: 'Click "Submit for Review" when done', color: '#22c55e' },
              { step: '6', label: 'Fix revisions if rejected, resubmit', color: '#ef4444' },
            ].map((item) => (
              <div
                key={item.step}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  backgroundColor: 'rgba(39,39,42,0.5)',
                  borderRadius: '6px',
                }}
              >
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: item.color,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: 700,
                  flexShrink: 0,
                }}>
                  {item.step}
                </div>
                <span style={{ fontSize: '14px', color: '#d4d4d8' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <h2 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#e4e4e7' }}>Frequently Asked Questions</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {FAQ_ITEMS.map((item, idx) => {
            const isExpanded = expandedIdx === idx;
            return (
              <div
                key={idx}
                style={{
                  backgroundColor: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#e4e4e7',
                    textAlign: 'left',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                >
                  <span style={{ flex: 1 }}>{item.question}</span>
                  {isExpanded ? <ChevronDown size={16} style={{ color: '#71717a' }} /> : <ChevronRight size={16} style={{ color: '#71717a' }} />}
                </button>
                {isExpanded && (
                  <div style={{
                    padding: '0 16px 14px 16px',
                    fontSize: '13px',
                    color: '#a1a1aa',
                    lineHeight: '1.6',
                  }}>
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Contact */}
        <div style={{
          backgroundColor: '#18181b',
          border: '1px solid #27272a',
          borderRadius: '8px',
          padding: '20px',
          marginTop: '24px',
          textAlign: 'center',
        }}>
          <p style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#a1a1aa' }}>
            Still need help? Contact the admin for assistance.
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: '#52525b' }}>
            Your work matters — quality edits drive results!
          </p>
        </div>
      </div>
    </div>
  );
}
