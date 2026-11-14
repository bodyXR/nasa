import type { RouteWeights } from '../../shared/types';

export interface RoutePresetVisual {
  color: string;
  shortLabel: string;
  categoryLabel: string;
  description: string;
}

export const ROUTE_PRESET_VISUALS: Record<RouteWeights['preset'], RoutePresetVisual> = {
  SHORTEST: {
    color: '#5B8BB4',
    shortLabel: 'Shortest',
    categoryLabel: 'SHORTEST',
    description: 'Prioritizes distance.',
  },
  LOWER_TERRAIN_COST: {
    color: '#5E9C76',
    shortLabel: 'Terrain-oriented',
    categoryLabel: 'TERRAIN-ORIENTED',
    description: 'Prioritizes lower modeled terrain cost.',
  },
  SCIENCE_ORIENTED: {
    color: '#D4B483',
    shortLabel: 'Science-oriented',
    categoryLabel: 'SCIENCE-ORIENTED',
    description: 'Prioritizes access to scientific opportunity while considering terrain.',
  },
  PAIR_EVA: {
    color: '#D98A4E',
    shortLabel: 'Safety-oriented candidate',
    categoryLabel: 'SAFETY-ORIENTED CANDIDATE',
    description: 'Conservative ≤12° slope ceiling candidate; decision-support only.',
  },
  ROVER_ASSISTED: {
    color: '#C44D2B',
    shortLabel: 'Rover-assisted',
    categoryLabel: 'ROVER-ASSISTED',
    description: 'Low-roughness corridor for wheeled support.',
  },
};

export function getRouteVisual(preset: string): RoutePresetVisual {
  return (
    ROUTE_PRESET_VISUALS[preset as RouteWeights['preset']] ?? {
      color: '#EAE4D9',
      shortLabel: preset,
      categoryLabel: preset,
      description: 'Modeled terrain route.',
    }
  );
}
