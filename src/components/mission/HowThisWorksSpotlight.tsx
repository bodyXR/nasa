import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RouteAnalysisResponse } from '../../../shared/types';
import { usePlanetStore } from '../../store/planetStore';
import { useFirebase } from '../auth/FirebaseProvider';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';

interface HowThisWorksSpotlightProps {
  routeAnalysis?: (RouteAnalysisResponse & { runId?: string }) | null;
}

interface TourStepDef {
  id: string;
  badge: string;
  title: string;
  body: string;
  hint?: string;
  selector: string;
  fallbackSelector?: string;
  diagram?: 'EVIDENCE' | 'WORKFLOW';
  interactiveHint?: string;
  actionType?: 'TRY_SEARCH' | 'EXPLORE_DATA' | 'TRY_MAP' | 'ANALYZE';
}

const TOUR_STEPS: TourStepDef[] = [
  {
    id: 'the-world',
    badge: 'PLANETARY WORKSPACE',
    title: 'THIS IS YOUR PLANETARY WORKSPACE',
    body: 'Explore Mars by moving, rotating, and zooming across the surface.',
    hint: 'Gale Crater terrain with 1 m/px DEM elevation and calibrated orbiter mosaics.',
    selector: '[data-tour="mars-canvas"]',
  },
  {
    id: 'search',
    badge: 'DISCOVERY',
    title: 'FIND ANYWHERE ON MARS',
    body: 'Search for regions, missions, observations, datasets, coordinates, or scientific targets.',
    interactiveHint: 'Click TRY IT to test search (or click Next).',
    actionType: 'TRY_SEARCH',
    selector: '[data-tour="search-btn"]',
    fallbackSelector: '[data-tour="mars-canvas"]',
  },
  {
    id: 'data',
    badge: 'DATA LAYERS',
    title: 'LAYERS REVEAL DIFFERENT STORIES',
    body: 'Terrain shows shape. Imagery shows surface detail. Geology shows planetary context. Rover observations show what has actually been studied.',
    interactiveHint: 'Click EXPLORE DATA to browse active layers.',
    actionType: 'EXPLORE_DATA',
    selector: '[data-tour="data-btn"]',
    fallbackSelector: '[data-tour="data-rail"]',
  },
  {
    id: 'select-location',
    badge: 'LOCATION PROBE',
    title: 'CLICK ANYWHERE',
    body: 'Select a location to inspect the available planetary information.',
    interactiveHint: 'Click anywhere on Mars now to probe live 1m DEM elevation.',
    actionType: 'TRY_MAP',
    selector: '[data-tour="mars-canvas"]',
  },
  {
    id: 'understanding-data',
    badge: 'EXPLAINING DATA',
    title: 'THIS PANEL EXPLAINS WHAT YOU ARE SEEING',
    body: 'Every important dataset includes a simple explanation, its source, and deeper technical information.\n\nUse WHY whenever you want to understand the reasoning behind a dataset, target, or route.',
    selector: '[data-tour="right-inspector"]',
    fallbackSelector: '[data-tour="telemetry-deck"]',
  },
  {
    id: 'evidence',
    badge: 'FOLLOW THE EVIDENCE',
    title: 'FOLLOW THE EVIDENCE',
    body: 'Instead of looking at isolated layers, follow how multiple observations lead toward a scientific target.',
    diagram: 'EVIDENCE',
    selector: '[data-tour="story-btn"]',
    fallbackSelector: '[data-tour="right-inspector"]',
  },
  {
    id: 'point-a',
    badge: 'PLAN A MARSWALK',
    title: 'PLAN A MARSWALK',
    body: 'Select where the traverse begins. Click the map to place a clean scientific reticle marker.',
    interactiveHint: 'CLICK TO PLACE POINT A',
    selector: '[data-tour="mars-canvas"]',
    fallbackSelector: '[data-tour="plan-route-spine"]',
  },
  {
    id: 'point-b',
    badge: 'DESTINATION',
    title: 'NOW CHOOSE YOUR DESTINATION',
    body: 'Click a second location to place Point B. The interface immediately connects them with a scientific direct trajectory.',
    interactiveHint: 'CLICK TO PLACE POINT B',
    selector: '[data-tour="mars-canvas"]',
  },
  {
    id: 'analyze',
    badge: 'TERRAIN ANALYSIS',
    title: 'ANALYZE TERRAIN',
    body: 'The direct line shows the relationship between the two points. Terrain analysis can then evaluate candidate traverses between them.',
    interactiveHint: 'Click ANALYZE TERRAIN in the inspector.',
    actionType: 'ANALYZE',
    selector: '[data-tour="analyze-terrain-btn"]',
    fallbackSelector: '[data-tour="right-inspector"]',
  },
  {
    id: 'route-options',
    badge: 'CANDIDATE ROUTES',
    title: 'DIFFERENT ROUTES MAKE DIFFERENT TRADEOFFS',
    body: 'Review candidate traverses calculated across the 1m DEM terrain:\n• SHORTEST: Less distance.\n• TERRAIN-ORIENTED: Lower modeled terrain cost.\n• SCIENCE-ORIENTED: Greater scientific opportunity while considering terrain.',
    selector: '[data-tour="route-candidates"]',
    fallbackSelector: '[data-tour="right-inspector"]',
  },
  {
    id: 'route-profile',
    badge: 'ELEVATION PROFILE',
    title: 'UNDERSTAND THE TERRAIN BEFORE YOU TRAVERSE IT',
    body: 'The profile connects the route on the map with changes in elevation along the path.',
    hint: 'Move cursor across the profile to highlight corresponding coordinates on the Mars canvas.',
    selector: '[data-tour="elevation-tray"]',
    fallbackSelector: '[data-tour="telemetry-deck"]',
  },
  {
    id: 'decision-trail',
    badge: 'MISSION DECISION',
    title: 'EVERY DECISION LEAVES A TRAIL',
    body: 'This keeps the reasoning behind the mission visible from regional context to the final traverse.',
    diagram: 'WORKFLOW',
    selector: '[data-tour="open-brief-btn"]',
    fallbackSelector: '[data-tour="field-plan-top"]',
  },
];

interface RectBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export const HowThisWorksSpotlight: React.FC<HowThisWorksSpotlightProps> = ({ routeAnalysis }) => {
  const {
    mode,
    tourWelcomeOpen,
    tourActive,
    tourStep,
    tourPaused,
    tourCompletionModalOpen,
    pointProbe,
    customRouteStart,
    customRouteEnd,
    rightRailOpen,
    leftRailOpen,
    bottomTrayOpen,
    bottomTrayTab,
    startTour,
    setTourStep,
    pauseTour,
    resumeTour,
    skipTour,
    completeTour,
    closeTourCompletionModal,
    hydrateTourFlags,
    setRightRailOpen,
    setLeftRailOpen,
    setSearchModalOpen,
    setInspectorContext,
    setBottomTrayOpen,
    enterRoutePlanningMode,
  } = usePlanetStore();

  const { user, userProfile, syncPreferences } = useFirebase();

  const [targetRect, setTargetRect] = useState<RectBox | null>(null);

  // Track baselines so interactive steps auto-advance only on fresh user actions
  const entryProbeSigRef = useRef<string | null>(null);
  const entryRouteRunRef = useRef<string | null>(null);

  // Hydrate persisted tour flags from Firestore user profile when signed in
  useEffect(() => {
    if (userProfile) {
      hydrateTourFlags(Boolean(userProfile.tourCompleted), Boolean(userProfile.tourSkipped));
    }
  }, [userProfile, hydrateTourFlags]);

  const handleSkip = useCallback(() => {
    skipTour();
    if (user) {
      void syncPreferences({ tourSkipped: true });
    }
  }, [skipTour, user, syncPreferences]);

  const handleComplete = useCallback(() => {
    completeTour();
    if (user) {
      void syncPreferences({ tourCompleted: true, tourSkipped: false });
    }
  }, [completeTour, user, syncPreferences]);

  // Pause cleanly if user leaves FIELD mode while tour is active
  useEffect(() => {
    if (tourActive && !tourPaused && mode !== 'FIELD') {
      pauseTour();
    }
  }, [tourActive, tourPaused, mode, pauseTour]);

  // Escape key pauses active tour cleanly without forcing exit
  useEffect(() => {
    if (!tourActive || tourPaused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        pauseTour();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tourActive, tourPaused, pauseTour]);

  // Step-entry context preparation & baseline snapshots
  useEffect(() => {
    if (!tourActive || tourPaused || mode !== 'FIELD') return;

    if (tourStep === 3) {
      entryProbeSigRef.current = pointProbe
        ? `${pointProbe.lon.toFixed(5)},${pointProbe.lat.toFixed(5)}`
        : null;
    }

    if (tourStep === 5) {
      setInspectorContext('TARGET');
      if (!rightRailOpen) setRightRailOpen(true);
    }

    if (tourStep === 6) {
      if (!customRouteStart) {
        enterRoutePlanningMode(true);
      } else {
        setInspectorContext('ROUTE');
        if (!rightRailOpen) setRightRailOpen(true);
      }
    }

    if (tourStep === 7) {
      setInspectorContext('ROUTE');
      if (!rightRailOpen) setRightRailOpen(true);
      if (customRouteStart && !customRouteEnd) {
        usePlanetStore.getState().setPickingRoutePoint('B');
      }
    }

    if (tourStep === 8) {
      setInspectorContext('ROUTE');
      if (!rightRailOpen) setRightRailOpen(true);
      entryRouteRunRef.current =
        routeAnalysis?.runId ??
        (routeAnalysis ? `${routeAnalysis.start.join(',')}-${routeAnalysis.end.join(',')}` : null);
    }

    if (tourStep === 9) {
      setInspectorContext('ROUTE');
      if (!rightRailOpen) setRightRailOpen(true);
    }

    if (tourStep === 10) {
      if (!bottomTrayOpen || bottomTrayTab !== 'PROFILE') {
        setBottomTrayOpen(true, 'PROFILE');
      }
    }

    if (tourStep === 11) {
      setInspectorContext('ROUTE');
      if (!rightRailOpen) setRightRailOpen(true);
    }
  }, [
    tourActive,
    tourPaused,
    tourStep,
    mode,
    enterRoutePlanningMode,
    setInspectorContext,
    setRightRailOpen,
    setBottomTrayOpen,
  ]);

  // Smart auto-advance listeners for interactive steps
  useEffect(() => {
    if (!tourActive || tourPaused || mode !== 'FIELD') return;

    if (tourStep === 3 && pointProbe && !pointProbe.loading) {
      const sig = `${pointProbe.lon.toFixed(5)},${pointProbe.lat.toFixed(5)}`;
      if (sig !== entryProbeSigRef.current) {
        const timer = window.setTimeout(() => setTourStep(4), 450);
        return () => window.clearTimeout(timer);
      }
    }

    if (tourStep === 6 && customRouteStart) {
      const timer = window.setTimeout(() => setTourStep(7), 380);
      return () => window.clearTimeout(timer);
    }

    if (tourStep === 7 && customRouteEnd) {
      const timer = window.setTimeout(() => setTourStep(8), 420);
      return () => window.clearTimeout(timer);
    }

    if (tourStep === 8 && routeAnalysis) {
      const curSig =
        routeAnalysis.runId ??
        `${routeAnalysis.start.join(',')}-${routeAnalysis.end.join(',')}`;
      if (curSig !== entryRouteRunRef.current) {
        const timer = window.setTimeout(() => setTourStep(9), 420);
        return () => window.clearTimeout(timer);
      }
    }
  }, [
    tourActive,
    tourPaused,
    tourStep,
    mode,
    pointProbe,
    customRouteStart,
    customRouteEnd,
    routeAnalysis,
    setTourStep,
  ]);

  const currentStep = TOUR_STEPS[tourStep] ?? TOUR_STEPS[0];

  // Dynamically measure the spotlight target element
  const measureTarget = useCallback(() => {
    if (!tourActive || tourPaused || mode !== 'FIELD') {
      setTargetRect(null);
      return;
    }
    const primary = document.querySelector(currentStep.selector) as HTMLElement | null;
    const fallback = currentStep.fallbackSelector
      ? (document.querySelector(currentStep.fallbackSelector) as HTMLElement | null)
      : null;
    const el =
      primary && primary.getBoundingClientRect().width > 0
        ? primary
        : fallback && fallback.getBoundingClientRect().width > 0
          ? fallback
          : null;

    if (!el) {
      setTargetRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setTargetRect({
      top: Math.max(0, r.top),
      left: Math.max(0, r.left),
      width: r.width,
      height: r.height,
    });
  }, [tourActive, tourPaused, mode, currentStep]);

  useEffect(() => {
    measureTarget();
    const id = window.setInterval(measureTarget, 220);
    window.addEventListener('resize', measureTarget);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', measureTarget);
    };
  }, [measureTarget, leftRailOpen, rightRailOpen, bottomTrayOpen, bottomTrayTab]);

  // Compute clamped floating tooltip coordinates relative to spotlight box
  const tooltipStyle = useMemo<React.CSSProperties>(() => {
    if (typeof window === 'undefined' || !targetRect) {
      return {
        bottom: 68,
        left: '50%',
        transform: 'translateX(-50%)',
      };
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardW = Math.min(372, vw - 24);
    const cardH = 260;

    // If spotlight is the full Mars map canvas, anchor cleanly at top-left / bottom-left away from center
    const isLargeCanvas = targetRect.width > vw * 0.45 && targetRect.height > vh * 0.45;
    if (isLargeCanvas) {
      return {
        top: Math.max(66, targetRect.top + 16),
        left: Math.min(vw - cardW - 16, Math.max(16, targetRect.left + 16)),
        width: cardW,
      };
    }

    // Prefer right of left-spine buttons, left of right-inspector buttons, or above bottom elements
    const spaceRight = vw - (targetRect.left + targetRect.width);
    const spaceLeft = targetRect.left;
    const spaceAbove = targetRect.top;
    const spaceBelow = vh - (targetRect.top + targetRect.height);

    let left = Math.max(12, Math.min(vw - cardW - 12, targetRect.left));
    let top = Math.max(56, Math.min(vh - cardH - 16, targetRect.top + targetRect.height + 12));

    if (spaceRight >= cardW + 20 && targetRect.left < vw * 0.35) {
      left = targetRect.left + targetRect.width + 14;
      top = Math.max(58, Math.min(vh - cardH - 16, targetRect.top));
    } else if (spaceLeft >= cardW + 20 && targetRect.left > vw * 0.45) {
      left = targetRect.left - cardW - 14;
      top = Math.max(58, Math.min(vh - cardH - 16, targetRect.top));
    } else if (spaceAbove >= cardH + 20 && spaceBelow < cardH + 16) {
      top = Math.max(56, targetRect.top - cardH - 12);
      left = Math.max(12, Math.min(vw - cardW - 12, targetRect.left + targetRect.width / 2 - cardW / 2));
    } else if (spaceBelow >= cardH + 16) {
      top = targetRect.top + targetRect.height + 12;
      left = Math.max(12, Math.min(vw - cardW - 12, targetRect.left + targetRect.width / 2 - cardW / 2));
    }

    return {
      top,
      left,
      width: cardW,
    };
  }, [targetRect]);

  // 1. Entry Welcome Card (First-time visitor in FIELD mode)
  if (tourWelcomeOpen && mode === 'FIELD' && !tourActive && !tourCompletionModalOpen) {
    return (
      <div
        role="dialog"
        aria-label="Welcome to MARS//PATH"
        className="fixed inset-0 z-50 bg-[#07080A]/65 backdrop-blur-[2px] flex items-center justify-center p-4"
      >
        <div className="w-full max-w-md mp-instrument-panel mp-reticle-frame p-5 space-y-4 mp-settle-in">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] font-telemetry tracking-[0.14em] text-[#D4B483]">
                MARS//PATH · MISSION TRAINING
              </div>
              <h2 className="font-editorial text-2xl font-medium text-[#F7F3EB] mt-1">
                WELCOME TO MARS//PATH
              </h2>
              <div className="text-xs text-[#D4B483] font-telemetry mt-0.5">
                A planetary exploration and Marswalk planning environment.
              </div>
            </div>
            <button
              type="button"
              onClick={handleSkip}
              aria-label="Skip guided tour"
              className="text-[#9D968A] hover:text-[#F7F3EB] p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-[#CEC8BC] leading-relaxed">
            Before you begin, we&apos;ll show you how the system works. Explore real NASA Gale Crater datasets, follow orbital and rover evidence to high-priority targets, and analyze candidate traverses between any Point A and Point B on Mars.
          </p>

          <div className="bg-[#0B0D10] border border-[#242832] px-3 py-2 text-[11px] font-telemetry text-[#9D968A] flex items-center justify-between gap-2">
            <span>12 INTERACTIVE STEPS</span>
            <span className="text-[#D4B483]">~90 SEC · SKIPPABLE ANYTIME</span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleSkip}
              className="mp-btn-secondary min-h-[38px] px-4 text-xs font-telemetry cursor-pointer"
            >
              SKIP TOUR
            </button>
            <button
              type="button"
              onClick={() => startTour(0)}
              className="mp-btn-primary min-h-[38px] px-4 text-xs font-telemetry font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>START TOUR</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Completion Screen
  if (tourCompletionModalOpen) {
    return (
      <div
        role="dialog"
        aria-label="Tour Complete"
        className="fixed inset-0 z-50 bg-[#07080A]/70 backdrop-blur-[2px] flex items-center justify-center p-4"
      >
        <div className="w-full max-w-md mp-instrument-panel mp-reticle-frame p-5 space-y-4 mp-settle-in">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-[#5E9C76]">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-[10px] font-telemetry tracking-[0.12em]">
                MISSION TRAINING COMPLETE
              </span>
            </div>
            <button
              type="button"
              onClick={closeTourCompletionModal}
              aria-label="Close completion dialog"
              className="text-[#9D968A] hover:text-[#F7F3EB] p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <h2 className="font-editorial text-2xl font-medium text-[#F7F3EB]">
              YOU&apos;RE READY TO EXPLORE MARS.
            </h2>
            <p className="text-xs text-[#D4B483] font-telemetry mt-1">
              Start anywhere.
            </p>
          </div>

          <p className="text-xs text-[#CEC8BC] leading-relaxed">
            You now know the full planetary workflow from regional orbital layers to deterministic DEM route analysis and grounded decision briefs.
          </p>

          <div className="bg-[#0B0D10] border border-[#242832] px-3 py-2.5 text-[10px] font-telemetry text-[#D4B483] text-center tracking-wider">
            REGION → OBJECTIVE → EVIDENCE → TARGET → ROUTE
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <button
              type="button"
              onClick={closeTourCompletionModal}
              className="mp-btn-secondary min-h-[38px] px-3 text-xs font-telemetry inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5 text-[#D4B483]" />
              <span>EXPLORE MARS</span>
            </button>
            <button
              type="button"
              onClick={() => {
                closeTourCompletionModal();
                enterRoutePlanningMode(true);
              }}
              className="mp-btn-primary min-h-[38px] px-3 text-xs font-telemetry font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>PLAN A MARSWALK</span>
            </button>
            <button
              type="button"
              onClick={() => startTour(0)}
              className="mp-btn-secondary min-h-[38px] px-3 text-xs font-telemetry inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#9D968A]" />
              <span>REPLAY TOUR</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Paused Floating Pill (non-blocking)
  if (tourActive && tourPaused) {
    return (
      <div
        role="region"
        aria-label="Mission Training Paused"
        className="fixed bottom-16 left-4 z-50 mp-instrument-panel mp-reticle-frame px-3.5 py-2.5 flex items-center gap-3 shadow-xl mp-settle-in"
      >
        <div>
          <div className="text-[10px] font-telemetry tracking-wider text-[#D98A4E]">
            TOUR PAUSED · STEP {tourStep + 1} / {TOUR_STEPS.length}
          </div>
          <div className="text-xs text-[#EAE4D9]">{currentStep.title}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (mode !== 'FIELD') {
              usePlanetStore.getState().setMode('FIELD');
            }
            resumeTour();
          }}
          className="mp-btn-primary min-h-[32px] px-3 text-[11px] font-telemetry inline-flex items-center gap-1 cursor-pointer"
        >
          <Play className="w-3 h-3" />
          <span>CONTINUE TOUR</span>
        </button>
        <button
          type="button"
          onClick={handleSkip}
          className="text-[11px] font-telemetry text-[#9D968A] hover:text-[#F7F3EB] px-1.5 py-1 cursor-pointer"
        >
          EXIT TOUR
        </button>
      </div>
    );
  }

  // 4. Active Interactive 12-Step Spotlight
  if (!tourActive || mode !== 'FIELD') return null;

  const isCanvasTarget =
    targetRect &&
    typeof window !== 'undefined' &&
    targetRect.width > window.innerWidth * 0.45 &&
    targetRect.height > window.innerHeight * 0.45;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none" aria-live="polite">
      {/* Subtle non-blocking spotlight frame around highlighted element */}
      {targetRect && !isCanvasTarget && (
        <>
          <div
            className="fixed left-0 right-0 top-0 bg-[#07080A]/55 pointer-events-none transition-all duration-200"
            style={{ height: Math.max(0, targetRect.top - 4) }}
          />
          <div
            className="fixed left-0 right-0 bottom-0 bg-[#07080A]/55 pointer-events-none transition-all duration-200"
            style={{ top: targetRect.top + targetRect.height + 4 }}
          />
          <div
            className="fixed left-0 bg-[#07080A]/55 pointer-events-none transition-all duration-200"
            style={{
              top: Math.max(0, targetRect.top - 4),
              height: targetRect.height + 8,
              width: Math.max(0, targetRect.left - 4),
            }}
          />
          <div
            className="fixed right-0 bg-[#07080A]/55 pointer-events-none transition-all duration-200"
            style={{
              top: Math.max(0, targetRect.top - 4),
              height: targetRect.height + 8,
              left: targetRect.left + targetRect.width + 4,
            }}
          />
          <div
            className="fixed border-2 border-[#D4B483] rounded-[3px] shadow-[0_0_0_1px_rgba(196,77,43,0.45)] pointer-events-none transition-all duration-200"
            style={{
              top: Math.max(0, targetRect.top - 4),
              left: Math.max(0, targetRect.left - 4),
              width: targetRect.width + 8,
              height: targetRect.height + 8,
            }}
          />
        </>
      )}

      {targetRect && isCanvasTarget && (
        <div
          className="fixed border border-[#D4B483]/85 pointer-events-none transition-all duration-200"
          style={{
            top: targetRect.top + 4,
            left: targetRect.left + 4,
            width: Math.max(0, targetRect.width - 8),
            height: Math.max(0, targetRect.height - 8),
          }}
        />
      )}

      {/* Interactive Tooltip Card */}
      <div
        role="dialog"
        aria-label={`Mission Training Step ${tourStep + 1} of ${TOUR_STEPS.length}`}
        style={tooltipStyle}
        className="fixed pointer-events-auto mp-instrument-panel mp-reticle-frame p-4 shadow-2xl space-y-3 mp-settle-in"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-telemetry tracking-wider text-[#D98A4E]">
            {currentStep.badge} · STEP {tourStep + 1} / {TOUR_STEPS.length}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={pauseTour}
              title="Pause tour (Esc)"
              className="text-[10px] font-telemetry text-[#9D968A] hover:text-[#EAE4D9] px-1.5 py-0.5 border border-[#242832] inline-flex items-center gap-1 cursor-pointer"
            >
              <Pause className="w-2.5 h-2.5" />
              <span>PAUSE</span>
            </button>
            <button
              type="button"
              onClick={handleSkip}
              className="text-[10px] font-telemetry text-[#9D968A] hover:text-[#F7F3EB] px-1.5 py-0.5 cursor-pointer"
            >
              SKIP TOUR
            </button>
          </div>
        </div>

        {/* Dot progress indicator */}
        <div className="flex items-center gap-1" aria-hidden="true">
          {TOUR_STEPS.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setTourStep(idx)}
              className={`h-1.5 flex-1 transition-colors cursor-pointer ${
                idx === tourStep
                  ? 'bg-[#C44D2B]'
                  : idx < tourStep
                    ? 'bg-[#D4B483]'
                    : 'bg-[#242832]'
              }`}
              title={`Jump to ${s.title}`}
            />
          ))}
        </div>

        <div className="space-y-1.5">
          <h3 className="font-editorial text-base font-medium text-[#F7F3EB]">
            {currentStep.title}
          </h3>
          <p className="text-xs text-[#CEC8BC] leading-relaxed">{currentStep.body}</p>
          {currentStep.hint && (
            <p className="text-[11px] text-[#9D968A] leading-snug">{currentStep.hint}</p>
          )}
          {currentStep.interactiveHint && (
            <div className="bg-[#0B0D10] border border-[#D4B483]/40 px-2.5 py-1.5 text-[11px] font-telemetry text-[#D4B483]">
              {currentStep.interactiveHint}
            </div>
          )}

          {currentStep.actionType === 'TRY_SEARCH' && (
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => setSearchModalOpen(true)}
                className="mp-btn-secondary min-h-[30px] px-3 text-xs font-telemetry text-[#D4B483] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
                <span>TRY IT · Open Search (Ctrl+K)</span>
              </button>
            </div>
          )}

          {currentStep.actionType === 'EXPLORE_DATA' && (
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => setLeftRailOpen(true)}
                className="mp-btn-secondary min-h-[30px] px-3 text-xs font-telemetry text-[#D4B483] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
                <span>EXPLORE DATA · Open Layers</span>
              </button>
            </div>
          )}

          {currentStep.diagram === 'EVIDENCE' && (
            <div className="bg-[#0B0D10] border border-[#242832] p-2 text-[10px] font-telemetry text-center flex items-center justify-center gap-2">
              <span className="px-2 py-0.5 bg-[#171A20] text-[#D4B483] border border-[#D4B483]/30">DATA</span>
              <span className="text-[#736D63]">→</span>
              <span className="px-2 py-0.5 bg-[#171A20] text-[#D98A4E] border border-[#D98A4E]/30">EVIDENCE</span>
              <span className="text-[#736D63]">→</span>
              <span className="px-2 py-0.5 bg-[#171A20] text-[#5E9C76] border border-[#5E9C76]/30">TARGET</span>
            </div>
          )}
          {currentStep.diagram === 'WORKFLOW' && (
            <div className="bg-[#0B0D10] border border-[#242832] p-2 text-[9px] font-telemetry text-center flex flex-wrap items-center justify-center gap-1">
              <span className="px-1.5 py-0.5 bg-[#171A20] text-[#9D968A]">REGION</span>
              <span className="text-[#736D63]">→</span>
              <span className="px-1.5 py-0.5 bg-[#171A20] text-[#9D968A]">OBJECTIVE</span>
              <span className="text-[#736D63]">→</span>
              <span className="px-1.5 py-0.5 bg-[#171A20] text-[#D98A4E]">EVIDENCE</span>
              <span className="text-[#736D63]">→</span>
              <span className="px-1.5 py-0.5 bg-[#171A20] text-[#5E9C76]">TARGET</span>
              <span className="text-[#736D63]">→</span>
              <span className="px-1.5 py-0.5 bg-[#171A20] text-[#D4B483] font-medium border border-[#D4B483]/40">ROUTE</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#242832]">
          <button
            type="button"
            onClick={() => setTourStep(Math.max(0, tourStep - 1))}
            disabled={tourStep === 0}
            className="mp-btn-secondary min-h-[32px] px-3 text-xs disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>

          {tourStep + 1 >= TOUR_STEPS.length ? (
            <button
              type="button"
              onClick={handleComplete}
              className="mp-btn-primary min-h-[32px] px-3.5 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Complete Tour</span>
              <CheckCircle2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setTourStep(tourStep + 1)}
              className="mp-btn-primary min-h-[32px] px-3.5 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
