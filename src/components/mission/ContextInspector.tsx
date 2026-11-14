import React from 'react';
import type {
  Dataset,
  EnvironmentContextResponse,
  ObjectiveRule,
  Region,
  RouteAnalysisResponse,
  RoverObservation,
  ScienceTarget,
} from '../../../shared/types';
import {
  usePlanetStore,
  type InspectorContext,
  type PresentationMode,
} from '../../store/planetStore';
import { EvidenceTargetPanel } from '../evidence/EvidenceTargetPanel';
import { RoverObservationsPanel } from '../observations/RoverObservationsPanel';
import { TerrainRoutePanel } from '../routes/TerrainRoutePanel';
import { EnvironmentPanel } from '../environment/EnvironmentPanel';
import { OfflinePackButton } from './PresentationModes';
import { MetadataAccordion, WhyDrawer } from '../ui/InstrumentPrimitives';
import { ArrowRight, ExternalLink, Eye, EyeOff, Globe2, Layers, Navigation, X } from 'lucide-react';

interface ContextInspectorProps {
  region: Region | null;
  datasets: Dataset[];
  objectives: ObjectiveRule[];
  activeObjective: ObjectiveRule | null;
  targets: ScienceTarget[];
  evidenceLoading: boolean;
  observations: RoverObservation[];
  waypoints: Array<{
    sol: number;
    coordinates: [number, number];
    elevationM: number | null;
    tiltDeg: number | null;
    distTotalM: number | null;
  }>;
  obsLoading: boolean;
  environment: EnvironmentContextResponse | null;
  envLoading: boolean;
  selectedOriginId: string;
  onSelectOriginId: (id: string) => void;
  maxSlopeDeg: number;
  onChangeMaxSlopeDeg: (deg: number) => void;
  avoidDunes: boolean;
  onChangeAvoidDunes: (avoid: boolean) => void;
  routeAnalysis: (RouteAnalysisResponse & { runId?: string }) | null;
  analyzingRoute: boolean;
  routeError: string | null;
  onRunAnalysis: () => void;
  onClearAnalysis: () => void;
  onLoadSavedPlan?: (plan: {
    start: [number, number];
    end: [number, number];
    maxSlopeDeg: number;
    avoidDunes: boolean;
  }) => void;
  onPlanWalkToTarget: (target: ScienceTarget) => void;
  onOpenBrief: () => void;
  hideCloseButton?: boolean;
}

const CONTEXT_TABS: Array<{ id: InspectorContext; label: string }> = [
  { id: 'OVERVIEW', label: 'Overview' },
  { id: 'TARGET', label: 'Evidence' },
  { id: 'OBSERVATION', label: 'Rover' },
  { id: 'ROUTE', label: 'Route' },
  { id: 'ENV', label: 'Env' },
];

export const ContextInspector: React.FC<ContextInspectorProps> = ({
  region,
  datasets,
  objectives,
  activeObjective,
  targets,
  evidenceLoading,
  observations,
  waypoints,
  obsLoading,
  environment,
  envLoading,
  selectedOriginId,
  onSelectOriginId,
  maxSlopeDeg,
  onChangeMaxSlopeDeg,
  avoidDunes,
  onChangeAvoidDunes,
  routeAnalysis,
  analyzingRoute,
  routeError,
  onRunAnalysis,
  onClearAnalysis,
  onLoadSavedPlan,
  onPlanWalkToTarget,
  onOpenBrief,
  hideCloseButton = false,
}) => {
  const {
    inspectorContext,
    presentationMode,
    selectedDatasetId,
    activeLayers,
    simpleAdvanced,
    setInspectorContext,
    setPresentationMode,
    setRightRailOpen,
    setLeftRailOpen,
    toggleLayer,
    setEvidenceStory,
    setCamera,
    openEarthAnalog,
    enterRoutePlanningMode,
  } = usePlanetStore();

  const selectedDataset = datasets.find((d) => d.id === selectedDatasetId) ?? null;

  return (
    <div className="h-full flex flex-col bg-[#111317] border-l border-[#242832] overflow-hidden mp-settle-in">
      {/* Top Corridor & Presentation Mode Header */}
      <div className="px-3.5 py-2 border-b border-[#242832] bg-[#0B0D10] flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="text-[10px] font-telemetry tracking-wider text-[#D4B483] truncate">
            {region?.name ?? 'Gale Crater · Lower Mount Sharp'}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="mp-segmented text-[9px] font-telemetry">
            {(['HABITAT', 'TABLET', 'HUD'] as PresentationMode[]).map((pm) => (
              <button
                key={pm}
                type="button"
                onClick={() => setPresentationMode(pm)}
                className={`mp-segmented-btn min-h-[22px] px-1.5 cursor-pointer ${
                  presentationMode === pm
                    ? 'bg-[#171A20] text-[#D4B483]'
                    : 'text-[#736D63] hover:text-[#EAE4D9]'
                }`}
              >
                {pm}
              </button>
            ))}
          </div>

          {!hideCloseButton && (
            <button
              type="button"
              aria-label="Close inspector panel"
              onClick={() => setRightRailOpen(false)}
              className="min-w-[26px] min-h-[26px] flex items-center justify-center text-[#9D968A] hover:text-[#F7F3EB] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tablet Offline Export Banner */}
      {presentationMode === 'TABLET' && (
        <div className="px-3.5 py-2 border-b border-[#242832] bg-[#07080A] flex items-center justify-between gap-2 shrink-0">
          <span className="text-[10px] font-telemetry text-[#9D968A]">
            Field Tablet Snapshot
          </span>
          <OfflinePackButton
            region={region}
            datasets={datasets}
            targets={targets}
            routeAnalysis={routeAnalysis}
          />
        </div>
      )}

      {/* Segmented Context Switcher */}
      <div className="px-2.5 py-2 border-b border-[#242832] bg-[#0B0D10] shrink-0">
        <div className="mp-segmented w-full grid grid-cols-5">
          {CONTEXT_TABS.map((t) => {
            const active =
              inspectorContext === t.id ||
              (inspectorContext === 'DATASET' && t.id === 'OVERVIEW');
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setInspectorContext(t.id)}
                className={`mp-segmented-btn min-h-[28px] px-1 text-[11px] font-medium cursor-pointer ${
                  active
                    ? 'bg-[#171A20] text-[#F7F3EB]'
                    : 'text-[#9D968A] hover:text-[#EAE4D9]'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contextual Body */}
      <div className="flex-1 overflow-y-auto mp-scroll p-3.5 space-y-4">
        {inspectorContext === 'DATASET' && selectedDataset && (
          <div className="space-y-3 mp-settle-in">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-telemetry tracking-wider text-[#D4B483]">
                Dataset inspector
              </span>
              <button
                type="button"
                onClick={() => setInspectorContext('OVERVIEW')}
                className="text-[11px] text-[#9D968A] hover:text-[#EAE4D9] underline cursor-pointer"
              >
                Back to overview
              </button>
            </div>

            <div className="mp-surface-recessed mp-reticle-frame p-3.5 space-y-2.5">
              <div className="text-[11px] font-telemetry text-[#9D968A]">
                {selectedDataset.mission} · {selectedDataset.instrument}
              </div>
              <h2 className="font-editorial text-lg text-[#F7F3EB] leading-snug">
                {selectedDataset.name}
              </h2>
              <p className="text-xs text-[#EAE4D9] leading-relaxed">
                {selectedDataset.whatItShows}
              </p>

              {selectedDataset.visualization.kind !== 'timeseries' && (
                <button
                  type="button"
                  onClick={() => toggleLayer(selectedDataset.id)}
                  className={`min-h-[38px] w-full px-3 text-xs font-medium flex items-center justify-center gap-2 cursor-pointer ${
                    activeLayers.includes(selectedDataset.id)
                      ? 'mp-btn-secondary border-[#D4B483]'
                      : 'mp-btn-primary'
                  }`}
                >
                  {activeLayers.includes(selectedDataset.id) ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Hide layer from Mars</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>Show layer on Mars</span>
                    </>
                  )}
                </button>
              )}

              <WhyDrawer
                question="Why this dataset matters"
                summary={selectedDataset.whyItMatters}
                sourceLabel={selectedDataset.attribution}
                sourceUrl={selectedDataset.sourceUrl}
                defaultOpen
              />

              <MetadataAccordion
                label="Instrument, CRS & limitations"
                defaultOpen={simpleAdvanced === 'ADVANCED'}
              >
                <div className="grid grid-cols-2 gap-1.5 text-[11px] font-telemetry text-[#9D968A]">
                  <div>Resolution: {selectedDataset.resolution}</div>
                  <div>CRS: {selectedDataset.crs}</div>
                  <div className="col-span-2">Coverage: {selectedDataset.temporalCoverage}</div>
                  {selectedDataset.productId && (
                    <div className="col-span-2">Product: {selectedDataset.productId}</div>
                  )}
                </div>
                {selectedDataset.limitations.length > 0 && (
                  <p className="text-xs text-[#D98A4E] pt-1">
                    {selectedDataset.limitations.join(' ')}
                  </p>
                )}
                <a
                  href={selectedDataset.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-telemetry text-[#D4B483] underline pt-1"
                >
                  Open authoritative endpoint <ExternalLink className="w-3 h-3" />
                </a>
              </MetadataAccordion>
            </div>
          </div>
        )}

        {inspectorContext === 'OVERVIEW' && (
          <div className="space-y-4 mp-settle-in">
            <div className="mp-surface-recessed mp-reticle-frame p-3.5 space-y-2">
              <div className="text-[10px] font-telemetry tracking-wider text-[#D4B483]">
                Active study corridor
              </div>
              <h2 className="font-editorial text-lg font-medium text-[#F7F3EB]">
                {region?.name ?? 'Gale Crater & Lower Mount Sharp'}
              </h2>
              <p className="text-xs text-[#CEC8BC] leading-relaxed">
                {region?.scientificContext ??
                  'Layered sulfate and clay-bearing strata along Curiosity’s ascent route into Mount Sharp.'}
              </p>

              <MetadataAccordion
                label="Corridor science objective & coverage"
                defaultOpen={simpleAdvanced === 'ADVANCED'}
              >
                <p className="text-xs text-[#9D968A]">
                  Objective: <span className="text-[#EAE4D9]">{activeObjective?.title}</span> —{' '}
                  {activeObjective?.scientificGoal}
                </p>
                <div className="text-[10px] font-telemetry text-[#736D63]">
                  CRS: {region?.crs ?? 'EPSG:104905'} · {targets.length} ranked candidate sites
                </div>
              </MetadataAccordion>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-medium text-[#9D968A]">Mission workflow</div>

              <button
                type="button"
                onClick={() => {
                  setEvidenceStory(true, 0);
                  setCamera({ lon: 137.3889, lat: -4.775, zoom: 11.8 });
                }}
                className="mp-btn-primary w-full min-h-[42px] px-3.5 py-2 text-xs font-medium flex items-center justify-between gap-2 cursor-pointer"
              >
                <span>01. Follow the evidence (5-stage story)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setLeftRailOpen(true)}
                className="mp-btn-secondary w-full min-h-[40px] px-3.5 py-2 text-xs flex items-center justify-between gap-2 cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-[#D4B483]" />
                  <span>02. Browse {datasets.length} NASA / USGS layers</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-[#736D63]" />
              </button>

              <button
                type="button"
                onClick={() => enterRoutePlanningMode(true)}
                className="mp-btn-secondary w-full min-h-[40px] px-3.5 py-2 text-xs flex items-center justify-between gap-2 cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  <Navigation className="w-3.5 h-3.5 text-[#D98A4E]" />
                  <span>03. Plan a route (Point A → Point B)</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-[#736D63]" />
              </button>

              <button
                type="button"
                onClick={() => openEarthAnalog()}
                className="mp-btn-secondary w-full min-h-[40px] px-3.5 py-2 text-xs flex items-center justify-between gap-2 cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  <Globe2 className="w-3.5 h-3.5 text-[#5B8BB4]" />
                  <span>04. Compare Earth Analog sites (Google Maps)</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-[#736D63]" />
              </button>
            </div>
          </div>
        )}

        {inspectorContext === 'TARGET' && (
          <EvidenceTargetPanel
            objectives={objectives}
            activeObjective={activeObjective}
            targets={targets}
            loading={evidenceLoading}
            onPlanWalkToTarget={onPlanWalkToTarget}
          />
        )}

        {inspectorContext === 'OBSERVATION' && (
          <RoverObservationsPanel
            observations={observations}
            waypoints={waypoints}
            loading={obsLoading}
          />
        )}

        {inspectorContext === 'ROUTE' && (
          <TerrainRoutePanel
            targets={targets}
            selectedOriginId={selectedOriginId}
            onSelectOriginId={onSelectOriginId}
            maxSlopeDeg={maxSlopeDeg}
            onChangeMaxSlopeDeg={onChangeMaxSlopeDeg}
            avoidDunes={avoidDunes}
            onChangeAvoidDunes={onChangeAvoidDunes}
            routeAnalysis={routeAnalysis}
            analyzing={analyzingRoute}
            routeError={routeError}
            onRunAnalysis={onRunAnalysis}
            onClearAnalysis={onClearAnalysis}
            onLoadSavedPlan={onLoadSavedPlan}
            onOpenBrief={onOpenBrief}
          />
        )}

        {inspectorContext === 'ENV' && (
          <EnvironmentPanel environment={environment} loading={envLoading} />
        )}
      </div>
    </div>
  );
};
