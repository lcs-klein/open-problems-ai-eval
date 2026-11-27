import React, { useEffect, useState } from 'react';
import { CheckIcon, CopyIcon } from './Icons';

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export const CopyButton: React.FC<{
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  onCopied?: () => void;
}> = ({
  text,
  label = 'Copy',
  copiedLabel = 'Copied',
  className = 'ed-btn',
  onCopied,
}) => {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      onCopied?.();
    }
  };

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);

  return (
    <button type="button" className={className} onClick={handleClick}>
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
};

export const Toast: React.FC<{
  message: string | null;
  onDismiss: () => void;
}> = ({ message, onDismiss }) => {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onDismiss, 2800);
    return () => window.clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) return null;
  return (
    <div className="ed-toast" role="status" aria-live="polite">
      <CheckIcon size={14} />
      <span>{message}</span>
    </div>
  );
};
