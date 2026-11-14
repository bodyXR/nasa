import React, { useState } from 'react';
import { usePlanetStore } from '../../store/planetStore';
import { useFirebase } from '../auth/FirebaseProvider';
import { Cloud, FileText, Globe2, LogIn, LogOut } from 'lucide-react';

interface TopCommandBarProps {
  onOpenFieldPlan: () => void;
}

export const TopCommandBar: React.FC<TopCommandBarProps> = ({ onOpenFieldPlan }) => {
  const {
    mode,
    inspectorContext,
    setMode,
    setInspectorContext,
    setRightRailOpen,
    setEvidenceStory,
    enterRoutePlanningMode,
  } = usePlanetStore();

  const { user, signingIn, savedRoutes, targetBookmarks, signInWithGoogle, signOut, authError } =
    useFirebase();
  const [accountOpen, setAccountOpen] = useState(false);

  const navItems: Array<{
    id: string;
    label: string;
    active: boolean;
    onClick: () => void;
  }> = [
    {
      id: 'orbit',
      label: 'Orbit',
      active: mode === 'ORBIT',
      onClick: () => setMode('ORBIT'),
    },
    {
      id: 'atlas',
      label: 'Atlas',
      active: mode === 'FIELD' && inspectorContext === 'OVERVIEW',
      onClick: () => {
        setMode('FIELD');
        setInspectorContext('OVERVIEW');
        setRightRailOpen(true);
      },
    },
    {
      id: 'evidence',
      label: 'Evidence',
      active: mode === 'FIELD' && inspectorContext === 'TARGET',
      onClick: () => {
        setMode('FIELD');
        setInspectorContext('TARGET');
        setRightRailOpen(true);
      },
    },
    {
      id: 'traverse',
      label: 'Traverse',
      active: mode === 'FIELD' && inspectorContext === 'ROUTE',
      onClick: () => {
        setMode('FIELD');
        setEvidenceStory(false);
        enterRoutePlanningMode(false);
      },
    },
    {
      id: 'rover',
      label: 'Rover POV',
      active: mode === 'FIELD' && inspectorContext === 'OBSERVATION',
      onClick: () => {
        setMode('FIELD');
        setInspectorContext('OBSERVATION');
        setRightRailOpen(true);
      },
    },
    {
      id: 'earth',
      label: 'Earth Analog',
      active: mode === 'EARTH',
      onClick: () => setMode('EARTH'),
    },
  ];

  return (
    <header className="h-11 shrink-0 bg-[#0B0D10] border-b border-[#242832] px-4 flex items-center justify-between gap-4 md:gap-8 z-30 no-print relative">
      {/* Zone 1: Single-line Brand Wordmark */}
      <button
        type="button"
        onClick={() => setMode('ORBIT')}
        className="font-editorial text-lg font-medium tracking-tight text-[#F7F3EB] whitespace-nowrap shrink-0 cursor-pointer"
      >
        MARS//PATH
      </button>

      {/* Zone 2: Clean Single-line Typographic Workspace Links */}
      <nav aria-label="Workspace navigation" className="hidden md:flex items-center gap-6 overflow-x-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            data-active={item.active}
            onClick={item.onClick}
            className="mp-nav-link cursor-pointer"
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Zone 3: Cloud Mission Sync + Mobile Earth toggle + Primary Action */}
      <div className="flex items-center gap-2 shrink-0 relative">
        <button
          type="button"
          onClick={() => setMode(mode === 'EARTH' ? 'FIELD' : 'EARTH')}
          className={`md:hidden min-h-[32px] px-2.5 py-1.5 text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
            mode === 'EARTH' ? 'mp-btn-primary' : 'mp-btn-secondary'
          }`}
        >
          <Globe2 className="w-3.5 h-3.5 text-[#D4B483]" />
          <span>{mode === 'EARTH' ? 'Mars' : 'Earth'}</span>
        </button>

        {user ? (
          <button
            type="button"
            onClick={() => setAccountOpen((prev) => !prev)}
            aria-expanded={accountOpen}
            title={`Signed in as ${user.displayName || user.email}`}
            className="mp-btn-secondary min-h-[32px] px-2.5 py-1 text-[11px] font-telemetry inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Cloud className="w-3.5 h-3.5 text-[#5E9C76]" />
            <span className="hidden sm:inline max-w-[110px] truncate">
              {user.displayName?.split(' ')[0] || 'Synced'}
            </span>
          </button>
        ) : (
          <button
            type="button"
            disabled={signingIn}
            onClick={() => void signInWithGoogle()}
            title="Sign in with Google to save Marswalk routes & notes"
            className="mp-btn-secondary min-h-[32px] px-2.5 py-1 text-[11px] font-telemetry inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <LogIn className="w-3.5 h-3.5 text-[#D4B483]" />
            <span className="hidden sm:inline">{signingIn ? 'Signing in…' : 'Cloud Sync'}</span>
          </button>
        )}

        <button
          type="button"
          data-tour="field-plan-top"
          onClick={onOpenFieldPlan}
          className="mp-btn-primary min-h-[32px] px-4 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Field Plan</span>
        </button>

        {accountOpen && user && (
          <div className="absolute right-0 top-full mt-1.5 w-64 mp-instrument-panel mp-reticle-frame p-3 space-y-2.5 z-50 mp-settle-in">
            <div className="space-y-0.5">
              <div className="text-[10px] font-telemetry tracking-wider text-[#5E9C76]">
                CLOUD WORKSPACE SYNCED
              </div>
              <div className="text-xs font-medium text-[#F7F3EB] truncate">
                {user.displayName || 'Explorer'}
              </div>
              {user.email && (
                <div className="text-[11px] font-telemetry text-[#9D968A] truncate">
                  {user.email}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[10px] font-telemetry bg-[#0B0D10] border border-[#242832] p-2">
              <div>
                <div className="text-[#736D63]">SAVED ROUTES</div>
                <div className="text-[#F7F3EB] tabular-nums">{savedRoutes.length}</div>
              </div>
              <div>
                <div className="text-[#736D63]">BOOKMARKS</div>
                <div className="text-[#D4B483] tabular-nums">{targetBookmarks.length}</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setAccountOpen(false);
                void signOut();
              }}
              className="mp-btn-secondary w-full min-h-[32px] px-2.5 text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        )}

        {authError && (
          <div className="absolute right-0 top-full mt-1.5 w-72 mp-instrument-panel border-[#C44D2B] p-2.5 text-[11px] text-[#EAE4D9] z-50">
            {authError}
          </div>
        )}
      </div>
    </header>
  );
};
