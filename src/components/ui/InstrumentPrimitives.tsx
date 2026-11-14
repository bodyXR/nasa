import React, { useState } from 'react';
import { ChevronDown, ChevronRight, HelpCircle, ImageOff, RefreshCw } from 'lucide-react';

interface WhyDrawerProps {
  question?: string;
  summary: string;
  bullets?: string[];
  sourceLabel?: string;
  sourceUrl?: string;
  defaultOpen?: boolean;
}

export const WhyDrawer: React.FC<WhyDrawerProps> = ({
  question = 'Why?',
  summary,
  bullets,
  sourceLabel,
  sourceUrl,
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="pt-2">
      <div className="mp-hairline mb-1.5" />
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 text-left text-xs text-[#D4B483] hover:text-[#F7F3EB] py-1 cursor-pointer transition-colors"
      >
        <span className="inline-flex items-center gap-1.5 font-medium">
          <HelpCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{question}</span>
        </span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="mt-1.5 space-y-1.5 text-xs text-[#CEC8BC] leading-relaxed pl-5 mp-settle-in">
          <p>{summary}</p>
          {bullets && bullets.length > 0 && (
            <ul className="space-y-1 text-[#9D968A]">
              {bullets.map((b, i) => (
                <li key={i} className="leading-snug">• {b}</li>
              ))}
            </ul>
          )}
          {sourceLabel && (
            <div className="pt-1 text-[11px] font-telemetry text-[#736D63]">
              Source:{' '}
              {sourceUrl ? (
                <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-[#D4B483] underline">
                  {sourceLabel}
                </a>
              ) : (
                sourceLabel
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface MetadataAccordionProps {
  label?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export const MetadataAccordion: React.FC<MetadataAccordionProps> = ({
  label = 'Technical metadata',
  defaultOpen = false,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="pt-2">
      <div className="mp-hairline mb-1.5" />
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between text-xs text-[#9D968A] hover:text-[#EAE4D9] py-1 cursor-pointer transition-colors"
      >
        <span>{label}</span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && <div className="mt-2 space-y-2 mp-settle-in">{children}</div>}
    </div>
  );
};

export const MetricDisplay: React.FC<{
  label: string;
  value: string | number;
  unit?: string;
  accent?: 'default' | 'sand' | 'ochre' | 'sage' | 'red';
}> = ({ label, value, unit, accent = 'default' }) => {
  const colorClass =
    accent === 'sand'
      ? 'text-[#D4B483]'
      : accent === 'ochre'
        ? 'text-[#D98A4E]'
        : accent === 'sage'
          ? 'text-[#5E9C76]'
          : accent === 'red'
            ? 'text-[#C44D2B]'
            : 'text-[#F7F3EB]';

  return (
    <div className="mp-surface-recessed p-2.5">
      <div className="text-[10px] font-telemetry tracking-wider text-[#736D63]">{label}</div>
      <div className="mt-1 flex items-baseline">
        <span className={`mp-metric-value text-base ${colorClass}`}>{value}</span>
        {unit && <span className="mp-metric-unit">{unit}</span>}
      </div>
    </div>
  );
};

export const ScienceLoadingState: React.FC<{ title: string; subtitle: string }> = ({
  title,
  subtitle,
}) => (
  <div className="mp-topo-grid border border-[#242832] p-3.5 space-y-1">
    <div className="text-[11px] font-telemetry tracking-wider text-[#D4B483]">{title}</div>
    <p className="text-xs text-[#9D968A]">{subtitle}</p>
  </div>
);

export const CalmEmptyState: React.FC<{
  title: string;
  suggestion: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ title, suggestion, actionLabel, onAction }) => (
  <div className="mp-topo-grid border border-[#242832] p-4 space-y-2">
    <div className="text-xs font-medium text-[#EAE4D9]">{title}</div>
    <p className="text-xs text-[#9D968A] leading-relaxed">{suggestion}</p>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mp-btn-secondary mt-1 px-3 py-1.5 text-xs text-[#D4B483] cursor-pointer"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export const CalmErrorState: React.FC<{
  title?: string;
  message: string;
  technicalDetails?: string;
  onRetry?: () => void;
}> = ({ title = 'Data source unavailable', message, technicalDetails, onRetry }) => {
  const [showTech, setShowTech] = useState(false);

  return (
    <div className="border border-[#9E3B20] bg-[#111317] p-3.5 space-y-2">
      <div className="text-xs font-medium text-[#F7F3EB]">{title}</div>
      <p className="text-xs text-[#CEC8BC]">{message}</p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mp-btn-primary px-3 py-1.5 text-xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        )}
        {technicalDetails && (
          <button
            type="button"
            onClick={() => setShowTech(!showTech)}
            className="text-xs text-[#9D968A] hover:text-[#EAE4D9] underline cursor-pointer"
          >
            {showTech ? 'Hide technical details' : 'Technical details'}
          </button>
        )}
      </div>
      {showTech && technicalDetails && (
        <pre className="text-[10px] font-telemetry bg-[#07080A] border border-[#242832] p-2 text-[#9D968A] overflow-x-auto">
          {technicalDetails}
        </pre>
      )}
    </div>
  );
};

export const VerifiedImage: React.FC<{
  src: string;
  alt: string;
  className?: string;
}> = ({ src, alt, className = 'w-full h-36 object-cover' }) => {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center mp-topo-grid border border-[#242832] text-[#736D63] p-4 ${className}`}
      >
        <ImageOff className="w-5 h-5 mb-1.5" />
        <span className="text-[11px] font-telemetry text-center">Imagery unavailable</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
